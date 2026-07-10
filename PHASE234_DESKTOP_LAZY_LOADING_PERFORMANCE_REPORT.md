# PHASE234 DESKTOP LAZY LOADING PERFORMANCE REPORT

## 1. Executive summary

Phase234 moved the six largest non-initial desktop feature modules out of the initial desktop shell and behind an allowlisted classic-script feature loader.

No backend route, service, model, Mongo index, schema, package dependency, or business write path was changed. The existing feature files remain intact and are loaded only when the relevant tab/action is used.

## 2. Before and after metrics

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Initial local desktop scripts | 67 | 63 | -4 |
| Initial decoded JS | 1,095,187 bytes / 1,069.5 KB | 727,810 bytes / 710.8 KB | -367,377 bytes / -358.8 KB |
| Initial gzip estimate | 278,584 bytes / 272.1 KB | 200,803 bytes / 196.1 KB | -77,781 bytes / -76.0 KB |
| Six target modules in initial shell | 6 | 0 | -6 |
| New loader/facade overhead | 0 | 12,848 bytes / gzip 3,758 bytes | +12.5 KB decoded |

Browser timing, long-task data, parse/execute timing, and first/second open wall-clock timing are BLOCKED in this workspace: the existing `benchmark:frontend` script is a mobile DOM micro-benchmark and hard-codes `/usr/bin/chromium`, while this Windows workspace does not expose a desktop initial-load browser runner.

## 3. Initial modules removed from shell

| Module | Size | Gzip estimate | Lazy feature | Trigger |
|---|---:|---:|---|---|
| `public/js/app/new/91-delivery-today-new.js` | 144,173 | 29,847 | `deliveryTodayNew` | `deliveryTodayNewTab`, notification adjustment deep-link |
| `public/js/app/new/92-debt-new.js` | 86,403 | 17,587 | `debtNew` | `debtNewTab`, debt collection refresh helpers |
| `public/js/app/admin/08a-reports.js` | 47,743 | 11,919 | `reports` | `reportsTab`, report actions |
| `public/js/app/06-master-delivery.js` | 38,613 | 8,565 | `masterOrders` | `masterOrdersTab`, master-order toolbar |
| `public/js/app/debt/07d-master-return-orders.js` | 31,986 | 6,678 | `masterReturnOrders` | legacy master-return public actions only |
| `public/js/app/admin/08e-promotion-programs.js` | 31,989 | 7,075 | `promotionPrograms` | `promotionsTab` |

Total removed target weight before loader overhead: 380,907 decoded bytes and 81,671 gzip-estimated bytes.

## 4. Loader design

Added `public/js/app/core/feature-module-loader.js`.

The loader provides:

| Capability | Status |
|---|---|
| Registry by stable feature name | PASS |
| Internal-only URL validation under `/js` or `/css` | PASS |
| No dynamic external/untrusted URL loading | PASS |
| Promise cache for concurrent calls | PASS |
| No duplicate script/style insertion | PASS |
| Sequential dependency/style/script loading | PASS |
| Timeout | PASS |
| Retry for transient script load failure | PASS |
| Ready check | PASS |
| Init-once hook | PASS |

## 5. Compatibility facade contracts

Added `public/js/app/core/desktop-feature-facades.js`.

| Feature | Public contracts kept |
|---|---|
| Delivery Today New | `loadDeliveryTodayNew`, `openDeliveryTodayAdjustmentFromNotification`, `mkpro:delivery-open-adjustment` capture |
| Debt New | `loadDebtNew` |
| Reports | `loadReports`, `setReportDefaults`, `openReport`, `openReportCenterModal`, `closeReportCenterModal` |
| Master orders | `loadMasterOrderModule`, `loadMasterOrders`, `loadUnmergedChildOrders`, `openMasterOrderModal`, toolbar helpers |
| Master return legacy | `openMasterReturnOrderModal`, `loadMasterReturnOrders`, print/view/receive/cancel helpers |
| Promotion programs | `loadPromotionPrograms`, `loadPromotionProgramsByType`, `reloadPromotionRules`, `openPromotionWorkspace`, edit/view/cancel helpers |
| Legacy delivery aliases from master module | `loadDeliveryToday`, `loadDeliveryTodayOrders`, `submitDeliveryEdit`, `clearDeliveryEditPanel`, `recalcDeliveryEditDebt` |

