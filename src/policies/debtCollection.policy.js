'use strict';

function text(value) {
  return String(value || '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function cleanPermission(value) {
  return lower(value).replace(/\s+/g, '');
}

function listPermissions(user = {}) {
  const raw = [];
  for (const key of ['permissions', 'permission', 'scopes', 'scope', 'claims']) {
    const value = user[key];
    if (Array.isArray(value)) raw.push(...value);
    else if (typeof value === 'string') raw.push(...value.split(/[;,\s]+/));
  }
  return raw.map(cleanPermission).filter(Boolean);
}

function hasAnyPermission(user = {}, permissions = []) {
  const granted = new Set(listPermissions(user));
  return permissions.some((permission) => granted.has(cleanPermission(permission)));
}

const PRIVILEGED_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super_admin',
  'accountant',
  'accounting',
  'finance',
  'ketoan',
  'ke_toan',
  'kế toán'
]);

const ANY_COLLECTION_PERMISSIONS = [
  'ar:collection:create:any',
  'debt:collection:create:any',
  'debtCollection:create:any',
  'debt-collection:create:any',
  'accounting:debtCollection:create:any'
];

function roleOf(user = {}) {
  return lower(user.role || user.roleCode || user.type || user.userRole);
}

function isPrivilegedDebtCollectionUser(user = {}) {
  const role = roleOf(user);
  if (PRIVILEGED_ROLES.has(role)) return true;
  return hasAnyPermission(user, ANY_COLLECTION_PERMISSIONS);
}

function staffCodeOf(user = {}, collector = {}) {
  return text(
    collector.collectorCode
    || user.staffCode
    || user.code
    || user.salesStaffCode
    || user.salesmanCode
    || user.nvbhCode
    || user.deliveryStaffCode
    || user.shipperCode
    || user.nvghCode
  );
}

function staffNameOf(user = {}, collector = {}) {
  return text(
    collector.collectorName
    || user.fullName
    || user.name
    || user.username
    || user.salesStaffName
    || user.salesmanName
    || user.nvbhName
    || user.deliveryStaffName
    || user.shipperName
    || user.nvghName
  );
}

function assignmentFromDebtOrder(debtOrder = {}) {
  return {
    salesStaffCode: text(debtOrder.salesStaffCode || debtOrder.salesmanCode || debtOrder.nvbhCode),
    salesStaffName: text(debtOrder.salesStaffName || debtOrder.salesmanName || debtOrder.nvbhName),
    deliveryStaffCode: text(debtOrder.deliveryStaffCode || debtOrder.deliveryCode || debtOrder.nvghCode || debtOrder.shipperCode),
    deliveryStaffName: text(debtOrder.deliveryStaffName || debtOrder.deliveryName || debtOrder.nvghName || debtOrder.shipperName)
  };
}

function sameIdentity(expected = '', actual = '') {
  const a = lower(expected);
  const b = lower(actual);
  return Boolean(a && b && a === b);
}

function matchesSalesOwner(user = {}, debtOrder = {}, collector = {}) {
  const assignment = assignmentFromDebtOrder(debtOrder);
  const code = staffCodeOf(user, collector);
  const name = staffNameOf(user, collector);
  return sameIdentity(code, assignment.salesStaffCode) || sameIdentity(name, assignment.salesStaffName);
}

function matchesDeliveryOwner(user = {}, debtOrder = {}, collector = {}) {
  const assignment = assignmentFromDebtOrder(debtOrder);
  const code = staffCodeOf(user, collector);
  const name = staffNameOf(user, collector);
  return sameIdentity(code, assignment.deliveryStaffCode) || sameIdentity(name, assignment.deliveryStaffName);
}

function canCreateDebtCollection(user = {}, debtOrder = {}, options = {}) {
  const role = roleOf(user);
  const collector = options.collector || {};

  if (isPrivilegedDebtCollectionUser(user)) {
    return { allowed: true, scope: 'all', reason: 'privileged_role_or_permission' };
  }

  if (role === 'delivery' || role === 'shipper' || role === 'driver' || role === 'nvgh') {
    return matchesDeliveryOwner(user, debtOrder, collector)
      ? { allowed: true, scope: 'own', reason: 'delivery_owner' }
      : { allowed: false, scope: 'own', reason: 'delivery_order_not_owned' };
  }

  if (role === 'sales' || role === 'salesman' || role === 'nvbh') {
    return matchesSalesOwner(user, debtOrder, collector)
      ? { allowed: true, scope: 'own', reason: 'sales_owner' }
      : { allowed: false, scope: 'own', reason: 'sales_order_not_owned' };
  }

  if (role === 'manager') {
    return hasAnyPermission(user, ANY_COLLECTION_PERMISSIONS)
      ? { allowed: true, scope: 'all', reason: 'manager_with_ar_collection_permission' }
      : { allowed: false, scope: 'none', reason: 'manager_missing_ar_collection_create_any_permission' };
  }

  return { allowed: false, scope: 'none', reason: 'missing_debt_collection_permission' };
}

function debtCollectionCreateScopeForUser(user = {}, body = {}, collector = {}) {
  if (isPrivilegedDebtCollectionUser(user)) {
    return { allowed: true, scope: 'all', queryScope: {}, reason: 'privileged_role_or_permission' };
  }

  const role = roleOf(user);
  const code = staffCodeOf(user, collector);
  if ((role === 'delivery' || role === 'shipper' || role === 'driver' || role === 'nvgh') && code) {
    return { allowed: true, scope: 'own', queryScope: { delivery: code }, reason: 'delivery_owner_scope' };
  }
  if ((role === 'sales' || role === 'salesman' || role === 'nvbh') && code) {
    return { allowed: true, scope: 'own', queryScope: { salesman: code }, reason: 'sales_owner_scope' };
  }
  if (role === 'manager' && hasAnyPermission(user, ANY_COLLECTION_PERMISSIONS)) {
    return { allowed: true, scope: 'all', queryScope: {}, reason: 'manager_with_ar_collection_permission' };
  }

  return { allowed: false, scope: 'none', queryScope: {}, reason: code ? 'missing_debt_collection_permission' : 'missing_collector_code' };
}

module.exports = {
  ANY_COLLECTION_PERMISSIONS,
  canCreateDebtCollection,
  debtCollectionCreateScopeForUser,
  hasAnyPermission,
  isPrivilegedDebtCollectionUser,
  _internal: {
    assignmentFromDebtOrder,
    listPermissions,
    roleOf,
    staffCodeOf,
    staffNameOf
  }
};
