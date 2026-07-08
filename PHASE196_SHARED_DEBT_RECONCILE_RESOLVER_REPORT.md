# Phase196 - Shared Debt Reconcile Resolver

## Mục tiêu

Sửa lỗi luồng `Lưu điều chỉnh tay` sinh được `AR-DEBT-ADJUSTMENT` nhưng `Chốt sổ giao hàng` và `Batch repair` không tự cập nhật công nợ giống luồng tay.

## Nguyên nhân

Trước Phase196, code đã có `OrderPaymentDebtReconcileService`, nhưng luồng correction manual vẫn dùng resolver riêng `ArDebtAdjustmentPostingService.postAdjustment()` theo delta nợ của correction. Vì vậy hệ thống tồn tại 2 cách tạo `AR-DEBT-ADJUSTMENT`:

- Manual correction: tạo ledger theo correction delta.
- Closeout/batch: tạo ledger theo allocation reconcile.

Khi dữ liệu cũ thiếu reward/correction, bấm `Lưu điều chỉnh` có thể sửa đúng vì correction resolver đi trực tiếp vào AR ledger; còn batch/chốt sổ chưa dùng cùng một resolver contract.

## File đã sửa

- `src/services/accounting/OrderPaymentDebtReconcileService.js`
- `src/services/accounting/ArDebtAdjustmentPostingService.js`
- `src/services/deliveryCloseoutCorrection.service.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `scripts/backfill-order-payment-allocations.js`
- `src/services/v2/debtNew.service.js`
- `test/order-payment-debt-reconcile-contract.test.js`

## Thay đổi chính

### 1. `OrderPaymentDebtReconcileService` trở thành resolver dùng chung

Bổ sung:

- `computeExpectedDebtFromCloseout(closeout, options)`
- `allocationFromCloseout(...)` nội bộ
- `reconcileOrderDebt(input)` alias chính thức cho các luồng gọi chung

Công thức chuẩn:

```txt
rawDebtAmount = receivableAmount - cashAmount - bankAmount - rewardAmount - returnAmount
expectedDebtAmount = abs(rawDebtAmount) <= zeroTolerance ? 0 : rawDebtAmount
currentArBalance = sum(debit) - sum(credit)
diff = currentArBalance - expectedDebtAmount
```

Nếu `diff > 0`: tạo `AR-DEBT-ADJUSTMENT` credit.
Nếu `diff < 0`: tạo `AR-DEBT-ADJUSTMENT` debit.

### 2. Manual correction gọi shared resolver

`deliveryCloseoutCorrection.service.js` vẫn giữ correction version và UX hiện tại, nhưng khi cần sinh AR adjustment sẽ gọi qua `ArDebtAdjustmentPostingService.postAdjustment(..., { reconcileDebt: true })`.

`ArDebtAdjustmentPostingService` khi nhận `reconcileDebt` sẽ delegate sang `OrderPaymentDebtReconcileService.reconcileOrderDebt()`.

Như vậy luồng tay và batch/chốt sổ không còn 2 công thức khác nhau.

### 3. Chốt sổ giao hàng dùng cùng resolver

`AccountingCloseoutService` gọi:

```js
OrderPaymentDebtReconcileService.reconcileOrderDebt(...)
```

sau khi đã tạo/post `orderPaymentAllocation` và AR/Fund ledger cơ bản.

### 4. Batch repair dùng cùng resolver

`scripts/backfill-order-payment-allocations.js` đổi sang gọi `reconcileOrderDebt()` khi chạy:

```bash
npm run order-payment:repair:debt
```

### 5. AR-DEBT-ADJUSTMENT giữ source đúng

Shared resolver có thể ghi ledger với:

- `sourceType: DELIVERY_CLOSEOUT_CORRECTION` cho luồng lưu điều chỉnh tay.
- `sourceType: delivery_closeout`/`orderPaymentAllocations` cho luồng chốt sổ/batch.

Ledger vẫn có `orderCode`, `customerCode`, `salesStaffCode`, `deliveryStaffCode`, `allocationCode`, `idempotencyKey`, `debit/credit` đầy đủ.

## Chống sinh trùng

Idempotency key chuẩn:

```txt
AR-DEBT-ADJUSTMENT:DEBT-RECONCILE:<orderCode>:<allocationCode-or-sourceId>:<expectedDebtAmount>:v<sourceVersion>
```

Nếu key đã tồn tại thì skip, không insert ledger mới.

## Công nợ New

`DebtNewService` đã giữ các category cần thiết trong read path:

- `AR-SALE`
- `AR-RECEIPT-CASH`
- `AR-RECEIPT-BANK`
- `AR-REWARD-ALLOWANCE`
- `AR-RETURN`
- `AR-DEBT-ADJUSTMENT`

Do đó sau batch/chốt sổ, bấm `Tải` phải đọc lại từ `arLedgers` và thấy `AR-DEBT-ADJUSTMENT`.

## Lệnh vận hành

Dry-run:

```bash
npm run order-payment:audit:debt -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
```

Apply:

```bash
npm run order-payment:repair:debt -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
```

Kiểm tra lại:

```bash
npm run order-payment:audit:debt -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
```

## Test đã chạy

```bash
npm run check:syntax
npm run check:source-bundles
node --test test/order-payment-debt-reconcile-contract.test.js test/order-payment-allocation-reward-contract.test.js test/order-payment-repair-batch-contract.test.js test/delivery-closeout-correction-contract-static.test.js test/delivery-closeout-correction-no-change-optional-reason.test.js test/ar-debt-read-model-v2-categories.test.js
node --test test/delivery-closeout-breakdown-consistency.test.js test/audit-delivery-closeout-reward-debt-mismatch.test.js test/debt-screen-direct-ar-ledger-source.test.js test/ar-customer-debt-read-model-ssot.test.js
```

Kết quả:

- `SYNTAX_OK 1312 JavaScript files`
- `[source-bundles] OK 19 bundles`
- `37/37 selected tests passed`
- `14/14 selected AR/debt tests passed`

## Không sửa lan

Không đổi kho, import, SSE, UI lớn. Không xóa ledger cũ. Không update đè ledger cũ. Không sinh fund ledger cho reward/debt adjustment.
