import { type Order, type PaymentRequest, encodeOrder, encodeRequest } from './waybill';

/** Local, per-device memory of the waybills this browser created, plus their secrets. */
const KEY = 'waybill.orders.v1';
const REQ_KEY = 'waybill.requests.v1';

interface Saved { code: string; secret?: string; item: string; created: number; net: string; rid?: string }
interface SavedRequest { code: string; item: string; created: number; net: string; rid: string }

function readKey<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function writeKey<T>(key: string, list: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage blocked: the links are still shown on screen */
  }
}

export function saveOrder(order: Order, secret?: string) {
  const code = encodeOrder(order);
  const list = readKey<Saved>(KEY).filter((s) => s.code !== code);
  list.unshift({ code, secret, item: order.item, created: order.created, net: order.net, rid: order.rid });
  writeKey(KEY, list);
  return code;
}

export function secretFor(releaseHash: string, decode: (c: string) => Order): string | undefined {
  for (const s of readKey<Saved>(KEY)) {
    try {
      if (s.secret && decode(s.code).releaseHash === releaseHash) return s.secret;
    } catch {
      /* skip broken entries */
    }
  }
  return undefined;
}

/** The buyer's own order for a seller's payment link, if they already locked it on this device. */
export function orderForRequest(rid: string): string | undefined {
  return readKey<Saved>(KEY).find((s) => s.rid === rid && s.secret)?.code;
}

export const listOrders = () => readKey<Saved>(KEY);

export function saveRequest(req: PaymentRequest) {
  const code = encodeRequest(req);
  const list = readKey<SavedRequest>(REQ_KEY).filter((s) => s.rid !== req.rid);
  list.unshift({ code, item: req.item, created: Date.now(), net: req.net, rid: req.rid });
  writeKey(REQ_KEY, list);
  return code;
}

export const listRequests = () => readKey<SavedRequest>(REQ_KEY);
