import { APP_URL } from './config';

/**
 * Base for every link and QR code we hand to another person or device. Always the public site:
 * a link made on a dev machine ("http://localhost…") would open nothing on someone else's phone.
 * Keeps ?net=chipnet so test-coin links stay on Chipnet.
 */
export function shareBase(): string {
  const here = new URL(location.href);
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|.+\.test)$/.test(here.hostname);
  const base = local ? APP_URL : `${here.origin}${here.pathname}`;
  const net = here.searchParams.get('net') === 'chipnet' ? '?net=chipnet' : '';
  return `${base}${net}`;
}

export const shareLink = (hashPath: string) => `${shareBase()}#/${hashPath.replace(/^#?\/?/, '')}`;
