// src/db.js — the whole "database" is one SQLite file.
//
// USDT-only store. Every order is paid into the SAME store address, so an order
// can't be identified by its address. Instead we lean on the transaction hash
// (`txid`) and, as a fallback, a uniquely-jittered amount. `confirmations` holds
// the live count straight from the callback.
//
// In a real shop you'd run migrations with a tool (node-pg-migrate, Knex, ...).
// For a demo, a single CREATE TABLE is honest enough.

import Database from "better-sqlite3";

export const db = new Database("store.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    orderId       TEXT PRIMARY KEY,
    address       TEXT NOT NULL,        -- the shared store USDT address
    amountFiat    REAL NOT NULL,
    currency      TEXT NOT NULL,
    amountUsdt    REAL NOT NULL,        -- amount due in USDT (jittered, 6 dp)
    pricePerUsdt  REAL NOT NULL,        -- price of 1 USDT in fiat at checkout
    productName   TEXT NOT NULL,
    status        TEXT NOT NULL,        -- pending | submitted | partial | paid | failed
    txid          TEXT,                 -- the hash we're monitoring
    txHashHint    TEXT,                 -- what the customer pasted, before we trust it
    confirmations INTEGER DEFAULT 0,    -- the live count from the callback
    createdAt     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
`);

export function createOrder(o) {
  db.prepare(
    `INSERT INTO orders
       (orderId, address, amountFiat, currency, amountUsdt, pricePerUsdt,
        productName, status, txHashHint)
     VALUES
       (@orderId, @address, @amountFiat, @currency, @amountUsdt, @pricePerUsdt,
        @productName, @status, @txHashHint)`,
  ).run({ txHashHint: null, ...o });
  return getOrder(o.orderId);
}

export function getOrder(orderId) {
  return db.prepare("SELECT * FROM orders WHERE orderId = ?").get(orderId);
}

// Update status and, when we learn them, the txid / confirmation count.
export function updateOrderStatus(orderId, status, { txid, confirmations } = {}) {
  db.prepare(
    `UPDATE orders
        SET status = @status,
            txid = COALESCE(@txid, txid),
            confirmations = COALESCE(@confirmations, confirmations)
      WHERE orderId = @orderId`,
  ).run({ orderId, status, txid: txid ?? null, confirmations: confirmations ?? null });
  return getOrder(orderId);
}

// USDT reconciliation helpers ------------------------------------------------

// Primary match: the customer (or the Web3 component) told us the txhash.
export function findOrderByTxid(txid) {
  return db.prepare("SELECT * FROM orders WHERE txid = ?").get(txid);
}

// Fallback match: the callback's `value` (USDT) lines up with a still-open
// order's uniquely-jittered amount, created in the last hour.
export function findOpenOrderByAmount(valueUsdt) {
  return db
    .prepare(
      `SELECT * FROM orders
        WHERE status IN ('pending', 'submitted')
          AND ABS(amountUsdt - ?) < 0.000001
          AND createdAt > strftime('%s','now') - 3600
        ORDER BY createdAt DESC
        LIMIT 1`,
    )
    .get(valueUsdt);
}
