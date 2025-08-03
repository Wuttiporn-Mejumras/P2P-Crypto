// controllers/chainController.js
const { transaction } = require('objection');
const knex = require('../db');
const LedgerBlock = require('../models/LedgerBlock');
const { computeHash, verifyChain } = require('../services/blockchain'); // ให้ export computeHash ใน service เดิมด้วย

const CHAIN_ID = process.env.CHAIN_ID || 'p2p-mini-v1';
const MAX_BATCH = 500;

// GET /api/chain/head
exports.head = async (req, res) => {
  try {
    const last = await LedgerBlock.query()
      .select('blockIndex', 'hash')
      .orderBy('blockIndex', 'desc')
      .first();

    res.json({
      chainId: CHAIN_ID,
      blockIndex: last?.blockIndex ?? 0,
      hash: last?.hash ?? 'GENESIS'
    });
  } catch (e) {
    console.error('chain.head error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// GET /api/chain/blocks?from=0&limit=200
exports.blocks = async (req, res) => {
  try {
    const from = Number(req.query.from ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 200), MAX_BATCH);
    const rows = await LedgerBlock.query()
      .where('blockIndex', '>', from)
      .orderBy('blockIndex', 'asc')
      .limit(limit);
    res.json(rows);
  } catch (e) {
    console.error('chain.blocks error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// POST /api/chain/ingest
// body: block {} หรือ array ของ blocks
exports.ingest = async (req, res) => {
  const input = Array.isArray(req.body) ? req.body : [req.body];
  if (!input.length) return res.status(400).json({ error: 'empty payload' });

  // ตัดเกิน MAX_BATCH กัน spam
  const batch = input.slice(0, MAX_BATCH);

  let accepted = 0, rejected = 0, reason = null;

  try {
    await transaction(knex, async (trx) => {
      for (const b of batch) {
        // 1) chainId
        if (b.chainId && b.chainId !== CHAIN_ID) { rejected++; reason = 'chainId mismatch'; continue; }

        // 2) ตรวจต่อห่วงกับ tip ปัจจุบัน
        const prev = await LedgerBlock.query(trx).orderBy('blockIndex', 'desc').first();
        const expectPrevHash = prev ? prev.hash : 'GENESIS';
        if (b.prevHash !== expectPrevHash) { rejected++; reason = 'prevHash mismatch'; continue; }

        // 3) คำนวณ hash ซ้ำแบบ deterministic
        const hashCheck = computeHash({
          timestamp: b.timestamp,
          dataType:  b.dataType,
          fromAddress: b.fromAddress ?? null,
          toAddress:   b.toAddress ?? null,
          assetCode:   b.assetCode,
          amount:      String(b.amount),
          orderId:     b.orderId ?? null,
          nonce:       b.nonce ?? 0,
          prevHash:    b.prevHash
        });
        if (hashCheck !== b.hash) { rejected++; reason = 'hash mismatch'; continue; }

        // 4) (ถ้ามี) verify signature ที่นี่ได้ — ข้ามใน MVP

        // 5) แทรกบล็อก (ให้ DB ดูแล blockIndex AUTOINCREMENT หรือใช้ของ peer ถ้าบันทึกมา)
        //    ถ้ามาจาก peer มี blockIndex ติดมาให้เชื่อเลขนั้น? เพื่อความง่ายให้ DB gen เอง
        const insertPayload = {
          timestamp: b.timestamp,
          dataType: b.dataType,
          fromAddress: b.fromAddress ?? null,
          toAddress: b.toAddress ?? null,
          assetCode: b.assetCode,
          amount: String(b.amount),
          orderId: b.orderId ?? null,
          nonce: b.nonce ?? 0,
          prevHash: b.prevHash,
          hash: b.hash,
          signature: b.signature ?? null,
          publicKey: b.publicKey ?? null
        };

        await LedgerBlock.query(trx).insert(insertPayload);
        accepted++;
      }
    });

    res.json({ ok: true, chainId: CHAIN_ID, accepted, rejected, reason });
  } catch (e) {
    console.error('chain.ingest error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// GET /api/chain/verify
exports.verify = async (req, res) => {
  try {
    const result = await verifyChain(); // ภายใน service อ่าน knex ที่ bind แล้ว
    res.json(result);
  } catch (e) {
    console.error('chain.verify error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
