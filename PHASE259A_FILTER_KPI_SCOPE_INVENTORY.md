# PHASE259A Filter / KPI Scope Inventory

| Screen | Endpoint | List Scope | KPI Scope | Pagination-safe | Export Same Scope | Scope Type | Severity |
|---|---|---|---|---|---|---|---|
| Thu nợ chờ kế toán xác nhận | `GET /api/debt-collections` | `q/status/collectorType/fromDate/toDate` | same backend aggregate filter | PASS after fix | N/A in this screen | EXACT_SCOPE | P1 fixed |
| Sổ công nợ AR | report route `debtArLedger` | canonical AR ledger match + `q/date/staff` | same aggregate match | PASS after fix | P2 review | EXACT_SCOPE | P1 fixed |
| Đơn trả hàng | `GET /api/return-orders` | canonical return filter + business-date/positive-value before page | same aggregation pipeline before page | PASS after fix | P2 review | EXACT_SCOPE | P1 fixed |
| Công nợ ngoài luồng | `GET /api/external-debt-orders` | `q/status/customer/staff/date` | same backend aggregate filter | PASS after fix | N/A in this screen | EXACT_SCOPE | P1 fixed |
| Công nợ New | `GET /api/new/debt/customers` | AR debt read model query with bounded ledger read | same bounded working set, explicit metadata | P2 bounded; not silent | N/A | EXACT_SCOPE + bounded result metadata | P1 potential mitigated |
| DMS Inventory reconciliation | `GET /api/dms-inventory/latest` | `search + type` for rows | `search` base scope, `type` facet dimension | PASS; page only rows | P2 review | FACET_SCOPE | P1 fixed |
| Fund Ledger | `GET /api/funds/ledger` | transaction filters `q/direction/sourceType/date/fundType` | transaction totals exact; cash/bank ending balances global explicit | PASS; backend rows are paginated separately | P2 review | MIXED: EXACT_SCOPE + GLOBAL_EXPLICIT_SCOPE | P1 fixed |
| Đơn giao hôm nay New | `GET /api/new/delivery-today/orders` | backend canonical query filters | selected NVBH/order interaction scope | PASS by design | N/A | SELECTION_SCOPE | PASS |
| Fund Summary Book | `GET /api/funds/summary` | normalized filters via `$facet` | same base pipeline totals | PASS existing reference | PASS existing export path | EXACT_SCOPE | PASS |

## Audit Candidates Remaining

`scripts/audit-filter-kpi-scope.js --json` scanned active runtime source and produced 15 candidates:

- 14 `P1_REVIEW_REQUIRED` outside the migrated Wave 1/reference scope.
- 1 `P2_REVIEW_ALLOWED_SCOPE` for Debt New bounded metadata.

These are recorded in `PHASE259A_FILTER_KPI_SCOPE_EVIDENCE.json` and intentionally left for Phase259C/Wave 3 review instead of broad blind refactor.
