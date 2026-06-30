# PHASE81 AR Legacy Contract Normalization Report

## A. Bối cảnh

Production audit trên `kho_minh_khai_v43` cho thấy toàn bộ AR legacy hiện tại không đạt contract Phase80:

- `Rows`: 1538
- `DirtyLedgerCount`: 1538
- `IssueCount`: 7298
- Rebuild dry-run: `canonicalLedgerCount = 0`, `debtOrderCount = 0`, `debtCustomerCount = 0`
- Plan Phase79 cũ chỉ phân nhóm, `actions = 0`, toàn bộ `safeToAutoApply=false`

Phase81 không nới validator và không tính công nợ từ `salesOrders`. Phase81 chỉ xây dựng cơ chế audit/plan/apply/reconcile production-safe để chuẩn hóa AR ledger legacy khi có đủ bằng chứng từ source thật.

## B. Thiết kế Phase81

Luồng mới:

```text
arLedgers legacy
→ audit-ar-legacy-contract-detail
→ plan-ar-legacy-contract-normalization
→ apply-ar-legacy-contract-normalization --dry-run/--apply
→ rebuild-ar-debt-read-model
→ reconcile-ar-after-legacy-normalization
```

Nguyên tắc:

- Không xóa ledger.
- Không apply plan rỗng.
- Không apply action thiếu `rollbackPatch`.
- Không apply `confidence=medium/low`.
- Không auto apply `MANUAL_REVIEW_REQUIRED`.
- Chỉ auto apply action `confidence=high`, `safeToAutoApply=true`, có `before`, `after`, `rollbackPatch`, `safetyChecks`.
- B0038423/B0038424, ACC/REV mismatch, reversal chain phức tạp bắt buộc manual review.

## C. File đã tạo/sửa

```text
scripts/lib/arLegacyNormalizationCore.js
scripts/audit-ar-legacy-contract-detail.js
scripts/plan-ar-legacy-contract-normalization.js
scripts/apply-ar-legacy-contract-normalization.js
scripts/reconcile-ar-after-legacy-normalization.js
test/ar-legacy-normalization-plan.test.js
test/ar-legacy-normalization-apply-safety.test.js
test/ar-legacy-b0038423-repair.test.js
package.json
```

## D. Action contract

Mỗi action Phase81 có đủ:

```text
actionType
ledgerId
ledgerCode
reason
confidence
safeToAutoApply
before
after
safetyChecks
rollbackPatch
relatedSourceSnapshot
filter
```

Các loại action:

- `NORMALIZE_AR_SALE_CONTRACT`
- `NORMALIZE_AR_RETURN_CONTRACT`
- `NORMALIZE_AR_RECEIPT_CONTRACT`
- `MARK_DUPLICATE_INACTIVE`
- `FIX_REVERSED_BUT_ACTIVE`
- `MANUAL_REVIEW_REQUIRED`

## E. Safety rule

### AR-SALE

Chỉ normalize khi:

- Match duy nhất với `salesOrders`.
- Debit-only.
- Không có dấu hiệu REV/reversed/ACC mismatch.
- Sinh đủ contract: `category`, `ledgerType`, `entryType`, `sourceType`, `sourceId`, `sourceCode`, `idempotencyKey`, `accountingBatchId`, staff/customer metadata.

### AR-RETURN

Chỉ normalize khi:

- Match duy nhất với `returnOrders`.
- Credit-only.
- Không có dấu hiệu REV/reversed/ACC mismatch.

### AR-RECEIPT

Chỉ normalize khi:

- Match duy nhất với `debtCollections` hoặc `fundLedgers/payment`.
- Credit-only.

### Duplicate

- Không xóa.
- Chỉ mark duplicate inactive nếu duplicate group cùng amount/source/idempotency rõ.

### Reversed-but-active

- Chỉ fix khi tìm đúng một reversal pair.
- Không rõ cặp reversal thì manual review.

## F. Cách chạy

Audit chi tiết:

```bash
node scripts/audit-ar-legacy-contract-detail.js --markdown
```

Plan action thật:

```bash
node scripts/plan-ar-legacy-contract-normalization.js --dry-run --markdown
```

Dry-run apply:

```bash
node scripts/apply-ar-legacy-contract-normalization.js
```

Apply thật chỉ sau khi duyệt plan:

```bash
node scripts/apply-ar-legacy-contract-normalization.js --apply
```

Reconcile sau apply:

```bash
node scripts/reconcile-ar-after-legacy-normalization.js --markdown
```

## G. Test results

Targeted Phase81 + Phase80 tests:

```text
22/22 pass
```

Syntax check:

```text
SYNTAX_OK 1100 JavaScript files
```

`npm test` toàn dự án chưa chạy được trong sandbox vì ZIP không kèm `node_modules`, lỗi đầu tiên là thiếu module `terser` trong pretest source-bundle check.

## H. Kết luận

Phase81 đã tạo framework normalization production-safe. Bản này chưa tự sửa dữ liệu production. Muốn sửa production phải chạy plan, duyệt các action `confidence=high`, dry-run apply, backup, rồi mới `--apply`.
