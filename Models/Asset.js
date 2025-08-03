const { Model } = require('objection');

class Asset extends Model {
  static get tableName() { return 'Asset'; }
  static get idColumn() { return 'assetCode'; }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['assetCode', 'assetType'],
      properties: {
        assetCode: { type: 'string' },
        assetType: { type: 'string' },
        precision: { type: 'integer' },
        isActive:  { type: 'integer' }
      }
    };
  }

  static get relationMappings() {
    const WalletBalance = require('./WalletBalance');
    const Order = require('./Order');
    const Trade = require('./Trade');
    const LedgerBlock = require('./LedgerBlock');

    return {
      balances: {
        relation: Model.HasManyRelation,
        modelClass: WalletBalance,
        join: { from: 'Asset.assetCode', to: 'WalletBalance.assetCode' }
      },
      baseOrders: {
        relation: Model.HasManyRelation,
        modelClass: Order,
        join: { from: 'Asset.assetCode', to: 'Order.baseAsset' }
      },
      quoteOrders: {
        relation: Model.HasManyRelation,
        modelClass: Order,
        join: { from: 'Asset.assetCode', to: 'Order.quoteAsset' }
      },
      baseTrades: {
        relation: Model.HasManyRelation,
        modelClass: Trade,
        join: { from: 'Asset.assetCode', to: 'Trade.baseAsset' }
      },
      quoteTrades: {
        relation: Model.HasManyRelation,
        modelClass: Trade,
        join: { from: 'Asset.assetCode', to: 'Trade.quoteAsset' }
      },
      ledgerBlocks: {
        relation: Model.HasManyRelation,
        modelClass: LedgerBlock,
        join: { from: 'Asset.assetCode', to: 'LedgerBlock.assetCode' }
      }
    };
  }
}

module.exports = Asset;