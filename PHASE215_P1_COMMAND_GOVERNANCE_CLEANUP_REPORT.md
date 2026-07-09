# PHASE215 - P1 Command Governance Cleanup Report

## 1. Mục tiêu

Phase215 mở rộng nền governance của Phase214 từ nhóm P0 sang nhóm P1/P2 có khả năng sinh request nặng hoặc side effect lớn:

- Import Excel commit
- DMS commit hạn mức bán App
- Xuất Excel SSE
- Tạo backup
- Reset dữ liệu
- Nhập kho đơn trả
- Thủ kho xác nhận hàng trả

Nguyên tắc giữ nguyên: không quay về logic cũ, không bỏ validate kế toán/kho/công nợ, không rebuild read model đồng bộ trong hot path, không xóa code khi chưa chứng minh không dùng.

## 2. Baseline Phase214 trước khi sửa

Đã chạy kiểm tra trên Phase214 trước khi sửa. Các check source/bundle/size pass. `npm test` phát hiện các lệch contract/static cần xử lý trước khi mở rộng cleanup:

- Runtime reference tới `inventorySnapshots` trong command contract gây fail static rule no legacy inventory snapshot.
- Import template facade expose alias legacy enumerable làm lệch contract 7 public methods.
- ReportService facade thiếu static marker cho lazy-load invoice export path.
- Debt New grouping nhận nhầm legacy/dirty AR categories trong trường hợp bridge canonical.
- Popup modal static contract cũ vẫn yêu cầu reload full list sau closeout/adjustment, trái rule Phase214 patch UI.
- Phase79 assembled index snapshot hash chưa realign với index đã được approve từ Phase214.

Các lỗi trên đã được phân loại và xử lý theo rule mới, không revert về logic cũ.

## 3. File đã sửa/thêm

### Backend / Domain

- `src/config/actionCommandContracts.js`
- `src/utils/commandTelemetry.js`
- `src/controllers/importExportController.js`
- `src/controllers/importRuntimeController.js`
- `src/controllers/dmsInventoryController.js`
- `src/controllers/systemController.js`
- `src/controllers/returnOrderController.js`
- `src/services/mobile/warehouseReturnCheck.service.js`
- `src/services/import-export/TemplateFacade.js`
- `src/services/import-export/ImportExportServiceFacade.js`
- `src/services/reportService.js`
- `src/domain/ar/arLedgerValidator.js`
- `src/services/v2/debtNew.service.js`

### Frontend

- `public/js/app/admin/08d-import-excel.source/part-03.jsfrag`
- `public/js/app/admin/08d-import-excel.js`
- `public/js/app/admin/08d-import-excel.part03.js`
- `public/js/app/10-dms-inventory.js`
- `public/js/app/09-system.js`
- `config/source-bundles.json`

### Docs / Cleanup / Tests

- `docs/ACTION_CONTRACT_MATRIX.md`
- `docs/CODEBASE_CLEANUP_REPORT.md`
- `test/phase215-p1-command-governance-static.test.js`
- `test/popup-modal-message-scope-static.test.js`
- `test/fixtures/index-page/phase79-assembled.sha256`
- `PHASE215_P1_COMMAND_GOVERNANCE_CLEANUP_REPORT.md`

## 4. Action contracts đã bổ sung

Đã bổ sung/hoàn thiện các command P1/P2 trong `src/config/actionCommandContracts.js` và `docs/ACTION_CONTRACT_MATRIX.md`:

| Action | Request budget | Read model sync | Side effect chính |
|---|---:|---|---|
| Import các dòng đã chọn | 1 command + bounded poll nếu async | enqueue/none theo import type | `import_sessions`, `salesOrders`, `inventories`, `stockTransactions`, `customers` khi auto-create |
| Xác nhận cập nhật hạn mức bán App DMS | 1 command | none/enqueue scoped | DMS comparison/quota commit trong transaction |
| Xuất Excel SSE | 1 export request | none | Không ghi DB; optional `exportArtifacts` nếu error report |
| Tạo backup | 1 command hoặc queued | none | backup artifact/checksum |
| Reset dữ liệu | 1 dangerous command | none | reset canonical collections theo role/env guard |
| Nhập kho đơn trả | 1 command | enqueue inventory scoped nếu cần | returnOrders/stockTransactions/inventories qua lifecycle boundary |
| Thủ kho xác nhận hàng trả | 1 command | none | warehouse check state; không post stock trực tiếp |

## 5. Frontend request governance

### Import Excel commit

- Thêm `runImportCommandOnce('import.commit', ...)` để chống double submit.
- Thêm `AbortController` cho import commit polling.
- Dừng polling cũ khi có poll mới hoặc khi final cleanup.
- Không gọi commit theo từng dòng.

### DMS inventory

