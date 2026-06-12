'use strict';

const MongoStore = require('../models');

const INDEX_DEFINITIONS = {
  products: [
    [{ code: 1 }, { name: 'idx_products_code' }],
    [{ barcode: 1 }, { name: 'idx_products_barcode', sparse: true }],
    [{ isActive: 1, code: 1 }, { name: 'idx_products_active_code' }],
    [{ isActive: 1, category: 1 }, { name: 'idx_products_active_category' }],
    [{ brand: 1 }, { name: 'idx_products_brand', sparse: true }],
    [{ warehouseCode: 1, code: 1 }, { name: 'idx_products_warehouse_code_code' }],
    [{ searchText: 'text' }, { name: 'txt_products_search_text', default_language: 'none' }]
  ],
  customers: [
    [{ code: 1 }, { name: 'idx_customers_code' }],
    [{ customerCode: 1 }, { name: 'idx_customers_customer_code', sparse: true }],
    [{ phone: 1 }, { name: 'idx_customers_phone', sparse: true }],
    [{ staffCode: 1, route: 1, isActive: 1 }, { name: 'idx_customers_staff_route_active' }],
    [{ isActive: 1, code: 1 }, { name: 'idx_customers_active_code' }],
    [{ routeName: 1 }, { name: 'idx_customers_route_name', sparse: true }],
    [{ searchText: 'text' }, { name: 'txt_customers_search_text', default_language: 'none' }]
  ],
  staffs: [
    [{ code: 1 }, { name: 'idx_staffs_code', sparse: true }],
    [{ username: 1 }, { name: 'idx_staffs_username', sparse: true }],
    [{ name: 1 }, { name: 'idx_staffs_name', sparse: true }],
    [{ fullName: 1 }, { name: 'idx_staffs_full_name', sparse: true }],
    [{ role: 1, isActive: 1 }, { name: 'idx_staffs_role_active' }]
  ],
  users: [
    [{ username: 1 }, { name: 'idx_users_username_search', sparse: true }],
    [{ staffCode: 1 }, { name: 'idx_users_staff_code', sparse: true }],
    [{ code: 1 }, { name: 'idx_users_code', sparse: true }],
    [{ employeeCode: 1 }, { name: 'idx_users_employee_code', sparse: true }],
    [{ salesStaffCode: 1 }, { name: 'idx_users_sales_staff_code', sparse: true }],
    [{ deliveryStaffCode: 1 }, { name: 'idx_users_delivery_staff_code', sparse: true }],
    [{ role: 1, isActive: 1, staffCode: 1 }, { name: 'idx_users_role_active_staff_code' }]
  ],
  roles: [[{ code: 1 }, { name: 'idx_roles_code', unique: true, sparse: true }]],
  permissions: [[{ roleCode: 1, module: 1 }, { name: 'idx_permissions_role_module' }]],
  salesOrders: [
    [{ id: 1 }, { name: 'uniq_salesOrders_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_salesOrders_code', unique: true, sparse: true }],
    [{ documentCode: 1 }, { name: 'idx_orders_document_code', sparse: true }],
    [{ invoiceCode: 1 }, { name: 'idx_orders_invoice_code', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_orders_order_code', sparse: true }],
    [{ orderNo: 1 }, { name: 'idx_orders_order_no', sparse: true }],
    [{ salesOrderCode: 1 }, { name: 'idx_orders_sales_order_code', sparse: true }],
    [{ customerId: 1 }, { name: 'idx_orders_customer_id', sparse: true }],
    [{ customerCode: 1, orderDate: -1 }, { name: 'idx_orders_customer_order_date' }],
    [{ salesStaffCode: 1, orderDate: -1, status: 1 }, { name: 'idx_orders_sales_staff_order_date_status' }],
    [{ salesStaffCode: 1, date: -1, status: 1, createdAt: -1 }, { name: 'idx_orders_sales_staff_date_status_created' }],
    [{ staffCode: 1, orderDate: -1 }, { name: 'idx_orders_staff_order_date', sparse: true }],
    [{ status: 1, orderDate: -1 }, { name: 'idx_orders_status_order_date' }],
    [{ orderDate: -1, createdAt: -1 }, { name: 'idx_orders_order_date_created_desc' }],
    [{ deliveryDate: 1, deliveryStaffCode: 1, status: 1 }, { name: 'idx_sales_orders_delivery_date_staff_status' }],
    [{ deliveryDate: -1, deliveryStaffCode: 1, deliveryStatus: 1 }, { name: 'idx_orders_delivery_date_staff_status_desc' }],
    [{ deliveryStaffCode: 1, deliveryDate: -1 }, { name: 'idx_orders_delivery_staff_date_desc' }],
    [{ deliveryStatus: 1, deliveryDate: -1 }, { name: 'idx_orders_delivery_status_date_desc' }],
    [{ arStatus: 1, deliveryDate: 1 }, { name: 'idx_orders_ar_status_delivery_date' }],
    [{ masterOrderId: 1 }, { name: 'idx_orders_master_order_id', sparse: true }],
    [{ masterOrderCode: 1 }, { name: 'idx_orders_master_order_code', sparse: true }],
    [{ source: 1, orderDate: -1, status: 1 }, { name: 'idx_orders_source_order_date_status', sparse: true }]
  ],
  masterOrders: [
    [{ id: 1 }, { name: 'uniq_masterOrders_id', unique: true, sparse: true }],
    [{ code: 1 }, { name: 'uniq_masterOrders_code', unique: true, sparse: true }],
    [{ deliveryStaffId: 1 }, { name: 'idx_master_orders_delivery_staff_id', sparse: true }],
    [{ deliveryStaffCode: 1, deliveryDate: -1 }, { name: 'idx_master_orders_delivery_staff_date_desc' }],
    [{ deliveryDate: -1, deliveryStaffCode: 1, status: 1 }, { name: 'idx_master_orders_delivery_staff_status_desc' }],
    [{ deliveryStatus: 1, arStatus: 1, deliveryDate: 1 }, { name: 'idx_master_orders_delivery_ar_date' }],
    [{ accountingConfirmed: 1, deliveryDate: 1 }, { name: 'idx_master_orders_accounting_date' }],
    [{ date: -1, deliveryStaffCode: 1 }, { name: 'idx_master_orders_date_staff_desc' }],
    [{ childOrderIds: 1 }, { name: 'idx_master_orders_child_order_ids' }],
    [{ 'children.id': 1 }, { name: 'idx_master_orders_children_id' }],
    [{ 'children.code': 1 }, { name: 'idx_master_orders_children_code' }],
    [{ createdAt: -1 }, { name: 'idx_master_orders_created_at' }]
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
    [{ customerCode: 1 }, { name: 'idx_return_orders_customer_code' }],
    [{ salesOrderId: 1 }, { name: 'idx_return_orders_sales_order_id', sparse: true }],
    [{ salesOrderId: 1, status: 1 }, { name: 'idx_return_orders_sales_order_id_status', sparse: true }],
    [{ salesOrderCode: 1 }, { name: 'idx_return_orders_sales_order_code', sparse: true }],
    [{ salesOrderCode: 1, status: 1 }, { name: 'idx_return_orders_sales_order_code_status', sparse: true }],
    [{ orderId: 1 }, { name: 'idx_return_orders_order_id', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_return_orders_order_code', sparse: true }],
    [{ sourceOrderId: 1 }, { name: 'idx_return_orders_source_order' }],
    [{ sourceOrderCode: 1 }, { name: 'idx_return_orders_source_order_code', sparse: true }],
    [{ status: 1 }, { name: 'idx_return_orders_status' }],
    [{ sourceOrderId: 1, status: 1 }, { name: 'idx_return_orders_source_status' }],
    [{ masterReturnOrderId: 1 }, { name: 'idx_return_orders_master_return_id', sparse: true }],
    [{ masterReturnOrderCode: 1 }, { name: 'idx_return_orders_master_return_code', sparse: true }],
    [{ masterOrderId: 1 }, { name: 'idx_return_orders_master_order_id', sparse: true }],
    [{ returnMergeStatus: 1, date: 1 }, { name: 'idx_return_orders_merge_date' }],
    [{ createdAt: -1 }, { name: 'idx_return_orders_created_at' }],
    // V45 Performance Turbo: index cho sync returnOrders khi gộp đơn.
    [{ masterOrderCode: 1 }, { name: 'idx_return_orders_master_order_code', sparse: true }],
    [{ deliveryDate: -1, deliveryStaffCode: 1 }, { name: 'idx_return_orders_delivery_staff_date_desc' }],
    [{ status: 1, deliveryDate: -1 }, { name: 'idx_return_orders_status_delivery_date_desc' }],
    [{ deliveryOrderId: 1 }, { name: 'idx_return_orders_delivery_order_id', sparse: true }],
    [{ deliveryOrderCode: 1 }, { name: 'idx_return_orders_delivery_order_code', sparse: true }]
  ],
  masterReturnOrders: [
    [{ id: 1 }, { name: 'idx_master_return_orders_id' }],
    [{ code: 1 }, { name: 'idx_master_return_orders_code' }],
    [{ deliveryStaffCode: 1 }, { name: 'idx_master_return_orders_delivery_staff_code' }],
    [{ returnDate: 1, status: 1 }, { name: 'idx_master_return_orders_date_status' }],
    [{ createdAt: -1 }, { name: 'idx_master_return_orders_created_at' }]
  ],
  receipts: [
    [{ id: 1 }, { name: 'idx_receipts_id' }],
    [{ code: 1 }, { name: 'idx_receipts_code' }],
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
    ]
  ],
  payments: [
    [{ id: 1 }, { name: 'idx_payments_id' }],
    [{ code: 1 }, { name: 'idx_payments_code' }],
    [{ type: 1, orderId: 1 }, { name: 'idx_payments_type_order_id' }],
    [{ type: 1, orderCode: 1 }, { name: 'idx_payments_type_order_code' }],
    [{ refType: 1, refId: 1 }, { name: 'idx_payments_ref' }],
    [{ customerId: 1, date: 1 }, { name: 'idx_payments_customer_id_date', sparse: true }],
    [{ customerCode: 1, date: 1 }, { name: 'idx_payments_customer_code_date' }],
    [{ date: 1, type: 1, status: 1 }, { name: 'idx_payments_date_type_status' }],
    [{ createdAt: -1 }, { name: 'idx_payments_created_at' }]
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
    [{ 'allocations.salesOrderCode': 1, status: 1 }, { name: 'idx_debt_collections_allocation_order_status' }]
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
    [{ id: 1 }, { name: 'idx_delivery_cash_submissions_id' }],
    [{ code: 1 }, { name: 'idx_delivery_cash_submissions_code' }],
    [{ deliveryDate: 1, deliveryStaffCode: 1, status: 1 }, { name: 'idx_delivery_cash_submissions_date_staff_status' }],
    [{ createdAt: -1 }, { name: 'idx_delivery_cash_submissions_created_at' }]
  ],
  expenseVouchers: [
    [{ id: 1 }, { name: 'idx_expense_vouchers_id' }],
    [{ code: 1 }, { name: 'idx_expense_vouchers_code' }],
    [{ date: 1, fundType: 1, status: 1 }, { name: 'idx_expense_vouchers_date_fund_status' }],
    [{ createdAt: -1 }, { name: 'idx_expense_vouchers_created_at' }]
  ],
  fundTransfers: [
    [{ id: 1 }, { name: 'idx_fund_transfers_id' }],
    [{ code: 1 }, { name: 'idx_fund_transfers_code' }],
    [{ date: 1, fromFund: 1, toFund: 1, status: 1 }, { name: 'idx_fund_transfers_date_funds_status' }],
    [{ createdAt: -1 }, { name: 'idx_fund_transfers_created_at' }]
  ],
  stock: [
    [{ productCode: 1, warehouseCode: 1 }, { name: 'idx_inventory_snapshot_product_warehouse' }],
    [{ warehouseCode: 1 }, { name: 'idx_inventory_snapshot_warehouse' }]
  ],
  inventories: [
    [
      { productCode: 1, warehouseCode: 1 },
      {
        name: 'uniq_inventories_product_warehouse',
        unique: true,
        sparse: true
      }
    ],
    [{ productCode: 1 }, { name: 'idx_inventories_product_code' }],
    [{ warehouseCode: 1 }, { name: 'idx_inventories_warehouse_code' }]
  ],
  inventoriesLegacy: [
    [{ productCode: 1, warehouseCode: 1 }, { name: 'idx_inventories_legacy_product_warehouse' }],
    [{ productCode: 1 }, { name: 'idx_inventories_legacy_product_code' }],
    [{ warehouseCode: 1 }, { name: 'idx_inventories_legacy_warehouse_code' }]
  ],
  journals: [
    [{ customerCode: 1 }, { name: 'idx_ar_ledger_customer_code' }],
    [{ customerName: 1 }, { name: 'idx_ar_ledger_customer_name', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_ar_ledger_order_code', sparse: true }],
    [{ refCode: 1 }, { name: 'idx_ar_ledger_ref_code', sparse: true }],
    [{ date: 1 }, { name: 'idx_ar_ledger_date' }],
    [{ customerCode: 1, date: 1 }, { name: 'idx_ar_ledger_customer_date' }],
    [{ customerCode: 1, type: 1, date: -1 }, { name: 'idx_ar_ledger_customer_type_date_desc' }],
    [{ refCode: 1, type: 1 }, { name: 'idx_ar_ledger_ref_code_type' }]
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
  ]
};

function sameIndexKey(left, right) {
  try {
    return JSON.stringify(left || {}) === JSON.stringify(right || {});
  } catch {
    return false;
  }
}

function sameIndexOptions(existing = {}, options = {}) {
  if (Boolean(existing.unique) !== Boolean(options.unique)) return false;
  if (Boolean(existing.sparse) !== Boolean(options.sparse)) return false;
  return true;
}

async function ensureMongoIndexes({ logger = console } = {}) {
  const results = [];
  for (const [collectionKey, definitions] of Object.entries(INDEX_DEFINITIONS)) {
    const Model = MongoStore[collectionKey];
    if (!Model || !Model.collection) continue;

    let existingIndexes = [];
    try {
      // Tối ưu: mỗi collection chỉ đọc danh sách index 1 lần.
      // Bản cũ gọi indexes() trong từng vòng lặp index, làm khởi động server chậm khi có nhiều index.
      existingIndexes = await Model.collection.indexes();
    } catch (err) {
      const message = `Không đọc được danh sách index ${collectionKey}: ${err.message}`;
      if (logger?.warn) logger.warn(message);
      else console.warn(message);
      continue;
    }

    for (const [fields, options] of definitions) {
      try {
        const sameKeyDifferentOptions = existingIndexes.find((idx) => {
          return sameIndexKey(idx.key, fields) && !sameIndexOptions(idx, options);
        });

        if (sameKeyDifferentOptions) {
          const message = `Index ${collectionKey}.${sameKeyDifferentOptions.name} cùng key nhưng khác option với ${options?.name}. Cần drop index cũ sau khi audit duplicate.`;
          if (logger?.warn) logger.warn(message);
          else console.warn(message);

          results.push({
            collectionKey,
            collection: Model.collection.name,
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
            collection: Model.collection.name,
            indexName: options?.name,
            skipped: true
          });
          continue;
        }

        const indexName = await Model.collection.createIndex(fields, { background: true, ...options });
        existingIndexes.push({ key: fields, name: indexName, ...options });
        results.push({ collectionKey, collection: Model.collection.name, indexName });
      } catch (err) {
        const message = `Không tạo được index ${collectionKey}.${options?.name || JSON.stringify(fields)}: ${err.message}`;
        if (logger?.warn) logger.warn(message);
        else console.warn(message);
      }
    }
  }
  return results;
}

module.exports = { INDEX_DEFINITIONS, ensureMongoIndexes };
