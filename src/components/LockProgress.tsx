import { useState } from 'react';
import { type LockStep, LOCK_STEPS, lockOrder } from '../lib/lock';
import { friendlyError } from '../lib/errors';
import { Progress } from './Progress';

type LockArgs = Omit<Parameters<typeof lockOrder>[0], 'onStep'>;

/** Runs a lock and tracks which step it is on, so the buyer can see what's happening. */
export function useLock() {
  const [step, setStep] = useState<LockStep | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  async function run(args: LockArgs): Promise<string | null> {
    setError(null);
    setStep('chain');
    try {
      return await lockOrder({ ...args, onStep: setStep });
    } catch (e) {
      setError(friendlyError(e));
      return null;
    } finally {
      setStep(null);
    }
  }
  return { step, error, run, clearError: () => setError(null) };
}

export function LockProgress({ step }: { step: LockStep }) {
  const i = Math.max(0, LOCK_STEPS.findIndex((s) => s.key === step));
  return <Progress steps={LOCK_STEPS.map((s) => s.label)} current={i} label={LOCK_STEPS[i].label} hint={LOCK_STEPS[i].hint} />;
}
