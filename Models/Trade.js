const { Model } = require('objection');

class Trade extends Model {
  static get tableName() { return 'Trade'; }
  static get idColumn() { return 'tradeId'; }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['tradeId', 'orderId', 'buyerAddress', 'sellerAddress', 'baseAsset', 'quoteAsset', 'amountBaseTraded', 'price', 'amountQuotePaid'],
      properties: {
        tradeId: { type: 'string' },
        orderId: { type: 'string' },
        buyerAddress: { type: 'string' },
        sellerAddress: { type: 'string' },
        baseAsset: { type: 'string' },
        quoteAsset: { type: 'string' },
        amountBaseTraded: { type: 'string' },
        price: { type: 'string' },
        amountQuotePaid: { type: 'string' },
        createdAt: { type: 'string' }
      }
    };
  }

  static get relationMappings() {
    const Order = require('./Order');
    const WalletIdentity = require('./WalletIdentity');
    const Asset = require('./Asset');

    return {
      order: {
        relation: Model.BelongsToOneRelation,
        modelClass: Order,
        join: { from: 'Trade.orderId', to: 'Order.orderId' }
      },
      buyer: {
        relation: Model.BelongsToOneRelation,
        modelClass: WalletIdentity,
        join: { from: 'Trade.buyerAddress', to: 'WalletIdentity.address' }
      },
      seller: {
        relation: Model.BelongsToOneRelation,
        modelClass: WalletIdentity,
        join: { from: 'Trade.sellerAddress', to: 'WalletIdentity.address' }
      },
      base: {
        relation: Model.BelongsToOneRelation,
        modelClass: Asset,
        join: { from: 'Trade.baseAsset', to: 'Asset.assetCode' }
      },
      quote: {
        relation: Model.BelongsToOneRelation,
        modelClass: Asset,
        join: { from: 'Trade.quoteAsset', to: 'Asset.assetCode' }
      }
    };
  }
}

module.exports = Trade;
