const { Model } = require('objection');

class LedgerBlock extends Model {
  static get tableName() { return 'LedgerBlock'; }
  static get idColumn() { return 'blockIndex'; }

  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
        blockIndex: { type: 'integer' },
        timestamp:  { type: 'string' },
        dataType:   { type: 'string' },
        fromAddress:{ type: ['string', 'null'] },
        toAddress:  { type: ['string', 'null'] },
        assetCode:  { type: 'string' },
        amount:     { type: 'string' },
        orderId:    { type: ['string', 'null'] },
        nonce:      { type: 'integer' },
        prevHash:   { type: 'string' },
        hash:       { type: 'string' },
        signature:  { type: ['string', 'null'] },
        publicKey:  { type: ['string', 'null'] }
      }
    };
  }

  static get relationMappings() {
    const WalletIdentity = require('./WalletIdentity');
    const Asset = require('./Asset');
    const Order = require('./Order');

    return {
      fromWallet: {
        relation: Model.BelongsToOneRelation,
        modelClass: WalletIdentity,
        join: { from: 'LedgerBlock.fromAddress', to: 'WalletIdentity.address' }
      },
      toWallet: {
        relation: Model.BelongsToOneRelation,
        modelClass: WalletIdentity,
        join: { from: 'LedgerBlock.toAddress', to: 'WalletIdentity.address' }
      },
      asset: {
        relation: Model.BelongsToOneRelation,
        modelClass: Asset,
        join: { from: 'LedgerBlock.assetCode', to: 'Asset.assetCode' }
      },
      order: {
        relation: Model.BelongsToOneRelation,
        modelClass: Order,
        join: { from: 'LedgerBlock.orderId', to: 'Order.orderId' }
      }
    };
  }
}

module.exports = LedgerBlock;
