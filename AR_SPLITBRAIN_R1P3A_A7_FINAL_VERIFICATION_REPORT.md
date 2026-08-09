# R1P3A A7 — Final Verification Report

## Verdict

**PARTIAL** — all R1.3a correctness requirements PASS; dependency-backed full engineering verification remains BLOCKED_ENV.

## Input

- ZIP: `MK-pro-closeout-ar-splitbrain-r1p3-final-hardening-fixed.zip`
- SHA256: `56eaf3beb76b81d440055412af786f2d960f3f15b293db0612503f8cc38ee65d`

## Correctness

- Direct baseline RED: **FAIL as expected**, R1.3 classified the 2000/1500 divergence as `no_mismatch` and `RETURN_AR_ALIGNED`.
- R1.3a RED→GREEN: PASS.
- Return amount cases A-I: **10/10 PASS**.
- R1.3 lifecycle + R1.3a: **11/11 PASS**.
- Full split-brain family: **69/69 PASS**.
- Broader selected financial/return tests: **180 assertions PASS**, 2 files BLOCKED_ENV due missing mongoose, 0 assertion failures.
- Historical dry-run: aligned case remains `no_mismatch`; conflict cases become `data_corruption` with explicit source-field evidence.
- B0041181 regressions remain PASS within the split-brain family.
- Confirmed receipt preservation remains PASS.
- Runtime correction final-state reconcile calls remain 0.
- Runtime correction AR-DEBT-ADJUSTMENT writer count remains 0.
- Runtime return double-count remains 0.
- Production runtime files changed by R1.3a: **0**.

## Engineering gates

- `npm ci --ignore-scripts`: BLOCKED_ENV — registry 404 for `zip-stream@4.1.1`.
- `npm run check:syntax`: PASS — **1718 JavaScript files**.
- `npm run check:source-size`: BASELINE_DEBT — same 7 files as R1.3 input.
- `npm run check:source-bundles`: BLOCKED_ENV — `terser` unavailable.
- `npm test`: exit 1 / BLOCKED_ENV+baseline debt. Normalized comparison against a clean R1.3 input extraction: current failure names 219, baseline 220, **new failure names 0**, resolved baseline names 1.

## Release status

Per R1.3a policy, all correctness gates PASS but dependency-backed regression/build is blocked by the environment, therefore the maximum valid status is **PARTIAL**.
