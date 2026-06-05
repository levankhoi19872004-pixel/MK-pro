'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const { ensureMongoIndexes } = require('../src/services/mongoIndexService');

async function main() {
  await connectDB();
  const results = await ensureMongoIndexes();
  console.log(`✅ Đã kiểm tra/tạo ${results.length} Mongo indexes`);
  results.forEach((item) => console.log(`- ${item.collection}: ${item.indexName}`));
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Không tạo được Mongo indexes:', err);
  process.exit(1);
});
