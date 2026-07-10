# PHASE235 - Delivery Today & Debt Read Hot-Path Performance Report

## A. Executive summary

Phase235 optimized two read-only hot paths without changing writers, schema, indexes, SSoT, posting, fund, inventory, return stock, import/export, mobile, frontend lazy loading, or package metadata.

- `GET /api/new/delivery-today/orders`: kept `orders/salesOrders` as primary SSoT, kept `masterOrders` metadata-only, added hot-path projections, and changed independent related reads to bounded parallel batch reads.
- `GET /api/new/debt/customers`: kept `arLedgers` as debt SSoT, added real `ArLedger.find().limit(...)` propagation, hot-path projections, and parallelized independent allocation/pending collection joins.
- No Mongo index was created, dropped, or modified.
- No generated source bundle was edited or rebuilt; `npm run check:source-bundles` passed.

## B. Scope and non-goals

In scope:

- Delivery Today New list read path.
- Debt New customer list read path.
- Shared AR ledger reader projection option.
- Semantic query-count/performance fixtures.

Out of scope and not changed:

- Closeout/correction writers.
- Debt collection submit/confirm/reject writers.
- Accounting posting, fund ledger, inventory posting, return stock lifecycle.
- Frontend lazy loading, Report Center, Import/Export, Promotion, Mobile runtime flows.
- Mongo schema, migration, or index creation/drop.

## C. Pre-edit audit findings

| Endpoint | Route | Service | Baseline query count | Main issue |
|---|---|---|---:|---|
| `GET /api/new/delivery-today/orders` | `src/routes/newOperationsRoutes.js` | `src/services/v2/deliveryTodayNew.service.js` + `src/services/delivery/deliveryTodayCanonicalOrderReader.js` | 5 fixed queries | No N+1, but related reads were sequential and hot-path queries lacked explicit projections |
| `GET /api/new/debt/customers` | `src/routes/newOperationsRoutes.js` | `src/services/v2/debtNew.service.js` + `src/services/arLedgerRead.service.js` | 3 fixed queries | `limit` was computed in service but not applied to `ArLedger.find()` because `arLedgerReadService.queryRows()` only used `options.limit` |

## D. Endpoint routing map

| API | Route mount | Frontend caller | Read service | Collections read |
|---|---|---|---|---|
| `/api/new/delivery-today/orders` | `/api/new` via `src/routes/index.js` | `public/js/app/new/91-delivery-today-new.js` | `DeliveryTodayNewService.listOrders` | `salesOrders`, `masterOrders`, `returnOrders`, `deliveryCloseoutVersions`, `orderPaymentAllocations` |
| `/api/new/debt/customers` | `/api/new` via `src/routes/index.js` | `public/js/app/new/92-debt-new.js` | `DebtNewService.listCustomers` | `arLedgers`, `orderPaymentAllocations`, `debtCollections` |

## E. Baseline benchmark

Semantic fixture benchmark before edits:

| Endpoint | Fixture | Query count | Rows pulled from primary query | Notes |
|---|---:|---:|---:|---|
| Delivery Today | 50 orders | 5 | 50 | Batch joins, no N+1 |
| Delivery Today | 500 orders | 5 | 500 | Batch joins, no N+1 |
| Delivery Today | 2000 orders with NVGH filter | 5 | 2000 | `dbLimit` bounded at 2000, final returned rows capped at 500 |
| Debt New | 1000 ledgers | 3 | 1000 | `ArLedger` limit not applied |
| Debt New | 10000 ledgers | 3 | 10000 | `ArLedger` limit not applied |

## F. Delivery Today changes

Files:

- `src/services/delivery/deliveryTodayCanonicalOrderReader.js`
- `src/services/v2/deliveryTodayNew.service.js`

Changes:

- Added `SalesOrder` hot-path projection.
- Added `MasterOrder` metadata-only projection.
- Added projections for `returnOrders`, `deliveryCloseoutVersions`, and `orderPaymentAllocations`.
- Changed independent related reads to one `Promise.all` after canonical orders are selected:
  - `returnOrders`
  - `deliveryCloseoutVersions`
  - `orderPaymentAllocations`
- Added diagnostics:
  - `performance.queryCount`
  - `fixedQueryCount`
  - `nPlusOneGuard`
  - `parallelBatchReads`
  - projection names

## G. Delivery Today after benchmark

Semantic fixture benchmark after edits:

| Fixture | Query count | Returned rows | Projection calls | Result |
|---:|---:|---:|---|---|
| 50 orders | 5 | 50 | 5/5 model reads | PASS |
| 500 orders | 5 | 500 | 5/5 model reads | PASS |
| 2000 orders with NVGH filter | 5 | 500 | 5/5 model reads | PASS |

## H. Debt New changes

Files:

- `src/services/arLedgerRead.service.js`
- `src/services/v2/debtNew.service.js`

Changes:

