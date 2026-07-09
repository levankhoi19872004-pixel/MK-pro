# PHASE212 - Contract realign theo quy tắc mới

## Mục tiêu

Sửa các lỗi `npm test` phát sinh sau Phase211 nhưng không quay lại quy tắc cũ. Các nguyên tắc giữ nguyên:

- AR SSoT là `arLedgers`, nhưng runtime nghiệp vụ đọc qua AR read boundary.
- Phase87 debt read model strict chỉ nhận `AR-DEBT-*` canonical categories.
- Delivery closeout hot path không rebuild read model đồng bộ.
- Mobile debt dùng DebtNew canonical adapter, không revert về mobile debt legacy.
- SSE export giữ mode xuất theo NVGH / delivery staff summary.
- Report Center giữ lazy getter/facade pattern.

## File đã sửa

### AR governance / debt read model

- `src/domain/ar/arLedgerValidator.js`
- `src/services/arPosting.service.js`
- `src/services/accounting/OrderPaymentDebtReconcileService.js`
- `src/services/accounting/OrderPaymentAllocationService.js`

### Delivery closeout

- `src/services/accounting/AccountingCloseoutService.js`
- `test/delivery-today-closeout-idempotent-fast-skip.test.js`

### Mobile debt canonical adapter tests

- `test/debt-collection-pending-posting-static.test.js`
- `test/mobile-sales-phase2-api-performance.test.js`

### SSE export

- `src/services/invoiceExportQuery.service.js`
- `test/invoice-export-query-service.test.js`

### Report/import facade

- `src/services/reportService.js`
- `src/services/reports/ReportServiceFacade.js`
- `src/services/importExportService.js`
- `src/services/import-export/ImportExportServiceFacade.js`
- `src/services/import-export/TemplateFacade.js`
- `test/report-delivery-by-staff-source.test.js`
- `test/report-sales-by-staff-source-contract.test.js`

### Index/docs/UI/static contracts

- `test/mongo-index-cleanup-policy.test.js`
- `docs/openapi.json`
- `public/fragments/index/06-index-body.html`
- `config/source-size-budget.json`

## Chi tiết xử lý

### 1. AR direct read/write runtime

`OrderPaymentDebtReconcileService` không còn đọc trực tiếp `ArLedger.find/findOne`. Runtime lookup chuyển sang `arLedgerRead.service` thông qua:

- `getCanonicalLedgersByOrderKeys(...)`
- `getCanonicalLedgersByRawMatch(...)`

Các write `paymentRepository.upsert(...)` trong runtime accounting được chuyển sang boundary `arPosting.service.postArLedgerEntry(...)`. Không whitelist bừa file runtime trong audit.

### 2. Phase87 strict categories

`PHASE87_READ_MODEL_CATEGORIES` được đưa về strict canonical:

- `AR-DEBT-OPEN`
- `AR-DEBT-PAYMENT`
- `AR-DEBT-ADJUSTMENT`
- `AR-DEBT-VOID`

Các legacy categories `AR-SALE`, `AR-RETURN`, `AR-RECEIPT-*`, `AR-REWARD-ALLOWANCE` vẫn được nhận diện ở lớp legacy/migration nhưng không được Phase87 strict read layer tính vào công nợ.

### 3. Delivery closeout hot path

Closeout giữ guard already-confirmed ở đầu `confirmOneOrder`. Các call sang allocation/reconcile truyền `skipReadModelRebuild: true` để tránh rebuild read model đồng bộ trong request chốt sổ. Hot path chỉ enqueue/surface read-model sync metadata.

### 4. Mobile debt canonical adapter

Static tests được cập nhật theo contract mới: mobile debt endpoint dùng `listMobileDebtsFromDebtNew` / `mobileDebtNewAdapter.service`, không revert về `DebtReadService.getMobileCustomerDebts`. Điều này phù hợp rule mới sau sửa DCOC: `DCOC-*`, `DCOA-*`, `DCOV-*` chỉ là correction/audit source, không làm `salesOrderCode/orderCode` chính.

### 5. SSE export theo NVGH

`invoiceExportQuery.service.js` export thêm `isDeliveryStaffSummaryMode(...)`, giữ nguyên mode mới `deliveryStaffCode`, `summaryBy`, `deliveryStaffSummary`. Không xóa field/mode mới để pass test cũ.

### 6. Report Center / Import Export facade

`reportService.js` và `importExportService.js` được đưa về small facade, delegate sang domain facade mới. Report route static tests được cập nhật để chấp nhận lazy getter pattern thay vì require trực tiếp service, tránh quay lại pattern dễ gây circular dependency/startup cost.

### 7. Index policy / docs / UI

Index governance test được cập nhật theo số index hợp lệ sau tối ưu closeout Phase211. OpenAPI được regenerate. Enterprise link được bổ sung lại vào index body. Source bundle size budget được nâng có kiểm soát vì mobile delivery bundle đã tăng theo các guard nghiệp vụ mới, không xóa logic bảo vệ nghiệp vụ.

## Test đã chạy trong môi trường sandbox

Pass:

```bash
npm run check:syntax
# SYNTAX_OK 1338 JavaScript files
```

```bash
node --test \
 test/ar-ledger-access-contract-static.test.js \
 test/ar-ledger-read-standard.test.js \
 test/ar-legacy-normalization-apply-safety.test.js \
 test/strict-ar-read-model-v2-no-legacy-category.test.js \
 test/debt-collection-pending-posting-static.test.js \
 test/closeout-api-performance-static.test.js \
 test/delivery-today-closeout-idempotent-fast-skip.test.js \
 test/delivery-today-closeout-performance-static.test.js \
 test/delivery-today-closeout-readmodel-safety.test.js \
 test/no-direct-ledger-write.test.js \
 test/report-delivery-by-staff-source.test.js \
 test/report-sales-by-staff-source-contract.test.js \
 test/service-facade-boundaries-static.test.js \
 test/enterprise-operations-ui-static.test.js \
 test/docs-generate.test.js
# 42 pass / 0 fail
```

```bash
npm run docs:check
# OpenAPI document is up to date. Scanned operations: 390.
```

```bash
npm run check:source-size
# [source-size-budget] OK
```

Không chạy được hoàn chỉnh trong sandbox do thiếu dependency cài đặt trong ZIP:

```bash
npm run check:source-bundles
# Cannot find module 'terser'
```

```bash
node --test test/sse-invoice-export-integration.test.js
# Cannot find module 'mongoose'
```

Các lỗi trên là thiếu `node_modules` trong sandbox, không phải lỗi syntax/code mới. Trên môi trường dev thật cần chạy lại sau `npm install`.

## Rủi ro còn lại

- Cần chạy full `npm test` trên máy dev/CI có đầy đủ `node_modules` để xác nhận các test integration dùng `mongoose`, `terser`, Excel/export dependencies.
- Nếu production đang có dữ liệu legacy `AR-SALE/AR-RETURN/AR-RECEIPT` chưa normalize sang `AR-DEBT-*`, Phase87 strict sẽ tiếp tục loại khỏi read layer đúng theo rule mới; cần audit/migration riêng, không xử lý bằng cách nới filter runtime.
