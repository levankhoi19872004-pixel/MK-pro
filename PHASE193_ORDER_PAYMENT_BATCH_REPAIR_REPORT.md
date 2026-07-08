# PHASE193 - Order Payment Batch Reconcile & Repair

## Mục tiêu

Nâng cấp cơ chế `orderPaymentAllocations` để xử lý hàng loạt lỗi phân bổ thanh toán/công nợ, không phải cập nhật từng đơn thủ công.

Luồng kiểm soát:

```txt
salesOrders.deliveryCloseout / deliveryCloseoutVersions/latest
→ orderPaymentAllocations
→ arLedgers
→ fundLedgers
→ Công nợ New / Đơn giao hôm nay New
```

## File thêm mới

| File | Mục đích |
|---|---|
| `src/models/OrderPaymentRepairRun.js` | Collection log lịch sử chạy batch `orderPaymentRepairRuns` |
| `test/order-payment-repair-batch-contract.test.js` | Test contract cho CLI batch, idempotency, reward/fund rule |
| `PHASE193_ORDER_PAYMENT_BATCH_REPAIR_REPORT.md` | Báo cáo kỹ thuật phase này |

## File đã sửa

| File | Nội dung |
|---|---|
| `scripts/backfill-order-payment-allocations.js` | Nâng cấp thành Batch Reconcile & Repair có filter, dry-run/apply, batch-size, phân loại lỗi, log run |
| `src/models/index.js` | Export model `orderPaymentRepairRuns` |
| `src/services/mongoIndexService.js` | Thêm managed index cho `orderPaymentRepairRuns` |
| `package.json` | Thêm npm scripts `order-payment:*` |

## Option script hỗ trợ

```bash
--from YYYY-MM-DD
--to YYYY-MM-DD
--delivery <deliveryStaffCode>
--salesman <salesStaffCode>
--customer <customerCode>
--order <orderCode>
--only-missing-allocations
--only-missing-reward-ledgers
--only-invalid
--apply
--json
--limit <number>
--batch-size <number>
--fix-missing-ar-ledgers
--fix-missing-fund-ledgers
--fix-missing-reward-ledgers
```

Mặc định là dry-run: không sửa business data. Script vẫn ghi `orderPaymentRepairRuns` để truy vết lần chạy.

## Phân loại lỗi

| Nhóm | Ý nghĩa |
|---|---|
| `missingAllocations` | Có đơn/closeout nhưng thiếu `orderPaymentAllocations` |
| `missingRewardLedgers` | Allocation có trả thưởng nhưng thiếu `AR-REWARD-ALLOWANCE` |
| `missingArLedgers` | Allocation posted nhưng thiếu AR ledger tương ứng |
| `missingFundLedgers` | Allocation có TM/CK nhưng thiếu fund ledger tương ứng |
| `amountConflicts` | Ledger tồn tại nhưng sai số tiền |
| `invalidAllocations` | Sai invariant phân bổ |
| `manualReviewRequired` | Không tự sửa an toàn, cần kế toán/kỹ thuật kiểm tra |
| `errors` | Lỗi runtime theo từng đơn, batch vẫn tiếp tục |

## Cách chạy

### Dry-run theo ngày

```bash
npm run order-payment:audit -- --from 2026-07-01 --to 2026-07-07
```

### Dry-run JSON theo ngày + NVGH

```bash
npm run order-payment:audit:json -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
```

### Apply sửa toàn bộ lỗi thiếu allocation/AR/Fund trong khoảng ngày

```bash
npm run order-payment:repair -- --from 2026-07-01 --to 2026-07-07
```

### Apply riêng lỗi trả thưởng

```bash
npm run order-payment:repair:reward -- --from 2026-07-01 --to 2026-07-07 --delivery ghth
```

### Chạy riêng một đơn để đối chiếu

```bash
node scripts/backfill-order-payment-allocations.js --order B0038757 --json
```

```bash
node scripts/backfill-order-payment-allocations.js --apply --fix-missing-reward-ledgers --order B0038757
```

## Idempotency

Allocation dùng key ổn định theo order/source/version, ví dụ:

```txt
OPA:B0038757:delivery_closeout:SO-B0038757:v1
OPA:B0038757:delivery_closeout_version:<versionId>:v<version>
```

AR ledger tiếp tục dùng key ổn định từ `OrderPaymentAllocationService`, ví dụ:

```txt
OPA:<allocationIdempotencyKey>:AR-SALE
OPA:<allocationIdempotencyKey>:AR-RECEIPT-CASH
OPA:<allocationIdempotencyKey>:AR-RECEIPT-BANK
OPA:<allocationIdempotencyKey>:AR-REWARD-ALLOWANCE
OPA:<allocationIdempotencyKey>:AR-RETURN
```

Fund ledger chỉ sinh cho TM/CK:

```txt
FUND:OPA:<allocationIdempotencyKey>:cash
FUND:OPA:<allocationIdempotencyKey>:bank
```

`rewardAmount` không sinh `fundLedgers`.

## orderPaymentRepairRuns

Mỗi lần chạy tạo log:

```js
{
  runCode,
  mode: 'dry-run' | 'apply',
  fromDate,
  toDate,
  deliveryStaffCode,
  salesStaffCode,
  customerCode,
  orderCode,
  scannedOrders,
  createdAllocations,
  createdArLedgers,
  createdFundLedgers,
  skippedAlreadyFixed,
  invalidAllocations,
  manualReviewRequired,
  errors,
  status,
  startedAt,
  finishedAt,
  createdBy
}
```

Managed indexes:

- `uniq_order_payment_repair_runs_run_code`
- `idx_order_payment_repair_runs_created_at`
- `idx_order_payment_repair_runs_status_created_at`
- `idx_order_payment_repair_runs_mode_date_range`

## Kết quả test

Đã chạy:

```bash
npm run check:syntax
npm run check:source-bundles
node --test test/order-payment-allocation-reward-contract.test.js test/order-payment-repair-batch-contract.test.js
```

Kết quả:

```txt
SYNTAX_OK 1310 JavaScript files
[source-bundles] OK 19 bundles
9/9 selected tests passed
```

Có chạy thử `npm test`; pretest/source-bundles pass và nhiều nhóm test pass, nhưng bộ full test bị dừng bởi lỗi cũ không thuộc phase này:

```txt
src/services/reportService.js must remain a small facade
```

