# R1.1 RED -> GREEN Evidence

## RED-001 — Historical exact identity
**Before:** `DCOC-1` incorrectly matched `DCOC-10` through substring `idempotencyKey.includes(...)`.
- BEFORE: FAIL (`true !== false`).
- AFTER: PASS using structured canonical key parsing + exact business-event identity.

## RED-002 — Source-aware semantic role
**Before:** `AR-ADJUSTMENT + DELIVERY_CLOSEOUT_CORRECTION` resolved to `MANUAL_ADJUSTMENT`.
- BEFORE: FAIL (`MANUAL_ADJUSTMENT !== CORRECTION_DELTA`).
- AFTER: PASS: correction provenance => `CORRECTION_DELTA`; manual/admin provenance stays `MANUAL_ADJUSTMENT`.

## RED-003 — Actual Debt New public path
The new E2E harness loads the actual correction event writer, actual `arPosting.service`, actual `arLedgerRead.service`, and actual `DebtNewService.listCustomers()`; only persistence/search dependency boundaries are faked.
- R1 baseline BEFORE: B0041181 returned `85`; expected `0` => FAIL (`85 !== 0`).
- R1.1 AFTER: B0041181 customer/order projection returns debt `0` under Debt Zero Tolerance ±1,000.
- Confirmed receipt scenario remains `10,000,000 - 4,000,000 - 2,000,000 = 4,000,000`.

## Additional RED — audit identity version recovery
Historical R1 ledgers keep closeout/correction version in the structured idempotency key / `metadata.closeoutVersion`. The first R1.1 matcher stopped enriching identity when direct correction refs existed.
- BEFORE: FAIL for direct `correctionId` + structured `...:v2` against correction version 2.
- AFTER: PASS; direct refs remain authoritative while missing version is recovered exactly from canonical structured identity.

## Evidence files generated during execution
- `/mnt/data/R1P1_RED_identity_before.txt`
- `/mnt/data/R1P1_RED_semantic_before.txt`
- `/mnt/data/R1P1_RED_debtnew_before.txt`
- `/mnt/data/R1P1_RED_identity_version_before.txt`
- `/mnt/data/R1P1_GREEN_identity_version_after.txt`
