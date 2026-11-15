import type { DappConnectionManager } from '@wizardconnect/dapp';
import { type Net, type Order, ORDER_VERSION, newSecret, hashSecret, encodeSecret, makeContract, MAX_FEE, addressFromPkh, noteChunks } from './waybill';
import { provider } from './chain';
import { buyerIdentity, lockFunds } from './wallet';
import { saveOrder } from './store';
import { withTimeout } from './errors';

export type LockStep = 'chain' | 'wallet' | 'approve' | 'send';
export const LOCK_STEPS: { key: LockStep; label: string; hint?: string }[] = [
  { key: 'chain', label: 'Reading the network' },
  { key: 'wallet', label: 'Checking your wallet for coins' },
  { key: 'approve', label: 'Approve the lock in your wallet', hint: 'Open your wallet. In Paytaca the request waits under Apps, then WizardConnect. In Cashonize, under Connect.' },
  { key: 'send', label: 'Sending the lock to the network' },
];

/**
 * Create the buyer's side of an order and lock the money. Used by the 2-minute demo form and by a
 * seller's payment link. Returns the buyer's order code (their private page).
 */
export async function lockOrder(opts: {
  manager: DappConnectionManager;
  net: Net;
  sellerPkh: string;
  sats: number;
  item: string;
  price?: string;
  windowBlocks: number;
  rid?: string;
  onStep?: (step: LockStep) => void;
}) {
  const { manager, net } = opts;
  const buyer = buyerIdentity(manager, net);
  opts.onStep?.('chain');
  const height = await withTimeout(provider(net).getBlockHeight(), 20_000, 'Reading the network');
  const secret = newSecret();
  const order: Order = {
    v: ORDER_VERSION,
    net,
    buyerPkh: buyer.pkh,
    sellerPkh: opts.sellerPkh,
    releaseHash: hashSecret(secret),
    refundAfter: height + opts.windowBlocks,
    maxFee: MAX_FEE,
    sats: opts.sats,
    item: opts.item.trim().slice(0, 80),
    price: opts.price,
    created: Date.now(),
    rid: opts.rid,
  };
  // Keep the code before anything is signed, so it can never be lost after paying.
  saveOrder(order, encodeSecret(secret));
  const contract = makeContract(order, provider(net));
  opts.onStep?.('wallet');
  const txid = await lockFunds({
    onStep: opts.onStep,
    manager,
    net,
    contractAddress: contract.address,
    sats: BigInt(order.sats),
    itemLabel: order.item,
    note: opts.rid
      ? {
          sellerAddress: addressFromPkh(order.sellerPkh, net),
          chunks: noteChunks({ rid: opts.rid, buyerPkh: order.buyerPkh, releaseHash: order.releaseHash, refundAfter: order.refundAfter }),
        }
      : undefined,
  });
  return saveOrder({ ...order, fundTxid: txid }, encodeSecret(secret));
}
