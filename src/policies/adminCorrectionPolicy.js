'use strict';

const LOW_RISK_MASTER_FIELDS = new Set([
  'name', 'businessName', 'phone', 'address', 'taxCode', 'taxInvoiceAddress',
  'area', 'route', 'note', 'remark', 'description', 'barcode', 'category', 'brand',
  'unit', 'baseUnit', 'packing', 'pickingZone', 'isActive'
]);

const MEDIUM_RISK_FIELDS = new Set([
  'customerCode', 'customerName', 'customerId',
  'salesStaffCode', 'salesStaffName', 'salesStaffId',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryStaffId',
  'date', 'orderDate', 'documentDate', 'createdDate', 'saleDate', 'deliveryDate',
  'status', 'deliveryStatus', 'mergeStatus', 'returnStatus', 'returnState',
  'conversionRate', 'costPrice', 'salePrice', 'vatInvoiceRequired', 'vatInvoiceNote'
]);

const HIGH_RISK_FIELDS = new Set([
  'items', 'totalAmount', 'amount', 'total', 'grandTotal', 'finalAmount',
  'receivableAmount', 'paidAmount', 'debtAmount', 'discount', 'promotionAmount',
  'accountingStatus', 'accountingConfirmed', 'accountingConfirmedAt', 'accountingConfirmedBy',
  'arStatus', 'arPosted', 'arPostedAt', 'arLedgerId',
  'stockPosted', 'stockPostedAt', 'stockPostedBy',
  'availableQty', 'currentQty', 'onHand', 'reservedQty', 'qty', 'quantity',
  'fundBalance', 'cashBalance', 'bankBalance', 'openingDebt', 'currentDebt', 'debt'
]);

const LEDGER_CORRECTION_TYPES = new Set([
  'inventory_adjustment',
  'ar_adjustment',
  'fund_adjustment',
  'stock_adjustment',
  'debt_adjustment',
  'cash_adjustment'
]);

const DIRECT_ENTITY_TYPES = new Set([
  'customer', 'product', 'staff', 'user',
  'sales_order', 'return_order', 'master_order', 'master_return_order',
  'import_session_row', 'import_row'
]);

function normalizePath(path) {
  return String(path || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .filter((part) => !/^\d+$/.test(part))
    .join('.');
}

function rootField(path) {
  return normalizePath(path).split('.')[0] || '';
}

function isHighRiskPath(path) {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  const root = rootField(normalized);
  if (HIGH_RISK_FIELDS.has(root) || HIGH_RISK_FIELDS.has(normalized)) return true;
  return normalized.startsWith('items.') || normalized.includes('.amount') || normalized.endsWith('Amount');
}

function isMediumRiskPath(path) {
  const normalized = normalizePath(path);
  const root = rootField(normalized);
  return MEDIUM_RISK_FIELDS.has(root) || MEDIUM_RISK_FIELDS.has(normalized);
}

function isLowRiskPath(path) {
  const normalized = normalizePath(path);
  const root = rootField(normalized);
  return LOW_RISK_MASTER_FIELDS.has(root) || LOW_RISK_MASTER_FIELDS.has(normalized);
}

function classifyCorrection({ entityType = '', correctionType = '', diff = [], proposedPatch = {} } = {}) {
  const type = String(correctionType || '').trim().toLowerCase();
  const entity = String(entityType || '').trim().toLowerCase();
  if (LEDGER_CORRECTION_TYPES.has(type) || ['inventory', 'stock', 'ar', 'debt', 'fund'].includes(entity)) {
    return {
      riskLevel: 'high',
      requiresApproval: true,
      requiresLedgerAdjustment: true,
      directWriteAllowed: false,
      reason: 'Dữ liệu tài chính/kho/công nợ phải chỉnh bằng phiếu điều chỉnh và ledger bù trừ.'
    };
  }

  const paths = Array.from(new Set([
    ...(Array.isArray(diff) ? diff.map((row) => row?.path).filter(Boolean) : []),
    ...Object.keys(proposedPatch || {})
  ]));

  if (paths.some(isHighRiskPath)) {
    return {
      riskLevel: 'high',
      requiresApproval: true,
      requiresLedgerAdjustment: true,
      directWriteAllowed: false,
      reason: 'Thay đổi chạm số tiền, số lượng, tồn kho, công nợ hoặc trạng thái đã phát sinh ledger.'
    };
  }

  if (paths.some(isMediumRiskPath) || ['sales_order', 'return_order', 'master_order'].includes(entity)) {
    return {
      riskLevel: 'medium',
      requiresApproval: true,
      requiresLedgerAdjustment: false,
      directWriteAllowed: true,
      reason: 'Thay đổi nghiệp vụ có thể ảnh hưởng báo cáo/KPI nên cần validate và audit.'
    };
  }

  if (paths.every(isLowRiskPath) || DIRECT_ENTITY_TYPES.has(entity)) {
    return {
      riskLevel: 'low',
      requiresApproval: false,
      requiresLedgerAdjustment: false,
      directWriteAllowed: true,
      reason: 'Dữ liệu master ít rủi ro, được sửa trực tiếp nhưng phải ghi audit.'
    };
  }

  return {
    riskLevel: 'medium',
    requiresApproval: true,
    requiresLedgerAdjustment: false,
    directWriteAllowed: true,
    reason: 'Không nằm trong whitelist master data; xử lý như chỉnh sửa nghiệp vụ.'
  };
}

function entityLooksLocked(doc = {}) {
  const status = String(doc.status || doc.lifecycleStatus || '').toLowerCase();
  const accounting = String(doc.accountingStatus || doc.arStatus || '').toLowerCase();
  return Boolean(
    doc.accountingConfirmed ||
    doc.stockPosted ||
    doc.arPosted ||
    ['accounting_confirmed', 'confirmed', 'posted', 'completed'].includes(accounting) ||
    ['delivered', 'completed', 'accounting_confirmed', 'posted'].includes(status)
  );
}

function canActorApprove(actor = {}, correction = {}) {
  const role = String(actor.role || '').toLowerCase();
  const requestedById = String(correction.requestedBy?.id || correction.requestedBy?._id || correction.requestedBy?.username || '').trim();
  const actorId = String(actor.id || actor._id || actor.username || '').trim();
  const highRisk = String(correction.riskLevel || '').toLowerCase() === 'high';
  const superUser = ['owner', 'super_admin', 'superadmin'].includes(role) || actor.isOwner === true || actor.isSuperAdmin === true;
  if (superUser) return true;
  if (!['admin', 'accountant', 'manager'].includes(role)) return false;
  if (highRisk && requestedById && actorId && requestedById === actorId && process.env.ADMIN_CORRECTION_ALLOW_SELF_APPROVAL !== 'true') {
    return false;
  }
  return role === 'admin' || (role === 'accountant' && !highRisk);
}

module.exports = {
  LOW_RISK_MASTER_FIELDS,
  MEDIUM_RISK_FIELDS,
  HIGH_RISK_FIELDS,
  LEDGER_CORRECTION_TYPES,
  classifyCorrection,
  entityLooksLocked,
  canActorApprove,
  isHighRiskPath,
  normalizePath
};
