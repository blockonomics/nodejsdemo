# Accept USDT (stablecoin) payments in Node.js alongside Bitcoin with Blockonomics

A deliberately tiny store that sells one t-shirt and accepts **USDT (Tether,
ERC-20 on Ethereum)** through [Blockonomics](https://developers.blockonomics.co).
It's the companion code to the "accept USDT in Node.js" tutorial — every snippet
in that article is real and runs here.

   
<img width="526" height="732" alt="image" src="https://github.com/user-attachments/assets/2c33539f-64b8-4da8-88d6-0daaf3bac3a7" />



Stablecoins are why this exists. Bitcoin is volatile: quote £30 at 9:00 and you
might bank £29.40 or £30.60 by the time it confirms. USDT is pegged ~1:1 to the
dollar, so £30 in means ≈£30 out. The integration model, though, is genuinely
different from BTC — this repo is about those differences.

## What's different from Bitcoin (and why this code looks the way it does)


1. **One fixed address for the whole store, not one per order.** `POST /new_address`
   with `crypto=USDT` always returns the same address. So you *can't* tell orders
   apart by address — you reconcile by transaction hash and a jittered amount.
2. **You explicitly start monitoring each transaction.** There's no "watch this
   address" on Ethereum without an indexer. You hand Blockonomics the txhash via
   `POST /monitor_tx` and it calls you back as confirmations land.
3. **`status` is the literal confirmation count.** `-1` reverted, `0`/`1` partial,
   `2` final. Blockonomics stops calling at `2` (~24s on Ethereum); poll yourself
   if you need more.

## What's here

```
src/
  db.js            one SQLite table + the two reconciliation lookups
  blockonomics.js  thin wrappers: usdtAddress, usdtPrice, monitorUsdtTx
  server.js        checkout, the pay-page API, tx submission, the webhook
public/
  index.html       the shop
  pay.html         the payment page (EIP-681 QR + Web3 component + manual paste)
  styles.css
```

## The flow

```
checkout   → create a pending order, jitter the amount, return the store address
pay        → customer sends USDT; a txhash comes back (Web3 component or paste)
submit-tx  → POST that hash to monitor_tx so Blockonomics starts watching
webhook    → -1 failed · 0/1 partial · 2 paid   (the literal confirmation count)
```

## Blockonomics endpoints used

All against `https://www.blockonomics.co/api`, Bearer-authenticated.

- [`POST /new_address`](https://developers.blockonomics.co/reference/post_new-address) — `match_callback`, `crypto=USDT`, `reset` (returns the fixed store address)
- [`GET /price`](https://developers.blockonomics.co/reference/get_price) — `crypto=USDT`, `currency`; price of **1 USDT**
- [`POST /monitor_tx`](https://developers.blockonomics.co/reference/post_monitor-tx) — **JSON body** `{ txhash, crypto, match_callback, testnet }` (not query params — easy to trip on)
- [HTTP callback](https://developers.blockonomics.co/reference/callback-notification) — Blockonomics calls your webhook with **GET** and `secret, addr, value, txid, status`
- [Web3 USDT component](https://developers.blockonomics.co/reference/working-with-usdt) — `<web3-payment>` from `blockonomics.co/js/web3-payment.js`, emits `onTxnSubmitted` → `{ crypto, txhash }`

## Run it

```bash
npm install
cp .env.example .env      # then fill in the blanks
npm run dev
```

You need a public URL so Blockonomics can reach your webhook. In dev:

```bash
ngrok http 3000
# paste the https URL into PUBLIC_URL in .env, then restart
```

Open the shop at your `PUBLIC_URL` (or `http://localhost:3000` to click around
without real callbacks) and check out.

## Reconciliation — the painful bit

Every order points at the **same** address, so when a callback arrives you need
another way to know whose payment it is. In increasing order of robustness:

1. **Trust the submitted txhash** — `POST /pay/:id/submit-tx` puts the hash on the
   order; the webhook looks it up by `txid`. Fine for an MVP; a malicious customer
   could submit someone else's hash.
2. **Match on a jittered amount** — checkout nudges each amount by 0–9.9¢ of
   randomness, so concurrent orders rarely collide. The callback's `value` (in
   base units) is matched back to the order. Holds up to moderate volume.
3. **Use the Web3 component** — it gets the txhash straight from the wallet and
   ties it to the specific order before the customer even confirms. Production-
   grade. See [working-with-usdt](https://developers.blockonomics.co/reference/working-with-usdt).

`server.js` implements 1 and 2 in the webhook (`findOrderByTxid` →
`findOpenOrderByAmount`); the pay page mounts 3.

## Things that bite (and the fixes baked in)

- **6 decimals, not 8.** USDT `value` is in base units — `value / 1e6`. Divide by
  `1e8` and every payment looks like a 100× underpayment.
- **`monitor_tx` is a JSON POST**, while `new_address`/`price` use query params.
- **Callbacks fire on _change_ only**, and `2` is terminal — submit a tx already
  past 2 confirmations and you'll never get a callback.
- **Testnet.** Set `TESTNET=1` (Sepolia) consistently, including in `monitor_tx`.
- **Gas.** The sender pays gas in ETH. No ETH, no transaction — nothing the
  merchant can do; the wallet warns them.
- **Only BTC and USDT.** `crypto=USDC` or another stablecoin returns 422 from
  `new_address`.

## Heads up — this is a demo

One SQLite file, no migrations, txhash trusted on submit. Good enough to learn
from; for production you'd add real migrations, idempotent webhook handling, and
lean on the Web3 component for reconciliation.
