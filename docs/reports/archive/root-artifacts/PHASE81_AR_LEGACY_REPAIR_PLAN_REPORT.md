# PHASE81 AR Legacy Repair Plan Report

## Mục tiêu

Khắc phục giới hạn của `plan-ar-clean-rebuild.js` cũ: script cũ chỉ phân nhóm và không sinh `actions`. Phase81 tạo plan có action thật, có rollback và có phân loại confidence.

## Script mới

```text
scripts/plan-ar-legacy-contract-normalization.js
```

Output:

```text
reports/ar-legacy-normalization-plan.json
reports/ar-legacy-normalization-plan.md
```

## Quy định plan

Mỗi action bắt buộc có:

- `actionType`
- `ledgerId`
- `ledgerCode`
- `reason`
- `confidence`
- `safeToAutoApply`
- `before`
- `after`
- `safetyChecks`
- `rollbackPatch`
- `relatedSourceSnapshot`
- `filter`

## Phân loại action

| Action | Auto apply? | Điều kiện |
|---|---:|---|
| `NORMALIZE_AR_SALE_CONTRACT` | Có, nếu high | Match duy nhất salesOrder, debit-only, không REV risk |
| `NORMALIZE_AR_RETURN_CONTRACT` | Có, nếu high | Match duy nhất returnOrder, credit-only, không REV risk |
| `NORMALIZE_AR_RECEIPT_CONTRACT` | Có, nếu high | Match duy nhất debtCollection/fund/payment, credit-only |
| `MARK_DUPLICATE_INACTIVE` | Có, nếu high | Duplicate chắc chắn, không xóa ledger |
| `FIX_REVERSED_BUT_ACTIVE` | Có, nếu high | Có đúng một reversal pair |
| `MANUAL_REVIEW_REQUIRED` | Không | Thiếu bằng chứng, ACC/REV mismatch, B0038423/B0038424, reversal chain phức tạp |

## Apply guard

`apply-ar-legacy-contract-normalization.js` sẽ từ chối:

- Plan rỗng.
- Plan không có action high-confidence.
- Action thiếu `rollbackPatch`.
- Action thiếu `after`.
- Action confidence thấp.
- Manual action.

## Lệnh kiểm tra production

```bash
node scripts/plan-ar-legacy-contract-normalization.js --dry-run --markdown
node scripts/apply-ar-legacy-contract-normalization.js
```

Sau khi kiểm tra `reports/ar-legacy-normalization-apply-report.md` và backup production, mới được cân nhắc:

```bash
node scripts/apply-ar-legacy-contract-normalization.js --apply
```

## Lưu ý

Không tạo unique index trước khi xử lý duplicate và reversal. Không rebuild read model thật trước khi canonical ledger count > 0 sau normalization.
