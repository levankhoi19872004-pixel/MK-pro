# PERF-A5R1 Independent Recheck Report

Generated: `2026-08-06T16:39:06+07:00`

## Final decision

**`BLOCKED_ENGINEERING`**

The release candidate R1 preserves the prior E1/E2 financial correctness evidence, but it does not satisfy the PERF-A5R1 remediation gate. Independent rechecking found failures in telemetry integrity, real report cancellation propagation, release manifest integrity, and artifact packaging completeness.

## Input

- File: `MK-pro-performance-release-candidate-r1(1).zip`
- SHA-256: `7cc8882d4a802b0aa580cc752b2c10a08936ff86a001f6ddfa4510fc6f584a1e`
- ZIP entries: 2,309
- Uncompressed size: 20,196,404 bytes
- Unsafe ZIP paths: 0
- Nested ZIP files: 0
- `.env`, private keys, database dumps: not detected
- `node_modules`: not included

## Independent verification

| Check | Result |
|---|---|
| Performance regression | 158/158 PASS |
| JavaScript syntax | 1,659/1,659 PASS |
| Package-lock registry | PASS |
| Source bundle check | NOT_RUN_ENVIRONMENT — missing `terser` |
| Artifact-clean script | NOT_RUN_ENVIRONMENT — missing `jszip` |
| Source-size quality gate | FAIL |
| Path-portability quality gate | FAIL |
| Release-manifest check | FAIL — stale source SHA/file count |

## P0 findings

### P0-1 — Real report cancellation is not wired

`ReportExecutionPolicy.runBounded()` passes an `AbortSignal` to `descriptor.run(signal)`, but the real report descriptors use `run: () => service(...)` and ignore that argument.

Affected orchestration includes:

- `ReportCenterService.runLegacyDataQuality`
- `DataQualitySnapshotService`
- `DashboardReportService`

The report services and Mongo queries do not receive the signal or `maxTimeMS`. Only `fundLedgerRepository` contains a `maxTimeMS` option path.

The existing GREEN test uses a fake task that explicitly listens to the signal. It does not prove cancellation of the real report call graph.

**Impact:** HTTP timeout can still wait indefinitely for non-cooperative work, or underlying Mongo/report work can continue until it completes naturally. The cancellation requirement is not satisfied.

### P0-2 — Telemetry OFF does not stop the new measurement store

With:

```text
PERF_TELEMETRY_ENABLED=0
```

`performanceMeasurementStore.beginMeasurement()` and `completeMeasurement()` still add records. `apiMonitor.shouldMeasure()` does not check this flag.

Independent result:

```json
{"enabledEnv":"0","recordCount":1,"exportCount":1}
```

This contradicts the rollback runbook, which says setting the flag to 0 disables telemetry.

### P0-3 — Closed sample windows still accept new measurements

`closeWindow()` records `closedAt`, but leaves the closed window as `activeWindow`. Requests beginning after close continue to receive the closed window ID.

Independent result:

```json
{"closedWindowExportCountAfterNewRequest":1,"recordEndpoint":"/api/after-close"}
```

**Impact:** baseline/canary exports can be contaminated after the window is closed.

### P0-4 — Release integrity manifests do not match the ZIP

- Actual extracted file count: **2,309**
- `PERF_A5R1_RELEASE_MANIFEST.json` file count: **2,308**
- Actual full tree SHA-256: `caab2a5a8a466eef80a1f83c6eb618f5e6b670c74967c76894c53b8b2c3bae3c`
- Manifest tree SHA-256: `7ad8e40ea0250e06e99092c7d24ed281bf316e42a4112230048b07303dbde0eb`

The repository release check also fails:

```text
RELEASE_MANIFEST_STALE: sourceSha256, sourceFileCount
```

Therefore the delivered source cannot be verified against its own release manifests.

### P0-5 — Artifact completeness report references files not packaged

