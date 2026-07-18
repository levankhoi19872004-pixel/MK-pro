# Phase260C-R2 Controlled Audit And Repair Report

## Scope

R2 adds controlled audit, plan and apply tooling for wrong legacy `AR-DEBT-ADJUSTMENT` rows created by post-closeout delivery correction.

No production mutation was executed.

## Scripts

- `scripts/phase260c/audit-post-closeout-debt-correction.js`
- `scripts/phase260c/plan-post-closeout-debt-repair.js`
- `scripts/phase260c/apply-post-closeout-debt-repair.js`

## Audit Policy

The audit scans active `AR-DEBT-ADJUSTMENT` rows with `sourceType = DELIVERY_CLOSEOUT_CORRECTION`, loads the correction source, computes expected event delta, and compares it with actual `debit - credit`.

Classifications include:

- `CORRECT_DELTA`
- `DEBT_RECREATED_AFTER_PAYMENT`
- `RETURN_INCREASE_POSTED_AS_DEBIT`
- `FINAL_STATE_RECONSTRUCTION`
- `ALREADY_REVERSED`
- `ALREADY_REPAIRED`
- `BUSINESS_EVIDENCE_INCOMPLETE`

## Repair Policy

The apply mechanism never hard-deletes and does not update confirmed ledger amounts. For auto-applicable rows it creates:

1. Controlled reversal AR-DEBT-ADJUSTMENT with opposite debit/credit from the wrong ledger.
2. Correct AR-DEBT-ADJUSTMENT event delta entry.

Apply is blocked unless all conditions are present:

- `--apply`
- `PHASE260C_REPAIR_ENABLE=YES`
- `--confirm-token=PHASE260C_APPLY`

Default execution is dry-run.

## B0039602 Fixture

Fixture test verifies:

- Wrong ledger: `Debit 7,696,479`
- Expected event delta: `Credit 92,211`
- Classification: `DEBT_RECREATED_AFTER_PAYMENT`
- Repair plan: reversal `Credit 7,696,479`, correct delta `Credit 92,211`

## Production Audit Status

Production MongoDB audit was not executed because Atlas rejected the connection from the current IP. Artifact status is:

`AUDIT_NOT_EXECUTED`

This is not a production PASS and not evidence that scanned rows are clean.

## Test

- `node --test test/phase260c-r2-controlled-repair.test.js`: PASS, 5 tests.
- R2 script `node --check`: PASS.
- `node scripts/phase260c/apply-post-closeout-debt-repair.js`: dry-run only, 0 results because audit was not executed.
