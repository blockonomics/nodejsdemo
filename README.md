# Bitcoin Payment Button in Node.js with Blockonomics

A complete demo **merchant storefront** — *Satoshi Books*, an online bookshop —
that accepts Bitcoin using the Blockonomics **Payment Button API**.
There's no custom checkout UI to build: Blockonomics hosts the checkout modal,
monitors payments, and sends confirmation emails. You just create a product, drop in
a button, and reconcile orders via webhooks.

The storefront lists several books, and each product page renders a real "Pay with
Crypto" button bound to a freshly minted temp product carrying that book's price
and your internal order id.

## Screenshot

**Product page — "Pay with Crypto" button (opens Blockonomics' hosted checkout)**

![Satoshi Books product page with Pay with Crypto button](docs/product-page.png)

## Features

- ✅ One-click **"Pay with Crypto"** button that opens a hosted checkout modal
- ✅ Automatic **order tracking via webhooks** (Order Hook)
- ✅ **SQLite** order storage for reconciliation
- ✅ **Admin dashboard** to view all Blockonomics orders and flag drift

## How it works

```
Customer browser            Your Express server            Blockonomics
      |  GET /book/btc-standard    |                              |
      |--------------------------->| POST /api/create_temp_product|
      |                            |----------------------------->|
      |                            |<----- temp product uid ------|
      |<-- HTML page w/ Pay btn ---|                              |
      |  click Pay (hosted modal) ------------------------------->|
      |                            |<- GET /webhook/order?status=0|
      |                            | GET /api/merchant_order/{uuid}->
      |                            |<------- full order ----------|
      |                            |<- GET /webhook/order?status=2|
```

Two integration models exist in the Blockonomics API. This repo uses the
**Checkouts / Payment Button** model (build-vs-buy: *buy*):

| Concern                  | Receive Payments API   | Checkouts / Payment Button (this repo) |
| ------------------------ | ---------------------- | -------------------------------------- |
| Address generation       | You (`/api/new_address`) | Blockonomics                         |
| Checkout UI              | You build it           | Blockonomics-hosted modal               |
| Customer fields          | You build the form     | Built into the button checkout          |
| Order state machine      | You manage it          | Blockonomics                           |
| Confirmation emails      | You send them          | Blockonomics                           |
| Best for                 | Fully custom flows     | Drop-in checkout on existing sites     |

## Prerequisites

- Node.js 18+
- A Blockonomics account with an **API key** (Dashboard → Stores)
- A Bitcoin wallet **xpub** attached to the store
- A **parent product** configured in the dashboard (the template for temp products)

### Setting up the parent product

1. Go to **Dashboard → Buttons & Links → Products**
2. Click **Create Product**
3. Fill in: product name (e.g. "Default Product"), default price, description, currency
4. Configure which customer fields to collect (email, name, address, phone, custom fields)
5. Set the **Success URL** and **Cancel URL**
6. Save, then copy the **widget UID** → this is your `PARENT_PRODUCT_UID`

### Setting up the Order Hook

Set the Order Hook URL under **Dashboard → Buttons & Links → Options**:

```
https://yourserver.com/webhook/order?secret=YOUR_SECRET
```

> ⚠️ **Two different webhook URLs.** The *Payments* callback lives under **Stores**.
> The *Order Hook* for Buttons & Links lives under **Buttons & Links → Options**.
> They are separate. If you only configured the Payments callback, the Payment
> Button flow will not fire callbacks to your server.

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your real values
npm run dev   # or: npm start
```

`.env`:

```ini
BLOCKONOMICS_API_KEY=your_api_key
PARENT_PRODUCT_UID=b5c04c7c395011ea
ORDER_CALLBACK_SECRET=any_random_long_string
PORT=3000
PUBLIC_URL=http://localhost:3000
```

Then visit:

- `http://localhost:3000/` — **Satoshi Books** storefront (grid of books)
- `http://localhost:3000/book/btc-standard` — product page with the Payment Button (hosted modal)
- `http://localhost:3000/admin/orders` — admin dashboard (JSON)

Set the parent product's **Success URL** to `${PUBLIC_URL}/success` and **Cancel URL**
to `${PUBLIC_URL}/cancel`.

For local webhook testing, expose your server with a tunnel (e.g. `ngrok http 3000`)
and point the dashboard Order Hook URL at `https://<tunnel>/webhook/order?secret=...`.

## Project structure

| File                  | Purpose                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| `src/server.js`       | Express app: storefront, product page, webhook, success/cancel, admin dashboard  |
| `src/catalog.js`      | The book catalogue (demo data) + price helpers                                   |
| `src/views.js`        | Server-rendered HTML (storefront grid, product page with the pay button, etc.)   |
| `src/blockonomics.js` | Thin axios client: `createTempProduct`, `getMerchantOrder`, `listMerchantOrders` |
| `src/db.js`           | `better-sqlite3` layer with an idempotent `upsertOrder`                           |

## Integrating into your own Node.js website

This is the minimal recipe to add a **Pay button** to any Express/Node.js app.
The pattern: on each checkout, your server creates a temp product (to carry the
price + your order id), gets back a `uid`, and your page renders the button bound
to that `uid`.

### Step 1 — Server: create a temp product and get a `uid`

```js
// blockonomics.js
import axios from "axios";

const client = axios.create({
    baseURL: "https://www.blockonomics.co/api",
    headers: { Authorization: `Bearer ${process.env.BLOCKONOMICS_API_KEY}` },
});

export async function createTempProduct({ parentUid, name, valueMinor, extraData }) {
    const { data } = await client.post("/create_temp_product", {
        parent_uid: parentUid,
        product_name: name,
        value: valueMinor,        // MINOR units: £30.00 => 3000
        extra_data: extraData,    // your internal order id, echoed back on the order
    });
    return data.uid;              // e.g. "f7570454529a11e7-1ee5f340"
}
```

```js
// route that serves the checkout page
app.get("/checkout/:id", async (req, res) => {
    const uid = await createTempProduct({
        parentUid: process.env.PARENT_PRODUCT_UID,
        name: "Mastering Bitcoin",
        valueMinor: 3299,
        extraData: `ord_${Date.now()}`,
    });
    res.send(renderCheckout(uid));   // inject uid into the HTML (see step 2)
});
```

### Step 2 — Frontend: the Pay button (hosted modal)

The button is a **web component**. Drop it anywhere and load `pay-button.js`:

```html
<blockonomics-pay-button uid="THE_UID" label="Pay with Crypto"></blockonomics-pay-button>
<script src="https://www.blockonomics.co/js/pay-button.js"></script>
```

- `uid` — the value returned by `create_temp_product`
- `label` — the button text

Clicking it opens Blockonomics' hosted checkout modal, where the customer enters
their details, sees the BTC amount + QR, and pays — all without leaving your page.

### Step 3 — Server: receive the Order Hook and reconcile

Set the Order Hook URL to `https://yourserver.com/webhook/order?secret=YOUR_SECRET`
under **Buttons & Links → Options**, then:

```js
app.get("/webhook/order", async (req, res) => {
    const { secret, status, uuid } = req.query;        // GET, not POST
    if (secret !== process.env.ORDER_CALLBACK_SECRET) return res.sendStatus(403);

    const order = await getMerchantOrder(uuid);        // fetch full details
    const myOrderId = order.extra_data;                // your id, back again
    // status: -1 error | 0 unpaid | 1 in_process | 2 paid
    if (parseInt(status, 10) === 2) fulfill(myOrderId, order);

    res.sendStatus(200);                               // ack fast
});
```

That's the whole loop: **temp product → button → Order Hook → reconcile**.

## Key concepts

### `value` is in minor units

`value` is the smallest unit of the currency (cents/pence/satoshis), **not** the
major unit. £30.00 = `value: 3000`. Same convention as Stripe — easy to miss once.

### `extra_data` is how you reconcile

`extra_data` is echoed back on the order and accessible via
`merchant_order/{uuid}`. Put your internal order ID / user ID / cart hash there so
you always know which order a callback belongs to. Depending on dashboard config it
may come back under `extra_data`, `data["Custom Field1"]`, or `description` — log
the full order object once to see where it lands for your setup.

### The Order Callback is a GET, not a POST

```
GET https://yourserver.com/webhook/order?secret=YOUR_SECRET&status=2&uuid=2b0c7e2cd523458098b2
```

| status | Meaning                                              |
| ------ | --------------------------------------------------- |
| `-1`   | PAYMENT_ERROR — paid amount doesn't match expected  |
| `0`    | UNPAID (entered checkout, hasn't paid yet)          |
| `1`    | IN_PROCESS (transaction seen, awaiting confirmation)|
| `2`    | PAID (fully confirmed)                              |

> These differ from the Payments callback enum, where `1` means "partially
> confirmed". The Order Callback's `1` means "in process". Separate APIs, separate
> state machines.

The callback only gives `status` and `uuid`. Always fetch the full order via
`GET /api/merchant_order/{uuid}` rather than reconstructing state from the callback
sequence — Blockonomics fires on status changes, so you may only see the final `2`.

## Common pitfalls

- **`create_temp_product` returns 400** — almost always a missing/wrong `parent_uid`. The UID has a hyphen; copy the whole thing.
- **Button doesn't render / does nothing** — `pay-button.js` failed to load, or CSP blocks third-party scripts. The button is the web component `<blockonomics-pay-button uid="…" label="Pay with Crypto">` plus `<script src="https://www.blockonomics.co/js/pay-button.js">`. CSP needs `script-src 'self' https://www.blockonomics.co`.
- **Price looks 100× off** — you passed major units. Use minor units (`3000`, not `30`).
- **Callback never fires** — Order Hook URL set under Stores instead of Buttons & Links → Options; missing `secret` param; or stale ngrok URL. Use the dashboard's "Test callback" button.
- **`extra_data` empty** — not passed to `create_temp_product`, or read from the wrong field. Log the full order object.

## Production checklist

- [ ] Parent product configured with success/cancel URLs pointing at your domain
- [ ] Order Hook URL configured under **Buttons & Links → Options** (not Stores)
- [ ] Order Hook secret matches `ORDER_CALLBACK_SECRET`
- [ ] `extra_data` set to your internal order ID on every `create_temp_product` call
- [ ] Callback handler is idempotent (dedup table)
- [ ] Callback handler returns 200 before doing heavy work
- [ ] Daily reconciliation cron against `/api/merchant_orders` to catch missed callbacks
- [ ] CSP allows `https://blockonomics.co` for `script-src` and `frame-src`
- [ ] `value` always in minor units — use a helper
- [ ] Tested the full happy path on Bitcoin testnet before mainnet
- [ ] Tested the `-1` PAYMENT_ERROR path (underpay) to confirm error handling

## Resources

- [Blockonomics API Reference](https://www.blockonomics.co/views/api.html)

## License

MIT
