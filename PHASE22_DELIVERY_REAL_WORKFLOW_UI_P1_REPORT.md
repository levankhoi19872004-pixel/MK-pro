# PHASE22 — Delivery Real Workflow UI P1

## Baseline

`MK-pro-phase20-delivery-frontend-modularization-p2-patched(3).zip`

Phase21 field-efficiency UI was intentionally **not** used as baseline because it over-optimized UI reduction and did not fit the actual NVGH delivery workflow.

## Objective

Redesign the delivery mobile frontend around the real delivery workflow without changing API/business rules:

1. Đơn giao
2. Hàng giao
3. Trả hàng
4. Thu tiền & xác nhận
5. Công nợ
6. Đối soát cuối ngày as a visible secondary shortcut, not a primary tab

## Files changed

Modified:

- `config/source-bundles.json`
- `public/mobile/js/delivery-mobile-view.source.js`
- `public/mobile/js/delivery-mobile-view.js`
- `public/mobile/js/delivery-mobile-view.js.map`
- `public/mobile/js/delivery-orders-view.js`
- `public/mobile/mobile.css`
- `test/delivery-mobile-performance-p1-static.test.js`
- `test/delivery-reconciliation-report-p1-static.test.js`

Added:

- `public/mobile/mobile.source/mobile-04.css`
- `test/delivery-real-workflow-ui-p1-static.test.js`
- `PHASE22_DELIVERY_REAL_WORKFLOW_UI_P1_REPORT.md`

Deleted:

- None

## Implementation summary

### 1. Main tabs follow real NVGH workflow

Primary tabs are now:

- Đơn giao
- Hàng giao
- Trả hàng
- Thu tiền
- Công nợ

`Đối soát` is still easily accessible through the header shortcut, but no longer consumes a primary workflow tab.

### 2. KPI no longer hides operational money/return context

Main KPI now focuses on field delivery operations:

- Tổng đơn
- Chưa giao
- Đã giao
- Phải thu
- Trả hàng
- Còn thiếu

This avoids the wrong phase21 direction of showing only order count + receivable while losing return/debt context.

### 3. Order card is workflow-oriented

Each order card now emphasizes:

- Customer
- Order code
- Delivery address
- NVBH
- Product summary: item lines and quantity
- Receivable
- Return amount
- Remaining debt
- Note if present

Card actions now follow the real delivery workflow:

- Hàng giao
- Trả hàng
- Thu tiền
- Bản đồ/Gọi fallback

The card does **not** expose a direct `Đã giao` button to avoid bypassing product/return/payment review.

### 4. Product tab is restored as first-class

`Hàng giao` is now a read-only product-check step. It no longer doubles as the return-entry form.

### 5. Return tab owns return input

`Trả hàng` now owns return quantity entry. If no returnOrder rows exist yet, it falls back to the selected order's product lines so NVGH can enter returns directly.

### 6. Payment tab shows remaining debt clearly

`Thu tiền` now displays:

- Phải thu
- Hàng trả
- Còn phải xử lý
- Tiền mặt
- Chuyển khoản
- Trả thưởng
- Còn thiếu / ghi công nợ

The remaining amount updates client-side while the user types. Backend reconciliation logic remains unchanged.

### 7. One-hand sticky workflow bar

When an order is selected, a bottom workflow bar provides quick access to:

- Gọi
- Hàng
- Trả
- Thu

This improves field operation without turning the app into a simple shipper app.

## Business/API impact

- Backend/API: unchanged
- AR/Fund/Inventory logic: unchanged
- Offline queue logic: unchanged
- Delivery owner guard: unchanged
- Debt pagination: unchanged
- Reconciliation API: unchanged

## Validation

Commands run:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
node --test \
 test/delivery-owner-scope-p0.test.js \
 test/delivery-offline-queue-p0-static.test.js \
 test/delivery-money-inventory-debt-flow.test.js \
 test/delivery-mobile-ui-p0p1-static.test.js \
 test/delivery-mobile-performance-p1-static.test.js \
 test/delivery-debt-pagination-p1-static.test.js \
 test/delivery-dual-api-contract-p1p2-static.test.js \
 test/delivery-reconciliation-report-p1-static.test.js \
 test/delivery-reconciliation-report-p1-summary.test.js \
 test/delivery-mobile-modularization-p2-static.test.js \
 test/delivery-real-workflow-ui-p1-static.test.js
npm test
```

Results:

- `check:source-bundles`: PASS — OK 19 bundles
- `check:source-size`: PASS
- `check:syntax`: PASS — `SYNTAX_OK 951 JavaScript files`
- Targeted delivery tests: PASS — `52/52`
- Full `npm test`: known baseline legacy snapshot failures only
  - `# tests 1033`
  - `# pass 1030`
  - `# fail 2`
  - `# skipped 1`

Known unrelated failures:

- `test/phase79-production-strangler.test.js` — assembled index page snapshot
- `test/phase79-production-strangler.test.js` — split CSS legacy cascade snapshot

These are the same legacy snapshot failures observed before this phase and were not updated to avoid unrelated scope creep.

## Manual checklist

Recommended after deploy to staging/pilot:

- Open app
- Load delivery orders
- Select order
- Open Hàng giao
- Enter Trả hàng
- Save return
- Enter Thu tiền
- Confirm delivery
- Open Công nợ
- Open Đối soát shortcut
- Verify 360px/390px/412px/768px widths

## Risk

Low-to-medium frontend UX risk only. No backend/business rule changes were made.

Main thing to verify in pilot: whether the new workflow bar and card actions match the actual finger-flow of NVGH in the field.
