# V45 - Sửa tiền mặt Đơn đi giao hôm nay không lẫn thu công nợ cũ

## Mục tiêu

Màn **Đơn đi giao hôm nay** chỉ được hiển thị tiền thu cho chính đơn đang giao:

- Tổng phải thu = tiền hàng của các đơn giao hôm nay
- Tiền mặt = tiền mặt phân bổ cho đơn giao hôm nay
- Chuyển khoản = chuyển khoản phân bổ cho đơn giao hôm nay
- Trả thưởng = khoản cấn trừ của đơn giao hôm nay
- Hàng trả = giá trị từ returnOrders của đơn giao hôm nay
- Công nợ = phần còn lại của đơn giao hôm nay

Tiền thu công nợ cũ không được cộng vào KPI Tiền mặt/Chuyển khoản của màn giao hàng hôm nay.

## Nguyên nhân cũ

Một số dữ liệu app giao hàng lưu tổng tiền thu vào `cashCollected` / `bankCollected`, đồng thời lưu phần thu công nợ cũ vào:

- `oldDebtCashCollected` / `debtCashCollected`
- `oldDebtBankCollected` / `debtBankCollected`
- `debtCollectionAllocations`

Code cũ dùng thẳng `cashCollected` và `bankCollected`, nên KPI có thể bị:

```text
Tiền mặt > Tổng phải thu
```

## File đã sửa

### 1. `src/services/masterOrderService.js`

Thêm hàm chuẩn hóa:

- `deliveryOldDebtCashAmount()`
- `deliveryOldDebtBankAmount()`
- `deliveryCashForCurrentOrder()`
- `deliveryBankForCurrentOrder()`

Sửa các luồng:

- `buildDeliveryAmount()`
- `postDeliveryArLedgerRowsAfterReAccounting()`
- batch post AR khi xác nhận kế toán
- serialize row giao hàng hôm nay
- summary/KPI giao hàng hôm nay

Công thức mới:

```text
cashToday = max(0, cashCollected - oldDebtCashCollected)
bankToday = max(0, bankCollected - oldDebtBankCollected)
```

### 2. `src/routes/mobileRoutes.js`

Sửa `calculateDeliveryDebt()` để không lấy tiền thu công nợ cũ trừ vào nợ của đơn hiện tại.

### 3. `src/services/orderService.js`

Sửa công thức tính nợ giao hàng dùng chung.

### 4. `src/services/mobile/delivery.service.js`

Sửa công thức tính nợ giao hàng trong service mobile.

### 5. `public/js/app/06-master-delivery.js`

Sửa frontend fallback để nếu API trả kèm field `oldDebtCashCollected` / `oldDebtBankCollected` thì UI vẫn không cộng nhầm tiền thu nợ cũ.

## Kết quả sau sửa

Ví dụ dữ liệu:

```text
Tổng phải thu: 58.506.018
cashCollected: 65.444.818
oldDebtCashCollected: 21.378.800
Trả thưởng: 14.440.000
```

Màn giao hàng sẽ tính:

```text
Tiền mặt hiển thị = 65.444.818 - 21.378.800 = 44.066.018
Công nợ = 58.506.018 - 44.066.018 - 14.440.000 = 0
```

Không còn tình trạng tiền mặt lớn hơn tổng phải thu do lẫn thu công nợ cũ.

## Kiểm tra đã thực hiện

- `node --check src/services/masterOrderService.js`: OK
- `node --check src/routes/mobileRoutes.js`: OK
- `node --check src/services/orderService.js`: OK
- `node --check src/services/mobile/delivery.service.js`: OK
- `node --check public/js/app/06-master-delivery.js`: OK

`npm test` vẫn có lỗi cũ/môi trường:

- `test-delivery-6-metrics-static.js` đang kiểm tra chuỗi template cũ.
- Một số test thiếu dependency `mongoose` trong môi trường hiện tại.

Các lỗi này không phát sinh từ phần sửa công thức tiền mặt/công nợ lần này.
