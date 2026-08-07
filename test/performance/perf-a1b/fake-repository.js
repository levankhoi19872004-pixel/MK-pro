'use strict';

function clone(value) {
  return structuredClone(value);
}

class FakeRepository {
  constructor(fixtures, counter) {
    this.counter = counter;
    this.fixtureByInputRef = new Map();
    this.stateByOrderCode = new Map();
    for (const fixture of fixtures) {
      this.fixtureByInputRef.set(fixture.inputRef, fixture);
      if (!this.stateByOrderCode.has(fixture.canonicalOrderCode)) {
        this.stateByOrderCode.set(fixture.canonicalOrderCode, {
          fixture: clone(fixture),
          arBalance: fixture.currentArBalance,
          idempotencyLedger: fixture.existingIdempotency ? {
            id: `AR-IDEMP-${fixture.canonicalOrderCode}`,
            idempotencyKey: `DEBT-ADJ:${fixture.canonicalOrderCode}:v2`
          } : null,
          ledgers: [],
          versions: fixture.latestVersion ? [clone(fixture.latestVersion)] : [],
          allocation: fixture.allocation ? clone(fixture.allocation) : null,
          order: clone(fixture.order),
          returns: clone(fixture.returns)
        });
      }
    }
  }

  fixtureForInput(inputRef) {
    const fixture = this.fixtureByInputRef.get(inputRef);
    if (!fixture) throw new Error(`Unknown fixture input: ${inputRef}`);
    return fixture;
  }

  stateFor(orderCode) {
    const state = this.stateByOrderCode.get(orderCode);
    if (!state) throw new Error(`Unknown canonical order: ${orderCode}`);
    return state;
  }


  async batchFindOrders(inputRefs = []) {
    this.counter.record('batchFindOrders', { inputCount: inputRefs.length });
    const map = new Map();
    for (const inputRef of inputRefs) {
      const fixture = this.fixtureForInput(inputRef);
      map.set(inputRef, clone(this.stateFor(fixture.canonicalOrderCode).order));
    }
    return map;
  }

  async batchFindVersions(orderCodes = []) {
    this.counter.record('batchFindVersions', { orderCount: orderCodes.length });
    const map = new Map();
    for (const orderCode of orderCodes) {
      const versions = this.stateFor(orderCode).versions;
      map.set(orderCode, versions.length ? clone(versions[versions.length - 1]) : null);
    }
    return map;
  }

  async batchFindReturns(orderCodes = []) {
    this.counter.record('batchFindReturns', { orderCount: orderCodes.length });
    const map = new Map();
    for (const orderCode of orderCodes) map.set(orderCode, clone(this.stateFor(orderCode).returns));
    return map;
  }

  async batchFindAllocations(orderCodes = []) {
    this.counter.record('batchFindAllocations', { orderCount: orderCodes.length });
    const map = new Map();
    for (const orderCode of orderCodes) map.set(orderCode, clone(this.stateFor(orderCode).allocation));
    return map;
  }

  async batchFindArContext(orderCodes = []) {
    this.counter.record('batchFindArContext', { orderCount: orderCodes.length });
    const balanceByOrder = new Map();
    const idempotencyByOrder = new Map();
    for (const orderCode of orderCodes) {
      balanceByOrder.set(orderCode, this.stateFor(orderCode).arBalance);
      idempotencyByOrder.set(orderCode, clone(this.stateFor(orderCode).idempotencyLedger));
    }
    return { balanceByOrder, idempotencyByOrder };
  }

  async batchFindCorrectionIdempotency(orderCodes = []) {
    this.counter.record('batchFindCorrectionIdempotency', { orderCount: orderCodes.length });
    return new Map(orderCodes.map((orderCode) => [orderCode, null]));
  }

  async transactionStart(inputRef) {
    this.counter.record('transactionStart', { inputRef });
    return { id: `TX-${inputRef}` };
  }

  async transactionCommit(inputRef) {
    this.counter.record('transactionCommit', { inputRef });
  }

  async transactionAbort(inputRef, errorCode) {
    this.counter.record('transactionAbort', { inputRef, errorCode });
  }

  async findOrder(inputRef, stage = 'context') {
    this.counter.record('findOrder', { inputRef, stage });
    const fixture = this.fixtureForInput(inputRef);
    return clone(this.stateFor(fixture.canonicalOrderCode).order);
  }

  async findLatestVersion(orderCode, stage = 'context') {
    this.counter.record('findLatestVersion', { orderCode, stage });
    const versions = this.stateFor(orderCode).versions;
    return versions.length ? clone(versions[versions.length - 1]) : null;
  }

  async findReturns(orderCode, stage = 'context') {
    this.counter.record('findReturns', { orderCode, stage });
    return clone(this.stateFor(orderCode).returns);
  }

  async findAllocation(orderCode, stage = 'context') {
    this.counter.record('findAllocation', { orderCode, stage });
    return clone(this.stateFor(orderCode).allocation);
  }

  async findArBalance(orderCode, stage) {
    this.counter.record('findArBalance', { orderCode, stage });
    return this.stateFor(orderCode).arBalance;
  }

  async findIdempotency(orderCode, stage) {
    this.counter.record('findIdempotency', { orderCode, stage });
    return clone(this.stateFor(orderCode).idempotencyLedger);
  }

  async updateOrder(orderCode, patch = {}) {
    this.counter.record('updateOrder', { orderCode, stage: 'correction' });
    Object.assign(this.stateFor(orderCode).order, clone(patch));
  }

  async insertVersion(orderCode, version) {
    this.counter.record('insertVersion', { orderCode, stage: 'correction' });
    this.stateFor(orderCode).versions.push(clone(version));
  }

  async upsertAllocation(orderCode, allocation) {
    this.counter.record('upsertAllocation', { orderCode, stage: 'correction' });
    this.stateFor(orderCode).allocation = clone(allocation);
  }

  async postLedger(orderCode, ledger) {
    this.counter.record('postLedger', { orderCode, stage: 'reconcile' });
    const state = this.stateFor(orderCode);
    state.ledgers.push(clone(ledger));
    state.idempotencyLedger = clone(ledger);
    state.arBalance += Number(ledger.deltaDebt || 0);
    return clone(ledger);
  }

  snapshot(orderCode) {
    const state = this.stateFor(orderCode);
    return clone({
      order: state.order,
      returns: state.returns,
      allocation: state.allocation,
      arBalance: state.arBalance,
      ledgers: state.ledgers,
      versions: state.versions,
      idempotencyLedger: state.idempotencyLedger
    });
  }
}

module.exports = { FakeRepository };
