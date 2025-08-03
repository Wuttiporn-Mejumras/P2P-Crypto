PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Asset (
  assetCode   TEXT PRIMARY KEY,                  
  assetType   TEXT NOT NULL,                      
  precision   INTEGER NOT NULL DEFAULT 8,
  isActive    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS WalletIdentity (
  address       TEXT PRIMARY KEY,                 
  publicKey     TEXT NOT NULL,
  label         TEXT,
  privateKeyEnc TEXT,
  createdAt     TEXT NOT NULL DEFAULT (datetime('now'))
);


CREATE TABLE IF NOT EXISTS WalletBalance (
  address           TEXT NOT NULL,
  assetCode         TEXT NOT NULL,
  balanceAvailable  TEXT NOT NULL DEFAULT '0',    
  balanceLocked     TEXT NOT NULL DEFAULT '0',
  updatedAt         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (address, assetCode),
  FOREIGN KEY (address)   REFERENCES WalletIdentity(address) ON DELETE CASCADE,
  FOREIGN KEY (assetCode) REFERENCES Asset(assetCode)       ON DELETE RESTRICT
);


CREATE TABLE IF NOT EXISTS TopUp (
  topUpId     TEXT PRIMARY KEY,                   
  address     TEXT NOT NULL,
  assetCode   TEXT NOT NULL,
  type        TEXT NOT NULL,                      
  amount      TEXT NOT NULL,
  status      TEXT NOT NULL,                      
  note        TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  completedAt TEXT,
  FOREIGN KEY (address)   REFERENCES WalletIdentity(address),
  FOREIGN KEY (assetCode) REFERENCES Asset(assetCode)
);


CREATE TABLE IF NOT EXISTS "Order" (
  orderId          TEXT PRIMARY KEY,
  ownerAddress     TEXT NOT NULL,
  side             TEXT NOT NULL,                 
  baseAsset        TEXT NOT NULL,
  quoteAsset       TEXT NOT NULL,
  amountBase       TEXT NOT NULL,
  amountBaseFilled TEXT NOT NULL DEFAULT '0',
  price            TEXT NOT NULL,                 
  status           TEXT NOT NULL,                 
  createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt        TEXT,
  FOREIGN KEY (ownerAddress) REFERENCES WalletIdentity(address),
  FOREIGN KEY (baseAsset)    REFERENCES Asset(assetCode),
  FOREIGN KEY (quoteAsset)   REFERENCES Asset(assetCode)
);


CREATE TABLE IF NOT EXISTS Trade (
  tradeId           TEXT PRIMARY KEY,
  orderId           TEXT NOT NULL,
  buyerAddress      TEXT NOT NULL,
  sellerAddress     TEXT NOT NULL,
  baseAsset         TEXT NOT NULL,
  quoteAsset        TEXT NOT NULL,
  amountBaseTraded  TEXT NOT NULL,
  price             TEXT NOT NULL,
  amountQuotePaid   TEXT NOT NULL,
  createdAt         TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (orderId)       REFERENCES "Order"(orderId),
  FOREIGN KEY (buyerAddress)  REFERENCES WalletIdentity(address),
  FOREIGN KEY (sellerAddress) REFERENCES WalletIdentity(address),
  FOREIGN KEY (baseAsset)     REFERENCES Asset(assetCode),
  FOREIGN KEY (quoteAsset)    REFERENCES Asset(assetCode)
);


CREATE TABLE IF NOT EXISTS LedgerBlock (
  blockIndex   INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp    TEXT NOT NULL DEFAULT (datetime('now')),
  dataType     TEXT NOT NULL,                    
  fromAddress  TEXT,                              
  toAddress    TEXT,                               
  assetCode    TEXT NOT NULL,
  amount       TEXT NOT NULL,
  orderId      TEXT,
  nonce        INTEGER NOT NULL DEFAULT 0,
  prevHash     TEXT NOT NULL,
  hash         TEXT NOT NULL,
  signature    TEXT,
  publicKey    TEXT,
  FOREIGN KEY (fromAddress) REFERENCES WalletIdentity(address),
  FOREIGN KEY (toAddress)   REFERENCES WalletIdentity(address),
  FOREIGN KEY (assetCode)   REFERENCES Asset(assetCode),
  FOREIGN KEY (orderId)     REFERENCES "Order"(orderId)
);


CREATE INDEX IF NOT EXISTS IX_Order_Status        ON "Order"(status, createdAt);
CREATE INDEX IF NOT EXISTS IX_Trade_OrderId       ON Trade(orderId);
CREATE INDEX IF NOT EXISTS IX_TopUp_AddressTime   ON TopUp(address, createdAt);
CREATE INDEX IF NOT EXISTS IX_Ledger_Asset_Ts     ON LedgerBlock(assetCode, timestamp);
