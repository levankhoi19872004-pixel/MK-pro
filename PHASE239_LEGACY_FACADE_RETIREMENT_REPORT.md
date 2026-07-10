# Phase239 - Legacy Service Facade Retirement, Canonical Cutover & Duplicate Runtime Path Elimination

## A. Executive summary

Phase239 implemented one low-risk strangler pilot: `src/services/master-order/masterOrderLegacy.service.js` no longer loads `src/services/master-order/masterOrderPrintLegacy.impl.js` for aggregate master-order print data. The public export `buildAggregateMasterPrintDocument` is preserved, but it now delegates to `src/services/master-order/masterOrderPrint.service.js`, which already delegates to the canonical print domain `src/domain/print/PrintReadService.js`.

No file was deleted. No generated target was edited. No schema, route, API payload, authorization, transaction boundary, idempotency key, AR/Fund/Inventory writer, accounting formula, import formula, promotion formula, or Mongo index was changed.

The phase also adds governance so the next retirements are evidence-based:

- `config/legacy-runtime-candidates.js`: controlled registry for runtime/generated/compatibility candidates.
- `scripts/audit-legacy-runtime-dependencies.js`: dependency graph audit with runtime/test/config/source-bundle classification.
- `scripts/benchmark-phase239-startup-modules.js`: startup/module-load benchmark for the pilot path.
- `test/phase239-legacy-facade-retirement.test.js`: regression guard for the pilot and audit script.

## B. Candidate inventory

Pre-edit inventory found 102 legacy/generated/compat/source candidates. Post-edit inventory is 105 because Phase239 added registry/audit/benchmark files with legacy-audit naming. Total post-edit candidate-marked bytes: 1,389,506.

Top candidates by size:

| File | Size | Type | Runtime consumers | Decision |
|---|---:|---|---:|---|
| `public/mobile/js/delivery-mobile-view.source.js` | 76,680 | canonical frontend source | active mobile bundle | KEEP_CANONICAL |
| `src/services/returnOrderLegacy.service.js` | 48,116 | generated runtime target | 7 | MIGRATE_CONSUMERS |
| `src/services/importExportLegacy.service.js` | 40,232 | generated runtime target | 5 | MIGRATE_CONSUMERS |
| `src/engines/delivery.legacy.engine.js` | 34,708 | generated runtime target | 3 | MANUAL_REVIEW |
| `src/services/orderLegacy.service.js` | 31,479 | generated runtime target | 5 | MIGRATE_CONSUMERS |
| `src/services/reportLegacy.service.js` | 29,721 | generated runtime target | 2 | MIGRATE_CONSUMERS |
| `services/printDataBuilder.legacy.js` | 28,303 | generated runtime target | 3 | MIGRATE_CONSUMERS |
| `src/services/master-order/masterOrderPrintLegacy.impl.js` | 10,933 | legacy read implementation | before 1, after 0 | REMOVE_RUNTIME_LOAD |

## C. Dependency graph summary

| Candidate | Consumer | Reference type |
|---|---|---|
| `src/services/orderLegacy.service.js` | `SalesOrderQueryService`, `SalesOrderCommandService`, `SalesOrderPostingCoordinator`, source bundle, tests | runtime/source_bundle/test |
| `src/services/returnOrderLegacy.service.js` | return-order query/command/receiving/accounting/draft services, source bundle, tests | runtime/source_bundle/test |
| `src/services/importExportLegacy.service.js` | `ImportFacade`, `ExportFacade`, source bundle, tests | runtime/source_bundle/test |
| `src/services/reportLegacy.service.js` | `DashboardReportService`, source bundle, tests | runtime/source_bundle/test |
| `src/engines/delivery.legacy.engine.js` | `DeliveryEngineFacade`, source bundle, tests | runtime/source_bundle/test |
| `src/services/mobile/sales.service.js` | mobile sales controller, source bundle, tests | runtime/source_bundle/test |
| `services/printDataBuilder.legacy.js` | `services/printDataBuilder.js`, source bundle, tests | runtime/source_bundle/test |
| `src/services/master-order/masterOrderPrintLegacy.impl.js` | no runtime consumer after Phase239 | test/config/audit only |

Audit command: `node scripts/audit-legacy-runtime-dependencies.js`

Result: `violations=0`; pilot retired file runtime refs: `0`.

## D. Canonical owner matrix

