# PHASE259A Global Filter/KPI Scope Audit Report

## Root Cause

MK-Pro had no global governance contract tying active filter/search/list/KPI/summary/export scopes together. Several screens let pagination or frontend-only filters affect rows while KPI/summary used a different scope.

Confirmed production pattern:

- Debt Collections frontend filtered `q` locally but backend summary did not receive `q`.
- Debt Collections, AR Ledger and External Debt computed full-looking summary from limited rows.
- Return Orders applied business-date/positive-value/dedupe after pagination and frontend displayed page total as full total.
- DMS Inventory summary ignored `search` while list used `search + type`.

## Scope Decisions

- Debt Collections: `EXACT_SCOPE`.
- AR Ledger: `EXACT_SCOPE`.
- Return Orders: `EXACT_SCOPE`.
- External Debt Orders: `EXACT_SCOPE`.
- Debt New: `EXACT_SCOPE` with explicit bounded-result metadata; no silent full-looking KPI.
- DMS Inventory: `FACET_SCOPE`, `type` is facet dimension, `search` is base filter.
- Fund Ledger: mixed scope; transaction totals are `EXACT_SCOPE`, cash/bank ending balances are `GLOBAL_EXPLICIT_SCOPE`.
- Delivery Today New: `SELECTION_SCOPE` for selected NVBH/order interactions.

## Production-Grade Option A

Use domain-specific canonical scope builders and shared governance:

- normalize query scope per domain;
- build exact Mongo filter/pipeline per domain;
- compute rows and summary with the same canonical semantics;
- keep page/limit only in row facet;
- expose scope/truncation metadata where semantics are not exact full scope.

This is the path applied for Debt Collections, AR Ledger, Return Orders, External Debt, DMS and Fund Ledger.

## Lower-Effort Option B

Keep existing list APIs and adjust frontend labels/fallbacks only. This would reduce user confusion but would not prevent recurrence or pagination-driven KPI drift. Not chosen for P1 financial screens.

## Unresolved Risks

- Audit still reports 14 P1 review candidates outside Wave 1, including delivery legacy engine, information reports, mobile catalog and VAT export scope drift.
- Debt New remains bounded by design; full-scope KPI would require a dedicated AR aggregation/read model, not a blind limit removal.
- Export parity was not migrated globally in this pass except through governance/reporting evidence.

## Files Created

- `docs/contracts/filter-kpi-scope-governance.md`
- `scripts/audit-filter-kpi-scope.js`
- `scripts/lib/filterKpiScopeAuditCore.js`
- `PHASE259A_FILTER_KPI_SCOPE_INVENTORY.md`
- `PHASE259A_FILTER_KPI_SCOPE_EVIDENCE.json`

## Tests

- `node --test test/phase259-filter-kpi-scope-governance.test.js` PASS
- `npm run check:syntax` PASS
- `npm run check:source-bundles` PASS
- `npm run check:source-size` PASS
- `npm run docs:check` PASS
- `npm test` FAIL with unrelated/baseline failures after targeted Phase259 regressions were fixed; see `PHASE259_FILTER_KPI_SCOPE_TEST_EVIDENCE.json`.
