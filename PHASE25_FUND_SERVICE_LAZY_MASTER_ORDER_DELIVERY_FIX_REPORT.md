# Phase 25 — Fix circular dependency in delivery cash submission

## Changed files

- `src/services/fundService.js`
- `test/fund-service-master-order-delivery-lazy-dependency-static.test.js`

## Root cause

`fundService.js` imported the aggregate `masterOrderService` facade at module load time. The dependency chain returned to `fundService`, so CommonJS exposed a partially initialized facade and `listDeliveryToday` was undefined at runtime.

## Fix

- Removed top-level `require('./masterOrderService')`.
- Added lazy resolver for `./master-order/masterOrderDelivery.service`.
- `buildDeliverySubmissionDraft()` now invokes `listDeliveryToday()` through the delivery-only module.
- Added static regression tests to prevent importing the aggregate facade again.

## Verification

- Syntax checks passed.
- Targeted regression: 17 tests passed, 0 failed.
