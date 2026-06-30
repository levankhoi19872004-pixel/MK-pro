# PHASE79 AR Debt Reconciliation Report

## Phạm vi

Reconcile script mới: `scripts/reconcile-ar-debt-after-rebuild.js`.

Mục tiêu:

```text
canonical arLedgers aggregate
vs arDebtOrders
vs arDebtCustomers
```

Nếu lệch thì script trả exit code `2`.

## Rebuild script

```bash
node scripts/rebuild-ar-debt-read-model.js --dry-run --all
node scripts/rebuild-ar-debt-read-model.js --dry-run --sourceId=SO1782550380164673
node scripts/rebuild-ar-debt-read-model.js --dry-run --customerCode=4501221
```

Khi bỏ `--dry-run`, script chỉ rebuild read model `arDebtOrders/arDebtCustomers`, không sửa `arLedgers` gốc.

## Reconcile script

```bash
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --all
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --sourceId=SO1782550380164673
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --customerCode=4501221
```

## Test đã chạy

```text
node --test test/ar-debt-read-model-canonical.test.js test/debt-api-canonical-read-model.test.js
Result: pass
```

Các case đã khóa:

- AR-SALE confirmed hợp lệ xuất hiện trong read model.
- Ledger bẩn không được silently tính vào công nợ.
- Rebuild read model khớp aggregate canonical ledgers trong fixture.
- API service lọc exact `salesStaffCode=35095`.
- API service lọc exact `deliveryStaffCode=ghth`.
- API service đọc từ `arDebtCustomers/arDebtOrders`, không tính từ `salesOrders`.

## Kết quả chạy trên DB thật

Chưa chạy được trong sandbox hiện tại vì ZIP không kèm `node_modules` và thiếu dependency `mongoose` khi gọi CLI. Cần chạy lại sau:

```bash
npm install
node scripts/rebuild-ar-debt-read-model.js --dry-run --all
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --all
```

## Kết luận

Reconciliation gate đã được thêm nhưng chưa được xác nhận trên dữ liệu production. Không được deploy như “đã hoàn thành gate” cho tới khi audit/rebuild/reconcile chạy thành công trên DB thật.
