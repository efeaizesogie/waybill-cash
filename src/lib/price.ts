export type Currency = 'NGN' | 'USD' | 'BCH';

export interface Rates { usd: number; ngn: number }

let cached: Promise<Rates | null> | null = null;

const fromCoinGecko = () =>
  fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd,ngn')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j?.['bitcoin-cash']?.usd ? { usd: j['bitcoin-cash'].usd, ngn: j['bitcoin-cash'].ngn } : null));

const fromCoinbase = () =>
  fetch('https://api.coinbase.com/v2/exchange-rates?currency=BCH')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j?.data?.rates?.USD ? { usd: Number(j.data.rates.USD), ngn: Number(j.data.rates.NGN) } : null));

/** Live BCH price, CoinGecko first, Coinbase if that is rate-limited. */
export function getRates(): Promise<Rates | null> {
  if (!cached) {
    cached = fromCoinGecko()
      .catch(() => null)
      .then((r) => r ?? fromCoinbase().catch(() => null))
      .then((r) => {
        if (!r) cached = null; // try again next time
        return r;
      });
  }
  return cached;
}

export function toSats(amount: number, cur: Currency, rates: Rates | null): number | null {
  if (!(amount > 0)) return null;
  if (cur === 'BCH') return Math.round(amount * 1e8);
  if (!rates) return null;
  const bch = amount / (cur === 'USD' ? rates.usd : rates.ngn);
  return Math.round(bch * 1e8);
}

export function formatMoney(amount: number, cur: Currency) {
  if (cur === 'BCH') return `${amount} BCH`;
  return new Intl.NumberFormat(cur === 'NGN' ? 'en-NG' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: cur === 'NGN' ? 0 : 2 }).format(amount);
}

export const formatBch = (sats: number | bigint) => `${(Number(sats) / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} BCH`;
