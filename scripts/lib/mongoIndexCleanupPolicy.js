'use strict';

// Tên index đã bị loại khỏi policy chuẩn sau khi đối chiếu query thực tế.
// Danh sách này chỉ dùng cho công cụ audit/cleanup; mongoIndexService không tự drop index.
const RETIRED_INDEX_NAMES = Object.freeze({
  products: [
    'idx_products_active_category',
    'idx_products_brand',
    'idx_products_warehouse_code_code',
    'txt_products_search_text',
    'idx_products_name',
    'idx_products_category',
    'idx_products_sale_price',
    'idx_products_warehouse_code',
    'idx_products_search_text',
    'name_1',
    'category_1',
    'searchText_1'
  ],
  customers: [
    'idx_customers_route_name',
    'txt_customers_search_text',
    'idx_customers_name',
    'idx_customers_customer_name',
    'idx_customers_staff_code',
    'idx_customers_route',
    'idx_customers_search_text',
    'name_1',
    'staffCode_1',
    'route_1',
    'searchText_1'
  ],
  users: [
    'idx_users_code',
    'idx_users_employee_code',
    'idx_users_sales_staff_code',
    'idx_users_delivery_staff_code',
    'code_1',
    'employeeCode_1',
    'salesStaffCode_1',
    'deliveryStaffCode_1'
  ],
  roles: [
    'idx_roles_code'
  ],
  permissions: [
    'idx_permissions_role_module',
    'roleCode_1',
    'module_1'
  ],
  orders: [
    'idx_orders_order_code',
    'idx_orders_order_no',
    'idx_orders_sales_order_code',
    'idx_orders_customer_id',
    'idx_orders_sales_staff_date_status_created',
    'idx_orders_staff_order_date',
    'idx_orders_status_order_date',
    'idx_sales_orders_delivery_date_staff_status',
    'idx_orders_delivery_staff_date_desc',
    'idx_orders_delivery_status_date_desc',
    'idx_orders_ar_status_delivery_date',
    'idx_orders_date_status',
    'idx_orders_hot_list_report',
    'idx_orders_merge_date_staff',
    'idx_orders_status_date_desc',
    'idx_orders_customer_code',
    'idx_orders_customer_name',
    'idx_orders_staff_code',
    'idx_orders_staff_name',
    'idx_orders_route_name',
    'idx_orders_delivery_staff_code',
    'idx_orders_mobile_delivery_fast',
    'idx_orders_delivery_date_status',
    'idx_orders_created_at',
    'idx_orders_search_date_created_desc',
    'idx_orders_search_sales_staff_order_date',
    'idx_orders_search_order_date_sales_staff_status',
    'idx_orders_search_order_date_source_status',
    'idx_orders_search_sales_staff_date',
    'idx_orders_search_source_order_date',
    'orderDate_-1_createdAt_-1',
    'date_-1_createdAt_-1',
    'deliveryDate_-1_deliveryStaffCode_1_deliveryStatus_1',
    'salesStaffCode_1_orderDate_-1',
    'orderDate_-1_salesStaffCode_1_status_1',
    'source_1_orderDate_-1',
    'orderSource_1_orderDate_-1'
  ],
  master_orders: [
    'idx_master_orders_delivery_staff_id',
    'idx_master_orders_delivery_staff_date_desc',
    'idx_master_orders_date_staff_desc',
    'idx_master_orders_created_at',
    'idx_master_orders_delivery_staff_code',
    'idx_master_orders_delivery_staff_name',
    'idx_master_orders_route_name',
    'idx_master_orders_mobile_delivery_fast',
    'idx_master_orders_hot_list_report',
    'idx_master_orders_delivery_date_status',
    'idx_master_orders_date',
    'idx_master_orders_perf_delivery_staff_status',
    'idx_master_orders_perf_date_staff'
  ],
  returnOrders: [
    'idx_return_orders_customer_code',
    'idx_return_orders_sales_order_id',
    'idx_return_orders_sales_order_code',
    'idx_return_orders_order_id',
    'idx_return_orders_order_code',
    'idx_return_orders_source_order',
    'idx_return_orders_source_order_code',
    'idx_return_orders_status',
    'idx_return_orders_status_delivery_date_desc',
    'idx_return_orders_delivery_order_id',
    'idx_return_orders_delivery_order_code'
  ],
  inventories: [
    'idx_inventory_snapshot_product_warehouse',
    'idx_inventory_snapshot_warehouse',
    'idx_inventories_product_code',
    'idx_inventories_warehouse_code',
    'idx_inventories_legacy_product_warehouse',
    'idx_inventories_legacy_product_code',
    'idx_inventories_legacy_warehouse_code',
    'productCode_1',
    'warehouseCode_1'
  ],
  journals: [
    'idx_payments_id',
    'idx_payments_code',
    'idx_payments_type_order_id',
    'idx_payments_type_order_code',
    'idx_payments_customer_id_date',
    'idx_payments_customer_code_date',
    'idx_payments_date_type_status',
    'idx_payments_created_at',
    'idx_ar_ledger_customer_code',
    'idx_ar_ledger_customer_name',
    'idx_ar_ledger_order_code',
    'idx_ar_ledger_ref_code',
    'idx_ar_ledger_date',
    'idx_ar_ledger_customer_date'
  ]
});

// Chỉ dọn toàn bộ index ngoài _id_ khi collection đã rỗng. Không tự drop collection.
const EMPTY_RETIRED_COLLECTIONS = Object.freeze([
  'inventorySnapshots',
  'salesSnapshots',
  'staffs'
]);

module.exports = {
  RETIRED_INDEX_NAMES,
  EMPTY_RETIRED_COLLECTIONS
};
