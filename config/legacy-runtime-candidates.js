'use strict';

module.exports = {
  'src/services/orderLegacy.service.js': {
    owner: 'sales-order',
    type: 'generated-runtime-target',
    status: 'migrate_consumers',
    canonicalReplacement: [
      'src/services/sales-order/SalesOrderQueryService.js',
      'src/services/sales-order/SalesOrderCommandService.js',
      'src/services/sales-order/SalesOrderPostingCoordinator.js'
    ],
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'source_bundle', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'All sales order read/write consumers have parity tests and no longer import the generated legacy target.',
    risk: 'writer-sensitive: sales order write, inventory posting, accounting confirm boundaries'
  },
  'src/services/returnOrderLegacy.service.js': {
    owner: 'return-order',
    type: 'generated-runtime-target',
    status: 'migrate_consumers',
    canonicalReplacement: [
      'src/services/return-order/ReturnOrderQueryService.js',
      'src/services/return-order/ReturnOrderCommandService.js',
      'src/services/return-order/ReturnReceivingService.js',
      'src/services/return-order/ReturnAccountingService.js'
    ],
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'source_bundle', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Return read/write/stock-in/accounting consumers are migrated with ledger and inventory parity tests.',
    risk: 'writer-sensitive: returnOrders SSoT, stock-in lifecycle, AR return posting'
  },
  'src/services/importExportLegacy.service.js': {
    owner: 'import-export',
    type: 'generated-runtime-target',
    status: 'migrate_consumers',
    canonicalReplacement: [
      'src/services/import-export/ImportFacade.js',
      'src/services/import-export/ExportFacade.js',
      'src/services/excel/ExcelInteractionService.js'
    ],
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'source_bundle', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Import preview/commit/export parity and memory tests pass without runtime imports of the generated target.',
    risk: 'production import/export contract, Excel/DMS compatibility'
  },
  'src/services/reportLegacy.service.js': {
    owner: 'reporting',
    type: 'generated-runtime-target',
    status: 'migrate_consumers',
    canonicalReplacement: [
      'src/services/reports/DashboardReportService.js',
      'src/services/reports/ReportCenterService.js',
      'src/services/reports/InformationReportService.js'
    ],
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'source_bundle', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Report read/export consumers use canonical report services with AR/inventory source-contract tests.',
    risk: 'report/export production and AR/inventory read contracts'
  },
  'src/engines/delivery.legacy.engine.js': {
    owner: 'delivery',
    type: 'generated-runtime-target',
    status: 'manual_review',
    canonicalReplacement: 'src/engines/delivery/DeliveryEngineFacade.js',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'source_bundle', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Delivery writer/listing paths prove no duplicate posting and no mobile compatibility dependency remains.',
    risk: 'writer-sensitive: delivery payment, return, accounting, mobile delivery'
  },
  'src/services/mobile/sales.service.js': {
    owner: 'mobile-sales',
    type: 'generated-runtime-target',
    status: 'manual_review',
    canonicalReplacement: 'src/controllers/mobile/sales.controller.js + canonical domain services',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'source_bundle', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Mobile sales/debt/order compatibility is fully covered by browser/API parity tests.',
    risk: 'mobile compatibility and financial read/write paths'
  },
  'services/printDataBuilder.legacy.js': {
    owner: 'print',
    type: 'generated-runtime-target',
    status: 'migrate_consumers',
    canonicalReplacement: 'src/domain/print/PrintReadService.js',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'source_bundle', 'config', 'documentation'],
    retirementCondition: 'services/printDataBuilder.js delegates directly to the print domain with golden print parity.',
    risk: 'print/export compatibility'
  },
  'src/services/master-order/masterOrderPrintLegacy.impl.js': {
    owner: 'master-order-print',
    type: 'legacy-implementation',
    status: 'remove_runtime_load',
    canonicalReplacement: 'src/services/master-order/masterOrderPrint.service.js',
    runtimeAllowed: false,
    allowedReferenceTypes: ['test', 'config', 'documentation', 'audit_migration'],
    retirementCondition: 'Retain as rollback/audit source only; physical removal requires deployment rollback policy approval.',
    risk: 'read-only print aggregation'
  },
  'src/services/master-order/masterOrderPrint.service.js': {
    owner: 'master-order-print',
    type: 'compatibility-facade',
    status: 'keep_compatibility_facade',
    canonicalReplacement: 'src/domain/print/PrintReadService.js',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Remove only after all callers use PrintReadService or printDocumentService directly.',
    risk: 'read-only compatibility wrapper'
  },
  'src/services/master-order/masterOrderLegacy.service.js': {
    owner: 'master-order',
    type: 'compatibility-facade',
    status: 'keep_compatibility_facade',
    canonicalReplacement: 'src/services/master-order/index.js',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Keep until public masterOrderService facade is retired by route/controller contract.',
    risk: 'mixed read/write facade; must not absorb new business logic'
  },
  'src/domain/print/LegacyPromotionFallbackService.js': {
    owner: 'print',
    type: 'fallback-adapter',
    status: 'keep_canonical_support',
    canonicalReplacement: 'src/domain/print',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Remove only after promotion canonical source no longer needs legacy snapshot fallback.',
    risk: 'read-only print compatibility'
  },
  'src/services/import-template/LegacyImportTemplateAdapter.js': {
    owner: 'import-template',
    type: 'compatibility-adapter',
    status: 'keep_compatibility_facade',
    canonicalReplacement: 'src/services/import-template',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'config', 'documentation'],
    retirementCondition: 'Remove after import template callers use canonical template module only.',
    risk: 'read-only import template compatibility'
  },
  'src/services/reports/ReportLegacyExportMap.js': {
    owner: 'reporting',
    type: 'compatibility-map',
    status: 'keep_compatibility_facade',
    canonicalReplacement: 'src/services/reports',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'config', 'documentation'],
    retirementCondition: 'Remove after report export aliases are represented in canonical report registry.',
    risk: 'report/export compatibility'
  },
  'src/models/InventoryLegacy.js': {
    owner: 'inventory',
    type: 'compatibility-model',
    status: 'manual_review',
    canonicalReplacement: 'src/models/Inventory.js',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'config', 'audit_migration', 'documentation'],
    retirementCondition: 'Requires Mongo collection/source-contract audit before any removal.',
    risk: 'inventory SSoT adjacency'
  },
  'src/services/background-jobs/AsyncJobHttpAdapter.js': {
    owner: 'background-jobs',
    type: 'compatibility-adapter',
    status: 'keep_compatibility_facade',
    canonicalReplacement: 'src/services/background-jobs',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'config', 'documentation'],
    retirementCondition: 'Remove after all HTTP job callers use canonical background job API.',
    risk: 'async job compatibility'
  },
  'src/services/mobile/mobileDebtNewAdapter.service.js': {
    owner: 'mobile-debt',
    type: 'compatibility-adapter',
    status: 'keep_compatibility_facade',
    canonicalReplacement: 'src/services/v2/debtNew.service.js',
    runtimeAllowed: true,
    allowedReferenceTypes: ['runtime', 'test', 'config', 'documentation'],
    retirementCondition: 'Remove after mobile debt callers consume canonical debt API response shape.',
    risk: 'mobile AR read compatibility'
  }
};
