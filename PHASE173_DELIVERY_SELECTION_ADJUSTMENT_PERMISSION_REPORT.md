# PHASE173 - Delivery Today New selection vs closeout eligibility + adjustment permission

## Scope

Tập trung riêng màn `Đơn giao hôm nay (New)` và popup `Điều chỉnh đơn giao`.

## Files changed

- `public/js/app/new/91-delivery-today-new.js`
- `src/services/v2/deliveryTodayNew.service.js`
- `src/services/deliveryCloseoutCorrection.service.js`
- `test/delivery-today-new-sales-staff-selection.test.js`
- `test/delivery-today-new-view-selection-closeout-eligibility.test.js`

## Root cause

1. Checkbox order đang dùng chung khái niệm `selectable` cho cả chọn xem KPI và chọn để chốt sổ. Vì `isOrderSelectable()` loại đơn đã chốt, checkbox của đơn đã chốt bị disabled.
2. Selection NVBH phụ thuộc vào danh sách order `selectable`, nên khi toàn bộ đơn trong NVBH đã chốt thì tick NVBH không còn phản ánh đúng mục tiêu xem/theo dõi KPI.
3. Popup điều chỉnh ở frontend chặn submit bằng `!isConfirmed(row)`, nên đơn chưa chốt không cho admin/kế toán cập nhật trạng thái thu tiền hiện tại.
4. Backend correction service trước đây chỉ cho `deliveryCloseout` đã confirmed, nên endpoint correction không có đường xử lý an toàn cho adjustment trước chốt.

## Changes

### Frontend

- Tách helper:
  - `isViewSelectableOrder(row)` cho checkbox view/tracking.
  - `isCloseoutEligibleOrder(row)` cho action `Chốt sổ giao hàng`.
- Checkbox order/NVBH không còn bị disabled vì `accountingConfirmed/accountingStatus/closeoutStatus`.
- `selectedCloseoutRows()` chỉ lấy các order đang chọn và còn đủ điều kiện chốt.
- Nút `Chốt sổ giao hàng` chỉ enable khi có `selectedCloseoutRows().length > 0`.
- Khi toàn bộ đơn đang chọn đã chốt, checkbox vẫn hoạt động nhưng nút chốt bị disabled với tooltip rõ nghĩa.
- Toolbar tách rõ counter:
  - `Tổng đơn`
  - `Đang chọn`
  - `Có thể chốt`
  - `Đã chốt`
- Popup điều chỉnh không còn chặn submit khi đơn chưa chốt.
- Message đơn chưa chốt đổi thành: admin/kế toán có thể cập nhật trạng thái thu tiền hiện tại trước khi chốt.

### Backend/API contract

`src/services/v2/deliveryTodayNew.service.js` bổ sung các field rõ nghĩa cho từng order row:

- `viewSelectable`
- `closeoutEligible`
- `adjustmentAllowed`
- `closeoutLocked`
- `canCloseout`
- `canAdjust`

### Correction service

`src/services/deliveryCloseoutCorrection.service.js` bổ sung đường xử lý trước chốt:

- Nếu order chưa confirmed, service gọi `createOpenOrderAdjustment()`.
- Pre-closeout adjustment cập nhật trạng thái thu tiền hiện tại vào order/deliveryCloseout draft.
- Không sinh AR ledger trước chốt.
- Không gọi rebuild read-model.
- Vẫn giữ validation âm tiền mặt/chuyển khoản/trả thưởng.
- Sau chốt vẫn đi theo correction version/audit flow cũ.

## Regression tests

Added:

- `test/delivery-today-new-view-selection-closeout-eligibility.test.js`

Updated:

- `test/delivery-today-new-sales-staff-selection.test.js`

Coverage:

- Checkbox là view selection, không phải closeout permission.
- Đơn đã chốt vẫn tick được nhưng không được gửi vào closeout API.
- Toolbar tách selected/eligible/closed counters.
- API contract có `viewSelectable/closeoutEligible/canAdjust/canCloseout`.
- Popup adjustment không chặn đơn chưa chốt và backend có open-order adjustment path.

## Validation run

Passed:

```cmd
node --check public/js/app/new/91-delivery-today-new.js
node --check src/services/v2/deliveryTodayNew.service.js
node --check src/services/deliveryCloseoutCorrection.service.js
node --check src/routes/newOperationsRoutes.js
node scripts/check-js-syntax.js
node --test test/delivery-closeout-correction-no-change-optional-reason.test.js test/delivery-today-new-sales-staff-selection.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-view-selection-closeout-eligibility.test.js
```

Result:

```txt
SYNTAX_OK 1269 JavaScript files
# pass 19
# fail 0
```

Blocked in sandbox because `node_modules` is not present:

```cmd
npm run check:source-bundles
npm test
```

Error:

```txt
Cannot find module 'terser'
```

Run again after `npm install` on the dev machine.

## Manual QA

1. Load `Đơn giao hôm nay (New)` with orders already chốt sổ.
2. Tick/bỏ tick NVBH after closeout.
3. Tick/bỏ tick individual orders after closeout.
4. Confirm KPI/list changes but no closeout API is called.
5. Confirm `Chốt sổ giao hàng` remains disabled when selected orders are all closed.
6. Open `Điều chỉnh` before closeout as admin/accountant and save.
7. Open `Điều chỉnh` after closeout and save to correction/version flow.
8. Confirm reason is optional and no-difference save is not blocked.
