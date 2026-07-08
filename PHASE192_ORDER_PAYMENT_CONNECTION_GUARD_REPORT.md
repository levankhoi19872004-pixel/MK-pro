# Phase192 - Order Payment Allocation Connection Guard

## Mục tiêu

Bổ sung lớp kiểm tra kết nối dữ liệu để tránh thiếu số liệu giữa các nguồn:

```txt
salesOrders.deliveryCloseout
  -> orderPaymentAllocations
  -> arLedgers
  -> fundLedgers
  -> Công nợ New / Đơn giao hôm nay New
```

## Điểm đã gia cố

### 1. Chống thiếu field legacy khi build allocation

`OrderPaymentAllocationService.buildAllocationFromCloseout()` không còn chỉ đọc vài field cố định. Service đã mở rộng alias để đọc các biến thể thường gặp:

- Tiền mặt: `cashAmount`, `cashCollectedAmount`, `cashReceivedAmount`, `paidCash`, `collectedCashAmount`, `cashCollected`, ...
- Chuyển khoản: `bankAmount`, `transferAmount`, `bankTransferAmount`, `paidTransferAmount`, `collectedTransferAmount`, `bankCollected`, ...
- Trả thưởng/cấn trừ: `offsetAmount`, `rewardAmount`, `bonusAmount`, `allowanceAmount`, `rewardOffsetAmount`, `promotionOffsetAmount`, ...
- Hàng trả: `returnedAmount`, `returnAmount`, `returnOrderAmount`, `actualReturnAmount`, `returnAmountFromReturnOrders`, ...
- Còn nợ: `finalDebtAmount`, `debtAmount`, `remainingDebt`, `arBalance`, ...

Nếu dữ liệu legacy chỉ có `collectedAmount` mà không tách TM/CK, hệ thống fallback ghi nhận như tiền mặt để không mất số thu.

### 2. Audit đủ kết nối allocation -> AR/Fund

Script `scripts/backfill-order-payment-allocations.js` đã được mở rộng để kiểm tra:

- Đơn có closeout nhưng thiếu `orderPaymentAllocation`.
- Allocation thiếu bất kỳ AR ledger bắt buộc nào: `AR-SALE`, `AR-RECEIPT-CASH`, `AR-RECEIPT-BANK`, `AR-REWARD-ALLOWANCE`, `AR-RETURN`.
- AR ledger có nhưng sai số tiền theo allocation.
- Allocation có TM/CK nhưng thiếu `fundLedgers`.
- Fund ledger có nhưng sai số tiền.
- Tổng công nợ allocation lệch với AR balance.
- Invariant allocation sai.

### 3. Script vận hành mới

Thêm npm scripts:

```bash
npm run audit:order-payment-allocations
npm run audit:order-payment-allocations:json
npm run repair:order-payment-allocations:dry
npm run repair:order-payment-allocations
```

Chạy kiểm tra riêng một đơn:

```bash
node scripts/backfill-order-payment-allocations.js --order B0038757 --json
```

Tạo allocation còn thiếu:

```bash
node scripts/backfill-order-payment-allocations.js --apply --order B0038757
```

Tạo AR ledger còn thiếu từ allocation:

```bash
node scripts/backfill-order-payment-allocations.js --apply --fix-missing-ar-ledgers --order B0038757
```

Tạo fund ledger còn thiếu cho TM/CK:

```bash
node scripts/backfill-order-payment-allocations.js --apply --fix-missing-fund-ledgers --order B0038757
```

Fix riêng lỗi trả thưởng thiếu AR credit:

```bash
node scripts/backfill-order-payment-allocations.js --apply --fix-missing-reward-ledgers --order B0038757
```

## Nguyên tắc an toàn

- Không tự ghi đè ledger đã tồn tại nhưng sai số tiền.
- Nếu ledger tồn tại sai amount, script chỉ báo `arLedgerAmountConflicts` hoặc `fundLedgerAmountConflicts`.
- Việc sửa sai amount phải đi qua reverse/repost theo quy trình kế toán/quỹ.
- Các thao tác tạo mới dùng idempotencyKey để tránh post trùng.

## Checklist sau deploy

1. Chạy index:

```bash
npm run mongo:indexes
```

2. Dry-run toàn bộ:

```bash
npm run audit:order-payment-allocations:json
```

3. Fix allocation/ledger còn thiếu nếu kết quả dry-run đúng:

```bash
npm run repair:order-payment-allocations
```

4. Kiểm tra riêng case B0038757:

```bash
node scripts/backfill-order-payment-allocations.js --order B0038757 --json
```

Kỳ vọng sau khi sạch:

```txt
missingAllocations = 0
missingArLedgers = 0
missingFundLedgers = 0
missingRewardLedgers = 0
allocationDebtArDiffs = 0
invalidAllocations = 0
```
