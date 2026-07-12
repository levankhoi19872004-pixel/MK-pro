# Phase247 — Deployment Artifact Integrity & Runtime Verification

## 1. Executive summary

Phase247 fixes the release-artifact defect found after Phase246 and adds executable runtime-state verification for Delivery Today closeout.

The input Phase246 ZIP was objectively flattened: it contained 2,004 entries at archive root, no `src/`, `public/`, `test/`, or `scripts/` tree, and repeated exact root entry names. This was a packaging failure, not a Phase246 business-logic failure.

The Phase247 artifact is rebuilt from the preserved project source tree, overlays the verified Phase246 changes, and is packaged with relative paths intact.

## 2. Root cause — ZIP flatten

The original artifact was created from basenames instead of repository-relative paths. Evidence from the new verifier:

- required source directories absent;
- about 1,510 source-like files at ZIP root;
- repeated exact entries such as `app.js`, `index.js`, `README.md`, and source fragment names;
- extraction could overwrite colliding files.

The existing `verify-source-artifact-clean.js` only checked forbidden files and secrets. It did not enforce source-tree integrity, required directories, duplicate paths, or extraction smoke testing.

## 3. Build pipeline before/after

### Before

```text
collect files
→ write basename-only ZIP entries
→ count entries
→ artifact-clean reports OK
```

### After

```text
repository root
→ recursive ZIP preserving relative paths
→ exclude secrets/runtime/build caches
→ inspect exact ZIP entries
→ reject duplicate path/root flatten
→ extract to temporary directory
→ verify src/public/test/scripts/package files
→ release artifact
```

## 4. Artifact governance added

Added:

- `scripts/create-deployment-artifact.js`
- `scripts/verify-deployment-artifact.js`
- `test/phase247-deployment-artifact-integrity.test.js`

The verifier checks:

- exact duplicate ZIP entries;
- missing `package.json` or `package-lock.json`;
- missing `src/`, `public/`, `test/`, or `scripts/`;
- root flatten signatures;
- unsafe paths;
- forbidden `.git`, `node_modules`, coverage, logs, caches and secrets;
- real extraction smoke test.

The original Phase246 flattened ZIP now fails the verifier. The rebuilt Phase247 ZIP passes it.

## 5. Runtime closeout verification

Added `test/phase247-closeout-runtime-verification.test.js` with an executable state harness based on the actual Phase246 selectors.

Verified cases:

1. Eligible selected order enables the action, submits exactly that order, reloads, and becomes closed.
2. Rejected selected order keeps the action disabled and performs no API call.
3. Mixed selection submits only eligible orders.
4. Reload changing eligibility recomputes toolbar, button, and payload without stale state.

Result: 4/4 runtime state tests pass.

## 6. Mongo persistence verification

Added a read-only operational verifier:

```text
scripts/verify-phase247-mongo-persistence.js
```

It reads, but never writes:

- SalesOrder accounting state;
- OrderPaymentAllocation rows;
- AR ledger rows;
- Fund ledger rows;
- related idempotency keys.

A live Mongo verification was not executed in this build environment because no production/staging Mongo URI and target order were provided. This limitation is explicit; no production persistence result is fabricated.

Usage:

```bash
npm run verify:phase247:mongo -- --mongo-uri "<URI>" --order-code "B0039299"
```

## 7. Regression evidence

Passed:

```text
Phase247 artifact tests: 3/3
Phase247 runtime tests: 4/4
Phase246 closeout state tests: 5/5
Source bundles pretest: 19/19 OK
```

A full `npm test` run was started and progressed through the repository suite without an observed failure, but exceeded the execution window of this environment before completion. Therefore this report does not falsely claim a complete local full-suite pass. The previously supplied Phase246/245 full-suite evidence remains separate from this Phase247 verification.

## 8. Files changed

- `package.json`
- `scripts/create-deployment-artifact.js`
- `scripts/verify-deployment-artifact.js`
- `scripts/verify-phase247-mongo-persistence.js`
- `test/phase247-deployment-artifact-integrity.test.js`
- `test/phase247-closeout-runtime-verification.test.js`
- `PHASE247_DEPLOYMENT_ARTIFACT_INTEGRITY_RUNTIME_VERIFICATION_REPORT.md`

Phase246 frontend/backend business logic was not changed.

## 9. Scope and invariants

Not changed:

- AR/Fund/Inventory/Return writers;
- Mongo transaction boundary;
- accounting/debt formulas;
- closeout eligibility algorithm;
- Phase242C–246 persistence and UI-state logic;
- UI layout.

## 10. Production checklist

1. Extract the artifact and confirm `src/`, `public/`, `test/`, `scripts/`, `package.json`, and `package-lock.json`.
2. Run `npm ci` and `npm test` in the deployment environment.
3. Verify a rejected B0039299-like row: selected 1, eligible 0, disabled action, no POST.
4. Verify one eligible closeout and reload.
5. Run the read-only Mongo verifier for the closed order.
6. Check SalesOrder, allocation, AR, Fund, and Debt New.
7. Retry and confirm no duplicate idempotency keys.

## 11. Completion status

- ZIP source tree preserved: PASS
- Root flatten blocked: PASS
- Duplicate exact entries blocked: PASS
- Required files/directories verified after extraction: PASS
- Runtime UI-state cases A–D: PASS
- Business code unchanged: PASS
- Live Mongo verification: PENDING credentials/order code
- Full npm test in this environment: INCOMPLETE due execution timeout
