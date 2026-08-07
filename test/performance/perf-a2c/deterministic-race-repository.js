'use strict';

function createBarrier(parties) {
  let arrived = 0;
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  return async function barrier() {
    arrived += 1;
    if (arrived === parties) release();
    await wait;
  };
}

class NaiveLedgerRepository {
  constructor() {
    this.rows = [];
    this.afterPrecheck = createBarrier(2);
  }

  async findByKey(key) {
    return this.rows.find((row) => row.idempotencyKey === key) || null;
  }

  async postWithPrecheck(entry) {
    const existing = await this.findByKey(entry.idempotencyKey);
    await this.afterPrecheck();
    if (existing) return existing;
    const row = { ...entry, _id: `ledger-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
}

module.exports = { createBarrier, NaiveLedgerRepository };
