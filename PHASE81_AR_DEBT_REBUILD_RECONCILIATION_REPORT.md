# PHASE81 AR Debt Rebuild Reconciliation Report

## Mục tiêu

Sau khi legacy AR ledger được normalize, read model công nợ phải rebuild được từ canonical `arLedgers` qua Phase80 read layer.

## Script mới

```text
scripts/reconcile-ar-after-legacy-normalization.js
```

Output:

```text
reports/ar-after-legacy-normalization-reconcile.json
reports/ar-after-legacy-normalization-reconcile.md
```

## Quy trình chuẩn

1. Audit legacy detail.
2. Sinh normalization plan.
3. Dry-run apply.
4. Backup database.
5. Apply action high-confidence.
6. Chạy reconcile read-only.
7. Chạy rebuild read model thật.
8. Chạy reconcile chính thức.

## Lệnh

```bash
node scripts/audit-ar-legacy-contract-detail.js --markdown
node scripts/plan-ar-legacy-contract-normalization.js --dry-run --markdown
node scripts/apply-ar-legacy-contract-normalization.js
node scripts/reconcile-ar-after-legacy-normalization.js --markdown
```

Nếu đã backup và duyệt plan:

```bash
node scripts/apply-ar-legacy-contract-normalization.js --apply
node scripts/rebuild-ar-debt-read-model.js --dry-run --all
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --all
```

Nếu dry-run ổn:

```bash
node scripts/rebuild-ar-debt-read-model.js --all
node scripts/reconcile-ar-debt-after-rebuild.js --all
```

## Kết luận

Rebuild thật chỉ nên chạy sau khi Phase81 apply làm xuất hiện canonical AR ledgers. Nếu canonical count vẫn bằng 0 thì không rebuild thật vì màn công nợ vẫn sẽ rỗng.
