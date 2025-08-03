const { Model } = require('objection');

class Order extends Model {
  static get tableName() { return 'Order'; }
  static get idColumn() { return 'orderId'; }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['orderId', 'ownerAddress', 'side', 'baseAsset', 'quoteAsset', 'amountBase', 'price', 'status'],
      properties: {
        orderId: { type: 'string' },
        ownerAddress: { type: 'string' },
        side: { type: 'string' }, // buy/sell
        baseAsset: { type: 'string' },
        quoteAsset: { type: 'string' },
        amountBase: { type: 'string' },
        amountBaseFilled: { type: 'string' },
        price: { type: 'string' },
        status: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: ['string', 'null'] }
      }
    };
  }

  static get relationMappings() {
    const WalletIdentity = require('./WalletIdentity');
    const Asset = require('./Asset');
    const Trade = require('./Trade');

    return {
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: WalletIdentity,
        join: { from: 'Order.ownerAddress', to: 'WalletIdentity.address' }
      },
      base: {
        relation: Model.BelongsToOneRelation,
        modelClass: Asset,
        join: { from: 'Order.baseAsset', to: 'Asset.assetCode' }
      },
      quote: {
        relation: Model.BelongsToOneRelation,
        modelClass: Asset,
        join: { from: 'Order.quoteAsset', to: 'Asset.assetCode' }
      },
      trades: {
        relation: Model.HasManyRelation,
        modelClass: Trade,
        join: { from: 'Order.orderId', to: 'Trade.orderId' }
      }
    };
  }

  filledRatio() {
    const a = parseFloat(this.amountBase || '0');
    const f = parseFloat(this.amountBaseFilled || '0');
    if (a <= 0) return 0;
    return f / a;
  }
}

module.exports = Order;
