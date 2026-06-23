// src/blockonomics.js — thin wrappers around the Blockonomics HTTP API (BTC).
//
// Docs: https://developers.blockonomics.co
//   POST /new_address   -> https://developers.blockonomics.co/reference/post_new-address
//   GET  /price         -> https://developers.blockonomics.co/reference/get_price
//
// Unlike USDT, Bitcoin gives you a *fresh* address per order, and Blockonomics
// watches that address on-chain for you — there's no monitor_tx step. That makes
// reconciliation trivial: the address IS the order key.

import axios from "axios";

const client = axios.create({
  baseURL: "https://www.blockonomics.co/api",
  headers: { Authorization: `Bearer ${process.env.BLOCKONOMICS_API_KEY}` },
});

// Ask Blockonomics for a brand-new receiving address for this order. The
// `match_callback` only needs to OVERLAP with the callback URL you set in the
// dashboard (Stores) — it's how Blockonomics decides which callback fires.
export async function btcAddress(matchCallback) {
  const { data } = await client.post("/new_address", null, {
    params: { match_callback: matchCallback, crypto: "BTC", reset: 0 },
  });
  return { address: data.address };
}

// Price of 1 BTC in `currency`. Lock this at checkout so the amount due doesn't
// drift while the customer is paying.
export async function btcPrice(currency = "USD") {
  const { data } = await client.get("/price", {
    params: { crypto: "BTC", currency },
  });
  return data.price;
}
