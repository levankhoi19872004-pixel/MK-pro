'use strict';

const MongoStore = require('../models');

const INDEX_DEFINITIONS = {
  products: [
    [{ code: 1 }, { name: 'idx_products_code' }],
    [{ name: 1 }, { name: 'idx_products_name' }],
    [{ barcode: 1 }, { name: 'idx_products_barcode', sparse: true }],
    [{ category: 1 }, { name: 'idx_products_category' }],
    [{ brand: 1 }, { name: 'idx_products_brand' }],
    [{ isActive: 1, code: 1 }, { name: 'idx_products_active_code' }]
  ],
  customers: [
    [{ code: 1 }, { name: 'idx_customers_code' }],
    [{ name: 1 }, { name: 'idx_customers_name' }],
    [{ phone: 1 }, { name: 'idx_customers_phone' }],
    [{ staffCode: 1 }, { name: 'idx_customers_staff_code' }],
    [{ route: 1 }, { name: 'idx_customers_route' }],
    [{ isActive: 1, code: 1 }, { name: 'idx_customers_active_code' }]
  ],
  staffs: [
    [{ code: 1 }, { name: 'idx_staffs_code', sparse: true }],
    [{ username: 1 }, { name: 'idx_staffs_username', sparse: true }],
    [{ role: 1, isActive: 1 }, { name: 'idx_staffs_role_active' }]
  ],
  roles: [[{ code: 1 }, { name: 'idx_roles_code', unique: true, sparse: true }]],
  permissions: [[{ roleCode: 1, module: 1 }, { name: 'idx_permissions_role_module' }]],
  salesOrders: [
    [{ id: 1 }, { name: 'idx_orders_id' }],
    [{ code: 1 }, { name: 'idx_orders_code' }],
    [{ customerId: 1 }, { name: 'idx_orders_customer_id', sparse: true }],
    [{ customerCode: 1 }, { name: 'idx_orders_customer_code' }],
    [{ customerName: 1 }, { name: 'idx_orders_customer_name' }],
    [{ staffCode: 1 }, { name: 'idx_orders_staff_code' }],
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
    [{ deliveryDate: 1, deliveryStaffCode: 1, status: 1 }, { name: 'idx_master_orders_mobile_delivery_fast' }],
    [{ deliveryDate: 1, status: 1 }, { name: 'idx_master_orders_delivery_date_status' }],
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
    [{ sourceOrderId: 1 }, { name: 'idx_return_orders_source_order' }],
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
    [{ orderId: 1 }, { name: 'idx_receipts_order_id', sparse: true }],
    [{ orderCode: 1 }, { name: 'idx_receipts_order_code', sparse: true }],
    [{ date: 1, status: 1 }, { name: 'idx_receipts_date_status' }],
    [{ method: 1, status: 1 }, { name: 'idx_receipts_method_status' }],
    [{ createdAt: -1 }, { name: 'idx_receipts_created_at' }]
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
  stock: [
    [{ productCode: 1, warehouseCode: 1 }, { name: 'idx_inventory_snapshot_product_warehouse' }],
    [{ warehouseCode: 1 }, { name: 'idx_inventory_snapshot_warehouse' }]
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
    [{ fileName: 1 }, { name: 'idx_import_logs_file_name' }]
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
