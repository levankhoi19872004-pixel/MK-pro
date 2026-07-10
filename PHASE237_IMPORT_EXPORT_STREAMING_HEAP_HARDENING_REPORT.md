# PHASE237_IMPORT_EXPORT_STREAMING_HEAP_HARDENING_REPORT

## A. Executive summary

Phase237 hardens the pilot import/export memory path without changing ERP business behavior, Mongo schema, package metadata, financial/inventory writers, or report/export modules outside the approved pilot.

Pilot scope implemented:

- Import preview persistence: reduce duplicate row-document materialization by building Mongo insert docs per bounded batch.
- Import preview runner: avoid spread-pushing large row arrays and avoid repeated per-file scans in final file summary.
- Export pilot: `IMPORT_PREVIEW` workbook export now writes an Excel workbook to a temp file with `ExcelJS.stream.xlsx.WorkbookWriter`, then streams/sends the file and unlinks it after response completion.
- Validation: targeted Phase237 tests, import/export regression tests, full syntax/source/bundle checks, full `npm test`, `git diff --check`, fixture memory benchmark, and source artifact clean verification.

Production heap peak is **BLOCKED** because this environment has no production/staging workload, Mongo telemetry, or API traffic logs. The benchmark below is a local fixture benchmark only.

Important tradeoff: the streaming workbook path reduces response-buffer OOM risk, but the 10k-row fixture export is slower than the previous in-memory writer. This is acceptable for Phase237 because the goal is heap/OOM hardening, not latency optimization.

## B. Baseline table

| Flow | Rows | Duration | Peak heap / memory signal | Query count | Notes |
|---|---:|---:|---:|---:|---|
| Baseline `savePreviewResult` | 1,000 | 13 ms | heap delta 0.09 MB, heap used 22.40 MB, RSS 85.99 MB | mocked | Built full `rowDocs` array before batching inserts. |
| Baseline `savePreviewResult` | 10,000 | 33 ms | heap delta 0.05 MB, heap used 22.47 MB, RSS 94.04 MB | mocked | Full duplicate insert-doc array remained the main avoidable copy. |
| Baseline `IMPORT_PREVIEW` export | 1,000 | 68 ms | heap delta 0.28 MB, heap used 22.75 MB, RSS 104.46 MB | mocked | Returned full workbook buffer. |
| Baseline `IMPORT_PREVIEW` export | 10,000 | 239 ms | heap delta 0.07 MB, heap used 22.81 MB, RSS 149.07 MB | mocked | Returned full workbook buffer; OOM risk grows with workbook size. |

## C. Root cause table

| Area | Root cause | Risk | Phase237 action |
|---|---|---|---|
| Import preview save | `rows.map(...)` created all `ImportSessionRow` docs before insert batching. | Double memory pressure for large previews. | Build docs inside each insert batch only. |
| Import preview runner | `rows.push(...fileRows)` and final summary used repeated `filter`/`flatMap` scans. | Spread argument pressure and O(n * fileCount) summary scans. | Loop-based push and per-file stats map. |
| `IMPORT_PREVIEW` export | Workbook was built as in-memory model and serialized to response buffer. | XLSX ZIP buffer can push heap/RSS high on large exports. | Stream workbook to temp file and send file path response. |
| Export row partition | Valid and invalid rows were split with `filter` plus `includes`. | Avoidable CPU/memory churn. | Single-pass partition after enrichment. |

## D. Memory inventory

| Flow | Before | After | Residual limitation |
|---|---|---|---|
| Import parser/preview | Parser still returns row arrays by current parser contract. | No behavior change. | True streaming parser is not implemented in this phase. |
| Preview row persistence | Full raw rows plus full `rowDocs` insert array. | Full raw rows plus one insert batch of docs. | Raw preview rows remain in memory until preview result is saved. |
| Preview file summary | Repeated array scans per file. | Per-file counters collected once. | None in this phase scope. |
| `IMPORT_PREVIEW` export | Full selected rows, valid/invalid arrays, workbook object, and XLSX response buffer. | Full selected rows and partition arrays remain, but workbook ZIP is written to temp file and no response buffer is returned. | Future phase should stream DB pages directly into worksheet rows. |
| SSE/VNPT/DMS exports | Audited only. | Unchanged. | Must not be changed until pilot metrics are accepted. |

## E. Query inventory

| Flow | Query pattern | N+1 finding | Status |
|---|---|---|---|
| Import preview validate | Product/customer/staff/stock lookups are preloaded by batch in preview services. | No per-row Mongo lookup found in pilot path. | PASS |
| Import commit | Commit path preloads catalog/staff/stock/existing orders before grouping. | No Phase237 change. | PASS |
| `IMPORT_PREVIEW` export | Session rows are loaded by paginated `listSessionRows`; product catalog enrichment loads product codes in batch. | No per-row product lookup found. | PASS_WITH_CONCERN because selected rows are still accumulated before workbook writing. |
| DMS/SSE/VNPT | Audited only. | Not changed. | NEED_RUNTIME_EVIDENCE for future hardening. |

