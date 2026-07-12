# Phase246 - Delivery Today Closeout State Consistency Fix

## Root cause

Màn `Đơn giao hôm nay (New)` có nhiều điểm tự suy diễn trạng thái closeout:

| Thành phần | File | Function | Field đang dùng | Sai lệch |
| --- | --- | --- | --- | --- |
| Row badge | `public/js/app/new/91-delivery-today-new.js` | `isConfirmed`, `statusLabel`, `renderOrderRow` | `accountingConfirmed`, `accountingStatus`, `deliveryCloseoutStatus`, `closeoutStatus`, `status` | Badge có nguồn riêng, không đi qua eligibility selector. |
| Checkbox selectable | `public/js/app/new/91-delivery-today-new.js` | `isViewSelectableOrder` | `viewSelectable`, cancelled/deleted status | Đúng vai trò view selection nhưng tách khỏi state closeout chung. |
| NVBH selection | `public/js/app/new/91-delivery-today-new.js` | `groupSelectableRows`, `selectGroupOrders` | `isViewSelectableOrder` | Selection theo NVBH không đồng bộ trực tiếp với closeout summary. |
| Selected count | `public/js/app/new/91-delivery-today-new.js` | `updateOrderSelectionToolbar` | `getSelectedOrders()` | Tự tính riêng trong toolbar. |
| Closeout-eligible count | `public/js/app/new/91-delivery-today-new.js` | `updateOrderSelectionToolbar` | `selectedOrders.filter(isCloseoutEligibleOrder)` | Cùng ý nghĩa với button/payload nhưng filter riêng. |
| Closed count | `public/js/app/new/91-delivery-today-new.js` | `updateOrderSelectionToolbar` | `visible.filter(isConfirmed)` | Đếm theo visible rows, không theo selected summary. |
| Closeout button | `public/js/app/new/91-delivery-today-new.js` | `updateCloseoutButton` | `selectedCloseoutRows`, `canCloseoutSelectedOrders` | Có thể recompute độc lập với toolbar. |
| POST payload | `public/js/app/new/91-delivery-today-new.js` | `submitCloseout` | `selectedCloseoutRows()` | Payload đúng hướng nhưng chưa chia sẻ cùng summary với counter/button. |
| Backend row mapping | `src/services/v2/deliveryTodayNew.service.js` | `mapOrderRow` | `closeoutEligibility`, `closeoutEligible`, `accountingConfirmed`, `viewSelectable` | Contract đã nhất quán: `closeoutEligible === closeoutEligibility.eligible`. |

Lỗi thực tế là frontend closeout state synchronization, không phải AR/Fund/Inventory/Mongo transaction.

## Production-grade fix

Thêm selector thuần:

- `deriveCloseoutUiState(row)`
- `deriveCloseoutSelectionSummary(rows, selectedIds)`
- `getCloseoutSelectionSummary(visibleRows)`
- `refreshDerivedUiState(visibleRows)`

Nguồn quyết định mới:

- Đã chốt: `accountingConfirmed === true` hoặc `accountingStatus === 'confirmed'`.
- Eligible: ưu tiên `closeoutEligibility.eligible === true`; chỉ fallback `closeoutEligible === true` khi backend cũ không trả object.
- View selectable: `viewSelectable !== false`, có key đơn, không cancelled/deleted.

## Before/After

Before:

- Row badge, toolbar, button và payload có thể tự tính bằng các helper/filter khác nhau.
- Toolbar có thể hiển thị `Có thể chốt: 0` trong khi nút vẫn bật nếu button đọc state stale hoặc filter khác.
- Closed count tính trên visible rows thay vì selected summary.

After:

- Row badge đọc `deriveCloseoutUiState(row)`.
- Toolbar đọc `getCloseoutSelectionSummary(visible)`.
- Button đọc cùng `selectionSummary.eligibleSelectedOrders`.
- Payload chỉ lấy `selectionSummary.eligibleRows`.
- Nếu `eligibleSelectedOrders === 0`, nút disabled, có `aria-disabled`, và click/submit guard không gọi API.
- Reload thay rows mới, reset selected IDs, chọn lại view-selectable rows, rồi render rows và recompute toolbar/button qua `refreshDerivedUiState`.

## Backend contract check

`deliveryTodayNew.service.js` vẫn trả:

- `accountingConfirmed`
- `accountingStatus`
- `closeoutEligibility`
- `closeoutEligible`
- `viewSelectable`
- `canCloseout`

Mapping hiện giữ `const closeoutEligible = closeoutEligibility.eligible === true`, nên backend không tạo mâu thuẫn giữa object và alias.

## Files changed

- `public/js/app/new/91-delivery-today-new.js`
- `test/phase246-delivery-today-closeout-state-consistency.test.js`
- `test/delivery-today-new-view-selection-closeout-eligibility.test.js`
- `test/phase243-closeout-result-contract.test.js`
- `test/delivery-today-closeout-idempotent-fast-skip.test.js`
- `PHASE246_DELIVERY_TODAY_CLOSEOUT_STATE_CONSISTENCY_REPORT.md`

## Test evidence

- `node --test test/phase246-delivery-today-closeout-state-consistency.test.js` - pass.
- `node --test test/delivery-today-new-view-selection-closeout-eligibility.test.js test/phase243-closeout-result-contract.test.js` - pass.
- Targeted closeout group including Phase242C-246 - 57 tests pass.
- `npm test` - pass.
- `node scripts/verify-source-artifact-clean.js --zip MK-pro-phase246-delivery-today-closeout-state-consistency-fixed.zip` - pass, 2004 entries.

## Regression impact

- Does not touch AR writer, Fund writer, Inventory writer, Return writer, accounting formulas, debt formulas, closeout transaction, or Phase242C-245 persistence guards.
- Checkbox remains view/KPI selection; closeout action only uses selected + eligible rows.
- Missing eligibility fails closed.

## Remaining risks

- If an older backend sends only `canCloseout` without `closeoutEligibility` or `closeoutEligible`, the frontend will fail closed. This is intentional for Phase246.
- If backend sends contradictory `closeoutEligibility.eligible=false` and `closeoutEligible=true`, the object wins and the row is not eligible.

## Production checklist

- Verify B0039299-like case: selected 1, eligible 0, closed 0, button disabled, no API call.
- Verify mixed selection: selected 3, eligible 1, closed 1, payload only eligible row.
- Verify reload after eligibility changes: stale count is not retained.
- Verify NVBH tick multi-select: selected count and payload stay aligned.
- Verify no accounting writer changes are included.