| Domain | Canonical owner | Legacy owner | Result |
|---|---|---|---|
| Master-order aggregate print read | `src/domain/print/PrintReadService.js` via `masterOrderPrint.service.js` | `masterOrderPrintLegacy.impl.js` | runtime load removed |
| Sales order read/write | sales-order services + lifecycle/posting boundaries | `orderLegacy.service.js` | retained, writer-sensitive |
| Return order lifecycle | return-order services + returnOrders SSoT | `returnOrderLegacy.service.js` | retained, writer-sensitive |
| Import/export | import-export/excel services | `importExportLegacy.service.js` | retained, production import/export |
| Delivery engine | delivery facade/canonical workflows | `delivery.legacy.engine.js` | retained, mobile/writer-sensitive |
| Mobile sales | mobile controller + canonical services | `mobile/sales.service.js` | retained, mobile compatibility |
| Reporting | report center/report services | `reportLegacy.service.js` | retained, production report/export |

## E. Classification

| Candidate | Classification | Evidence | Action |
|---|---|---|---|
| `masterOrderPrintLegacy.impl.js` | REMOVE_RUNTIME_LOAD | only runtime import was `masterOrderLegacy.service.js`; removed | keep file for rollback/audit |
| `masterOrderPrint.service.js` | KEEP_COMPATIBILITY_FACADE | delegates to `PrintReadService.readMasterOrders` | keep |
| `masterOrderLegacy.service.js` | KEEP_COMPATIBILITY_FACADE | public master-order facade still needed | keep, now delegates print to canonical facade |
| `orderLegacy.service.js` | MIGRATE_CONSUMERS | active sales-order runtime imports | defer |
| `returnOrderLegacy.service.js` | MIGRATE_CONSUMERS | active return runtime imports | defer |
| `delivery.legacy.engine.js` | MANUAL_REVIEW | delivery/mobile/accounting-adjacent | defer |
| `mobile/sales.service.js` | MANUAL_REVIEW | mobile compatibility | defer |

## F. Consumer migration

| Consumer | Before import | After import | Contract |
|---|---|---|---|
| `src/services/master-order/masterOrderLegacy.service.js` | `require('./masterOrderPrintLegacy.impl')` | `require('./masterOrderPrint.service')` | `buildAggregateMasterPrintDocument(body)` unchanged |

## G. Compatibility facade

| Facade | Delegates to | DB access | Write access |
|---|---|---|---|
| `masterOrderPrint.service.js` | `PrintReadService.readMasterOrders` | no direct model access | none |
| `masterOrderLegacy.service.js` print export | `masterOrderPrint.service.js` | unchanged for other exports | unchanged for other exports |

## H. Removed runtime paths

| File/path | Reason | Evidence no consumer |
|---|---|---|
| `masterOrderLegacy.service.js -> masterOrderPrintLegacy.impl.js` | duplicate read implementation; canonical print domain already exists | audit script reports `masterOrderPrintLegacy.impl.js runtimeRefs=0`; Phase239 test passes |

## I. Files retained

| File | Reason retained | Retirement condition |
|---|---|---|
| `src/services/master-order/masterOrderPrintLegacy.impl.js` | rollback/audit source; no physical delete in pilot | remove only after rollback policy approves physical removal |
| generated legacy service targets | active runtime/source-bundle consumers | migrate consumers with golden behavior tests first |
| source fragments `.jsfrag` | still configured in `config/source-bundles.json` | remove only after bundle target retirement |

## J. Source-bundle changes

No source-bundle config or generated target changed.

| Bundle | Before | After | Result |
|---|---|---|---|
| 19 configured bundles | active | active | `npm run check:source-bundles` PASS |

## K. Behavior parity

| Flow | Before | After | Equal |
|---|---|---|---|
| master-order aggregate print export surface | `buildAggregateMasterPrintDocument` exposed through master-order facade | same export exposed through master-order facade | yes |
| frontend print endpoint | `/api/print/master-orders/batch` | unchanged | yes |
| legacy `/api/master-orders/print-aggregate` | not reintroduced | not reintroduced | yes |

## L. Writer safety

| Flow | Side-effect count | Idempotency | Result |
|---|---:|---|---|
| Phase239 pilot print read | 0 writes | not applicable | PASS |
| AR/Fund/Inventory/Return/Delivery accounting writers | unchanged | unchanged | PASS by non-touch and regression |

