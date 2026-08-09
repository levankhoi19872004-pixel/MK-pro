# AR Split-brain R1.2 — Final Verification

## Verdict
**PARTIAL** — all R1.2 correctness gates PASS; dependency-backed full regression/build remains `BLOCKED_ENV`.

## Input
- ZIP: `MK-pro-closeout-ar-splitbrain-r1p1-hardening-fixed.zip`
- SHA256: `27a407a948aaecf5169e9fdfbeae5cc7dcc90e84d9b289798eafec18e04bb315`

## R1.2 RED -> GREEN
1. Historical audit duplicate ingestion: RED counted the same persisted correction ledger twice; GREEN stable-identity dedupe counts one.
2. Debt New B0041181 suggestion: after identity ownership was corrected, RED exposed normalized `debt=0` with raw `remainingDebt=85`; GREEN list/order/remaining/suggestion all return 0.
3. Correction business identity: RED resolved generic correction ref as `return`; GREEN resolves `sourceKind=correction` and ownership is not RETURN_REDUCTION.
4. Additional G10 audit RED: confirmed AR-RETURN after snapshot changed from `ambiguous` to `explained_by_subsequent_events`.

## Financial correctness
- Core financial suite: **118/118 PASS**.
- R1.2 packaged candidate re-check: **13/13 PASS**.
- B0041181 list debt: 0.
- B0041181 suggestion debt: 0.
- B0041181 remaining debt: 0.
- Confirmed receipt preservation: PASS.
- Return double-count: 0.
- Partial transaction commit: 0 in covered regression tests.
- Duplicate retry effect: 0 in covered regression tests.
- Correction runtime final-state reconcile calls: 0.
- Correction runtime active AR-DEBT-ADJUSTMENT writers: 0.

## Historical audit
Stable identity dedupe is applied before timeline classification. Dedupe never uses amount/category. Classification fixtures PASS for `no_mismatch`, `true_splitbrain`, `explained_by_subsequent_events`, `data_corruption`, and `ambiguous`. Audit remains read-only, dry-run, bounded, and has no update/delete/repair path.

## Regression / environment
- `npm ci --ignore-scripts`: BLOCKED_ENV, registry 404 for `zip-stream@4.1.1`.
- Full `npm test`: exit 1; R1.2 vs R1.1 normalized comparison shows **0 new failure names** and 2 baseline failure names removed. This is not claimed as full-suite PASS.
- Broader targeted file run: 38 PASS, 12 BLOCKED_ENV, 1 baseline static FAIL reproduced unchanged on R1.1.
- `npm run check:syntax`: **1714 JavaScript files PASS**.
- `npm run check:source-bundles`: BLOCKED_ENV (`terser` unavailable).
- `npm run check:source-size`: baseline FAIL unchanged; the same seven over-budget files fail on input R1.1.
- lint/typecheck scripts: not configured.

## Packaging
A clean candidate package was zip/unzipped independently: 13/13 R1.2 tests PASS, 1714 JS syntax PASS, forbidden packaged files = 0. The final ZIP is rebuilt from the same clean stage plus release reports. Final SHA256 is intentionally recorded in the external `.sha256` sidecar and release manifest to avoid self-referential ZIP hashing.

## Production data
`production_data_modified=false`. No ledger repair/backfill was executed.
