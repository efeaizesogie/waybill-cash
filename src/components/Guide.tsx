import { useState } from 'react';
import { useWallet } from '../lib/walletContext';
import { Qr } from './Qr';

const WALLETS = [
  {
    name: 'Paytaca',
    icon: './wallets/paytaca.png',
    note: 'Phone wallet with WizardConnect built in',
    links: [
      { label: 'Android', href: 'https://play.google.com/store/apps/details?id=com.paytaca.app' },
      { label: 'iPhone', href: 'https://apps.apple.com/app/paytaca/id1451795432' },
      { label: 'Chrome', href: 'https://chromewebstore.google.com/detail/paytaca/pakphhpnneopheifihmjcjnbdbhaaiaa' },
    ],
  },
  {
    name: 'Cashonize',
    icon: './wallets/cashonize.png',
    note: 'Runs in your browser, nothing to install',
    links: [
      { label: 'Open web wallet', href: 'https://cashonize.com/' },
      { label: 'Android or desktop', href: 'https://github.com/cashonize/cashonize-wallet/releases' },
    ],
  },
];

function WalletCards() {
  return (
    <div className="wallets">
      {WALLETS.map((w) => (
        <div className="wallet" key={w.name}>
          <img src={w.icon} alt="" width="44" height="44" />
          <div className="wallet-body">
            <strong>{w.name}</strong>
            <span className="hint">{w.note}</span>
            <span className="wallet-links">
              {w.links.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
              ))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Step({ n, title, children, visual }: { n: number; title: string; children: React.ReactNode; visual?: React.ReactNode }) {
  return (
    <li className="gstep">
      <span className="step-n mono">{n}</span>
      <div className="gstep-body">
        <h3>{title}</h3>
        {children}
      </div>
      {visual && <div className="gstep-visual">{visual}</div>}
    </li>
  );
}

/** Setup guide for first-time buyers and sellers: which wallet, how to fund it, how to connect, what to do at the door. */
export function Guide() {
  const [who, setWho] = useState<'buyer' | 'seller'>('seller');
  const { openScanner, net } = useWallet();
  return (
    <section className="container guide" id="setup">
      <div className="guide-head">
        <h2 className="section-title">Get set up</h2>
        <div className="seg" role="tablist" aria-label="Guide for">
          <button role="tab" aria-selected={who === 'seller'} className={who === 'seller' ? 'on' : ''} onClick={() => setWho('seller')}>I'm selling</button>
          <button role="tab" aria-selected={who === 'buyer'} className={who === 'buyer' ? 'on' : ''} onClick={() => setWho('buyer')}>I'm buying</button>
        </div>
      </div>

      {who === 'seller' ? (
        <ol className="gsteps">
          <Step n={1} title="Get a Bitcoin Cash wallet" visual={<WalletCards />}>
            <p>Install one of these and write down its recovery words. You don't need any BCH to start selling.</p>
          </Step>
          <Step
            n={2}
            title="Create a payment link"
            visual={<img className="shot" src="./guide/sell.webp" alt="The Sell form: what you are selling, the price, the refund deadline and your BCH address" width="320" height="424" loading="lazy" />}
          >
            <p>Use the Sell form at the top. Paste your address from your wallet's Receive screen (it starts with bitcoincash:q), then tap Create payment link and send it to the buyer on WhatsApp.</p>
          </Step>
          <Step
            n={3}
            title="Dispatch when it says Locked"
            visual={<img className="shot" src="./guide/ticket.webp" alt="A waybill ticket showing the item, the price, the seller and the refund deadline" width="360" height="268" loading="lazy" />}
          >
            <p>Keep your link's page open. It turns to Locked by itself when the buyer pays. The money is then held for you and the buyer can't pull it back before the deadline.</p>
          </Step>
          <Step
            n={4}
            title="Send the waybill to your rider"
            visual={
              <div className="mini-stub" aria-label="Example waybill code">
                <Qr value="https://efeaizesogie.github.io/waybill-cash/#/example" size={150} label="Example waybill code" />
                <span>Example</span>
              </div>
            }
          >
            <p>Tap Send to rider. The rider's link holds no key, so it can't move the money. At the door the rider shows its code, the buyer scans it and confirms, and the screen turns to Paid. Hand over the parcel then.</p>
          </Step>
        </ol>
      ) : (
        <ol className="gsteps">
          <Step n={1} title="Get a Bitcoin Cash wallet" visual={<WalletCards />}>
            <p>Install one of these. Write down the recovery words it shows you and keep them offline. They are the only way back into your money.</p>
          </Step>
          <Step n={2} title="Add some BCH">
            <p>In the wallet tap Receive and copy your address. Ask a friend to send you BCH, or buy some (Paytaca has a peer-to-peer exchange). You need the price plus a tiny network fee, under ₦5.</p>
            {net === 'chipnet' && <p className="hint">Testing? Turn on Chipnet in the wallet settings and get free test coins from tbch.googol.cash.</p>}
          </Step>
          <Step n={3} title="Open the seller's link and lock">
            <p>Check the item, the price and the seller's address, then tap Connect wallet. On a laptop, scan the code with your wallet. On your phone, tap Open in Cashonize, or copy the link and paste it in Paytaca under Apps, WizardConnect, Paste URL.</p>
            <p>Your money is locked, not sent. Keep using this phone: your release code is saved on it.</p>
          </Step>
          <Step n={4} title="At the door: scan, check, confirm" visual={<button className="btn btn-primary" onClick={openScanner}>Scan code</button>}>
            <p>Tap Scan code on Waybill (or use your phone's camera app) and scan the code on the rider's phone. Don't use your wallet's scanner: it can't open Waybill codes. It opens your order. Check the parcel, then tap I have the parcel, pay the seller. No rider code? Open your waybill and confirm there.</p>
            <p>Parcel never came? After the deadline, open the waybill and tap Refund. Only you can receive it.</p>
          </Step>
        </ol>
      )}
    </section>
  );
}
