# R1.4a A8 — Final Verification Report

## Status
**PARTIAL_READY_FOR_REAL_REPLAN**.

Correctness gates pass; dependency-backed full certification is blocked by package-registry/network availability. Production apply was not performed.

## Key results
- Old REAL plan `41db128858fc09f17cce83416eac547aa0bea9f0c12dc24efd3145f83501f6a7`: **STALE_DO_NOT_APPLY**.
- v3 actual forensic predecessor: **v2**, while sourceOriginalVersion may remain 1.
- B004 production-shaped sequence: `23,800,085 -> 0 -> 85`; normalized final Debt New = 0.
- Events remain two identities: v2 credit 23,800,085; v3 debit 85.
- R1.4a core/safety: 11/11 PASS.
- Full split-brain family: 100/100 PASS.
- Runtime correction/event-delta locked files: byte-identical to input.
- `reconcileOrderDebt()` in correction runtime: 0.
- new correction `AR-DEBT-ADJUSTMENT` writers: 0.
- Syntax: 1,733 JS PASS.
- Source-size: same 7 baseline failures, 0 new.
- `check:source-bundles`: BLOCKED_ENV (`terser` unavailable).
- dependency install: BLOCKED_ENV (registry fetch EAI_AGAIN / bounded install unable to complete).
- full `npm test`: not certified as PASS; environment/baseline failures remain. Selected exact working-vs-input broader matrix is 43/50 on both, identical.
- No production data mutation.

## Full npm test comparison
Working and input each emit 216 normalized `not ok` names. Three apparent names differ because adding successful R1.4a test files shifts the fixed-size test runner chunks. Running those three apparent working-only failures directly on the untouched R1.4 baseline reproduces all three as missing-`mongoose` failures. Therefore there is no evidence of an R1.4a-caused failure in that delta; nevertheless full dependency-backed suite remains un-certified.

## Packaging contract
The source tree is clean and packaging gate is PASS. The final ZIP SHA256, sidecar verification, and independent extracted-package rerun are intentionally recorded in the external release manifest / packaged-verification artifact after the archive is finalized, avoiding a self-referential hash.
