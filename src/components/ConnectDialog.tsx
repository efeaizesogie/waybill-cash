import { useState } from 'react';
import { AlphanumericQRCode } from '@wizardconnect/react';

/**
 * WizardConnect pairing, with a path for people who opened Waybill on the same phone as their wallet:
 * Cashonize accepts the link as ?uri=, Paytaca takes it via Apps → WizardConnect → Paste URL.
 */
export function ConnectDialog({ uri, qrUri, onClose }: { uri: string; qrUri: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Connect your BCH wallet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="scanner-panel connect-panel">
        <div className="scanner-head">
          <h2 className="panel-title">Connect your wallet</h2>
          <button className="btn btn-quiet" onClick={onClose}>Close</button>
        </div>

        <div className="connect-grid">
          <div className="connect-qr">
            <AlphanumericQRCode value={qrUri} size={220} foreground="#163300" background="#ffffff" />
            <p className="hint">
              Wallet on another device? In Paytaca tap the scan button (or Apps, then WizardConnect). In Cashonize open Connect and scan.
            </p>
          </div>

          <div className="connect-same">
            <h3 className="connect-sub">Wallet on this phone?</h3>
            <a className="btn btn-primary btn-block" href={`https://cashonize.com/?uri=${encodeURIComponent(uri)}`} target="_blank" rel="noreferrer">
              <img src="./wallets/cashonize.png" alt="" width="20" height="20" /> Open in Cashonize
            </a>
            <button className="btn btn-quiet btn-block" onClick={copy}>
              <img src="./wallets/paytaca.png" alt="" width="20" height="20" /> {copied ? 'Link copied' : 'Copy link for Paytaca'}
            </button>
            <p className="hint">
              {copied
                ? 'Now open Paytaca, go to Apps, then WizardConnect, tap Paste URL and Connect. Come back here after.'
                : 'Paytaca: copy the link, then in Paytaca go to Apps, WizardConnect, Paste URL.'}
            </p>
          </div>
        </div>
        <p className="hint">Waiting for your wallet to approve the connection. This page updates on its own.</p>
      </div>
    </div>
  );
}
