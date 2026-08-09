# R1.1 Final Verification Report

## Release verdict
**PARTIAL** — all R1.1 P0/P1 correctness gates that can be executed without external dependencies PASS. Dependency-backed full regression/build remains BLOCKED_ENV.

## Input
- `MK-pro-closeout-ar-splitbrain-r1-event-delta-fixed(2).zip`
- SHA256 `ce88fdc0176c45333bc5bac81441febb9bac1eb6d3871b83e92a684e414a4bb6`

## Root hardening findings fixed
1. Historical audit substring identity collision (`DCOC-1` vs `DCOC-10`).
2. `AR-ADJUSTMENT` semantic was category-only instead of provenance-aware.
3. Actual `DebtNewService.listCustomers()` returned B0041181 debt `85` rather than normalized `0`.
4. Historical matcher initially failed to recover canonical version when direct correction refs coexisted with structured idempotency identity; detected during dry-run and fixed RED->GREEN.

## Financial invariants
- B0041181 Debt New: 0 — PASS.
- Confirmed receipt preservation: PASS.
- Correction final-state reconcile runtime calls: 0 — PASS.
- New correction `AR-DEBT-ADJUSTMENT` writers: 0 — PASS.
- Return double-count: 0 — PASS.
- Transaction partial commit: 0 in R1 matrix — PASS.
- Duplicate retry effect: 0 — PASS.
- Semantic role: `CORRECTION_DELTA` — PASS.
- Historical substring matching: false — PASS.

## Historical audit v2
Read-only/dry-run; canonical AR eligibility and payment-state resolver are reused; exact identity only; bounded default `limit=20000`, `batchSize=250`.
Fixture outcomes:
- confirmed receipt => `explained_by_subsequent_events`;
- B0041181 pre-event => `true_splitbrain`;
- B0041181 after R1 event (raw 85) => `no_mismatch` under ±1,000.

## Performance/query review
- No GET Delivery Today production source changed in R1.1.
- Debt New production change adds in-memory normalization only; no new query/aggregate and no N+1.
- Audit tool uses bounded batches and shared readers/resolvers; no unbounded per-order full collection scan.
- R1 correction read-before/write/read-after invariant was preserved; correctness read was not removed for micro-optimization.

## Environment limitation
`npm ci --ignore-scripts` is blocked by environment registry 404 for `zip-stream@4.1.1`. `terser`/`mongoose` and other packages therefore remain unavailable. Full-suite/build cannot be certified and release cannot be marked READY.
