import { useEffect, useMemo, useState } from 'react';
import { type Order, decodeRequest } from '../lib/waybill';
import { findLockForRequest } from '../lib/chain';
import { OrderView } from '../components/OrderView';
import { shareLink } from '../lib/links';
import { Qr } from '../components/Qr';
import { formatBch } from '../lib/price';
import { Progress, ErrorNote } from '../components/Progress';
import { friendlyError } from '../lib/errors';

/**
 * The seller's page for a payment link (#/s/). Waits for the buyer's lock (found through the
 * doorbell output and note on the seller's own address), then becomes the order: send to rider,
 * show the code to the buyer, watch it turn to Paid.
 */
export function SellerPage({ code }: { code: string }) {
  const req = useMemo(() => { try { return decodeRequest(code); } catch { return null; } }, [code]);
  const [order, setOrder] = useState<Order | null>(null);
  const [checked, setChecked] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [checkError, setCheckError] = useState<{ message: string; detail?: string } | null>(null);
  const [found, setFound] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!req || order) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const hit = await findLockForRequest(req);
        if (!alive) return;
        setChecked(true);
        setLastCheck(Date.now());
        setCheckError(null);
        if (hit) {
          setFound(true);
          setTimeout(() => alive && setOrder(hit.order), 900);
          return;
        }
      } catch (e) {
        if (alive) {
          setChecked(true);
          setCheckError(friendlyError(e));
        }
      }
      if (alive) timer = setTimeout(run, 7000);
    };
    run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [req, order]);

  if (!req) {
    return (
      <section className="container narrow">
        <div className="panel"><h1 className="page-title">This link is broken</h1></div>
      </section>
    );
  }

  const payLink = shareLink(`r/${code}`);
  const waText = encodeURIComponent(`Pay for "${req.item}"${req.price ? ` (${req.price})` : ''} with Waybill. Your money stays locked until you receive it: ${payLink}`);

  if (order) {
    return (
      <section className="container narrow order-page">
        <h1 className="page-title">Your sale</h1>
        <OrderView order={order} />
      </section>
    );
  }

  return (
    <section className="container narrow order-page">
      <h1 className="page-title">Your payment link</h1>
      <article className="ticket">
        <div className="ticket-main">
          <div className="ticket-head">
            <span className="ticket-ref mono">Payment link</span>
            <span className="ticket-state state-waiting">{checked ? 'Waiting for the buyer' : 'Checking the chain'}</span>
          </div>
          <h2 className="ticket-item">{req.item}</h2>
          <p className="ticket-amount">
            {req.price && <span className="ticket-price">{req.price}</span>}
            <span className="mono ticket-bch">{formatBch(req.sats)}</span>
          </p>
        </div>
        <div className="ticket-tear" aria-hidden="true" />
        <div className="ticket-stub">
          <div className="stub-block">
            {found ? (
              <Progress steps={['Watching', 'Payment found', 'Opening the order']} current={2} label="The buyer paid. Opening your order" />
            ) : (
              <Progress
                label={checked ? 'Watching your address for the buyer’s payment' : 'Connecting to the Bitcoin Cash network'}
                hint={lastCheck ? `Last checked ${Math.max(0, Math.round((Date.now() - lastCheck) / 1000))}s ago. Checks again every few seconds.` : undefined}
              />
            )}
            {checkError && <ErrorNote message={checkError.message} detail={checkError.detail} />}
            <p className="stub-lead">Send this link to your buyer. This page turns to Locked by itself when they pay. Keep it open or come back later.</p>
            <a className="btn btn-primary btn-block" href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer">Send to buyer on WhatsApp</a>
            <div className="stub-actions">
              <button
                className="btn btn-quiet"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(payLink); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* long-press fallback */ }
                }}
              >
                {copied ? 'Link copied' : 'Copy payment link'}
              </button>
            </div>
            <details className="pay-qr">
              <summary>Buyer is with you? Show a QR</summary>
              <Qr value={payLink} size={240} ecc="L" label="Payment link for the buyer" />
              <p className="hint">The buyer scans it with their phone’s camera app or Waybill’s Scan button, not with their wallet app. It opens this payment page on their phone.</p>
            </details>
          </div>
        </div>
      </article>
      <p className="hint backup">This page is saved on this phone under Your payment links.</p>
    </section>
  );
}
