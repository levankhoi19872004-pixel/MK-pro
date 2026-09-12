# QA / Forensic Suite — Build Verification 2026-09-12

## Added

- `scripts/qa-forensic-suite.js`: unified QA runner with `quick`, `core`, `forensic`, `full` profiles.
- `scripts/lib/qaForensicSuite.js`: plan, subprocess runner, release-gate policy and JSON/Markdown reporting.
- `scripts/qa-db-forensics.js`: read-only MongoDB forensic checks.
- `test/qa-forensic-suite.test.js`: self-tests for the new runner.
- `docs/QA_FORENSIC_SUITE.md`: operator/CI documentation.
- npm commands: `qa`, `qa:quick`, `qa:core`, `qa:forensic`, `qa:forensic:require-db`, `qa:full`, `qa:db`.

## Verification result

### Suite self-tests

`node --test test/qa-forensic-suite.test.js`

- 9 tests passed.
- 0 tests failed.

### Quick profile

`npm run qa:quick`

- JavaScript syntax: PASS.
- 4 critical business contract files: PASS.
- Release gate: PASS.

### Core profile observations

The uploaded source archive does not contain installed npm dependencies, and dependency installation could not be completed in the build environment. Therefore dependency-backed critical tests were not executed here. The gate correctly reports this as a blocking preflight failure instead of producing a false green result.

The dependency-free architecture checks did execute and found:

1. **P0 `DIRECT_AR_LEDGER_READ`** in `src/services/accounting/closeout/CloseoutArBatchPostingService.js` around line 36: runtime code reads `ArLedger.find(...)` directly instead of the canonical AR read service/read model.
2. **7 source-size budget warnings** currently exist. These are deliberately advisory in the new QA suite and do not by themselves block release.

## Database verification

No production/test MongoDB URI was supplied during this build, so no live database was accessed. The new forensic phase is intentionally read-only and should preferably run with a dedicated MongoDB read-only account through `QA_MONGO_URI`.
