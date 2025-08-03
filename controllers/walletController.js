const { transaction } = require('objection');
const knex = require('../db');               // ตัวที่ Model.knex(knex) แล้ว
const Wallet = require('../models/WalletIdentity');
const { appendBlock } = require('../services/blockchain');

// GET /api/wallet/:address/balance
exports.getBalance = async (req, res) => {
  try {
    const wallet = await Wallet.query().findById(req.params.address);
    if (!wallet) return res.status(404).json({ error: 'wallet not found' });

    const { asset } = req.query; // optional
    let balances = await wallet.getBalances(); // [{ assetCode, balanceAvailable, balanceLocked, ... }]

    const normalize = (v) => String(v || '').trim().toUpperCase();

if (asset) {
  const assetSet = new Set(
    String(asset).split(',').map(normalize).filter(Boolean)
  );

  console.log('Filter assets:', [...assetSet]);
  console.log('All balances:', balances.map(b => b.assetCode));

  balances = balances.filter(b => assetSet.has(normalize(b.assetCode)));
}

    res.json({ address: wallet.address, balances });
  } catch (e) {
    console.error('getBalance error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// POST /api/wallet/topup { address, assetCode, amount, type }
exports.topup = async (req, res) => {
  const { address, assetCode, amount, type = 'DEPOSIT' } = req.body || {};
  if (!address || !assetCode || !amount) {
    return res.status(400).json({ error: 'address, assetCode, amount required' });
  }

  try {
    const result = await transaction(knex, async (trx) => {
      // ทำธุรกรรมกระเป๋า
      const r = await Wallet.applyTopup({ address, assetCode, amount, type }, trx);

      // บันทึกบล็อก ใน transaction เดียวกัน
      await appendBlock({
        dataType:    type === 'WITHDRAW' ? 'WITHDRAW' : 'TOPUP',
        fromAddress: type === 'WITHDRAW' ? address : null,
        toAddress:   type === 'WITHDRAW' ? null    : address,
        assetCode,
        amount: String(amount)
      }, trx);

      return r; // { topUpId, balance, ... }
    });

    return res.json({
      topUpId: result.topUpId,
      address, assetCode, type,
      balance: result.balance
    });
  } catch (e) {
    console.error('topup error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// POST /api/wallet/create { label }
exports.create = async (req, res) => {
  try {
    const { label } = req.body || {};

    const result = await transaction(knex, async (trx) => {
      const { wallet, privateKeyPem } = await Wallet.createWithKeypair({ label }, trx); // 👈 ส่ง trx
      await appendBlock({
        dataType: 'WALLET_CREATE',
        fromAddress: null,
        toAddress: wallet.address,
        assetCode: 'USDT',
        amount: '0',
        orderId: null
      }, trx);
      return { wallet, privateKeyPem };
    });

    const { wallet, privateKeyPem } = result;
    res.status(201).json({
      address: wallet.address,
      publicKey: wallet.publicKey,
      label: wallet.label ?? null,
      privateKey: privateKeyPem
    });
  } catch (e) {
    console.error('wallet.create error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
