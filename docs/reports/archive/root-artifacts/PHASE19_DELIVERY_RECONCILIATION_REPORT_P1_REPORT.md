# PHASE 19 — P1 Delivery End-of-Day Reconciliation Report

## Baseline

- Input ZIP: `MK-pro-phase18-delivery-dual-api-contract-p1p2-patched(1).zip`
- Scope: delivery reconciliation report for NVGH/accounting.
- Business rules changed: **No**. This patch is read-only for AR/Fund/Inventory/Return data.

## 1. Tổng quan triển khai

Implemented a production-safe end-of-day reconciliation report for the delivery app and accounting review.

Canonical API:

```http
GET /api/delivery/reconciliation?date=YYYY-MM-DD&deliveryStaffCode=...
```

Compatibility mobile API:

```http
GET /api/mobile/delivery/reconciliation?date=YYYY-MM-DD
```

For `role=delivery`, backend does not trust `deliveryStaffCode` from client. It binds the logged-in mobile user staff code and sets `enforceDeliveryOwnership=true`.

## 2. Nguồn dữ liệu chuẩn

The report reads from canonical sources only:

| Area | Source |
|---|---|
| Delivery orders | `salesOrders` / `master_orders` through `DeliveryEngine` |
| Returns | `returnOrders` |
| Customer AR balance | `arLedgers` |
| Debt collection submissions | `debtCollections` |
| Confirmed fund entries | `fundLedgers` |

No write/post is performed by the report service.

## 3. API response shape

`/api/delivery/reconciliation` now returns:

```json
{
  "success": true,
  "data": {
    "date": "2026-06-21",
    "deliveryStaffCode": "GH01",
    "summary": {
      "assignedOrders": 0,
      "deliveredOrders": 0,
      "pendingOrders": 0,
      "grossAmount": 0,
      "returnAmount": 0,
      "rewardAmount": 0,
      "mustCollect": 0,
      "collectedCash": 0,
      "collectedTransfer": 0,
      "remainingDebt": 0,
      "pendingDebtCollections": 0,
      "pendingDebtCollectionAmount": 0,
      "difference": 0,
      "hasMismatch": false
    },
    "orders": [],
    "returns": [],
    "collections": [],
    "fundLedgers": []
  }
}
```

Legacy compatibility keys are kept:

- `summary`
- `reconciliation`
- `orders`
- `returns`
- `collections`
- `fundLedgers`

## 4. UI app giao hàng

Added a small lazy-loaded tab:

```text
Đối soát
```

The tab shows:

- Đơn đã giao
- Đơn chưa giao
- Phải thu sau trả
- Tiền mặt
- Chuyển khoản
- Còn thiếu
- Hàng trả
- Phiếu thu nợ chờ kế toán
- Chênh lệch
- Top orders needing attention
- Debt collection submissions sent during the day

The tab is lazy-loaded and cached for a short TTL, so opening the app still loads only the default `Đơn giao` tab.

## 5. Files changed

Modified:

- `config/source-bundles.json`
- `config/source-size-budget.json`
- `docs/openapi.json`
- `public/js/delivery/delivery-core.js`
- `public/mobile/js/delivery-mobile-view.source.js`
- `public/mobile/js/delivery-mobile-view.js`
- `public/mobile/js/delivery-mobile-view.js.map`
- `public/mobile/mobile.source/mobile-03.css`
- `src/controllers/mobile/delivery.controller.js`
- `src/routes/deliveryRoutes.js`
- `src/routes/mobile/delivery.routes.js`
- `src/services/mobile/delivery.service.js`

Added:

- `src/services/deliveryReconciliation.service.js`
- `test/delivery-reconciliation-report-p1-static.test.js`
- `test/delivery-reconciliation-report-p1-summary.test.js`
- `PHASE19_DELIVERY_RECONCILIATION_REPORT_P1_REPORT.md`

Deleted:

- None

## 6. Test results

Passed:

```bash
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
npm run docs:check
node --test test/delivery-reconciliation-report-p1-static.test.js test/delivery-reconciliation-report-p1-summary.test.js
```

Results:

```text
[source-bundles] OK 19 bundles
[source-size-budget] OK
SYNTAX_OK 946 JavaScript files
OpenAPI document is up to date. Scanned operations: 316.
# tests 6
# pass 6
# fail 0
```

Full test:

```bash
npm test
```

Actual result:

```text
# tests 1023
# pass 1020
# fail 2
# skipped 1
```

The two remaining failures are pre-existing legacy characterization snapshot failures:

- `test/phase79-production-strangler.test.js: assembled index page matches the approved Phase80 characterization snapshot`
- `test/phase79-production-strangler.test.js: split CSS parts preserve exact legacy cascade order`

They are unrelated to the new delivery reconciliation API/report. They were not updated to avoid widening scope.

## 7. Risk notes

- Report is read-only and should not affect AR/Fund/Inventory postings.
- `remainingDebt` prefers `arLedgers` when ledger rows exist for an order. If no AR ledger is available for an unposted/current delivery order, it falls back to the canonical delivery order amount from `DeliveryEngine` so NVGH can still see practical same-day remaining debt.
- Admin/manager/accountant can still pass `deliveryStaffCode` to view a staff report. `delivery` role is server-scoped to the logged-in NVGH.
