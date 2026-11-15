// e2e helper (served by the Vite dev server only, never bundled): routes chain calls through a funded
// MockNetworkProvider so e2e/run_lock.py can drive a full lock through the real WizardConnect relay.
import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { deriveHdPrivateNodeFromSeed, deriveHdPath, deriveHdPrivateNodeChild, secp256k1, hash160, binToHex } from '@bitauth/libauth';
import { useProviderForTests } from '../src/lib/chain';
import { addressFromPkh } from '../src/lib/waybill';

export function setup() {
  const mock = new MockNetworkProvider({ updateUtxoSet: true });
  mock.setBlockHeight(332_400);
  const root = deriveHdPrivateNodeFromSeed(new Uint8Array(64).fill(7)) as never;
  const account = deriveHdPath(root, "m/44'/145'/0'") as never;
  const recv = deriveHdPrivateNodeChild(account, 0) as never;
  const node = deriveHdPrivateNodeChild(recv, 0) as { privateKey: Uint8Array };
  const pub = secp256k1.derivePublicKeyCompressed(node.privateKey) as Uint8Array;
  const addr = addressFromPkh(binToHex(hash160(pub)), 'chipnet');
  mock.addUtxo(addr, randomUtxo({ satoshis: 2_000_000n }));
  useProviderForTests(mock);
  (window as unknown as { __mock: MockNetworkProvider }).__mock = mock;
  return addr;
}
