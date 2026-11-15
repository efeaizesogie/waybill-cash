import { describe, it, expect, beforeEach } from 'vitest';
import { MockNetworkProvider, TransactionBuilder, randomUtxo } from 'cashscript';
import { binToHex, hash160, secp256k1 } from '@bitauth/libauth';
import {
  type Order, makeContract, buildRelease, buildRefund, newSecret, hashSecret, addressFromPkh,
  platformFee, sellerPayout, devFeePkh, settleFee, MAX_FEE, encodeHandover, decodeHandover, encodeWaybill, decodeWaybill,
} from '../src/lib/waybill';

const pkh = (seed: number) => binToHex(hash160(secp256k1.derivePublicKeyCompressed(new Uint8Array(32).fill(seed)) as Uint8Array));
const HEIGHT = 900_000;
let provider: MockNetworkProvider;
let secret: Uint8Array;
let order: Order;
const seller = () => addressFromPkh(order.sellerPkh, 'chipnet');
const dev = () => addressFromPkh(devFeePkh(), 'chipnet');

beforeEach(() => {
  provider = new MockNetworkProvider({ updateUtxoSet: true });
  provider.setBlockHeight(HEIGHT);
  secret = newSecret();
  order = {
    v: 2, net: 'chipnet', buyerPkh: pkh(1), sellerPkh: pkh(2), releaseHash: hashSecret(secret),
    refundAfter: HEIGHT + 144, maxFee: MAX_FEE, sats: 1_000_000, item: 'Ankara', created: 0,
  };
});

async function fund(sats: bigint) {
  const contract = makeContract(order, provider);
  provider.addUtxo(contract.address, randomUtxo({ satoshis: sats }));
  const [utxo] = await contract.getUtxos();
  return { contract, utxo };
}

describe('0.5% platform fee (v2)', () => {
  it('pays the seller minus 0.5% and sends the 0.5% to the developer when the buyer confirms', async () => {
    const { contract, utxo } = await fund(1_000_000n);
    await buildRelease(contract, order, utxo, secret, provider).send();
    expect(platformFee(1_000_000n, 2)).toBe(5_000n);
    expect((await provider.getUtxos(seller())).map((u) => u.satoshis)).toContain(1_000_000n - 5_000n - settleFee());
    expect((await provider.getUtxos(dev())).map((u) => u.satoshis)).toContain(5_000n);
    expect(sellerPayout(1_000_000n, 2)).toBe(994_500n);
  });

  it('cannot release without paying the fee', async () => {
    const { contract, utxo } = await fund(1_000_000n);
    const tx = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.release(secret))
      .addOutput({ to: seller(), amount: 999_500n });
    await expect(tx.send()).rejects.toThrow();
  });

  it('cannot send the fee anywhere but the developer', async () => {
    const { contract, utxo } = await fund(1_000_000n);
    const tx = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.release(secret))
      .addOutput({ to: seller(), amount: 994_500n })
      .addOutput({ to: addressFromPkh(pkh(9), 'chipnet'), amount: 5_000n });
    await expect(tx.send()).rejects.toThrow();
  });

  it('cannot underpay the fee', async () => {
    const { contract, utxo } = await fund(1_000_000n);
    const tx = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.release(secret))
      .addOutput({ to: seller(), amount: 997_000n })
      .addOutput({ to: dev(), amount: 2_500n });
    await expect(tx.send()).rejects.toThrow();
  });

  it('cannot shortchange the seller by overpaying the developer', async () => {
    const { contract, utxo } = await fund(1_000_000n);
    const tx = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.release(secret))
      .addOutput({ to: seller(), amount: 900_000n })
      .addOutput({ to: dev(), amount: 99_500n });
    await expect(tx.send()).rejects.toThrow();
  });

  it('charges no fee on small orders where 0.5% is below dust', async () => {
    const { contract, utxo } = await fund(100_000n); // 0.5% = 500 sats < 546
    expect(platformFee(100_000n, 2)).toBe(0n);
    await buildRelease(contract, order, utxo, secret, provider).send();
    expect((await provider.getUtxos(seller())).map((u) => u.satoshis)).toContain(99_500n);
  });

  it('refunds the full amount to the buyer with no fee', async () => {
    provider.setBlockHeight(order.refundAfter);
    const { contract, utxo } = await fund(1_000_000n);
    await buildRefund(contract, order, utxo, provider).send();
    expect((await provider.getUtxos(addressFromPkh(order.buyerPkh, 'chipnet'))).map((u) => u.satoshis)).toContain(999_500n);
    expect(await provider.getUtxos(dev())).toHaveLength(0);
  });

  it('v1 orders made before the fee keep their old contract and pay no fee', async () => {
    const v1 = { ...order, v: 1 as const };
    expect(makeContract(v1, provider).address).not.toBe(makeContract(order, provider).address);
    expect(platformFee(1_000_000n, 1)).toBe(0n);
  });

  it('short links keep the version, so the contract is rebuilt correctly', () => {
    expect(decodeHandover(encodeHandover(order, secret)).order.v).toBe(2);
    expect(decodeWaybill(encodeWaybill(order)).v).toBe(2);
    expect(decodeWaybill(encodeWaybill({ ...order, v: 1 })).v).toBe(1);
    expect(makeContract(decodeWaybill(encodeWaybill(order)), provider).address).toBe(makeContract(order, provider).address);
  });
});
