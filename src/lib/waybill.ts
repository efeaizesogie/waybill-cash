import {
  Contract,
  TransactionBuilder,
  type NetworkProvider,
  type SpendableUtxo,
} from 'cashscript';
import {
  binToHex,
  hexToBin,
  sha256,
  hash160,
  cashAddressToLockingBytecode,
  lockingBytecodeToCashAddress,
  decodeCashAddress,
  encodeCashAddress,
  binToBase64,
  base64ToBin,
  utf8ToBin,
  binToUtf8,
} from '@bitauth/libauth';
import artifact from './waybill.artifact';

export type Net = 'mainnet' | 'chipnet';

/** Everything needed to rebuild the contract. Lives in the share link, no backend. */
export interface Order {
  v: 1;
  net: Net;
  buyerPkh: string; // hex, 20 bytes
  sellerPkh: string; // hex, 20 bytes
  releaseHash: string; // hex, sha256(secret)
  refundAfter: number; // block height
  maxFee: number; // sats the settle tx may spend on fee
  sats: number; // amount locked
  item: string;
  price?: string; // display price in local currency, e.g. "₦25,000"
  created: number; // unix ms
  fundTxid?: string;
}

export const MAX_FEE = 1500;
export const DUST = 1000;

export const prefixFor = (net: Net) => (net === 'mainnet' ? 'bitcoincash' : 'bchtest');

export function newSecret(): Uint8Array {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return s;
}

export const hashSecret = (secret: Uint8Array) => binToHex(sha256.hash(secret));

export function pkhFromAddress(address: string): string {
  const decoded = decodeCashAddress(address.trim());
  if (typeof decoded === 'string') throw new Error('That is not a valid BCH address.');
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') {
    throw new Error('Use a regular BCH wallet address (starts with q).');
  }
  return binToHex(decoded.payload);
}

export function netFromAddress(address: string): Net {
  const decoded = decodeCashAddress(address.trim());
  if (typeof decoded === 'string') throw new Error('That is not a valid BCH address.');
  return decoded.prefix === 'bitcoincash' ? 'mainnet' : 'chipnet';
}

export function addressFromPkh(pkh: string, net: Net): string {
  return encodeCashAddress({ prefix: prefixFor(net), type: 'p2pkh', payload: hexToBin(pkh) }).address;
}

export function addressFromPubkey(pubkey: Uint8Array, net: Net): string {
  return addressFromPkh(binToHex(hash160(pubkey)), net);
}

export function makeContract(order: Order, provider: NetworkProvider) {
  return new Contract(
    artifact,
    [
      hexToBin(order.buyerPkh),
      hexToBin(order.sellerPkh),
      hexToBin(order.releaseHash),
      BigInt(order.refundAfter),
      BigInt(order.maxFee),
    ],
    { provider, addressType: 'p2sh32' },
  );
}

type WaybillContract = ReturnType<typeof makeContract>;

/** The covenant forces a single output to the seller; fee comes out of the locked amount. */
export function buildRelease(contract: WaybillContract, order: Order, utxo: SpendableUtxo, secret: Uint8Array, provider: NetworkProvider) {
  const fee = settleFee();
  return new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.release(secret))
    .addOutput({ to: addressFromPkh(order.sellerPkh, order.net), amount: utxo.satoshis - fee });
}

export function buildRefund(contract: WaybillContract, order: Order, utxo: SpendableUtxo, provider: NetworkProvider) {
  const fee = settleFee();
  return new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.refund())
    .addOutput({ to: addressFromPkh(order.buyerPkh, order.net), amount: utxo.satoshis - fee })
    .setLocktime(order.refundAfter);
}

/** ~300 byte tx at 1 sat/byte, with headroom. Well under MAX_FEE. */
export const settleFee = () => 500n;

// ---------- links ----------

const b64url = (bin: Uint8Array) => binToBase64(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = base64ToBin(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  if (typeof bin === 'string') throw new Error('Broken link.');
  return bin;
};

export function encodeOrder(order: Order): string {
  return b64url(utf8ToBin(JSON.stringify(order)));
}

export function decodeOrder(code: string): Order {
  const order = JSON.parse(binToUtf8(fromB64url(code))) as Order;
  if (order.v !== 1 || !/^[0-9a-f]{40}$/.test(order.buyerPkh) || !/^[0-9a-f]{40}$/.test(order.sellerPkh) || !/^[0-9a-f]{64}$/.test(order.releaseHash)) {
    throw new Error('This waybill link is broken.');
  }
  return order;
}

export const encodeSecret = (secret: Uint8Array) => b64url(secret);
export const decodeSecret = (s: string) => fromB64url(s);

export function secretMatches(order: Order, secret: Uint8Array) {
  return hashSecret(secret) === order.releaseHash;
}

export { cashAddressToLockingBytecode, lockingBytecodeToCashAddress, binToHex, hexToBin };
