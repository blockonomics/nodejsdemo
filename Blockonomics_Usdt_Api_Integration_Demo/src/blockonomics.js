// src/blockonomics.js — thin wrappers around the Blockonomics HTTP API (USDT).
//
// Docs: https://developers.blockonomics.co
//   POST /new_address   -> https://developers.blockonomics.co/reference/post_new-address
//   GET  /price         -> https://developers.blockonomics.co/reference/get_price
//   POST /monitor_tx    -> https://developers.blockonomics.co/reference/post_monitor-tx
//   USDT guide          -> https://developers.blockonomics.co/reference/working-with-usdt

import axios from "axios";

const client = axios.create({
  baseURL: "https://www.blockonomics.co/api",
  headers: { Authorization: `Bearer ${process.env.BLOCKONOMICS_API_KEY}` },
});

// The store's USDT receive address. For USDT the API always returns the SAME
// address for your store (it isn't regenerated per order) — which is why we
// can't identify an order by its address and have to reconcile by txhash/amount.
//
// If you have a Blockonomics API key, POST /new_address returns this address.
// If you only have the receive address (no key), set USDT_RECEIVE_ADDRESS in
// .env and we use it directly — same result, no API call.
export async function usdtAddress(matchCallback) {
  const configured = process.env.USDT_RECEIVE_ADDRESS;
  if (configured) return { address: configured };

  const { data } = await client.post("/new_address", null, {
    params: { match_callback: matchCallback, crypto: "USDT", reset: 0 },
  });
  return { address: data.address };
}

// Price of 1 USDT in `currency`. It tracks ~1 USD worth of your fiat — but ask,
// don't hardcode a peg.
export async function usdtPrice(currency = "GBP") {
  try {
    const { data } = await client.get("/price", {
      params: { crypto: "USDT", currency },
    });
    return data.price;
  } catch {
    // /price is public, but if it's unreachable fall back to the ~1:1 USD peg
    // so the demo still works. Don't rely on this for real reconciliation.
    return 1;
  }
}

// Tell Blockonomics to start watching a USDT transaction. Note this one takes a
// JSON body, not query params like the others — easy to get wrong.
export async function monitorUsdtTx(txhash, matchCallback, testnet = 0) {
  const { data } = await client.post("/monitor_tx", {
    txhash,
    crypto: "USDT",
    match_callback: matchCallback,
    testnet,
  });
  return data;
}
