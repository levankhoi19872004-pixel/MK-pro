# Phase195 - Order Payment Zero Tolerance Closeout Fix

## Mục tiêu

Sửa lỗi chốt sổ giao hàng bị chặn bởi invariant cũ của `orderPaymentAllocations` khi công nợ thô nằm trong khoảng Debt Zero Tolerance ±1.000.

Lỗi thực tế:

```txt
Sai invariant phân bổ thanh toán: receivableAmount phải bằng cashAmount + bankAmount + rewardAmount + returnAmount + debtAmount.
```

Nguyên nhân: `debtAmount` trong closeout đã được normalize về 0 theo nghiệp vụ, nhưng validator Phase194 vẫn kiểm exact với `debtAmount` như nợ thô.

## File đã sửa/thêm

### Sửa

- `src/models/OrderPaymentAllocation.js`
- `src/services/accounting/OrderPaymentAllocationService.js`
- `src/services/accounting/OrderPaymentDebtReconcileService.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `scripts/backfill-order-payment-allocations.js`
- `test/order-payment-allocation-reward-contract.test.js`
- `test/order-payment-debt-reconcile-contract.test.js`

### Thêm

- `PHASE195_ORDER_PAYMENT_ZERO_TOLERANCE_CLOSEOUT_FIX_REPORT.md`

## Model mới bổ sung field

`orderPaymentAllocations` có thêm các field:

- `rawDebtAmount`
- `normalizedDebtAmount`
- `zeroTolerance`
- `zeroToleranceApplied`
- `zeroToleranceAdjustmentAmount`

## Logic mới

### rawDebtAmount

```txt
rawDebtAmount = receivableAmount - cashAmount - bankAmount - rewardAmount - returnAmount
```

### normalizedDebtAmount

```txt
Nếu abs(rawDebtAmount) <= zeroTolerance thì normalizedDebtAmount = 0
Ngược lại normalizedDebtAmount = max(0, rawDebtAmount)
```

### debtAmount

```txt
debtAmount = normalizedDebtAmount
```

### zeroToleranceAdjustmentAmount

```txt
zeroToleranceAdjustmentAmount = rawDebtAmount - normalizedDebtAmount
```

## Invariant mới

Không còn dùng invariant cũ một cách mù quáng:

```txt
receivableAmount = cashAmount + bankAmount + rewardAmount + returnAmount + debtAmount
```

Thay bằng:

```txt
receivableAmount = cashAmount + bankAmount + rewardAmount + returnAmount + rawDebtAmount
```

và:

```txt
debtAmount = normalizedDebtAmount
zeroToleranceAdjustmentAmount = rawDebtAmount - normalizedDebtAmount
```

## Case B0038734

Input:

```txt
receivableAmount = 9.668.695
cashAmount       =   561.000
bankAmount       = 5.807.000
rewardAmount     = 3.300.000
returnAmount     =         0
```

Kết quả:

```txt
rawDebtAmount = 695
normalizedDebtAmount = 0
debtAmount = 0
zeroToleranceApplied = true
zeroToleranceAdjustmentAmount = 695
```

Sau khi post allocation ledger:

```txt
AR-SALE debit                    9.668.695
AR-RECEIPT-CASH credit             561.000
AR-RECEIPT-BANK credit           5.807.000
AR-REWARD-ALLOWANCE credit       3.300.000
```

AR balance còn 695. `AccountingCloseoutService` gọi tiếp `OrderPaymentDebtReconcileService.reconcileOneOrder()` để tạo:

```txt
AR-DEBT-ADJUSTMENT credit 695
```

Vì vậy Công nợ New về 0 ngay sau chốt sổ, không cần mở popup Điều chỉnh rồi bấm Lưu.

## Chốt sổ tự gọi debt reconcile

`AccountingCloseoutService` sau khi gọi:

```js
OrderPaymentAllocationService.buildAndPostFromCloseout(...)
```

sẽ gọi tiếp:

```js
OrderPaymentDebtReconcileService.reconcileOneOrder({
  order: updatedOrderForLedger,
  allocation: allocationResult.allocation,
  apply: true,
  zeroTolerance: 1000,
  actor,
  session: options.session
})
```

## Chống sinh trùng

`AR-DEBT-ADJUSTMENT` dùng idempotencyKey ổn định:

```txt
AR-DEBT-ADJUSTMENT:DEBT-RECONCILE:<orderCode>:<allocationCode>:<expectedDebtAmount>:v<sourceVersion>
```

Chạy lại không sinh thêm ledger.

## Batch đồng bộ

`scripts/backfill-order-payment-allocations.js` khi build allocation cũng dùng cùng `zeroTolerance` thay vì `tolerance: 0`, nên batch không còn fail invariant với các đơn có raw debt trong khoảng ±1.000.

Các lệnh Phase194 vẫn giữ:

```bash
npm run order-payment:audit:debt -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
npm run order-payment:repair:debt -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
```

## Kết quả kiểm tra

Đã chạy:

```bash
npm run check:syntax
npm run check:source-bundles
node --test test/order-payment-allocation-reward-contract.test.js test/order-payment-repair-batch-contract.test.js test/order-payment-debt-reconcile-contract.test.js test/ar-debt-read-model-v2-categories.test.js test/delivery-closeout-breakdown-consistency.test.js test/audit-delivery-closeout-reward-debt-mismatch.test.js
```

Kết quả:

```txt
SYNTAX_OK 1312 JavaScript files
[source-bundles] OK 19 bundles
25/25 selected tests passed
```

## Phạm vi không sửa

- Không đổi nghiệp vụ kho
- Không đổi import
- Không đổi SSE
- Không tạo correction version hàng loạt
- Không sinh fundLedgers cho rewardAmount
- Không dùng `master_orders.totalAmount`
- Không dùng `reporting_snapshots`
