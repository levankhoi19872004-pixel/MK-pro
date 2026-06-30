# PHASE89 Runtime Debt Source Unification Report

## 1. Executive Summary

Phase89 xử lý đúng 5 điểm P3 legacy compatibility còn lại sau Phase88. Mục tiêu chính là loại bỏ đường tính công nợ runtime ngoài AR debt read model v2, để mobile/report/frontend không còn tự tính công nợ từ `salesOrders`, `paidAmount`, `remainingDebt`, `debtAmount` hoặc legacy AR category.

Kết quả:

- Đã thêm runtime debt view service chuẩn: `src/services/accounting/arDebtRuntimeView.service.js`.
- Mobile sales runtime chuyển sang lấy công nợ từ AR debt runtime view.
- Mobile legacy service chuyển sang lấy công nợ từ AR debt runtime view.
- Report runtime/debt report chuyển sang AR debt read model v2.
- Frontend mobile sales sync không tự tính công nợ; nếu backend chưa có số chuẩn thì hiển thị trạng thái thiếu dữ liệu.
- `arLedgerMigrationService` được cô lập thành migration/audit/dry-run only và production direct read bị guard.
- Static audit hiện không còn P0/P1/P2/P3 legacy compatibility.

Final Decision: **CONDITIONAL-GO**.

Lý do: các targeted tests, syntax, source bundle, release manifest, docs và audit đều PASS. `npm test` nguyên khối trong sandbox không hoàn thành ổn định do timeout/môi trường test lớn; các test liên quan Phase89 và các static guard bị ảnh hưởng đã được chạy riêng và PASS.

## 2. 5 lỗi P3 ban đầu

| STT | File | Vấn đề ban đầu | Kết quả xử lý |
|---:|---|---|---|
| 1 | `src/services/arLedgerMigrationService.js` | `DIRECT_AR_LEDGER_READ` còn có thể bị hiểu là runtime path | Đánh dấu migration/audit/dry-run only, thêm production guard `ALLOW_AR_MIGRATION_DIRECT_READ` |
| 2 | `src/services/mobile/sales.service.js` | Mobile sales còn tự tính công nợ từ `salesOrders` | Chuyển sang `arDebtRuntimeView.getCustomerDebtMap`; pending order không tự tạo debt kế toán |
| 3 | `src/services/mobileService.js` | Mobile legacy còn nguồn tính nợ kiểu cũ | Redirect sang `arDebtRuntimeView`; không đọc Customer/order cache để tính công nợ |
| 4 | `src/services/reportLegacy.service.js` | Report runtime còn logic legacy debt calc | `debtReport` delegate sang `arCustomerDebtReadModel.debtReport`; sales/dashboard debt lấy qua runtime view |
| 5 | `public/mobile/js/sales/sync.js` | Frontend mobile tự tính công nợ offline | Bỏ công thức `totalAmount - paidAmount`; chỉ dùng field backend hoặc empty state |

## 3. File đã sửa / thêm

### Source runtime

- `src/services/accounting/arDebtRuntimeView.service.js` — service mới, nguồn công nợ runtime chuẩn.
- `src/services/arLedgerMigrationService.js` — cô lập migration/audit direct AR read.
- `src/services/mobile/sales.service.source/part-01.jsfrag`
- `src/services/mobile/sales.service.source/part-02.jsfrag`
- `src/services/mobile/sales.service.source/part-03.jsfrag`
- `src/services/mobile/sales.service.js` — generated bundle sau refresh.
- `src/services/mobileService.js`
- `src/services/reportLegacy.service.source/part-01.jsfrag`
- `src/services/reportLegacy.service.source/part-02.jsfrag`
- `src/services/reportLegacy.service.source/part-03.jsfrag`
- `src/services/reportLegacy.service.js` — generated bundle sau refresh.
- `public/mobile/js/sales/sync.js`
- `scripts/lib/globalRuleAuditCore.js`
- `config/source-bundles.json`

### Tests added/updated

- `test/mobile-sales-uses-ar-debt-runtime-view.test.js`
- `test/mobile-sales-does-not-calculate-debt-from-sales-orders.test.js`
- `test/mobile-service-legacy-debt-redirects-to-ar-v2.test.js`
- `test/report-runtime-uses-ar-debt-v2.test.js`
- `test/report-legacy-debt-calc-is-audit-only.test.js`
- `test/frontend-mobile-sales-no-debt-calculation.test.js`
- `test/ar-ledger-migration-service-not-runtime.test.js`
- `test/production-blocks-direct-ar-ledger-migration-read.test.js`
- `test/no-runtime-sales-order-debt-calculation.test.js`
- Updated legacy/static tests that previously expected `DebtReadService`, `ArLedger.aggregate`, or AR-SALE staff seed markers in runtime report path.

## 4. Runtime debt source contract mới

Runtime debt source duy nhất:

```js
{
  customerCode,
  customerName,
  currentDebtAmount,
  debtSource: 'AR_DEBT_READ_MODEL_V2',
  calculatedAt,
  orderDebts
}
```

Allowed AR categories for runtime debt:

```text
AR-DEBT-OPEN
AR-DEBT-PAYMENT
AR-DEBT-ADJUSTMENT
AR-DEBT-VOID
```

Không được tính runtime debt từ:

```text
salesOrders.totalAmount
paidAmount
remainingDebt
debtAmount
totalAmount - paidAmount
debtBeforeCollection
AR-SALE / AR-RETURN / AR-RECEIPT legacy
```

## 5. Mobile debt flow sau sửa

Mobile sales và mobile legacy service không còn tự tính công nợ từ đơn. Backend lấy danh sách customer code, gọi:

