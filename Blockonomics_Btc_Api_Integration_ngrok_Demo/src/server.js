// src/server.js — a Bitcoin checkout, end to end, testable locally with ngrok.
//
// Bitcoin is the easy shape: a fresh address per order, watched on-chain by
// Blockonomics for you. The flow:
//
//   checkout -> lock the price, generate a fresh address, save a pending order
//   pay      -> customer sends BTC on-chain to that address (never hits us)
//   browser  -> a WebSocket to Blockonomics gives instant "payment seen" UX
//   webhook  -> the source of truth: 0 unconfirmed, 1 partial, 2 confirmed
//
// The webhook is the part that can't reach localhost on its own — that's the gap
// ngrok closes. See the README for the ngrok walkthrough.

import "dotenv/config";
import express from "express";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

import {
  createOrder,
  getOrder,
  getOrderByAddress,
  updateOrderStatus,
} from "./db.js";
import { btcAddress, btcPrice } from "./blockonomics.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
// Only needs to OVERLAP with the callback URL set in Dashboard > Stores.
const MATCH_CALLBACK = "/webhook/blockonomics";

// BTC has 8 decimals; `value` in the callback is in satoshis (1e8 = 1 BTC).
const BTC_DECIMALS = 8;
const SATS_PER_BTC = 100_000_000;

// ---------------------------------------------------------------------------
// Checkout — lock a price, grab a fresh address, save the pending order.
// ---------------------------------------------------------------------------
app.post("/checkout", async (req, res) => {
  try {
    const { amountFiat = 30, currency = "USD", productName = "T-shirt" } = req.body;

    const pricePerBtc = await btcPrice(currency);
    const amountBtc = +(amountFiat / pricePerBtc).toFixed(BTC_DECIMALS);

    const { address } = await btcAddress(MATCH_CALLBACK);

    const orderId = `btc_${randomBytes(8).toString("hex")}`;

    createOrder({
      orderId,
      address,
      amountFiat,
      currency,
      amountBtc,
      pricePerBtc,
      productName,
      status: "pending",
    });

    res.json({
      orderId,
      paymentUrl: `${process.env.PUBLIC_URL}/pay/${orderId}`,
    });
  } catch (err) {
    console.error("checkout error:", err.response?.data || err.message);
    res.status(500).json({ error: "could not create order" });
  }
});

// ---------------------------------------------------------------------------
// Pay page data — everything the frontend needs to render a QR + amount.
// ---------------------------------------------------------------------------
app.get("/api/orders/:orderId", async (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "not found" });

  // BIP-21 URI: wallets pre-fill the address AND the amount from this.
  const uri = `bitcoin:${order.address}?amount=${order.amountBtc}`;
  const qrDataUrl = await QRCode.toDataURL(uri);

  res.json({
    orderId: order.orderId,
    productName: order.productName,
    amountFiat: order.amountFiat,
    currency: order.currency,
    amountBtc: order.amountBtc,
    address: order.address,
    status: order.status,
    confirmations: order.confirmations,
    qrDataUrl,
  });
});

// Lightweight status poll for the pay page (a backstop for the WebSocket).
app.get("/pay/:orderId/status", (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "not found" });
  res.json({ status: order.status, confirmations: order.confirmations });
});

// ---------------------------------------------------------------------------
// Webhook — Blockonomics calls this with GET as the tx gains confirmations.
// This is the SOURCE OF TRUTH: it fires even if the customer closes the tab.
//
//   GET /webhook/blockonomics?secret=…&txid=…&addr=…&value=…&status=…
//     status — 0 unconfirmed, 1 partial, 2 confirmed
//     value  — amount in satoshis
//     rbf    — present only on unconfirmed Replace-By-Fee transactions
// ---------------------------------------------------------------------------
app.get("/webhook/blockonomics", (req, res) => {
  const { secret, addr, status, txid, value, rbf } = req.query;

  // 1. Verify the secret. Reject anything not from you.
  if (secret !== process.env.CALLBACK_SECRET) return res.status(403).send("forbidden");

  // 2. A fresh address per order means the address IS the order key.
  const order = getOrderByAddress(addr);
  if (!order) return res.status(200).send("ok"); // unknown — ack so retries stop

  const statusInt = parseInt(status, 10);
  const valueSats = value != null ? Number(value) : null;
  const meta = { txid, valueSats, confirmations: Math.max(statusInt, 0) };

  // 3. Map status. Idempotent: never walk an order backwards from completed.
  //    status=0 (mempool) is "paid" but still RBF-replaceable — wait for >=2
  //    before you hand over anything digital. See the README gotchas.
  if (order.status !== "completed") {
    if (statusInt === 0 && !rbf) updateOrderStatus(order.orderId, "paid", meta);
    else if (statusInt === 1) updateOrderStatus(order.orderId, "paid", meta);
    else if (statusInt >= 2) updateOrderStatus(order.orderId, "completed", meta);
  }

  // 4. Return 200, or Blockonomics retries (up to 7×, exponential backoff).
  res.status(200).send("ok");
});

// Pretty URL for the pay page; the static file does the rest.
app.get("/pay/:orderId", (_req, res) => res.sendFile("pay.html", { root: "public" }));

app.listen(PORT, () => {
  console.log(`₿ BTC clothes demo on http://localhost:${PORT}`);
  console.log(
    `   Webhook: ${process.env.PUBLIC_URL}${MATCH_CALLBACK}?secret=${process.env.CALLBACK_SECRET}`,
  );
});
