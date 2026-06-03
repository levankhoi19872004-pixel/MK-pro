'use strict';

const MongoStore = require('../models');

const INDEX_DEFINITIONS = {
  products: [
    [{ code: 1 }, { name: 'idx_products_code' }],
    [{ name: 1 }, { name: 'idx_products_name' }],
    [{ barcode: 1 }, { name: 'idx_products_barcode', sparse: true }],
    [{ category: 1 }, { name: 'idx_products_category' }],
    [{ brand: 1 }, { name: 'idx_products_brand' }],
    [{ salePrice: 1 }, { name: 'idx_products_sale_price', sparse: true }],
    [{ warehouseCode: 1 }, { name: 'idx_products_warehouse_code' }],
    [{ warehouseCode: 1, code: 1 }, { name: 'idx_products_warehouse_code_code' }],
    [{ isActive: 1, code: 1 }, { name: 'idx_products_active_code' }],
    [{ isActive: 1, category: 1 }, { name: 'idx_products_active_category' }],
    [{ searchText: 1 }, { name: 'idx_products_search_text' }],
    [{ searchText: 'text' }, { name: 'txt_products_search_text', default_language: 'none' }]
  ],
  customers: [
    [{ code: 1 }, { name: 'idx_customers_code' }],
    [{ customerCode: 1 }, { name: 'idx_customers_customer_code', sparse: true }],
    [{ name: 1 }, { name: 'idx_customers_name' }],
    [{ customerName: 1 }, { name: 'idx_customers_customer_name', sparse: true }],
    [{ phone: 1 }, { name: 'idx_customers_phone' }],
    [{ staffCode: 1 }, { name: 'idx_customers_staff_code' }],
    [{ route: 1 }, { name: 'idx_customers_route' }],
    [{ routeName: 1 }, { name: 'idx_customers_route_name', sparse: true }],
    [{ isActive: 1, code: 1 }, { name: 'idx_customers_active_code' }],
    [{ staffCode: 1, route: 1, isActive: 1 }, { name: 'idx_customers_staff_route_active' }],
    [{ searchText: 1 }, { name: 'idx_customers_search_text' }],
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
    [{ staffCode: 1 }, { name: 'idx_users_staff_code', sparse: true }],
    [{ username: 1 }, { name: 'idx_users_username_search', sparse: true }],
    [{ code: 1 }, { name: 'idx_users_code', sparse: true }],
    [{ employeeCode: 1 }, { name: 'idx_users_employee_code', sparse: true }],
    [{ salesStaffCode: 1 }, { name: 'idx_users_sales_staff_code', sparse: true }],
    [{ deliveryStaffCode: 1 }, { name: 'idx_users_delivery_staff_code', sparse: true }],
    [{ fullName: 1 }, { name: 'idx_users_full_name', sparse: true }],
    [{ role: 1, isActive: 1 }, { name: 'idx_users_role_active' }],
    [{ role: 1, isActive: 1, staffCode: 1 }, { name: 'idx_users_role_active_staff_code' }]
  ],
  roles: [[{ code: 1 }, { name: 'idx_roles_code', unique: true, sparse: true }]],
  permissions: [[{ roleCode: 1, module: 1 }, { name: 'idx_permissions_role_module' }]],
  salesOrders: [
    [{ id: 1 }, { name: 'idx_orders_id' }],
    [{ code: 1 }, { name: 'idx_orders_code' }],
    [{ documentCode: 1 }, { name: 'idx_orders_document_code', sparse: true }],
    [{ invoiceCode: 1 }, { name: 'idx_orders_invoice_code', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_orders_order_code', sparse: true }],
    [{ salesOrderCode: 1 }, { name: 'idx_orders_sales_order_code', sparse: true }],
    [{ date: 1, status: 1 }, { name: 'idx_orders_date_status' }],
    [{ status: 1, deliveryStatus: 1, date: -1, customerCode: 1, staffCode: 1, mergeStatus: 1 }, { name: 'idx_orders_hot_list_report' }],
    [{ mergeStatus: 1, date: -1, staffCode: 1 }, { name: 'idx_orders_merge_date_staff' }],
    [{ status: 1, date: -1 }, { name: 'idx_orders_status_date_desc' }],
    [{ customerId: 1 }, { name: 'idx_orders_customer_id', sparse: true }],
    [{ customerCode: 1 }, { name: 'idx_orders_customer_code' }],
    [{ customerName: 1 }, { name: 'idx_orders_customer_name' }],
    [{ staffCode: 1 }, { name: 'idx_orders_staff_code' }],
    [{ staffName: 1 }, { name: 'idx_orders_staff_name', sparse: true }],
    [{ routeName: 1 }, { name: 'idx_orders_route_name', sparse: true }],
    [{ deliveryStaffId: 1 }, { name: 'idx_orders_delivery_staff_id', sparse: true }],
    [{ deliveryStaffCode: 1 }, { name: 'idx_orders_delivery_staff_code' }],
    [{ deliveryDate: 1, deliveryStaffCode: 1, deliveryStatus: 1 }, { name: 'idx_orders_mobile_delivery_fast' }],
    [{ deliveryDate: 1, status: 1 }, { name: 'idx_orders_delivery_date_status' }],
    [{ arStatus: 1, deliveryDate: 1 }, { name: 'idx_orders_ar_status_delivery_date' }],
    [{ createdAt: -1 }, { name: 'idx_orders_created_at' }]
  ],
  masterOrders: [
    [{ id: 1 }, { name: 'idx_master_orders_id' }],
    [{ code: 1 }, { name: 'idx_master_orders_code' }],
    [{ deliveryStaffId: 1 }, { name: 'idx_master_orders_delivery_staff_id', sparse: true }],
    [{ deliveryStaffCode: 1 }, { name: 'idx_master_orders_delivery_staff_code' }],
    [{ deliveryStaffName: 1 }, { name: 'idx_master_orders_delivery_staff_name', sparse: true }],
    [{ routeName: 1 }, { name: 'idx_master_orders_route_name', sparse: true }],
    [{ deliveryDate: 1, deliveryStaffCode: 1, status: 1 }, { name: 'idx_master_orders_mobile_delivery_fast' }],
    [{ status: 1, deliveryStatus: 1, date: -1, customerCode: 1, staffCode: 1, mergeStatus: 1 }, { name: 'idx_master_orders_hot_list_report' }],
    [{ deliveryDate: 1, status: 1 }, { name: 'idx_master_orders_delivery_date_status' }],
    [{ deliveryStatus: 1, arStatus: 1, deliveryDate: 1 }, { name: 'idx_master_orders_delivery_ar_date' }],
    [{ accountingConfirmed: 1, deliveryDate: 1 }, { name: 'idx_master_orders_accounting_date' }],
    [{ date: 1 }, { name: 'idx_master_orders_date', sparse: true }],
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
    [{ createdAt: -1 }, { name: 'idx_import_orders_created_at' }]
  ],
  returnOrders: [
    [{ id: 1 }, { name: 'idx_return_orders_id' }],
    [{ code: 1 }, { name: 'idx_return_orders_code' }],
    [{ customerCode: 1 }, { name: 'idx_return_orders_customer_code' }],
    [{ salesOrderId: 1 }, { name: 'idx_return_orders_sales_order_id', sparse: true }],
    [{ salesOrderCode: 1 }, { name: 'idx_return_orders_sales_order_code', sparse: true }],
    [{ orderId: 1 }, { name: 'idx_return_orders_order_id', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_return_orders_order_code', sparse: true }],
    [{ sourceOrderId: 1 }, { name: 'idx_return_orders_source_order' }],
    [{ sourceOrderCode: 1 }, { name: 'idx_return_orders_source_order_code', sparse: true }],
    [{ status: 1 }, { name: 'idx_return_orders_status' }],
    [{ sourceOrderId: 1, status: 1 }, { name: 'idx_return_orders_source_status' }],
    [{ masterReturnOrderCode: 1 }, { name: 'idx_return_orders_master_return_code', sparse: true }],
    [{ returnMergeStatus: 1, date: 1 }, { name: 'idx_return_orders_merge_date' }],
    [{ createdAt: -1 }, { name: 'idx_return_orders_created_at' }]
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
    [{ id: 1 }, { name: 'idx_ar_ledgers_id' }],
    [{ code: 1 }, { name: 'idx_ar_ledgers_code' }],
    [{ customerCode: 1 }, { name: 'idx_ar_ledgers_customer_code' }],
    [{ customerName: 1 }, { name: 'idx_ar_ledgers_customer_name', sparse: true }],
    [{ orderId: 1 }, { name: 'idx_ar_ledgers_order_id', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_ar_ledgers_order_code', sparse: true }],
    [{ refType: 1, refId: 1 }, { name: 'idx_ar_ledgers_ref' }],
    [{ refType: 1, refId: 1, type: 1 }, { name: 'idx_ar_ledgers_ref_type' }],
    [{ refCode: 1 }, { name: 'idx_ar_ledgers_ref_code', sparse: true }],
    [{ date: 1 }, { name: 'idx_ar_ledgers_date' }],
    [{ customerCode: 1, date: 1 }, { name: 'idx_ar_ledgers_customer_date' }],
    [{ customerCode: 1, type: 1, date: -1 }, { name: 'idx_ar_ledgers_customer_type_date_desc' }],
    [{ refCode: 1, type: 1 }, { name: 'idx_ar_ledgers_ref_code_type' }],
    [{ source: 1 }, { name: 'idx_ar_ledgers_source' }]
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

  fundLedgers: [
    [{ id: 1 }, { name: 'idx_fund_ledgers_id' }],
    [{ code: 1 }, { name: 'idx_fund_ledgers_code' }],
    [{ date: 1, fundType: 1, direction: 1 }, { name: 'idx_fund_ledgers_date_fund_direction' }],
    [{ sourceType: 1, sourceCode: 1, fundType: 1, direction: 1 }, { name: 'idx_fund_ledgers_source_unique_guard' }],
    [{ deliveryDate: 1, deliveryStaffCode: 1 }, { name: 'idx_fund_ledgers_delivery_staff_date' }],
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
    [{ productCode: 1, warehouseCode: 1 }, { name: 'idx_inventories_product_warehouse' }],
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
    [{ date: 1, productCode: 1, warehouseCode: 1 }, { name: 'idx_stock_tx_date_product_warehouse' }],
    [{ refType: 1, refId: 1 }, { name: 'idx_stock_tx_ref' }],
    [{ productCode: 1, date: 1 }, { name: 'idx_stock_tx_product_date' }]
  ],
  warehouses: [[{ code: 1 }, { name: 'idx_warehouses_code' }]],
  promotions: [
    [{ code: 1 }, { name: 'idx_promotions_code' }],
    [{ isActive: 1, startDate: 1, endDate: 1 }, { name: 'idx_promotions_active_dates' }],
    [{ productCodes: 1 }, { name: 'idx_promotions_product_codes' }]
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
    [{ sessionId: 1 }, { name: 'idx_import_sessions_session_id', unique: true, sparse: true }],
    [{ createdAt: 1 }, { name: 'ttl_import_sessions_created_at', expireAfterSeconds: Number(process.env.IMPORT_SESSION_TTL_SECONDS || 3600) }]
  ]
};

async function ensureMongoIndexes({ logger = console } = {}) {
  const results = [];
  for (const [collectionKey, definitions] of Object.entries(INDEX_DEFINITIONS)) {
    const Model = MongoStore[collectionKey];
    if (!Model || !Model.collection) continue;
    for (const [fields, options] of definitions) {
      try {
        const existingIndexes = await Model.collection.indexes();
        const hasEquivalentIndex = existingIndexes.some((idx) => {
          try {
            return JSON.stringify(idx.key) === JSON.stringify(fields);
          } catch {
            return false;
          }
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
