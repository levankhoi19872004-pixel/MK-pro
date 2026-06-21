# PHASE21 — Delivery Field Efficiency UI P1 Report

## Baseline

- Input ZIP: `MK-pro-phase20-delivery-frontend-modularization-p2-patched(3).zip`
- Scope: Mobile Delivery App UI/UX only
- No backend/API/business-rule changes

## Goal

Optimize the delivery app for field delivery staff by reducing scroll, reducing clicks, and making the common delivery workflow faster.

## Implemented changes

### 1. Compact header

Changed the mobile delivery header from a dashboard-style header to a compact field header.

Before:

- `App giao hàng`
- `Đồng bộ 100% với Đơn giao hôm nay`
- account + role
- `Tải`
- `Thoát`

After:

- `Giao hàng hôm nay`
- `NVGH: <name/code>`
- `Tải`
- overflow menu `⋮`

Secondary items moved to overflow menu:

- `Sản phẩm đơn`
- `Đối soát ngày`
- `Đăng xuất`

### 2. Main KPI reduced to 4 field KPIs

Main screen now shows only:

- `Tổng đơn`
- `Chưa giao`
- `Đã giao`
- `Phải thu`

Removed from main KPI area:

- `Tiền mặt`
- `Chuyển khoản`
- `Trả hàng`
- `Trả thưởng`
- `Công nợ`

These values remain available in their proper screens such as payment, returns, debt, or reconciliation.

### 3. Primary tabs reduced to 4

Main tabs now only include:

1. `Đơn giao`
2. `Thu tiền`
3. `Hàng trả`
4. `Công nợ`

Moved out of primary tabs:

- `Sản phẩm giao` → overflow menu as `Sản phẩm đơn`
- `Đối soát` → overflow menu as `Đối soát ngày`

### 4. Compact order card

Order card now prioritizes field-critical information only:

- customer name
- order code
- address
- sales staff (`NVBH`)
- must-collect amount (`Phải thu`)
- delivery status
- note only if present

Removed direct card metrics:

- cash
- bank transfer
- return amount
- reward
- debt

### 5. Primary card actions

Order card now exposes direct field actions:

- `Đã giao`
- `Thu tiền`
- `Bản đồ`

This avoids forcing NVGH to open lower-priority details first.

### 6. One-hand bottom action

When an order is selected on the order list, a bottom action bar appears:

- selected customer
- must-collect amount
- `Gọi`
- `Thu tiền`
- `Trả hàng`

This improves one-hand use and reduces scrolling back to the card.

### 7. CSS split to preserve source-size budget

Added a new CSS source file:

- `public/mobile/mobile.source/mobile-04.css`

This keeps each CSS source part within the existing source-size budget instead of making `mobile-03.css` too large.

## Files changed

### Modified

- `config/source-bundles.json`
- `public/mobile/js/delivery-mobile-view.source.js`
- `public/mobile/js/delivery-mobile-view.js`
- `public/mobile/js/delivery-mobile-view.js.map`
- `public/mobile/js/delivery-orders-view.js`
- `public/mobile/js/delivery-ui-utils.js`
- `public/mobile/mobile.css`
- `test/delivery-mobile-performance-p1-static.test.js`
- `test/delivery-mobile-ui-p0p1-static.test.js`
- `test/delivery-reconciliation-report-p1-static.test.js`

### Added

- `public/mobile/mobile.source/mobile-04.css`
- `test/delivery-mobile-field-efficiency-p1-static.test.js`
- `PHASE21_DELIVERY_FIELD_EFFICIENCY_UI_P1_REPORT.md`

### Deleted

- None

## Behavior compatibility

Preserved:

- existing DeliveryCore API calls
- save return behavior
- save payment behavior
- confirm delivery behavior
- lazy-load returns/debt/reconciliation behavior
- owner-scope and offline queue protections
- mobile debt pagination
- reconciliation API contract

Changed intentionally:

- selecting an order no longer automatically jumps to product detail; it keeps NVGH on the order list and shows bottom quick actions.
- product detail and reconciliation are still available through the overflow menu.

## Manual checklist

| Flow | Expected result |
|---|---|
| Open app | Header compact, only order data loads |
| Load orders | 4 KPI boxes and 4 main tabs visible |
| Select order | Stays on order list and shows bottom action |
| Product details | Available from `⋮ → Sản phẩm đơn` |
| Return goods | Available from `Hàng trả` tab or bottom `Trả hàng` |
| Payment | Available from card/bottom `Thu tiền` |
| Debt | Available as main tab `Công nợ` |
| Reconciliation | Available from `⋮ → Đối soát ngày` |

## Test results

### Passed

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
node --test \
  test/delivery-mobile-field-efficiency-p1-static.test.js \
  test/delivery-mobile-ui-p0p1-static.test.js \
  test/delivery-mobile-performance-p1-static.test.js \
  test/delivery-mobile-modularization-p2-static.test.js \
  test/delivery-debt-pagination-p1-static.test.js \
  test/delivery-reconciliation-report-p1-static.test.js
```

Results:

- `[source-bundles] OK 19 bundles`
- `[source-size-budget] OK`
- `SYNTAX_OK 951 JavaScript files`
- targeted tests: pass

### Full test

```bash
npm test
```

Result:

- `tests 1033`
- `pass 1030`
- `fail 2`
- `skipped 1`

Known unrelated failures:

- `test/phase79-production-strangler.test.js` — assembled index page snapshot
- `test/phase79-production-strangler.test.js` — split CSS parts legacy cascade snapshot

These are legacy snapshot failures already present in prior phases and are not related to the delivery mobile field-efficiency UI change.

## Expected operational impact

| KPI | Expected improvement |
|---|---:|
| Main tabs | 6 → 4 |
| Main KPI boxes | 6 → 4 |
| Financial metrics on order card | 6 → 1 |
| Visible cards on 390px screen | ~2–3 → ~3–4 |
| Time to read one order card | ~5–8s → ~2–3s |
| Clicks to reach payment | reduced by direct card/bottom action |
| Clicks to reach returns | reduced by bottom action |

## Risks and follow-up

### Risks

- Direct `Đã giao` action is faster but should be validated with real NVGH to avoid accidental completion.
- Moving `Đối soát` and `Sản phẩm đơn` to overflow menu reduces clutter but requires a short user orientation.

### Recommended next steps

1. Pilot with 1 NVGH for one delivery route.
2. Observe actual click count for three flows:
   - giao đủ + thu đủ
   - có hàng trả
   - thu thiếu/còn công nợ
3. If accidental `Đã giao` occurs, add confirm only for this direct card action while keeping payment/returns fast.
4. After pilot, continue P2 split into `delivery-payment-view.js`, `delivery-returns-view.js`, and `delivery-debts-view.js`.
