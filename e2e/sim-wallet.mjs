// A stand-in for Paytaca: a WizardConnect wallet that pairs over the real relay and signs
// sign requests the same way Paytaca's service.js does (hex tx + hydrated source outputs).
// Usage: node e2e/sim-wallet.mjs <wiz://uri> [chipnet|mainnet]
import { WalletConnectionManager } from '@wizardconnect/wallet';
import { toUint8Array, toBigInt } from '@wizardconnect/core';
import {
  deriveHdPrivateNodeFromSeed, deriveHdPath, deriveHdPrivateNodeChild, deriveHdPublicNode, encodeHdPublicKey,
  secp256k1, sha256, utf8ToBin, hexToBin, binToHex, decodeTransaction, encodeTransaction, generateTransaction,
  walletTemplateToCompilerBCH, walletTemplateP2pkhNonHd,
} from '@bitauth/libauth';

const [uri, net = 'chipnet'] = process.argv.slice(2);
const log = (...a) => console.log('[wallet]', ...a);
const root = deriveHdPrivateNodeFromSeed(new Uint8Array(64).fill(7));
const account = deriveHdPath(root, "m/44'/145'/0'");
const chainNode = (child) => deriveHdPrivateNodeChild(account, child);
const priv = (child, index) => deriveHdPrivateNodeChild(chainNode(child), index).privateKey;
const PATHS = { receive: 0, change: 1, defi: 7 };

const adapter = {
  walletName: 'SimWallet',
  walletIcon: '',
  getRelayPrivateKey: (u) => sha256.hash(utf8ToBin('sim:' + u)),
  getPublicKey: (path, index) => secp256k1.derivePublicKeyCompressed(priv(Number(path), Number(index))),
  getXpub: (path) => encodeHdPublicKey({ node: deriveHdPublicNode(chainNode(Number(path))), network: net === 'chipnet' ? 'testnet' : 'mainnet' }).hdPublicKey,
  async signTransaction() { throw new Error('use pendingSignRequest'); },
};

function sign(request) {
  const tx = decodeTransaction(hexToBin(request.transaction.transaction));
  if (typeof tx === 'string') throw new Error('decode: ' + tx);
  const sos = request.transaction.sourceOutputs.map((so) => ({ valueSatoshis: toBigInt(so.valueSatoshis), lockingBytecode: toUint8Array(so.lockingBytecode) }));
  const keys = new Map(request.inputPaths.map(([i, name, idx]) => [i, priv(PATHS[name], idx)]));
  const compiler = walletTemplateToCompilerBCH(walletTemplateP2pkhNonHd);
  const r = generateTransaction({
    version: tx.version, locktime: tx.locktime,
    inputs: tx.inputs.map((inp, i) => ({ ...inp, unlockingBytecode: { compiler, data: { keys: { privateKeys: { key: keys.get(i) } } }, script: 'unlock', valueSatoshis: sos[i].valueSatoshis } })),
    outputs: tx.outputs.map((o) => ({ lockingBytecode: o.lockingBytecode, valueSatoshis: o.valueSatoshis })),
  });
  if (!r.success) throw new Error('sign: ' + JSON.stringify(r.errors).slice(0, 300));
  return binToHex(encodeTransaction(r.transaction));
}

const mgr = new WalletConnectionManager(adapter);
mgr.on('connectionStatusChanged', (id, s) => log('status', s));
mgr.on('pendingSignRequest', async ({ connectionId, request }) => {
  log('SIGN REQUEST', 'inputs', request.inputPaths.length, 'prompt:', request.transaction.userPrompt);
  const delay = Number(process.env.SIGN_DELAY_MS || 0);
  if (delay) await new Promise((r) => setTimeout(r, delay));
  try {
    const hex = sign(request);
    await mgr.sendSignResponse(connectionId, request.sequence, hex);
    log('SIGNED', hex.length / 2, 'bytes');
  } catch (e) {
    log('SIGN ERROR', e.message);
    await mgr.sendSignError(connectionId, request.sequence, e.message);
  }
});
mgr.connect(uri);
log('pairing', net);
setTimeout(() => process.exit(0), 120_000);