`setReportDefaults` is guarded in `03-tab-loader` so the report facade does not accidentally load Report Center during first page load.

## 6. Dependency graph

| Feature | Depends on initial shell assets | Lazy-loaded child scripts |
|---|---|---|
| `masterOrders` | state globals, `showMessage`, `fetchWithTimeout`, master orders toolbar | `06-master-delivery.js` |
| `masterReturnOrders` | retired master-return state globals if present, `showMessage`, `escapeHtml`, `debounce` | `07d-master-return-orders.js` |
| `deliveryTodayNew` | `fetch`, delivery tab DOM, notification center deep-link event | `91-delivery-today-new.js` |
| `debtNew` | `fetch`, debt tab DOM, debt collection callers | `92-debt-new.js` |
| `reports` | `fetch`, report tab DOM, `V45Common.escapeHtml` fallback | `08a-reports.js` |
| `promotionPrograms` | `fetch`, promotions tab DOM, `showMessage` | `08e-promotion-programs.js` |

No circular feature dependency was introduced.

## 7. Files changed in Phase234

| File | Purpose |
|---|---|
| `public/js/app/core/feature-module-loader.js` | New allowlisted feature script/style loader |
| `public/js/app/core/desktop-feature-facades.js` | Feature registry and global compatibility facades |
| `public/fragments/index/07-index-body.html` | Remove six heavy initial scripts, add loader/facade |
| `public/js/bootstrap/03-tab-loader.js` | Load feature scripts on tab activation before calling entrypoints |
| `test/feature-module-loader.test.js` | Unit coverage for loader cache, retry, and URL safety |
| `test/phase234-desktop-feature-lazy-loading-static.test.js` | Static performance and registry contract coverage |
| `test/phase91-new-modules-static.test.js` | Update old direct-script expectation to lazy registry |
| `test/master-order-popup-selection-ui-static.test.js` | Update master-order script expectation to lazy registry |
| `test/fixtures/index-page/phase79-assembled.sha256` | Refresh approved assembled index hash |

## 8. Files intentionally not changed

No backend routes, controllers, services, models, Mongo index code, package dependencies, source-bundle config, or business writer code were changed for Phase234.

## 9. Validation

| Check | Result |
|---|---|
| `node --test test/feature-module-loader.test.js test/phase234-desktop-feature-lazy-loading-static.test.js test/phase91-new-modules-static.test.js test/master-order-popup-selection-ui-static.test.js test/frontend-list-request-governance-static.test.js test/master-orders-toolbar-static.test.js` | PASS |
| `npm run check:syntax` | PASS |
| `npm run check:source-size` | PASS |
| `npm run check:source-bundles` | PASS |
| `npm test` | PASS |
| `git diff --check` | PASS, line-ending warnings only |
| `npm run test:artifact-clean -- --zip MK-pro-phase234-desktop-feature-lazy-loading-large-module-decomposition-performance-fixed.zip` | PASS |

## 10. Risk notes

| Risk | Mitigation |
|---|---|
| Global function called before module load | Facades load the feature and then call the real function |
| Notification adjustment event fires before delivery module loads | Capture listener lazy-loads delivery module and replays the adjustment payload |
| Report Center accidentally loads at startup through `setReportDefaults` | Startup guard skips report facade |
| Multiple rapid clicks load duplicate scripts | Loader promise cache and existing asset checks |
| External script injection | Loader rejects external, protocol, and `..` URLs |
| Legacy master-return UI is retired | Public facades remain available, but feature is not loaded during normal return-order tab flow |

## 11. Next recommended phase

1. Add a Windows-compatible desktop browser benchmark runner for `/` first load, tab first-open, and second-open timings.
2. Split the heaviest lazy feature internally, starting with `91-delivery-today-new.js`, after browser timing is available.
3. Consider lazy-loading more admin/import/report scripts after collecting production tab usage.
4. Add production telemetry for feature-load duration and failure count.