`PERF_A5R1_ARTIFACT_COMPLETENESS.json` lists 78 artifacts, but only 53 are present at the ZIP root. Twenty-five listed files point to external `/mnt/data/perf_*_final/...` paths and are absent from the delivered ZIP.

Missing packaged evidence includes:

- Four A1A artifacts other than the requirement matrix
- `PERF_A3A_MANIFEST.json`
- A3A parity/pagination/logical-work artifacts at canonical paths
- PERF-A6 verification artifacts
- Several phase ZIP SHA files

The artifact report is an inventory of files that existed in the previous workspace, not proof that they were packaged into this release.

## P1 findings

### P1-1 — Quality commands fail

`npm run check:source-size` fails for seven oversized files.

`npm run check:path-portability` reports eight unresolved local requires.

These may include legacy/pre-existing issues, but the release does not pass the repository's declared quality gates.

### P1-2 — Telemetry release metadata may be `unknown`

Release metadata defaults to `unknown` if `RELEASE_SHA`, `RENDER_GIT_COMMIT`, or related variables are missing. The runbook asks operators to set them, but the sample-window start path does not reject invalid release metadata.

A6 evidence can therefore still be collected without a usable release identity.

### P1-3 — Batch-context CPU remediation is partial

Reverse indexes were added for versions, returns, allocations, idempotency rows, and corrections. However:

- order resolution still filters all batch orders once per target;
- `inspectionForOrder()` still filters three AR arrays once per order.

The improvement is real but the claim that per-order history scans were fully replaced is too broad.

## P2 / accepted limitations

- Inventory, Delivery, and Return previews remain `JS_MATERIALIZED_BLOCKED`.
- Their optimized paths are OFF by default through an empty per-report allowlist.
- Dashboard cache remains process-local.
- Production p95, physical Mongo query counts, unique AR index application, and E3 correctness remain pending.

These limitations are acceptable only after the P0 gate failures are fixed.

## Strengths preserved

- ZIP safety/integrity at container level is good.
- 158 performance tests pass.
- 1,659 JavaScript files pass syntax.
- Financial E1/E2 evidence remains unchanged:
  - debt deviation 0;
  - application duplicate ledger tests 0;
  - return parity 100%;
  - allocation parity 100%.
- Optimization flags remain OFF by default.
- Bulk concurrency remains 1.
- Per-report pagination allowlist defaults to empty.
- Batch reverse indexes reduce part of the O(N×M) work.

## Required R2 remediation

1. Pass `signal` and `maxTimeMS` through every real report descriptor, service, repository, and Mongo query path covered by `runBounded()`.
2. Add integration tests using the real report orchestration with controllable repositories, not only a fake direct task.
3. Make `PERF_TELEMETRY_ENABLED=0` prevent creation/storage/export of new measurements.
4. After `closeWindow()`, reject or route new measurements outside the closed window.
5. Reject starting a production capture window when release SHA is `unknown`.
6. Regenerate `RELEASE_MANIFEST.json` and `PERF_A5R1_RELEASE_MANIFEST.json` after all files are finalized.
7. Package the actual A1A/A3A/A6 evidence files, or mark them missing; do not reference external workspace paths as packaged artifacts.
8. Add a release self-verification script that extracts the final ZIP and checks file count, hashes, mandatory artifacts, and manifest consistency.
9. Resolve or formally baseline-waive source-size and path-portability failures with explicit evidence.
10. Re-run the complete regression and package as a new R2 ZIP.

## Gate status

```text
ZIP_SAFETY: PASS
PERFORMANCE_TESTS: PASS
SYNTAX: PASS
FINANCIAL_E1_E2: PASS
REPORT_CANCELLATION: FAIL
TELEMETRY_INTEGRITY: FAIL
ARTIFACT_TRACEABILITY: FAIL
RELEASE_MANIFEST_INTEGRITY: FAIL
QUALITY_GATES: FAIL/PARTIAL
PRODUCTION_E3: PENDING
FINAL: BLOCKED_ENGINEERING
```
