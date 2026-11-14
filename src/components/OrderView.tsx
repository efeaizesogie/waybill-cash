import { useMemo, useState } from 'react';
import { type Order, decodeOrder, decodeSecret, secretMatches, encodeHandover, encodeWaybill } from '../lib/waybill';
import { useWallet } from '../lib/walletContext';
import { secretFor } from '../lib/store';
import { useStatus } from '../lib/useStatus';
import { refund, release, explorerTx } from '../lib/chain';
import { Ticket } from './Ticket';
import { Qr } from './Qr';
import { formatBch } from '../lib/price';

export const pageBase = () => location.href.split('#')[0];

/**
 * One order, three people. The buyer (the only one holding the release code, saved on their phone)
 * confirms delivery. The seller and the rider show the waybill code for the buyer to scan, or scan
 * the buyer's code. Nobody but the buyer can release the money, and it can only go to the seller.
 */
export function OrderView({ order, fromScan = false }: { order: Order; fromScan?: boolean }) {
  const { openScanner } = useWallet();
  const { status, refresh } = useStatus(order);
  const secret = useMemo(() => {
    const s = secretFor(order.releaseHash, decodeOrder);
    return s && secretMatches(order, decodeSecret(s)) ? decodeSecret(s) : undefined;
  }, [order]);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showWaybill, setShowWaybill] = useState(fromScan);

  const isBuyer = !!secret;
  const kind = status.kind;
  const height = status.kind === 'locked' ? status.height : undefined;
  const refundable = status.kind === 'locked' && status.height >= order.refundAfter;
  const utxo = status.kind === 'locked' ? status.utxo : null;
  const payout = utxo ? formatBch(Number(utxo.satoshis) - 500) : '';
  const waybillLink = `${pageBase()}#/w/${encodeWaybill(order)}`;
  const handoverLink = secret ? `${pageBase()}#/x/${encodeHandover(order, secret)}` : '';

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied('Copy blocked. Long-press the link instead.');
    }
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  const riderText = encodeURIComponent(`Waybill for "${order.item}". At delivery, open this and let the buyer scan the code on your screen: ${waybillLink}`);
  const sellerText = encodeURIComponent(`I've locked the payment for "${order.item}" on Waybill. It's yours when I receive the parcel: ${waybillLink}`);

  return (
    <Ticket order={order} status={kind === 'error' ? 'error' : kind} height={height}>
      {kind === 'loading' && <div className="skeleton" aria-label="Loading" />}

      {kind === 'error' && (
        <div className="stub-block">
          <p>Can't reach the Bitcoin Cash network right now. The money is safe in the contract either way.</p>
          <button className="btn btn-quiet" onClick={refresh}>Try again</button>
        </div>
      )}

      {kind === 'waiting' && (
        <div className="stub-block">
          <p>{isBuyer ? 'Waiting for your lock transaction to show up. This takes a few seconds.' : 'The buyer has not locked the money yet. Do not dispatch until this says locked.'}</p>
        </div>
      )}

      {/* ---------- buyer ---------- */}
      {kind === 'locked' && isBuyer && !refundable && (
        <div className="stub-block">
          {showCode ? (
            <>
              <Qr value={handoverLink} size={300} ecc="L" label="Your handover code. Scanning it pays the seller." />
              <p className="stub-lead">Scanning this pays the seller {payout}. Only show it once you have the parcel.</p>
              <p className="hint">The rider scans it with Waybill's Scan code button or their camera app. Turn your brightness up.</p>
              <button className="btn btn-quiet" onClick={() => setShowCode(false)}>Hide my code</button>
            </>
          ) : confirming ? (
            <>
              <p className="stub-lead">Pay the seller {payout} now? Only do this once the parcel is in your hands.</p>
              <div className="stub-actions">
                <button className="btn btn-primary" disabled={!!busy} onClick={() => run('Paying the seller', () => release(order, utxo!, secret!))}>
                  {busy ?? 'Yes, pay the seller'}
                </button>
                <button className="btn btn-quiet" disabled={!!busy} onClick={() => setConfirming(false)}>Not yet</button>
              </div>
            </>
          ) : (
            <>
              <p className="stub-lead">
                {fromScan ? 'This is your order. Check the parcel, then confirm to pay the seller.' : 'At the door, check the parcel, then confirm here. The seller is paid in seconds.'}
              </p>
              <button className="btn btn-primary btn-block" onClick={() => setConfirming(true)}>I have the parcel, pay the seller</button>
              <div className="stub-actions">
                <button className="btn btn-quiet" onClick={openScanner}>Scan the rider's code</button>
                <button className="btn btn-quiet" onClick={() => setShowCode(true)}>Show my code</button>
              </div>
              {!order.rid && !fromScan && (
                <div className="stub-actions">
                  <a className="btn btn-quiet" href={`https://wa.me/?text=${sellerText}`} target="_blank" rel="noreferrer">Send to seller on WhatsApp</a>
                  <button className="btn btn-quiet" onClick={() => copy(waybillLink, 'Seller link copied')}>Copy seller link</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------- seller or rider ---------- */}
      {kind === 'locked' && !isBuyer && !refundable && (
        <div className="stub-block">
          <p className="stub-lead">Locked. Only the buyer can release it, and it can only go to the seller.</p>
          {showWaybill ? (
            <>
              <Qr value={waybillLink} size={280} ecc="L" label="Waybill code for the buyer to scan" />
              <p className="hint">At the door, the buyer scans this with Waybill's Scan code button and confirms. Hand over the parcel when this screen says Paid.</p>
              <button className="btn btn-quiet" onClick={() => setShowWaybill(false)}>Hide code</button>
            </>
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => setShowWaybill(true)}>Show code to the buyer</button>
          )}
          <div className="stub-actions">
            <button className="btn btn-quiet" onClick={openScanner}>Scan the buyer's code</button>
            <a className="btn btn-quiet" href={`https://wa.me/?text=${riderText}`} target="_blank" rel="noreferrer">Send to rider</a>
            <button className="btn btn-quiet" onClick={() => copy(waybillLink, 'Rider link copied')}>Copy rider link</button>
          </div>
          {fromScan && <p className="hint">Paid for this order? Open it with Scan code in the browser you paid from, so it can find your code.</p>}
        </div>
      )}

      {refundable && (
        <div className="stub-block">
          <p>The delivery deadline has passed. Anyone can now return the money to the buyer.</p>
          <button className="btn btn-quiet" onClick={() => run('Refunding', () => refund(order, utxo!))} disabled={!!busy}>
            {busy ?? 'Refund the buyer'}
          </button>
        </div>
      )}

      {(kind === 'released' || kind === 'refunded') && (
        <div className="stub-block">
          <p className="stub-lead">
            {kind === 'released' ? (isBuyer ? 'Done. The seller has been paid.' : 'Paid. Hand over the parcel.') : 'The buyer has their money back.'}
          </p>
          <a className="btn btn-quiet" href={explorerTx(order.net, status.txid)} target="_blank" rel="noreferrer">View the transaction</a>
        </div>
      )}

      {err && <p className="form-error" role="alert">{err}</p>}
      {copied && <p className="hint" role="status">{copied}</p>}
      {isBuyer && kind === 'locked' && (
        <p className="hint">
          Your release code is saved on this phone only.{' '}
          <button className="link-btn" onClick={() => copy(handoverLink, 'Private backup copied. Keep it secret.')}>Copy a private backup</button>
        </p>
      )}
    </Ticket>
  );
}