## M. Startup performance

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Runtime consumers of `masterOrderPrintLegacy.impl.js` | 1 | 0 | one duplicate runtime path removed |
| Legacy implementation bytes loaded by that facade | 10,933 | 0 | not parsed through `masterOrderLegacy.service.js` |
| Current JS file count measured by benchmark | not re-measured from historical checkout | 727 | no physical delete claimed |
| Current source JS bytes measured by benchmark | not re-measured from historical checkout | 5,702,614 | no deploy-size reduction claimed |
| Current `masterOrderLegacy.service.js` require delta | not comparable | 628 modules | benchmark guard only |
| Current `retiredRuntimeLoaded` | true before by static import | false | PASS |

Benchmark command: `node scripts/benchmark-phase239-startup-modules.js`

Latest measured current result: duration `1548.472ms`, heap delta `21,982,496`, RSS delta `38,875,136`, `retiredRuntimeLoaded=false`.

## N. Circular dependency audit

No new canonical-to-legacy reverse import for the retired candidate. The audit script is hardened to read real files even when legacy static tests install source-view adapters.

## O. Security/authorization result

No route, middleware, auth guard, permission guard, CSRF guard, or API contract changed.

## P. Test evidence

| Command | PASS/FAIL/BLOCKED | Evidence |
|---|---|---|
| `node scripts/audit-legacy-runtime-dependencies.js` | PASS | `violations=0` |
| `node --test test/phase239-legacy-facade-retirement.test.js ...` | PASS | 16/16 targeted tests |
| `node scripts/benchmark-phase239-startup-modules.js` | PASS | `retiredRuntimeLoaded=false` |
| `npm run cleanup:retired` | PASS | command completed |
| `npm run check:syntax` | PASS | `SYNTAX_OK 1422 JavaScript files` |
| `npm run check:source-size` | PASS | `[source-size-budget] OK` |
| `npm run check:source-bundles` | PASS | `[source-bundles] OK 19 bundles` |
| `npm test` | PASS | exit code 0; optional SSE golden fixture skipped because fixture absent |
| `git diff --check` | PASS | only existing LF/CRLF warnings |

JSON audit mode was attempted once and blocked by the Windows sandbox ACL helper. Human-readable audit mode passed and is used as evidence.

## Q. File changes

| File | Type | Change | Risk |
|---|---|---|---|
| `src/services/master-order/masterOrderLegacy.service.js` | runtime facade | delegate aggregate print to canonical print facade | low, read-only |
| `config/legacy-runtime-candidates.js` | governance config | legacy candidate registry | low |
| `scripts/audit-legacy-runtime-dependencies.js` | audit script | dependency graph/static guard | low |
| `scripts/benchmark-phase239-startup-modules.js` | benchmark script | startup/module-load evidence | low |
| `test/phase239-legacy-facade-retirement.test.js` | regression test | protects pilot and audit | low |
| `PHASE239_LEGACY_FACADE_RETIREMENT_REPORT.md` | report | phase evidence | none |

## R. Files explicitly not changed

Mongo schemas, AR writers, Fund writers, Inventory writers, delivery accounting formulas, import formulas, promotion formulas, API business contracts, route mounts, auth middleware, source-bundle config, generated targets, package scripts, and Mongo indexes were not changed.

## S. Runtime smoke checklist

- Master-order public facade still exports `buildAggregateMasterPrintDocument`.
- Frontend still calls canonical print endpoint.
- Retired pilot implementation has no runtime/source-bundle consumer.
- No duplicate writer path introduced.
- Full regression passed.

## T. Known limitations

No physical deletion was performed in Phase239. Large generated legacy targets remain active because they still have runtime/source-bundle consumers and include writer/mobile/report/import risk. Startup speed improvement is not claimed beyond the specific removed runtime load path.

## U. Rollback plan

Rollback is code-only:

1. Restore `src/services/master-order/masterOrderLegacy.service.js` import from `./masterOrderPrint.service` to `./masterOrderPrintLegacy.impl`.
2. Restore export binding from `print.buildAggregateMasterPrintDocument` to `printLegacy.buildAggregateMasterPrintDocument`.
3. No data migration, Mongo repair, schema change, or index change is required.

## V. Next phase recommendation

Recommended sequence:

1. Phase240: Production Performance Telemetry & Capacity Baseline.
2. Phase241: Long-term domain boundary cleanup.
3. Phase242: Optional non-financial background report jobs.
4. Phase243: Deployment artifact minimization and source archive separation.

Next legacy retirement candidate should remain read-only and non-mobile, preferably a report/export facade with golden fixtures and no writer side effects. Do not start with AR/Fund/Inventory/Delivery/mobile writers.
