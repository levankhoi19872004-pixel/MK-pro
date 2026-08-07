'use strict';

function valueAt(row, path) {
  return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], row);
}

function compareScalar(value, expected) {
  if (expected instanceof RegExp) return expected.test(String(value ?? ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    for (const [operator, operand] of Object.entries(expected)) {
      if (operator === '$in' && !operand.some((item) => compareScalar(value, item))) return false;
      if (operator === '$nin' && operand.some((item) => compareScalar(value, item))) return false;
      if (operator === '$ne' && compareScalar(value, operand)) return false;
      if (operator === '$eq' && !compareScalar(value, operand)) return false;
      if (operator === '$exists' && Boolean(value !== undefined) !== Boolean(operand)) return false;
      if (operator === '$gt' && !(value > operand)) return false;
      if (operator === '$gte' && !(value >= operand)) return false;
      if (operator === '$lt' && !(value < operand)) return false;
      if (operator === '$lte' && !(value <= operand)) return false;
      if (!operator.startsWith('$') && !compareScalar(value && value[operator], operand)) return false;
    }
    return true;
  }
  if (value instanceof Date || expected instanceof Date) return new Date(value).getTime() === new Date(expected).getTime();
  return String(value ?? '') === String(expected ?? '');
}

function matches(row, filter = {}) {
  for (const [key, expected] of Object.entries(filter || {})) {
    if (key === '$and') {
      if (!expected.every((part) => matches(row, part))) return false;
      continue;
    }
    if (key === '$or') {
      if (!expected.some((part) => matches(row, part))) return false;
      continue;
    }
    if (key === '$nor') {
      if (expected.some((part) => matches(row, part))) return false;
      continue;
    }
    if (!compareScalar(valueAt(row, key), expected)) return false;
  }
  return true;
}

function compareRows(sort = {}) {
  const entries = Object.entries(sort);
  return (left, right) => {
    for (const [field, direction] of entries) {
      const a = valueAt(left, field);
      const b = valueAt(right, field);
      const av = a instanceof Date ? a.getTime() : (a ?? '');
      const bv = b instanceof Date ? b.getTime() : (b ?? '');
      if (av === bv) continue;
      return (av < bv ? -1 : 1) * Number(direction || 1);
    }
    return 0;
  };
}

class FakeQuery {
  constructor(model, filter) {
    this.model = model;
    this.filter = filter || {};
    this.sortSpec = null;
    this.limitValue = null;
    this.skipValue = 0;
  }
  select() { return this; }
  sort(spec) { this.sortSpec = spec; return this; }
  limit(value) { this.limitValue = Number(value); return this; }
  skip(value) { this.skipValue = Number(value); return this; }
  session() { return this; }
  async lean() { return this.exec(); }
  async exec() {
    const matched = this.model.rows.filter((row) => matches(row, this.filter));
    const sorted = this.sortSpec ? matched.slice().sort(compareRows(this.sortSpec)) : matched.slice();
    const sliced = sorted.slice(this.skipValue, this.limitValue == null ? undefined : this.skipValue + this.limitValue);
    this.model.metrics.queries += 1;
    this.model.metrics.rowsMatched += matched.length;
    this.model.metrics.rowsReturned += sliced.length;
    this.model.metrics.queryLog.push({ filter: this.filter, sort: this.sortSpec, skip: this.skipValue, limit: this.limitValue, matched: matched.length, returned: sliced.length });
    return sliced.map((row) => ({ ...row }));
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
}


function firstDefined(row, fields = []) {
  for (const field of fields) {
    const value = valueAt(row, field);
    if (value !== undefined && value !== null && String(value) !== '') return value;
  }
  return '';
}

class FakeAggregate {
  constructor(model, pipeline = []) {
    this.model = model;
    this.pipeline = pipeline;
  }
  session() { return this; }
  allowDiskUse() { return this; }
  async exec() {
    const firstMatch = this.pipeline.find((stage) => stage.$match);
    let rows = this.model.rows.filter((row) => matches(row, firstMatch ? firstMatch.$match : {}));
    this.model.metrics.queries += 1;
    this.model.metrics.aggregateInputRows += rows.length;
    const isLatestGrouping = this.pipeline.some((stage) => stage.$group && stage.$group.latestVersionGroup);
    if (isLatestGrouping) {
      const versionMode = rows.some((row) => row.closeoutVersion !== undefined) ? 'version' : 'allocation';
      const identityFields = versionMode === 'version'
        ? ['salesOrderId', 'orderId', 'salesOrderCode', 'orderCode', 'originalCloseoutId', 'originalCloseoutCode']
        : ['orderId', 'salesOrderId', 'orderCode', 'salesOrderCode', 'sourceId', 'sourceCode'];
      const versionFields = versionMode === 'version'
        ? ['closeoutVersion', 'sourceVersion', 'version']
        : ['sourceVersion', 'version'];
      const groups = new Map();
      rows.forEach((row) => {
        const identity = String(firstDefined(row, identityFields));
        if (!identity) return;
        const tenant = String(row.tenantId || '');
        const version = Number(firstDefined(row, versionFields) || 0);
        const key = `${tenant}|${identity}`;
        const current = groups.get(key);
        if (!current || version > current.version) groups.set(key, { version, rows: [row] });
        else if (version === current.version) current.rows.push(row);
      });
      rows = Array.from(groups.values()).flatMap((group) => group.rows);
    }
    const lastMatch = [...this.pipeline].reverse().find((stage) => stage.$match);
    if (!isLatestGrouping && lastMatch && lastMatch !== firstMatch) rows = rows.filter((row) => matches(row, lastMatch.$match));
    this.model.metrics.aggregateOutputRows += rows.length;
    this.model.metrics.queryLog.push({ aggregate: true, stages: this.pipeline.map((stage) => Object.keys(stage)[0]), matched: this.model.metrics.aggregateInputRows, returned: rows.length });
    return rows.map((row) => ({ ...row }));
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
}

class FakeModel {
  constructor(rows = [], name = 'FakeModel') {
    this.rows = rows;
    this.modelName = name;
    this.metrics = { queries: 0, rowsMatched: 0, rowsReturned: 0, aggregateInputRows: 0, aggregateOutputRows: 0, queryLog: [] };
  }
  find(filter) { return new FakeQuery(this, filter); }
  aggregate(pipeline) { return new FakeAggregate(this, pipeline); }
}

module.exports = { FakeModel, FakeQuery, FakeAggregate, matches, compareRows, valueAt, firstDefined };
