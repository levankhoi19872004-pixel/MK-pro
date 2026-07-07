# PHASE183 - Delivery closeout selected-scope SSoT fix

## Mục tiêu

Sửa lỗi màn **Đơn giao hôm nay (New) → Chốt sổ giao hàng** bị chặn bởi cảnh báo:

> deliveryCloseout hiện tại lệch với dữ liệu tính lại từ salesOrders/returnOrders/tiền giao hàng. Chặn xác nhận kế toán.

Case điển hình: chỉ chọn `1/3` NVBH hoặc một số đơn trong cùng NVGH/ngày, nhưng backend so với `deliveryCloseout` cũ/stale nên chặn dù số trên màn đang đúng.

## Nguyên nhân gốc

- Frontend đã có chọn đơn, nhưng payload chưa có alias rõ `selectedOrderCodes`/`selectedSalesStaffCodes` cho contract closeout theo scope.
- Backend vẫn compare cứng `computed` với `order.deliveryCloseout` hiện có. Nếu `deliveryCloseout` cũ lưu thiếu `rewardAmount`, `returnAmount` hoặc là snapshot legacy, backend chặn trước khi rebuild từ SSoT.
- Scope chốt sổ chưa có `scopeHash` ổn định theo `date + deliveryStaffCode + selectedOrderCodes`.

## File đã sửa

| File | Nội dung |
|---|---|
| `public/js/app/new/91-delivery-today-new.js` | Gửi thêm `selectedOrderCodes`, `selectedOrderIds`, `selectedSalesStaffCodes` khi xác nhận chốt sổ. |
| `src/routes/newOperationsRoutes.js` | Route `/api/new/delivery-today/closeout` nhận cả `orderIds`, `selectedOrderIds`, `selectedOrderCodes`; response trả thêm scope. |
| `src/services/accounting/AccountingCloseoutService.js` | Tạo `scopeHash`, validate scope, recompute từ SSoT, rebuild closeout stale thay vì chặn, audit rebuild/confirm. |
| `src/services/accounting/DeliveryCloseoutService.js` | Preserve scope fields trong closeout version public snapshot. |
| `src/services/accounting/ArDebtOpenPostingService.js` | Ghi metadata `closeoutScopeHash` vào AR-DEBT-OPEN. Không đổi idempotencyKey cũ để giữ contract hiện tại. |
| `test/delivery-closeout-selected-scope-ssot.test.js` | Thêm static test khóa contract selected scope + rebuild SSoT. |

## Logic mới

1. Frontend gửi rõ phạm vi đang chốt:
   - `date`
   - `deliveryStaffCode`
   - `orderIds`
   - `selectedOrderCodes`
   - `selectedSalesStaffCodes`
   - `reason`
2. Backend resolve scope:
   - `selectedOrderCodes` được chuẩn hóa/sort.
   - `selectedSalesStaffCodes` lấy từ payload hoặc từ đơn.
   - `scopeHash = sha256(date::deliveryStaffCode::selectedOrderCodes.join('|'))`.
3. Backend validate:
   - Có đơn được chọn.
   - Đơn thuộc đúng ngày giao.
   - Đơn thuộc đúng NVGH.
   - Đơn thuộc đúng NVBH nếu payload có NVBH.
   - Đơn không bị hủy/xóa.
4. Backend recompute mỗi đơn từ SSoT:
   - `orders/salesOrders`
   - `returnOrders`
   - delivery closeout/payment/reward fields trên order hiện có
5. Nếu closeout cũ lệch, hệ thống:
   - Không throw `DELIVERY_CLOSEOUT_CALCULATION_MISMATCH` trong selected scope.
   - Gắn `rebuiltFromSsot=true`.
   - Lưu `previousCloseoutMismatches`/`previousCloseoutDiff` vào diagnostic.
   - Ghi audit `DELIVERY_CLOSEOUT_REBUILT_FROM_SSOT`.
6. Sau đó mới confirm closeout, post `AR-DEBT-OPEN` và ghi audit `DELIVERY_CLOSEOUT_CONFIRMED`.

## Idempotency

- Vẫn giữ `AR-DEBT-OPEN:${sourceId}` để không phá validator/read-model/static contract hiện tại.
- `scopeHash` được ghi vào closeout và ledger metadata để trace phạm vi chốt.
- Đơn đã `accountingConfirmed` vẫn được fast-skip/idempotent như trước, không post lại AR.

## Kiểm tra đã chạy

Đã chạy thành công:

```bash
npm run check:source-bundles
node --check src/services/accounting/AccountingCloseoutService.js
node --check src/services/accounting/DeliveryCloseoutService.js
node --check src/services/accounting/ArDebtOpenPostingService.js
node --check src/routes/newOperationsRoutes.js
node --check public/js/app/new/91-delivery-today-new.js
node --test test/delivery-closeout-selected-scope-ssot.test.js test/delivery-closeout-command-standard-v2.test.js test/delivery-today-closeout-idempotent-fast-skip.test.js test/accounting-confirm-blocks-missing-returnorders.test.js
```

Kết quả targeted tests: `13/13 pass`.

## Ghi chú full `npm test`

Full `npm test` còn fail 3 lỗi không liên quan trực tiếp đến closeout và đã có sẵn trong ZIP gốc phase182 khi kiểm tra lại:

1. `docs:generate check keeps OpenAPI synchronized with route code` - thiếu skeleton route order-split.
2. `import template contract keeps the seven public methods stable` - method contract import template bị thiếu.
3. `assembled index page matches the approved Phase80 characterization snapshot` - hash snapshot index phase79 không khớp ZIP gốc.

Các lỗi này không phát sinh từ patch closeout selected-scope.

## Cách test tay case B0038650

1. Vào **Đơn giao hôm nay (New)**.
2. Chọn ngày `2026-07-02`.
3. Chọn NVGH `ghth`.
4. Chỉ tick đơn/NVBH cần chốt, ví dụ `B0038650`.
5. Bấm **Chốt sổ giao hàng**.
6. DevTools Network phải thấy payload có:

```json
{
  "date": "2026-07-02",
  "deliveryStaffCode": "ghth",
  "selectedOrderCodes": ["B0038650"],
  "selectedSalesStaffCodes": ["33955"]
}
```

7. Xác nhận chốt: không còn bị chặn bởi closeout stale; AR-DEBT-OPEN sinh theo công nợ cuối cùng sau ngưỡng ±1.000.
