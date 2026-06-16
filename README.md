# Blockonomics Demos

A collection of runnable Node.js demos showing different ways to accept
cryptocurrency payments with [Blockonomics](https://developers.blockonomics.co).
Each demo lives in its own self-contained folder with its own `package.json`,
source, and README.

## Demos

| Folder | Demo | What it shows |
| --- | --- | --- |
| [`Blockonomics_Button_Demo/`](./Blockonomics_Button_Demo) | **Bitcoin Payment Button** — *Satoshi Books* storefront | Accept **BTC** via Blockonomics' hosted **Payment Button** — no custom checkout UI. Hosted checkout modal, order tracking via webhooks, SQLite storage, and an admin dashboard. |
| [`Blockonomics_Usdt_Api_Integration_Demo/`](./Blockonomics_Usdt_Api_Integration_Demo) | **USDT API Integration** — *Threadonomics* clothes shop | Accept **USDT (ERC-20)** via the Blockonomics API. Single shared address, transaction-hash reconciliation, explicit `monitor_tx`, and a custom pay page (EIP-681 QR + Web3 component + manual paste). |

## Getting started

Each demo is independent. Pick a folder, then:

```bash
cd <demo-folder>
cp .env.example .env   # fill in your Blockonomics API key
npm install
npm start
```

See the README inside each folder for the full flow, configuration, and
endpoint details.
