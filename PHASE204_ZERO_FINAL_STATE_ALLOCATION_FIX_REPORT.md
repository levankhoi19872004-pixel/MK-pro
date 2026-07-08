# PHASE204 - Zero final-state amount fix for delivery closeout correction allocation

## 1. Tổng quan

Phase204 xử lý riêng lỗi khi lưu điều chỉnh trả thưởng trong popup:

`Đơn giao hôm nay (New) -> Điều chỉnh -> Thu tiền -> Trả thưởng sau điều chỉnh -> Lưu điều chỉnh`.

Lỗi UI báo:

```txt
finalDebtAmount/debtAmount trong closeout lệch với normalizedDebtAmount sau Debt Zero Tolerance.
```

Đây là lỗi invariant backend tại `OrderPaymentAllocationService.buildAllocationFromCloseout()`, không phải lỗi giao diện.

## 2. Nguyên nhân gốc

Trong `src/services/accounting/OrderPaymentAllocationService.js`, allocation builder trước đây dùng `pickFirstPositiveMoney()` để lấy các field final-state:

- `cashAmount`
- `bankAmount`
- `rewardAmount`
- `returnAmount`
- `receivableAmount`

`pickFirstPositiveMoney()` chỉ nhận số `> 0`. Vì vậy các giá trị hợp lệ bằng `0` trong `deliveryCloseoutVersion` như:

```js
cashAmount: 0,
bankAmount: 0,
returnAmount: 0,
rewardAmount: 255000
```

bị bỏ qua. Sau đó service fallback sang field cũ trên `order`, dẫn đến allocation tính lại `normalizedDebtAmount` bằng dữ liệu stale, trong khi `deliveryCloseoutVersion.finalDebtAmount` là final-state mới.

Guard `ORDER_PAYMENT_ALLOCATION_EXPLICIT_DEBT_CONFLICT` phát hiện đúng sai lệch này và chặn lưu.

## 3. Hướng sửa

Không bỏ guard. Sửa nguồn dữ liệu đầu vào để invariant khớp.

### 3.1 `OrderPaymentAllocationService`

Thêm helper:

- `hasOwnMoneyValue()`
- `pickAuthoritativeMoney()`
- `hasAuthoritativeMoney()`

Nguyên tắc mới:

```txt
Nếu closeout/version có field thì field đó là authoritative, kể cả giá trị = 0.
Chỉ fallback sang order hoặc collectedAmount legacy khi closeout/version không có field rõ ràng.
```

`buildAllocationFromCloseout()` bây giờ lấy:

```js
receivableAmount = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_RECEIVABLE_FIELDS)
cashAmount       = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_CASH_FIELDS)
bankAmount       = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_BANK_FIELDS)
rewardAmount     = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_REWARD_FIELDS)
returnAmount     = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_RETURN_FIELDS)
```

Fallback `collectedAmount` chỉ chạy khi closeout không có cả cash/bank rõ ràng.

### 3.2 `deliveryCloseoutCorrection.service.js`

Trong `buildVersionSnapshot()`, debt của version mới được server tính lại từ final-state:

```js
const newDebt = money(debtCalculation.debtAmount);
```

Không lấy `correction.debtAmount` hoặc `correction.newDebtAmount` từ UI/stale state để ghi vào immutable closeout version.

## 4. File đã sửa

| File | Sửa gì | Lý do |
|---|---|---|
| `src/services/accounting/OrderPaymentAllocationService.js` | Thêm authoritative money picker, dùng cho final-state amount | Zero amount là giá trị hợp lệ, không được fallback sang order cũ |
| `src/services/accounting/OrderPaymentAllocationService.js` | Giữ fallback `collectedAmount` chỉ cho legacy closeout không có cash/bank rõ ràng | Không phá dữ liệu cũ |
| `src/services/deliveryCloseoutCorrection.service.js` | `buildVersionSnapshot()` dùng debt do server tính | Không tin debt từ frontend/stale payload |
| `test/order-payment-allocation-zero-final-state-static.test.js` | Thêm static contract test cho explicit zero final-state | Chống tái phát lỗi |
| `test/delivery-adjustment-reward-allocation-integration-static.test.js` | Thêm test version debt server-calculated | Chặn copy debt từ payload/stale |
| `RELEASE_MANIFEST.json` | Cập nhật release Phase204 | Manifest khớp source mới |

