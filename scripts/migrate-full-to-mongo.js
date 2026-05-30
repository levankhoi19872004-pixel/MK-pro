// scripts/migrate-full-to-mongo.js
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { MongoStore } = require('../src/services/mongoSyncService');

dotenv.config();

const DATA_FILE = path.join(__dirname, '../data/kho-data.json');
const BACKUP_FILE = path.join(__dirname, '../data/kho-data-backup-' + Date.now() + '.json');

async function migrateToMongo() {
  console.log('🚀 BẮT ĐẦU MIGRATION JSON → MONGODB');

  try {
    // 1. Kết nối MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Kết nối MongoDB thành công');

    // 2. Backup file JSON
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    fs.writeFileSync(BACKUP_FILE, rawData);
    console.log(`✅ Đã backup JSON vào: ${BACKUP_FILE}`);

    const data = JSON.parse(rawData);

    // 3. Danh sách collection cần migrate
    const collections = [
      'products', 'customers', 'staffs', 'warehouses',
      'stock', 'importOrders', 'salesOrders', 'masterOrders',
      'payments', 'receipts', 'returnOrders', 'masterReturnOrders', 'cashbooks',
      'bankbooks', 'importLogs', 'mobileLogs', 'auditLogs',
      'promotions', 'importTemplates'
    ];

    console.log('\n📊 Bắt đầu migrate...');

    for (const key of collections) {
      if (data[key] && Array.isArray(data[key]) && data[key].length > 0) {
        const Model = MongoStore[key];
        if (!Model) {
          console.warn(`⚠️ Không tìm thấy model cho: ${key}`);
          continue;
        }

        await Model.deleteMany({}); // Xóa dữ liệu cũ
        await Model.insertMany(data[key], { ordered: false });

        console.log(`✅ Migrated ${data[key].length} documents vào ${key}`);
      } else {
        console.log(`ℹ️ Collection ${key} trống hoặc không tồn tại`);
      }
    }

    // 4. Migrate Settings & Counters (nếu có)
    if (data.settings) {
      await MongoStore.settings.deleteMany({});
      await MongoStore.settings.insertMany(Object.entries(data.settings).map(([key, value]) => ({
        key,
        value,
        updatedAt: new Date().toISOString()
      })));
      console.log('✅ Migrated settings');
    }

    console.log('\n🎉 MIGRATION HOÀN TẤT THÀNH CÔNG!');
    console.log('📁 File backup được tạo tại:', BACKUP_FILE);

  } catch (error) {
    console.error('❌ Migration thất bại:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

// Chạy script
if (require.main === module) {
  migrateToMongo().then(() => process.exit(0));
}

module.exports = { migrateToMongo };