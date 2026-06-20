'use strict';

const mongoose = require('mongoose');
const User = require('../../models/User');
const orderRepository = require('../../repositories/orderRepository');
const masterOrderRepository = require('../../repositories/masterOrderRepository');
const {
  pickDeliveryStaffName,
  pickUserAccountDeliveryStaffCode
} = require('../../domain/staff/staffIdentity');
const { roleMatches } = require('../../rules/staffRules');

const USER_DELIVERY_CODE_FIELDS = Object.freeze([
  'deliveryStaffCode',
  'shipperCode',
  'employeeCode',
  'maNhanVien',
  'code',
  'staffCode'
]);

function cleanText(value = '') {
  return String(value || '').trim();
}

function normalizeCodeKey(value = '') {
  return cleanText(value).toLocaleLowerCase('vi-VN');
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(cleanText)
    .filter(Boolean))];
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// returnOrders historical aliases are read-only compatibility fields.
// Generic staffCode/staffName are deliberately excluded because they are audit/operator data.
function pickReturnDeliveryStaffCode(source = {}) {
  return cleanText(
    source.deliveryStaffCode ||
    source.deliveryCode ||
    source.nvghCode ||
    ''
  );
}

function pickReturnDeliveryStaffName(source = {}) {
  return cleanText(
    source.deliveryStaffName ||
    source.deliveryName ||
    source.nvghName ||
    ''
  );
}

function buildDeliveryStaffDisplay(code = '', name = '') {
  const parts = [cleanText(code), cleanText(name)].filter(Boolean);
  return parts.length ? parts.join(' - ') : 'Chưa xác định';
}

function normalizeReturnOrderDeliveryStaff(row = {}, resolved = {}) {
  const deliveryStaffCode = cleanText(resolved.deliveryStaffCode || pickReturnDeliveryStaffCode(row));
  const deliveryStaffName = cleanText(resolved.deliveryStaffName || pickReturnDeliveryStaffName(row));
  return {
    ...row,
    deliveryStaffCode,
    deliveryStaffName,
    deliveryStaffDisplay: buildDeliveryStaffDisplay(deliveryStaffCode, deliveryStaffName)
  };
}

function salesOrderIdentityKeys(row = {}) {
  return uniqueStrings([
    row.salesOrderId,
    row.orderId,
    row.sourceOrderId,
    row.deliveryOrderId,
    row.salesOrderCode,
    row.orderCode,
    row.sourceOrderCode,
    row.deliveryOrderCode
  ]);
}

function masterOrderIdentityKeys(row = {}) {
  return uniqueStrings([
    row.masterOrderId,
    row.masterOrderCode,
    row.deliveryMasterId,
    row.deliveryMasterCode
  ]);
}

function addSalesOrderToIdentityMap(map, order = {}) {
  for (const key of uniqueStrings([
    order.id,
    order.code,
    order.documentCode,
    order.invoiceCode,
    order.orderCode,
    order.salesOrderCode
  ])) {
    map.set(normalizeCodeKey(key), order);
  }
}

function firstMappedDocument(keys = [], map = new Map()) {
  for (const key of keys) {
    const value = map.get(normalizeCodeKey(key));
    if (value) return value;
  }
  return null;
}

function deliveryCandidateFromLinkedDocuments(row = {}, salesOrderMap = new Map(), masterOrderMap = new Map()) {
  const masterOrder = firstMappedDocument(masterOrderIdentityKeys(row), masterOrderMap);
  const salesOrder = firstMappedDocument(salesOrderIdentityKeys(row), salesOrderMap);

  // masterOrder is the explicit delivery assignment document. Child salesOrders are
  // updated with the same NVGH during merge, so salesOrder remains the safe fallback.
  const sources = [masterOrder, salesOrder].filter(Boolean);
  for (const source of sources) {
    const code = pickReturnDeliveryStaffCode(source);
    const name = pickReturnDeliveryStaffName(source);
    if (code || name) return { code, name };
  }
  return { code: '', name: '' };
}

function allUserCodeKeys(user = {}) {
  return uniqueStrings(USER_DELIVERY_CODE_FIELDS.map((field) => user[field]));
}

function buildUserByCodeMap(users = []) {
  const map = new Map();
  for (const user of users || []) {
    const preferredCode = cleanText(pickUserAccountDeliveryStaffCode(user));
    const keys = uniqueStrings([preferredCode, ...allUserCodeKeys(user)]);
    for (const code of keys) {
      const key = normalizeCodeKey(code);
      const current = map.get(key);
      if (!current || (!roleMatches(current, 'delivery') && roleMatches(user, 'delivery'))) {
        map.set(key, user);
      }
    }
  }
  return map;
}

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