- Thêm `runDmsCommandOnce('dms.commit', ...)` cho commit hạn mức bán App.
- `loadDmsInventory` và `openHistory` có AbortController, tránh response cũ render đè response mới.

### System backup/reset

- Thêm `runSystemCommandOnce('system.backup'/'system.reset', ...)`.
- Reset không còn cascade reload toàn bộ module như products/customers/stock/sales/debt ngay sau command.

## 6. Backend telemetry / command boundary

Đã dùng `src/utils/commandTelemetry.js` cho các command P1:

- Import commit qua `importExportController.commitImport`
- Import runtime commit qua `importRuntimeController.commit`
- DMS commit qua `dmsInventoryController.commit`
- SSE/Excel export qua `importExportController.exportExcelDirect`
- Backup/reset qua `systemController`
- Return stock-in qua `returnOrderController.stockIn`
- Warehouse return confirm qua `warehouseReturnCheck.service.confirm`

Với file download như SSE Excel, không phá binary response; telemetry được đưa qua header an toàn hoặc chỉ gắn vào JSON response khi response không phải buffer.

## 7. AR/debt read-model realignment phát sinh khi chạy full test

Trong Phase215, giữ đúng phân tầng:

- `buildCanonicalArLedgerMatch`/strict Phase87 vẫn chỉ match `AR-DEBT-*`.
- Legacy/dirty AR-SALE/AR-RETURN/AR-RECEIPT từ closeout/correction source không feed Phase87.
- Detailed categories từ `ORDER_PAYMENT_ALLOCATION` được phép qua bridge nếu full canonical contract.

Sửa chính ở `canProjectCanonicalAccountingLedgerToDebtReadModel`: non-`AR-DEBT-*` chỉ project khi `sourceType = ORDER_PAYMENT_ALLOCATION` và contract hợp lệ. Điều này giữ được rule mới mà không quay về legacy AR.

## 8. Dead-code cleanup

- Chạy `scripts/audit-dead-code.js` kết quả OK.
- Không xóa mù code trong Phase215.
- `docs/CODEBASE_CLEANUP_REPORT.md` được cập nhật theo chính sách candidate-only.
- Không xóa các phần đang dùng: DMS simulator, display-check manager, SSE export, Phase23+ app giao hàng, DebtNew canonical adapter, AR governance files.

## 9. Query/index governance

Phase215 không thêm index mới. Các thay đổi tập trung vào request budget, command lock, telemetry, abort request cũ và contract side-effect. Không tăng index vô tội vạ.

## 10. Static tests mới/cập nhật

Thêm:

- `test/phase215-p1-command-governance-static.test.js`

Cập nhật:

- `test/popup-modal-message-scope-static.test.js` để phản ánh rule mới: closeout/adjustment patch UI thay vì full silent reload.
- `test/fixtures/index-page/phase79-assembled.sha256` realign hash với assembled index đã có từ Phase214.

## 11. Kết quả test

Đã chạy và pass:

```bash
npm run check:syntax
# SYNTAX_OK 1345 JavaScript files

npm run check:source-bundles
# [source-bundles] OK 19 bundles

npm run check:source-size
# [source-size-budget] OK

node scripts/audit-dead-code.js
# [dead-code-audit] OK
```

Nhóm targeted P1/governance pass:

```bash
node --test test/phase79-production-strangler.test.js \
  test/import-template-strangler-pilot.test.js \
  test/phase215-p1-command-governance-static.test.js \
  test/action-request-budget-static.test.js \
  test/backend-command-boundary-static.test.js \
  test/dead-code-audit-static.test.js \
  test/no-inventory-snapshot-runtime-static.test.js \
  test/phase91-new-services-contract.test.js \
  test/invoice-export-restoration-static.test.js \
  test/popup-modal-message-scope-static.test.js
# 71 pass / 0 fail
```

Nhóm import/DMS/SSE/return/warehouse/backup/system/action/command/dead-code đã chạy trước đó pass:

```bash
node --test test/*import* test/*dms* test/*sse* test/*return* test/*warehouse* test/*backup* test/*system* test/*action* test/*command* test/*dead-code*
# 401 pass / 0 fail / 1 skipped
```

Full test đã chạy xong và pass. Trong log cuối cùng không còn fail; có 1 skipped từ suite strict/static hiện hữu.

```bash
npm test
# pass, 0 fail
```

## 12. Rủi ro còn lại

- Phase215 chưa xóa mạnh legacy files; chỉ dựng guard và audit để tránh xóa nhầm.
- Các export binary chỉ thêm telemetry an toàn qua header/log, không thay đổi workbook contract.
- Nếu muốn tiếp tục giảm dung lượng/code chết, nên làm Phase216 theo hướng cleanup thực tế từng candidate sau khi có dependency graph rõ.

## 13. ZIP output

```txt
MK-pro-phase215-p1-command-governance-cleanup.zip
```
