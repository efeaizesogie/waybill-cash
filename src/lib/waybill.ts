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
  rid?: string; // set when the order came from a seller's payment link
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
    { provider, contractType: 'p2sh32' },
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

// ---------- compact handover link ----------
// The handover QR must be easy to scan off a phone screen, so it carries only what is needed
// to rebuild the contract and settle: ~95 bytes instead of the ~450-char JSON order link.
// Layout: ver(1) net(1) buyerPkh(20) sellerPkh(20) refundAfter(u32) maxFee(u16) sats(u64) secret(16) item(utf8, ≤24 bytes)

const ITEM_MAX = 24;

function clipUtf8(text: string, max: number) {
  let bin = utf8ToBin(text);
  if (bin.length <= max) return bin;
  let t = text;
  while (utf8ToBin(t).length > max - 3) t = t.slice(0, -1);
  bin = utf8ToBin(t + '…');
  return bin;
}

export function encodeHandover(order: Order, secret: Uint8Array): string {
  const item = clipUtf8(order.item, ITEM_MAX);
  const buf = new Uint8Array(1 + 1 + 20 + 20 + 4 + 2 + 8 + 16 + item.length);
  const dv = new DataView(buf.buffer);
  let o = 0;
  buf[o++] = 2;
  buf[o++] = order.net === 'mainnet' ? 0 : 1;
  buf.set(hexToBin(order.buyerPkh), o); o += 20;
  buf.set(hexToBin(order.sellerPkh), o); o += 20;
  dv.setUint32(o, order.refundAfter); o += 4;
  dv.setUint16(o, order.maxFee); o += 2;
  dv.setBigUint64(o, BigInt(order.sats)); o += 8;
  buf.set(secret, o); o += 16;
  buf.set(item, o);
  return b64url(buf);
}

export function decodeHandover(code: string): { order: Order; secret: Uint8Array } {
  const buf = fromB64url(code);
  if (buf.length < 72 || buf[0] !== 2) throw new Error('This handover code is broken.');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 1;
  const net: Net = buf[o++] === 0 ? 'mainnet' : 'chipnet';
  const buyerPkh = binToHex(buf.slice(o, o + 20)); o += 20;
  const sellerPkh = binToHex(buf.slice(o, o + 20)); o += 20;
  const refundAfter = dv.getUint32(o); o += 4;
  const maxFee = dv.getUint16(o); o += 2;
  const sats = Number(dv.getBigUint64(o)); o += 8;
  const secret = buf.slice(o, o + 16); o += 16;
  const item = binToUtf8(buf.slice(o)) || 'Order';
  const order: Order = { v: 1, net, buyerPkh, sellerPkh, releaseHash: hashSecret(secret), refundAfter, maxFee, sats, item, created: 0 };
  return { order, secret };
}

// ---------- seller payment request ----------
// The seller creates the waybill: item, price and their own address. The buyer completes it
// (their refund address and the secret's hash) when they lock. `rid` ties the lock back to this request.

export interface PaymentRequest {
  net: Net;
  sellerPkh: string;
  sats: number;
  item: string;
  price?: string;
  windowBlocks: number;
  rid: string; // hex, 8 random bytes
}

const REQ_ITEM_MAX = 60;
const REQ_PRICE_MAX = 24;

export function newRequestId() {
  const r = new Uint8Array(8);
  crypto.getRandomValues(r);
  return binToHex(r);
}

export function encodeRequest(req: PaymentRequest): string {
  const item = clipUtf8(req.item, REQ_ITEM_MAX);
  const price = req.price ? clipUtf8(req.price, REQ_PRICE_MAX) : new Uint8Array();
  const buf = new Uint8Array(1 + 1 + 20 + 8 + 2 + 8 + 1 + item.length + price.length);
  const dv = new DataView(buf.buffer);
  let o = 0;
  buf[o++] = 3;
  buf[o++] = req.net === 'mainnet' ? 0 : 1;
  buf.set(hexToBin(req.sellerPkh), o); o += 20;
  dv.setBigUint64(o, BigInt(req.sats)); o += 8;
  dv.setUint16(o, req.windowBlocks); o += 2;
  buf.set(hexToBin(req.rid), o); o += 8;
  buf[o++] = item.length;
  buf.set(item, o); o += item.length;
  buf.set(price, o);
  return b64url(buf);
}

export function decodeRequest(code: string): PaymentRequest {
  const buf = fromB64url(code);
  if (buf.length < 41 || buf[0] !== 3) throw new Error('This payment link is broken. Ask the seller to send it again.');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 1;
  const net: Net = buf[o++] === 0 ? 'mainnet' : 'chipnet';
  const sellerPkh = binToHex(buf.slice(o, o + 20)); o += 20;
  const sats = Number(dv.getBigUint64(o)); o += 8;
  const windowBlocks = dv.getUint16(o); o += 2;
  const rid = binToHex(buf.slice(o, o + 8)); o += 8;
  const itemLen = buf[o++];
  const item = binToUtf8(buf.slice(o, o + itemLen)) || 'Order'; o += itemLen;
  const price = binToUtf8(buf.slice(o)) || undefined;
  return { net, sellerPkh, sats, item, price, windowBlocks, rid };
}

