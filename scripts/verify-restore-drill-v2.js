const mongoose = require("mongoose");
const fs = require("fs");

const uri =
  "mongodb://127.0.0.1:27018/mkpro_restore_drill_20260621_v2";

const reportPath =
  "E:/MK-Pro-Backup/restore-drill-20260621-v2-report.json";

async function main() {
  const connection = await mongoose
    .createConnection(uri, {
      serverSelectionTimeoutMS: 5000
    })
    .asPromise();

  const collectionInfos = await connection.db
    .listCollections({}, { nameOnly: true })
    .toArray();

  const collections = [];

  for (const item of collectionInfos.sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const collection = connection.db.collection(item.name);

    const [documents, indexes] = await Promise.all([
      collection.countDocuments({}),
      collection.indexes()
    ]);

    collections.push({
      collection: item.name,
      documents,
      indexCount: indexes.length,
      indexes: indexes.map(index => index.name)
    });
  }

  const totalDocuments = collections.reduce(
    (total, item) => total + item.documents,
    0
  );

  const criticalNames = [
    "products",
    "customers",
    "users",
    "orders",
    "salesOrders",
    "master_orders",
    "returnOrders",
    "inventories",
    "stockTransactions",
    "arLedgers",
    "fundLedgers",
    "promotionProductRules",
    "reconciliation_reports"
  ];

  const criticalCollections = criticalNames.map(name => {
    const result = collections.find(
      item => item.collection === name
    );

    return {
      collection: name,
      exists: Boolean(result),
      documents: result?.documents ?? 0,
      indexCount: result?.indexCount ?? 0
    };
  });

  const report = {
    database: connection.name,
    checkedAt: new Date().toISOString(),
    collectionCount: collections.length,
    totalDocuments,
    expectedRestoredDocuments: 30781,
    totalDocumentsMatched: totalDocuments === 30781,
    criticalCollections,
    collections
  };

  fs.writeFileSync(
    reportPath,
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("\n===== RESTORE VALIDATION =====");
  console.log(`Database: ${report.database}`);
  console.log(`Collections: ${report.collectionCount}`);
  console.log(`Documents: ${report.totalDocuments}`);
  console.log(
    `Document total matched: ${report.totalDocumentsMatched}`
  );

  console.table(criticalCollections);

  console.log(`REPORT_SAVED: ${reportPath}`);

  await connection.close();

  if (!report.totalDocumentsMatched) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
