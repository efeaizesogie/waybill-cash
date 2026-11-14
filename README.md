# Waybill

**Pay on delivery, without the cash.** A buyer locks BCH in a contract made for one order. The seller is paid the moment the buyer's code is scanned at the door. If the parcel never comes, the money goes back to the buyer.

Live: https://efeaizesogie.github.io/waybill-cash/ · Built for BCH BLAZE 2026.

## Why

Buying from strangers on WhatsApp and Instagram runs on trust nobody has. Buyers get "what I ordered vs what I got"; sellers stopped offering pay-on-delivery because riders carrying cash get robbed and failed deliveries cost them. Escrow apps exist, but each one is a company holding your money.

Waybill replaces the company with a Bitcoin Cash covenant. There is no arbiter, no account and no server.

## How it settles

| Step | Who | What happens on chain |
| --- | --- | --- |
| Lock | Buyer, via WizardConnect (Paytaca, Cashonize) | Wallet sends BCH to a P2SH32 contract made for this order |
| Check | Seller | Seller link shows the money locked to their address |
| Handover | Rider or seller scans the buyer's QR | Anyone with the 16-byte secret can trigger `release`; the covenant only pays the seller |
| No delivery | Anyone, after the deadline | `refund` is unlocked by block height; the covenant only pays the buyer |

Release and refund need **no signatures**: the covenant enforces where the money goes, so the rider never connects a wallet.

## The contract

[`contracts/waybill.cash`](contracts/waybill.cash) (CashScript 0.14, 81 bytes):

- `release(secret)`: `sha256(secret) == releaseHash`, one input, one output, output is P2PKH to the seller, and fee ≤ `maxFee`.
- `refund()`: `tx.time >= refundAfter`, one input, one output, output is P2PKH to the buyer, and fee ≤ `maxFee`.

The secret is 128 bits and travels as a QR code. A short PIN would be brute-forceable, because the redeem script (and so the hash) is public.

The tests in [`test/waybill.test.ts`](test/waybill.test.ts) cover paying the seller, a wrong code, redirecting the payout, burning it as fee, skimming with a second output, refunding early, refunding after the deadline, and redirecting the refund.

## No backend

Everything needed to rebuild the contract (buyer and seller key hashes, secret hash, deadline, amount, item) lives in the order link. The buyer's secret stays on their phone. The site is static on GitHub Pages and reads the chain through public Fulcrum servers.

## Run it

```bash
npm install
npm test
npm run dev
```

Add `?net=chipnet` to the URL to use Chipnet test coins.

## Stack

React, Vite, TypeScript, CashScript 0.14, libauth, WizardConnect (`@wizardconnect/react`).