// ---------- payment note (OP_RETURN in the lock tx) ----------
// Lets the seller's page find the lock without a server: the lock tx also pays the seller a dust
// "doorbell" output, and its OP_RETURN carries what the seller needs to rebuild the contract.

export const NOTE_PREFIX = '5759424c'; // "WYBL"
export const DOORBELL_SATS = 546;

export interface PaymentNote { rid: string; buyerPkh: string; releaseHash: string; refundAfter: number }

export function noteChunks(note: PaymentNote): string[] {
  const h = new Uint8Array(4);
  new DataView(h.buffer).setUint32(0, note.refundAfter);
  return [`0x${NOTE_PREFIX}`, `0x${note.rid}`, `0x${note.buyerPkh}`, `0x${note.releaseHash}`, `0x${binToHex(h)}`];
}

/** Parse an OP_RETURN locking bytecode written by noteChunks. Returns null for anything else. */
export function parseNote(lockingBytecode: Uint8Array): PaymentNote | null {
  if (lockingBytecode[0] !== 0x6a) return null;
  const pushes: Uint8Array[] = [];
  let i = 1;
  while (i < lockingBytecode.length) {
    const op = lockingBytecode[i++];
    let len: number;
    if (op >= 1 && op <= 75) len = op;
    else if (op === 0x4c) len = lockingBytecode[i++];
    else return null;
    pushes.push(lockingBytecode.slice(i, i + len));
    i += len;
  }
  if (pushes.length !== 5 || binToHex(pushes[0]) !== NOTE_PREFIX) return null;
  if (pushes[1].length !== 8 || pushes[2].length !== 20 || pushes[3].length !== 32 || pushes[4].length !== 4) return null;
  return {
    rid: binToHex(pushes[1]),
    buyerPkh: binToHex(pushes[2]),
    releaseHash: binToHex(pushes[3]),
    refundAfter: new DataView(pushes[4].buffer, pushes[4].byteOffset, 4).getUint32(0),
  };
}

export function orderFromRequest(req: PaymentRequest, note: PaymentNote): Order {
  return {
    v: 1, net: req.net, buyerPkh: note.buyerPkh, sellerPkh: req.sellerPkh, releaseHash: note.releaseHash,
    refundAfter: note.refundAfter, maxFee: MAX_FEE, sats: req.sats, item: req.item, price: req.price, created: 0,
  };
}

// ---------- waybill link (no secret) ----------
// What the seller sends the rider, and what the rider's screen shows as a QR. It identifies the
// order and contract but holds no key: scanning it lets you watch, or confirm if you are the buyer.

export function encodeWaybill(order: Order): string {
  const item = clipUtf8(order.item, ITEM_MAX);
  const price = order.price ? clipUtf8(order.price, 16) : new Uint8Array();
  const buf = new Uint8Array(1 + 1 + 20 + 20 + 4 + 2 + 8 + 32 + 1 + item.length + price.length);
  const dv = new DataView(buf.buffer);
  let o = 0;
  buf[o++] = 4;
  buf[o++] = order.net === 'mainnet' ? 0 : 1;
  buf.set(hexToBin(order.buyerPkh), o); o += 20;
  buf.set(hexToBin(order.sellerPkh), o); o += 20;
  dv.setUint32(o, order.refundAfter); o += 4;
  dv.setUint16(o, order.maxFee); o += 2;
  dv.setBigUint64(o, BigInt(order.sats)); o += 8;
  buf.set(hexToBin(order.releaseHash), o); o += 32;
  buf[o++] = item.length;
  buf.set(item, o); o += item.length;
  buf.set(price, o);
  return b64url(buf);
}

export function decodeWaybill(code: string): Order {
  const buf = fromB64url(code);
  if (buf.length < 89 || buf[0] !== 4) throw new Error('This waybill code is broken.');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 1;
  const net: Net = buf[o++] === 0 ? 'mainnet' : 'chipnet';
  const buyerPkh = binToHex(buf.slice(o, o + 20)); o += 20;
  const sellerPkh = binToHex(buf.slice(o, o + 20)); o += 20;
  const refundAfter = dv.getUint32(o); o += 4;
  const maxFee = dv.getUint16(o); o += 2;
  const sats = Number(dv.getBigUint64(o)); o += 8;
  const releaseHash = binToHex(buf.slice(o, o + 32)); o += 32;
  const itemLen = buf[o++] ?? 0;
  const item = binToUtf8(buf.slice(o, o + itemLen)) || 'Order'; o += itemLen;
  const price = binToUtf8(buf.slice(o)) || undefined;
  return { v: 1, net, buyerPkh, sellerPkh, releaseHash, refundAfter, maxFee, sats, item, price, created: 0 };
}
