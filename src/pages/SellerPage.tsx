import { useEffect, useMemo, useState } from 'react';
import { type Order, decodeRequest } from '../lib/waybill';
import { findLockForRequest } from '../lib/chain';
import { OrderView, pageBase } from '../components/OrderView';
import { Qr } from '../components/Qr';
import { formatBch } from '../lib/price';

/**
 * The seller's page for a payment link (#/s/). Waits for the buyer's lock (found through the
 * doorbell output and note on the seller's own address), then becomes the order: send to rider,
 * show the code to the buyer, watch it turn to Paid.
 */
export function SellerPage({ code }: { code: string }) {
  const req = useMemo(() => { try { return decodeRequest(code); } catch { return null; } }, [code]);
  const [order, setOrder] = useState<Order | null>(null);
  const [checked, setChecked] = useState(false);
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
        if (hit) return setOrder(hit.order);
      } catch {
        if (alive) setChecked(true);
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

  const payLink = `${pageBase()}#/r/${code}`;
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
            </details>
          </div>
        </div>
      </article>
      <p className="hint backup">This page is saved on this phone under Your payment links.</p>
    </section>
  );
}
