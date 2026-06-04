'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const REDUNDANT_INDEXES = {
  products: [
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
  orders: [
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
    'idx_master_orders_delivery_staff_code',
    'idx_master_orders_delivery_staff_name',
    'idx_master_orders_route_name',
    'idx_master_orders_mobile_delivery_fast',
    'idx_master_orders_hot_list_report',
    'idx_master_orders_delivery_date_status',
    'idx_master_orders_date',
    'idx_master_orders_perf_delivery_staff_status',
    'idx_master_orders_perf_date_staff'
  ]
};

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dryRun = process.argv.includes('--dry-run');

  for (const [collectionName, indexNames] of Object.entries(REDUNDANT_INDEXES)) {
    const collection = db.collection(collectionName);
    const existing = await collection.indexes().catch(() => []);
    const existingNames = new Set(existing.map((idx) => idx.name));
    for (const indexName of indexNames) {
      if (!existingNames.has(indexName)) continue;
      if (dryRun) {
        console.log(`[DRY-RUN] ${collectionName}: sẽ xoá index ${indexName}`);
        continue;
      }
      await collection.dropIndex(indexName);
      console.log(`${collectionName}: đã xoá index ${indexName}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Không xoá được index trùng:', err.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
