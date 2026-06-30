# PHASE79 AR Ledger Contract Audit Report

## Phạm vi

Audit script mới: `scripts/audit-ar-ledger-contract.js`.

Script chỉ đọc DB, không sửa dữ liệu production. Hỗ trợ:

```bash
node scripts/audit-ar-ledger-contract.js --dry-run
node scripts/audit-ar-ledger-contract.js --dry-run --json
node scripts/audit-ar-ledger-contract.js --dry-run --markdown
node scripts/audit-ar-ledger-contract.js --dry-run --sourceId=SO1782550380164673
node scripts/audit-ar-ledger-contract.js --dry-run --customerCode=4501221
```

## Issue code được phát hiện

- `DIRTY_LEDGER_MISSING_CATEGORY`
- `DIRTY_LEDGER_MISSING_LEDGER_TYPE`
- `DIRTY_LEDGER_MISSING_ENTRY_TYPE`
- `DIRTY_LEDGER_MISSING_SOURCE_ID`
- `DIRTY_LEDGER_MISSING_CUSTOMER_CODE`
- `DIRTY_LEDGER_INVALID_DEBIT_CREDIT`
- `DIRTY_LEDGER_ACC_ID_REV_BATCH_MISMATCH`
- `DIRTY_LEDGER_DUPLICATE_AR_SALE`
- `DIRTY_LEDGER_DUPLICATE_REVERSAL`
- `DIRTY_LEDGER_REVERSED_BUT_ACTIVE`
- `DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT`

## Test audit đã chạy

```text
node --test test/ar-ledger-contract-audit.test.js
Result: pass
```

Test đã mô phỏng:

- AR-SALE thiếu `category/ledgerType/entryType`.
- AR-SALE id có `ACC` nhưng `accountingBatchId` là `REV-*`.
- Duplicate AR-SALE active theo `sourceId`.
- Duplicate AR-SALE-REVERSAL theo `sourceId + reversedLedgerId`.
- Ledger `accountingStatus=reversed` nhưng vẫn active/reversed flag sai.
- Case `B0038423 / SO1782550380164673` được đưa vào phạm vi audit fixture.

## Kết quả chạy trên DB thật

Chưa chạy được trong sandbox hiện tại vì ZIP không kèm `node_modules` và thiếu dependency `mongoose` khi gọi CLI. Cần chạy lại sau:

```bash
npm install
node scripts/audit-ar-ledger-contract.js --dry-run --markdown > PHASE79_AR_LEDGER_CONTRACT_AUDIT_REPORT.md
```

## Nguyên tắc an toàn

- Script không sửa ledger.
- Ledger bẩn chỉ xuất report/plan.
- Không dùng fallback `code /^AR-SALE-/` để coi ledger bẩn là canonical.
- Không apply unique index nếu audit còn duplicate.
