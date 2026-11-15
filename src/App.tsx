import { useEffect, useState, useCallback } from 'react';
import { useWizardConnect } from '@wizardconnect/react';
import { type Net, type Order, decodeOrder, decodeSecret, decodeHandover } from './lib/waybill';
import { ConnectDialog } from './components/ConnectDialog';
import { Scanner } from './components/Scanner';
import { FaucetDialog } from './components/FaucetDialog';
import { Banner } from './components/Banner';
import { Home } from './pages/Home';
import { OrderPage, WaybillPage } from './pages/OrderPage';
import { RequestPage } from './pages/RequestPage';
import { SellerPage } from './pages/SellerPage';
import { HandoverPage } from './pages/HandoverPage';
import { WalletContext } from './lib/walletContext';

type Route =
  | { name: 'home' }
  | { name: 'order'; code: string }
  | { name: 'waybill'; code: string }
  | { name: 'request'; code: string }
  | { name: 'seller'; code: string }
  | { name: 'handover'; order: Order | null; secret: Uint8Array | null };

function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'o' && parts[1]) return { name: 'order', code: parts[1] };
  if (parts[0] === 'w' && parts[1]) return { name: 'waybill', code: parts[1] };
  if (parts[0] === 'r' && parts[1]) return { name: 'request', code: parts[1] };
  if (parts[0] === 's' && parts[1]) return { name: 'seller', code: parts[1] };
  // Short handover link (what the QR carries now)
  if (parts[0] === 'x' && parts[1]) {
    try {
      const { order, secret } = decodeHandover(parts[1]);
      return { name: 'handover', order, secret };
    } catch {
      return { name: 'handover', order: null, secret: null };
    }
  }
  // Long handover link (older orders)
  if (parts[0] === 'h' && parts[1] && parts[2]) {
    try {
      return { name: 'handover', order: decodeOrder(parts[1]), secret: decodeSecret(parts[2]) };
    } catch {
      return { name: 'handover', order: null, secret: null };
    }
  }
  return { name: 'home' };
}

export const NET: Net = new URLSearchParams(location.search).get('net') === 'chipnet' ? 'chipnet' : 'mainnet';

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const wc = useWizardConnect({
    dappName: 'Waybill',
    dappIcon: new URL('favicon.svg', location.href.split('#')[0]).href,
    sessionKey: 'waybill-wizardconnect',
  });
  const [showQr, setShowQr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [faucetOpen, setFaucetOpen] = useState(() => new URLSearchParams(location.search).get('faucet') === '1');
  const openFaucet = useCallback(() => setFaucetOpen(true), []);
  const openScanner = useCallback(() => setScanning(true), []);
  const closeScanner = useCallback(() => setScanning(false), []);
  // A stale saved session can sit in "connecting" with no QR to show. Tapping Connect then
  // drops it and starts a fresh pairing once the hook is back to idle.
  const [freshPending, setFreshPending] = useState(false);
  const connect = useCallback(() => {
    if (wc.state === 'connected') return;
    setShowQr(true);
    if (wc.state === 'connecting' && wc.uri) return; // pairing QR already up
    if (wc.state === 'connecting') {
      setFreshPending(true);
      void wc.disconnect();
      return;
    }
    wc.connect();
  }, [wc]);
  useEffect(() => {
    if (freshPending && (wc.state === 'idle' || wc.state === 'disconnected')) {
      setFreshPending(false);
      wc.connect();
    }
  }, [freshPending, wc]);
  useEffect(() => {
    if (wc.state === 'connected') setShowQr(false);
  }, [wc.state]);

  return (
    <WalletContext.Provider value={{ ...wc, net: NET, openConnect: connect, openScanner, openFaucet }}>
      <Banner />
      <header className="topbar container">
        <a href="#/" className="wordmark" aria-label="Waybill home">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <rect x="1" y="5" width="24" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M8 5v16" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2.5" />
            <path d="M12 11h9M12 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          waybill
        </a>
        <div className="topbar-right">
          <button className="btn btn-quiet topbar-scan" onClick={openScanner} aria-label="Scan code">
            Scan<span className="wide-only"> code</span>
          </button>
          {wc.state === 'connected' ? (
            <button className="btn btn-quiet" onClick={() => wc.disconnect()} title="Disconnect wallet" aria-label={`${wc.walletName ?? 'Wallet'} connected. Tap to disconnect.`}>
              <span className="wide-only">{wc.walletName ?? 'Wallet'} </span>Connected
            </button>
          ) : (
            <button className="btn btn-quiet" onClick={connect} aria-label={wc.state === 'connecting' && wc.uri ? 'Waiting for wallet' : 'Connect wallet'}>
              {wc.state === 'connecting' && wc.uri ? 'Waiting…' : <>Connect<span className="wide-only"> wallet</span></>}
            </button>
          )}
        </div>
      </header>
      {wc.error && wc.state !== 'connected' && (
        <div className="net-strip conn-error" role="alert">
          <div className="container net-strip-row">
            <span>Couldn’t start the wallet connection. Check your internet and try again.</span>
            <button className="link-btn" onClick={connect}>Try again</button>
          </div>
        </div>
      )}
      {NET === 'chipnet' && (
        <div className="net-strip">
          <div className="container net-strip-row">
            <span>You're using Chipnet test coins.</span>
            <span className="net-strip-actions">
              <button className="link-btn" onClick={openFaucet}>Get free test coins</button>
              <a href={location.pathname}>Switch to real BCH</a>
            </span>
          </div>
        </div>
      )}

      <main>
        {route.name === 'home' && <Home />}
        {route.name === 'order' && <OrderPage code={route.code} />}
        {route.name === 'waybill' && <WaybillPage code={route.code} />}
        {route.name === 'request' && <RequestPage code={route.code} />}
        {route.name === 'seller' && <SellerPage code={route.code} />}
        {route.name === 'handover' && <HandoverPage order={route.order} secret={route.secret} />}
      </main>

      {wc.uri && wc.qrUri && showQr && wc.state !== 'connected' && (
        <ConnectDialog
          uri={wc.uri}
          qrUri={wc.qrUri}
          onClose={() => {
            setShowQr(false);
            if (wc.state !== 'connected') wc.disconnect();
          }}
        />
      )}
      {scanning && <Scanner onClose={closeScanner} />}
      {faucetOpen && <FaucetDialog onClose={() => setFaucetOpen(false)} />}

      <footer className="footer container">
        <p>
          Waybill is open source and holds nothing. Every order is a Bitcoin Cash contract that can only pay the seller
          (with the buyer's code) or refund the buyer (after the deadline).
        </p>
        <p className="footer-links">
          <a href="https://github.com/efeaizesogie/waybill-cash/blob/main/contracts/waybill.cash">Read the contract</a>
          <a href="https://github.com/efeaizesogie/waybill-cash">Source code</a>
          <a href={NET === 'mainnet' ? '?net=chipnet' : './'}>{NET === 'mainnet' ? 'Use Chipnet test coins' : 'Back to mainnet'}</a>
        </p>
      </footer>
    </WalletContext.Provider>
  );
}
