# PHASE259C Filter/KPI Scope Governance Report

## Governance Added

- New contract: `docs/contracts/filter-kpi-scope-governance.md`.
- Global rules now reference the new contract and audit script.
- New audit guard: `scripts/audit-filter-kpi-scope.js`.
- New core: `scripts/lib/filterKpiScopeAuditCore.js`.
- New targeted tests: `test/phase259-filter-kpi-scope-governance.test.js`.

## Audit Output

Latest audit command:

```bash
node scripts/audit-filter-kpi-scope.js --json
```

Result:

- scanned files: 769
- findings: 15
- P1 review required: 14
- P2 allowed/review: 1

The unresolved findings are candidates, not automatic bugs. They require active-runtime confirmation before migration.

## Quality Gate

Passed:

- `node --test test/phase259-filter-kpi-scope-governance.test.js`
- `node --test test/return-order-filter-redesign-regression.test.js test/return-order-list-popup-regression.test.js`
- `npm run check:syntax`
- `npm run check:source-bundles`
- `npm run check:source-size`
- `npm run docs:check`

Failed with unrelated/baseline failures:

- `npm test`

The first full run exposed a Return Orders test timeout from direct `ReturnOrder.aggregate()` bypassing repository mocks. That was fixed by preserving the repository-mock fallback, and the targeted Return Orders tests now pass. Remaining full-suite failures observed were outside this phase boundary: app trust proxy static, sales-order delete/cancel legacy tests, source-artifact-clean verifier and unrelated baseline-style failures.

## Release Boundary

Changed only read/query/summary/pagination/scope governance, docs/tests/audit and frontend KPI wiring. No SSoT writer logic was changed.
