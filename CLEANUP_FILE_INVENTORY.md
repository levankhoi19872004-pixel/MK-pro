# Cleanup File Inventory

## Summary

| Nhóm | Số file | Dung lượng | Ghi chú |
|---|---:|---:|---|
| Archived reports/artifacts | 193 | 2.95 MB | Artifact/report cũ đã tách khỏi root/source deploy. |
| Config/package | 3 | 16.15 KB |  |
| Core source/runtime | 557 | 3.26 MB | Không xoá source runtime trong cleanup. |
| Docs | 17 | 468.54 KB |  |
| Frontend/public assets | 174 | 2.35 MB |  |
| Generated artifacts | 26 | 11.31 KB |  |
| Other | 21 | 141.01 KB |  |
| Root kept docs/artifacts | 23 | 406.89 KB | Giữ do runtime/test/ops hoặc chưa đủ bằng chứng để archive. |
| Scripts/audit/rebuild/ops | 93 | 474.85 KB |  |
| Tests/static guards | 401 | 1.19 MB |  |

- Tổng file sau cleanup, không tính `node_modules`: **1508**
- Tổng dung lượng sau cleanup, không tính `node_modules`: **11.24 MB**
- File gốc trước cleanup, không tính `node_modules`: **1459**

## Top Large Files

| File | Size | Nhóm |
|---|---:|---|
| `docs/openapi.json` | 440.14 KB | Docs |
| `docs/reports/archive/phase84-command-results/npm_test_full.out` | 300.37 KB | Archived reports/artifacts |
| `docs/reports/archive/phase84-command-results/npm_test_full.stdout` | 300.10 KB | Archived reports/artifacts |
| `docs/reports/archive/root-artifacts/CSP_XSS_SINK_BASELINE.json` | 264.96 KB | Archived reports/artifacts |
| `docs/reports/archive/root-artifacts/PHASE20_DELIVERY_FRONTEND_MODULARIZATION_P2_DIFF.patch` | 261.47 KB | Archived reports/artifacts |
| `CSP_XSS_SINK_INVENTORY.json` | 211.29 KB | Root kept docs/artifacts |
| `docs/reports/archive/root-artifacts/PHASE15_DELIVERY_MOBILE_UI_P0P1_DIFF.patch` | 205.38 KB | Archived reports/artifacts |
| `docs/reports/archive/root-artifacts/API_PERFORMANCE_AUDIT.md` | 119.48 KB | Archived reports/artifacts |
| `public/mobile/js/delivery-mobile-view.js.map` | 117.28 KB | Frontend/public assets |
| `docs/reports/archive/root-artifacts/PRODUCTION_OPERATIONS_HARDENING_DIFF.patch` | 113.95 KB | Archived reports/artifacts |
| `docs/reports/archive/root-artifacts/PHASE80_AR_READ_STANDARD_AUDIT_REPORT.md` | 98.80 KB | Archived reports/artifacts |
| `docs/reports/archive/root-artifacts/FRONTEND_UI_TEST.png` | 89.15 KB | Archived reports/artifacts |
| `public/mobile/js/delivery-mobile-view.source.js` | 71.75 KB | Frontend/public assets |
| `docs/reports/archive/root-artifacts/PRODUCTION_CONFIGURATION_HARDENING_DIFF.patch` | 65.84 KB | Archived reports/artifacts |
| `package-lock.json` | 63.38 KB | Root kept docs/artifacts |
| `public/mobile/js/delivery-mobile-view.js` | 60.62 KB | Frontend/public assets |
| `docs/reports/archive/root-artifacts/API_QUERY_EXPLAIN_PLANS.json` | 55.02 KB | Archived reports/artifacts |
| `CLEANUP_CANDIDATES.md` | 49.84 KB | Root kept docs/artifacts |
| `docs/reports/archive/root-artifacts/PHASE12_DELIVERY_OWNER_SCOPE_P0_DIFF.patch` | 49.26 KB | Archived reports/artifacts |
| `public/js/app/debt/07a-debt-core.js` | 42.11 KB | Frontend/public assets |
| `public/js/app/admin/08a-reports.js` | 41.82 KB | Frontend/public assets |
| `src/services/reports/ReportCenterService.js` | 41.72 KB | Core source/runtime |
| `src/services/mongoIndexService.js` | 40.08 KB | Core source/runtime |
| `public/js/delivery/delivery-web-view.js` | 39.95 KB | Frontend/public assets |
| `src/services/master-order/deliveryAccountingCore.impl.js` | 39.66 KB | Core source/runtime |

## Suspicious Files

Không còn file match mẫu rác chắc chắn sau cleanup: `*.tmp`, `*.bak`, `*.old`, `*.orig`, `*.log`, `*.zip`, `.DS_Store`, `Thumbs.db`, `npm-debug.log`, `yarn-error.log`.

## Reports/Artifacts

- Root artifact đã archive: **143**
- Report trong `reports/` đã archive: **2**
- Command evidence: `docs/reports/archive/phase84-command-results/` (48 file).

## Scripts

- Tổng file script: **93**
- Không xoá script audit/rebuild/reconcile/repair/plan/apply/migrate.
- Có chỉnh `scripts/check-path-portability.js` để bỏ qua `require()` nằm trong comment, tránh false positive; không đổi business logic.

## Tests

- Tổng file trong `test/`: **401**
- Không xoá static guard. `npm test` PASS: 1.312 tests, 1.311 pass, 1 skip, 0 fail.

## Source Files

- Tổng file trong `src/`: **556**
- Không xoá/sửa business logic trong `src/`.
