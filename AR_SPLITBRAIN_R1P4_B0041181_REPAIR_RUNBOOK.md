# B0041181 Historical Correction Repair Runbook

## Purpose
This runbook is for a controlled, single-order forensic repair of a missing historical `DELIVERY_CLOSEOUT_CORRECTION` AR event. It is **not** a normal UI correction workflow.

## Preconditions
- Use the R1.4 package in an environment with the normal application DB configuration.
- First run READ-ONLY commands.
- Review the actual immutable correction/version rows, detector classification, expected missing event delta, event identity, current AR evidence and plan hashes.
- For B0041181 specifically, do not continue unless the real DB evidence deterministically reconstructs the historical transition and its event delta. The production-shaped fixture's `-23,800,000` is not authorization by itself.
- If an existing exact correction event is found but Debt New is still wrong, STOP; do not post a second event.

## Step 1 — Read-only audit
```bash
node scripts/audit-historical-missing-correction-events.js --order-code B0041181 --json
```
Expected safe candidate classification, if the real immutable evidence supports it:
`MISSING_EVENT_SAFE_TO_PLAN`.

STOP on `AMBIGUOUS_TIMELINE`, `DATA_CONFLICT`, `DUPLICATE_EXISTING_EVENT` or `EVENT_AMOUNT_MISMATCH`.

## Step 2 — Generate immutable read-only plan
```bash
node scripts/plan-historical-correction-repair.js --order-code B0041181 --output ./AR_SPLITBRAIN_R1P4_B0041181_REAL_REPAIR_PLAN.json
```
Record and independently review:
- `planHash`
- `planItemHash`
- `fromVersion/toVersion`
- `previousFinancialState/correctedFinancialState`
- `expectedMissingEventDelta`
- canonical category/source/ref/idempotency identity
- current AR evidence and subsequent-event summary.

For the reported B0041181 situation, `-23,800,000` is acceptable **only if the real immutable rows prove it**.

## Step 3 — Non-mutating executor validation
This command reads the plan only and does not connect/write because `--apply` is absent:
```bash
node scripts/apply-historical-correction-repair.js --plan ./AR_SPLITBRAIN_R1P4_B0041181_REAL_REPAIR_PLAN.json
```
It must report `DRY_RUN_ONLY`, `mutation:false`, and a valid plan hash.

## Step 4 — Guarded apply template (DO NOT run until approved)
```bash
node scripts/apply-historical-correction-repair.js   --plan ./AR_SPLITBRAIN_R1P4_B0041181_REAL_REPAIR_PLAN.json   --order-code B0041181   --plan-hash <REVIEWED_PLAN_HASH>   --plan-item-hash <REVIEWED_ITEM_HASH>   --actor <OPERATOR_ID>   --apply
```

The executor re-reads immutable source evidence within the transaction, recomputes the historical event delta, verifies it remains missing, posts the canonical `AR-ADJUSTMENT / DELIVERY_CLOSEOUT_CORRECTION` event, reads AR again, and requires raw `AR_after = AR_before + historicalMissingEventDelta` before commit.

## Rollback behavior
Any mismatch/changed evidence/duplicate/amount mismatch/hash mismatch/posting error/read-after-write invariant error throws and rolls back the transaction. Do not manually edit existing ledgers to force the plan through.

## Critical warning
The included `AR_SPLITBRAIN_R1P4_B0041181_FIXTURE_REPAIR_PLAN.json` is fixture evidence only. Never use that file for production apply.
