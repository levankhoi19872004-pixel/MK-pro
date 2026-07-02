'use strict';

const LEGACY_EXPORT_TYPE_TO_REPORT_CODE = Object.freeze({
  'sales-report': 'sales-detail',
  'salesman-report': 'sales-by-staff',
  'customer-sales-report': 'sales-by-customer',
  'product-sales-report': 'sales-by-product',
  'debt-report': 'debt-period',
  'ar-ledger-detail': 'debt-ledger',
  'stock-report': 'inventory-current',
  'inventory-movement-report': 'inventory-movement',
  'stock-card-report': 'stock-card',
  'fund-report': 'finance-ledger',
  'delivery-report': 'delivery-trips',
  'deliveryman-report': 'delivery-by-staff',
  'return-report': 'returns-detail',
  'product-info-report': 'info-products',
  'customer-info-report': 'info-customers',
  'user-info-report': 'info-staffs'
});

function normalizeLegacyExportType(type) {
  return String(type || '').replace(/\.xlsx$/i, '').trim().toLowerCase();
}

function reportCodeForLegacyExport(type) {
  return LEGACY_EXPORT_TYPE_TO_REPORT_CODE[normalizeLegacyExportType(type)] || '';
}

function isLegacyBusinessReportExport(type) {
  return Boolean(reportCodeForLegacyExport(type));
}

module.exports = {
  LEGACY_EXPORT_TYPE_TO_REPORT_CODE,
  normalizeLegacyExportType,
  reportCodeForLegacyExport,
  isLegacyBusinessReportExport
};
