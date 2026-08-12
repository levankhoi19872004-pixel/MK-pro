# A10 — R1.4 Final Verification Report

## Verdict
Repair engine correctness gates PASS in fixture/isolated persistence. Full dependency-backed regression is BLOCKED_ENV. Actual B0041181 production apply eligibility is additionally BLOCKED until the read-only DB dry-run proves its real immutable historical predecessor/version evidence.

## Core invariants
- Current no-op UI correction auto-repairs historical AR: **false**.
- Historical missing event can be detected: **true**.
- Missing delta is derived from immutable historical event transition: **true**.
- Repair uses target debt minus current AR: **false**.
- Fixture B004 missing event delta: **-23,800,000**.
- Fixture B004 AR after: **85 raw / 0 normalized**.
- Confirmed receipt preservation: **PASS**.
- Subsequent AR-RETURN preservation: **PASS**.
- Return-only transition generic repair: **disabled**.
- Existing exact event retry: **idempotent**.
- Duplicate/mismatch/ambiguous evidence: **fail closed**.
- Transaction/read-after-write rollback: **PASS**.
- Normal correction final-state reconcile calls introduced by R1.4: **0**.
- Normal correction AR-DEBT-ADJUSTMENT writers introduced: **0**.

## New R1.4 provenance RED
R1.4 discovered that actual `returnArPostingService` output could fail canonical Debt New projection. A minimal writer/read-policy compatibility fix was RED→GREEN verified. No return amount/identity/ownership algorithm was changed.

## Regression
- all `test/ar-splitbrain*.test.js`: 89/89 assertions PASS.
- broader selected financial/return matrix: 73 PASS, 0 assertion FAIL, 2 files blocked by missing dependency.
- full `npm test`: exit 1 in both R1.4 and input baseline; normalized new failure names = 0, resolved baseline names = 3.
- syntax: 1,730 JS PASS.
- source size: same 7 pre-existing baseline budget failures.
- `npm ci`: BLOCKED_ENV by internal registry 404 for `zip-stream@4.1.1`.
- source bundle check: BLOCKED_ENV because `terser` cannot be installed.

## Production safety
No production credentials were used. No apply command was run against production. The fixture plan is not a production repair plan.
