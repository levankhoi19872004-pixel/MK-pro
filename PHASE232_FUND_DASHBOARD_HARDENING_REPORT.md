# PHASE232 Fund Dashboard Canonical Correctness, Partial UI & Runtime Hardening

## 1. Executive summary

Phase232 hardens the Fund Dashboard read model and UI without changing fund writers, remittance writers, idempotency contracts, Mongo schemas, or indexes.

Main outcomes:

- Pending remittance queue now resolves from canonical `deliveryCashSubmissions.remittanceLines` and posted `fundLedgers` evidence before falling back to legacy submitted amounts.
- Delivery cash overdue summary is computed on the full pending result set before UI item limiting.
- Dashboard partial responses keep unavailable values as `null`/dash in UI instead of silently rendering `0`.
- Fund financial confirmation modal is fail-closed when DOM/callback prerequisites are missing.
- Shortage queue is normalized as unresolved/outstanding shortage, while the legacy alias remains in the API response for compatibility.
- Dashboard loading is lazy, abortable, race-protected, and registered in read endpoint budgets.
- OpenAPI now documents `GET /api/funds/dashboard`, including partial response semantics.
- Source bundles were refreshed and source-size budget is green.

No Mongo index was created, removed, or dropped.

## 2. Code audited before edit

| Area | Files |
|---|---|
| Backend route/controller | `src/routes/fundRoutes.js`, `src/controllers/fundController.js` |
| Dashboard read model | `src/services/accounting/FundDashboardReadService.js` |
| Canonical fund balance | `src/services/accounting/FundBalanceReadService.js`, `src/repositories/fundLedgerRepository.js` |
| Delivery cash in transit | `src/domain/settlement/DeliveryCashInTransitReportService.js` |
| Remittance contract | `src/domain/fund/deliveryRemittanceLines.js`, `src/services/fundService.source/part-01b.jsfrag`, `src/services/fundService.source/part-02.jsfrag` |
| Models | `src/models/DeliveryCashSubmission.js`, `src/models/DeliveryCashShortage.js` |
| Frontend | `public/js/app/debt/07f-fund-ledger.source/*.jsfrag`, `public/fragments/index/04-index-body.html` |
| Governance/docs | `src/config/readEndpointBudgets.js`, `docs/openapi.json`, `config/source-bundles.json` |

## 3. Root cause by issue

| Issue | Root cause | Fix |
|---|---|---|
| Pending remittance legacy overcount | Dashboard counted legacy submitted amounts even when old submission was already confirmed/posted or had posted fund ledger evidence. | Added canonical line resolver and batch ledger evidence lookup; final submissions/lines are excluded before fallback. |
| Overdue cash wrong after UI limit | Overdue summary used displayed rows after slicing. | `DeliveryCashInTransitReportService` now computes `overdueSummary` before limit; dashboard uses service summary. |
| Partial response became success/zero | Frontend rendered `json.data` only, losing top-level `status/errors`, and used `money(value || 0)`. | Frontend renders full payload, displays dash for unavailable, and shows section errors. |
| Confirm modal fail-open | Missing modal elements executed `onConfirm` directly. | Modal now throws and alerts; no browser confirm fallback and no direct submit fallback. |
| Shortage queue name misleading | Queue was named unclassified although schema tracks unresolved/outstanding shortage status. | Backend exposes `unresolvedShortages` plus compatibility alias `unclassifiedShortages`; UI label/filter updated. |
| Dashboard eager reload/race | Init and tab switching could load dashboard while funds screen inactive and old responses could overwrite new filters. | Lazy load on active Funds tab, AbortController, request sequence guard, forced reload only on refresh/date/mutation. |
| Runtime governance gap | New endpoint lacked read budget/OpenAPI contract. | Added budget entry and OpenAPI endpoint. |

## 4. Before/after flow

### Pending remittance

Before:

`DeliveryCashSubmission.aggregate -> remittanceLines pending OR legacy submitted amount -> queue`

After:

`DeliveryCashSubmission.aggregate -> normalize remittanceLines -> exclude final lines -> if no lines, check final submission/fundPosted/fundLedger evidence -> legacy fallback only for unresolved legacy rows -> queue`

