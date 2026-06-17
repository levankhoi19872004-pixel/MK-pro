'use strict';

const MongoStore = require('../models');

const INDEX_DEFINITIONS = {
  products: [
    [{ code: 1 }, { name: 'uniq_products_code', unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } }],
    [{ barcode: 1 }, { name: 'idx_products_barcode', sparse: true }],
    [{ isActive: 1, code: 1 }, { name: 'idx_products_active_code' }]
  ],
  customers: [
    [{ code: 1 }, { name: 'uniq_customers_code', unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } }],
    [{ customerCode: 1 }, { name: 'idx_customers_customer_code', sparse: true }],
    [{ phone: 1 }, { name: 'idx_customers_phone', sparse: true }],
    [{ staffCode: 1, route: 1, isActive: 1 }, { name: 'idx_customers_staff_route_active' }],
    [{ isActive: 1, code: 1 }, { name: 'idx_customers_active_code' }]
  ],
  users: [
    // username là required; unique thường khớp trực tiếp index username_1 cũ của Mongoose.
    [{ username: 1 }, { name: 'uniq_users_username', unique: true }],
    [{ staffCode: 1 }, { name: 'uniq_users_staff_code', unique: true, partialFilterExpression: { staffCode: { $type: 'string', $gt: '' } } }],
    [{ role: 1, isActive: 1, staffCode: 1 }, { name: 'idx_users_role_active_staff_code' }]
  ],
  salesTargets: [
    [{ period: 1, salesStaffCode: 1 }, { name: 'uniq_sales_targets_period_staff', unique: true }],
    [{ period: 1, status: 1, salesStaffName: 1 }, { name: 'idx_sales_targets_period_status_name' }]
  ],
  roles: [[{ code: 1 }, { name: 'uniq_roles_code', unique: true }]],
  permissions: [[{ roleCode: 1, module: 1 }, { name: 'uniq_permissions_role_module', unique: true }]],
  salesOrders: [
    [{ id: 1 }, { name: 'uniq_salesOrders_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_salesOrders_code', unique: true, sparse: true }],
    // Hai mã import được dùng để chặn trùng và tra cứu chứng từ DMS/Excel.
    [{ documentCode: 1 }, { name: 'idx_orders_document_code', sparse: true }],
    [{ invoiceCode: 1 }, { name: 'idx_orders_invoice_code', sparse: true }],
    [{ customerCode: 1, orderDate: -1 }, { name: 'idx_orders_customer_order_date' }],
    [{ salesStaffCode: 1, orderDate: -1, status: 1 }, { name: 'idx_orders_sales_staff_order_date_status' }],
    [{ orderDate: -1, createdAt: -1 }, { name: 'idx_orders_order_date_created_desc' }],
    [{ deliveryDate: -1, deliveryStaffCode: 1, deliveryStatus: 1 }, { name: 'idx_orders_delivery_date_staff_status_desc' }],
    [{ masterOrderId: 1 }, { name: 'idx_orders_master_order_id', sparse: true }],
    [{ masterOrderCode: 1 }, { name: 'idx_orders_master_order_code', sparse: true }],
    [{ source: 1, orderDate: -1, status: 1 }, { name: 'idx_orders_source_order_date_status', sparse: true }],
    [{ vatInvoiceRequired: 1, orderDate: -1, status: 1 }, { name: 'idx_orders_vat_required_order_date_status' }],
    [{ accountingStatus: 1, orderDate: -1, salesStaffCode: 1 }, { name: 'idx_orders_dashboard_accounting_date_staff' }]
  ],
  masterOrders: [
    [{ id: 1 }, { name: 'uniq_masterOrders_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_masterOrders_code', unique: true, sparse: true }],
    [{ deliveryDate: -1, deliveryStaffCode: 1, status: 1 }, { name: 'idx_master_orders_delivery_staff_status_desc' }],
    [{ deliveryStatus: 1, arStatus: 1, deliveryDate: 1 }, { name: 'idx_master_orders_delivery_ar_date' }],
    [{ accountingConfirmed: 1, deliveryDate: 1 }, { name: 'idx_master_orders_accounting_date' }],
    [{ childOrderIds: 1 }, { name: 'idx_master_orders_child_order_ids' }],
    [{ 'children.id': 1 }, { name: 'idx_master_orders_children_id' }],
    [{ 'children.code': 1 }, { name: 'idx_master_orders_children_code' }],
    [{ deliveryDate: -1, createdAt: -1 }, { name: 'idx_master_orders_delivery_date_created_at' }]
  ],
  importOrders: [
    [{ id: 1 }, { name: 'idx_import_orders_id' }],
    [{ code: 1 }, { name: 'idx_import_orders_code' }],
    [{ supplierId: 1 }, { name: 'idx_import_orders_supplier' }],
    [{ warehouseId: 1 }, { name: 'idx_import_orders_warehouse' }],
    [{ status: 1, createdAt: -1 }, { name: 'idx_import_orders_status_created_at' }],
    [{ date: -1, status: 1 }, { name: 'idx_import_orders_date_status' }],
    [{ documentDate: -1, status: 1 }, { name: 'idx_import_orders_document_date_status' }],
    [{ importDate: -1, status: 1 }, { name: 'idx_import_orders_import_date_status' }],
    [{ createdAt: -1 }, { name: 'idx_import_orders_created_at' }]
  ],
  returnOrders: [
    [{ id: 1 }, { name: 'uniq_returnOrders_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_returnOrders_code', unique: true, sparse: true }],
    // Compound index thay thế các index đơn cùng prefix.
    [{ salesOrderId: 1, status: 1 }, { name: 'idx_return_orders_sales_order_id_status', sparse: true }],
    [{ salesOrderCode: 1, status: 1 }, { name: 'idx_return_orders_sales_order_code_status', sparse: true }],
    [{ sourceOrderId: 1, status: 1 }, { name: 'idx_return_orders_source_status' }],
    [{ masterReturnOrderId: 1 }, { name: 'idx_return_orders_master_return_id', sparse: true }],
    [{ masterReturnOrderCode: 1 }, { name: 'idx_return_orders_master_return_code', sparse: true }],
    [{ masterOrderId: 1 }, { name: 'idx_return_orders_master_order_id', sparse: true }],
    [{ masterOrderCode: 1 }, { name: 'idx_return_orders_master_order_code', sparse: true }],
    [{ returnMergeStatus: 1, date: 1 }, { name: 'idx_return_orders_merge_date' }],
    [{ createdAt: -1 }, { name: 'idx_return_orders_created_at' }],
    [{ deliveryDate: -1, deliveryStaffCode: 1 }, { name: 'idx_return_orders_delivery_staff_date_desc' }],
    [{ accountingStatus: 1, returnDate: -1, salesStaffCode: 1 }, { name: 'idx_return_dashboard_accounting_date_staff' }]
  ],
  masterReturnOrders: [
    [{ id: 1 }, { name: 'uniq_master_return_orders_id', unique: true, partialFilterExpression: { id: { $type: 'string', $gt: '' } } }],
    [{ code: 1 }, { name: 'uniq_master_return_orders_code', unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } }],
    [{ deliveryStaffCode: 1 }, { name: 'idx_master_return_orders_delivery_staff_code' }],
    [{ returnDate: 1, status: 1 }, { name: 'idx_master_return_orders_date_status' }],
    [{ createdAt: -1 }, { name: 'idx_master_return_orders_created_at' }]
  ],
  receipts: [
    [{ id: 1 }, { name: 'uniq_receipts_id', unique: true, partialFilterExpression: { id: { $type: 'string', $gt: '' } } }],
    [{ code: 1 }, { name: 'uniq_receipts_code', unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } }],
    [{ importIdempotencyKey: 1 }, { name: 'uniq_receipts_import_idempotency', unique: true, partialFilterExpression: { importIdempotencyKey: { $type: 'string', $gt: '' } } }],
    [{ customerId: 1 }, { name: 'idx_receipts_customer_id', sparse: true }],
    [{ customerCode: 1 }, { name: 'idx_receipts_customer_code' }],
    [{ staffCode: 1 }, { name: 'idx_receipts_staff_code', sparse: true }],
    [{ staffName: 1 }, { name: 'idx_receipts_staff_name', sparse: true }],
    [{ orderId: 1 }, { name: 'idx_receipts_order_id', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_receipts_order_code', sparse: true }],
    [{ date: 1, status: 1 }, { name: 'idx_receipts_date_status' }],
    [{ method: 1, status: 1 }, { name: 'idx_receipts_method_status' }],
    [{ createdAt: -1 }, { name: 'idx_receipts_created_at' }]
  ],
  arLedgers: [
    [{ id: 1 }, { name: 'uniq_arLedgers_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_arLedgers_code', unique: true, sparse: true }],
    [{ customerCode: 1 }, { name: 'idx_ar_ledgers_customer_code' }],
    [{ customerName: 1 }, { name: 'idx_ar_ledgers_customer_name', sparse: true }],
    [{ orderId: 1 }, { name: 'idx_ar_ledgers_order_id', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_ar_ledgers_order_code', sparse: true }],
    [{ salesOrderId: 1 }, { name: 'idx_ar_ledgers_sales_order_id', sparse: true }],
    [{ salesOrderCode: 1 }, { name: 'idx_ar_ledgers_sales_order_code', sparse: true }],
    [{ refType: 1, refId: 1 }, { name: 'idx_ar_ledgers_ref' }],
    [{ refType: 1, refId: 1, type: 1 }, { name: 'idx_ar_ledgers_ref_type' }],
    [{ refCode: 1 }, { name: 'idx_ar_ledgers_ref_code', sparse: true }],
    [{ date: 1 }, { name: 'idx_ar_ledgers_date' }],
    [{ customerCode: 1, date: 1 }, { name: 'idx_ar_ledgers_customer_date' }],
    [{ customerCode: 1, type: 1, date: -1 }, { name: 'idx_ar_ledgers_customer_type_date_desc' }],
    [{ refCode: 1, type: 1 }, { name: 'idx_ar_ledgers_ref_code_type' }],
    [{ source: 1 }, { name: 'idx_ar_ledgers_source' }],
    [
      { type: 1, source: 1, method: 1, deliveryStaffCode: 1, deliveryDate: -1 },
      { name: 'idx_ar_delivery_cash_receipt_report' }
    ],
    [
      { type: 1, deliveryStaffCode: 1, date: -1 },
      { name: 'idx_ar_receipt_delivery_staff_date' }
    ],
    [
      { type: 1, salesmanCode: 1, date: -1 },
      { name: 'idx_ar_sale_salesman_type_date' }
    ],
    [
      { type: 1, salesStaffCode: 1, date: -1 },
      { name: 'idx_ar_sale_sales_staff_type_date' }
    ],
    [
      { type: 1, nvbhCode: 1, date: -1 },
      { name: 'idx_ar_sale_nvbh_type_date' }
    ],
    [
      { masterOrderCode: 1, deliveryStaffCode: 1, date: -1 },
      { name: 'idx_ar_master_delivery_staff_date', sparse: true }
    ],
    [{ salesStaffCode: 1, customerCode: 1, createdAt: -1 }, { name: 'idx_ar_sales_staff_customer_created' }],
    [{ deliveryStaffCode: 1, customerCode: 1, createdAt: -1 }, { name: 'idx_ar_delivery_staff_customer_created' }],
    [{ orderCode: 1, status: 1 }, { name: 'idx_ar_order_status' }]
  ],
  cashbooks: [
    [{ id: 1 }, { name: 'idx_cashbooks_id' }],
    [{ code: 1 }, { name: 'idx_cashbooks_code' }],
    [{ refType: 1, refId: 1 }, { name: 'idx_cashbooks_ref' }],
    [{ orderId: 1 }, { name: 'idx_cashbooks_order_id', sparse: true }],
    [{ date: 1, status: 1 }, { name: 'idx_cashbooks_date_status' }],
    [{ createdAt: -1 }, { name: 'idx_cashbooks_created_at' }]
  ],
  bankbooks: [
    [{ id: 1 }, { name: 'idx_bankbooks_id' }],
    [{ code: 1 }, { name: 'idx_bankbooks_code' }],
    [{ refType: 1, refId: 1 }, { name: 'idx_bankbooks_ref' }],
    [{ orderId: 1 }, { name: 'idx_bankbooks_order_id', sparse: true }],
    [{ date: 1, status: 1 }, { name: 'idx_bankbooks_date_status' }],
    [{ createdAt: -1 }, { name: 'idx_bankbooks_created_at' }]
  ],

  debtCollections: [
    [{ id: 1 }, { name: 'uniq_debtCollections_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_debtCollections_code', unique: true, sparse: true }],
    [{ idempotencyKey: 1 }, { name: 'uniq_debtCollections_idempotency_key', unique: true, sparse: true }],
    [{ status: 1, submittedAt: -1 }, { name: 'idx_debt_collections_status_submitted_at' }],
    [{ customerCode: 1, status: 1 }, { name: 'idx_debt_collections_customer_status' }],
    [{ collectorType: 1, collectorCode: 1, status: 1 }, { name: 'idx_debt_collections_collector_status' }],
    [{ 'allocations.salesOrderCode': 1, status: 1 }, { name: 'idx_debt_collections_allocation_order_status' }],
    [{ salesStaffCode: 1, status: 1, submittedAt: -1 }, { name: 'idx_debt_collections_sales_staff_status' }],
    [{ deliveryStaffCode: 1, status: 1, submittedAt: -1 }, { name: 'idx_debt_collections_delivery_staff_status' }],
    [{ collectorCode: 1, status: 1, submittedAt: -1 }, { name: 'idx_debt_collections_collector_code_status' }]
  ],

  debtCollectionLocks: [
    [{ orderCode: 1 }, { name: 'uniq_debt_collection_locks_order', unique: true }]
  ],

  externalDebtOrders: [
    [{ id: 1 }, { name: 'uniq_external_debt_orders_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_external_debt_orders_code', unique: true, sparse: true }],
    [{ idempotencyKey: 1 }, { name: 'uniq_external_debt_orders_idempotency', unique: true, sparse: true }],
    [{ salesStaffCode: 1, status: 1, documentDate: -1 }, { name: 'idx_external_debt_sales_staff_status_date' }],
    [{ deliveryStaffCode: 1, status: 1, documentDate: -1 }, { name: 'idx_external_debt_delivery_staff_status_date' }],
    [{ customerCode: 1, status: 1 }, { name: 'idx_external_debt_customer_status' }]
  ],

  fundLedgers: [
    [{ id: 1 }, { name: 'uniq_fundLedgers_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_fundLedgers_code', unique: true, sparse: true }],
    [{ idempotencyKey: 1 }, { name: 'uniq_fund_ledger_idempotency_key', unique: true, sparse: true }],
    [{ date: 1, fundType: 1, direction: 1 }, { name: 'idx_fund_ledgers_date_fund_direction' }],
    [{ sourceType: 1, sourceCode: 1, fundType: 1, direction: 1 }, { name: 'idx_fund_ledgers_source_unique_guard' }],
    [{ deliveryDate: 1, deliveryStaffCode: 1 }, { name: 'idx_fund_ledgers_delivery_staff_date' }],
    [
      { sourceType: 1, fundType: 1, direction: 1, deliveryStaffCode: 1, deliveryDate: -1 },
      { name: 'idx_fund_delivery_cash_submission_report' }
    ],
    [{ createdAt: -1 }, { name: 'idx_fund_ledgers_created_at' }]
  ],
  deliveryCashSubmissions: [
    [{ id: 1 }, { name: 'uniq_delivery_cash_submissions_id', unique: true, partialFilterExpression: { id: { $type: 'string', $gt: '' } } }],
    [{ code: 1 }, { name: 'uniq_delivery_cash_submissions_code', unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } }],
    [{ deliveryDate: 1, deliveryStaffCode: 1, status: 1 }, { name: 'idx_delivery_cash_submissions_date_staff_status' }],
    [{ createdAt: -1 }, { name: 'idx_delivery_cash_submissions_created_at' }]
  ],
  expenseVouchers: [
    [{ id: 1 }, { name: 'uniq_expense_vouchers_id', unique: true, partialFilterExpression: { id: { $type: 'string', $gt: '' } } }],
    [{ code: 1 }, { name: 'uniq_expense_vouchers_code', unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } }],
    [{ date: 1, fundType: 1, status: 1 }, { name: 'idx_expense_vouchers_date_fund_status' }],
    [{ createdAt: -1 }, { name: 'idx_expense_vouchers_created_at' }]
  ],
  fundTransfers: [
    [{ id: 1 }, { name: 'uniq_fund_transfers_id', unique: true, partialFilterExpression: { id: { $type: 'string', $gt: '' } } }],
    [{ code: 1 }, { name: 'uniq_fund_transfers_code', unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } }],
    [{ date: 1, fromFund: 1, toFund: 1, status: 1 }, { name: 'idx_fund_transfers_date_funds_status' }],
    [{ createdAt: -1 }, { name: 'idx_fund_transfers_created_at' }]
  ],
  inventories: [
    [
      { productCode: 1, warehouseCode: 1 },
      {
        name: 'uniq_inventories_product_warehouse',
        unique: true,
        sparse: true
      }
    ]
  ],
  journals: [
    // journals chỉ còn là nguồn tương thích/migration; ba compound index này
    // bao phủ lookup AR cũ và reverse payment mà không cần các index đơn.
    [{ customerCode: 1, type: 1, date: -1 }, { name: 'idx_ar_ledger_customer_type_date_desc' }],
    [{ refCode: 1, type: 1 }, { name: 'idx_ar_ledger_ref_code_type' }],
    [{ refType: 1, refId: 1 }, { name: 'idx_journals_ref_type_id' }]
  ],
  stockTransactions: [
    [{ idempotencyKey: 1 }, { name: 'uniq_stock_tx_idempotency_key', unique: true, sparse: true }],
    [{ date: 1, productCode: 1, warehouseCode: 1 }, { name: 'idx_stock_tx_date_product_warehouse' }],
    [{ refType: 1, refId: 1 }, { name: 'idx_stock_tx_ref' }],
    [{ sourceType: 1, sourceId: 1, productCode: 1 }, { name: 'idx_stock_tx_source_product' }],
    [{ productCode: 1, date: 1 }, { name: 'idx_stock_tx_product_date' }]
  ],
  warehouses: [[{ code: 1 }, { name: 'idx_warehouses_code' }]],
  reconciliationReports: [
    [{ id: 1 }, { name: 'uniq_reconciliation_reports_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_reconciliation_reports_code', unique: true, sparse: true }],
    [{ type: 1, status: 1, checkedAt: -1 }, { name: 'idx_reconciliation_type_status_checked_at' }],
    [{ checkedAt: -1 }, { name: 'idx_reconciliation_checked_at_desc' }],
    [{ source: 1, checkedAt: -1 }, { name: 'idx_reconciliation_source_checked_at' }]
  ],
  promotions: [
    [{ code: 1 }, { name: 'idx_promotions_code' }],
    [{ isActive: 1, startDate: 1, endDate: 1 }, { name: 'idx_promotions_active_dates' }],
    [{ productCodes: 1 }, { name: 'idx_promotions_product_codes' }]
  ],
  promotionProductRules: [
    [{ programCode: 1, productCode: 1 }, { name: 'uniq_promotion_product_rules_program_product', unique: true, sparse: true }],
    [{ productCode: 1, isActive: 1 }, { name: 'idx_promotion_product_rules_product_active' }],
    [{ missingProduct: 1, programCode: 1 }, { name: 'idx_promotion_product_rules_missing_program' }]
  ],
  promotionGroupItems: [
    [{ programCode: 1, productCode: 1 }, { name: 'uniq_promotion_group_items_program_product', unique: true, sparse: true }],
    [{ productCode: 1, isActive: 1 }, { name: 'idx_promotion_group_items_product_active' }],
    [{ missingProduct: 1, programCode: 1 }, { name: 'idx_promotion_group_items_missing_program' }]
  ],
  promotionGroupRules: [
    [{ programCode: 1, minAmount: 1 }, { name: 'idx_promotion_group_rules_program_min_amount' }],
    [{ programCode: 1, isActive: 1 }, { name: 'idx_promotion_group_rules_program_active' }]
  ],
  importTemplates: [[{ type: 1, name: 1 }, { name: 'idx_import_templates_type_name' }]],
  auditLogs: [
    [{ refType: 1, refId: 1 }, { name: 'idx_audit_logs_ref' }],
    [{ action: 1 }, { name: 'idx_audit_logs_action' }],
    [{ createdAt: -1 }, { name: 'idx_audit_logs_created_at' }]
  ],
  idempotencyRequests: [
    [{ key: 1 }, { name: 'uniq_idempotency_requests_key', unique: true }],
    [{ expiresAt: 1 }, { name: 'ttl_idempotency_requests_expires_at', expireAfterSeconds: 0 }],
    [{ scope: 1, actorCode: 1, createdAt: -1 }, { name: 'idx_idempotency_scope_actor_created' }]
  ],
  mobileLogs: [
    [{ userId: 1, createdAt: -1 }, { name: 'idx_mobile_logs_user_created' }],
    [{ action: 1, createdAt: -1 }, { name: 'idx_mobile_logs_action_created' }]
  ],
  importLogs: [
    [{ type: 1, createdAt: -1 }, { name: 'idx_import_logs_type_created' }],
    [{ fileName: 1 }, { name: 'idx_import_logs_file_name' }],
    [{ batchCode: 1 }, { name: 'idx_import_logs_batch_code', sparse: true }]
  ],
  importSessions: [
    [{ id: 1 }, { name: 'uniq_importSessions_id', unique: true, sparse: true }],
    [{ sessionId: 1 }, { name: 'uniq_importSessions_sessionId', unique: true, sparse: true }],
    [{ status: 1, createdAt: -1 }, { name: 'idx_importSessions_status_createdAt' }],
    [{ createdAt: 1 }, { name: 'ttl_importSessions_createdAt', expireAfterSeconds: Number(process.env.IMPORT_SESSION_TTL_SECONDS || 86400) }]
  ],
  importSessionRows: [
    [{ sessionId: 1, rowNo: 1 }, { name: 'idx_importSessionRows_session_rowNo' }],
    [{ sessionId: 1, documentCode: 1 }, { name: 'idx_importSessionRows_session_documentCode' }],
    [{ createdAt: 1 }, { name: 'ttl_importSessionRows_createdAt', expireAfterSeconds: Number(process.env.IMPORT_SESSION_TTL_SECONDS || 86400) }]
  ],
  dmsInventoryImports: [
    [{ id: 1 }, { name: 'uniq_dms_inventory_import_id', unique: true }],
    [{ fileHash: 1, status: 1 }, { name: 'idx_dms_inventory_file_status' }],
    [{ fileHash: 1 }, { name: 'uniq_dms_inventory_completed_file', unique: true, partialFilterExpression: { status: 'completed' } }],
    [{ status: 1, committedAt: -1 }, { name: 'idx_dms_inventory_status_committed' }],
    [{ expiresAt: 1 }, { name: 'ttl_dms_inventory_preview', expireAfterSeconds: 0 }]
  ],
  dmsInventorySnapshots: [
    [{ importId: 1, productCode: 1 }, { name: 'uniq_dms_snapshot_import_product', unique: true }],
    [{ importId: 1, comparisonType: 1, internalExcessQty: -1 }, { name: 'idx_dms_snapshot_import_type_internal' }],
    [{ productCode: 1, snapshotAt: -1 }, { name: 'idx_dms_snapshot_product_time' }],
    [{ expiresAt: 1 }, { name: 'ttl_dms_inventory_snapshot_preview', expireAfterSeconds: 0 }]
  ],
  internalSaleAllocations: [
    [{ productCode: 1, status: 1 }, { name: 'uniq_internal_sale_allocation_active', unique: true, partialFilterExpression: { status: 'active' } }],
    [{ importId: 1, status: 1 }, { name: 'idx_internal_sale_allocation_import_status' }],
    [{ status: 1, remainingQty: 1 }, { name: 'idx_internal_sale_allocation_status_remaining' }]
  ],
  internalSaleAllocationLedgers: [
    [{ eventKey: 1 }, { name: 'uniq_internal_sale_allocation_event', unique: true }],
    [{ allocationId: 1, createdAt: -1 }, { name: 'idx_internal_sale_allocation_ledger_allocation' }],
    [{ sourceOrderId: 1, productCode: 1 }, { name: 'idx_internal_sale_allocation_ledger_order_product' }]
  ]
};

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function sameIndexKey(left, right) {
  try {
    // Thứ tự field trong compound index có ý nghĩa nên không sort key.
    return JSON.stringify(left || {}) === JSON.stringify(right || {});
  } catch {
    return false;
  }
}

