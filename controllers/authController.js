// controllers/authController.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const knex = require('../db'); 

const JWT_SECRET   = process.env.JWT_SECRET || 'dev_secret';
const NONCE_PREFIX = 'login:';

// address ของคุณมาจาก addressFromPublicKey แล้ว (เป็นสตริงตามระบบคุณ)
// จึงไม่ต้อง checksum แบบ ethers
const normAddr = (a) => String(a);

// GET /api/auth/nonce?address=0x...
exports.getNonce = async (req, res) => {
  try {
    const { address } = req.query || {};
    if (!address) return res.status(400).json({ error: 'address required' });

    const addr = normAddr(address);

    // ต้องมี WalletIdentity จาก createWallet มาก่อน
    const user = await knex('WalletIdentity').where({ address: addr }).first();
    if (!user) return res.status(404).json({ error: 'IDENTITY_NOT_FOUND' });

    const nonce = NONCE_PREFIX + Math.random().toString(16).slice(2) + Date.now().toString(36);

    await knex('WalletIdentity').where({ address: addr }).update({ nonce });

    return res.json({ address: addr, nonce });
  } catch (e) {
    console.error('getNonce error', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// POST /api/auth/login
// body: { address, nonce, signature }  // signature = base64 ของ Ed25519
exports.login = async (req, res) => {
  try {
    const { address, nonce, signature } = req.body || {};
    if (!address || !nonce || !signature) {
      return res.status(400).json({ error: 'address, nonce, signature required' });
    }
    const addr = normAddr(address);

    const user = await knex('WalletIdentity').where({ address: addr }).first();
    if (!user) return res.status(404).json({ error: 'IDENTITY_NOT_FOUND' });

    if (!user.nonce || user.nonce !== nonce || !nonce.startsWith(NONCE_PREFIX)) {
      return res.status(400).json({ error: 'INVALID_NONCE' });
    }

    // เตรียม public key (คุณเก็บเป็น DER/SPKI hex)
    const pubDer = Buffer.from(user.publicKey, 'hex');
    const pubKeyObj = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });

    // verify (Ed25519 ใช้ algorithm = null)
    const ok = crypto.verify(null, Buffer.from(nonce, 'utf8'), pubKeyObj, Buffer.from(signature, 'base64'));
    if (!ok) return res.status(401).json({ error: 'INVALID_SIGNATURE' });

    // one-time nonce
    await knex('WalletIdentity').where({ address: addr }).update({ nonce: null });
    const token = jwt.sign({ address: addr }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, address: addr });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.logout = async (_req, res) => res.json({ ok: true });
