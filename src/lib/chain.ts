import { ElectrumNetworkProvider, type SpendableUtxo } from 'cashscript';
import { decodeTransaction, hexToBin, binToHex } from '@bitauth/libauth';
import { type Net, type Order, makeContract, addressFromPkh, buildRelease, buildRefund } from './waybill';
import { cashAddressToLockingBytecode } from '@bitauth/libauth';

const providers = new Map<Net, ElectrumNetworkProvider>();
export function provider(net: Net) {
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

export async function getStatus(order: Order): Promise<Status> {
  const p = provider(order.net);
  const contract = makeContract(order, p);
  const [utxos, height] = await Promise.all([contract.getUtxos(), p.getBlockHeight()]);
  if (utxos.length) return { kind: 'locked', utxo: utxos[0], height };

  const history = (await p.performRequest('blockchain.address.get_history', contract.address)) as unknown as HistoryItem[];
  if (!history?.length) return { kind: 'waiting' };

  const sellerLock = lockOf(addressFromPkh(order.sellerPkh, order.net));
  for (const item of [...history].reverse()) {
    const raw = await p.getRawTransaction(item.tx_hash);
    const tx = decodeTransaction(hexToBin(raw));
    if (typeof tx === 'string') continue;
    // The settle tx spends the contract and has exactly one output.
    if (tx.outputs.length === 1 && item.tx_hash !== order.fundTxid) {
      const out = binToHex(tx.outputs[0].lockingBytecode);
      return out === sellerLock ? { kind: 'released', txid: item.tx_hash } : { kind: 'refunded', txid: item.tx_hash };
    }
  }
  return { kind: 'waiting' };
}

export async function release(order: Order, utxo: SpendableUtxo, secret: Uint8Array) {
  const p = provider(order.net);
  const tx = await buildRelease(makeContract(order, p), order, utxo, secret, p).send();
  return tx.txid;
}

export async function refund(order: Order, utxo: SpendableUtxo) {
  const p = provider(order.net);
  const tx = await buildRefund(makeContract(order, p), order, utxo, p).send();
  return tx.txid;
}

export const blocksToTime = (blocks: number) => {
  const mins = Math.max(0, blocks) * 10;
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hr`;
  return `${Math.round(h / 24)} days`;
};