async function findDeliveryStaffUsersByCodes(codes = []) {
  const values = uniqueStrings(codes);
  if (!values.length || !isMongoReady()) return [];
  const exactCodes = new RegExp(`^(?:${values.map(escapeRegex).join('|')})$`, 'i');
  return User.find({
    isActive: { $ne: false },
    $or: USER_DELIVERY_CODE_FIELDS.map((field) => ({ [field]: exactCodes }))
  })
    .select('id code staffCode deliveryStaffCode deliveryStaffName shipperCode shipperName employeeCode employeeName maNhanVien name fullName role type position department roleLabel isDelivery isDeliveryStaff deliveryStaff isActive')
    .lean();
}

async function defaultFindSalesOrders(keys = []) {
  if (!isMongoReady()) return [];
  return orderRepository.findManyByIdentity(keys, {
    projection: {
      id: 1,
      code: 1,
      documentCode: 1,
      invoiceCode: 1,
      orderCode: 1,
      salesOrderCode: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
      deliveryCode: 1,
      deliveryName: 1,
      nvghCode: 1,
      nvghName: 1,
      shipperCode: 1,
      shipperName: 1
    },
    limit: Math.max(1, uniqueStrings(keys).length)
  });
}

async function defaultFindMasterOrders(keys = []) {
  if (!isMongoReady()) return [];
  const matches = await masterOrderRepository.findManyByIdentityMatches(keys, {
    projection: {
      _id: 1,
      id: 1,
      code: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
      deliveryCode: 1,
      deliveryName: 1,
      nvghCode: 1,
      nvghName: 1
    }
  });
  return matches || [];
}

async function hydrateReturnOrderDeliveryStaff(rows = [], dependencies = {}) {
  const inputRows = Array.isArray(rows) ? rows : [];
  if (!inputRows.length) return [];

  const incompleteRows = inputRows.filter((row) => {
    const code = pickReturnDeliveryStaffCode(row);
    const name = pickReturnDeliveryStaffName(row);
    return !code || !name;
  });

  if (!incompleteRows.length) {
    return inputRows.map((row) => normalizeReturnOrderDeliveryStaff(row));
  }

  const salesKeys = uniqueStrings(incompleteRows.flatMap(salesOrderIdentityKeys));
  const masterKeys = uniqueStrings(incompleteRows.flatMap(masterOrderIdentityKeys));
  const findSalesOrders = dependencies.findSalesOrders || defaultFindSalesOrders;
  const findMasterOrders = dependencies.findMasterOrders || defaultFindMasterOrders;
  const findUsers = dependencies.findUsers || findDeliveryStaffUsersByCodes;

  const [salesOrders, masterMatches] = await Promise.all([
    salesKeys.length ? findSalesOrders(salesKeys) : [],
    masterKeys.length ? findMasterOrders(masterKeys) : []
  ]);

  const salesOrderMap = new Map();
  for (const order of salesOrders || []) addSalesOrderToIdentityMap(salesOrderMap, order);

  const masterOrderMap = new Map();
  for (const match of masterMatches || []) {
    const order = match?.masterOrder || match;
    const keys = uniqueStrings([
      ...(Array.isArray(match?.identityKeys) ? match.identityKeys : []),
      order?.id,
      order?.code
    ]);
    for (const key of keys) masterOrderMap.set(normalizeCodeKey(key), order);
  }

  const candidates = inputRows.map((row) => {
    const directCode = pickReturnDeliveryStaffCode(row);
    const directName = pickReturnDeliveryStaffName(row);
    const linked = deliveryCandidateFromLinkedDocuments(row, salesOrderMap, masterOrderMap);

    if (directCode) {
      const linkedSameCode = linked.code && normalizeCodeKey(linked.code) === normalizeCodeKey(directCode);
      return {
        row,
        code: directCode,
        name: directName || (linkedSameCode ? linked.name : '')
      };
    }

    if (linked.code || linked.name) return { row, code: linked.code, name: linked.name };
    return { row, code: '', name: directName };
  });

  const codesNeedingUser = uniqueStrings(candidates
    .filter((candidate) => candidate.code && !candidate.name)
    .map((candidate) => candidate.code));
  const users = codesNeedingUser.length ? await findUsers(codesNeedingUser) : [];
  const userByCode = buildUserByCodeMap(users);

  return candidates.map(({ row, code, name }) => {
    let resolvedName = name;
    if (code && !resolvedName) {
      const user = userByCode.get(normalizeCodeKey(code));
      resolvedName = user ? cleanText(pickDeliveryStaffName(user)) : '';
    }
    return normalizeReturnOrderDeliveryStaff(row, {
      deliveryStaffCode: code,
      deliveryStaffName: resolvedName
    });
  });
}

module.exports = {
  USER_DELIVERY_CODE_FIELDS,
  pickReturnDeliveryStaffCode,
  pickReturnDeliveryStaffName,
  buildDeliveryStaffDisplay,
  normalizeReturnOrderDeliveryStaff,
  salesOrderIdentityKeys,
  masterOrderIdentityKeys,
  hydrateReturnOrderDeliveryStaff,
  findDeliveryStaffUsersByCodes
};
