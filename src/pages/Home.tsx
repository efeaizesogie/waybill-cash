import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../lib/walletContext';
import { type Currency, type Rates, getRates, toSats, formatMoney, formatBch } from '../lib/price';
import { pkhFromAddress, netFromAddress, decodeOrder, newRequestId } from '../lib/waybill';
import { buyerIdentity, scanWallet } from '../lib/wallet';
import { lockOrder } from '../lib/lock';
import { listOrders, listRequests, saveRequest } from '../lib/store';
import { binToHex, hash160 } from '@bitauth/libauth';
import { Guide } from '../components/Guide';

const WINDOWS = [
  { blocks: 12, label: '2 hours (demo)' },
  { blocks: 144, label: '1 day' },
  { blocks: 432, label: '3 days' },
  { blocks: 1008, label: '7 days' },
];
const MIN_SATS = 2000;

/** Item + price + refund window, shared by both forms. */
function useOrderFields() {
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState<Currency>('NGN');
  const [windowBlocks, setWindowBlocks] = useState(144);
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    getRates().then((r) => {
      setRates(r);
      if (!r) setCur('BCH');
    });
  }, []);
  const sats = useMemo(() => toSats(parseFloat(amount), cur, rates), [amount, cur, rates]);
  const tooSmall = sats !== null && sats < MIN_SATS;
  const price = cur === 'BCH' || !amount ? undefined : formatMoney(parseFloat(amount), cur);
  const check = (what: string) => {
    if (!item.trim()) return `Say what ${what}, so the other side recognises the order.`;
    if (!sats || tooSmall) return `Enter an amount of at least ${formatBch(MIN_SATS)}.`;
    return null;
  };
  const fields = (itemLabel: string, windowLabel: string) => (
    <>
      <label className="field">
        <span>{itemLabel}</span>
        <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Ankara two-piece, size M" maxLength={60} required />
      </label>
      <div className="field">
        <label htmlFor="amount">Price</label>
        <div className="amount-row">
          <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={cur === 'NGN' ? '25000' : cur === 'USD' ? '15' : '0.001'} />
          <div className="seg" role="radiogroup" aria-label="Currency">
            {(['NGN', 'USD', 'BCH'] as Currency[]).map((c) => (
              <button type="button" key={c} role="radio" aria-checked={cur === c} className={cur === c ? 'on' : ''} disabled={c !== 'BCH' && !rates} onClick={() => setCur(c)}>
                {c === 'NGN' ? '₦' : c === 'USD' ? '$' : 'BCH'}
              </button>
            ))}
          </div>
        </div>
        <span className={`hint mono ${tooSmall ? 'hint-bad' : ''}`}>
          {sats ? `${formatBch(sats)}${tooSmall ? `, below the ${formatBch(MIN_SATS)} minimum` : ''}` : rates ? 'Converted at the live BCH price' : 'Live price unavailable, enter BCH'}
        </span>
      </div>
      <label className="field">
        <span>{windowLabel}</span>
        <select value={windowBlocks} onChange={(e) => setWindowBlocks(Number(e.target.value))}>
          {WINDOWS.map((w) => (
            <option key={w.blocks} value={w.blocks}>{w.label}</option>
          ))}
        </select>
      </label>
    </>
  );
  return { item, sats, price, windowBlocks, check, fields };
}

