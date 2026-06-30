# API Query Performance — Rollback

## Rollback nhanh

Triển khai lại file baseline:

```text
MK-pro-phase05-dependency-god-service-refactor-patched.zip
```

Không có migration, schema change, package change hoặc index change nên không cần rollback database.

## Rollback theo file

Khôi phục từ baseline hai file:

```bash
cp <baseline>/src/services/inventoryStock.service.js src/services/inventoryStock.service.js
cp <baseline>/src/services/reports/InventoryReportService.js src/services/reports/InventoryReportService.js
```

Xóa các artifact/test mới của Giai đoạn 06:

```bash
rm -f test/api-query-performance-optimizations.test.js
rm -f scripts/performance/inventory-api-benchmark.js
rm -f scripts/performance/explain-inventory-report-queries.js
rm -f API_QUERY_PERFORMANCE_REPORT.md API_QUERY_BENCHMARK.json API_QUERY_BENCHMARK.csv
rm -f API_QUERY_EXPLAIN_PLANS.json INDEX_MANIFEST.json API_QUERY_ROLLBACK.md
```

Sau rollback chạy:

```bash
npm run check:syntax
npm run check:source-bundles
npm test
npm run docs:check
npm audit --omit=dev --audit-level=high
```