function comparableIndexOptions(index = {}) {
  return {
    unique: Boolean(index.unique),
    sparse: Boolean(index.sparse),
    expireAfterSeconds: index.expireAfterSeconds ?? null,
    partialFilterExpression: stableValue(index.partialFilterExpression || null),
    collation: stableValue(index.collation || null),
    weights: stableValue(index.weights || null),
    default_language: index.default_language || null,
    language_override: index.language_override || null
  };
}

function sameIndexOptions(existing = {}, options = {}) {
  return JSON.stringify(comparableIndexOptions(existing)) === JSON.stringify(comparableIndexOptions(options));
}

function buildManagedIndexPlan() {
  const byPhysicalCollection = new Map();

  for (const [collectionKey, definitions] of Object.entries(INDEX_DEFINITIONS)) {
    const Model = MongoStore[collectionKey];
    if (!Model || !Model.collection) continue;

    const collectionName = Model.collection.name;
    if (!byPhysicalCollection.has(collectionName)) {
      byPhysicalCollection.set(collectionName, {
        collectionName,
        collectionKeys: [],
        Model,
        definitions: []
      });
    }

    const plan = byPhysicalCollection.get(collectionName);
    plan.collectionKeys.push(collectionKey);

    for (const definition of definitions) {
      const [fields, options] = definition;
      const sameKey = plan.definitions.find(([knownFields]) => sameIndexKey(knownFields, fields));
      if (sameKey && !sameIndexOptions(sameKey[1], options)) {
        throw new Error(
          `Conflicting managed indexes on ${collectionName}: ${sameKey[1]?.name || JSON.stringify(sameKey[0])} vs ${options?.name || JSON.stringify(fields)}`
        );
      }
      if (!sameKey) plan.definitions.push(definition);
    }
  }

  return Array.from(byPhysicalCollection.values());
}

