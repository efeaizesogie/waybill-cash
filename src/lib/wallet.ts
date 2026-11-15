import { TransactionBuilder, placeholderP2PKHUnlocker, type Utxo } from 'cashscript';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import { binToHex, hash160, encodeTransaction } from '@bitauth/libauth';
import { sourceOutputToRelay } from '@wizardconnect/core/hdwalletv1-serialize';
import { type Net, addressFromPubkey, DUST, DOORBELL_SATS } from './waybill';
import { provider } from './chain';
import { formatBch } from './price';
import { withTimeout } from './errors';

const RECEIVE = 0;
const CHANGE = 1;
const PATH_NAME: Record<number, 'receive' | 'change'> = { 0: 'receive', 1: 'change' };

interface WalletUtxo extends Utxo {
  lockingBytecode: string;
  address: string;
  child: number;
  index: number;
}

export function buyerIdentity(manager: DappConnectionManager, net: Net) {
  const pub = manager.getPubkey(RECEIVE, 0n);
  if (!pub) throw new Error('Wallet has not shared its addresses yet.');
  return { pkh: binToHex(hash160(pub)), address: addressFromPubkey(pub, net) };
}

/** Scan the first few receive + change addresses for spendable BCH (no tokens). */
export async function scanWallet(manager: DappConnectionManager, net: Net, receiveCount = 40, changeCount = 20) {
  const p = provider(net);
  const slots: { child: number; index: number; address: string }[] = [];
  for (const [child, count] of [[RECEIVE, receiveCount], [CHANGE, changeCount]] as const) {
    if (!manager.hasPath(child)) continue;
    for (let i = 0; i < count; i++) {
      const pub = manager.getPubkey(child, BigInt(i));
      if (pub) slots.push({ child, index: i, address: addressFromPubkey(pub, net) });
    }
  }
  const results = await Promise.all(slots.map(async (s) => {
    const utxos = await p.getUtxos(s.address);
    return utxos.filter((u) => !u.token).map((u) => ({ ...u, ...s }) as WalletUtxo);
  }));
  const utxos = results.flat();
  const balance = utxos.reduce((sum, u) => sum + u.satoshis, 0n);
  return { utxos, balance };
}

/**
 * Build the lock transaction (wallet coins -> Waybill contract), ask the wallet to sign it
 * over WizardConnect, then broadcast it ourselves.
 */
export async function lockFunds(opts: {
  manager: DappConnectionManager;
  net: Net;
  contractAddress: string;
  sats: bigint;
  itemLabel: string;
  /** Seller-created orders: ring the seller's address and leave a note so their page can find the lock. */
  note?: { sellerAddress: string; chunks: string[] };
  /** How long to wait for the wallet to approve before giving up with instructions. */
  timeoutMs?: number;
  onStep?: (step: 'approve' | 'send') => void;
}) {
  const { manager, net, contractAddress, note } = opts;
  const sats = opts.sats;
  const extra = note ? BigInt(DOORBELL_SATS) : 0n;
  const p = provider(net);
  const { utxos } = await withTimeout(scanWallet(manager, net), 40_000, 'Checking your wallet');

  // Largest-first coin selection with a 1 sat/byte fee estimate.
  const sorted = [...utxos].sort((a, b) => (b.satoshis > a.satoshis ? 1 : -1));
  const picked: WalletUtxo[] = [];
  let total = 0n;
  const feeFor = (inputs: number) => BigInt(10 + inputs * 148 + 2 * 44 + 20 + (note ? 34 + 90 : 0));
  for (const u of sorted) {
    picked.push(u);
    total += u.satoshis;
    if (total >= sats + extra + feeFor(picked.length)) break;
  }
  const fee = feeFor(picked.length);
  if (total < sats + extra + fee) {
    const netName = net === 'chipnet' ? 'Chipnet test coins' : 'real BCH';
    throw new Error(
      `Not enough ${netName} in the connected wallet: this needs ${formatBch(sats + extra + fee)}, it has ${formatBch(total)}. ` +
        `Check the wallet is on ${net === 'chipnet' ? 'Chipnet' : 'mainnet'} and funded, then tap Lock again.`,
    );
  }

  const changePub = manager.getPubkey(manager.hasPath(CHANGE) ? CHANGE : RECEIVE, 0n)!;
  const changeAddress = addressFromPubkey(changePub, net);
  const change = total - sats - extra - fee;

  const builder = new TransactionBuilder({ provider: p });
  for (const u of picked) builder.addInput(u, placeholderP2PKHUnlocker(u.address));
  builder.addOutput({ to: contractAddress, amount: sats });
  if (note) {
    builder.addOutput({ to: note.sellerAddress, amount: extra });
    builder.addOpReturnOutput(note.chunks);
  }
  if (change >= BigInt(DUST)) builder.addOutput({ to: changeAddress, amount: change });

  const wcObject = builder.generateWcTransactionObject({
    broadcast: false,
    userPrompt: `Lock ${sats} sats for "${opts.itemLabel}" until delivery`,
  });

  // The relay is plain JSON: send the tx as hex and source outputs in WizardConnect's relay format.
  const relayRequest = {
    transaction: binToHex(encodeTransaction(wcObject.transaction)),
    sourceOutputs: wcObject.sourceOutputs.map((so) => sourceOutputToRelay(so)),
    broadcast: false,
    userPrompt: wcObject.userPrompt,
  };
  opts.onStep?.('approve');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? 90_000);
  let response;
  try {
    response = await manager.signTransaction(
      {
        transaction: relayRequest as never,
        inputPaths: picked.map((u, i) => [i, PATH_NAME[u.child], u.index] as [number, string, number]),
      },
      { signal: abort.signal },
    );
  } catch (e) {
    if (abort.signal.aborted) {
      throw new Error('Your wallet didn’t answer. In Paytaca, open Apps, then WizardConnect, to find the request (in Cashonize, open Connect). Then tap Lock again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (response.error) throw new Error(/reject/i.test(response.error) ? 'You declined the lock in your wallet. Nothing was sent.' : response.error);

  opts.onStep?.('send');
  const txid = await withTimeout(p.sendRawTransaction(response.signedTransaction), 45_000, 'Sending the lock');
  return txid;
}
