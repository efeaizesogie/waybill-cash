import { type Order, encodeOrder } from './waybill';

/** Local, per-device memory of the waybills this browser created, plus their secrets. */
const KEY = 'waybill.orders.v1';

interface Saved { code: string; secret?: string; item: string; created: number; net: string }

function read(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Saved[];
  } catch {
    return [];
  }
}

function write(list: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage blocked: the private link is still shown to the buyer */
  }
}

export function saveOrder(order: Order, secret?: string) {
  const code = encodeOrder(order);
  const list = read().filter((s) => s.code !== code);
  list.unshift({ code, secret, item: order.item, created: order.created, net: order.net });
  write(list);
  return code;
}

export function secretFor(releaseHash: string, decode: (c: string) => Order): string | undefined {
  for (const s of read()) {
    try {
      if (s.secret && decode(s.code).releaseHash === releaseHash) return s.secret;
    } catch {
      /* skip broken entries */
    }
  }
  return undefined;
}

export const listOrders = () => read();
