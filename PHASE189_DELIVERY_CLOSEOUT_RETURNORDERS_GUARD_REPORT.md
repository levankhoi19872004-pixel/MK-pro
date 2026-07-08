# Phase189 - Delivery Closeout ReturnOrders Guard Fix

## Scope

Fix lỗi màn `Đơn giao hôm nay (New) → Chốt sổ giao hàng` vẫn báo:

```txt
returnOrders đã xác nhận phải có inventoryPosted=true hoặc inventoryImpact rõ ràng.
```

trong khi `returnOrders` mới nhất trên MongoDB đã có `inventoryPosted=true`, `stockPosted=true`, `stockInStatus='posted'` và `stockTransactionIds`.

## Root cause

Luồng chốt sổ đang query `returnOrders` qua `findReturnOrdersForDeliveryChildren()`, nhưng projection trước đó chỉ lấy các field nghiệp vụ tiền/trạng thái cơ bản, không lấy các field xác nhận nhập kho như:

- `inventoryPosted`
- `stockPosted`
- `stockInStatus`
- `inventoryImpact`
- `stockTransactionIds`

Vì vậy document mới nhất trong DB có đủ flag, nhưng object truyền vào `DeliveryCloseoutService.buildCloseout()` bị thiếu field guard và bị coi như chưa nhập kho.

## Files changed

- `src/services/master-order/masterOrderReturn.impl.js`
- `src/services/accounting/DeliveryCloseoutService.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `src/routes/newOperationsRoutes.js`
- `test/delivery-closeout-return-inventory-guard.test.js`

## Guard behavior after fix

Return order đã xác nhận được coi là hợp lệ nếu có một trong các điều kiện:

- `inventoryPosted === true`
- `stockPosted === true`
- `stockInStatus === 'posted'`
- `inventoryImpact.mode === 'posted'`
- `inventoryImpact.mode === 'none'` và có `inventoryImpact.reason`

Guard không bị bỏ. Guard chỉ đọc đúng dữ liệu `returnOrders` mới nhất được query từ DB với đủ projection.

## Diagnostic error payload

Khi còn lỗi, response sẽ có `invalidReturnOrders` gồm:

- `code`
- `orderCode`
- `salesOrderCode`
- `orderId`
- `salesOrderId`
- `deliveryDate`
- `deliveryStaffCode`
- `amount`
- `status`
- `returnStatus`
- `returnState`
- `warehouseReceiveStatus`
- `stockInStatus`
- `inventoryPosted`
- `stockPosted`
- `inventoryImpactMode`
- `stockTransactionIds`
- `sourceUsedForValidation`

## Tests run

PASS:

```txt
node --test test/delivery-closeout-return-inventory-guard.test.js
npm run check:syntax
npm run check:source-size
```

Partial related test run:

```txt
node --test test/hoason-strict-closeout.test.js test/hoason-delivery-closeout-final-debt.test.js test/delivery-closeout-breakdown-consistency.test.js test/delivery-closeout-uses-returnorders.test.js
```

The tests that only need `DeliveryCloseoutService` passed; the run stopped on `test/hoason-delivery-closeout-final-debt.test.js` because the sandbox has no `node_modules/mongoose` installed.

## Not changed

- Không đổi logic công nợ.
- Không đổi logic tồn kho.
- Không sửa `orders` ngoài closeout path.
- Không sửa `arLedgers`.
- Không sửa `fundLedgers`.
- Không sửa notification deep-link.
- Không sửa module `Công cụ → Chia đơn theo giá trị`.
