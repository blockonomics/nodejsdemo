// src/server.js
import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import {
    createTempProduct,
    getMerchantOrder,
    listMerchantOrders,
} from "./blockonomics.js";
import { db, upsertOrder } from "./db.js";
import { STORE, findBook } from "./catalog.js";
import {
    renderHome,
    renderBook,
    renderSuccess,
    renderCancel,
    renderNotFound,
} from "./views.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Storefront home — grid of books
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => {
    res.send(renderHome());
});

// ---------------------------------------------------------------------------
// Product page. On each view we mint a fresh temp product so the checkout
// carries this book's title/price plus our internal order id (extra_data),
// then render the hosted-modal Payment Button bound to that uid.
// ---------------------------------------------------------------------------
app.get("/book/:productId", async (req, res) => {
    const book = findBook(req.params.productId);
    if (!book) return res.status(404).send(renderNotFound());

    // Internal order id we want echoed back on the callback for reconciliation
    const internalOrderId = `ord_${crypto.randomBytes(6).toString("hex")}`;

    let uid;
    try {
        ({ uid } = await createTempProduct({
            parentUid: process.env.PARENT_PRODUCT_UID,
            productName: book.title,
            productDescription: `${book.title} — ${book.author}`,
            valueMinor: book.priceMinor, // minor units (pence)
            extraData: internalOrderId,
        }));

        // Persist a placeholder row so the callback handler can find this order
        upsertOrder({
            internalOrderId,
            blockonomicsUuid: null, // we get this on the first callback
            tempProductUid: uid,
            productName: book.title,
            valueMinor: book.priceMinor,
            currency: STORE.currency,
            status: "created",
        });
    } catch (err) {
        // Temp product creation needs a valid API key. If it fails (e.g. 401),
        // fall back to the parent product UID so the button still renders. The
        // button then shows the parent's default price, not this book's price.
        console.error(
            "create_temp_product failed (falling back to PARENT_PRODUCT_UID):",
            err.response?.data || err.message
        );
        uid = process.env.PARENT_PRODUCT_UID;
        if (!uid) {
            return res
                .status(502)
                .send(
                    "Could not start checkout. Set BLOCKONOMICS_API_KEY and PARENT_PRODUCT_UID in .env."
                );
        }
    }

    res.send(renderBook(book, uid));
});

// ---------------------------------------------------------------------------
// Success / cancel landing pages (set these as the parent product's URLs)
// ---------------------------------------------------------------------------
app.get("/success", (_req, res) => res.send(renderSuccess()));
app.get("/cancel", (_req, res) => res.send(renderCancel()));

// ---------------------------------------------------------------------------
// Order Callback (Order Hook). GET with query params — NOT a JSON POST.
//   ?secret=...&status=...&uuid=...
//   status: -1 error | 0 unpaid | 1 in_process | 2 paid
// ---------------------------------------------------------------------------
app.get("/webhook/order", async (req, res) => {
    const { secret, status, uuid } = req.query;

    // 1. Verify the secret
    if (secret !== process.env.ORDER_CALLBACK_SECRET) {
        return res.status(403).send("forbidden");
    }

    // 2. Fetch the full order
    let order;
    try {
        order = await getMerchantOrder(uuid);
    } catch (err) {
        console.error(
            "merchant_order fetch failed:",
            err.response?.data || err.message
        );
        // Return 200 anyway so Blockonomics doesn't retry while we debug
        return res.status(200).send("ok");
    }

    // 3. Reconcile against our internal order using extra_data
    const internalOrderId =
        order.data?.["Custom Field1"] || order.extra_data || null;

    // 4. Map status
    const statusInt = parseInt(status, 10);
    let derived = "unknown";
    if (statusInt === -1) derived = "error";
    if (statusInt === 0) derived = "unpaid";
    if (statusInt === 1) derived = "in_process";
    if (statusInt === 2) derived = "paid";

    // 5. Upsert (callback might fire before we've stored the uuid)
    upsertOrder({
        internalOrderId,
        blockonomicsUuid: uuid,
        tempProductUid: order.code,
        productName: order.name,
        valueMinor: order.value,
        currency: order.currency,
        status: derived,
        paidSatoshi: order.paid_satoshi,
        txid: order.txid,
        customerEmail: order.data?.emailid,
        customerName: order.data?.name,
    });

    // 6. Trigger business logic on paid
    if (derived === "paid") {
        await fulfillOrder(internalOrderId, order);
    }

    res.status(200).send("ok");
});

async function fulfillOrder(internalOrderId, order) {
    // Ship the book, send the receipt, etc.
    console.log(
        `✓ ORDER PAID: ${internalOrderId} — ${order.paid_satoshi} sats from ${order.data?.emailid}`
    );
}

// ---------------------------------------------------------------------------
// Admin dashboard backed by GET /api/merchant_orders
// ---------------------------------------------------------------------------
app.get("/admin/orders", async (req, res) => {
    const limit = parseInt(req.query.limit || "100", 10);

    let remote = [];
    try {
        remote = await listMerchantOrders(limit);
    } catch (err) {
        console.error(
            "merchant_orders fetch failed:",
            err.response?.data || err.message
        );
    }

    // Local snapshot for comparison
    const localByUuid = Object.fromEntries(
        db
            .prepare("SELECT * FROM orders")
            .all()
            .map((o) => [o.blockonomicsUuid, o])
    );

    // Reconcile: flag any orders Blockonomics knows about but we don't
    const enriched = remote.map((r) => ({
        ...r,
        localOrderId: localByUuid[r.order_id]?.internalOrderId || null,
        inSync: !!localByUuid[r.order_id],
    }));

    const drift = enriched.filter((o) => !o.inSync);

    res.json({
        total: enriched.length,
        drift: drift.length,
        orders: enriched.slice(0, 50),
    });
});

app.use((_req, res) => res.status(404).send(renderNotFound()));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(
        `${STORE.name} listening on ${process.env.PUBLIC_URL || `http://localhost:${PORT}`}`
    );
});
