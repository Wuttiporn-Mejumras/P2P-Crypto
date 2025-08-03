const { Model } = require('objection');

class TopUp extends Model {
  static get tableName() { return 'TopUp'; }
  static get idColumn() { return 'topUpId'; }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['topUpId', 'address', 'assetCode', 'type', 'amount', 'status'],
      properties: {
        topUpId: { type: 'string' },
        address: { type: 'string' },
        assetCode: { type: 'string' },
        type: { type: 'string' },
        amount: { type: 'string' },
        status: { type: 'string' },
        note: { type: ['string', 'null'] },
        createdAt: { type: 'string' },
        completedAt: { type: ['string', 'null'] }
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
        join: { from: 'TopUp.address', to: 'WalletIdentity.address' }
      },
      asset: {
        relation: Model.BelongsToOneRelation,
        modelClass: Asset,
        join: { from: 'TopUp.assetCode', to: 'Asset.assetCode' }
      }
    };
  }
}

module.exports = TopUp;
