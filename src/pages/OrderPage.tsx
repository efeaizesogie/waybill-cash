import { useMemo, useState } from 'react';
import { decodeOrder, decodeSecret, secretMatches, encodeHandover } from '../lib/waybill';
import { useWallet } from '../lib/walletContext';
import { secretFor } from '../lib/store';
import { useStatus } from '../lib/useStatus';
import { refund, explorerTx } from '../lib/chain';
import { Ticket } from '../components/Ticket';
import { Qr } from '../components/Qr';
import { formatBch } from '../lib/price';

const pageBase = () => location.href.split('#')[0];

export function OrderPage({ code }: { code: string }) {
  const parsed = useMemo(() => {
    try {
      return { order: decodeOrder(code) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'This waybill link is broken.' };
    }
  }, [code]);
  const order = parsed.order ?? null;
  const { openScanner } = useWallet();
  const { status, refresh } = useStatus(order);
  const secret = useMemo(() => {
    if (!order) return undefined;
    const s = secretFor(order.releaseHash, decodeOrder);
    return s && secretMatches(order, decodeSecret(s)) ? s : undefined;
  }, [order]);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  if (!order) {
    return (
      <section className="container narrow">
        <div className="panel">
          <h1 className="page-title">This link doesn't open a waybill</h1>
          <p>{parsed.error} Ask the sender to copy it again.</p>
          <a className="btn btn-primary" href="#/">Make a new waybill</a>
        </div>
      </section>
    );
  }

  const sellerLink = `${pageBase()}#/o/${code}`;
  const handoverPath = secret && order ? `#/x/${encodeHandover(order, decodeSecret(secret))}` : '';
  const handoverLink = handoverPath ? `${pageBase()}${handoverPath}` : '';
  const isBuyer = !!secret;
  const kind = status.kind;
  const height = status.kind === 'locked' ? status.height : undefined;
  const refundable = status.kind === 'locked' && status.height >= order.refundAfter;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied('Copy blocked, long-press the link instead');
    }
  };

  const doRefund = async () => {
    if (status.kind !== 'locked') return;
    setBusy(true);
    setErr(null);
    try {
      await refund(order, status.utxo);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const waText = encodeURIComponent(`Your payment for "${order.item}" is locked on Waybill. It is yours when I receive the parcel: ${sellerLink}`);

  return (
    <section className="container narrow order-page">
      <h1 className="page-title">{isBuyer ? 'Your waybill' : 'Waybill for the seller'}</h1>

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

        {kind === 'locked' && isBuyer && (
          <div className="stub-block">
            {!showCode ? (
              <>
                <p className="stub-lead">At the door, check the parcel, then show the rider your code.</p>
                <button className="btn btn-primary btn-block" onClick={() => setShowCode(true)}>Show handover code</button>
                <div className="stub-actions">
                  <a className="btn btn-quiet" href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer">Send seller link on WhatsApp</a>
                  <button className="btn btn-quiet" onClick={() => copy(sellerLink, 'Seller link copied')}>Copy seller link</button>
                </div>
              </>
            ) : (
              <>
                <Qr value={handoverLink} size={340} ecc="L" label="Handover code. Scanning it pays the seller." />
                <p className="stub-lead">Scanning this pays the seller {formatBch(Number(status.utxo.satoshis) - 500)}. Only show it once you have the parcel.</p>
                <p className="hint">The rider or seller scans it with Waybill's Scan code button or their phone camera app. A wallet's scanner won't open it. Turn your screen brightness up.</p>
                <div className="stub-actions">
                  <button className="btn btn-quiet" onClick={() => setShowCode(false)}>Hide code</button>
                  <a className="btn btn-quiet" href={handoverPath}>I have the parcel, pay now</a>
                </div>
              </>
            )}
          </div>
        )}

        {kind === 'locked' && !isBuyer && (
          <div className="stub-block">
            <p className="stub-lead">The money is locked and can only go to your address. It is paid out when the buyer's code is scanned at delivery.</p>
            <button className="btn btn-primary btn-block" onClick={openScanner}>Scan the buyer's code</button>
            <p className="hint">At the door, scan the QR on the buyer's phone. It opens the handover screen and pays you in seconds. Your phone camera app works too.</p>
          </div>
        )}

        {refundable && (
          <div className="stub-block">
            <p>The delivery deadline has passed. Anyone can now return the money to the buyer.</p>
            <button className="btn btn-quiet" onClick={doRefund} disabled={busy}>{busy ? 'Refunding' : 'Refund the buyer'}</button>
          </div>
        )}

        {(kind === 'released' || kind === 'refunded') && (
          <div className="stub-block">
            <p className="stub-lead">{kind === 'released' ? 'Handover confirmed. The seller has been paid.' : 'The buyer has their money back.'}</p>
            <a className="btn btn-quiet" href={explorerTx(order.net, status.txid)} target="_blank" rel="noreferrer">View the transaction</a>
          </div>
        )}

        {err && <p className="form-error" role="alert">{err}</p>}
        {copied && <p className="hint" role="status">{copied}</p>}
      </Ticket>

      {isBuyer && kind !== 'released' && kind !== 'refunded' && (
        <p className="hint backup">
          Your code is saved on this phone only.{' '}
          <button className="link-btn" onClick={() => copy(handoverLink, 'Private code link copied. Keep it secret.')}>Copy a private backup</button>
        </p>
      )}
      {order.fundTxid && (
        <p className="hint backup">
          <a href={explorerTx(order.net, order.fundTxid)} target="_blank" rel="noreferrer">Lock transaction</a>
        </p>
      )}
    </section>
  );
}
