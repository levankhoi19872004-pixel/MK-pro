# Phase211 - Delivery Today New Closeout API/Index Performance Fix

## Scope

Screen: `Đơn giao hôm nay (New)`
Action: `Chốt sổ giao hàng`
API: `POST /api/new/delivery-today/closeout`

## Root cause

The closeout request became slow mainly because the selected-order lookup mixed stable `SO...` ids with display order codes (`B...`) from `selectedOrderCodes`. That pushed `orderRepository.findManyByIdentity()` into a wide `$or` query across many optional identity fields instead of using the indexed `salesOrders.id` path.

The second bottleneck is the closeout pipeline itself: for each order it posts `orderPaymentAllocations`, `arLedgers`, `fundLedgers`, debt reconcile rows and audit logs inside one transaction. For 13 selected orders this can create a large number of DB operations, so the first query and indexes must stay fast.

## Changes

- `src/routes/newOperationsRoutes.js`
  - Uses stable `orderIds/selectedOrderIds` first.
  - Uses `selectedOrderCodes/orderCodes` only as backward-compatible fallback.
  - Returns `performance` diagnostics from closeout result.

- `src/services/accounting/AccountingCloseoutService.js`
  - `normalizeOrderIds()` now avoids mixing `selectedOrderCodes` into the order loading identity set when stable ids exist.
  - Adds closeout performance stages: `loadOrders`, `validateSelectedOrderScope`, `loadReturnOrders`, `validateReturnOrdersInventory`, `transactionAndPosting`.

- `src/repositories/orderRepository.js`
  - Optimizes mixed identity lookup: stable `SO...` ids are loaded through indexed `{ id: { $in } }`, fallback keys are queried separately and de-duplicated.

- `src/services/mongoIndexService.js`
  - Adds closeout-relevant indexes for sales order aliases, closeout scope, return order fallback lookup and allocation source lookup.

- `test/closeout-api-performance-static.test.js`
  - Static regression coverage for stable-id lookup, closeout indexes and performance diagnostics.

## Expected effect

For the screenshot case with 13 selected orders, order loading should use stable `SO...` ids and avoid a large `$or` over display codes. The closeout response now includes a performance object so future slow requests can identify whether the delay is in order lookup, returnOrders lookup or transaction posting.

## Remaining cost

The accounting-safe posting path is still intentionally heavier than a normal update because it writes AR/fund/accounting/audit records. Further optimization should batch AR idempotency checks and audit writes, but that is a larger production-grade refactor.
