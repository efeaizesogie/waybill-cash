import { useEffect, useState, useCallback } from 'react';
import { useWizardConnect, WizardConnectQRDialog } from '@wizardconnect/react';
import { type Net } from './lib/waybill';
import { Banner } from './components/Banner';
import { Home } from './pages/Home';
import { OrderPage } from './pages/OrderPage';
import { HandoverPage } from './pages/HandoverPage';
import { WalletContext } from './lib/walletContext';

type Route =
  | { name: 'home' }
  | { name: 'order'; code: string }
  | { name: 'handover'; code: string; secret: string };

function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'o' && parts[1]) return { name: 'order', code: parts[1] };
  if (parts[0] === 'h' && parts[1] && parts[2]) return { name: 'handover', code: parts[1], secret: parts[2] };
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
  const connect = useCallback(() => {
    if (wc.state !== 'connected') {
      wc.connect();
      setShowQr(true);
    }
  }, [wc]);
  useEffect(() => {
    if (wc.state === 'connected') setShowQr(false);
  }, [wc.state]);

  return (
    <WalletContext.Provider value={{ ...wc, net: NET, openConnect: connect }}>
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
          {NET === 'chipnet' && <span className="net-tag">Chipnet test coins</span>}
          {wc.state === 'connected' ? (
            <button className="btn btn-quiet" onClick={() => wc.disconnect()} title="Disconnect wallet">
              {wc.walletName ?? 'Wallet'} connected
            </button>
          ) : (
            <button className="btn btn-quiet" onClick={connect}>
              {wc.state === 'connecting' ? 'Waiting for wallet' : 'Connect wallet'}
            </button>
          )}
        </div>
      </header>

      <main>
        {route.name === 'home' && <Home />}
        {route.name === 'order' && <OrderPage code={route.code} />}
        {route.name === 'handover' && <HandoverPage code={route.code} secret={route.secret} />}
      </main>

      {wc.uri && wc.qrUri && (
        <WizardConnectQRDialog
          show={showQr && wc.state !== 'connected'}
          onClose={() => {
            setShowQr(false);
            if (wc.state !== 'connected') wc.disconnect();
          }}
          uri={wc.uri}
          qrUri={wc.qrUri}
          title="Connect your BCH wallet"
          subtitle="Scan with Paytaca or Cashonize (WizardConnect)"
          theme={{
            dialogBackground: '#163300',
            headerBackground: '#163300',
            titleColor: '#f1fbe9',
            subtitleColor: '#c4dcb4',
            qrForeground: '#163300',
            qrBackground: '#ffffff',
            uriRowBackground: 'rgba(255,255,255,0.08)',
            uriTextColor: '#c4dcb4',
            borderColor: 'rgba(255,255,255,0.14)',
            closeButtonColor: '#c4dcb4',
            copyButtonColor: '#9fe870',
          }}
        />
      )}

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
