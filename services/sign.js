const crypto = require('crypto');
const fs = require('fs');

// ใช้: node services/sign.js "<nonce>" ./privateKey.pem
const nonce = process.argv[2];
const pemPath = process.argv[3] || './privateKey.pem';

if (!nonce) {
  console.error('usage: node services/sign.js "<nonce>" [pemPath]');
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(pemPath, 'utf8');
const sigB64 = crypto.sign(null, Buffer.from(nonce, 'utf8'), privateKeyPem).toString('base64');
console.log(sigB64);
