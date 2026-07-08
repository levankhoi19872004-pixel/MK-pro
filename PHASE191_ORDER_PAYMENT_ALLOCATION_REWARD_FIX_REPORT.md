# Phase191 - Order Payment Allocation / Reward Debt Fix

## Scope

Fix lỗi `Trả thưởng` trong `Đơn giao hôm nay (New)` đã hiển thị ở danh sách đơn nhưng không được ghi nhận thống nhất vào `Công nợ New`, làm công nợ khách cao hơn thực tế.

Case kiểm chứng:

- `B0038757`: phải thu `50.552.883`, trả thưởng `1.855.000`, còn nợ `48.697.883`.
- `B0038742`: còn nợ `238.328`.
- Tổng đúng khách `4501102`: `48.936.211`, không phải `50.791.211`.

## Architecture decision

Thêm collection `orderPaymentAllocations` làm SSoT phân bổ thanh toán theo từng đơn:

- `cashAmount`: tiền mặt.
- `bankAmount`: chuyển khoản.
- `rewardAmount`: trả thưởng/cấn trừ thưởng.
- `returnAmount`: hàng trả.
- `debtAmount`: còn nợ.

`arLedgers` vẫn là SSoT công nợ cuối cùng. `fundLedgers` vẫn là SSoT quỹ. `orderPaymentAllocations` là nguồn chuẩn để post sang AR/Fund.

Invariant bắt buộc:

```txt
receivableAmount = cashAmount + bankAmount + rewardAmount + returnAmount + debtAmount
```

## Files added

- `src/models/OrderPaymentAllocation.js`
- `src/services/accounting/OrderPaymentAllocationService.js`
- `scripts/backfill-order-payment-allocations.js`
- `test/order-payment-allocation-reward-contract.test.js`
- `PHASE191_ORDER_PAYMENT_ALLOCATION_REWARD_FIX_REPORT.md`

## Files changed

- `src/models/index.js`
- `src/services/mongoIndexService.js`
- `src/domain/ar/arLedgerValidator.js`
- `src/utils/arLedgerCategoryEffect.util.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `src/services/v2/debtNew.service.js`
- `src/services/v2/deliveryTodayNew.service.js`
- `test/ar-debt-read-model-v2-categories.test.js`

## Accounting posting flow

When delivery closeout is confirmed:

1. Rebuild closeout from SSoT.
2. Validate closeout.
3. Upsert `orderPaymentAllocations` using idempotency key.
4. Post detailed AR rows from allocation:
   - `AR-SALE`: debit `receivableAmount`.
   - `AR-RECEIPT-CASH`: credit `cashAmount`.
   - `AR-RECEIPT-BANK`: credit `bankAmount`.
   - `AR-REWARD-ALLOWANCE`: credit `rewardAmount`.
   - `AR-RETURN`: credit `returnAmount`.
5. Post fund ledgers only for cash/bank.
6. Queue AR read model sync.

`rewardAmount` never creates fund ledger.

## Idempotency

Allocation idempotency key:

```txt
OPA:<sourceId>:delivery_closeout:<closeoutScopeHash>:v<sourceVersion>
```

AR ledger idempotency key:

```txt
OPA:<allocation.idempotencyKey>:<category>
```

Fund ledger idempotency key:

```txt
FUND:OPA:<allocation.idempotencyKey>:cash|bank
```

## Mongo indexes

Managed indexes were added for `orderPaymentAllocations`:

- unique `idempotencyKey`.
- unique `orderCode + sourceType + sourceId + sourceVersion`.
- customer/status/date lookup.
- delivery/sales/status lookup.
- order id/code lookup.

## Diagnostic / backfill

Dry-run:

```bash
node scripts/backfill-order-payment-allocations.js --order B0038757 --json
```

Create missing allocations:

```bash
node scripts/backfill-order-payment-allocations.js --apply --order B0038757
```

Fix missing reward ledgers only:

```bash
node scripts/backfill-order-payment-allocations.js --apply --fix-missing-reward-ledgers --order B0038757
```

The script reports:

- missing allocation.
- missing `AR-REWARD-ALLOWANCE`.
- allocation invariant errors.
- allocation debt vs AR balance diff.

## Tests

Executed:

```bash
npm run check:syntax
node --test test/ar-debt-read-model-v2-categories.test.js test/delivery-closeout-breakdown-consistency.test.js test/audit-delivery-closeout-reward-debt-mismatch.test.js test/order-payment-allocation-reward-contract.test.js
```

Result:

- `SYNTAX_OK 1308 JavaScript files`
- `10/10` selected tests passed.
