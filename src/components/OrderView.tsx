import { useEffect, useMemo, useState } from 'react';
import { type Order, sellerPayout, decodeOrder, decodeSecret, secretMatches, encodeHandover, encodeWaybill } from '../lib/waybill';
import { useWallet } from '../lib/walletContext';
import { secretFor } from '../lib/store';
import { useStatus } from '../lib/useStatus';
import { refund, release, explorerTx, SETTLE_STEPS, type SettleStep } from '../lib/chain';
import { friendlyError } from '../lib/errors';
import { Progress, ErrorNote } from './Progress';
import { Ticket } from './Ticket';
import { Qr } from './Qr';
import { formatBch } from '../lib/price';
import { shareLink } from '../lib/links';



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
  const [settle, setSettle] = useState<{ what: 'pay' | 'refund'; step: SettleStep | 'confirm' } | null>(null);
  const [err, setErr] = useState<{ message: string; detail?: string } | null>(null);
  const busy = !!settle;
  const [confirming, setConfirming] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showWaybill, setShowWaybill] = useState(fromScan);

  const isBuyer = !!secret;
  const kind = status.kind;
  const height = status.kind === 'locked' ? status.height : undefined;
  const refundable = status.kind === 'locked' && status.height >= order.refundAfter;
  const utxo = status.kind === 'locked' ? status.utxo : null;
  const payout = utxo ? formatBch(sellerPayout(utxo.satoshis, order.v)) : '';
  const waybillLink = shareLink(`w/${encodeWaybill(order)}`);
  const handoverLink = secret ? shareLink(`x/${encodeHandover(order, secret)}`) : '';

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied('Copy blocked. Long-press the link instead.');
    }
  };

  // Settle (pay the seller or refund) with visible steps; stays on "confirm" until the chain shows it.
  const run = async (what: 'pay' | 'refund', fn: (onStep: (s: SettleStep) => void) => Promise<unknown>) => {
    setErr(null);
    setSettle({ what, step: 'build' });
    try {
      await fn((step) => setSettle({ what, step }));
      setSettle({ what, step: 'confirm' });
      refresh();
    } catch (e) {
      setSettle(null);
      setErr(friendlyError(e));
    } finally {
      setConfirming(false);
    }
  };
  useEffect(() => {
    if (status.kind === 'released' || status.kind === 'refunded') setSettle(null);
  }, [status.kind]);
  const settleIndex = settle ? SETTLE_STEPS.findIndex((s) => s.key === settle.step) : -1;
  const statusError = status.kind === 'error' ? friendlyError(status.message) : null;
  const SCAN_HINT = 'Scan it with Waybill’s Scan button or the phone’s camera app. A wallet app’s scanner can’t open it.';

  const riderText = encodeURIComponent(`Waybill for "${order.item}". At delivery, open this and let the buyer scan the code on your screen: ${waybillLink}`);
  const sellerText = encodeURIComponent(`I've locked the payment for "${order.item}" on Waybill. It's yours when I receive the parcel: ${waybillLink}`);

  return (
    <Ticket order={order} status={kind === 'error' ? 'error' : kind} height={height}>
      {kind === 'loading' && <Progress label="Reading this order from the Bitcoin Cash network" />}

      {kind === 'error' && statusError && (
        <div className="stub-block">
          <ErrorNote message={statusError.message} detail={statusError.detail} onRetry={refresh} />
          <p className="hint">The money is safe in the contract either way. This page keeps retrying.</p>
        </div>
      )}

      {kind === 'waiting' && !settle && (
        <div className="stub-block">
          {isBuyer ? (
            <Progress label="Waiting for the network to see your lock" hint="Usually a few seconds. This page updates by itself." />
          ) : (
            <Progress label="Waiting for the buyer to lock the money" hint="Do not dispatch until this says Locked. This page updates by itself." />
          )}
        </div>
      )}

      {settle && settleIndex >= 0 && (
        <div className="stub-block">
          <Progress
            steps={SETTLE_STEPS.map((s) => s.label)}
            current={settleIndex}
            label={settle.what === 'pay' ? `Paying the seller: ${SETTLE_STEPS[settleIndex].label.toLowerCase()}` : `Refunding the buyer: ${SETTLE_STEPS[settleIndex].label.toLowerCase()}`}
            hint={settle.step === 'confirm' ? 'Sent. This turns to Paid as soon as the network shows it, usually within seconds.' : undefined}
          />
        </div>
      )}

      {/* ---------- buyer ---------- */}
      {kind === 'locked' && isBuyer && !refundable && !settle && (
        <div className="stub-block">
          {showCode ? (
            <>
              <Qr value={handoverLink} size={300} ecc="L" label="Your handover code. Scanning it pays the seller." />
              <p className="stub-lead">Scanning this pays the seller {payout}. Only show it once you have the parcel.</p>
              <p className="hint">The rider scans it. {SCAN_HINT} Turn your brightness up.</p>
              <button className="btn btn-quiet" onClick={() => setShowCode(false)}>Hide my code</button>
            </>
          ) : confirming ? (
            <>
              <p className="stub-lead">Pay the seller {payout} now? Only do this once the parcel is in your hands.</p>
              <div className="stub-actions">
                <button className="btn btn-primary" disabled={busy} onClick={() => run('pay', (onStep) => release(order, utxo!, secret!, onStep))}>
                  Yes, pay the seller
                </button>
                <button className="btn btn-quiet" disabled={busy} onClick={() => setConfirming(false)}>Not yet</button>
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
      {kind === 'locked' && !isBuyer && !refundable && !settle && (
        <div className="stub-block">
          <p className="stub-lead">Locked. Only the buyer can release it, and it can only go to the seller.</p>
          {showWaybill ? (
            <>
              <Qr value={waybillLink} size={280} ecc="L" label="Waybill code for the buyer to scan" />
              <p className="hint">The buyer scans this on the phone they paid with, then confirms. {SCAN_HINT} Hand over the parcel when this screen says Paid.</p>
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

      {refundable && !settle && (
        <div className="stub-block">
          <p>The delivery deadline has passed. Anyone can now return the money to the buyer.</p>
          <button className="btn btn-quiet" onClick={() => run('refund', (onStep) => refund(order, utxo!, onStep))} disabled={busy}>
            Refund the buyer
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

      {err && <ErrorNote message={err.message} detail={err.detail} />}
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