async function ensureMongoIndexes({ logger = console } = {}) {
  const results = [];
  const plans = buildManagedIndexPlan();

  for (const plan of plans) {
    const { Model, collectionName, collectionKeys, definitions } = plan;
    const collectionKey = collectionKeys.join(',');

    let existingIndexes = [];
    try {
      // Chỉ đọc danh sách index một lần cho mỗi collection vật lý. Điều này
      // ngăn alias model (ví dụ stock/inventories) tạo policy chồng chéo.
      existingIndexes = await Model.collection.indexes();
    } catch (err) {
      const message = `Không đọc được danh sách index ${collectionName}: ${err.message}`;
      if (logger?.warn) logger.warn(message);
      else console.warn(message);
      continue;
    }

    for (const [fields, options] of definitions) {
      try {
        const sameNameDifferentSpec = existingIndexes.find((idx) => {
          return idx.name === options?.name
            && (!sameIndexKey(idx.key, fields) || !sameIndexOptions(idx, options));
        });

        if (sameNameDifferentSpec) {
          const message = `Index ${collectionName}.${options?.name} trùng tên nhưng khác key/option. Cần chạy audit index trước khi tạo lại.`;
          if (logger?.warn) logger.warn(message);
          else console.warn(message);
          results.push({
            collectionKey,
            collection: collectionName,
            indexName: options?.name,
            conflictWith: sameNameDifferentSpec.name,
            skipped: true
          });
          continue;
        }

        const sameKeyDifferentOptions = existingIndexes.find((idx) => {
          return sameIndexKey(idx.key, fields) && !sameIndexOptions(idx, options);
        });

        if (sameKeyDifferentOptions) {
          const message = `Index ${collectionName}.${sameKeyDifferentOptions.name} cùng key nhưng khác option với ${options?.name}. Cần drop index cũ sau khi audit duplicate trước khi thay thế.`;
          if (logger?.warn) logger.warn(message);
          else console.warn(message);

          results.push({
            collectionKey,
            collection: collectionName,
            indexName: options?.name,
            conflictWith: sameKeyDifferentOptions.name,
            skipped: true
          });
          continue;
        }

        const hasEquivalentIndex = existingIndexes.some((idx) => {
          return sameIndexKey(idx.key, fields) && sameIndexOptions(idx, options);
        });

        if (hasEquivalentIndex) {
          results.push({
            collectionKey,
            collection: collectionName,
            indexName: options?.name,
            skipped: true
          });
          continue;
        }

        const indexName = await Model.collection.createIndex(fields, { background: true, ...options });
        existingIndexes.push({ key: fields, name: indexName, ...options });
        results.push({ collectionKey, collection: collectionName, indexName });
      } catch (err) {
        const message = `Không tạo được index ${collectionName}.${options?.name || JSON.stringify(fields)}: ${err.message}`;
        if (logger?.warn) logger.warn(message);
        else console.warn(message);
      }
    }
  }
  return results;
}

module.exports = {
  INDEX_DEFINITIONS,
  buildManagedIndexPlan,
  comparableIndexOptions,
  sameIndexKey,
  sameIndexOptions,
  ensureMongoIndexes
};
