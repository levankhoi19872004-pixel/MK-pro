require('dotenv').config();
const connectDb = require('../config/db');
const { ensureAdminUser } = require('../services/userService');
const { saveDb } = require('../services/dataService');

async function run(){
  await connectDb();
  await ensureAdminUser();
  await saveDb({
    products: [{ sku: 'SP001', name: 'Sản phẩm mẫu', brand: '', category: '', unit: 'cái', pack: 12, costRef: 0, saleRef: 0, warehouse: 'Kho chính', status: 'active' }],
    stocks: [{ sku: 'SP001', qty: 0, avgCost: 0, lastCost: 0, updatedAt: new Date().toISOString() }],
    customers: [{ code: 'KH001', name: 'Khách lẻ', phone: '', address: '' }],
    staff: [{ code: 'NV001', name: 'Nhân viên bán hàng mẫu' }],
    deliveryStaff: [{ code: 'GH001', name: 'Nhân viên giao hàng mẫu' }]
  });
  console.log('Seed done');
  process.exit(0);
}
run().catch(err=>{ console.error(err); process.exit(1); });
