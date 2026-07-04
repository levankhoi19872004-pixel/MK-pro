# PHASE171 - Delivery Closeout Reward Debt Mismatch Audit Dry-run

## Phạm vi

Bổ sung/nâng cấp audit batch read-only cho lỗi `order.rewardAmount > 0` nhưng `deliveryCloseout.rewardAmount` hoặc công nợ cuối giao hàng bị tính thiếu trả thưởng.

## File đã thay đổi

- `src/services/accounting/deliveryCloseoutCalculator.js`
  - Thêm helper dùng chung:
    - `normalizeMoney`
    - `applyDebtZeroTolerance`
    - `calculateDeliveryCloseoutDebt`
  - Công thức chuẩn: `deliveredAmount - cashAmount - bankAmount - offsetAmount - rewardAmount`.

- `scripts/audit-delivery-closeout-reward-debt-mismatch.js`
  - Nâng cấp script hiện có, không tạo script trùng chức năng.
  - Mặc định dry-run/read-only.
  - Quét `orders` có `rewardAmount > 0`.
  - Hỗ trợ:
    - `--json`
    - `--strict`
    - `--limit=50000`
    - `--customerCode=...`
    - `--orderCode=...`
  - Kiểm tra:
    - `REWARD_NOT_DEDUCTED`
    - `SHOULD_NOT_HAVE_ACTIVE_AR_DEBT_OPEN`
    - `SHOULD_NOT_HAVE_OPEN_DEBT_READ_MODEL`
  - Match exact qua `sourceId`, `orderId`, `salesOrderId`, `sourceCode`, `orderCode`, `salesOrderCode`, `idempotencyKey`.
  - Không dùng regex/contains/prefix cho order id.
  - In `suggestedRepairCommand` cho từng đơn.

- `test/audit-delivery-closeout-reward-debt-mismatch.test.js`
  - Regression test cho:
    1. Order reward bị rơi khỏi closeout.
    2. Closeout đúng không báo sai.
    3. Ledger `AR-DEBT-OPEN` active sai.
    4. Không match nhầm prefix order id.
    5. `arDebtOrders` open sai.

## Lệnh kiểm tra đã chạy

```cmd
npm run check:source-bundles
```

Kết quả:

```txt
[source-bundles] OK 19 bundles
```

```cmd
node --test test/audit-delivery-closeout-reward-debt-mismatch.test.js
```

Kết quả:

```txt
# pass 5
# fail 0
```

```cmd
npm test
```

Kết quả: Fail do các test static/UI cũ không thuộc phạm vi sửa lần này. Các lỗi xuất hiện ở nhóm mobile/static như:

- `mobile customer and product summary data no longer passes through innerHTML`
- `admin and mobile UI expose actual stock, DMS difference, and App selling limit`
- `mobile sales page cache busts compact customer summary assets and marks the customer box compact`
- `mobile sales order card has Xem hàng trả button and in-app returns modal`
- `phase 4 lowers the main bundle budget and bumps browser cache version`
- `mobile sales script cache version is bumped for edit fix`

Các test audit mới vẫn PASS độc lập.

## Lệnh chạy production/manual

```cmd
node scripts\audit-delivery-closeout-reward-debt-mismatch.js
node scripts\audit-delivery-closeout-reward-debt-mismatch.js --json
node scripts\audit-delivery-closeout-reward-debt-mismatch.js --strict
node scripts\audit-delivery-closeout-reward-debt-mismatch.js --limit=50000
node scripts\audit-delivery-closeout-reward-debt-mismatch.js --customerCode=4501630
node scripts\audit-delivery-closeout-reward-debt-mismatch.js --customerCode=4501630 --orderCode=B0038683
```

Nếu có mismatch và chạy `--strict`, script set `process.exitCode = 2`.

## Ghi chú an toàn

Script audit không ghi database, không update order, không reverse ledger, không rebuild read-model và không apply batch repair.
