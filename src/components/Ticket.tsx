import type { ReactNode } from 'react';
import type { Order } from '../lib/waybill';
import { addressFromPkh } from '../lib/waybill';
import { formatBch } from '../lib/price';
import type { Status } from '../lib/chain';
import { blocksToTime } from '../lib/chain';

const short = (a: string) => {
  const body = a.split(':')[1] ?? a;
  return `${body.slice(0, 6)}…${body.slice(-5)}`;
};

const STATUS_TEXT: Record<Status['kind'] | 'loading' | 'error', string> = {
  loading: 'Checking the chain',
  error: 'Could not reach the network',
  waiting: 'Not paid yet',
  locked: 'Locked until delivery',
  released: 'Delivered, seller paid',
  refunded: 'Refunded to buyer',
};

/** The signature object: a parcel waybill whose stub tears off when the money moves. */
export function Ticket({ order, status, height, children }: {
  order: Order;
  status: Status['kind'] | 'loading' | 'error';
  height?: number;
  children?: ReactNode;
}) {
  const ref = order.releaseHash.slice(0, 4).toUpperCase() + '-' + order.releaseHash.slice(4, 8).toUpperCase();
  const blocksLeft = height ? order.refundAfter - height : undefined;
  return (
    <article className={`ticket ticket-${status}`} aria-live="polite">
      <div className="ticket-main">
        <div className="ticket-head">
          <span className="ticket-ref mono">WB {ref}</span>
          <span className={`ticket-state state-${status}`}>{STATUS_TEXT[status]}</span>
        </div>
        <h2 className="ticket-item">{order.item}</h2>
        <p className="ticket-amount">
          {order.price && <span className="ticket-price">{order.price}</span>}
          <span className="mono ticket-bch">{formatBch(order.sats)}</span>
        </p>
        <dl className="ticket-rows">
          <div>
            <dt>Pays seller</dt>
            <dd className="mono">{short(addressFromPkh(order.sellerPkh, order.net))}</dd>
          </div>
          <div>
            <dt>Refunds buyer</dt>
            <dd className="mono">{short(addressFromPkh(order.buyerPkh, order.net))}</dd>
          </div>
          <div>
            <dt>Refund opens</dt>
            <dd className="mono">
              block {order.refundAfter.toLocaleString()}
              {blocksLeft !== undefined && status === 'locked' && (
                <span className="ticket-left"> {blocksLeft > 0 ? `in about ${blocksToTime(blocksLeft)}` : 'now'}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
      <div className="ticket-tear" aria-hidden="true" />
      <div className="ticket-stub">{children}</div>
    </article>
  );
}
