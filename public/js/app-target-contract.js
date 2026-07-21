(function (root, factory) {
  'use strict';
  var contract = factory();
  if (typeof module === 'object' && module.exports) module.exports = contract;
  if (root) root.AppTargetContract = contract;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var TARGET_LIST = Object.freeze([
    Object.freeze({
      key: 'web',
      label: 'Phần mềm quản trị',
      shortLabel: 'Phần mềm',
      url: '/',
      allowedRoles: Object.freeze(['admin', 'manager', 'accountant', 'warehouse']),
      order: 10,
      showInSelect: true,
      showInQuickLinks: true
    }),
    Object.freeze({
      key: 'sales',
      label: 'App bán hàng',
      shortLabel: 'Bán hàng',
      url: '/mobile/sales.html',
      allowedRoles: Object.freeze(['admin', 'sales']),
      order: 20,
      showInSelect: true,
      showInQuickLinks: true
    }),
    Object.freeze({
      key: 'delivery',
      label: 'App giao hàng',
      shortLabel: 'Giao hàng',
      url: '/mobile/delivery.html',
      allowedRoles: Object.freeze(['admin', 'delivery']),
      order: 30,
      showInSelect: true,
      showInQuickLinks: true
    }),
    Object.freeze({
      key: 'warehouse',
      label: 'App thủ kho',
      shortLabel: 'Thủ kho',
      url: '/mobile/warehouse.html',
      allowedRoles: Object.freeze(['admin', 'warehouse']),
      order: 40,
      showInSelect: true,
      showInQuickLinks: true
    })
  ]);

  var APP_TARGETS = Object.freeze(TARGET_LIST.reduce(function (acc, target) {
    acc[target.key] = target;
    return acc;
  }, {}));

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
  }

  function normalizeTargetKey(targetKey) {
    return String(targetKey || '').trim().toLowerCase();
  }

  function cloneTarget(target) {
    if (!target) return null;
    return Object.freeze({
      key: target.key,
      label: target.label,
      shortLabel: target.shortLabel,
      url: target.url,
      allowedRoles: Object.freeze(target.allowedRoles.slice()),
      order: target.order,
      showInSelect: target.showInSelect,
      showInQuickLinks: target.showInQuickLinks
    });
  }

  function listTargets(filterName) {
    return Object.freeze(TARGET_LIST
      .filter(function (target) {
        if (filterName === 'select') return target.showInSelect;
        if (filterName === 'quickLinks') return target.showInQuickLinks;
        return true;
      })
      .sort(function (a, b) { return a.order - b.order; })
      .map(cloneTarget));
  }

  function getAppTarget(targetKey) {
    var key = normalizeTargetKey(targetKey);
    if (!Object.prototype.hasOwnProperty.call(APP_TARGETS, key)) return null;
    return cloneTarget(APP_TARGETS[key]);
  }

  function canRoleOpenTarget(role, targetKey) {
    var target = APP_TARGETS[normalizeTargetKey(targetKey)];
    var normalizedRole = normalizeRole(role);
    if (!target || !normalizedRole) return false;
    return target.allowedRoles.indexOf(normalizedRole) >= 0;
  }

  function getTargetUrl(targetKey) {
    var target = APP_TARGETS[normalizeTargetKey(targetKey)];
    return target ? target.url : null;
  }

  function listVisibleTargets() {
    return listTargets();
  }

  function listSelectTargets() {
    return listTargets('select');
  }

  function listQuickLinkTargets() {
    return listTargets('quickLinks');
  }

  return Object.freeze({
    APP_TARGETS: APP_TARGETS,
    normalizeRole: normalizeRole,
    normalizeTargetKey: normalizeTargetKey,
    getAppTarget: getAppTarget,
    canRoleOpenTarget: canRoleOpenTarget,
    getTargetUrl: getTargetUrl,
    listVisibleTargets: listVisibleTargets,
    listSelectTargets: listSelectTargets,
    listQuickLinkTargets: listQuickLinkTargets
  });
});