## 5. Contract kế toán sau sửa

- `deliveryCloseoutVersion` là final-state authoritative.
- `orderPaymentAllocations` mirror từ `deliveryCloseoutVersion`.
- `0` là giá trị hợp lệ cho `cashAmount`, `bankAmount`, `returnAmount`, `rewardAmount`.
- Debt cuối cùng do backend tính:

```txt
rawDebtAmount = receivableAmount - cashAmount - bankAmount - rewardAmount - returnAmount
debtAmount = normalizeDebtAmount(rawDebtAmount, 1000)
finalDebtAmount = debtAmount
```

- Guard `ORDER_PAYMENT_ALLOCATION_EXPLICIT_DEBT_CONFLICT` vẫn giữ nguyên.
- Không sinh AR ledger trùng.
- Không sửa dữ liệu MongoDB trực tiếp.

## 6. Kết quả test

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run check:syntax` | Pass | `SYNTAX_OK 1324 JavaScript files` |
| `node --test test/order-payment-allocation-zero-final-state-static.test.js test/delivery-adjustment-reward-allocation-integration-static.test.js` | Pass | 9/9 |
| Regression static tests liên quan bulk/return/mobile debt | Pass | 22/22 khi chạy nhóm test mở rộng |
| `npm run check:release-manifest` | Pass | `RELEASE_MANIFEST_OK 2026-07-08-05` |
| `npm run check:source-bundles` | Không chạy được | Sandbox thiếu dependency `terser` |
| `npm test` | Không chạy được | `pretest` gọi `check:source-bundles`, cũng lỗi thiếu `terser` |

Lỗi `terser` là lỗi dependency môi trường kiểm tra, không phải lỗi phát sinh từ Phase204.

## 7. MongoDB verification sau deploy

Kiểm tra version:

```js
db.deliveryCloseoutVersions.find(
  { orderCode: "B0038706" },
  {
    orderCode: 1,
    closeoutVersion: 1,
    originalAmount: 1,
    cashAmount: 1,
    bankAmount: 1,
    rewardAmount: 1,
    returnAmount: 1,
    rawDebtAmount: 1,
    debtAmount: 1,
    finalDebtAmount: 1,
    createdAt: 1
  }
).sort({ closeoutVersion: -1 }).limit(5).pretty()
```

Kiểm tra allocation mirror:

```js
db.orderPaymentAllocations.find(
  {
    orderCode: "B0038706",
    sourceType: "DELIVERY_CLOSEOUT_CORRECTION"
  },
  {
    orderCode: 1,
    sourceVersion: 1,
    receivableAmount: 1,
    cashAmount: 1,
    bankAmount: 1,
    rewardAmount: 1,
    returnAmount: 1,
    rawDebtAmount: 1,
    normalizedDebtAmount: 1,
    debtAmount: 1,
    zeroToleranceAdjustmentAmount: 1,
    idempotencyKey: 1,
    updatedAt: 1
  }
).sort({ sourceVersion: -1 }).limit(5).pretty()
```

Kỳ vọng:

```txt
cashAmount = 0 nếu version mới ghi 0
bankAmount = 0 nếu version mới ghi 0
rewardAmount = 255000
returnAmount = 0 nếu version mới ghi 0
debtAmount = normalizedDebtAmount = finalDebtAmount
```

## 8. Rủi ro còn lại

- Một số path legacy vẫn có `pickFirstPositiveMoney()` cho fallback cũ, nhưng `buildAllocationFromCloseout()` không còn dùng nó để lấy final-state amount chính.
- Chưa chạy được full `npm test` do thiếu `terser` trong sandbox.
- Nếu dữ liệu cũ trong DB đã tạo allocation sai trước Phase204, cần audit/repair riêng bằng script backfill, không xử lý trong phase này để tránh sửa dữ liệu lan.
