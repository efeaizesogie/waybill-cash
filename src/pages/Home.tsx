import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../lib/walletContext';
import { type Currency, type Rates, getRates, toSats, formatMoney, formatBch } from '../lib/price';
import { type Order, newSecret, hashSecret, encodeSecret, pkhFromAddress, netFromAddress, makeContract, MAX_FEE, decodeOrder } from '../lib/waybill';
import { provider } from '../lib/chain';
import { buyerIdentity, lockFunds, scanWallet } from '../lib/wallet';
import { saveOrder, listOrders } from '../lib/store';
import { binToHex, hash160 } from '@bitauth/libauth';
import { Guide } from '../components/Guide';

const WINDOWS = [
  { blocks: 12, label: '2 hours (demo)' },
  { blocks: 144, label: '1 day' },
  { blocks: 432, label: '3 days' },
  { blocks: 1008, label: '7 days' },
];
const MIN_SATS = 2000;

export function Home() {
  const wallet = useWallet();
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState<Currency>('NGN');
  const [sellerMode, setSellerMode] = useState<'self' | 'address'>('self');
  const [sellerAddress, setSellerAddress] = useState('');
  const [windowBlocks, setWindowBlocks] = useState(12);
  const [rates, setRates] = useState<Rates | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRates().then((r) => {
      setRates(r);
      if (!r) setCur('BCH');
    });
  }, []);

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

  const sats = useMemo(() => toSats(parseFloat(amount), cur, rates), [amount, cur, rates]);
  const tooSmall = sats !== null && sats < MIN_SATS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!connected || !wallet.manager) {
      wallet.openConnect();
      return;
    }
    if (!item.trim()) return setError('Say what you are buying, so the seller recognises the order.');
    if (!sats || tooSmall) return setError(`Enter an amount of at least ${formatBch(MIN_SATS)}.`);
    try {
      const manager = wallet.manager;
      const buyer = buyerIdentity(manager, wallet.net);
      let sellerPkh: string;
      if (sellerMode === 'self') {
        const pub = manager.getPubkey(0, 1n) ?? manager.getPubkey(0, 0n)!;
        sellerPkh = binToHex(hash160(pub));
      } else {
        if (netFromAddress(sellerAddress) !== wallet.net) throw new Error(`That address is not a ${wallet.net} address.`);
        sellerPkh = pkhFromAddress(sellerAddress);
      }
      setBusy('Reading the chain');
      const height = await provider(wallet.net).getBlockHeight();
      const secret = newSecret();
      const order: Order = {
        v: 1,
        net: wallet.net,
        buyerPkh: buyer.pkh,
        sellerPkh,
        releaseHash: hashSecret(secret),
        refundAfter: height + windowBlocks,
        maxFee: MAX_FEE,
        sats,
        item: item.trim().slice(0, 80),
        price: cur === 'BCH' ? undefined : formatMoney(parseFloat(amount), cur),
        created: Date.now(),
      };
      // Keep the code before anything is signed, so it can never be lost after paying.
      saveOrder(order, encodeSecret(secret));
      const contract = makeContract(order, provider(wallet.net));
      setBusy('Approve the lock in your wallet');
      const txid = await lockFunds({ manager, net: wallet.net, contractAddress: contract.address, sats: BigInt(sats), itemLabel: order.item });
      const code = saveOrder({ ...order, fundTxid: txid }, encodeSecret(secret));
      location.hash = `#/o/${code}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const recent = listOrders().filter((o) => o.net === wallet.net).slice(0, 4);

  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <h1>Pay on delivery, without the cash.</h1>
          <p className="lead">
            Lock BCH for an order. The seller is paid the moment you show your code at the door. No delivery, the money comes back to you.
          </p>
          <a className="hero-setup" href="#setup" onClick={(e) => { e.preventDefault(); document.getElementById('setup')?.scrollIntoView({ behavior: 'smooth' }); }}>New to BCH? Set up a wallet in 2 minutes</a>
        </div>

        <form className="panel order-form" onSubmit={submit} noValidate>
          <h2 className="panel-title">New waybill</h2>
          <label className="field">
            <span>What are you buying?</span>
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Ankara two-piece, size M" maxLength={80} required />
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
              {sats ? `Locks ${formatBch(sats)}${tooSmall ? `, below the ${formatBch(MIN_SATS)} minimum` : ''}` : rates ? 'Converted at the live BCH price' : 'Live price unavailable, enter BCH'}
            </span>
          </div>

          <fieldset className="field">
            <legend>Who gets paid</legend>
            <div className="seg seg-wide" role="radiogroup" aria-label="Seller">
              <button type="button" role="radio" aria-checked={sellerMode === 'self'} className={sellerMode === 'self' ? 'on' : ''} onClick={() => setSellerMode('self')}>
                Try it: pay myself
              </button>
              <button type="button" role="radio" aria-checked={sellerMode === 'address'} className={sellerMode === 'address' ? 'on' : ''} onClick={() => setSellerMode('address')}>
                A seller's address
              </button>
            </div>
            {sellerMode === 'address' ? (
              <input aria-label="Seller BCH address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} placeholder={wallet.net === 'mainnet' ? 'bitcoincash:q…' : 'bchtest:q…'} spellCheck={false} autoCapitalize="off" />
            ) : (
              <span className="hint">The seller is a second address in your own wallet, so a test only costs network fees.</span>
            )}
          </fieldset>

          <label className="field">
            <span>Refund me if it hasn't arrived in</span>
            <select value={windowBlocks} onChange={(e) => setWindowBlocks(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.blocks} value={w.blocks}>{w.label}</option>
              ))}
            </select>
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={!!busy}>
            {busy ?? (connected ? `Lock ${sats ? formatBch(sats) : 'payment'}` : 'Connect wallet to lock')}
          </button>
          {connected && balance !== null && <span className="hint mono">Wallet balance {formatBch(balance)}</span>}
        </form>
      </section>

      {recent.length > 0 && (
        <section className="container recent">
          <h2 className="section-title">Your waybills on this phone</h2>
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
        </section>
      )}

      <section className="container how">
        <h2 className="section-title">How a waybill settles</h2>
        <ol className="steps">
          <li>
            <span className="step-n mono">1</span>
            <div>
              <h3>You lock the money</h3>
              <p>Your wallet sends BCH into a contract made for this one order. Nobody, including us, can spend it freely.</p>
            </div>
          </li>
          <li>
            <span className="step-n mono">2</span>
            <div>
              <h3>The seller sees it's real</h3>
              <p>Send them the seller link. They see the money locked to their address before they dispatch.</p>
            </div>
          </li>
          <li>
            <span className="step-n mono">3</span>
            <div>
              <h3>Code at the door</h3>
              <p>Check the parcel, then let the rider scan your code. The contract pays the seller in seconds.</p>
            </div>
          </li>
          <li>
            <span className="step-n mono">4</span>
            <div>
              <h3>No parcel, no payment</h3>
              <p>If the deadline passes without a handover, anyone can trigger the refund, and it can only go back to you.</p>
            </div>
          </li>
        </ol>
      </section>

      <Guide />
    </>
  );
}