/** Seller creates the waybill and sends the link to the buyer. No wallet connection needed. */
function SellForm() {
  const wallet = useWallet();
  const f = useOrderFields();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const connected = wallet.state === 'connected' && !!wallet.manager;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const bad = f.check('you are selling');
    if (bad) return setError(bad);
    try {
      if (netFromAddress(address) !== wallet.net) {
        throw new Error(wallet.net === 'mainnet' ? 'That is a test address. Use your bitcoincash: address.' : 'That is a mainnet address. Use your bchtest: address, or switch to mainnet.');
      }
      const code = saveRequest({
        net: wallet.net,
        sellerPkh: pkhFromAddress(address),
        sats: f.sats!,
        item: f.item.trim(),
        price: f.price,
        windowBlocks: f.windowBlocks,
        rid: newRequestId(),
      });
      location.hash = `#/s/${code}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form className="order-form" onSubmit={submit} noValidate>
      {f.fields('What are you selling?', 'Refund the buyer if not delivered in')}
      <label className="field">
        <span>Your BCH address (where you get paid)</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={wallet.net === 'mainnet' ? 'bitcoincash:q…' : 'bchtest:q…'} spellCheck={false} autoCapitalize="off" />
        {connected && wallet.manager ? (
          <button type="button" className="link-btn hint-btn" onClick={() => setAddress(buyerIdentity(wallet.manager!, wallet.net).address)}>Use my connected wallet's address</button>
        ) : (
          <span className="hint">In your wallet, tap Receive and copy the address.</span>
        )}
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" type="submit">Create payment link</button>
    </form>
  );
}

/** The 2-minute demo: one person plays buyer and seller with their own wallet. */
function TryForm() {
  const wallet = useWallet();
  const f = useOrderFields();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const connected = wallet.state === 'connected' && !!wallet.manager;

  useEffect(() => {
    if (!connected || !wallet.manager) return;
    let alive = true;
    scanWallet(wallet.manager, wallet.net, 10, 5)
      .then((r) => alive && setBalance(r.balance))
      .catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [connected, wallet.manager, wallet.net]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!connected || !wallet.manager) return wallet.openConnect();
    const bad = f.check('you are buying');
    if (bad) return setError(bad);
    try {
      const pub = wallet.manager.getPubkey(0, 1n) ?? wallet.manager.getPubkey(0, 0n)!;
      const code = await lockOrder({
        manager: wallet.manager,
        net: wallet.net,
        sellerPkh: binToHex(hash160(pub)),
        sats: f.sats!,
        item: f.item,
        price: f.price,
        windowBlocks: f.windowBlocks,
        onStep: setBusy,
      });
      location.hash = `#/o/${code}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form className="order-form" onSubmit={submit} noValidate>
      <p className="hint">You play buyer and seller with your own wallet, so a full run only costs network fees (under ₦5).</p>
      {f.fields('What are you buying?', 'Refund me if it hasn’t arrived in')}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" type="submit" disabled={!!busy}>
        {busy ?? (connected ? `Lock ${f.sats ? formatBch(f.sats) : 'payment'}` : 'Connect wallet to lock')}
      </button>
      {connected && balance !== null && <span className="hint mono">Wallet balance {formatBch(balance)}</span>}
    </form>
  );
}

export function Home() {
  const wallet = useWallet();
  const [mode, setMode] = useState<'sell' | 'try'>('sell');
  const recent = listOrders().filter((o) => o.net === wallet.net && o.secret).slice(0, 4);
  const links = listRequests().filter((r) => r.net === wallet.net).slice(0, 4);

  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <h1>Pay on delivery, without the cash.</h1>
          <p className="lead">
            Sellers send a payment link. The buyer's BCH stays locked until the parcel reaches them, then the seller is paid in seconds.
          </p>
          <a className="hero-setup" href="#setup" onClick={(e) => { e.preventDefault(); document.getElementById('setup')?.scrollIntoView({ behavior: 'smooth' }); }}>New to BCH? Set up a wallet in 2 minutes</a>
        </div>

        <div className="panel">
          <div className="seg seg-wide form-tabs" role="tablist" aria-label="Start">
            <button role="tab" aria-selected={mode === 'sell'} className={mode === 'sell' ? 'on' : ''} onClick={() => setMode('sell')}>Sell: create a link</button>
            <button role="tab" aria-selected={mode === 'try'} className={mode === 'try' ? 'on' : ''} onClick={() => setMode('try')}>Try it in 2 minutes</button>
          </div>
          {mode === 'sell' ? <SellForm /> : <TryForm />}
        </div>
      </section>

      {(links.length > 0 || recent.length > 0) && (
        <section className="container recent">
          {links.length > 0 && (
            <>
              <h2 className="section-title">Your payment links</h2>
              <ul className="recent-list">
                {links.map((r) => (
                  <li key={r.rid}>
                    <a href={`#/s/${r.code}`}>{r.item}</a>
                    <span className="hint">{new Date(r.created).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {recent.length > 0 && (
            <>
              <h2 className="section-title">Your purchases on this phone</h2>
              <ul className="recent-list">
                {recent.map((o) => {
                  let label = o.item;
                  try { label = decodeOrder(o.code).item; } catch { /* keep saved label */ }
                  return (
                    <li key={o.code}>
                      <a href={`#/o/${o.code}`}>{label}</a>
                      <span className="hint">{new Date(o.created).toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="container how">
        <h2 className="section-title">How a waybill settles</h2>
        <ol className="steps">
          <li>
            <span className="step-n mono">1</span>
            <div>
              <h3>Seller sends a link</h3>
              <p>Item, price and where to get paid. The buyer opens it on WhatsApp.</p>
            </div>
          </li>
          <li>
            <span className="step-n mono">2</span>
            <div>
              <h3>Buyer locks the money</h3>
              <p>It goes into a contract made for this one order. The seller's page turns to Locked by itself.</p>
            </div>
          </li>
          <li>
            <span className="step-n mono">3</span>
            <div>
              <h3>Rider brings the code</h3>
              <p>The seller sends the waybill to the rider. At the door the buyer scans it, checks the parcel and confirms.</p>
            </div>
          </li>
          <li>
            <span className="step-n mono">4</span>
            <div>
              <h3>No parcel, no payment</h3>
              <p>Only the buyer can release the money. If the deadline passes, the refund can only go back to them.</p>
            </div>
          </li>
        </ol>
      </section>

      <Guide />
    </>
  );
}
