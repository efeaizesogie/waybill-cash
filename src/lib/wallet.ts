import { TransactionBuilder, placeholderP2PKHUnlocker, type Utxo } from 'cashscript';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import { binToHex, hash160, encodeTransaction } from '@bitauth/libauth';
import { sourceOutputToRelay } from '@wizardconnect/core/hdwalletv1-serialize';
import { type Net, addressFromPubkey, DUST } from './waybill';
import { provider } from './chain';

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
export async function scanWallet(manager: DappConnectionManager, net: Net, receiveCount = 20, changeCount = 10) {
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
}) {
  const { manager, net, contractAddress, sats } = opts;
  const p = provider(net);
  const { utxos } = await scanWallet(manager, net);

  // Largest-first coin selection with a 1 sat/byte fee estimate.
  const sorted = [...utxos].sort((a, b) => (b.satoshis > a.satoshis ? 1 : -1));
  const picked: WalletUtxo[] = [];
  let total = 0n;
  const feeFor = (inputs: number) => BigInt(10 + inputs * 148 + 2 * 44 + 20);
  for (const u of sorted) {
    picked.push(u);
    total += u.satoshis;
    if (total >= sats + feeFor(picked.length)) break;
  }
  const fee = feeFor(picked.length);
  if (total < sats + fee) {
    throw new Error(`Not enough BCH in this wallet. Need ${sats + fee} sats, found ${total}.`);
  }

  const changePub = manager.getPubkey(manager.hasPath(CHANGE) ? CHANGE : RECEIVE, 0n)!;
  const changeAddress = addressFromPubkey(changePub, net);
  const change = total - sats - fee;

  const builder = new TransactionBuilder({ provider: p });
  for (const u of picked) builder.addInput(u, placeholderP2PKHUnlocker(u.address));
  builder.addOutput({ to: contractAddress, amount: sats });
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
  const response = await manager.signTransaction({
    transaction: relayRequest as never,
    inputPaths: picked.map((u, i) => [i, PATH_NAME[u.child], u.index] as [number, string, number]),
  });
  if (response.error) throw new Error(response.error);

  const txid = await p.sendRawTransaction(response.signedTransaction);
  return txid;
}
