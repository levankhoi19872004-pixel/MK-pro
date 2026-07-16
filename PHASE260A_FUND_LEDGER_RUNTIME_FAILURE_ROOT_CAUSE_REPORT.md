# PHASE260A Fund Ledger Runtime Failure Root Cause Report

## 1. Trieu Chung Production

Man hinh Quy tien -> So quy goi `GET /api/funds/ledger` va nhan HTTP 500. UI hien thi loi tai so quy fundLedgers, bang hien thi khong tai duoc so quy fundLedgers, KPI mac dinh de 0 nen de bi hieu nham la du lieu that.

## 2. Luong Request

`/api/funds/ledger` -> `fundController.listLedger()` -> `fundService.listFundLedgers()` -> `FundBalanceReadService.listFundLedgers()` -> `fundLedgerRepository.aggregate()`.

Read path chay 2 aggregation tach rieng:

- `buildSummaryPipeline(filters)` cho balance/KPI summary.
- `buildRowsPipeline(filters)` cho rows, count, filtered transaction totals va running balance.

## 3. Exact Exception

Da reproduce bang pipeline MongoDB that, read-only:

- `error.name`: `MongoServerError`
- `error.code`: `34471`
- `error.codeName`: `Location34471`
- `error.message`: `PlanExecutor error during aggregation :: caused by :: $strLenCP requires a string argument, found: missing`
- Failing operations: ca `summary` va `rows`
- Before stage counts: summary 11, rows 12

## 4. Root Cause

`normalizationStages()` tao `_fundOwnershipGroupKey` va `_fundOwnershipPartitionKey` trong cung mot `$set` stage. Mongo aggregation khong cho expression trong cung `$set` doc field vua duoc tao cung stage, nen khi `_fundOwnershipPartitionKey` goi:

`$strLenCP: '$_fundOwnershipGroupKey'`

Mongo nhin field do la `missing` va throw code `34471`.

## 5. Vi Sao Test Cu Khong Bat Duoc

Test hien co chu yeu dung `calculateFixture()` pure JS hoac static checks. No khong chay Mongo aggregation pipeline that, nen khong phat hien semantics "same `$set` cannot read sibling computed field".

## 6. Pipeline Nao Fail

Ca summary pipeline va rows pipeline fail tai normalization stage truoc khi co business result. Day khong phai loi `$setWindowFields` running balance, khong phai memory spill, khong phai historical ownership business rule.

## 7. File/Function Gay Loi

- `src/services/accounting/FundBalanceReadService.js`
- Function: `normalizationStages()`
- Field: `_fundOwnershipPartitionKey`

## 8. Cach Sua

Tach `_fundOwnershipPartitionKey` sang `$set` stage rieng sau stage tao `_fundOwnershipGroupKey`. Sau fix:

- Summary pipeline stage count: 12
- Rows pipeline stage count: 13
- `GET /api/funds/ledger` read path chay thanh cong voi no filter, date filter, q filter, direction filter, sourceType filter.

## 9. Khong Anh Huong Fund Writer

Phase nay chi sua read service, repository read options, frontend render/cache token, tests va reports. Khong sua posting, remittance confirmation, transfer writer, expense writer, cashier handover hay accounting confirmation.

## 10. Historical Ownership Invariant

Giữ Phase258B/258C:

- `ORDER_PAYMENT_ALLOCATION` khong duoc tai kich hoat lam owner ghi Fund movement cho delivery remittance.
- `DELIVERY_CASH_SUBMISSION` van la canonical Fund owner.
- OPA/DCS duplicate historical rows van duoc classify va khong double-count.

## 11. Phase259 Scope Invariant

Fund Ledger tiep tuc la `MIXED_SCOPE`:

- Balance KPI: `GLOBAL_EXPLICIT_SCOPE`, bo qua `q`, `direction`, `sourceType`.
- Transaction totals: `EXACT_SCOPE` theo `dateFrom`, `dateTo`, `fundType`, `account`, `q`, `direction`, `sourceType`.

## 12. Performance Benchmark

Read-only benchmark sau fix voi `dateFrom=2026-07-01`, `dateTo=2026-07-16`, `limit=200`:

- Matching rows: 488
- Output rows: 200
- Summary aggregation: 3636 ms cold
- Rows aggregation: 4000 ms cold
- Total parallel request duration: 4282 ms cold
- Warm service duration: 281 ms

Khong bat `allowDiskUse` vi exact root cause la correctness/type-stage, khong co evidence memory/disk spill.

## 13. Cache Invalidation Fix

Da bump 5 asset Fund Ledger tu:

`phase230-remittance-lines-v1`

sang:

`phase260-fund-ledger-runtime-fix-v1`

trong `public/fragments/index/07-index-body.html`.

## 14. Tests Da Them

Them `test/phase260a-fund-ledger-runtime-read-recovery.test.js`:

- Guard stage `_fundOwnershipPartitionKey` phai sau `_fundOwnershipGroupKey`.
- Production-like fixture: cash/bank receipt/payment, OPA/DCS duplicate, opening balance, exact filters.
- Successful service response: rows, summary, pagination, scope.
- Error classification: summary vs rows.
- Frontend contract: KPI error dash va current asset token.

## 15. Commands Da Chay

- `node --test test/phase260a-fund-ledger-runtime-read-recovery.test.js test/phase228-canonical-fund-balance-read-service.test.js test/phase258b-delivery-fund-double-posting-retirement.test.js test/phase258c-historical-fund-ownership-reconciliation.test.js test/phase259-filter-kpi-scope-governance.test.js test/fund-ledger-customer-counterparty-ui.test.js test/fund-voucher-popup-layout-static.test.js`
- `npm run check:syntax`
- `npm run source-bundles:refresh`
- `npm run check:source-bundles`
- `npm run check:source-size`
- `npm run docs:check`
- `npm run build:source-bundles`
- `npm test`
- `node scripts/benchmark-fund-ledger-read.js --date-from 2026-07-01 --date-to 2026-07-16 --limit 200`

## 16. PASS/FAIL

PASS:

- Targeted Phase260A/Fund/Phase258B/Phase258C/Phase259 tests: 52 pass.
- Syntax: pass.
- Build source bundles: pass.
- Source bundles: pass.
- Source size: pass.
- Docs check: pass.

Full `npm test`: fail baseline/unrelated, no new Fund Ledger regression observed.

## 17. Baseline Failures Khong Lien Quan

Khong sua unrelated historical/baseline tests trong phase nay. Full `npm test` con fail o cac nhom:

- `app-trust-proxy-static.test.js`: `createApp() must exist`; pre-existing contract drift, khong lien quan Fund Ledger.
- `sales-order-delete-ui-scoped-static.test.js`: expected route regex khong tinh authorization middleware; pre-existing contract drift.
- `sales-order-flow.test.js` va `sales-order-pending-cancel-no-stock-reversal.test.js`: legacy sales-order cancel tests throw undefined status; pre-existing contract drift.
- `source-artifact-clean-verifier.test.js`: artifact verifier clean ZIP case fail; environment/artifact baseline, khong lien quan Fund Ledger runtime pipeline.

## 18. Rui Ro Con Lai

- Benchmark cold query con co lan dau cham hon warm service; can explain/index audit rieng neu production traffic lon.
- Khong them index moi vi phase nay khong co explain evidence yeu cau index.
- Response production van khong expose Mongo internals; server log structured event `fund_ledger_read_failed` moi la noi dieu tra exact operation/error.
