import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Installable app: register the service worker in production builds only.
// The module can run after the page's load event, so register right away if it already fired.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const register = () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* not critical: the site works without it */
    });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
