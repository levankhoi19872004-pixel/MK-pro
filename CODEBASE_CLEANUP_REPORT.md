# Codebase Cleanup Report

## 1. Executive Summary

- Đã xoá: **1 file**.
- Đã archive: **145 file gốc/cũ** vào `docs/reports/archive/`.
- Không xoá file nghiệp vụ production trong `src/**`, `routes/**`, `controllers/**`, `services/**`, `models/**`, `engines/**`.
- Không đổi API contract, DB schema hoặc business rule.
- Có cập nhật **tooling cleanup/static check**: `scripts/check-path-portability.js` bỏ qua `require()` nằm trong comment để tránh false positive.
- Có refresh `RELEASE_MANIFEST.json` sau thay đổi cây source/tooling.
- Kết quả chính: `npm run check:syntax` PASS, `npm test` PASS, static audit bắt buộc PASS.

## 2. Deleted Files

| File | Lý do xoá | Bằng chứng |
|---|---|---|
| `reports/phase81-npm-test.log` | Generated npm/test log | Match `*.log`; không được require/import; không thuộc runtime. |

## 3. Archived Files

| File cũ | Vị trí archive | Lý do |
|---|---|---|
| `ADMIN_DATA_CORRECTION_STANDARD_REPORT.md` | `docs/reports/archive/root-artifacts/ADMIN_DATA_CORRECTION_STANDARD_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `API_PERFORMANCE_AUDIT.md` | `docs/reports/archive/root-artifacts/API_PERFORMANCE_AUDIT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `API_QUERY_BENCHMARK.csv` | `docs/reports/archive/root-artifacts/API_QUERY_BENCHMARK.csv` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `API_QUERY_BENCHMARK.json` | `docs/reports/archive/root-artifacts/API_QUERY_BENCHMARK.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `API_QUERY_EXPLAIN_PLANS.json` | `docs/reports/archive/root-artifacts/API_QUERY_EXPLAIN_PLANS.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `API_QUERY_PERFORMANCE_REPORT.md` | `docs/reports/archive/root-artifacts/API_QUERY_PERFORMANCE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `API_QUERY_ROLLBACK.md` | `docs/reports/archive/root-artifacts/API_QUERY_ROLLBACK.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_ADJUSTMENT_ADMIN_CORRECTION_GOVERNANCE_REPORT.md` | `docs/reports/archive/root-artifacts/AR_ADJUSTMENT_ADMIN_CORRECTION_GOVERNANCE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_DEBT_CLEAN_REFACTOR_REPORT.md` | `docs/reports/archive/root-artifacts/AR_DEBT_CLEAN_REFACTOR_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_EXTERNAL_DEBT_POSTING_GOVERNANCE_REPORT.md` | `docs/reports/archive/root-artifacts/AR_EXTERNAL_DEBT_POSTING_GOVERNANCE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_LEDGER_SSOT_DEBT_CACHE_GOVERNANCE_REPORT.md` | `docs/reports/archive/root-artifacts/AR_LEDGER_SSOT_DEBT_CACHE_GOVERNANCE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_RETURN_ALLOCATION_IDEMPOTENCY_REPORT.md` | `docs/reports/archive/root-artifacts/AR_RETURN_ALLOCATION_IDEMPOTENCY_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_RETURN_DEBT_SCOPED_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/AR_RETURN_DEBT_SCOPED_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_RETURN_DELIVERY_ACCOUNTING_SERVICE_REDIRECT_REPORT.md` | `docs/reports/archive/root-artifacts/AR_RETURN_DELIVERY_ACCOUNTING_SERVICE_REDIRECT_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_RETURN_DUPLICATE_ACTIVE_REPAIR_REPORT.md` | `docs/reports/archive/root-artifacts/AR_RETURN_DUPLICATE_ACTIVE_REPAIR_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_RETURN_IDEMPOTENCY_GUARD_REPORT.md` | `docs/reports/archive/root-artifacts/AR_RETURN_IDEMPOTENCY_GUARD_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `AR_SALE_REACCOUNTING_CONTRACT_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/AR_SALE_REACCOUNTING_CONTRACT_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `BACKGROUND_JOB_BENCHMARK.csv` | `docs/reports/archive/root-artifacts/BACKGROUND_JOB_BENCHMARK.csv` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `BACKGROUND_JOB_BENCHMARK.json` | `docs/reports/archive/root-artifacts/BACKGROUND_JOB_BENCHMARK.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `BASELINE_TEST_FIXTURE_TIME_DEPENDENCY.md` | `docs/reports/archive/root-artifacts/BASELINE_TEST_FIXTURE_TIME_DEPENDENCY.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `CANONICAL_SOURCE_PILOT_REPORT.md` | `docs/reports/archive/root-artifacts/CANONICAL_SOURCE_PILOT_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `CSP_HTTP_SMOKE.json` | `docs/reports/archive/root-artifacts/CSP_HTTP_SMOKE.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `CSP_MIDDLEWARE_BENCHMARK.csv` | `docs/reports/archive/root-artifacts/CSP_MIDDLEWARE_BENCHMARK.csv` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `CSP_MIDDLEWARE_BENCHMARK.json` | `docs/reports/archive/root-artifacts/CSP_MIDDLEWARE_BENCHMARK.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `CSP_XSS_HARDENING_REPORT.md` | `docs/reports/archive/root-artifacts/CSP_XSS_HARDENING_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `CSP_XSS_SINK_BASELINE.json` | `docs/reports/archive/root-artifacts/CSP_XSS_SINK_BASELINE.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `DELETION_MANIFEST.json` | `docs/reports/archive/root-artifacts/DELETION_MANIFEST.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `DELIVERY_ACCOUNTING_RECONFIRM_AR_LEDGER_SCOPED_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/DELIVERY_ACCOUNTING_RECONFIRM_AR_LEDGER_SCOPED_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `DELIVERY_GPS_DISABLE_REPORT.md` | `docs/reports/archive/root-artifacts/DELIVERY_GPS_DISABLE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `DELIVERY_PAYMENT_CONFIRM_FLOW_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/DELIVERY_PAYMENT_CONFIRM_FLOW_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `DEPENDENCY_AND_GOD_SERVICE_REFACTOR_REPORT.md` | `docs/reports/archive/root-artifacts/DEPENDENCY_AND_GOD_SERVICE_REFACTOR_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `FAILURE_SIMULATION_RESULT.json` | `docs/reports/archive/root-artifacts/FAILURE_SIMULATION_RESULT.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `FRONTEND_BENCHMARK.csv` | `docs/reports/archive/root-artifacts/FRONTEND_BENCHMARK.csv` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `FRONTEND_BENCHMARK.json` | `docs/reports/archive/root-artifacts/FRONTEND_BENCHMARK.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `FRONTEND_PROFESSIONALIZATION_REPORT.md` | `docs/reports/archive/root-artifacts/FRONTEND_PROFESSIONALIZATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `FRONTEND_STATIC_METRICS.json` | `docs/reports/archive/root-artifacts/FRONTEND_STATIC_METRICS.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `FRONTEND_UI_TEST.html` | `docs/reports/archive/root-artifacts/FRONTEND_UI_TEST.html` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `FRONTEND_UI_TEST.png` | `docs/reports/archive/root-artifacts/FRONTEND_UI_TEST.png` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `FUND_SUMMARY_IMPLEMENTATION_REPORT.md` | `docs/reports/archive/root-artifacts/FUND_SUMMARY_IMPLEMENTATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `INDEX_MANIFEST.json` | `docs/reports/archive/root-artifacts/INDEX_MANIFEST.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `INFORMATION_REPORTS_IMPLEMENTATION_REPORT.md` | `docs/reports/archive/root-artifacts/INFORMATION_REPORTS_IMPLEMENTATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `INVENTORY_LEDGER_AUDIT_REPORT.md` | `docs/reports/archive/root-artifacts/INVENTORY_LEDGER_AUDIT_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `INVOICE_EXPORT_EMPTY_FILE_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/INVOICE_EXPORT_EMPTY_FILE_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `INVOICE_EXPORT_FILTERS_SSE_NET_SALES_REPORT.md` | `docs/reports/archive/root-artifacts/INVOICE_EXPORT_FILTERS_SSE_NET_SALES_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `INVOICE_EXPORT_FULL_RETURN_EXCLUSION_REPORT.md` | `docs/reports/archive/root-artifacts/INVOICE_EXPORT_FULL_RETURN_EXCLUSION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `INVOICE_EXPORT_RETURNORDERS_PRODUCTION_RECHECK_REPORT.md` | `docs/reports/archive/root-artifacts/INVOICE_EXPORT_RETURNORDERS_PRODUCTION_RECHECK_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `LEGACY_STRANGLER_PILOT_REPORT.md` | `docs/reports/archive/root-artifacts/LEGACY_STRANGLER_PILOT_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MK-pro-phase12-api-performance-table-layout-fix-report.md` | `docs/reports/archive/root-artifacts/MK-pro-phase12-api-performance-table-layout-fix-report.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MK-pro-phase12-master-order-selected-list-layout-fix-report.md` | `docs/reports/archive/root-artifacts/MK-pro-phase12-master-order-selected-list-layout-fix-report.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MK-pro-phase12-web-direct-import-commit-no-worker-report.md` | `docs/reports/archive/root-artifacts/MK-pro-phase12-web-direct-import-commit-no-worker-report.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MK-pro-phase42-delivery-orders-return-performance-fix-report.md` | `docs/reports/archive/root-artifacts/MK-pro-phase42-delivery-orders-return-performance-fix-report.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MK-pro-phase43-delivery-all-filter-include-delivered-fix-report.md` | `docs/reports/archive/root-artifacts/MK-pro-phase43-delivery-all-filter-include-delivered-fix-report.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MOBILE_SALES_PHASE1_DATA_STABILITY_REPORT.md` | `docs/reports/archive/root-artifacts/MOBILE_SALES_PHASE1_DATA_STABILITY_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MOBILE_SALES_PHASE2_API_PERFORMANCE_REPORT.md` | `docs/reports/archive/root-artifacts/MOBILE_SALES_PHASE2_API_PERFORMANCE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MOBILE_SALES_PHASE3_UX_STANDARDIZATION_REPORT.md` | `docs/reports/archive/root-artifacts/MOBILE_SALES_PHASE3_UX_STANDARDIZATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MOBILE_SALES_PHASE4_FRONTEND_MODULARIZATION_REPORT.md` | `docs/reports/archive/root-artifacts/MOBILE_SALES_PHASE4_FRONTEND_MODULARIZATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `MOBILE_SALES_PHASE5_PRODUCTION_HARDENING_REPORT.md` | `docs/reports/archive/root-artifacts/MOBILE_SALES_PHASE5_PRODUCTION_HARDENING_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PERFORMANCE_BASELINE.csv` | `docs/reports/archive/root-artifacts/PERFORMANCE_BASELINE.csv` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PERFORMANCE_BASELINE.json` | `docs/reports/archive/root-artifacts/PERFORMANCE_BASELINE.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE09_FILE_MANIFEST.json` | `docs/reports/archive/root-artifacts/PHASE09_FILE_MANIFEST.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE10_FILE_CHANGES.json` | `docs/reports/archive/root-artifacts/PHASE10_FILE_CHANGES.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE11_EXPORT_NO_WORKER_DIRECT_DOWNLOAD_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE11_EXPORT_NO_WORKER_DIRECT_DOWNLOAD_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE11_FILE_CHANGES.json` | `docs/reports/archive/root-artifacts/PHASE11_FILE_CHANGES.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE11_IMPORT_PREVIEW_SESSION_CONTRACT_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE11_IMPORT_PREVIEW_SESSION_CONTRACT_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE11_TEST_GATE_FIX_CHANGES.json` | `docs/reports/archive/root-artifacts/PHASE11_TEST_GATE_FIX_CHANGES.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE11_TEST_GATE_FIX_DIFF.patch` | `docs/reports/archive/root-artifacts/PHASE11_TEST_GATE_FIX_DIFF.patch` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE11_TEST_GATE_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE11_TEST_GATE_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE11_TEST_RESULTS.json` | `docs/reports/archive/root-artifacts/PHASE11_TEST_RESULTS.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE12_DELIVERY_OWNER_SCOPE_P0_DIFF.patch` | `docs/reports/archive/root-artifacts/PHASE12_DELIVERY_OWNER_SCOPE_P0_DIFF.patch` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE12_DELIVERY_OWNER_SCOPE_P0_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE12_DELIVERY_OWNER_SCOPE_P0_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE13_DELIVERY_OFFLINE_QUEUE_P0_DIFF.patch` | `docs/reports/archive/root-artifacts/PHASE13_DELIVERY_OFFLINE_QUEUE_P0_DIFF.patch` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE13_DELIVERY_OFFLINE_QUEUE_P0_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE13_DELIVERY_OFFLINE_QUEUE_P0_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE14_DELIVERY_MONEY_INVENTORY_DEBT_FLOW_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE14_DELIVERY_MONEY_INVENTORY_DEBT_FLOW_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE15_DELIVERY_MOBILE_UI_P0P1_DIFF.patch` | `docs/reports/archive/root-artifacts/PHASE15_DELIVERY_MOBILE_UI_P0P1_DIFF.patch` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE15_DELIVERY_MOBILE_UI_P0P1_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE15_DELIVERY_MOBILE_UI_P0P1_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE16_DELIVERY_MOBILE_PERFORMANCE_P1_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE16_DELIVERY_MOBILE_PERFORMANCE_P1_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE17_DELIVERY_DEBT_PAGINATION_P1_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE17_DELIVERY_DEBT_PAGINATION_P1_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE18_DELIVERY_DUAL_API_CONTRACT_P1P2_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE18_DELIVERY_DUAL_API_CONTRACT_P1P2_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE19_DELIVERY_RECONCILIATION_REPORT_P1_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE19_DELIVERY_RECONCILIATION_REPORT_P1_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE20_DELIVERY_FRONTEND_MODULARIZATION_P2_DIFF.patch` | `docs/reports/archive/root-artifacts/PHASE20_DELIVERY_FRONTEND_MODULARIZATION_P2_DIFF.patch` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE20_DELIVERY_FRONTEND_MODULARIZATION_P2_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE20_DELIVERY_FRONTEND_MODULARIZATION_P2_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE22_DELIVERY_REAL_WORKFLOW_UI_P1_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE22_DELIVERY_REAL_WORKFLOW_UI_P1_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE23_DELIVERY_CUSTOMER_WORKFLOW_UI_P1_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE23_DELIVERY_CUSTOMER_WORKFLOW_UI_P1_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE24_DELIVERY_COMPACT_CUSTOMER_WORKFLOW_UI_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE24_DELIVERY_COMPACT_CUSTOMER_WORKFLOW_UI_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE25_DELIVERY_MAP_EXTERNAL_OPEN_WEBVIEW_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE25_DELIVERY_MAP_EXTERNAL_OPEN_WEBVIEW_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE26_DELIVERY_DEDUPLICATE_ACTIONS_UI_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE26_DELIVERY_DEDUPLICATE_ACTIONS_UI_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE27_DELIVERY_SPLIT_LIST_CUSTOMER_WORKFLOW_UI_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE27_DELIVERY_SPLIT_LIST_CUSTOMER_WORKFLOW_UI_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE28_DELIVERY_RETURN_TAB_ONLY_RETURNED_ITEMS_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE28_DELIVERY_RETURN_TAB_ONLY_RETURNED_ITEMS_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE29_DELIVERY_ROUTE_TRACKING_P1_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE29_DELIVERY_ROUTE_TRACKING_P1_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE32_INFORMATION_REPORTS_COMPLETION_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE32_INFORMATION_REPORTS_COMPLETION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE33_MASTER_ORDER_PRODUCT_ABC_SORT_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE33_MASTER_ORDER_PRODUCT_ABC_SORT_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE34_MASTER_ORDER_CURRENT_PICKING_GROUP_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE34_MASTER_ORDER_CURRENT_PICKING_GROUP_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE35_HEADER_BRANDING_UI_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE35_HEADER_BRANDING_UI_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE36B_API_RESPONSE_P0_OPTIMIZATION_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE36B_API_RESPONSE_P0_OPTIMIZATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE36C_API_RESPONSE_P0P1_OPTIMIZATION_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE36C_API_RESPONSE_P0P1_OPTIMIZATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE36D_API_RESPONSE_FOLLOWUP_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE36D_API_RESPONSE_FOLLOWUP_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE36D_MONGODB_INDEX_RECOMMENDATIONS.md` | `docs/reports/archive/root-artifacts/PHASE36D_MONGODB_INDEX_RECOMMENDATIONS.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE36E_DASHBOARD_SALESORDER_AGGREGATE_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE36E_DASHBOARD_SALESORDER_AGGREGATE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE36E_MONGODB_INDEX_RECOMMENDATIONS.md` | `docs/reports/archive/root-artifacts/PHASE36E_MONGODB_INDEX_RECOMMENDATIONS.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE37_DASHBOARD_OVERVIEW_REDESIGN_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE37_DASHBOARD_OVERVIEW_REDESIGN_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE37_MONGODB_INDEX_RECOMMENDATIONS.md` | `docs/reports/archive/root-artifacts/PHASE37_MONGODB_INDEX_RECOMMENDATIONS.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE38_DASHBOARD_READ_MODEL_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE38_DASHBOARD_READ_MODEL_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE38_MONGODB_INDEX_RECOMMENDATIONS.md` | `docs/reports/archive/root-artifacts/PHASE38_MONGODB_INDEX_RECOMMENDATIONS.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE39_SALES_ORDER_UPDATE_API_PERFORMANCE_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE39_SALES_ORDER_UPDATE_API_PERFORMANCE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE44_PROFILER_PERFORMANCE_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE44_PROFILER_PERFORMANCE_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE45_FLASH_RIA_UI_SKIN_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE45_FLASH_RIA_UI_SKIN_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE46_REMOVE_FLASH_UI_ROLLBACK_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE46_REMOVE_FLASH_UI_ROLLBACK_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE52_AR_RETURN_CONFIRMED_RETURNORDER_ENSURE_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE52_AR_RETURN_CONFIRMED_RETURNORDER_ENSURE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE79_AR_DEBT_RECONCILIATION_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE79_AR_DEBT_RECONCILIATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE79_AR_LEDGER_CONTRACT_AUDIT_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE79_AR_LEDGER_CONTRACT_AUDIT_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE79_CLEAN_AR_SALE_CANONICAL_POSTING_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE79_CLEAN_AR_SALE_CANONICAL_POSTING_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE79_DEBT_FLOW_EMPTY_LIST_AUDIT_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE79_DEBT_FLOW_EMPTY_LIST_AUDIT_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE79_ERROR_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE79_ERROR_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE79_INDEX_SNAPSHOT_HASH_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE79_INDEX_SNAPSHOT_HASH_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE80_AR_DEBT_RECONCILIATION_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE80_AR_DEBT_RECONCILIATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE80_AR_READ_STANDARD_AUDIT_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE80_AR_READ_STANDARD_AUDIT_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE80_FAIL_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE80_FAIL_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE80_UNIFIED_AR_LEDGER_READ_STANDARD_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE80_UNIFIED_AR_LEDGER_READ_STANDARD_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE81_AR_DEBT_REBUILD_RECONCILIATION_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE81_AR_DEBT_REBUILD_RECONCILIATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE81_AR_LEGACY_CONTRACT_NORMALIZATION_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE81_AR_LEGACY_CONTRACT_NORMALIZATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE81_AR_LEGACY_REPAIR_PLAN_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE81_AR_LEGACY_REPAIR_PLAN_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE81_DEBT_UI_READ_MODEL_DISPLAY_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE81_DEBT_UI_READ_MODEL_DISPLAY_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE81_GLOBAL_AVAILABILITY_TEST_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE81_GLOBAL_AVAILABILITY_TEST_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE81_GLOBAL_AVAILABILITY_TEST_FIX_V2_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE81_GLOBAL_AVAILABILITY_TEST_FIX_V2_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE81_GLOBAL_SOFTWARE_RULE_CONTRACT_GOVERNANCE_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE81_GLOBAL_SOFTWARE_RULE_CONTRACT_GOVERNANCE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PHASE81_STOCK_CARD_REQUEST_CONTEXT_PERFORMANCE_REPORT.md` | `docs/reports/archive/root-artifacts/PHASE81_STOCK_CARD_REQUEST_CONTEXT_PERFORMANCE_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `POSTING_ENGINE_RUNTIME_EXPORT_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/POSTING_ENGINE_RUNTIME_EXPORT_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PRODUCTION_CONFIGURATION_HARDENING_DIFF.patch` | `docs/reports/archive/root-artifacts/PRODUCTION_CONFIGURATION_HARDENING_DIFF.patch` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PRODUCTION_CONFIGURATION_HARDENING_REPORT.md` | `docs/reports/archive/root-artifacts/PRODUCTION_CONFIGURATION_HARDENING_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PRODUCTION_OPERATIONS_HARDENING_DIFF.patch` | `docs/reports/archive/root-artifacts/PRODUCTION_OPERATIONS_HARDENING_DIFF.patch` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `PRODUCTION_OPERATIONS_HARDENING_REPORT.md` | `docs/reports/archive/root-artifacts/PRODUCTION_OPERATIONS_HARDENING_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `RELEASE_MANIFEST_TEMPLATE.json` | `docs/reports/archive/root-artifacts/RELEASE_MANIFEST_TEMPLATE.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `RESTORE_DRILL_OFFLINE_RESULT.json` | `docs/reports/archive/root-artifacts/RESTORE_DRILL_OFFLINE_RESULT.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `RESTORE_DRILL_RESULT.md` | `docs/reports/archive/root-artifacts/RESTORE_DRILL_RESULT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `RETURN_AR_PIPELINE_REDESIGN_REPORT.md` | `docs/reports/archive/root-artifacts/RETURN_AR_PIPELINE_REDESIGN_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `ROLLBACK_SIMULATION_RESULT.json` | `docs/reports/archive/root-artifacts/ROLLBACK_SIMULATION_RESULT.json` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `SAFE_CLEANUP_REPORT.md` | `docs/reports/archive/root-artifacts/SAFE_CLEANUP_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `SALES_ORDER_DELETE_SCOPED_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/SALES_ORDER_DELETE_SCOPED_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `SEARCH_CLEAR_BUTTON_IMPLEMENTATION_REPORT.md` | `docs/reports/archive/root-artifacts/SEARCH_CLEAR_BUTTON_IMPLEMENTATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `SSE_INVOICE_EXPORT_IMPLEMENTATION_REPORT.md` | `docs/reports/archive/root-artifacts/SSE_INVOICE_EXPORT_IMPLEMENTATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `UI_COMPACT_DELIVERY_FIX_REPORT.md` | `docs/reports/archive/root-artifacts/UI_COMPACT_DELIVERY_FIX_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `VAT_NON_VAT_INVOICE_EXPORT_RESTORATION_REPORT.md` | `docs/reports/archive/root-artifacts/VAT_NON_VAT_INVOICE_EXPORT_RESTORATION_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `WORKER_AND_EXPORT_SCALABILITY_REPORT.md` | `docs/reports/archive/root-artifacts/WORKER_AND_EXPORT_SCALABILITY_REPORT.md` | Root report/phase/benchmark/generated artifact, tách khỏi root deploy. |
| `reports/phase81-global-software-rules-audit.json` | `docs/reports/archive/generated-reports/phase81-global-software-rules-audit.json` | Generated report trong `reports/`, giữ bằng chứng nhưng không để lẫn root/source. |
| `reports/phase81-global-software-rules-audit.md` | `docs/reports/archive/generated-reports/phase81-global-software-rules-audit.md` | Generated report trong `reports/`, giữ bằng chứng nhưng không để lẫn root/source. |

## 4. Kept Files With Risk

| File | Lý do giữ | Cần xử lý sau |
|---|---|---|
| `src/**, services/**, routes/controllers/models/engines/**` | Core runtime scope explicitly protected; no deletion attempted. | Deleting without route/runtime proof can break production. |
| `scripts/audit-*, rebuild-*, reconcile-*, repair-*, plan-*` | Production safety/migration/reconcile scripts explicitly protected. | Some may be legacy; needs separate script-level audit before archive. |
| `test/*static*, *ledger*, *inventory*, *fund*, *render*` | Static guard suite protects SSoT/contracts/startup. | Do not remove unless replacement guard exists. |
| `CSP_XSS_SINK_INVENTORY.json` | Referenced by package.json check:csp-xss and scripts/security/audit-frontend-sinks.js. | Archiving would break npm quality. |
| `RELEASE_MANIFEST.json` | Referenced by src/operations/releaseMetadata.js and scripts/generate-release-manifest.js. | Runtime release metadata/check would fail. |
| `Root loose JS test files` | Not part of npm test, but kept to avoid path/syntax scope changes during safe cleanup. | Future cleanup can migrate/delete after explicit validation. |
| P3 legacy AR compatibility markers | Static audit còn 5 P3 legacy compatibility nhưng exit 0, không phải P0/P1/P2. | Tách riêng phase sau nếu muốn sạch tuyệt đối AR legacy. |

## 5. Scripts Review

| Script/nhóm | Kết luận |
|---|---|
| `scripts/audit-*` | Giữ nguyên, thuộc production safety guard. |
| `scripts/rebuild-*`, `scripts/reconcile-*` | Giữ nguyên, thuộc rebuild/reconcile DB safety. |
| `scripts/repair-*`, `scripts/plan-*`, `scripts/apply-*`, `scripts/migrate-*` | Giữ nguyên, cần audit riêng trước khi archive/xoá. |
| `scripts/check-path-portability.js` | Cập nhật scanner để bỏ qua comment, giúp `check:path-portability` PASS mà không phải xoá static marker. |

## 6. Tests Review

| Test/nhóm | Kết luận |
|---|---|
| `npm test` | PASS — 1.312 tests, 1.311 pass, 1 skipped, 0 fail. |
| AR ledger/debt targeted tests | PASS toàn bộ targeted command được yêu cầu. |
| Static guard inventory/fund/frontend calculation | PASS, issue count 0. |
| Global/AR access audit | PASS exit code 0; còn 5 P3 legacy compatibility để theo dõi. |
| Root loose JS tests | Giữ lại, chưa xoá vì không cần thiết trong safe cleanup vòng này. |

## 7. Source Impact

- Có sửa source runtime không? **Không sửa business logic/runtime `src/**`**.
- Có đổi API contract không? **Không**.
- Có đổi DB schema không? **Không**.
- Có đổi file tooling không? **Có**: `scripts/check-path-portability.js`.
- Có đổi release metadata không? **Có**: `RELEASE_MANIFEST.json` đã refresh.

## 8. Command Results

| Command | Kết quả | Ghi chú |
|---|---|---|
| `node scripts/audit-ar-access-violations.js --strict` | PASS | - Issue count: 5; - P0: 0; - P1: 0; - P2: 0; - P3 legacy compatibility: 5 |
| `node scripts/audit-frontend-business-calculation.js --strict` | PASS | - Issue count: 0; - P0: 0; - P1: 0; - P2: 0; - P3 legacy compatibility: 0 |
| `node scripts/audit-fund-access-violations.js --strict` | PASS | - Issue count: 0; - P0: 0; - P1: 0; - P2: 0; - P3 legacy compatibility: 0 |
| `node scripts/audit-global-software-rules.js --strict` | PASS | - Issue count: 5; - P0: 0; - P1: 0; - P2: 0; - P3 legacy compatibility: 5 |
| `node scripts/audit-inventory-access-violations.js --strict` | PASS | - Issue count: 0; - P0: 0; - P1: 0; - P2: 0; - P3 legacy compatibility: 0 |
| `npm run check:path-portability` | PASS | PATH_PORTABILITY_OK 1565 paths, 1125 JavaScript files |
| `npm run check:release-manifest` | PASS | RELEASE_MANIFEST_OK 2026-06-30-01 |
| `npm run check:source-bundles` | PASS | [source-bundles] OK 19 bundles |
| `npm run check:syntax` | PASS | SYNTAX_OK 1125 JavaScript files |
| `npm run docs:check` | PASS | OpenAPI document is up to date. Scanned operations: 343. |
| `npm test` | PASS | # tests 1312; # pass 1311; # fail 0; # skipped 1 |
| `node --test test/ar-debt-api-standard.test.js` | PASS | # tests 2; # pass 2; # fail 0; # skipped 0 |
| `node --test test/ar-sale-reaccounting-contract.test.js` | PASS | # tests 4; # pass 4; # fail 0; # skipped 0 |
| `node --test test/debt-screen-direct-ar-ledger-source.test.js` | PASS | # tests 3; # pass 3; # fail 0; # skipped 0 |
| `node --test test/no-legacy-ar-debt-read.test.js` | PASS | # tests 3; # pass 3; # fail 0; # skipped 0 |
| `node --test test/render-startup-port-binding.test.js` | PASS | # tests 1; # pass 1; # fail 0; # skipped 0 |

## 9. Remaining Cleanup Backlog

1. Audit riêng các script repair/apply DB production cũ để phân loại `KEEP/ARCHIVE` theo từng script, không làm trong vòng cleanup an toàn này.
2. Xử lý 5 P3 legacy compatibility trong AR audit nếu muốn sạch tuyệt đối khỏi legacy debt calculation markers.
3. Đưa các root operational docs/runbook sang `docs/runbooks/` trong một phase riêng, kèm update static tests đang đọc path root.
4. Kiểm tra root loose JS tests (`test-delivery-6-metrics-static.js`, `test-return-draft-flow.js`, `test_dms_invoice_typography_layout.js`, `test_print_promotion_fallback.js`) trước khi xoá/hợp nhất.

## 10. Final Decision

**GO**

Lý do: cleanup không đụng business logic, không xoá source/runtime/safety script, toàn bộ command bắt buộc PASS, `npm test` PASS, static audit không có P0/P1/P2.

## Deleted

- `reports/phase81-npm-test.log`

## Archived

- `145` file vào `docs/reports/archive/`.

## Kept

- Core runtime source, safety scripts, static guards, docs được test đọc trực tiếp, release/CSP manifest runtime.

## Risks

- Còn 5 P3 legacy compatibility trong global/AR audit, nhưng audit strict exit 0.
- Root loose JS tests chưa xử lý để tránh sửa lan.

## Commands

- Xem chi tiết tại `docs/reports/archive/phase84-command-results/`.

## Next Cleanup Backlog

- Tách phase riêng cho script DB repair legacy và root operational docs.
