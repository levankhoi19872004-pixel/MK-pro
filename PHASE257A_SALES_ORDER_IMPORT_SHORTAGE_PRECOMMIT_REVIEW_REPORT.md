# Phase257A - Sales Order Import Shortage Pre-Commit Review

## Tổng quan vùng ảnh hưởng

- Import dữ liệu đơn bán `salesOrders` sau bước preview.
- Backend import session commit gate, không đổi writer Inventory/AR/Fund/Return.
- UI import Excel thuần JS: popup review thiếu hàng trước commit, source fragments và generated bundle.
- ImportSession chỉ thêm trạng thái `shortageReview` để lưu xác nhận review theo fingerprint.

## Root cause

Preview backend đã tính được `hasShortage` và `shortageReport`, nhưng frontend commit đang gửi mặc định:

```js
shortageMode: importShortageActionMode || 'cut'
```

Đồng thời backend `commit` chuyển session sang `importing` ngay đầu hàm bằng `markImporting`, trước khi rebuild tồn MAIN hiện tại và trước khi có bất kỳ xác nhận review nào. Vì vậy người dùng có thể import đơn thiếu hàng theo cơ chế tự cắt mà không qua bước duyệt, và nếu sau này chặn bằng 409 thì session có nguy cơ không còn ở `preview_ready`.

## Phương án A đã triển khai

- Thêm `ImportShortageReviewService`:
  - Rebuild lại selected sales order rows theo tồn MAIN hiện tại.
  - Thu thập chỉ các dòng thiếu `missingQuantity > 0`.
  - Tạo `fingerprint` và `selectedScopeFingerprint` ổn định, không dùng timestamp.
  - Validate mode `exclude_shortage_quantity` và `exclude_shortage_orders`.
- Thêm API:
  - `GET /api/import/sessions/:sessionId/shortage-review`
  - `PUT /api/import/sessions/:sessionId/shortage-review`
- Commit gate:
  - Load session `preview_ready` trước.
  - Select đúng rows hiện tại.
  - Rebuild preview bằng stock hiện tại.
  - Nếu còn thiếu hàng mà chưa confirm mode/fingerprint hợp lệ thì trả `409` và giữ session `preview_ready`.
  - Chỉ gọi `markImporting` sau khi review pass.
- UI:
  - Popup title: `Review đơn thiếu hàng trước khi import`.
  - Một bảng trực tiếp chỉ hiển thị dòng thiếu.
  - 3 nút đúng yêu cầu: `Bỏ qua`, `Import tất cả – loại trừ hàng thiếu`, `Import tất cả – loại trừ đơn thiếu`.
  - Selection đổi thì invalidate review state/fingerprint.
  - Commit body gửi `shortageMode`, `shortageReviewFingerprint`, `selectedScopeFingerprint`.
- Source bundles đã refresh cho `08d-import-excel`.

## Phương án B

Effort thấp hơn là chỉ chặn frontend bằng confirm popup và tiếp tục dùng backend `shortageMode='cut'`. Phương án này bị loại vì không đủ an toàn: có thể bypass API, không bảo vệ stale stock/fingerprint, và `markImporting` vẫn xảy ra quá sớm.

## Diff summary

```text
25 tracked files changed, plus Phase257A report/evidence/test/service files.
New files:
- src/services/import/ImportShortageReviewService.js
- scripts/phase257a-import-shortage-review-evidence.js
- test/phase257a-import-shortage-review-popup-static.test.js
- test/phase257a-import-shortage-review-behavior.test.js
- test/phase257a-import-shortage-mode-quantity.test.js
- test/phase257a-import-shortage-mode-order.test.js
- test/phase257a-import-shortage-review-stale.test.js
- PHASE257A_IMPORT_SHORTAGE_REVIEW_EVIDENCE.json
Updated release metadata:
- RELEASE_MANIFEST.json
```

## Evidence

`PHASE257A_IMPORT_SHORTAGE_REVIEW_EVIDENCE.json` được sinh bằng:

```bash
node scripts/phase257a-import-shortage-review-evidence.js
```

Kết quả chính:

