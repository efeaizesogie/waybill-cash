import type { DappConnectionManager } from '@wizardconnect/dapp';
import { type Net, type Order, newSecret, hashSecret, encodeSecret, makeContract, MAX_FEE, addressFromPkh, noteChunks } from './waybill';
import { provider } from './chain';
import { buyerIdentity, lockFunds } from './wallet';
import { saveOrder } from './store';

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
  onStep?: (label: string) => void;
}) {
  const { manager, net } = opts;
  const buyer = buyerIdentity(manager, net);
  opts.onStep?.('Reading the chain');
  const height = await provider(net).getBlockHeight();
  const secret = newSecret();
  const order: Order = {
    v: 1,
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
  opts.onStep?.('Approve the lock in your wallet');
  const txid = await lockFunds({
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
