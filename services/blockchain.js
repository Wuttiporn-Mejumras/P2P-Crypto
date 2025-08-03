// services/blockchain.js
const crypto = require('crypto');
const { raw } = require('objection');
const LedgerBlock = require('../models/LedgerBlock');

function computeHash(block) {
  const payload = JSON.stringify({
    timestamp: block.timestamp,
    dataType:  block.dataType,
    from:      block.fromAddress || null,
    to:        block.toAddress   || null,
    asset:     block.assetCode,
    amount:    String(block.amount),
    orderId:   block.orderId || null,
    nonce:     block.nonce,
    prevHash:  block.prevHash
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function getLastBlock(trx) {
  return LedgerBlock.query(trx).orderBy('blockIndex', 'desc').first();
}

async function appendBlock(payload, trx) {
  const prev = await getLastBlock(trx);
  const prevHash = prev ? prev.hash : 'GENESIS';

  // แทรกเพื่อให้ได้ timestamp จาก DB
  const inserted = await LedgerBlock.query(trx).insert({
    timestamp:  raw("datetime('now')"),
    dataType:   payload.dataType,
    fromAddress: payload.fromAddress ?? null,
    toAddress:   payload.toAddress ?? null,
    assetCode:   payload.assetCode,
    amount:      String(payload.amount),
    orderId:     payload.orderId ?? null,
    nonce:       payload.nonce ?? 0,
    prevHash,
    hash:       '' ,
    signature:  payload.signature ?? null,
    publicKey:  payload.publicKey ?? null
  });

  const hash = computeHash({
    timestamp: inserted.timestamp,
    dataType:  inserted.dataType,
    fromAddress: inserted.fromAddress,
    toAddress:   inserted.toAddress,
    assetCode:   inserted.assetCode,
    amount:      inserted.amount,
    orderId:     inserted.orderId,
    nonce:       inserted.nonce,
    prevHash
  });

  await LedgerBlock.query(trx)
    .patch({ hash })
    .where({ blockIndex: inserted.blockIndex });

  return LedgerBlock.query(trx).findById(inserted.blockIndex);
}

async function verifyChain(trx) {
  const blocks = await LedgerBlock.query(trx).orderBy('blockIndex','asc');
  let prevHash = 'GENESIS';
  for (const b of blocks) {
    const h = computeHash({
      timestamp: b.timestamp, dataType: b.dataType,
      fromAddress: b.fromAddress, toAddress: b.toAddress,
      assetCode: b.assetCode, amount: String(b.amount),
      orderId: b.orderId, nonce: b.nonce, prevHash
    });
    if (h !== b.hash) return { ok:false, at:b.blockIndex, reason:'hash mismatch' };
    prevHash = b.hash;
  }
  return { ok:true, length: blocks.length, head: prevHash };
}

module.exports = { appendBlock, computeHash, verifyChain };