### Cash in transit

Before:

`list all rows -> dashboard slices displayed rows -> overdue summary from displayed rows`

After:

`list rows -> service computes full summary/overdueSummary -> service returns limited rows -> dashboard renders limited table but full summary`

### Partial UI

Before:

`GET /api/funds/dashboard -> render json.data -> missing optional section appears as 0`

After:

`GET /api/funds/dashboard -> render full payload -> status partial + section error -> null amount renders dash`

## 5. SSoT table

| Data | SSoT | Phase232 conclusion |
|---|---|---|
| Fund balance | `fundLedgers` via `FundBalanceReadService` | PASS |
| Fund recent transactions | `fundLedgers` via `fundLedgerRepository` | PASS |
| Pending delivery remittance | `deliveryCashSubmissions.remittanceLines` plus posted `fundLedgers` evidence for legacy safety | PASS_WITH_CONCERN: legacy fallback remains for old rows only |
| Delivery cash in transit | AR collected cash + confirmed fund submission ledgers via `DeliveryCashInTransitReportService` | PASS |
| Delivery shortage queue | `deliveryCashShortages` unresolved/outstanding amount | PASS |
| Bank unmatched queue | Not implemented | NEED_RUNTIME_EVIDENCE / explicitly unsupported |

## 6. File changes

| File | Change |
|---|---|
| `src/services/accounting/FundDashboardReadService.js` | Canonical pending remittance resolver, strict `asOf`, section partial contract, unavailable queues, performance timings. |
| `src/domain/settlement/DeliveryCashInTransitReportService.js` | Summary-before-limit, overdue summary, limit/includeItems/summaryOnly support. |
| `public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag` | Dashboard request state and fail-closed confirm modal. |
| `public/js/app/debt/07f-fund-ledger.source/part-01b.jsfrag` | Partial-aware render, dash for unavailable values, abortable dashboard fetch, section error rows. |
| `public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag` | Queue drill-down filters; moved preview functions here to stay under source-size budget. |
| `public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag` | Lazy dashboard load and force reload on refresh/asOf. |
| `public/fragments/index/04-index-body.html` | Shortage queue filter/label normalized to unresolved shortage. |
| `src/config/readEndpointBudgets.js` | Added funds dashboard read budget. |
| `docs/openapi.json` | Added `GET /api/funds/dashboard` contract and partial example. |
| `test/phase232-*.test.js` | Added canonical correctness, partial UI, and runtime governance regression tests. |
| `test/phase231-fund-dashboard-readmodel-ui-static.test.js` | Updated static expectation for abortable fetch. |
| `public/js/app/debt/07f-fund-ledger*.js`, `config/source-bundles.json` | Refreshed generated bundles/hashes from source fragments. |

## 7. Pending remittance truth table

| Case | Expected pending amount |
|---|---:|
| Legacy confirmed submission with `fundPosted: true` | 0 |
| Legacy pending, no posted ledger evidence | Legacy submitted amount |
| Mixed remittance lines: confirmed + submitted + cancelled | Submitted open lines only |
| `canceled` spelling or reversed line | 0 |
| Stale legacy `fundPosted: false` but matching posted fundLedger exists | 0 |

## 8. Partial/error contract

Backend:

- Mandatory section: `balances`.
- Optional sections: `pendingRemittances`, `unresolvedShortages`, `cashInTransit`, `recentTransactions`.
- Optional section failure returns top-level `status: "partial"` and `data.status: "partial"`.
- Unavailable queue values are `{ count: null, amount: null, oldestAgeDays: null }`.
- `data.sections` carries per-section `ok/error` status and duration.

Frontend:

- Renders top-level payload, not only `json.data`.
- Shows dash for `null`/`undefined`, not `0`.
- Keeps previous dashboard data while a refresh is in flight.
- Aborts old dashboard requests and ignores stale responses.

## 9. Performance/security/index changes

