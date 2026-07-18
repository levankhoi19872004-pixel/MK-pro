# Phase260C-R1 Stop The Bleeding Report

## Baseline Completeness

Repository is complete for this checkpoint: `src`, `public`, `scripts`, `test`, `docs`, models, generated bundles and OpenAPI are present. `package.json` was read and real scripts are available for syntax, tests, source bundles and docs.

Working tree already contains Phase260B-R1 changes from the previous checkpoint, so no separate git commit was created for R1 to avoid mixing unrelated staged history.

## Root Cause

For post-closeout return correction, `DeliveryCloseoutCorrectionService` calculated a closeout final-state and then called `ArDebtAdjustmentPostingService.postAdjustment()` with `reconcileDebt: true`.

That delegated to `OrderPaymentDebtReconcileService`, which compares:

`expectedDebtAmount(final-state closeout) - currentArBalance`

For B0039602, after a confirmed receipt had already cleared the original receivable, this could recreate debt from the closeout snapshot:

`7,788,690 - 92,211 = 7,696,479`

That produced an incorrect Debit instead of the correct return event Credit.

## R1 Fix

R1 keeps closeout/version snapshots for audit compatibility, but the AR-DEBT-ADJUSTMENT financial effect is now event-delta only:

`debtDelta = receivableDelta - cashDelta - bankDelta - rewardDelta - returnDelta`

For B0039602:

- `returnDelta = 92,211`
- `debtDelta = -92,211`
- Ledger: `Debit = 0`, `Credit = 92,211`

The correction writer no longer calls final-state reconcile for this path.

## Files Changed In R1

- `src/domain/accounting/correctionDebtDelta.js`: pure domain delta formula and guards.
- `src/services/deliveryCloseoutCorrection.service.js`: closeout correction posts AR adjustment by event delta only.
- `src/services/accounting/ArDebtAdjustmentPostingService.js`: metadata policy, idempotency payload mismatch guard, local idempotency lock.
- `test/phase260c-r1-stop-the-bleeding.test.js`: delta/direction/idempotency/B0039602 regression.
- `PHASE260C_R1_WRITER_OWNERSHIP_AUDIT.json`: writer inventory and single-writer decision.

## Guardrails

- Return increase cannot create Debit.
- Return-only correction must map to `debtDelta = -returnDelta`.
- Zero delta creates no ledger.
- Same idempotency key with different Debit/Credit throws `IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Replay/concurrent same event creates one financial effect in-process; Mongo upsert remains the DB-level guard.

## Test

- `node --test test/phase260c-r1-stop-the-bleeding.test.js`: PASS, 6 tests.
- `node --check` for changed R1 JavaScript files: PASS.

## R1 Gate

R1 is code-complete. Production data repair is not executed in R1; it belongs to R2 controlled audit and repair.
