// e2e helper (served by the Vite dev server only, never bundled): routes chain calls through a funded
// MockNetworkProvider so e2e/run_lock.py can drive a full lock through the real WizardConnect relay.
import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { deriveHdPrivateNodeFromSeed, deriveHdPath, deriveHdPrivateNodeChild, secp256k1, hash160, binToHex, hexToBin, decodeTransaction, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { useProviderForTests } from '../src/lib/chain';
import { addressFromPkh } from '../src/lib/waybill';

export function setup(fundSats = 2_000_000) {
  const mock = new MockNetworkProvider({ updateUtxoSet: true });
  mock.setBlockHeight(332_400);
  const root = deriveHdPrivateNodeFromSeed(new Uint8Array(64).fill(7)) as never;
  const account = deriveHdPath(root, "m/44'/145'/0'") as never;
  const recv = deriveHdPrivateNodeChild(account, 0) as never;
  const node = deriveHdPrivateNodeChild(recv, 0) as { privateKey: Uint8Array };
  const pub = secp256k1.derivePublicKeyCompressed(node.privateKey) as Uint8Array;
  const addr = addressFromPkh(binToHex(hash160(pub)), 'chipnet');
  mock.addUtxo(addr, randomUtxo({ satoshis: BigInt(fundSats) }));
  // Electrum's get_history, answered from the mock's own transaction log (newest last, like Fulcrum).
  const m = mock as unknown as { transactionMap: Record<string, string>; performRequest: (n: string, a: string) => Promise<unknown> };
  m.performRequest = async (name: string, address: string) => {
    if (name !== 'blockchain.address.get_history') throw new Error('unsupported ' + name);
    const lb = cashAddressToLockingBytecode(address);
    if (typeof lb === 'string') return [];
    const want = binToHex(lb.bytecode);
    const decoded = Object.entries(m.transactionMap).map(([txid, hex]) => ({ txid, tx: decodeTransaction(hexToBin(hex)) }));
    const paysAddr = new Set(decoded.filter(({ tx }) => typeof tx !== 'string' && tx.outputs.some((o) => binToHex(o.lockingBytecode) === want)).map((d) => d.txid));
    return decoded
      .filter(({ txid, tx }) => paysAddr.has(txid) || (typeof tx !== 'string' && tx.inputs.some((i) => paysAddr.has(binToHex(i.outpointTransactionHash)))))
      .map(({ txid }) => ({ tx_hash: txid, height: 0 }));
  };
  useProviderForTests(mock);
  (window as unknown as { __mock: MockNetworkProvider }).__mock = mock;
  return addr;
}
