# PHASE259B Filter/KPI Scope Migration Report

## Migrated P1 Surfaces

Debt Collections:

- Backend now normalizes `q/search/status/collectorType/fromDate/toDate/page/limit`.
- Rows use `skip/limit`; summary and count use the same full filter via aggregate/count.
- Frontend sends `q` to backend and no longer post-filters the main table.

AR Ledger:

- Source fragment `reportLegacy.service.source/part-03.jsfrag` now aggregates full totals using the same `match` used for rows.
- `summary.arLedgerCount/totalDebit/totalCredit/totalDebt` no longer depend on page.

Return Orders:

- Source fragment `returnOrderLegacy.service.source/part-01b.jsfrag` now applies business-date, positive-value and dedupe semantics before count/summary/page rows.
- Controller exposes `summary`, `pagination` and `scope` while preserving `returnOrders` array compatibility.
- Frontend uses backend summary for count/total.

External Debt Orders:

- Backend now normalizes query scope and computes full summary/count through aggregate/count.
- Summary no longer comes from limited rows.

Debt New:

- Bounded ledger read is now explicit in summary/diagnostics.
- UI warns when `truncatedWorkingSet` is true.
- No writer or AR SSoT change.

DMS Inventory:

- `search` now scopes KPI base summary.
- `type` remains explicit facet/list dimension.

Fund Ledger:

- Transaction total in/out now reads `filteredRowsTotalIn/Out`.
- Ending cash/bank labels now state toàn quỹ/global scope.
- Backend exposes mixed scope metadata.

## Intentionally Untouched

No AR/Fund/Inventory/Delivery writers were changed. No MongoDB schema changed. No package dependency changed.
