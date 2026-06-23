// src/db.js — the whole "database" is one SQLite file.
//
// BTC store. Each order gets its OWN fresh address from Blockonomics, so the
// address is the order key — when a callback arrives we look the order up by
// `address` directly. `confirmations` holds the live count from the callback.
//
// In a real shop you'd run migrations with a tool (node-pg-migrate, Knex, ...).
// For a demo, a single CREATE TABLE is honest enough.

import Database from "better-sqlite3";

export const db = new Database("store.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    orderId       TEXT PRIMARY KEY,
    address       TEXT NOT NULL UNIQUE,  -- the fresh per-order BTC address
    amountFiat    REAL NOT NULL,
    currency      TEXT NOT NULL,
    amountBtc     REAL NOT NULL,         -- amount due in BTC (8 dp)
    pricePerBtc   REAL NOT NULL,         -- price of 1 BTC in fiat at checkout
    productName   TEXT NOT NULL,
    status        TEXT NOT NULL,         -- pending | paid | completed | failed
    txid          TEXT,                  -- the on-chain transaction id
    valueSats     INTEGER,               -- satoshis actually received
    confirmations INTEGER DEFAULT 0,     -- the live count from the callback
    createdAt     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
`);

export function createOrder(o) {
  db.prepare(
    `INSERT INTO orders
       (orderId, address, amountFiat, currency, amountBtc, pricePerBtc,
        productName, status)
     VALUES
       (@orderId, @address, @amountFiat, @currency, @amountBtc, @pricePerBtc,
        @productName, @status)`,
  ).run(o);
  return getOrder(o.orderId);
}

export function getOrder(orderId) {
  return db.prepare("SELECT * FROM orders WHERE orderId = ?").get(orderId);
}

// The callback identifies the order by its address — that's the whole point of a
// fresh address per order.
export function getOrderByAddress(address) {
  return db.prepare("SELECT * FROM orders WHERE address = ?").get(address);
}

// Update status and, when we learn them, the txid / value / confirmation count.
export function updateOrderStatus(orderId, status, { txid, valueSats, confirmations } = {}) {
  db.prepare(
    `UPDATE orders
        SET status = @status,
            txid = COALESCE(@txid, txid),
            valueSats = COALESCE(@valueSats, valueSats),
            confirmations = COALESCE(@confirmations, confirmations)
      WHERE orderId = @orderId`,
  ).run({
    orderId,
    status,
    txid: txid ?? null,
    valueSats: valueSats ?? null,
    confirmations: confirmations ?? null,
  });
  return getOrder(orderId);
}
