'use strict';

const {
  getSourceContract,
  validateSourceContract
} = require('./SourceContractRegistry');

function userDisplayName(user = {}) {
  return String(user.fullName || user.name || user.username || user.email || user.code || user.staffCode || user.role || 'system').trim() || 'system';
}

function normalizeWarnings(...groups) {
  const out = [];
  for (const group of groups) {
    if (!group) continue;
    if (Array.isArray(group)) {
      for (const item of group) if (item) out.push(String(item));
    } else if (typeof group === 'object') {
      for (const value of Object.values(group)) {
        if (Array.isArray(value)) out.push(...value.filter(Boolean).map(String));
        else if (value) out.push(String(value));
      }
    } else {
      out.push(String(group));
    }
  }
  return [...new Set(out.filter(Boolean))];
}

function sanitizeFilters(filters = {}) {
  const hidden = new Set(['password', 'token', 'authorization', 'jwt', 'secret']);
  const out = {};
  for (const [key, value] of Object.entries(filters || {})) {
    if (hidden.has(String(key).toLowerCase())) continue;
    if (value === undefined || typeof value === 'function') continue;
    out[key] = value;
  }
  return out;
}

function buildSourceNote(contractCode, options = {}) {
  const contract = getSourceContract(contractCode);
  const sourceWarnings = normalizeWarnings(options.sourceWarnings);
  const dataQualityWarnings = normalizeWarnings(options.dataQualityWarnings);
  const validation = validateSourceContract(contractCode, {
    sourceStatus: options.sourceStatus || contract.sourceStatus,
    sourceWarnings,
    dataQualityWarnings
  });
  sourceWarnings.push(...(validation.warnings || []));
  const requestedStatus = String(options.sourceStatus || contract.sourceStatus || 'OK').toUpperCase();
  const sourceStatus = requestedStatus === 'ERROR'
    ? 'ERROR'
    : (sourceWarnings.length || dataQualityWarnings.length || requestedStatus === 'WARNING' ? 'WARNING' : 'OK');

  return {
    code: contract.code,
    contractCode: contract.code,
    module: contract.module,
    title: contract.title,

    endpoint: options.endpoint || contract.endpoint,
    exportEndpoint: options.exportEndpoint !== undefined ? options.exportEndpoint : contract.exportEndpoint,
    service: options.service || contract.service,

    primaryCollections: [...contract.primaryCollections],
    secondaryCollections: [...contract.secondaryCollections],
    forbiddenCollections: [...contract.forbiddenCollections],

    sourceLabel: contract.sourceLabel,
    ssotRule: contract.ssotRule,

    amountSource: contract.amountSource,
    debtSource: contract.debtSource,
    inventorySource: contract.inventorySource,
    fundSource: contract.fundSource,
    deliverySource: contract.deliverySource,
    importSource: contract.importSource,

    fileSource: options.fileSource || contract.fileSource,
    parserService: options.parserService || contract.parserService,
    mapperService: options.mapperService || contract.mapperService,
    validationRule: options.validationRule || contract.validationRule,
    targetCollections: [...contract.targetCollections],
    skipErrorPolicy: options.skipErrorPolicy || contract.skipErrorPolicy,

    filters: sanitizeFilters(options.filters || {}),
    generatedAt: options.generatedAt || new Date().toISOString(),
    generatedBy: userDisplayName(options.generatedBy || options.user || {}),

    visibleOnUi: options.visibleOnUi !== undefined ? Boolean(options.visibleOnUi) : contract.visibleOnUi,
    visibleInExcel: options.visibleInExcel !== undefined ? Boolean(options.visibleInExcel) : contract.visibleInExcel,
    visibleForRoles: [...contract.visibleForRoles],
    defaultCollapsed: options.defaultCollapsed !== undefined ? Boolean(options.defaultCollapsed) : contract.defaultCollapsed,

    sourceStatus,
    sourceWarnings: [...new Set(sourceWarnings)],
    dataQualityWarnings: [...new Set(dataQualityWarnings)]
  };
}

module.exports = {
  buildSourceNote,
  validateSourceContract,
  sanitizeFilters
};