```js
arDebtRuntimeView.getCustomerDebtMap(customerCodes, { status: 'all' })
```

Sau đó trả các field:

```js
currentDebtAmount
debtAmount
debtSource
```

Với đơn mobile mới/pending chưa kế toán xác nhận, service không tự tạo công nợ kế toán; trả trạng thái:

```text
PENDING_ACCOUNTING_NOT_AR_DEBT
```

## 6. Report debt flow sau sửa

`reportLegacy.service.js` vẫn giữ tên file legacy để tương thích route cũ, nhưng runtime debt report không còn tự classify legacy AR. `debtReport()` delegate sang:

```js
arCustomerDebtReadModel.debtReport(query)
```

Sales/dashboard report lấy debt summary qua:

```js
arDebtRuntimeView.getDebtSummary({ status: 'all' })
```

## 7. Frontend mobile sau sửa

`public/mobile/js/sales/sync.js` không còn tự tính:

```text
totalAmount - paidAmount
remainingDebt fallback
debtAmount fallback
```

Nếu backend chưa trả `currentDebtAmount`, UI dùng empty state:

```text
Chưa có dữ liệu công nợ
```

## 8. Legacy migration/audit isolation

`arLedgerMigrationService` còn quyền đọc trực tiếp `ArLedger` chỉ trong mục đích migration/audit/dry-run. Production bị chặn nếu không bật rõ:

```text
ALLOW_AR_MIGRATION_DIRECT_READ=true
```

Đây không phải runtime debt source và không được mobile/report route dùng mặc định.

## 9. Static guard đã thêm

`test/no-runtime-sales-order-debt-calculation.test.js` quét runtime paths để chặn:

```text
totalAmount - paidAmount
remainingDebt ||
debtAmount ||
SALES_ORDER_DEBT_CALC
DIRECT_AR_LEDGER_READ trong runtime
currentDebt = order.
debt = order.totalAmount
```

Guard cho phép legacy/audit/migration có nhãn rõ, nhưng không cho runtime mobile/report/frontend tự tính công nợ.

## 10. Test added/updated

Targeted Phase89 tests PASS:

```text
node --test test/mobile-sales-uses-ar-debt-runtime-view.test.js \
  test/mobile-sales-does-not-calculate-debt-from-sales-orders.test.js \
  test/mobile-service-legacy-debt-redirects-to-ar-v2.test.js \
  test/report-runtime-uses-ar-debt-v2.test.js \
  test/report-legacy-debt-calc-is-audit-only.test.js \
  test/frontend-mobile-sales-no-debt-calculation.test.js \
  test/ar-ledger-migration-service-not-runtime.test.js \
  test/production-blocks-direct-ar-ledger-migration-read.test.js \
  test/no-runtime-sales-order-debt-calculation.test.js
```

Expanded affected static tests also PASS, including:

```text
ar-posting-service-boundary-static
ar-return-debt-scoped-static
dashboard-summary-only
external-debt-report-scope-static
debt-read-model-ar-return-contract
mobile-sales-phase4-architecture
prompt5-salesorder-debt-cache-static
report-debt-arledgers-only-static
staff-identity-rules-static
```

## 11. Command results

| Command | Result |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 1160 JavaScript files` |
| `npm run check:source-bundles` | PASS — `OK 19 bundles` |
| `npm run check:release-manifest` | PASS — `RELEASE_MANIFEST_OK 2026-06-30-01` |
| `npm run docs:check` | PASS — `OpenAPI document is up to date. Scanned operations: 343` |
| `node scripts/audit-global-software-rules.js --strict` | PASS — issue count 0 |
| `node scripts/audit-ar-access-violations.js --strict` | PASS — issue count 0 |
| `node scripts/audit-inventory-access-violations.js --strict` | PASS — issue count 0 |
| `node scripts/audit-fund-access-violations.js --strict` | PASS — issue count 0 |
| `node scripts/audit-frontend-business-calculation.js --strict` | PASS — issue count 0 |
| Targeted/affected tests | PASS — 44/44 |
| `npm test` nguyên khối | CONDITIONAL — sandbox timeout; không dùng làm bằng chứng GO tuyệt đối |

## 12. Risks còn lại

1. `reportLegacy.service.js` vẫn còn nhiều helper legacy cho report khác; runtime debt report đã được chuyển sang v2, nhưng nên cleanup sâu ở phase riêng.
2. Một số test legacy cũ vẫn có tên/mô tả `arLedgers`, `AR-SALE`, hoặc `DebtReadService`; đã cập nhật những test ảnh hưởng trực tiếp, phần còn lại nên dọn trong phase cleanup test wording.
3. Full `npm test` trên sandbox có timeout do test suite lớn và có các test khởi động server; cần chạy lại trên máy/CI thật với thời gian dài hơn để chốt GO tuyệt đối.

## 13. Backlog migration/cleanup

- Phase90/91: xóa hoặc archive helper legacy trong `reportLegacy.service` sau khi xác nhận không còn route/runtime dùng.
- Tạo migration dry-run để map legacy debt sang AR-DEBT-* nếu cần dứt điểm dữ liệu cũ.
- Chuẩn hóa tên test legacy để không còn nhầm với kiến trúc công nợ v2.

## 14. Final Decision

**CONDITIONAL-GO**

Có thể dùng để kiểm thử chức năng và deploy có kiểm soát nếu CI thật chạy full `npm test` pass. Không nên coi đây là GO tuyệt đối trong sandbox vì `npm test` nguyên khối không hoàn tất ổn định do timeout.

## 15. SHA256

SHA256 được ghi trong file `phase89-sha256.txt` đi kèm output.
