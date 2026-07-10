'use strict';

function clean(value = '') { return String(value ?? '').trim(); }

function getPath(row, path) {
  return String(path).split('.').reduce((acc, key) => acc?.[key], row);
}

function matchesValue(actual, expected) {
  if (expected instanceof RegExp) return expected.test(clean(actual));
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$in' in expected) return expected.$in.some((item) => matchesValue(actual, item));
    if ('$nin' in expected) return !expected.$nin.some((item) => matchesValue(actual, item));
    if ('$ne' in expected) return !matchesValue(actual, expected.$ne);
    if ('$exists' in expected) return expected.$exists ? actual !== undefined : actual === undefined;
    if ('$type' in expected) {
      if (expected.$type === 'string') return typeof actual === 'string';
      return true;
    }
    if ('$gt' in expected) return clean(actual) > expected.$gt;
  }
  return actual === expected;
}

function matches(row, filter = {}) {
  for (const [key, expected] of Object.entries(filter || {})) {
    if (key === '$or') {
      if (!expected.some((part) => matches(row, part))) return false;
      continue;
    }
    if (key === '$and') {
      if (!expected.every((part) => matches(row, part))) return false;
      continue;
    }
    if (!matchesValue(getPath(row, key), expected)) return false;
  }
  return true;
}

function applySet(row, update = {}) {
  if ('$setOnInsert' in update || '$set' in update || '$push' in update) {
    if (update.$set) Object.assign(row, update.$set);
    if (update.$push) {
      for (const [field, value] of Object.entries(update.$push)) {
        if (!Array.isArray(row[field])) row[field] = [];
        row[field].push(value);
      }
    }
  } else {
    Object.assign(row, update);
  }
  return row;
}

function makeQuery(value) {
  return {
    session() { return this; },
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean() { return Promise.resolve(value); },
    exec() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

class FakeModel {
  constructor(rows = []) {
    this.rows = rows;
    this.created = [];
  }

  find(filter = {}) {
    return makeQuery(this.rows.filter((row) => matches(row, filter)));
  }

  findOne(filter = {}) {
    return makeQuery(this.rows.find((row) => matches(row, filter)) || null);
  }

  findOneAndUpdate(filter = {}, update = {}, options = {}) {
    let row = this.rows.find((item) => matches(item, filter));
    if (!row && options.upsert) {
      row = { ...(update.$setOnInsert || update.$set || update || {}) };
      this.rows.push(row);
    } else if (row) {
      applySet(row, update);
    }
    return makeQuery(row || null);
  }

  updateOne(filter = {}, update = {}) {
    const row = this.rows.find((item) => matches(item, filter));
    if (row) applySet(row, update);
    return Promise.resolve({ matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0 });
  }

  deleteMany(filter = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matches(row, filter));
    return Promise.resolve({ deletedCount: before - this.rows.length });
  }

  insertMany(rows = []) {
    this.rows.push(...rows.map((row) => ({ ...row })));
    return Promise.resolve(rows);
  }

  create(rows = []) {
    const list = Array.isArray(rows) ? rows : [rows];
    this.created.push(...list);
    return Promise.resolve(list);
  }
}

function b0038423Order(overrides = {}) {
  return {
    id: 'SO1782550380164673',
    salesOrderId: 'SO1782550380164673',
    code: 'B0038423',
    orderCode: 'B0038423',
    salesOrderCode: 'B0038423',
    customerCode: '4501221',
    customerName: 'Chị Hương',
    masterOrderId: 'MO1782550618236269',
    masterOrderCode: 'DT1782550618236397',
    salesStaffCode: '35095',
    deliveryStaffCode: 'ghth',
    amount: 10402373,
    date: '2026-06-29',
    deliveryStatus: 'delivered',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    ...overrides
  };
}

module.exports = { FakeModel, matches, b0038423Order };
