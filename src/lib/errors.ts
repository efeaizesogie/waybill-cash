/** Turn library and network errors into one plain sentence a buyer or seller can act on. */
export function friendlyError(e: unknown): { message: string; detail?: string } {
  const raw = e instanceof Error ? e.message : String(e ?? 'Unknown error');
  const detail = raw.length > 160 ? raw : undefined;
  const has = (re: RegExp) => re.test(raw);

  // Our own messages are already written for people: pass them through.
  if (has(/^(Not enough|Your wallet didn|You declined|That is|Use a regular|Use a Chipnet|This browser already|The test-coin faucet|This (payment|waybill|handover) (link|code) is broken|Enter an amount|Say what)/)) return { message: raw };

  if (has(/timed out|timeout/i)) return { message: 'The Bitcoin Cash network is slow to answer. Check your connection and try again.', detail: raw };
  if (has(/missing or already spent|missingorspent|bad-txns-inputs-missingorspent|txn-mempool-conflict|UTXO not found/i))
    return { message: 'This payment was already settled, or the network hasn’t seen the lock yet. Refresh the page in a few seconds.', detail: raw };
  if (has(/min relay fee|insufficient priority|dust/i)) return { message: 'The network refused the fee. Try again; if it keeps happening, the amount may be too small.', detail: raw };
  if (has(/non-final|locktime/i)) return { message: 'The refund isn’t open yet. It unlocks at the deadline block.', detail: raw };
  if (has(/reject|declin|cancel/i)) return { message: 'The request was declined in the wallet. Nothing was sent.', detail: raw };
  if (has(/not connected|disconnect|relay/i)) return { message: 'Lost the connection to your wallet. Tap Connect and try again.', detail: raw };
  if (has(/websocket|network|fetch|ECONN|socket|electrum|connect/i)) return { message: 'Couldn’t reach the Bitcoin Cash network. Check your connection and try again.', detail: raw };
  return { message: `Something went wrong: ${raw.split('\n')[0].slice(0, 140)}`, detail };
}

/** Reject if a network call takes longer than `ms`, so no button spins forever. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    }),
  ]);
}
