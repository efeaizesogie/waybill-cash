import { useMemo, useState } from 'react';
import { type Order, secretMatches } from '../lib/waybill';
import { useStatus } from '../lib/useStatus';
import { release, explorerTx } from '../lib/chain';
import { Ticket } from '../components/Ticket';
import { formatBch } from '../lib/price';

/** Opened by scanning the buyer's code at the door. Anyone may press the button; the money can only go to the seller. */
export function HandoverPage({ order: routeOrder, secret }: { order: Order | null; secret: Uint8Array | null }) {
  const parsed = useMemo(
    () => (routeOrder && secret ? { order: routeOrder, bin: secret, valid: secretMatches(routeOrder, secret) } : null),
    [routeOrder, secret],
  );
  const order = parsed?.order ?? null;
  const { status, refresh } = useStatus(order);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!parsed || !parsed.valid || !order) {
    return (
      <section className="container narrow">
        <div className="panel">
          <h1 className="page-title">This code doesn't match the order</h1>
          <p>Ask the buyer to show the code again from their Waybill page. Do not hand over the parcel yet.</p>
        </div>
      </section>
    );
  }

  const confirm = async () => {
    if (status.kind !== 'locked') return;
    setBusy(true);
    setErr(null);
    try {
      await release(order, status.utxo, parsed.bin);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const kind = status.kind;
  return (
    <section className="container narrow order-page">
      <h1 className="page-title">Handover</h1>
      <Ticket order={order} status={kind === 'error' ? 'error' : kind} height={status.kind === 'locked' ? status.height : undefined}>
        {kind === 'loading' && <div className="skeleton" aria-label="Loading" />}
        {kind === 'error' && (
          <div className="stub-block">
            <p>Can't reach the network. Keep the parcel until this works.</p>
            <button className="btn btn-quiet" onClick={refresh}>Try again</button>
          </div>
        )}
        {kind === 'waiting' && (
          <div className="stub-block">
            <p>No money is locked for this order. Do not hand over the parcel.</p>
          </div>
        )}
        {kind === 'locked' && (
          <div className="stub-block">
            <p className="stub-lead">The code is valid. Confirming pays the seller {formatBch(Number(status.utxo.satoshis) - 500)}.</p>
            <button className="btn btn-primary btn-block" onClick={confirm} disabled={busy}>
              {busy ? 'Paying the seller' : 'Confirm handover and pay seller'}
            </button>
          </div>
        )}
        {kind === 'released' && (
          <div className="stub-block">
            <p className="stub-lead">Paid. The parcel can be handed over.</p>
            <a className="btn btn-quiet" href={explorerTx(order.net, status.txid)} target="_blank" rel="noreferrer">View the transaction</a>
          </div>
        )}
        {kind === 'refunded' && (
          <div className="stub-block">
            <p>This order was refunded to the buyer after the deadline. It can't be paid any more.</p>
          </div>
        )}
        {err && <p className="form-error" role="alert">{err}</p>}
      </Ticket>
    </section>
  );
}
