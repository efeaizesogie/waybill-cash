import { createContext, useContext } from 'react';
import type { useWizardConnect } from '@wizardconnect/react';
import type { Net } from './waybill';

type Wc = ReturnType<typeof useWizardConnect>;
export interface WalletCtx extends Wc {
  net: Net;
  openConnect: () => void;
  openScanner: () => void;
}

export const WalletContext = createContext<WalletCtx | null>(null);
export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('WalletContext missing');
  return ctx;
}