## F. Architecture decomposition

| Layer | Source | Contract observed |
|---|---|---|
| Upload route | `src/routes/importExportRoutes.js` | Upload/session API remains unchanged. |
| Import preview controller | `src/controllers/importExportController.js` | API response contract remains unchanged. |
| Import preview runner | `src/jobs/importPreviewRunner.js` | Parses files, builds preview, saves session rows. Only memory-safe internal collection behavior changed. |
| Import session storage | `src/services/importSessionService.js` | Same `ImportSession` / `ImportSessionRow` storage contract; batching now constructs docs per chunk. |
| Export route/controller | `src/routes/excelInteractionRoutes.js`, `src/controllers/excelInteractionController.js` | Public export API remains unchanged; controller now supports file-path export result and cleans temp file. |
| Export service | `src/services/excel/ExcelInteractionService.js` | Only `IMPORT_PREVIEW` uses streaming workbook. Existing export types still use existing writer. |
| Streaming writer | `src/services/excel/ImportPreviewStreamingWorkbook.js` | New isolated helper for pilot workbook generation. |

## G. Chunk/stream strategy

| Item | Strategy | Bound |
|---|---|---:|
| Preview row insert docs | Build and insert per batch. | `IMPORT_SESSION_ROW_BATCH_SIZE` = 500 |
| Preview runner file merge | Loop push instead of spread push. | Bounded by parser row output. |
| File summary errors | Keep first 20 errors per file. | 20 errors/file |
| Workbook output | `ExcelJS.stream.xlsx.WorkbookWriter` to OS temp file. | No XLSX response buffer |
| Temp file lifecycle | `sendFile` callback unlinks file. Benchmark/tests unlink directly. | File cleaned after response/test |

## H. Import golden result

| Check | Result |
|---|---|
| `savePreviewResult` stores session rows in collection | PASS |
| 1,200-row fixture inserts in bounded chunks | PASS: `[500, 500, 200]` |
| Session preview/sample behavior | Preserved |
| Import session row schema | Unchanged |
| Import commit/accounting/inventory writers | Not changed |

## I. Workbook golden result

| Check | Result |
|---|---|
| `IMPORT_PREVIEW` returns streaming result | PASS: `streaming: true`, `filePath` present, `buffer` absent |
| Workbook sheets | PASS: `ThongTin`, `TatCa`, `HopLe`, `Loi` |
| Product catalog columns | PASS: product code/name plus catalog packing and sale price columns preserved |
| Valid/error split | PASS in fixture |
| Formula injection guard | PASS: text starting with `=` is written with leading apostrophe |
| Temp file cleanup | PASS in test and controller path |

## J. Performance result

Command:

```powershell
node --expose-gc scripts\benchmark-import-export-memory.js --rows=1000,10000
```

| Flow | Rows | Duration | Heap delta | Heap used | RSS | Output | Streamed |
|---|---:|---:|---:|---:|---:|---:|---|
| `savePreviewResult` | 1,000 | 20 ms | -0.08 MB | 28.60 MB | 103.79 MB | n/a | n/a |
| `exportImportPreview` | 1,000 | 161 ms | 1.28 MB | 29.88 MB | 115.61 MB | 117,201 bytes | yes, no buffer |
| `savePreviewResult` | 10,000 | 39 ms | 0.08 MB | 29.81 MB | 120.82 MB | n/a | n/a |
| `exportImportPreview` | 10,000 | 368 ms | 0.25 MB | 30.04 MB | 151.31 MB | 1,142,126 bytes | yes, no buffer |

Interpretation:

- Import save now has bounded insert-doc memory and preserves 500-row insert batches.
- Export no longer returns a workbook buffer for the pilot path.
- Export duration regressed in the 10k fixture versus baseline because ExcelJS streaming is slower than the previous custom in-memory writer. This is a conscious OOM-hardening tradeoff.
- Production peak heap cannot be certified without real runtime workload evidence.

## K. Temp artifact cleanup

| Artifact | Location | Cleanup |
|---|---|---|
| Streaming workbook | `os.tmpdir()/mkpro-export-workbooks/import-preview-*.xlsx` | `excelInteractionController.sendWorkbook` unlinks after `res.sendFile` callback. |
| Benchmark workbook | Same temp folder | Benchmark unlinks in `finally`. |
| Test workbook | Same temp folder | Test unlinks in `finally`. |

## L. Index audit

No Mongo index was added, removed, renamed, or dropped.

| Collection | Index | Key | Evidence | Risk | Recommendation |
|---|---|---|---|---|---|
| `import_sessions` | unchanged | unchanged | Phase237 only reads/updates existing session documents. | Low | No index action. |
| `import_session_rows` | unchanged | unchanged | Phase237 preserves paginated row storage and insert batching. | Low | No index action. |
| Accounting/inventory/fund/debt collections | unchanged | unchanged | Not touched by Phase237. | High if changed | Do not change in this phase. |

