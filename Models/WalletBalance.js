const { Model } = require('objection');

class WalletBalance extends Model {
  static get tableName() { return 'WalletBalance'; }
  static get idColumn() { return ['address', 'assetCode']; } // composite PK

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['address', 'assetCode'],
      properties: {
        address: { type: 'string' },
        assetCode: { type: 'string' },
        balanceAvailable: { type: 'string' }, // เก็บเป็น TEXT
        balanceLocked: { type: 'string' },
        updatedAt: { type: 'string' }
      }
    };
  }

  static get relationMappings() {
    const WalletIdentity = require('./WalletIdentity');
    const Asset = require('./Asset');

    return {
      wallet: {
        relation: Model.BelongsToOneRelation,
        modelClass: WalletIdentity,
        join: { from: 'WalletBalance.address', to: 'WalletIdentity.address' }
      },
      asset: {
        relation: Model.BelongsToOneRelation,
        modelClass: Asset,
        join: { from: 'WalletBalance.assetCode', to: 'Asset.assetCode' }
      }
    };
  }

  // ตัวอย่างเมธอดช่วยคำนวณง่าย ๆ (ทำงานกับ string)
  incAvailable(deltaStr) {
    const a = parseFloat(this.balanceAvailable || '0');
    this.balanceAvailable = String(a + parseFloat(deltaStr));
    return this;
  }
}

module.exports = WalletBalance;