- Selected orders: 100
- Shortage orders: 5
- Shortage lines: 8
- Stale guard: `409 IMPORT_SHORTAGE_REVIEW_STALE`

## Artifact

- ZIP: `MK-pro-phase257a-sales-order-import-shortage-precommit-review-fixed.zip`
- SHA256: xem `MK-pro-phase257a-sales-order-import-shortage-precommit-review-fixed.zip.sha256`
- Direct verifier: `node scripts/verify-source-artifact-clean.js --zip MK-pro-phase257a-sales-order-import-shortage-precommit-review-fixed.zip` passed with 2069 entries.

## Test results

Passed:

```bash
npm run check:syntax
node --test test/import-preview-contract-static.test.js test/import-preview-session-contract-static.test.js test/import-preview-ui-static.test.js test/import-shortage-report-static.test.js test/import-stock-allocation-trace.test.js test/excel-sales-live-inventory-resolve.test.js test/import-web-direct-commit-static.test.js test/import-commit-session-failure-static.test.js test/dms-import-sales-atomic-transaction.test.js test/inventory-bulk-sales-import.test.js test/phase257a-import-shortage-review-popup-static.test.js test/phase257a-import-shortage-review-behavior.test.js test/phase257a-import-shortage-mode-quantity.test.js test/phase257a-import-shortage-mode-order.test.js test/phase257a-import-shortage-review-stale.test.js
npm run docs:check
npm run test:release-governance
node scripts/verify-source-artifact-clean.js --zip MK-pro-phase257a-sales-order-import-shortage-precommit-review-fixed.zip
```

Known unrelated failures:

```bash
npm test
```

Still fails in pre-existing non-Phase257A areas:

- `test/app-trust-proxy-static.test.js`: `createApp() must exist`
- `test/sales-order-delete-ui-scoped-static.test.js`: expected POST delete alias without `authorizeDelete`
- `test/sales-order-flow.test.js` and `test/sales-order-pending-cancel-no-stock-reversal.test.js`: cancel result undefined status
- `test/source-artifact-clean-verifier.test.js`: clean ZIP verifier returns 1

```bash
npm run check:source-bundles
```

Still fails because `src/services/inventoryService.js` generated file is stale, unrelated to the import bundle.

```bash
npm run quality
npm run test:artifact-clean
```

Still fail because root contains older phase ZIP files flagged as nested archives by artifact-clean:

- `MK-pro-phase255a-optional-backend-route-lazy-load-fixed.zip`
- `MK-pro-phase256a-delivery-closeout-negative-return-self-healing-fixed.zip`
- `MK-pro-phase256b-delivery-today-master-metadata-scope-isolation-fixed.zip`
- `MK-pro-phase256b-r1-masterorder-identity-objectid-cast-guard-fixed.zip`
- `MK-pro-phase256c-master-order-edit-working-set-persistence-fixed.zip`
- `MK-pro-phase256d-master-order-list-viewport-expansion-fixed.zip`

## File đã sửa

- Backend: `src/services/import/ImportShortageReviewService.js`, `src/services/import/importCommit.impl.js`, import commit adapter/job files, controllers/routes, `src/models/ImportSession.js`, `src/services/importSessionService.js`.
- Frontend: `public/js/app/admin/08d-import-excel.source/*.jsfrag`, generated `08d-import-excel*.js`, `public/js/app/admin/08a-reports.js`, `public/css/40-import-sales.css`, cache-busting HTML.
- Tests/evidence: 5 Phase257A tests and evidence runner/JSON.

## Rủi ro còn lại

- API review rebuild tồn MAIN tại thời điểm gọi review và commit. Nếu tồn thay đổi giữa PUT confirm và POST commit, fingerprint stale sẽ chặn commit bằng 409.
- `exclude_shortage_orders` không lưu shortage report cắt hàng vì không import các đơn thiếu; danh sách đơn bị loại nằm trong `shortageModeSummary`.
- Artifact-clean/root ZIP policy vẫn đang fail do ZIP phase cũ ở root; chưa xử lý vì nằm ngoài phạm vi Phase257A và không được xóa file nếu chưa duyệt.
