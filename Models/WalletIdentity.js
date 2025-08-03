// ใน models/WalletIdentity.js
const { Model } = require('objection');
const WalletBalance = require('./WalletBalance');
const TopUp = require('./TopUp');
const crypto = require('crypto');

function addressFromPublicKey(pubDer) {
  const hex = crypto.createHash('sha256').update(pubDer).digest('hex');
  return '0x' + hex.slice(0, 40);
}

class WalletIdentity extends Model {
  static get tableName() { return 'WalletIdentity'; }
  static get idColumn() { return 'address'; }

  static get relationMappings() {
    return {
      balances: {
        relation: Model.HasManyRelation,
        modelClass: WalletBalance,
        join: { from: 'WalletIdentity.address', to: 'WalletBalance.address' }
      },
      topUps: {
        relation: Model.HasManyRelation,
        modelClass: TopUp,
        join: { from: 'WalletIdentity.address', to: 'TopUp.address' }
      }
    };
  }

  // --- methods ที่ controller ใช้ ---
  getBalances() {
    return this.$relatedQuery('balances')
      .select('assetCode', 'balanceAvailable', 'balanceLocked')
      .orderBy('assetCode');
  }

 static async createWithKeypair({ label } = {}, trx) {
  const { publicKey: pubKey, privateKey: privKey } =
    crypto.generateKeyPairSync('ed25519');

  const pubDer = pubKey.export({ type: 'spki', format: 'der' });
  const publicKeyHex = Buffer.from(pubDer).toString('hex');
  const address = addressFromPublicKey(pubDer);
  const privateKeyPem = privKey.export({ type: 'pkcs8', format: 'pem' });

  const q = trx ? this.query(trx) : this.query();   // 👈 ผูก trx ถ้ามี
  const wallet = await q.insert({ address, publicKey: publicKeyHex, label: label ?? null });

  return { wallet, privateKeyPem };
}

  static async applyTopup({ address, assetCode, amount, type = 'DEPOSIT' }, trx) {
    const sign = type === 'WITHDRAW' ? -1 : 1;
    const delta = String(sign * Number(amount));

    // ensure row
    await WalletBalance.query(trx)
      .insert({ address, assetCode })
      .onConflict(['address','assetCode'])
      .ignore();

    // update
    await WalletBalance.query(trx)
      .patch({
        balanceAvailable: WalletBalance.raw(
          "CAST(balanceAvailable AS REAL) + CAST(? AS REAL)", [delta]
        ),
        updatedAt: WalletBalance.raw("datetime('now')")
      })
      .where({ address, assetCode });

    // record topup
    const topUpId = 'T' + Date.now();
    await TopUp.query(trx).insert({
      topUpId, address, assetCode, type,
      amount: String(amount),
      status: 'COMPLETED',
      note: 'api'
    });

    const balance = await WalletBalance.query(trx)
      .findById([address, assetCode])
      .select('assetCode','balanceAvailable','balanceLocked');

    return { topUpId, balance };
  }
}

module.exports = WalletIdentity;
