# R1.1 GREEN Integration Evidence

## Core targeted matrix
Final core command: 26 tests, 26 PASS, 0 FAIL.
Includes R1 event-delta, B0041181, confirmed receipt preservation, transaction rollback, read-after-write invariant, idempotency, source-aware semantic, exact identity, historical timeline audit, and actual Debt New public path.

## Broader regression batch
53 discovered:
- 49 executable tests PASS.
- 4 test files BLOCKED_ENV because `mongoose` is unavailable.
- 0 assertion regression among the runnable tests.

## Syntax
`npm run check:syntax` => `SYNTAX_OK 1709 JavaScript files` (exit 0).

## Full regression comparison
`npm test` exits 1 in both input R1 and R1.1 because dependencies are absent plus pre-existing baseline failures.
Normalized failing-name comparison:
- R1.1 new failure names vs input R1: **0**.
- One baseline failure name is absent in R1.1.
This comparison is regression evidence only; it is **not** a claim that full suite passed.

## Dependency/build block
`npm ci --ignore-scripts` => exit 1, registry 404 for `zip-stream@4.1.1` via environment gateway.
`npm run check:source-bundles` => BLOCKED_ENV (`Cannot find module 'terser'`).
No package version was changed.