## M. Test evidence

| Command | Result |
|---|---|
| `node --test test\phase237-import-export-streaming-memory.test.js test\excel-interaction-platform-behavior.test.js test\excel-product-catalog-rule.test.js test\excel-sales-live-inventory-resolve.test.js` | PASS, 14/14 |
| `node --test test\phase237-import-export-streaming-memory.test.js test\import-preview-worker-lifecycle.test.js test\excel-import-two-phase-static.test.js test\import-preview-full-row-pagination-static.test.js test\excel-interaction-platform-static.test.js` | PASS, 26/26 |
| `npm run check:syntax` | PASS, `SYNTAX_OK 1413 JavaScript files` |
| `npm run check:source-size` | PASS, `[source-size-budget] OK` |
| `npm run check:source-bundles` | PASS, `[source-bundles] OK 19 bundles` |
| `npm test` | PASS, exit code 0; optional golden fixture skipped |
| `git diff --check` | PASS, exit code 0; line-ending warnings only |
| `node --expose-gc scripts\benchmark-import-export-memory.js --rows=1000,10000` | PASS |

## N. File changes

| File | Purpose |
|---|---|
| `src/services/importSessionService.js` | Build preview row insert docs per 500-row batch instead of one full duplicate array. |
| `src/jobs/importPreviewRunner.js` | Avoid spread push and repeated summary scans; keep bounded per-file error list. |
| `src/services/excel/ExcelInteractionService.js` | Pilot `IMPORT_PREVIEW` export uses streaming workbook helper and no response buffer. |
| `src/controllers/excelInteractionController.js` | Supports file-path workbook result and cleans temp file after send. |
| `src/services/excel/ImportPreviewStreamingWorkbook.js` | New isolated streaming workbook writer for import preview export. |
| `test/phase237-import-export-streaming-memory.test.js` | Regression tests for bounded import inserts and streaming workbook result. |
| `scripts/benchmark-import-export-memory.js` | Local fixture benchmark for import save/export memory behavior. |
| `PHASE237_IMPORT_EXPORT_STREAMING_HEAP_HARDENING_REPORT.md` | This report. |

## O. Files explicitly not changed

The following areas were audited or protected and intentionally left unchanged:

- `package.json`
- Mongo schemas and indexes
- Accounting confirm / ledger writer code
- Inventory posting / stock transaction writer code
- Delivery Today New runtime and writers
- Debt New runtime and writers
- Fund dashboard/runtime and `fundLedgers` writers
- Report Center production exports
- Display Check / DMS scoring writer behavior
- SSE/VNPT invoice export behavior
- DMS gap simulator behavior
- Generated bundles/source bundles
- Existing Phase235/Phase236 worktree changes

## P. Runtime smoke checklist

Before production rollout:

1. Upload a representative import Excel and confirm preview row count, valid/error totals, and preview sample remain unchanged.
2. Commit a small import in staging and verify no accounting/inventory side effect changed.
3. Export `IMPORT_PREVIEW` from UI and confirm downloaded workbook opens in Excel.
4. Export selected rows only and confirm workbook row counts match selection.
5. Verify temp directory does not retain `import-preview-*.xlsx` after successful and failed downloads.
6. Run one large staging preview/export with `--max-old-space-size` configured to production-like limits.
7. Capture API latency, RSS, heap, and temp disk usage during large export.

## Q. Known limitations

- Import parser still returns full row arrays by current parser/worker contract.
- `IMPORT_PREVIEW` export still loads selected rows into memory before workbook writing.
- Streaming workbook uses ExcelJS streaming, which is safer for buffer pressure but slower in the local 10k fixture.
- Production memory peak is not certified without real workload telemetry.
- SSE/VNPT/DMS/report-center exports were not changed in this pilot.

## R. Rollback plan

Rollback is code-only:

1. Revert `src/controllers/excelInteractionController.js`, `src/jobs/importPreviewRunner.js`, `src/services/excel/ExcelInteractionService.js`, and `src/services/importSessionService.js` to the pre-Phase237 version.
2. Remove the new helper/test/benchmark/report files from the Phase237 changeset if rolling back the whole phase.
3. No Mongo migration, package change, index change, or data repair is required because Phase237 does not alter schema or persisted business data format.

## S. Next phase recommendation

Recommended next phase:

- Implement true cursor/page-to-worksheet streaming for `IMPORT_PREVIEW`, so `allRows`, `validRows`, and `invalidRows` do not need to be accumulated at once.
- Add staging telemetry around heap, RSS, temp disk, export duration, and failed-download cleanup.
- Only after pilot telemetry passes, repeat the same bounded-memory audit for one additional simple export.
- Defer SSE/VNPT/DMS/report-center hardening until the pilot pattern is proven under real workload.