| Area | Result |
|---|---|
| Runtime requests | Dashboard is lazy-loaded only when Funds tab is active. |
| Race protection | AbortController + request sequence guard. |
| Payload size | Cash-in-transit table is limited, summary remains full. |
| Source size | `npm run check:source-size` passes after source fragment rebalance. |
| Security | Confirm modal no longer fail-opens into a financial write. |
| Indexes | No index added, removed, or dropped. |
| Writers | No fund writer/remittance/idempotency transaction writer changed. |

## 10. Test evidence

| Command | Result |
|---|---|
| `npm run source-bundles:refresh` | PASS, 19 bundles built |
| `npm run check:source-bundles` | PASS, 19 bundles OK |
| `npm run check:syntax` | PASS, 1401 JavaScript files |
| `npm run check:source-size` | PASS |
| `node --test test/phase232-fund-dashboard-canonical-correctness.test.js test/phase232-fund-dashboard-partial-state-ui.test.js test/phase232-fund-dashboard-runtime-performance.test.js test/phase231-fund-dashboard-readmodel-ui-static.test.js` | PASS, 19 tests |
| `node --test test/fund-delivery-cash-preview-static.test.js test/fund-delivery-cash-update-refresh-static.test.js test/fund-delivery-shortage-repayment.test.js` | PASS, 10 tests |
| `node --test test/phase228-canonical-fund-balance-read-service.test.js test/phase230-delivery-remittance-lines-accounting-date.test.js` | PASS, 33 tests |
| `node --test test/fund-ledger-access-contract-static.test.js test/fund-summary.test.js test/fund-summary-ui-static.test.js` | PASS, 28 tests |
| `node -e "JSON.parse(require('fs').readFileSync('docs/openapi.json','utf8'))"` | PASS |
| `npm test` | FAIL: one static ZIP cleanliness test requires no root `node_modules`; workspace currently has `node_modules`. No app regression failure observed before that failure. |
| `npm run audit:fund-ending-balance` | BLOCKED: MongoDB Atlas IP whitelist/network access. Read-only script performed no writes. |
| `npm run audit:delivery-remittance-accounting-date` | BLOCKED: MongoDB Atlas IP whitelist/network access. Read-only script performed no writes. |

## 11. Runtime smoke checklist

Before deploy:

- Open Funds tab, confirm dashboard loads once and only after tab is active.
- Change `asOf` rapidly; verify older responses do not overwrite the newest view.
- Temporarily force an optional section error in staging; verify partial status and dash rendering.
- Click pending remittance queue; verify delivery submission tab is filtered to actionable rows.
- Click overdue cash queue; verify rows reflect remaining/confirmable old delivery cash.
- Click unresolved shortage queue; verify shortage-related rows are visible.
- Open financial confirmation modal; verify missing modal DOM cannot submit a write.

After deploy:

- Compare dashboard pending remittance amount against manual sample of `remittanceLines` and posted fund ledgers.
- Compare overdue cash KPI with full cash-in-transit service summary, not only first 20 rows.
- Watch logs for `GET /api/funds/dashboard` status partial and section errors.

## 12. Known limitations

- Bank unmatched queue remains intentionally unsupported and displays as unsupported.
- Legacy submitted amount fallback still exists for old unresolved rows without remittance lines; production audit should validate those rows.
- DB audit commands could not reach Atlas from this workspace due IP whitelist/network restriction.
- `npm test` cannot be fully green while `node_modules` exists in repo root, because `test/source-zip-clean-static.test.js` enforces a clean ZIP source root.

## 13. Rollback plan

Rollback files in reverse order if needed:

1. Revert dashboard frontend source fragments and refresh bundles.
2. Revert `FundDashboardReadService.js`.
3. Revert cash-in-transit summary additions.
4. Revert read budget/OpenAPI/test updates.

No data migration or index rollback is needed because Phase232 made no schema/index/data-write changes.

## 14. Deployment checklist

- Run source bundle check on CI.
- Confirm staging has no dashboard partial errors for normal data.
- Run production read-only audits from an IP whitelisted for Atlas:
  - `npm run audit:fund-ending-balance`
  - `npm run audit:delivery-remittance-accounting-date`
- Confirm generated ZIP excludes `node_modules`, `.git`, `.env`, logs, and prior zips.
