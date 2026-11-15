/**
 * End-to-end money flow with a simulated WizardConnect wallet.
 *
 * The network is CashScript's MockNetworkProvider, which runs every broadcast through the BCH VM,
 * so a malformed or badly signed transaction fails exactly like mainnet would. The wallet decodes
 * the relay request the way Paytaca does (hex tx + hydrated source outputs) and signs with libauth.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockNetworkProvider, randomUtxo } from 'cashscript';
import {
  deriveHdPrivateNodeFromSeed, deriveHdPath, deriveHdPrivateNodeChild, secp256k1, hash160, binToHex, hexToBin,
  decodeTransaction, generateTransaction, walletTemplateToCompilerBCH, walletTemplateP2pkhNonHd,
} from '@bitauth/libauth';
import { toUint8Array, toBigInt } from '@wizardconnect/core';

const mock = new MockNetworkProvider({ updateUtxoSet: true });

const { lockFunds, buyerIdentity } = await import('../src/lib/wallet');
const chain = await import('../src/lib/chain');
chain.useProviderForTests(mock);
const w = await import('../src/lib/waybill');

// ---- a fake HD wallet that speaks the WizardConnect dapp-manager surface lockFunds uses ----
const seed = new Uint8Array(64).fill(7);
const root = deriveHdPrivateNodeFromSeed(seed) as any;
const account = deriveHdPath(root, "m/44'/145'/0'") as any;
const PATHS: Record<string, number> = { receive: 0, change: 1 };
const priv = (child: number, index: number) => {
  const c = deriveHdPrivateNodeChild(account, child);
  if (typeof c === 'string') throw new Error(c);
  const n = deriveHdPrivateNodeChild(c, index);
  if (typeof n === 'string') throw new Error(n);
  return n.privateKey;
};
const pub = (child: number, index: number) => secp256k1.derivePublicKeyCompressed(priv(child, index)) as Uint8Array;

let lastRequest: any = null;
const manager = {
  hasPath: (child: number) => child === 0 || child === 1,
  getPubkey: (child: number, index: bigint) => pub(child, Number(index)),
  async signTransaction(req: { transaction: any; inputPaths: [number, string, number][] }) {
    lastRequest = JSON.parse(JSON.stringify(req)); // must survive plain-JSON relay transport
    const tx = decodeTransaction(hexToBin(lastRequest.transaction.transaction));
    if (typeof tx === 'string') throw new Error(tx);
    const sos = lastRequest.transaction.sourceOutputs.map((so: any) => ({
      lockingBytecode: toUint8Array(so.lockingBytecode),
      valueSatoshis: toBigInt(so.valueSatoshis),
    }));
    const compiler = walletTemplateToCompilerBCH(walletTemplateP2pkhNonHd);
    const keyFor = new Map(lastRequest.inputPaths.map(([i, name, idx]: [number, string, number]) => [i, priv(PATHS[name], idx)]));
    const result = generateTransaction({
      version: tx.version,
      locktime: tx.locktime,
      inputs: tx.inputs.map((input, i) => ({
        outpointTransactionHash: input.outpointTransactionHash,
        outpointIndex: input.outpointIndex,
        sequenceNumber: input.sequenceNumber,
        unlockingBytecode: {
          compiler,
          data: { keys: { privateKeys: { key: keyFor.get(i) as Uint8Array } } },
          script: 'unlock',
          valueSatoshis: sos[i].valueSatoshis,
        },
      })),
      outputs: tx.outputs.map((o) => ({ lockingBytecode: o.lockingBytecode, valueSatoshis: o.valueSatoshis })),
    });
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    const { encodeTransaction } = await import('@bitauth/libauth');
    return { action: 'sign_transaction_response', sequence: 1, time: 0, signedTransaction: binToHex(encodeTransaction(result.transaction)) };
  },
} as any;

const HEIGHT = 900_000;
beforeEach(() => {
  mock.reset();
  mock.setBlockHeight(HEIGHT);
  lastRequest = null;
});

function fundWallet(sats: bigint, child = 0, index = 0) {
  const addr = w.addressFromPkh(binToHex(hash160(pub(child, index))), 'chipnet');
  mock.addUtxo(addr, randomUtxo({ satoshis: sats }));
  return addr;
}

describe('buyer locks, then the seller is paid', () => {
  it('demo flow: lock through the wallet, then release with the code', async () => {
    fundWallet(300_000n);
    const buyer = buyerIdentity(manager, 'chipnet');
    const secret = w.newSecret();
    const order: import('../src/lib/waybill').Order = {
      v: 1, net: 'chipnet', buyerPkh: buyer.pkh, sellerPkh: binToHex(hash160(pub(0, 1))),
      releaseHash: w.hashSecret(secret), refundAfter: HEIGHT + 144, maxFee: w.MAX_FEE, sats: 100_000, item: 'Shoes', created: 0,
    };
    const contract = w.makeContract(order, mock);
    const txid = await lockFunds({ manager, net: 'chipnet', contractAddress: contract.address, sats: 100_000n, itemLabel: 'Shoes' });
    expect(txid).toMatch(/^[0-9a-f]{64}$/);
    const [utxo] = await contract.getUtxos();
    expect(utxo.satoshis).toBe(100_000n);

    await chain.release(order, utxo, secret);
    const sellerUtxos = await mock.getUtxos(w.addressFromPkh(order.sellerPkh, 'chipnet'));
    expect(sellerUtxos.map((u) => u.satoshis)).toContain(99_500n);
  });

  it('seller-link flow: lock rings the seller with a note, then the buyer confirms', async () => {
    fundWallet(300_000n);
    const req = { net: 'chipnet' as const, sellerPkh: binToHex(hash160(pub(0, 5))), sats: 50_000, item: 'Bag', windowBlocks: 144, rid: w.newRequestId() };
    const buyer = buyerIdentity(manager, 'chipnet');
    const secret = w.newSecret();
    const note = { rid: req.rid, buyerPkh: buyer.pkh, releaseHash: w.hashSecret(secret), refundAfter: HEIGHT + 144 };
    const order = w.orderFromRequest(req, note);
    const contract = w.makeContract(order, mock);
    const sellerAddr = w.addressFromPkh(req.sellerPkh, 'chipnet');
    await lockFunds({ manager, net: 'chipnet', contractAddress: contract.address, sats: 50_000n, itemLabel: 'Bag', note: { sellerAddress: sellerAddr, chunks: w.noteChunks(note) } });

    const [utxo] = await contract.getUtxos();
    expect(utxo.satoshis).toBe(50_000n);
    expect((await mock.getUtxos(sellerAddr)).map((u) => u.satoshis)).toContain(BigInt(w.DOORBELL_SATS));

    await chain.release(order, utxo, secret);
    expect((await mock.getUtxos(sellerAddr)).map((u) => u.satoshis)).toContain(49_500n);
  });

  it('spends coins spread across receive and change addresses', async () => {
    fundWallet(40_000n, 0, 0);
    fundWallet(40_000n, 1, 2);
    fundWallet(40_000n, 0, 3);
    const secret = w.newSecret();
    const order = { v: 1 as const, net: 'chipnet' as const, buyerPkh: buyerIdentity(manager, 'chipnet').pkh, sellerPkh: binToHex(hash160(pub(0, 1))), releaseHash: w.hashSecret(secret), refundAfter: HEIGHT + 12, maxFee: w.MAX_FEE, sats: 100_000, item: 'x', created: 0 };
    const contract = w.makeContract(order, mock);
    await lockFunds({ manager, net: 'chipnet', contractAddress: contract.address, sats: 100_000n, itemLabel: 'x' });
    expect((await contract.getUtxos())[0].satoshis).toBe(100_000n);
    expect(lastRequest.inputPaths.length).toBe(3);
  });
});
