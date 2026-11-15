import { useEffect, useMemo, useState } from 'react';
import { type Order, secretMatches } from '../lib/waybill';
import { useStatus } from '../lib/useStatus';
import { release, explorerTx, SETTLE_STEPS, type SettleStep } from '../lib/chain';
import { friendlyError } from '../lib/errors';
import { Progress, ErrorNote } from '../components/Progress';
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
  const [step, setStep] = useState<SettleStep | 'confirm' | null>(null);
  const [err, setErr] = useState<{ message: string; detail?: string } | null>(null);
  useEffect(() => {
    if (status.kind === 'released' || status.kind === 'refunded') setStep(null);
  }, [status.kind]);

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
    setErr(null);
    setStep('build');
    try {
      await release(order, status.utxo, parsed.bin, setStep);
      setStep('confirm');
      refresh();
    } catch (e) {
      setStep(null);
      setErr(friendlyError(e));
    }
  };
  const stepIndex = step ? SETTLE_STEPS.findIndex((s) => s.key === step) : -1;
  const statusError = status.kind === 'error' ? friendlyError(status.message) : null;

  const kind = status.kind;
  return (
    <section className="container narrow order-page">
      <h1 className="page-title">Handover</h1>
      <Ticket order={order} status={kind === 'error' ? 'error' : kind} height={status.kind === 'locked' ? status.height : undefined}>
        {kind === 'loading' && <Progress label="Checking the code against the order on the network" />}
        {kind === 'error' && statusError && (
          <div className="stub-block">
            <ErrorNote message={statusError.message} detail={statusError.detail} onRetry={refresh} />
            <p className="hint">Keep the parcel until this works.</p>
          </div>
        )}
        {kind === 'waiting' && (
          <div className="stub-block">
            <p>No money is locked for this order. Do not hand over the parcel.</p>
          </div>
        )}
        {kind === 'locked' && (
          <div className="stub-block">
            {step && stepIndex >= 0 ? (
              <Progress
                steps={SETTLE_STEPS.map((s) => s.label)}
                current={stepIndex}
                label={SETTLE_STEPS[stepIndex].label}
                hint={step === 'confirm' ? 'Sent. This turns to Paid as soon as the network shows it.' : 'Keep the parcel until this says Paid.'}
              />
            ) : (
              <>
                <p className="stub-lead">The code is valid. Confirming pays the seller {formatBch(Number(status.utxo.satoshis) - 500)}.</p>
                <button className="btn btn-primary btn-block" onClick={confirm}>Confirm handover and pay seller</button>
              </>
            )}
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
        {err && <ErrorNote message={err.message} detail={err.detail} />}
      </Ticket>
    </section>
  );
}
