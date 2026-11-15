import { describe, it, expect, beforeEach } from 'vitest';
import { MockNetworkProvider, randomUtxo } from 'cashscript';

// Minimal localStorage so the per-browser limit can be exercised in Node.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const mock = new MockNetworkProvider({ updateUtxoSet: true });
const chain = await import('../src/lib/chain');
chain.useProviderForTests(mock);
const faucet = await import('../src/lib/faucet');
const TO = 'bchtest:qq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygrg4dtdzf'.replace(/.*/, (a) => a);

beforeEach(() => {
  mock.reset();
  store.clear();
});

describe('Chipnet faucet', () => {
  it('sends 0.01 test BCH to the address and returns change to itself', async () => {
    mock.addUtxo(faucet.FAUCET_ADDRESS, randomUtxo({ satoshis: 5_000_000n }));
    const { addressFromPkh } = await import('../src/lib/waybill');
    const to = addressFromPkh('22'.repeat(20), 'chipnet');
    const steps: string[] = [];
    const txid = await faucet.claimTestCoins(to, (s) => steps.push(s));
    expect(txid).toMatch(/^[0-9a-f]{64}$/);
    expect((await mock.getUtxos(to)).map((u) => u.satoshis)).toContain(faucet.FAUCET_SATS);
    expect(await faucet.faucetBalance()).toBe(5_000_000n - faucet.FAUCET_SATS - 400n);
    expect(steps).toEqual(['check', 'sign', 'send']);
  });

  it('allows one claim per browser every few hours', async () => {
    mock.addUtxo(faucet.FAUCET_ADDRESS, randomUtxo({ satoshis: 5_000_000n }));
    const { addressFromPkh } = await import('../src/lib/waybill');
    const to = addressFromPkh('22'.repeat(20), 'chipnet');
    await faucet.claimTestCoins(to);
    await expect(faucet.claimTestCoins(to)).rejects.toThrow(/already got test coins/);
  });

  it('says so plainly when the faucet is empty', async () => {
    const { addressFromPkh } = await import('../src/lib/waybill');
    await expect(faucet.claimTestCoins(addressFromPkh('22'.repeat(20), 'chipnet'))).rejects.toThrow(/faucet is empty/);
  });

  it('refuses mainnet addresses', async () => {
    await expect(faucet.claimTestCoins('bitcoincash:qq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygrg4dtdzf')).rejects.toThrow(/Chipnet address/);
    void TO;
  });
});