- Added optional `options.projection` support to AR ledger read helper.
- Passed computed bounded `limit` into `arLedgerReadService.getActiveDebtReadModelLedgers()` through options, so `ArLedger.find().limit(...)` is actually applied.
- Added AR ledger hot-path projection with fields required by canonical validator/grouping.
- Added projections for `orderPaymentAllocations` and pending `debtCollections`.
- Changed independent allocation and pending collection reads to one `Promise.all` after ledger grouping.
- Added diagnostics:
  - `performance.queryCount`
  - `boundedLedgerRead`
  - `ledgerLimit`
  - `ledgerRowsRead`
  - `nPlusOneGuard`
  - `parallelBatchReads`
  - projection names

## I. Debt New after benchmark

Semantic fixture benchmark after edits:

| Fixture | Query count | `ArLedger` limit | Rows pulled from `ArLedger` | Projection calls | Result |
|---:|---:|---:|---:|---|---|
| 1000 ledgers | 3 | 500 | 500 | 3/3 model reads | PASS |
| 10000 ledgers | 3 | 500 | 500 | 3/3 model reads | PASS |

## J. Mongo index audit

Checked managed registry in `src/services/mongoIndexService.js`.

Relevant managed indexes already exist:

- `salesOrders`: delivery date/staff/status indexes and closeout scope index.
- `masterOrders`: child order and delivery metadata indexes.
- `returnOrders`: sales/order/date/staff/status indexes.
- `orderPaymentAllocations`: order/source lookup indexes and delivery/customer status indexes.
- `arLedgers`: canonical source lookup, customer/category/status, source/category/active, order/status indexes.
- `debtCollections`: allocation order/status and customer/status indexes.

No index was created or dropped in this phase.

## K. Source contract / SSoT

| Module | SSoT expectation | Result |
|---|---|---|
| Delivery Today New | `orders/salesOrders` primary; `masterOrders` metadata-only; `returnOrders` canonical returns; `deliveryCloseoutVersions` latest correction; `orderPaymentAllocations` current allocation | PASS |
| Debt New | `arLedgers` primary debt SSoT; `debtCollections` pending workflow only; allocations related state only | PASS |

## L. Runtime Mongo / explain status

`MONGO_URI` is present in the environment, but no live Mongo explain was executed in this phase to avoid touching a possibly production database without an explicit target, read-only window, and sampling criteria.

Runtime evidence still recommended:

- `explain("executionStats")` for Delivery Today filters by date, NVGH, NVBH, and q.
- `explain("executionStats")` for Debt New filters by customerCode, sourceCode, salesStaffCode, deliveryStaffCode, and q.
- Production access logs for common filter shapes and result sizes.

Status: `NEED_RUNTIME_EVIDENCE` for production p95/p99 claims; semantic fixed-query and bounded-read fixtures pass locally.

## M. Golden fixtures and tests added

Added:

- `test/phase235-delivery-debt-read-hotpath-performance.test.js`

Covered:

- Delivery Today fixed 5-query read plan and projections on fixture with 600 orders.
- Debt New real `ArLedger` limit, fixed 3-query read plan, and projections on fixture with 2000 ledgers.

## N. Validation run

Commands executed:

- `node --test test/delivery-today-canonical-source-reader.test.js test/delivery-source-contract.test.js test/delivery-today-date-filter-canonical.test.js test/phase91-new-services-contract.test.js` - PASS, 43 tests.
- `node --test test/debt-source-contract.test.js test/phase91-new-services-contract.test.js test/phase226-debt-collection-ar-receipt-read-model.test.js test/mobile-sales-debt-uses-debtnew-service-static.test.js test/mobile-debt-canonical-correction-identity.test.js` - PASS, 50 tests.
- `node --test test/phase235-delivery-debt-read-hotpath-performance.test.js` - PASS, 2 tests.
- `npm run check:syntax` - PASS.
- `npm run check:source-size` - PASS.
- `npm run check:source-bundles` - PASS.
- `npm test` - PASS.
- `git diff --check` - PASS.

## O. Risk and rollback notes

Main risk:

- Debt New now applies the existing service-level ledger limit to the actual `ArLedger` query. This prevents oversized reads, but production should verify large single-customer histories and broad staff filters with explain/log evidence.

Mitigations:

- SSoT unchanged.
- Writers untouched.
- No schema/index change.
- Tests cover source contract, mobile debt dependency, closeout/debt read contracts, and Phase235 fixed-query fixtures.

Rollback:

- Revert only the five changed read/test files if production evidence shows a filter shape needs a different bounded aggregation strategy.

## P. Next phase recommendations

1. Run staging `explain("executionStats")` on the common Delivery Today and Debt New filter matrix.
2. Capture p95/p99 response time and documents examined from access/APM logs.
3. If Debt New needs full exact customer balance beyond a ledger cap, replace list read with a Mongo aggregation that groups by order/customer in DB and returns bounded customer/order pages from `arLedgers`.
4. Consider a dedicated read-model projection or materialized balance only after SSoT and rebuild policy are explicitly approved.
5. Keep current tests as regression gates before any further query/index change.
