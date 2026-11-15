import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../lib/walletContext';
import { buyerIdentity } from '../lib/wallet';
import { claimTestCoins, faucetBalance, nextClaimAt, FAUCET_SATS, type FaucetStep } from '../lib/faucet';
import { explorerTx } from '../lib/chain';
import { friendlyError } from '../lib/errors';
import { formatBch } from '../lib/price';
import { Progress, ErrorNote } from './Progress';

const STEPS: { key: FaucetStep; label: string }[] = [
  { key: 'check', label: 'Checking the faucet' },
  { key: 'sign', label: 'Preparing your test coins' },
  { key: 'send', label: 'Sending them to your wallet' },
];

/** One-tap Chipnet test coins for judges and first-time users. */
export function FaucetDialog({ onClose }: { onClose: () => void }) {
  const wallet = useWallet();
  const connected = wallet.state === 'connected' && !!wallet.manager;
  const walletAddress = useMemo(() => {
    if (!connected || !wallet.manager) return '';
    try {
      return buyerIdentity(wallet.manager, 'chipnet').address;
    } catch {
      return '';
    }
  }, [connected, wallet.manager]);
  const [address, setAddress] = useState(walletAddress);
  useEffect(() => {
    if (walletAddress) setAddress((a) => a || walletAddress);
  }, [walletAddress]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [step, setStep] = useState<FaucetStep | null>(null);
  const [txid, setTxid] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const wait = nextClaimAt();

  useEffect(() => {
    if (wallet.net !== 'chipnet') return;
    faucetBalance().then(setBalance).catch(() => setBalance(null));
  }, [wallet.net, txid]);

  async function claim() {
    setError(null);
    try {
      const id = await claimTestCoins(address.trim(), setStep);
      setTxid(id);
      window.dispatchEvent(new Event('waybill:funded'));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setStep(null);
    }
  }

  const i = step ? STEPS.findIndex((s) => s.key === step) : -1;

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Free test coins" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="scanner-panel">
        <div className="scanner-head">
          <h2 className="panel-title">Free test coins</h2>
          <button className="btn btn-quiet" onClick={onClose}>Close</button>
        </div>

        {wallet.net !== 'chipnet' ? (
          <>
            <p>Test coins work on Chipnet, Bitcoin Cash's test network. They have no value, so you can try every step of Waybill for free.</p>
            <a className="btn btn-primary btn-block" href={`${location.pathname}?net=chipnet&faucet=1`}>Switch to Chipnet and get coins</a>
          </>
        ) : txid ? (
          <>
            <p className="stub-lead">Sent {formatBch(FAUCET_SATS).replace(' BCH', '')} test BCH. It shows in your wallet within a few seconds.</p>
            <a className="btn btn-quiet" href={explorerTx('chipnet', txid)} target="_blank" rel="noreferrer">View the transaction</a>
            <button className="btn btn-primary btn-block" onClick={onClose}>Done, back to Waybill</button>
          </>
        ) : (
          <>
            <p>
              Get {formatBch(FAUCET_SATS).replace(' BCH', '')} test BCH on Chipnet, enough for several tries. Your wallet must be on Chipnet too: in Paytaca, Settings, then Use Chipnet Network. In Cashonize, Settings, then Network.
            </p>
            <label className="field">
              <span>Your Chipnet address</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="bchtest:q…" spellCheck={false} autoCapitalize="off" disabled={!!step} />
              {walletAddress && address === walletAddress ? (
                <span className="hint">Filled in from your connected wallet.</span>
              ) : !connected ? (
                <span className="hint">
                  Paste it from your wallet's Receive screen, or{' '}
                  <button type="button" className="link-btn" onClick={wallet.openConnect}>connect your wallet</button>.
                </span>
              ) : null}
            </label>
            {step && i >= 0 ? (
              <Progress steps={STEPS.map((s) => s.label)} current={i} label={STEPS[i].label} />
            ) : (
              <button className="btn btn-primary btn-block" onClick={claim} disabled={!address.trim() || !!wait || (balance !== null && balance < FAUCET_SATS + 400n)}>
                {wait ? `Next claim after ${new Date(wait).toLocaleTimeString()}` : 'Send me test coins'}
              </button>
            )}
            {error && <ErrorNote message={error.message} detail={error.detail} />}
            {balance !== null && balance < FAUCET_SATS + 400n ? (
              <p className="hint">
                This faucet is empty right now. Get coins from the public Chipnet faucet instead:{' '}
                <a href="https://tbch.googol.cash/" target="_blank" rel="noreferrer">tbch.googol.cash</a>
              </p>
            ) : (
              <p className="hint mono">{balance === null ? 'Checking the faucet' : `Faucet holds ${formatBch(balance)}`}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
