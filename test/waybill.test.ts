import { describe, it, expect, beforeEach } from 'vitest';
import { MockNetworkProvider, TransactionBuilder, randomUtxo } from 'cashscript';
import { binToHex, hash160, secp256k1 } from '@bitauth/libauth';
import {
  type Order,
  makeContract,
  buildRelease,
  buildRefund,
  newSecret,
  hashSecret,
  addressFromPkh,
  encodeOrder,
  decodeOrder,
  encodeSecret,
  decodeSecret,
  secretMatches,
  MAX_FEE,
} from '../src/lib/waybill';

const pkh = (seed: number) => {
  const priv = new Uint8Array(32).fill(seed);
  const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
  return binToHex(hash160(pub));
};

const HEIGHT = 900_000;
let provider: MockNetworkProvider;
let secret: Uint8Array;
let order: Order;

beforeEach(() => {
  provider = new MockNetworkProvider({ updateUtxoSet: true });
  provider.setBlockHeight(HEIGHT);
  secret = newSecret();
  order = {
    v: 1,
    net: 'chipnet',
    buyerPkh: pkh(1),
    sellerPkh: pkh(2),
    releaseHash: hashSecret(secret),
    refundAfter: HEIGHT + 144,
    maxFee: MAX_FEE,
    sats: 100_000,
    item: 'Ankara two-piece, size M',
    price: '₦25,000',
    created: Date.now(),
  };
});

async function fund(sats = 100_000n) {
  const contract = makeContract(order, provider);
  provider.addUtxo(contract.address, randomUtxo({ satoshis: sats }));
  const [utxo] = await contract.getUtxos();
  return { contract, utxo };
}

describe('release', () => {
  it('pays the seller when the right code is shown', async () => {
    const { contract, utxo } = await fund();
    await buildRelease(contract, order, utxo, secret, provider).send();
    const seller = await provider.getUtxos(addressFromPkh(order.sellerPkh, 'chipnet'));
    expect(seller).toHaveLength(1);
    expect(seller[0].satoshis).toBe(99_500n);
    expect(await contract.getUtxos()).toHaveLength(0);
  });

  it('rejects a wrong code', async () => {
    const { contract, utxo } = await fund();
    await expect(buildRelease(contract, order, utxo, newSecret(), provider).send()).rejects.toThrow();
  });

  it('cannot redirect the money to anyone but the seller', async () => {
    const { contract, utxo } = await fund();
    const tx = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.release(secret))
      .addOutput({ to: addressFromPkh(pkh(9), 'chipnet'), amount: 99_500n });
    await expect(tx.send()).rejects.toThrow();
  });

  it('cannot burn the money as an oversized fee', async () => {
    const { contract, utxo } = await fund();
    const tx = new TransactionBuilder({ provider, maximumFeeSatoshis: 100_000n })
      .addInput(utxo, contract.unlock.release(secret))
      .addOutput({ to: addressFromPkh(order.sellerPkh, 'chipnet'), amount: 90_000n });
    await expect(tx.send()).rejects.toThrow();
  });

  it('cannot add a second output to skim', async () => {
    const { contract, utxo } = await fund();
    const tx = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.release(secret))
      .addOutput({ to: addressFromPkh(order.sellerPkh, 'chipnet'), amount: 98_000n })
      .addOutput({ to: addressFromPkh(pkh(9), 'chipnet'), amount: 1_000n });
    await expect(tx.send()).rejects.toThrow();
  });
});

describe('refund', () => {
  it('is blocked before the deadline', async () => {
    const { contract, utxo } = await fund();
    const tx = buildRefund(contract, order, utxo, provider).setLocktime(HEIGHT);
    await expect(tx.send()).rejects.toThrow();
  });

  it('returns the money to the buyer after the deadline', async () => {
    provider.setBlockHeight(order.refundAfter);
    const { contract, utxo } = await fund();
    await buildRefund(contract, order, utxo, provider).send();
    const buyer = await provider.getUtxos(addressFromPkh(order.buyerPkh, 'chipnet'));
    expect(buyer[0].satoshis).toBe(99_500n);
  });

  it('cannot send the refund anywhere else', async () => {
    provider.setBlockHeight(order.refundAfter);
    const { contract, utxo } = await fund();
    const tx = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.refund())
      .addOutput({ to: addressFromPkh(order.sellerPkh, 'chipnet'), amount: 99_500n })
      .setLocktime(order.refundAfter);
    await expect(tx.send()).rejects.toThrow();
  });
});

describe('links', () => {
  it('round-trips an order and a secret', () => {
    const back = decodeOrder(encodeOrder(order));
    expect(back).toEqual(order);
    expect(secretMatches(back, decodeSecret(encodeSecret(secret)))).toBe(true);
    expect(secretMatches(back, newSecret())).toBe(false);
  });

  it('gives the same contract address from the decoded link', () => {
    const a = makeContract(order, provider).address;
    const b = makeContract(decodeOrder(encodeOrder(order)), provider).address;
    expect(a).toBe(b);
    expect(a.startsWith('bchtest:p')).toBe(true);
  });
});
