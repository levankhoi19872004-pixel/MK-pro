# PHASE233 Full Regression Gate Repair, Fund Dashboard Read Budget & Artifact Validation Hardening

## Executive Summary

Phase233 repaired the remaining full-regression gates after Phase232 without changing financial writers, Mongo schema, Mongo indexes, or production data.

Final result:

- The four reproduced failures now pass.
- `npm test` passes in a development workspace that contains `node_modules`.
- Artifact cleanliness is now checked against the actual ZIP/staging artifact, not the development workspace.
- Fund Dashboard read budget now has a bounded aggregate contract backed by source-level checks.
- Phase232 dashboard guarantees remain covered and passing.

## A. Root Cause

| Test FAIL | Nguyên nhân | Loại lỗi | Hướng sửa |
|---|---|---|---|
| `test/fund-delivery-submission-split-tabs-static.test.js` | Test asserted old labels: `Báo cáo TM`, `Thực nộp TM`, `Báo cáo TK`, `Thực nhận TK`. | Stale UI test | Updated assertions to current business labels: `Phải nộp`, `Đã khai báo nộp`, `Đã xác nhận nhận`, `Còn thiếu/thừa`, `Đối soát`, `Ghi quỹ`, while retaining tab/panel/table identity checks. |
| `test/phase79-production-strangler.test.js` | Approved assembled-index hash still referenced pre-dashboard HTML. | Stale characterization snapshot | Reviewed Phase231/232 index fragment changes and updated `test/fixtures/index-page/phase79-assembled.sha256` from old hash to current assembled hash. |
| `test/read-request-budget-static.test.js` | `fundsDashboard` declared `requiresPagination: false` without a formal bounded aggregate contract. | Real governance/performance gap | Added bounded aggregate metadata and source-level governance checks; changed pending remittance and cash-in-transit read paths to aggregate server-side and DB-limit item rows. |
| `test/source-zip-clean-static.test.js` | Test checked dev workspace root and failed because `node_modules` exists for local testing. | Test infrastructure wrong target | Split workspace source check from artifact verification; added reusable ZIP/directory artifact verifier and tests proving dirty ZIPs fail. |

## B. File Thay Đổi

| File | Loại thay đổi | Lý do | Rủi ro |
|---|---|---|---|
| `test/fund-delivery-submission-split-tabs-static.test.js` | Test update | Align with approved Phase231/232 labels while preserving split-tab contract. | Low |
| `test/fixtures/index-page/phase79-assembled.sha256` | Snapshot hash update | Approved assembled HTML changed due Fund Dashboard/modal/queue label. | Medium, mitigated by Phase79 test |
| `src/services/accounting/FundDashboardReadService.js` | Read-only backend hardening | Pending remittance summary now aggregates server-side and no longer hydrates all submissions into Node. | Medium |
| `src/domain/settlement/DeliveryCashInTransitReportService.js` | Read-only backend hardening | Cash-in-transit now uses aggregation pipeline with `$unionWith`, `$facet`, summary, and item `$limit`. | Medium |
| `src/config/readEndpointBudgets.js` | Budget contract | `fundsDashboard` declares bounded aggregate evidence fields. | Low |
| `test/read-request-budget-static.test.js` | Governance test | Allows bounded aggregate only with required evidence fields and source checks. | Low |
| `test/source-zip-clean-static.test.js` | Test target correction | Dev workspace may contain `node_modules`; shipping artifact must not. | Low |
| `scripts/verify-source-artifact-clean.js` | New verifier | Checks ZIP/directory artifacts for forbidden files without unsafe extraction. | Low |
| `test/source-artifact-clean-verifier.test.js` | New tests | Proves verifier passes clean ZIP and fails dirty ZIPs with `node_modules`, `.env`, nested archive. | Low |
| `package.json` | Script addition | Adds `npm run test:artifact-clean -- --zip <zip>`. | Low |
| `docs/openapi.json` | API doc update | Documents `recentLimit` query parameter for dashboard. | Low |
| `test/phase232-fund-dashboard-runtime-performance.test.js` | Static test update | Protects new stronger `$facet/$unionWith` cash-in-transit contract. | Low |

No business writer was changed. No Mongo schema/index/data migration was introduced.

## C. Dashboard Budget

