# PHASE255A Optional Backend Route Lazy-Load Report

## 12.1 Root cause

File: `src/routes/index.js`

Function: `registerApiRoutes(app)`

Pre-fix lines: 35-41 and 147-153.

Before Phase255A, `src/routes/index.js` imported all seven optional routers at module top-level:

```js
const purchaseRoutes = require('./purchaseRoutes');
const warehouseAdvancedRoutes = require('./warehouseAdvancedRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const fieldOperationRoutes = require('./fieldOperationRoutes');
const deliveryPlanningRoutes = require('./deliveryPlanningRoutes');
const integrationRoutes = require('./integrationRoutes');
const platformRoutes = require('./platformRoutes');
```

Load graph before fix:

```text
src/routes/index.js
-> top-level require optional route module
-> optional route requires controller
-> controller requires service/model graph
-> registerApiRoutes()
-> route-level requireFeature(...) only blocks requests after module load
```

This meant feature flags prevented request handling but did not prevent optional module loading.

Required Phase254 planning reports and the Phase253 ZIP named in the prompt were not present in this workspace. Baseline was measured from the current workspace state.

## 12.2 Route matrix

| Feature | Flag | Prefix | Flag-off loaded? | Flag-on loaded? | Disabled response |
| --- | --- | --- | --- | --- | --- |
| purchasing | ENABLE_PURCHASING | `/api/purchase` | No | Yes | 404 `FEATURE_DISABLED` |
| warehouseAdvanced | ENABLE_WAREHOUSE_ADVANCED | `/api/warehouse-advanced` | No | Yes | 404 `FEATURE_DISABLED` |
| analyticsProjections | ENABLE_ANALYTICS_PROJECTIONS | `/api/analytics` | No | Yes | 404 `FEATURE_DISABLED` |
| fieldOperations | ENABLE_FIELD_OPERATIONS | `/api/field-operations` | No | Yes | 404 `FEATURE_DISABLED` |
| deliveryPlanning | ENABLE_DELIVERY_PLANNING | `/api/delivery-planning` | No | Yes | 404 `FEATURE_DISABLED` |
| integrations | ENABLE_INTEGRATIONS | `/api/integrations` | No | Yes | 404 `FEATURE_DISABLED` |
| multiTenant | TENANT_MODE=multi | `/api/platform` | No | Yes | 404 `FEATURE_DISABLED` |

## 12.3 Files changed

New files:

- `src/routes/optionalRouteRegistry.js`: static optional route registry, feature snapshot normalization, lazy router loading, disabled stub mounting, startup evidence export.
- `scripts/audit-optional-route-module-load.js`: no-listen/no-Mongo module-load audit for optional routes.
- `test/phase255a-optional-backend-route-lazy-load.test.js`: runtime tests for cache, mount, feature parsing, disabled response parity, and load failure.
- `PHASE255A_OPTIONAL_ROUTE_LOAD_BASELINE.json`: pre-fix measurement evidence.
- `PHASE255A_OPTIONAL_ROUTE_LOAD_AFTER.json`: post-fix measurement evidence.
- `PHASE255A_OPTIONAL_BACKEND_ROUTE_LAZY_LOAD_REPORT.md`: this report.

Modified files:

- `src/routes/index.js`: removed top-level optional route imports and delegated Phase80 optional mounts to `registerOptionalApiRoutes()`.
- `src/middlewares/featureFlag.middleware.js`: added shared disabled response/handler factory and kept `requireFeature()` contract.
- `package.json`: added `audit:optional-route-load`, `test:phase255a`, and included Phase255A in `test:release-governance`.

## 12.4 Before-after measurement

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Total loaded modules | 1874 | 1857 | -17 |
| Optional route modules loaded | 7 | 0 | -7 |
| Optional controller modules loaded | 7 | 0 | -7 |
| Registration duration, local ms | 4570.191 | 4113.798 | -456.393 |
| Optional source bytes reachable/loaded | 17076 estimated | 0 | -17076 |

Limitations:

- This is a local bootstrap module-cache measurement, not a production RSS/heap benchmark.
- Baseline source bytes are estimated from current unchanged optional route/controller file sizes because the pre-fix inline baseline did not record byte count.
- Node version reported by audit: `v24.16.0`.

Acceptance:

```text
Optional route roots loaded when flags off = 0
Optional controllers loaded when flags off = 0
```

## 12.5 Test evidence

Commands run:

| Command | Actual result |
| --- | --- |
| `node --check src/routes/index.js` | PASS |
| `node --check src/routes/optionalRouteRegistry.js` | PASS |
| `node --check src/middlewares/featureFlag.middleware.js` | PASS |
| `node --check scripts/audit-optional-route-module-load.js` | PASS |
| `node --check test/phase255a-optional-backend-route-lazy-load.test.js` | PASS |
| `npm run test:phase255a` | PASS, 9/9 |
| `npm run check:syntax` | PASS, 1474 JavaScript files |
| `npm run test:phase253` | FAIL, 5/7 pass, 2 fail because `zip` binary is missing from PATH (`spawnSync zip ENOENT`) |
| `npm run test:release-governance` | FAIL, 40/42 pass, same 2 Phase253 `zip` failures; Phase255A 9/9 pass |
| `npm run test:artifact-clean` | FAIL, verifier scanned `.git` and `node_modules` and rejected forbidden segments |
| `npm run check:release-manifest` before regeneration | FAIL, stale `sourceSha256`, `sourceFileCount` |
| `node scripts/generate-release-manifest.js --phase Phase255A` | PASS, wrote `Phase255A-1.0.0-20260712084359` |
| `npm run check:release-manifest` after regeneration | PASS |
| `npm run quality` | FAIL, syntax and non-mutating checksum completed, then runner failed with `spawnSync npm ENOENT` |
| `node scripts/create-deployment-artifact.js --out MK-pro-phase255a-optional-backend-route-lazy-load-fixed.zip` | FAIL, `zip` binary missing from PATH |
| Manual ZIP creation through Node `archiver` | PASS, 2019 entries |
| `node scripts/verify-source-artifact-clean.js --zip MK-pro-phase255a-optional-backend-route-lazy-load-fixed.zip` | PASS |
| `node scripts/verify-deployment-artifact.js --zip MK-pro-phase255a-optional-backend-route-lazy-load-fixed.zip` | PASS |
| `unzip -t MK-pro-phase255a-optional-backend-route-lazy-load-fixed.zip` | PASS |

Evidence from `require.cache`:

- Before: 7 optional route modules and 7 optional controller modules were loaded with flags off.
- After: 0 optional route modules and 0 optional controller modules were loaded with flags off.

Checksum evidence:

- Baseline source SHA-256: `1117fb2521b4cd7fa4f99037f33ffa16b3d9309f322b241abf6fc688b6fd9621`
- After audit source SHA-256 before final manifest/report updates: `12d86dd593b9d44612cd4092cd007d80c3f2386d925d6e74c2494634f8adf087`
- `test:phase255a` includes a non-mutating audit check and passed.
- Final ZIP SHA-256 is stored in `MK-pro-phase255a-optional-backend-route-lazy-load-fixed.zip.sha256`.

## 12.6 Scope not changed

Confirmed unchanged in Phase255A:

```text
AR/Fund/Inventory/Delivery/accounting writers: not modified
Database/schema/index: not modified
Enterprise: not modified
Scheduler: not modified
Route alias: not modified
Frontend: not modified
```

Also not modified:

- `/api/enterprise`
- background scheduler in `src/app.js`
- route aliases `/api/orders`, `/api/returns`, mobile aliases
- frontend script/style loading
- report route lazy-load
- tool routes order-split, DMS gap, display-check
- feature flag default values

## 12.7 Remaining risks

- Feature-enabled optional modules have runtime coverage through router mount/cache tests, but still need production traffic verification.
- Environment configuration drift can still enable a feature unexpectedly if deployment env differs from release env.
- Bootstrap uses a startup snapshot while route-level `requireFeature()` still reads current getters as defense-in-depth; this is intentional but should be documented for ops.
- Background job module isolation remains Phase255C.
- Enterprise route and static entry governance remains Phase255B.
- Current workspace lacks the requested Phase254 planning reports and Phase253 ZIP, so this report relies on current source inspection and runtime measurement.

## 12.8 Rollback plan

Rollback only bootstrap wiring:

```text
src/routes/index.js
src/routes/optionalRouteRegistry.js
src/middlewares/featureFlag.middleware.js
scripts/audit-optional-route-module-load.js
test/phase255a-optional-backend-route-lazy-load.test.js
package.json script entries
```

No database rollback is required.

## Final Phase255A status

Phase255A code objective is achieved for optional backend route lazy-load:

- Flags off: optional route roots loaded = 0.
- Flags off: optional controllers loaded = 0.
- Disabled prefix contract preserved with lightweight `404 FEATURE_DISABLED`.
- Enabled router load failures throw and do not silently skip modules.
- Core route mount order and aliases are covered by targeted tests.

Release governance is partially blocked by environment/tooling failures listed in test evidence, not by Phase255A lazy-load behavior.

Recommended next phase:

```text
Phase255B - Enterprise Route and Static Entry Governance
```
