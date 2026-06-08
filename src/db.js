// src/db.js
import Database from "better-sqlite3";

export const db = new Database("orders.db");

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
    internalOrderId  TEXT PRIMARY KEY,
    blockonomicsUuid TEXT UNIQUE,
    tempProductUid   TEXT,
    productName      TEXT,
    valueMinor       INTEGER,
    currency         TEXT,
    status           TEXT NOT NULL,
    paidSatoshi      INTEGER,
    txid             TEXT,
    customerEmail    TEXT,
    customerName     TEXT,
    createdAt        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_uuid ON orders(blockonomicsUuid);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`);

const cols = [
    "internalOrderId",
    "blockonomicsUuid",
    "tempProductUid",
    "productName",
    "valueMinor",
    "currency",
    "status",
    "paidSatoshi",
    "txid",
    "customerEmail",
    "customerName",
];

export function upsertOrder(order) {
    const existing = db
        .prepare("SELECT * FROM orders WHERE internalOrderId = ?")
        .get(order.internalOrderId);

    if (!existing) {
        const placeholders = cols.map((c) => `@${c}`).join(", ");
        db.prepare(`
            INSERT INTO orders (${cols.join(", ")})
            VALUES (${placeholders})
        `).run(Object.fromEntries(cols.map((c) => [c, order[c] ?? null])));
        return;
    }

    // Only update non-null fields, so later callbacks don't blank out earlier data
    const updates = cols
        .filter((c) => order[c] != null && order[c] !== existing[c])
        .map((c) => `${c} = @${c}`);

    if (updates.length === 0) return;

    updates.push("updatedAt = strftime('%s','now')");

    db.prepare(`
        UPDATE orders SET ${updates.join(", ")}
        WHERE internalOrderId = @internalOrderId
    `).run({ ...order, internalOrderId: order.internalOrderId });
}

export function getOrderByUuid(uuid) {
    return db.prepare("SELECT * FROM orders WHERE blockonomicsUuid = ?").get(uuid);
}

// Why upsert: the callback at status 0 arrives before you've even stored the UUID locally
// (you only got the temp product UID back from create_temp_product, not the order UUID —
// that's only generated when the customer enters checkout).
// So you create a placeholder when the temp product is made, then the callback fills in the UUID,
// customer email, satoshi amount, txid, etc. as they become known.
