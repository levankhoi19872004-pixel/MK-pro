# PHASE194 - Order Payment Debt Reconcile Batch

## Mục tiêu

Sửa phần còn thiếu sau Phase193: batch `orderPaymentAllocations` đã tạo allocation/AR/Fund, nhưng `Công nợ New` vẫn chưa tự về đúng nếu AR balance theo đơn đang cao/thấp hơn expected debt. Người vận hành vẫn phải mở từng đơn trong `Đơn giao hôm nay (New)` và bấm `Lưu điều chỉnh` để sinh `AR-DEBT-ADJUSTMENT`.

Phase194 bổ sung cơ chế batch debt reconcile để tự động tạo `AR-DEBT-ADJUSTMENT` idempotent theo từng đơn đã chốt, không tạo correction version hàng loạt.

## File thêm

- `src/services/accounting/OrderPaymentDebtReconcileService.js`
- `test/order-payment-debt-reconcile-contract.test.js`
- `PHASE194_ORDER_PAYMENT_DEBT_RECONCILE_BATCH_REPORT.md`

## File sửa

- `scripts/backfill-order-payment-allocations.js`
- `package.json`
- `src/models/OrderPaymentRepairRun.js`

## Service mới

`OrderPaymentDebtReconcileService` cung cấp:

- `computeExpectedDebtFromAllocation(allocation, { zeroTolerance })`
- `getCurrentOrderArBalance(orderCode, customerCode, options)`
- `buildDebtAdjustmentLedger({ allocation, currentArBalance, expectedDebtAmount, diff })`
- `reconcileOneOrder({ order, allocation, apply, session })`
- `reconcileManyOrders(filters)`

## Công thức expected debt

```txt
expectedDebtAmount = receivableAmount - cashAmount - bankAmount - rewardAmount - returnAmount
```

Áp dụng Debt Zero Tolerance:

```txt
Nếu abs(expectedDebtAmount) <= 1000 => expectedDebtAmount = 0
```

Không dùng:

- `master_orders.totalAmount`
- `reporting_snapshots`
- công thức bỏ qua `rewardAmount`

## Logic tạo AR-DEBT-ADJUSTMENT

```txt
currentArBalance = sum(debit) - sum(credit) theo orderCode + customerCode

diff = currentArBalance - expectedDebtAmount
```

- `diff > 0`: tạo `AR-DEBT-ADJUSTMENT` credit = diff
- `diff < 0`: tạo `AR-DEBT-ADJUSTMENT` debit = abs(diff)
- `diff = 0`: bỏ qua

## Idempotency

Ledger reconcile dùng khóa ổn định:

```txt
AR-DEBT-ADJUSTMENT:DEBT-RECONCILE:<orderCode>:<allocationCode/idempotencyKey>:<expectedDebtAmount>:v<sourceVersion>
```

Chạy lại nhiều lần không sinh thêm ledger. Nếu key đã tồn tại thì batch báo `skippedDebtAlreadyReconciled`.

## Script batch nâng cấp

File:

```txt
scripts/backfill-order-payment-allocations.js
```

Option mới:

```bash
--fix-debt-balance
--only-debt-diff
--zero-tolerance 1000
```

Output summary bổ sung:

- `debtDiffs`
- `createdDebtAdjustments`
- `skippedDebtAlreadyReconciled`
- `zeroToleranceApplied`
- `debtAdjustmentDebitAmount`
- `debtAdjustmentCreditAmount`

## NPM scripts mới

```bash
npm run order-payment:audit:debt -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
npm run order-payment:repair:debt -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
```

Trong đó:

- `order-payment:audit:debt` chỉ dry-run, không sửa DB.
- `order-payment:repair:debt` tạo `AR-DEBT-ADJUSTMENT` idempotent cho các đơn lệch.

## Case B0038734

Input:

```txt
receivableAmount = 9.668.695
cashAmount       =   561.000
bankAmount       = 5.807.000
rewardAmount     = 3.300.000
returnAmount     =         0
```

Raw debt:

```txt
9.668.695 - 561.000 - 5.807.000 - 3.300.000 = 695
```

Do `695 <= 1000`, expected debt = `0`.

Nếu AR hiện tại đang là `3.300.695`, batch tạo:

```txt
AR-DEBT-ADJUSTMENT credit 3.300.695
```

## Case B0038757

Input:

```txt
receivableAmount = 50.552.883
rewardAmount     =  1.855.000
expectedDebt     = 48.697.883
```

Nếu AR hiện tại vẫn là `50.552.883`, batch phải tạo adjustment credit `1.855.000` hoặc trước đó repair reward ledger tương ứng, nhưng không để Công nợ New còn `50.552.883`.

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
21/21 selected tests passed
```
