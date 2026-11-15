import { useEffect, useMemo, useState } from 'react';
import { scanWallet } from '../lib/wallet';
import { decodeRequest, addressFromPkh } from '../lib/waybill';
import { useWallet } from '../lib/walletContext';
import { useLock, LockProgress } from '../components/LockProgress';
import { ErrorNote } from '../components/Progress';
import { orderForRequest } from '../lib/store';
import { formatBch } from '../lib/price';
import { blocksToTime } from '../lib/chain';

/** A seller's payment link (#/r/), opened by the buyer. The buyer checks who gets paid and locks. */
export function RequestPage({ code }: { code: string }) {
  const wallet = useWallet();
  const req = useMemo(() => { try { return decodeRequest(code); } catch { return null; } }, [code]);
  const lock = useLock();
  const [balance, setBalance] = useState<bigint | null>(null);
  const isConnected = wallet.state === 'connected' && !!wallet.manager;
  const [funded, setFunded] = useState(0);
  useEffect(() => {
    const on = () => setTimeout(() => setFunded((n) => n + 1), 3000);
    window.addEventListener('waybill:funded', on);
    return () => window.removeEventListener('waybill:funded', on);
  }, []);
  useEffect(() => {
    if (!isConnected || !wallet.manager || !req) return;
    let alive = true;
    scanWallet(wallet.manager, req.net).then((r) => alive && setBalance(r.balance)).catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [isConnected, wallet.manager, req, funded]);

  if (!req) {
    return (
      <section className="container narrow">
        <div className="panel">
          <h1 className="page-title">This payment link is broken</h1>
          <p>Ask the seller to send it again.</p>
        </div>
      </section>
    );
  }

  const existing = orderForRequest(req.rid);
  const seller = addressFromPkh(req.sellerPkh, req.net);
  const connected = wallet.state === 'connected' && !!wallet.manager;
  const wrongNet = req.net !== wallet.net;
  const fixNetHref = `${location.pathname}${req.net === 'chipnet' ? '?net=chipnet' : ''}${location.hash}`;

  async function pay() {
    if (!connected || !wallet.manager) return wallet.openConnect();
    const orderCode = await lock.run({
      manager: wallet.manager,
      net: req!.net,
      sellerPkh: req!.sellerPkh,
      sats: req!.sats,
      item: req!.item,
      price: req!.price,
      windowBlocks: req!.windowBlocks,
      rid: req!.rid,
    });
    if (orderCode) location.hash = `#/o/${orderCode}`;
  }

  return (
    <section className="container narrow order-page">
      <h1 className="page-title">Pay on delivery</h1>
      <article className="ticket">
        <div className="ticket-main">
          <div className="ticket-head">
            <span className="ticket-ref mono">Payment link</span>
            <span className="ticket-state state-waiting">Not paid yet</span>
          </div>
          <h2 className="ticket-item">{req.item}</h2>
          <p className="ticket-amount">
            {req.price && <span className="ticket-price">{req.price}</span>}
            <span className="mono ticket-bch">{formatBch(req.sats)}</span>
          </p>
          <dl className="ticket-rows">
            <div>
              <dt>You're paying</dt>
              <dd className="mono">{seller.split(':')[1].slice(0, 8)}…{seller.slice(-6)}</dd>
            </div>
            <div>
              <dt>Refund if not delivered in</dt>
              <dd className="mono">about {blocksToTime(req.windowBlocks)}</dd>
            </div>
          </dl>
        </div>
        <div className="ticket-tear" aria-hidden="true" />
        <div className="ticket-stub">
          <div className="stub-block">
            {existing ? (
              <>
                <p className="stub-lead">You already locked this payment on this phone.</p>
                <a className="btn btn-primary btn-block" href={`#/o/${existing}`}>Open your waybill</a>
              </>
            ) : wrongNet ? (
              <>
                <p>This link uses {req.net === 'chipnet' ? 'Chipnet test coins' : 'real BCH'}.</p>
                <a className="btn btn-primary btn-block" href={fixNetHref}>Switch and continue</a>
              </>
            ) : (
              <>
                <p className="stub-lead">Your money is locked, not sent. The seller only gets it when you confirm the parcel arrived.</p>
                {lock.step ? (
                  <LockProgress step={lock.step} />
                ) : (
                  <button className="btn btn-primary btn-block" onClick={pay}>
                    {connected ? `Lock ${req.price ?? formatBch(req.sats)}` : 'Connect wallet to pay'}
                  </button>
                )}
                {lock.error && <ErrorNote message={lock.error.message} detail={lock.error.detail} />}
                {connected && balance !== null && (
                  <p className={`hint mono ${balance < BigInt(req.sats) ? 'hint-bad' : ''}`}>
                    Your wallet: {formatBch(balance)} {req.net === 'chipnet' ? '(Chipnet)' : ''}
                    {balance < BigInt(req.sats) ? ', not enough for this order' : ''}
                  </p>
                )}
                {req.net === 'chipnet' && ((balance !== null && balance < BigInt(req.sats) + 2000n) || lock.error?.message.startsWith('Not enough')) && (
                  <button type="button" className="btn btn-quiet" onClick={wallet.openFaucet}>Get free test coins</button>
                )}
                <p className="hint">
                  {req.v === 2 && "You pay the listed price. Waybill's 0.5% fee comes out of the seller's side, only when you confirm delivery. "}Check the seller's address with them before paying: <span className="mono addr-full">{seller}</span>
                </p>
              </>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
