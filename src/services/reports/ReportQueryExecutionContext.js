'use strict';
function contextOf(query = {}, explicit = {}) { return explicit && explicit.signal ? explicit : (query && query.__executionContext) || {}; }
function applyAggregate(aggregate, context = {}) {
  if (!aggregate) return aggregate;
  const options = {};
  if (Number.isFinite(Number(context.maxTimeMS)) && Number(context.maxTimeMS) > 0) options.maxTimeMS = Number(context.maxTimeMS);
  if (context.signal) options.signal = context.signal;
  return Object.keys(options).length && typeof aggregate.option === 'function' ? aggregate.option(options) : aggregate;
}
function applyQuery(query, context = {}) {
  if (!query) return query;
  let current = query;
  if (Number.isFinite(Number(context.maxTimeMS)) && Number(context.maxTimeMS) > 0 && typeof current.maxTimeMS === 'function') current = current.maxTimeMS(Number(context.maxTimeMS));
  if (context.signal && typeof current.setOptions === 'function') current = current.setOptions({ signal: context.signal });
  return current;
}
module.exports = { contextOf, applyAggregate, applyQuery };
