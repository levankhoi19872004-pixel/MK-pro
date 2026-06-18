'use strict';

const DEFAULT_TENANT_ID = String(process.env.DEFAULT_TENANT_ID || 'minh-khai').trim() || 'minh-khai';

function normalizeTenantId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64);
}

function tenantIdOf(input = {}) {
  return normalizeTenantId(
    input.tenantId ||
    input.tenant?.id ||
    input.user?.tenantId ||
    input.auth?.tenantId ||
    DEFAULT_TENANT_ID
  ) || DEFAULT_TENANT_ID;
}

function scopeTenant(filter = {}, tenantId = DEFAULT_TENANT_ID) {
  return { ...filter, tenantId: tenantIdOf({ tenantId }) };
}

function stampTenant(document = {}, tenantId = DEFAULT_TENANT_ID) {
  return { ...document, tenantId: tenantIdOf({ tenantId }) };
}

module.exports = {
  DEFAULT_TENANT_ID,
  normalizeTenantId,
  tenantIdOf,
  scopeTenant,
  stampTenant
};
