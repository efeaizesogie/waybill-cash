import { useEffect, useState, useCallback } from 'react';
import { type Order } from './waybill';
import { type Status, getStatus } from './chain';

export type Loaded = { kind: 'loading' } | { kind: 'error'; message: string } | Status;

/** Polls the contract address every few seconds until it settles. */
export function useStatus(order: Order | null) {
  const [status, setStatus] = useState<Loaded>({ kind: 'loading' });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!order) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const s = await getStatus(order);
        if (!alive) return;
        setStatus(s);
        if (s.kind === 'waiting' || s.kind === 'locked') timer = setTimeout(run, 6000);
      } catch (err) {
        if (!alive) return;
        setStatus((prev) => (prev.kind === 'loading' || prev.kind === 'error' ? { kind: 'error', message: String(err) } : prev));
        timer = setTimeout(run, 8000);
      }
    };
    run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [order, tick]);

  return { status, refresh };
}
