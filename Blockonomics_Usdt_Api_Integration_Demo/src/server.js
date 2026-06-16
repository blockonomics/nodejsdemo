// src/server.js — a USDT-on-Ethereum checkout, end to end.
//
// The shape of a USDT payment is different from Bitcoin: there's one shared
// store address (so the address can't identify an order), and you explicitly
// start watching each transaction with monitor_tx. The flow:
//
//   checkout  -> create a pending order + jittered amount, show address/QR
//   pay       -> customer sends USDT; we get a txhash (Web3 component or paste)
//   submit-tx -> POST the hash to monitor_tx so Blockonomics starts watching
//   webhook   -> -1 failed, 0/1 partial, 2 paid (the literal confirmation count)

import "dotenv/config";
import express from "express";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

import {
  createOrder,
  getOrder,
  updateOrderStatus,
  findOrderByTxid,
  findOpenOrderByAmount,
} from "./db.js";
import { usdtAddress, usdtPrice, monitorUsdtTx } from "./blockonomics.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const TESTNET = Number(process.env.TESTNET || 0);
const MATCH_CALLBACK = "/webhook/blockonomics";

// USDT (ERC-20) is 6 decimals — not 8 like BTC. Getting this wrong makes every
// payment look like a 100x underpayment.
const USDT_DECIMALS = 6;
// USDT contract for the EIP-681 fallback QR. Mainnet Tether is well known;
// Blockonomics doesn't publish a fixed Sepolia test contract, so make testnet
// configurable. On testnet the Web3 component is the reliable path anyway.
const USDT_CONTRACT =
  process.env.USDT_CONTRACT ||
  (TESTNET ? "" : "0xdAC17F958D2ee523a2206206994597C13D831ec7");

// ---------------------------------------------------------------------------
// Checkout — quote a price, grab the store address, jitter the amount.
// ---------------------------------------------------------------------------
app.post("/checkout", async (req, res) => {
  try {
    const { amountFiat = 30, currency = "GBP", productName = "T-shirt" } = req.body;

    const pricePerUsdt = await usdtPrice(currency);
    const amountUsdt = +(amountFiat / pricePerUsdt).toFixed(USDT_DECIMALS);

    const { address } = await usdtAddress(MATCH_CALLBACK);

    const orderId = `usdt_${randomBytes(8).toString("hex")}`;

    // Every order shares one address, so nudge the amount by a tiny random
    // fraction (0–9.9¢ worth) to make concurrent orders unique-ish. That's what
    // lets us match a payment back to an order — see reconciliation in the README.
    // Not bulletproof; fine for low/moderate volume.
    const jitter = Math.floor(Math.random() * 99) / 1_000_000; // 0..0.000099
    const amountFinal = +(amountUsdt + jitter).toFixed(USDT_DECIMALS);

    createOrder({
      orderId,
      address,
      amountFiat,
      currency,
      amountUsdt: amountFinal,
      pricePerUsdt,
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

  // EIP-681: modern Ethereum wallets pre-fill recipient, contract and amount
  // from this. USDT base units = amount * 1e6. Without a contract (e.g. testnet)
  // fall back to a plain-address QR; the Web3 component is the intended path.
  let qrPayload = order.address;
  if (USDT_CONTRACT) {
    const amountBaseUnits = Math.round(order.amountUsdt * 10 ** USDT_DECIMALS);
    qrPayload = `ethereum:${USDT_CONTRACT}/transfer?address=${order.address}&uint256=${amountBaseUnits}`;
  }
  const qrDataUrl = await QRCode.toDataURL(qrPayload);

  res.json({
    orderId: order.orderId,
    productName: order.productName,
    amountFiat: order.amountFiat,
    currency: order.currency,
    amountUsdt: order.amountUsdt,
    address: order.address,
    status: order.status,
    confirmations: order.confirmations,
    qrDataUrl,
    usdtReceiveAddress: process.env.USDT_RECEIVE_ADDRESS || order.address,
    testnet: TESTNET,
  });
});

// Lightweight status poll for the pay page.
app.get("/pay/:orderId/status", (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "not found" });
  res.json({ status: order.status, confirmations: order.confirmations });
});

// ---------------------------------------------------------------------------
// Customer submits their USDT txhash (Web3 component, or manual paste).
// ---------------------------------------------------------------------------
app.post("/pay/:orderId/submit-tx", async (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "not found" });

  const { txhash } = req.body;
  if (!/^0x[a-fA-F0-9]{64}$/.test(txhash || "")) {
    return res.status(400).json({ error: "invalid Ethereum transaction hash" });
  }

  try {
    await monitorUsdtTx(txhash, MATCH_CALLBACK, TESTNET);
    updateOrderStatus(order.orderId, "submitted", { txid: txhash });
    res.json({ ok: true });
  } catch (err) {
    console.error("monitor_tx failed:", err.response?.data || err.message);
    res.status(500).json({ error: "could not start monitoring" });
  }
});

// ---------------------------------------------------------------------------
// Webhook — Blockonomics calls this with GET as the tx gains confirmations.
// ---------------------------------------------------------------------------
app.get("/webhook/blockonomics", (req, res) => {
  const { secret, txid, value, status } = req.query;
  if (secret !== process.env.CALLBACK_SECRET) return res.status(403).send("forbidden");

  // The address is shared, so match by txid first, then fall back to the
  // uniquely-jittered amount (value is in USDT base units).
  let order = txid ? findOrderByTxid(txid) : null;
  if (!order && value != null) {
    order = findOpenOrderByAmount(Number(value) / 10 ** USDT_DECIMALS);
  }
  if (!order) return res.status(200).send("ok"); // unknown — ack so retries stop

  // status is the literal confirmation count: -1 reverted, 0/1 partial, 2 final.
  const statusInt = parseInt(status, 10);
  const meta = { txid, confirmations: Math.max(statusInt, 0) };

  if (statusInt === -1) updateOrderStatus(order.orderId, "failed", meta);
  else if (statusInt === 0 || statusInt === 1)
    updateOrderStatus(order.orderId, "partial", meta);
  else if (statusInt >= 2) updateOrderStatus(order.orderId, "paid", meta);

  res.status(200).send("ok");
});

// Pretty URL for the pay page; the static file does the rest.
app.get("/pay/:orderId", (_req, res) => res.sendFile("pay.html", { root: "public" }));

app.listen(PORT, () => {
  console.log(`🧵 USDT clothes demo on http://localhost:${PORT}`);
  console.log(
    `   Webhook: ${process.env.PUBLIC_URL}${MATCH_CALLBACK}?secret=${process.env.CALLBACK_SECRET}`,
  );
});
