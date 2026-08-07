'use strict';

const Identity = require('./financial/deliveryFinancialIdentity');

const VERSION_IDENTITY_FIELDS = Object.freeze([
  'salesOrderId', 'orderId', 'salesOrderCode', 'orderCode', 'originalCloseoutId', 'originalCloseoutCode'
]);
const ALLOCATION_IDENTITY_FIELDS = Object.freeze([
  'orderId', 'salesOrderId', 'orderCode', 'salesOrderCode', 'sourceId', 'sourceCode'
]);

function text(value = '') {
  return String(value ?? '').trim();
}

function nestedIfNull(fields = [], fallback = '') {
  return {
    $ifNull: [
      {
        $reduce: {
          input: fields.map((field) => `$${field}`),
          initialValue: null,
          in: {
            $cond: [
              { $and: [{ $ne: ['$$value', null] }, { $ne: ['$$value', ''] }] },
              '$$value',
              {
                $cond: [
                  { $and: [{ $ne: ['$$this', null] }, { $ne: ['$$this', ''] }] },
                  '$$this',
                  '$$value'
                ]
              }
            ]
          }
        }
      },
      fallback
    ]
  };
}

function projectionObject(projection = '') {
  return Object.fromEntries(String(projection || '').split(/\s+/).filter(Boolean).map((field) => [field, 1]));
}

function latestGroupPipeline(match = {}, options = {}) {
  const identityFields = options.identityFields || VERSION_IDENTITY_FIELDS;
  const versionFields = options.versionFields || ['closeoutVersion', 'sourceVersion', 'version'];
  const project = projectionObject(options.projection);
  const pipeline = [
    { $match: match },
    {
      $addFields: {
        _perfIdentity: nestedIfNull(identityFields, ''),
        _perfVersion: nestedIfNull(versionFields, 0)
      }
    },
    { $match: { _perfIdentity: { $nin: ['', null] } } },
    {
      $sort: {
        tenantId: 1,
        _perfIdentity: 1,
        _perfVersion: -1,
        postedAt: -1,
        updatedAt: -1,
        createdAt: -1,
        _id: -1
      }
    },
    {
      $group: {
        _id: { tenantId: '$tenantId', identity: '$_perfIdentity', version: '$_perfVersion' },
        rows: { $push: '$$ROOT' }
      }
    },
    { $sort: { '_id.tenantId': 1, '_id.identity': 1, '_id.version': -1 } },
    {
      $group: {
        _id: { tenantId: '$_id.tenantId', identity: '$_id.identity' },
        latestVersionGroup: { $first: '$$ROOT' }
      }
    },
    { $unwind: '$latestVersionGroup.rows' },
    { $replaceRoot: { newRoot: '$latestVersionGroup.rows' } }
  ];
  if (Object.keys(project).length) pipeline.push({ $project: project });
  return pipeline;
}

async function executeAggregate(model, pipeline = [], options = {}) {
  if (!model || typeof model.aggregate !== 'function') return null;
  let aggregate = model.aggregate(pipeline);
  if (options.session && aggregate && typeof aggregate.session === 'function') aggregate = aggregate.session(options.session);
  if (aggregate && typeof aggregate.allowDiskUse === 'function') aggregate = aggregate.allowDiskUse(true);
  const rows = aggregate && typeof aggregate.exec === 'function' ? await aggregate.exec() : await aggregate;
  return Array.isArray(rows) ? rows : [];
}

function effectiveVersionForOrder(order = {}, effectiveVersionsByIdentity = new Map()) {
  for (const raw of Identity.rawIdentityValues(order)) {
    const value = Number(effectiveVersionsByIdentity.get(raw) || 0);
    if (value > 0) return value;
  }
  for (const entry of Identity.typedIdentityEntries(order)) {
    const value = Number(effectiveVersionsByIdentity.get(entry.key) || effectiveVersionsByIdentity.get(entry.value) || 0);
    if (value > 0) return value;
  }
  return 0;
}

function exactAllocationFilter(baseMatch = {}, orders = [], effectiveVersionsByIdentity = new Map()) {
  const clauses = [];
  for (const order of orders || []) {
    const effectiveVersion = effectiveVersionForOrder(order, effectiveVersionsByIdentity);
    if (!effectiveVersion) continue;
    const ids = Array.from(new Set(Identity.rawIdentityValues(order).filter(Boolean)));
    if (!ids.length) continue;
    clauses.push({
      $and: [
        {
          $or: ALLOCATION_IDENTITY_FIELDS.map((field) => ({ [field]: { $in: ids } }))
        },
        { $or: [{ sourceVersion: effectiveVersion }, { version: effectiveVersion }] }
      ]
    });
  }
  if (!clauses.length) return null;
  return { $and: [baseMatch, { $or: clauses }] };
}

function rowIdentity(row = {}, index = 0) {
  return text(row._id || row.id || row.allocationCode || row.code) || `row:${index}`;
}

function mergeRows(...groups) {
  const seen = new Set();
  const result = [];
  groups.flat().forEach((row, index) => {
    const key = rowIdentity(row, index);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(row);
  });
  return result;
}

async function loadLatestVersionRows(model, match = {}, options = {}) {
  return executeAggregate(model, latestGroupPipeline(match, {
    identityFields: VERSION_IDENTITY_FIELDS,
    versionFields: ['closeoutVersion', 'sourceVersion', 'version'],
    projection: options.projection
  }), options);
}

async function loadAllocationRows(model, baseMatch = {}, orders = [], effectiveVersionsByIdentity = new Map(), options = {}) {
  if (!model || typeof model.aggregate !== 'function') return null;
  const highestPipeline = latestGroupPipeline(baseMatch, {
    identityFields: ALLOCATION_IDENTITY_FIELDS,
    versionFields: ['sourceVersion', 'version'],
    projection: options.projection
  });
  const exactFilter = exactAllocationFilter(baseMatch, orders, effectiveVersionsByIdentity);
  const exactPipeline = exactFilter
    ? [{ $match: exactFilter }, ...(Object.keys(projectionObject(options.projection)).length ? [{ $project: projectionObject(options.projection) }] : [])]
    : null;
  const [highestRows, exactRows] = await Promise.all([
    executeAggregate(model, highestPipeline, options),
    exactPipeline ? executeAggregate(model, exactPipeline, options) : Promise.resolve([])
  ]);
  return mergeRows(highestRows || [], exactRows || []);
}

module.exports = {
  VERSION_IDENTITY_FIELDS,
  ALLOCATION_IDENTITY_FIELDS,
  latestGroupPipeline,
  exactAllocationFilter,
  loadLatestVersionRows,
  loadAllocationRows,
  effectiveVersionForOrder,
  mergeRows,
  _private: { nestedIfNull, projectionObject, executeAggregate, rowIdentity }
};
