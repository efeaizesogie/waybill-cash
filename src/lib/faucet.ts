import { TransactionBuilder, SignatureTemplate, type NetworkProvider } from 'cashscript';
import { withTimeout } from './errors';
import { provider } from './chain';

/**
 * Built-in Chipnet faucet, so judges can try Waybill with test coins in one tap.
 *
 * The site is static, so this key lives in the page. That is deliberate and only acceptable because
 * it is a CHIPNET (testnet) key: its coins have no value. Anyone could empty it; the per-browser limit
 * below just keeps casual use fair. Refill by sending Chipnet coins to FAUCET_ADDRESS.
 */
const FAUCET_WIF = 'cSLq7siUVxKLvYx4NfxuTaC1qB6Qa9uqK29ues79bn3gx7g6Rcnu';
export const FAUCET_ADDRESS = 'bchtest:qqeps7k0vwmpncfggeks3z26fzl6g3csgqvdszr3f6';
export const FAUCET_SATS = 500_000n; // 0.005 test BCH per claim: enough for several small test orders
const FEE = 400n;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const KEY = 'waybill.faucet.lastClaim';

const signer = new SignatureTemplate(FAUCET_WIF);
const net = () => provider('chipnet') as NetworkProvider;

export async function faucetBalance(): Promise<bigint> {
  const utxos = await withTimeout(net().getUtxos(FAUCET_ADDRESS), 20_000, 'Checking the faucet');
  return utxos.filter((u) => !u.token).reduce((s, u) => s + u.satoshis, 0n);
}

export function nextClaimAt(): number | null {
  try {
    const last = Number(localStorage.getItem(KEY) || 0);
    return last && Date.now() - last < COOLDOWN_MS ? last + COOLDOWN_MS : null;
  } catch {
    return null;
  }
}

export type FaucetStep = 'check' | 'sign' | 'send';

/** Send FAUCET_SATS of Chipnet test BCH to `to`. Retries once if another claim spent the same coins. */
export async function claimTestCoins(to: string, onStep?: (s: FaucetStep) => void): Promise<string> {
  if (!to.startsWith('bchtest:')) throw new Error('Use a Chipnet address (it starts with bchtest:). Switch your wallet to Chipnet first.');
  const wait = nextClaimAt();
  if (wait) throw new Error(`This browser already got test coins. You can claim again after ${new Date(wait).toLocaleTimeString()}.`);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      onStep?.('check');
      const utxos = (await withTimeout(net().getUtxos(FAUCET_ADDRESS), 20_000, 'Checking the faucet'))
        .filter((u) => !u.token)
        .sort((a, b) => (b.satoshis > a.satoshis ? 1 : -1));
      const need = FAUCET_SATS + FEE;
      const picked = [];
      let total = 0n;
      for (const u of utxos) {
        picked.push(u);
        total += u.satoshis;
        if (total >= need) break;
      }
      if (total < need) throw new Error('The test-coin faucet is empty right now. Use the public Chipnet faucet at tbch.googol.cash instead.');
      onStep?.('sign');
      const builder = new TransactionBuilder({ provider: net() });
      for (const u of picked) builder.addInput(u, signer.unlockP2PKH());
      builder.addOutput({ to, amount: FAUCET_SATS });
      const change = total - need;
      if (change >= 1000n) builder.addOutput({ to: FAUCET_ADDRESS, amount: change });
      onStep?.('send');
      const tx = await withTimeout(builder.send(), 45_000, 'Sending test coins');
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* storage blocked: no limit, fine for test coins */
      }
      return tx.txid;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/missing or already spent|missingorspent|mempool-conflict/i.test(msg)) throw e;
    }
  }
  throw lastError;
}

