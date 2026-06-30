# PHASE23 — Delivery Customer Workflow UI P1

## Baseline

- Baseline used: `MK-pro-phase22-delivery-real-workflow-ui-p1-patched.zip`
- Phase21 was intentionally not used as baseline because its simplified shipper-style UI did not match the actual NVGH workflow.

## Goal

Implement the customer-centric NVGH workflow agreed with the product owner:

```text
Danh sách khách cần giao
→ chọn khách
→ Hàng giao: nhập SL hàng trả ngay trên từng sản phẩm
→ Xác nhận hàng & thu tiền
→ Thu tiền
→ Xác nhận thu tiền
→ Đối soát
→ Hoàn tất / quay về danh sách khách
```

## Scope and constraints

- No backend business-rule change.
- No AR/Fund/Inventory logic change.
- No API contract change.
- Keep canonical `/api/delivery/*` route family.
- Preserve offline fail-closed behavior for money/return actions.

## Main changes

### 1. Customer list is now the entry point

File:

```text
public/mobile/js/delivery-orders-view.js
```

The first screen is now a list of delivery customers/orders. The card no longer exposes direct `Trả hàng` or `Thu tiền` actions from the list.

It now shows:

- Customer name
- Order code
- Address
- NVBH
- Product summary
- Receivable
- Return summary
- Remaining debt
- Actions: `Gọi`, `Bản đồ`, `Vào giao hàng`

This avoids the earlier mistake of letting NVGH jump straight to payment/confirmation without checking goods.

### 2. Workflow tabs after selecting a customer

File:

```text
public/mobile/js/delivery-mobile-view.source.js
```

Tabs are now:

```text
Khách giao
Hàng giao
Hàng trả
Thu tiền
Đối soát
Công nợ
```

This matches the real process rather than forcing a dashboard-style or shipper-style layout.

### 3. Hàng giao includes return quantity inputs per product

File:

```text
public/mobile/js/delivery-mobile-view.source.js
```

The `Hàng giao` tab now renders each product line with:

- Product code/name
- Delivered quantity
- Fixed sale price
- Return quantity input
- Per-line return amount

Bottom actions:

```text
[Xác nhận hàng & thu tiền]
[Trả hết đơn]
```

`Xác nhận hàng & thu tiền` saves return quantities, recalculates return data through the existing return API, and moves to `Thu tiền`.

### 4. Full-return flow

Files:

```text
public/mobile/js/delivery-mobile-view.source.js
public/js/delivery/delivery-core.js
```

`Trả hết đơn` now:

1. Shows a confirmation prompt.
2. Sets all return quantities equal to delivered quantities.
3. Saves return with `returnType: 'full'` through existing `/api/delivery/return`.
4. Confirms the order with `deliveryStatus: 'failed'` to represent non-delivery/full return.
5. Clears the selected order and returns to the customer list.

### 5. Hàng trả is now review/edit, not the primary input point

The `Hàng trả` tab now reads the return quantities created from `Hàng giao`, allows edit, and can save again before moving to `Thu tiền`.

### 6. Thu tiền now transitions to Đối soát

After saving payment and confirming delivery, the app now switches to the `Đối soát` tab and refreshes reconciliation.

```text
Lưu thu tiền & xác nhận giao
→ Đối soát
```

### 7. CSS for customer workflow

File:

```text
public/mobile/mobile.source/mobile-04.css
```

Added Phase23 CSS block for:

- six-step workflow tab layout
- customer-list action row
- inline return quantity inputs
- full-return danger action
- mobile handling for narrow screens

## Files changed

### Modified

```text
config/source-bundles.json
public/js/delivery/delivery-core.js
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
public/mobile/js/delivery-orders-view.js
public/mobile/mobile.source/mobile-04.css
test/delivery-mobile-ui-p0p1-static.test.js
test/delivery-reconciliation-report-p1-static.test.js
test/delivery-real-workflow-ui-p1-static.test.js
```

### Added

```text
test/delivery-customer-workflow-ui-p1-static.test.js
PHASE23_DELIVERY_CUSTOMER_WORKFLOW_UI_P1_REPORT.md
```

### Deleted

```text
None
```

## Tests executed

### Install

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

### Source bundle / syntax / size

```bash
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
```

Result:

```text
[source-bundles] OK 19 bundles
[source-size-budget] OK
SYNTAX_OK 952 JavaScript files
```

### Targeted delivery tests

Command:

```bash
node --test \
 test/delivery-customer-workflow-ui-p1-static.test.js \
 test/delivery-real-workflow-ui-p1-static.test.js \
 test/delivery-mobile-performance-p1-static.test.js \
 test/delivery-mobile-ui-p0p1-static.test.js \
 test/delivery-reconciliation-report-p1-static.test.js \
 test/delivery-reconciliation-report-p1-summary.test.js \
 test/delivery-debt-pagination-p1-static.test.js \
 test/delivery-dual-api-contract-p1p2-static.test.js \
 test/delivery-owner-scope-p0.test.js \
 test/delivery-money-inventory-debt-flow.test.js \
 test/delivery-offline-queue-p0-static.test.js \
 test/mobile-delivery-return-flow.test.js
```

Result:

```text
54 tests
54 pass
0 fail
```

### Full test

```bash
npm test
```

Result:

```text
# tests 1039
# pass 1036
# fail 2
# skipped 1
```

Known unrelated failures:

```text
test/phase79-production-strangler.test.js
- assembled index page matches the approved Phase80 characterization snapshot
- split CSS parts preserve exact legacy cascade order
```

The same snapshot failures were already known from previous phases and were not updated in this phase to avoid unrelated snapshot churn.

## Manual workflow checklist

- [x] Open delivery app: customer/order list remains first screen.
- [x] Select customer: opens `Hàng giao` workflow screen.
- [x] Hàng giao: each product has return quantity input.
- [x] Xác nhận hàng & thu tiền: saves return rows and moves to `Thu tiền`.
- [x] Hàng trả: review/edit return rows.
- [x] Trả hết đơn: guarded by confirmation and exits customer workflow.
- [x] Thu tiền: confirms payment and delivery.
- [x] Payment success moves to `Đối soát`.
- [x] Công nợ tab remains available.

## Remaining risk

- Full-return behavior depends on existing backend interpretation of `deliveryStatus: failed` and `returnType: full`. The UI now sends the correct intent through existing contracts, but production data should be checked after first real pilot.
- The app uses existing numeric return inputs in base unit. If the business wants thùng/lẻ split inputs per product, that should be a separate Phase24 because it affects unit conversion and return quantity validation.
