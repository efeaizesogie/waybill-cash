import { ElectrumNetworkProvider, type NetworkProvider, type SpendableUtxo } from 'cashscript';
import { decodeTransaction, hexToBin, binToHex } from '@bitauth/libauth';
import { type Net, type Order, type PaymentRequest, makeContract, addressFromPkh, buildRelease, buildRefund, parseNote, orderFromRequest } from './waybill';
import { cashAddressToLockingBytecode } from '@bitauth/libauth';
import { withTimeout } from './errors';

const providers = new Map<Net, ElectrumNetworkProvider>();
let override: NetworkProvider | null = null;
/** Tests only: route every chain call through another provider (e.g. CashScript's MockNetworkProvider). */
export function useProviderForTests(p: NetworkProvider | null) {
  override = p;
}
export function provider(net: Net): NetworkProvider {
  if (override) return override;
  let p = providers.get(net);
  if (!p) {
    p = new ElectrumNetworkProvider(net);
    providers.set(net, p);
  }
  return p;
}

export const explorerTx = (net: Net, txid: string) =>
  net === 'mainnet' ? `https://blockchair.com/bitcoin-cash/transaction/${txid}` : `https://chipnet.chaingraph.cash/tx/${txid}`;

export type Status =
  | { kind: 'waiting' }
  | { kind: 'locked'; utxo: SpendableUtxo; height: number }
  | { kind: 'released'; txid: string }
  | { kind: 'refunded'; txid: string };

interface HistoryItem { tx_hash: string; height: number }

const lockOf = (address: string) => {
  const r = cashAddressToLockingBytecode(address);
  if (typeof r === 'string') throw new Error(r);
  return binToHex(r.bytecode);
};

export function getStatus(order: Order): Promise<Status> {
  return withTimeout(readStatus(order), 25_000, 'Reading the order');
}

async function readStatus(order: Order): Promise<Status> {
  const p = provider(order.net);
  const contract = makeContract(order, p);
  const [utxos, height] = await Promise.all([contract.getUtxos(), p.getBlockHeight()]);
  if (utxos.length) return { kind: 'locked', utxo: utxos[0], height };

  const history = (await (p as ElectrumNetworkProvider).performRequest('blockchain.address.get_history', contract.address)) as unknown as HistoryItem[];
  if (!history?.length) return { kind: 'waiting' };

  // The settle tx is the one that spends the contract: it pays nothing back to the contract address.
  // Its first output says which way it went: seller (released, plus the fee output on v2) or buyer (refunded).
  const contractLock = lockOf(contract.address);
  const sellerLock = lockOf(addressFromPkh(order.sellerPkh, order.net));
  const buyerLock = lockOf(addressFromPkh(order.buyerPkh, order.net));
  for (const item of [...history].reverse()) {
    const raw = await p.getRawTransaction(item.tx_hash);
    const tx = decodeTransaction(hexToBin(raw));
    if (typeof tx === 'string' || item.tx_hash === order.fundTxid) continue;
    if (tx.outputs.some((o) => binToHex(o.lockingBytecode) === contractLock)) continue;
    const first = binToHex(tx.outputs[0]?.lockingBytecode ?? new Uint8Array());
    if (first === sellerLock) return { kind: 'released', txid: item.tx_hash };
    if (first === buyerLock) return { kind: 'refunded', txid: item.tx_hash };
  }
  return { kind: 'waiting' };
}

export type SettleStep = 'build' | 'send';
export const SETTLE_STEPS: { key: SettleStep | 'confirm'; label: string }[] = [
  { key: 'build', label: 'Checking the code against the contract' },
  { key: 'send', label: 'Sending the payment to the network' },
  { key: 'confirm', label: 'Waiting for the network to see it' },
];

/** Pay the seller. The contract checks the code and only allows one output, to the seller. */
export async function release(order: Order, utxo: SpendableUtxo, secret: Uint8Array, onStep?: (s: SettleStep) => void) {
  const p = provider(order.net);
  onStep?.('build');
  const builder = buildRelease(makeContract(order, p), order, utxo, secret, p);
  onStep?.('send');
  const tx = await withTimeout(builder.send(), 45_000, 'Sending the payment');
  return tx.txid;
}

/** Return the money to the buyer once the deadline has passed. */
export async function refund(order: Order, utxo: SpendableUtxo, onStep?: (s: SettleStep) => void) {
  const p = provider(order.net);
  onStep?.('build');
  const builder = buildRefund(makeContract(order, p), order, utxo, p);
  onStep?.('send');
  const tx = await withTimeout(builder.send(), 45_000, 'Sending the refund');
  return tx.txid;
}

export const blocksToTime = (blocks: number) => {
  const mins = Math.max(0, blocks) * 10;
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hr`;
  return `${Math.round(h / 24)} days`;
};

/**
 * Seller side of a payment request: look through the seller address's recent transactions for the
 * buyer's lock (it rings the seller with a dust output and carries a note tagged with this request id).
 */
export function findLockForRequest(req: PaymentRequest): Promise<{ order: Order; fundTxid: string } | null> {
  return withTimeout(scanForLock(req), 40_000, 'Checking for the payment');
}

const rawCache = new Map<string, string>();
async function scanForLock(req: PaymentRequest): Promise<{ order: Order; fundTxid: string } | null> {
  const p = provider(req.net);
  const address = addressFromPkh(req.sellerPkh, req.net);
  const history = (await (p as ElectrumNetworkProvider).performRequest('blockchain.address.get_history', address)) as unknown as HistoryItem[];
  if (!history?.length) return null;
  // Unconfirmed come last; check the newest 30.
  const recent = [...history].reverse().slice(0, 30);
  for (const item of recent) {
    let raw = rawCache.get(item.tx_hash);
    if (!raw) {
      raw = await p.getRawTransaction(item.tx_hash);
      rawCache.set(item.tx_hash, raw);
    }
    const tx = decodeTransaction(hexToBin(raw));
    if (typeof tx === 'string') continue;
    for (const out of tx.outputs) {
      const note = parseNote(out.lockingBytecode);
      if (note && note.rid === req.rid) return { order: { ...orderFromRequest(req, note), fundTxid: item.tx_hash }, fundTxid: item.tx_hash };
    }
  }
  return null;
}
