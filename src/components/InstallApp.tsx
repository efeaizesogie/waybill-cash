import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/**
 * "Install the app": Android and desktop Chrome get the browser's install prompt; iPhone users
 * (Safari has no prompt) get the Share, Add to Home Screen steps. Hidden once installed.
 */
export function InstallApp({ className = '' }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  if (prompt) {
    return (
      <button
        type="button"
        className={`link-btn install-app ${className}`}
        onClick={async () => {
          await prompt.prompt();
          const { outcome } = await prompt.userChoice;
          if (outcome === 'accepted') setInstalled(true);
          setPrompt(null);
        }}
      >
        Install Waybill on your phone
      </button>
    );
  }

  if (isIos()) {
    return (
      <span className={`install-app ${className}`}>
        <button type="button" className="link-btn" onClick={() => setShowIos(!showIos)} aria-expanded={showIos}>
          Install Waybill on your iPhone
        </button>
        {showIos && <span className="hint install-steps">In Safari, tap the Share button, then Add to Home Screen.</span>}
      </span>
    );
  }

  return null;
}
