import { useState } from 'react';
import { SLIDES_URL, REPO_URL, EMBER_ADDRESS } from '../lib/config';

/** Required BCH BLAZE 2026 banner: slides, repo, EMBER2026 vote address. */
export function Banner() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EMBER_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the address is selectable */
    }
  };
  return (
    <div className="banner" role="region" aria-label="BCH BLAZE 2026 entry">
      <div className="container banner-row">
        <span className="banner-title">BCH BLAZE 2026 entry</span>
        <a href={SLIDES_URL} target="_blank" rel="noreferrer">Slides</a>
        <a href={REPO_URL} target="_blank" rel="noreferrer">Repo</a>
        <span className="banner-vote">
          EMBER2026 votes:{' '}
          <span className="banner-addr" title={EMBER_ADDRESS} aria-label={EMBER_ADDRESS}>
            {EMBER_ADDRESS.split(':')[1].slice(0, 6)}…{EMBER_ADDRESS.slice(-5)}
          </span>{' '}
          <button type="button" className="banner-copy" onClick={copy} aria-label="Copy the full EMBER2026 vote address">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </div>
    </div>
  );
}
