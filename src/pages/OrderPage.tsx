import { useMemo } from 'react';
import { decodeOrder, decodeWaybill } from '../lib/waybill';
import { OrderView } from '../components/OrderView';

function Broken({ message }: { message: string }) {
  return (
    <section className="container narrow">
      <div className="panel">
        <h1 className="page-title">This link doesn't open a waybill</h1>
        <p>{message} Ask the sender to copy it again.</p>
        <a className="btn btn-primary" href="#/">Go to Waybill</a>
      </div>
    </section>
  );
}

/** The buyer's own page (#/o/), from the long order link saved on their phone. */
export function OrderPage({ code }: { code: string }) {
  const order = useMemo(() => { try { return decodeOrder(code); } catch { return null; } }, [code]);
  if (!order) return <Broken message="This waybill link is broken." />;
  return (
    <section className="container narrow order-page">
      <h1 className="page-title">Your waybill</h1>
      <OrderView order={order} />
    </section>
  );
}

/** The shareable waybill (#/w/): what the seller sends the rider and the code the buyer scans at the door. */
export function WaybillPage({ code }: { code: string }) {
  const order = useMemo(() => { try { return decodeWaybill(code); } catch { return null; } }, [code]);
  if (!order) return <Broken message="This waybill code is broken." />;
  return (
    <section className="container narrow order-page">
      <h1 className="page-title">Waybill</h1>
      <OrderView order={order} fromScan />
    </section>
  );
}
