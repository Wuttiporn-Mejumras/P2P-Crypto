const { transaction } = require('objection');
const knex = require('../db');
const Order = require('../models/Order');
const WalletBalance = require('../models/WalletBalance');
const Asset = require('../models/Asset');
const Trade = require('../models/Trade');
const { appendBlock } = require('../services/blockchain');
exports.sell = async (req, res) => {
  const { ownerAddress, baseAsset, quoteAsset, amountBase, price } = req.body || {};
  if (!ownerAddress || !baseAsset || !quoteAsset || !amountBase || !price) {
    return res.status(400).json({ error: 'ownerAddress, baseAsset, quoteAsset, amountBase, price required' });
  }

  try {
    const result = await transaction(knex, async (trx) => {
      // 1) validate assets exist & active
      const [base, quote] = await Promise.all([
        Asset.query(trx).findById(baseAsset),
        Asset.query(trx).findById(quoteAsset)
      ]);
      if (!base || !quote) throw new Error('asset not found');
      if (base.isActive === 0 || quote.isActive === 0) throw new Error('asset inactive');

      // 2) ensure balance row
      await WalletBalance.query(trx)
        .insert({ address: ownerAddress, assetCode: baseAsset })
        .onConflict(['address','assetCode']).ignore();

      // 3) check available >= amountBase
      const bal = await WalletBalance.query(trx).findById([ownerAddress, baseAsset]);
      const available = parseFloat(bal?.balanceAvailable || '0');
      const need = parseFloat(String(amountBase));
      if (available < need) {
        return { error: 'INSUFFICIENT_FUNDS', available: String(available), need: String(need) };
      }

      // 4) move available -> locked
      await WalletBalance.query(trx)
        .patch({
          balanceAvailable: WalletBalance.raw("CAST(balanceAvailable AS REAL) - CAST(? AS REAL)", [need]),
          balanceLocked:    WalletBalance.raw("CAST(balanceLocked    AS REAL) + CAST(? AS REAL)", [need]),
          updatedAt:        WalletBalance.raw("datetime('now')")
        })
        .where({ address: ownerAddress, assetCode: baseAsset });

      // 5) create order
      const orderId = 'O' + Date.now();
      const order = await Order.query(trx).insert({
        orderId,
        ownerAddress,
        side: 'SELL',
        baseAsset,
        quoteAsset,
        amountBase: String(amountBase),
        amountBaseFilled: '0',
        price: String(price),
        status: 'OPEN'
      });

      return { order };
    });

    if (result?.error) return res.status(400).json(result);
    return res.status(201).json(result);
  } catch (err) {
    console.error('SELL order error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.sellFromOrder = async (req, res) => {
  const { orderId } = req.params;
  const { sellerAddress, amountBase } = req.body || {};
  if (!sellerAddress) return res.status(400).json({ error: 'sellerAddress required' });

  try {
    const result = await transaction(knex, async (trx) => {
      const EPS = 1e-9;

      // 1) โหลดออร์เดอร์ BUY ที่เปิดอยู่
      const buy = await Order.query(trx).findById(orderId);
      if (!buy) return { error: 'ORDER_NOT_FOUND' };
      if (buy.side !== 'BUY' || buy.status === 'COMPLETE') return { error: 'ORDER_NOT_OPEN_BUY' };
      if (buy.ownerAddress === sellerAddress) return { error: 'CANNOT_SELL_TO_OWN_ORDER' };

      const filledPrev = parseFloat(buy.amountBaseFilled || '0');
      const totalBase  = parseFloat(buy.amountBase);
      const px         = parseFloat(buy.price);
      if (!(px > 0)) return { error: 'INVALID_PRICE' };

      const remainBuy = Math.max(0, totalBase - filledPrev);
      if (remainBuy <= 0) return { error: 'ORDER_ALREADY_COMPLETE' };

      const reqBaseRaw = (amountBase != null) ? parseFloat(String(amountBase)) : remainBuy;
      if (!(reqBaseRaw > 0)) return { error: 'INVALID_AMOUNT' };
      const fillBase   = Math.min(reqBaseRaw, remainBuy);
      const quoteAmt   = fillBase * px;

      // 2) ensure balance rows
      await WalletBalance.query(trx).insert({ address: sellerAddress, assetCode: buy.baseAsset })
        .onConflict(['address','assetCode']).ignore();
      await WalletBalance.query(trx).insert({ address: sellerAddress, assetCode: buy.quoteAsset })
        .onConflict(['address','assetCode']).ignore();
      await WalletBalance.query(trx).insert({ address: buy.ownerAddress, assetCode: buy.baseAsset })
        .onConflict(['address','assetCode']).ignore();
      await WalletBalance.query(trx).insert({ address: buy.ownerAddress, assetCode: buy.quoteAsset })
        .onConflict(['address','assetCode']).ignore();

      // 3) ตรวจ seller มี base.available พอไหม
      const sellerBase = await WalletBalance.query(trx).findById([sellerAddress, buy.baseAsset]);
      const sellerAvailBase = parseFloat(sellerBase?.balanceAvailable || '0');
      if (sellerAvailBase + EPS < fillBase) {
        return { error: 'INSUFFICIENT_BASE', available: String(sellerAvailBase), need: String(fillBase) };
      }

      // 3.1) ตรวจ buyer (เจ้าของออร์เดอร์ BUY) มี quote.locked พอไหม (เพราะตอนเปิด BUY เรา lock quote ไว้แล้ว)
      const buyerQuote = await WalletBalance.query(trx).findById([buy.ownerAddress, buy.quoteAsset]);
      const buyerLockedQuote = parseFloat(buyerQuote?.balanceLocked || '0');
      if (buyerLockedQuote + EPS < quoteAmt) {
        return { error: 'BUY_LOCKED_NOT_ENOUGH', locked: String(buyerLockedQuote), need: String(quoteAmt) };
      }

      // 4) โยกยอด 2 ขา (ภายใน trx เดียว)
      // 4.1) Seller: base.available -= fillBase
      await WalletBalance.query(trx)
        .patch({
          balanceAvailable: trx.raw("CAST(balanceAvailable AS REAL) - CAST(? AS REAL)", [fillBase]),
          updatedAt:        trx.raw("datetime('now')")
        })
        .where({ address: sellerAddress, assetCode: buy.baseAsset });

      // 4.2) Buyer (owner ของ BUY order): base.available += fillBase
      await WalletBalance.query(trx)
        .patch({
          balanceAvailable: trx.raw("CAST(balanceAvailable AS REAL) + CAST(? AS REAL)", [fillBase]),
          updatedAt:        trx.raw("datetime('now')")
        })
        .where({ address: buy.ownerAddress, assetCode: buy.baseAsset });

      // 4.3) Buyer: quote.locked -= quoteAmt
      await WalletBalance.query(trx)
        .patch({
          balanceLocked: trx.raw("CAST(balanceLocked AS REAL) - CAST(? AS REAL)", [quoteAmt]),
          updatedAt:     trx.raw("datetime('now')")
        })
        .where({ address: buy.ownerAddress, assetCode: buy.quoteAsset });

      // 4.4) Seller: quote.available += quoteAmt
      await WalletBalance.query(trx)
        .patch({
          balanceAvailable: trx.raw("CAST(balanceAvailable AS REAL) + CAST(? AS REAL)", [quoteAmt]),
          updatedAt:        trx.raw("datetime('now')")
        })
        .where({ address: sellerAddress, assetCode: buy.quoteAsset });

      // 5) บันทึก Trade
      const tradeId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
      const trade = await Trade.query(trx).insert({
        tradeId,
        orderId: buy.orderId,
        buyerAddress: buy.ownerAddress,
        sellerAddress,
        baseAsset: buy.baseAsset,
        quoteAsset: buy.quoteAsset,
        amountBaseTraded: String(fillBase),
        price: String(px),
        amountQuotePaid: String(quoteAmt)
      });

      // 6) อัปเดตสถานะ BUY (OPEN -> COMPLETE เมื่อเต็ม)
      let newFilled = filledPrev + fillBase;
      const done = (newFilled + EPS) >= totalBase;
      if (done) newFilled = totalBase;
      const newStatus = done ? 'COMPLETE' : 'OPEN';

      await Order.query(trx)
        .patch({ amountBaseFilled: String(newFilled), status: newStatus, updatedAt: knex.fn.now() })
        .where({ orderId: buy.orderId });

      // 7) ลงบล็อกทุกครั้ง (2 legs)
      await appendBlock({
        dataType: 'TRADE_BASE_TRANSFER',
        tradeId,
        fromAddress: sellerAddress,
        toAddress:   buy.ownerAddress,
        assetCode:   buy.baseAsset,
        amount:      String(fillBase),
        orderId:     buy.orderId
      }, trx);

      await appendBlock({
        dataType: 'TRADE_QUOTE_TRANSFER',
        tradeId,
        fromAddress: buy.ownerAddress,
        toAddress:   sellerAddress,
        assetCode:   buy.quoteAsset,
        amount:      String(quoteAmt),
        orderId:     buy.orderId
      }, trx);

      // 8) ถ้าออร์เดอร์ BUY ขายเข้าได้ครบ ค่อยลงบล็อกสรุป (optional)
      if (newStatus === 'COMPLETE') {
        await appendBlock({
          dataType: 'ORDER_COMPLETE',
          fromAddress: null,
          toAddress:   null,
          assetCode:   buy.baseAsset,
          amount:      '0',
          orderId:     buy.orderId
        }, trx);
      }

      const updatedOrder = await Order.query(trx).findById(buy.orderId);
      const sellCompleted = Math.abs(fillBase - reqBaseRaw) <= EPS;

      return {
        order: updatedOrder, // สถานะของออร์เดอร์ BUY (OPEN/COMPLETE)
        trade,
        sellSummary: {
          sellCompleted,               // true = ขายครบตามที่ร้องขอครั้งนี้
          soldBase: String(fillBase),
          requestedBase: String(reqBaseRaw),
          price: String(px),
          receivedQuote: String(quoteAmt)
        }
      };
    });

    if (result?.error) return res.status(400).json(result);
    return res.status(201).json(result);
  } catch (e) {
    console.error('sellFromOrder error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.buyFromOrder = async (req, res) => {
  const { orderId } = req.params;
  const { buyerAddress, amountBase } = req.body || {};
  if (!buyerAddress) return res.status(400).json({ error: 'buyerAddress required' });

  try {
    const result = await transaction(knex, async (trx) => {
      const EPS = 1e-9;

      // 1) โหลดออร์เดอร์ขาย
      const sell = await Order.query(trx).findById(orderId);
      if (!sell) return { error: 'ORDER_NOT_FOUND' };
      if (sell.side !== 'SELL' || sell.status === 'COMPLETE') return { error: 'ORDER_NOT_OPEN_SELL' };
      if (sell.ownerAddress === buyerAddress) return { error: 'CANNOT_BUY_OWN_ORDER' };

      const filledPrev = parseFloat(sell.amountBaseFilled || '0');
      const totalBase  = parseFloat(sell.amountBase);
      const remainSell = Math.max(0, totalBase - filledPrev);
      if (remainSell <= 0) return { error: 'ORDER_ALREADY_COMPLETE' };

      const reqBaseRaw = (amountBase != null) ? parseFloat(String(amountBase)) : remainSell;
      if (!(reqBaseRaw > 0)) return { error: 'INVALID_AMOUNT' };
      const fillBase = Math.min(reqBaseRaw, remainSell);

      const price = parseFloat(sell.price);
      if (!(price > 0)) return { error: 'INVALID_PRICE' };

      const cost  = fillBase * price;

      // 2) ensure balance rows
      await WalletBalance.query(trx).insert({ address: buyerAddress,     assetCode: sell.baseAsset  })
        .onConflict(['address','assetCode']).ignore();
      await WalletBalance.query(trx).insert({ address: buyerAddress,     assetCode: sell.quoteAsset })
        .onConflict(['address','assetCode']).ignore();
      await WalletBalance.query(trx).insert({ address: sell.ownerAddress, assetCode: sell.baseAsset  })
        .onConflict(['address','assetCode']).ignore();
      await WalletBalance.query(trx).insert({ address: sell.ownerAddress, assetCode: sell.quoteAsset })
        .onConflict(['address','assetCode']).ignore();

      // 3) ตรวจเงินผู้ซื้อ (available)
      const buyerQuote = await WalletBalance.query(trx).findById([buyerAddress, sell.quoteAsset]);
      const buyerAvailQuote = parseFloat(buyerQuote?.balanceAvailable || '0');
      if (buyerAvailQuote + EPS < cost) {
        return { error: 'INSUFFICIENT_FUNDS', available: String(buyerAvailQuote), need: String(cost) };
      }

      // 3.1) ตรวจ base.locked ของผู้ขาย (กันกรณีถูก match จากที่อื่น)
      const sellerBaseBal = await WalletBalance.query(trx).findById([sell.ownerAddress, sell.baseAsset]);
      const sellerLockedBase = parseFloat(sellerBaseBal?.balanceLocked || '0');
      if (sellerLockedBase + EPS < fillBase) {
        return { error: 'SELL_LOCKED_NOT_ENOUGH', locked: String(sellerLockedBase), need: String(fillBase) };
      }

      // 4) โยกยอด (settlement ทันที)
      // buyer: quote.available -= cost
      await WalletBalance.query(trx)
        .patch({
          balanceAvailable: trx.raw("CAST(balanceAvailable AS REAL) - CAST(? AS REAL)", [cost]),
          updatedAt:        trx.raw("datetime('now')")
        })
        .where({ address: buyerAddress, assetCode: sell.quoteAsset });

      // buyer: base.available += fillBase
      await WalletBalance.query(trx)
        .patch({
          balanceAvailable: trx.raw("CAST(balanceAvailable AS REAL) + CAST(? AS REAL)", [fillBase]),
          updatedAt:        trx.raw("datetime('now')")
        })
        .where({ address: buyerAddress, assetCode: sell.baseAsset });

      // seller: base.locked -= fillBase
      await WalletBalance.query(trx)
        .patch({
          balanceLocked: trx.raw("CAST(balanceLocked AS REAL) - CAST(? AS REAL)", [fillBase]),
          updatedAt:     trx.raw("datetime('now')")
        })
        .where({ address: sell.ownerAddress, assetCode: sell.baseAsset });

      // seller: quote.available += cost
      await WalletBalance.query(trx)
        .patch({
          balanceAvailable: trx.raw("CAST(balanceAvailable AS REAL) + CAST(? AS REAL)", [cost]),
          updatedAt:        trx.raw("datetime('now')")
        })
        .where({ address: sell.ownerAddress, assetCode: sell.quoteAsset });

      // 5) บันทึก Trade
      const tradeId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
      const trade = await Trade.query(trx).insert({
        tradeId,
        orderId: sell.orderId,
        buyerAddress,
        sellerAddress: sell.ownerAddress,
        baseAsset: sell.baseAsset,
        quoteAsset: sell.quoteAsset,
        amountBaseTraded: String(fillBase),
        price: String(price),
        amountQuotePaid: String(cost)
      });

      // 6) อัปเดตสถานะออร์เดอร์ขาย (OPEN -> COMPLETE เมื่อขายหมด)
      let newFilled = filledPrev + fillBase;
      const done = (newFilled + EPS) >= totalBase;
      if (done) newFilled = totalBase; // clamp
      const newStatus = done ? 'COMPLETE' : 'OPEN';

      await Order.query(trx)
        .patch({ amountBaseFilled: String(newFilled), status: newStatus, updatedAt: knex.fn.now() })
        .where({ orderId: sell.orderId });

      // 7) ลงบล็อก "ทุกครั้งที่มีการซื้อขาย" (2 ขาเสมอ)
      await appendBlock({
        dataType: 'TRADE_BASE_TRANSFER',
        tradeId,
        fromAddress: sell.ownerAddress,
        toAddress:   buyerAddress,
        assetCode:   sell.baseAsset,
        amount:      String(fillBase),
        orderId:     sell.orderId
      }, trx);

      await appendBlock({
        dataType: 'TRADE_QUOTE_TRANSFER',
        tradeId,
        fromAddress: buyerAddress,
        toAddress:   sell.ownerAddress,
        assetCode:   sell.quoteAsset,
        amount:      String(cost),
        orderId:     sell.orderId
      }, trx);

      // 8) ถ้าออร์เดอร์ขาย "ขายหมด" ค่อยลงบล็อกสรุป (optional แต่แนะนำ)
      if (newStatus === 'COMPLETE') {
        await appendBlock({
          dataType: 'ORDER_COMPLETE',
          fromAddress: null,
          toAddress:   null,
          assetCode:   sell.baseAsset, // หรือ 'SYS' ตามดีไซน์
          amount:      '0',
          orderId:     sell.orderId
        }, trx);
      }

      // 9) ส่งผลลัพธ์: สถานะ SELL + สรุปฝั่งผู้ซื้อครั้งนี้
      const updatedOrder = await Order.query(trx).findById(sell.orderId);
      const buyCompleted = Math.abs(fillBase - reqBaseRaw) <= EPS;
      return {
        order: updatedOrder, // สถานะออร์เดอร์ขาย (OPEN/COMPLETE)
        trade,
        buySummary: {
          buyCompleted,                 // true = ได้ครบตามที่ผู้ซื้อขอในคำขอนี้
          buyFilledBase: String(fillBase),
          requestedBase: String(reqBaseRaw),
          price: String(price),
          cost: String(cost)
        }
      };
    });

    if (result?.error) return res.status(400).json(result);
    return res.status(201).json(result);
  } catch (e) {
    console.error('buyFromOrder error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.buyOpen = async (req, res) => {
  const { ownerAddress, baseAsset, quoteAsset, amountBase, price } = req.body || {};
  if (!ownerAddress || !baseAsset || !quoteAsset || !amountBase || !price) {
    return res.status(400).json({ error: 'ownerAddress, baseAsset, quoteAsset, amountBase, price required' });
  }

  try {
    const result = await transaction(knex, async (trx) => {
      // 1) validate assets
      const [base, quote] = await Promise.all([
        Asset.query(trx).findById(baseAsset),
        Asset.query(trx).findById(quoteAsset),
      ]);
      if (!base || !quote) return { error: 'ASSET_NOT_FOUND' };
      if (base.isActive === 0 || quote.isActive === 0) return { error: 'ASSET_INACTIVE' };

      const needBase = parseFloat(String(amountBase));
      const px       = parseFloat(String(price));
      if (!(needBase > 0) || !(px > 0)) return { error: 'INVALID_AMOUNT_OR_PRICE' };

      const needQuote = needBase * px;

      // 2) ensure balance rows
      await WalletBalance.query(trx).insert({ address: ownerAddress, assetCode: baseAsset })
        .onConflict(['address','assetCode']).ignore();
      await WalletBalance.query(trx).insert({ address: ownerAddress, assetCode: quoteAsset })
        .onConflict(['address','assetCode']).ignore();

      // 3) check + lock quote
      const qb = await WalletBalance.query(trx).findById([ownerAddress, quoteAsset]);
      const qAvail = parseFloat(qb?.balanceAvailable || '0');
      if (qAvail < needQuote) {
        return { error: 'INSUFFICIENT_FUNDS', available: String(qAvail), need: String(needQuote) };
      }
      await WalletBalance.query(trx)
        .patch({
          balanceAvailable: WalletBalance.raw("CAST(balanceAvailable AS REAL) - CAST(? AS REAL)", [needQuote]),
          balanceLocked:    WalletBalance.raw("CAST(balanceLocked    AS REAL) + CAST(? AS REAL)", [needQuote]),
          updatedAt:        WalletBalance.raw("datetime('now')")
        })
        .where({ address: ownerAddress, assetCode: quoteAsset });

      // 4) create order
      const orderId = 'O' + Date.now();
      const order = await Order.query(trx).insert({
        orderId,
        ownerAddress,
        side: 'BUY',
        baseAsset,
        quoteAsset,
        amountBase: String(needBase),
        amountBaseFilled: '0',
        price: String(px),
        status: 'OPEN'
      });
      return { order };
    });

    if (result?.error) return res.status(400).json(result);
    return res.status(201).json(result);
  } catch (e) {
    console.error('buyOpen error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.listBuyOpen = async (req, res) => {
  try {
    const { base, baseAsset, quote, quoteAsset, owner, minPrice, maxPrice, limit = 50, offset = 0 } = req.query;
    const baseCode  = baseAsset || base;
    const quoteCode = quoteAsset || quote;

    const q = Order.query()
      .where({ side: 'BUY', status: 'OPEN' })
      .orderBy('price', 'desc')
      .orderBy('createdAt', 'asc')
      .limit(Math.min(Number(limit), 200))
      .offset(Number(offset));

    if (baseCode)  q.where('baseAsset', baseCode);
    if (quoteCode) q.where('quoteAsset', quoteCode);
    if (owner)     q.where('ownerAddress', owner);
    if (minPrice)  q.where('price', '>=', String(minPrice));
    if (maxPrice)  q.where('price', '<=', String(maxPrice));

    const rows = await q;
    res.json(rows);
  } catch (e) {
    console.error('listBuyOpen error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


exports.listSellOpen = async (req, res) => {
  try {
    const { base, baseAsset, quote, quoteAsset, owner, minPrice, maxPrice, limit = 50, offset = 0 } = req.query;
    const baseCode  = baseAsset || base;
    const quoteCode = quoteAsset || quote;

    const q = Order.query()
      .where({ side: 'SELL', status: 'OPEN' })
      .orderBy('price', 'asc')
      .orderBy('createdAt', 'asc')
      .limit(Math.min(Number(limit), 200))
      .offset(Number(offset));

    if (baseCode)  q.where('baseAsset', baseCode);
    if (quoteCode) q.where('quoteAsset', quoteCode);
    if (owner)     q.where('ownerAddress', owner);
    if (minPrice)  q.where('price', '>=', String(minPrice));
    if (maxPrice)  q.where('price', '<=', String(maxPrice));

    const rows = await q;
    res.json(rows);
  } catch (e) {
    console.error('listSellOpen error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


exports.cancelOrder = async (req, res) => {
  const { orderId } = req.params;

  try {
    const result = await transaction(knex, async (trx) => {
      const EPS = 1e-9;

      const order = await Order.query(trx).findById(orderId);
      if (!order) return { error: 'ORDER_NOT_FOUND' };

      // ยกเลิกได้เฉพาะ OPEN
      if (order.status !== 'OPEN') {
        return { error: 'ORDER_NOT_CANCELLABLE', status: order.status };
      }

      const filled = parseFloat(order.amountBaseFilled || '0');
      const total  = parseFloat(order.amountBase);
      let remainBase = total - filled;
      if (remainBase < 0) remainBase = 0;
      // สำหรับ BUY จะต้องคืนเป็น quote ตามราคา order
      const price = parseFloat(order.price);
      const remainQuote = remainBase * (isFinite(price) ? price : 0);

      if (order.side === 'SELL') {
        // คืน base ที่ locked -> available
        if (remainBase > EPS) {
          await WalletBalance.query(trx)
            .patch({
              balanceLocked:    trx.raw("CAST(balanceLocked    AS REAL) - CAST(? AS REAL)", [remainBase]),
              balanceAvailable: trx.raw("CAST(balanceAvailable AS REAL) + CAST(? AS REAL)", [remainBase]),
              updatedAt:        trx.raw("datetime('now')")
            })
            .where({ address: order.ownerAddress, assetCode: order.baseAsset });
        }
      } else if (order.side === 'BUY') {
        // คืน quote ที่ locked -> available
        if (remainQuote > EPS) {
          await WalletBalance.query(trx)
            .patch({
              balanceLocked:    trx.raw("CAST(balanceLocked    AS REAL) - CAST(? AS REAL)", [remainQuote]),
              balanceAvailable: trx.raw("CAST(balanceAvailable AS REAL) + CAST(? AS REAL)", [remainQuote]),
              updatedAt:        trx.raw("datetime('now')")
            })
            .where({ address: order.ownerAddress, assetCode: order.quoteAsset });
        }
      }

      // อัปเดตสถานะออร์เดอร์เป็น CANCELLED
      await Order.query(trx)
        .patch({ status: 'CANCELLED', updatedAt: knex.fn.now() })
        .where({ orderId });

      return { orderId, status: 'CANCELLED' };
    });

    if (result?.error) return res.status(400).json(result);
    return res.status(200).json(result);
  } catch (e) {
    console.error('cancelOrder error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