| Section | Query bound | Item limit | Summary strategy | Index |
|---|---|---|---|---|
| `balances` | `asOf` day scope through `FundBalanceReadService` | No item list | Canonical fundLedger aggregate | Existing fund ledger indexes only |
| `pendingRemittances` | `deliveryDate <= asOf`, status excludes final/cancelled/reversed | Summary only | Mongo aggregate computes pending amount, line count, oldest date; posted fund ledger evidence checked with `$lookup` + `$limit: 1` | Existing delivery submission/fund ledger indexes only |
| `unresolvedShortages` | `deliveryDate <= asOf`, unresolved statuses, `outstandingAmount > 0` | Summary only | Mongo `$group` summary | Existing shortage indexes only |
| `cashInTransit` | date filters pushed into AR/fund ledger aggregation | `cashInTransitLimit`, max 100 | `$unionWith` AR + fundLedgers, `$facet` for summary and bounded rows | Existing AR/fund ledger indexes only |
| `recentTransactions` | `accountingDate/date <= asOf` | `recentLimit`, max 50 | Repository `findAll` with projection, indexed sort, limit | Existing fund ledger indexes only |

Budget contract:

- `boundedAggregate: true`
- `defaultLimit: 20`
- `maxReturnedRows: 100`
- `summaryOnlySections: balances, pendingRemittances, unresolvedShortages`
- `itemSections: cashInTransit, recentTransactions`

## D. Snapshot Review

| Artifact | Hash cũ | Hash mới | Diff hợp lệ |
|---|---|---|---|
| Assembled `public/index.html` via `test/helpers/readPublicIndex.js` and `config/index-page-fragments.json` | `b0e9b5acba28161076c235d4e5b2e507364832fd3910cffcd0d0a05810b654a4` | `26e8ff360c662d96cd20a033153ec8f58d7643d38085a95dc11385233fe2a6d4` | Yes |

Reviewed changes causing hash drift:

- Valid Phase231/232 Fund Dashboard HTML and queue changes in `public/fragments/index/04-index-body.html`.
- Financial confirm modal/dashboard components already covered by Phase231/232 static tests.
- Shortage queue changed from `unclassifiedShortages` to `unresolvedShortages` with label `Thiếu quỹ còn tồn`.
- No unrelated module removal was observed in the index fragment diff.
- No generated bundle was hand-edited in Phase233.

## E. Test Evidence

| Command | Kết quả | Số pass/fail/skip | Ghi chú |
|---|---|---:|---|
| `node --test test/fund-delivery-submission-split-tabs-static.test.js` | PASS | 4/0/0 | UI split-tab labels updated to current contract. |
| `node --test test/phase79-production-strangler.test.js` | PASS | 5/0/0 | Snapshot hash updated after review. |
| `node --test test/read-request-budget-static.test.js` | PASS | 4/0/0 | Bounded aggregate contract enforced. |
| `node --test test/source-zip-clean-static.test.js test/source-artifact-clean-verifier.test.js` | PASS | 3/0/0 | Workspace and artifact checks separated. |
| Phase232 regression command | PASS | 19/0/0 | Canonical pending, partial UI, lazy/abortable dashboard still pass. |
| Fund regression command | PASS | 71/0/0 | Fund balance/remittance/shortage/summary regressions pass. |
| `npm run check:syntax` | PASS | 1403 JS files | Syntax OK. |
| `npm run check:source-bundles` | PASS | 19 bundles | No source bundle drift. |
| `npm run check:source-size` | PASS | N/A | Source size OK. |
| `git diff --check` | PASS | N/A | Only LF/CRLF warnings from Git. |
| `npm test` | PASS | Full suite pass; one optional fixture skip observed | Runs successfully with `node_modules` present. |
| `npm run audit:fund-ending-balance` | BLOCKED | N/A | MongoDB Atlas IP whitelist/network access blocked; read-only script reported `AUDIT_FAILED`. |
| `npm run audit:delivery-remittance-accounting-date` | BLOCKED | N/A | MongoDB Atlas IP whitelist/network access blocked; read-only script reported `AUDIT_FAILED`, `writesPerformed: 0`. |

## F. Artifact Evidence

Final artifact checked:

`MK-pro-phase233-full-regression-gate-read-budget-artifact-clean-fixed.zip`

| Kiểm tra | Kết quả |
|---|---|
| Không có `node_modules` | PASS |
| Không có `.git` | PASS |
| Không có `.env` / `.env.*` secret | PASS |
| Không có ZIP lồng | PASS |
| Không có log/dump/backup | PASS |
| Không có secret/private key/token filename | PASS |
| Không có phase/work directory lồng sai | PASS |

Verifier:

`npm run test:artifact-clean -- --zip MK-pro-phase233-full-regression-gate-read-budget-artifact-clean-fixed.zip`

## Notes

- No `fundLedgers` writer was changed.
- No remittance writer was changed.
- No idempotency/posting guard was changed.
- No Mongo schema, index, or data migration was performed.
- Full `npm test` final result: PASS.
