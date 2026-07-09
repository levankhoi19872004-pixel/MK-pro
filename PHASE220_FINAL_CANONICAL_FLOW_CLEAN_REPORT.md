# PHASE220_FINAL_CANONICAL_FLOW_CLEAN_REPORT

## 1. Tổng quan Phase220

Phase220 khóa final gate cho chuỗi Phase217→220: canonical flow matrix, retired flow registry, orphan frontend/backend audit, legacy delegation guard và route retirement. Trọng tâm là làm sạch luồng chạy thật, không giảm dung lượng bằng xóa bừa.

## 2. Input / Output

- Input Phase217: `MK-pro-phase216-read-request-budget-performance-cleanup.zip`
- Output Phase217: `MK-pro-phase217-canonical-flow-retirement-cleanup.zip`
- Output Phase218: `MK-pro-phase218-broken-orphan-flow-disconnect.zip`
- Output Phase219: `MK-pro-phase219-legacy-flow-retirement.zip`
- Output Phase220: `MK-pro-phase220-final-canonical-flow-clean.zip`

## 3. File đã sửa/thêm

- `docs/CANONICAL_FLOW_MATRIX.md`
- `docs/FLOW_RETIREMENT_REPORT.md`
- `config/canonical-flows.json`
- `config/retired-flows.json`
- `scripts/audit-flow-usage.js`
- `src/routes/masterReturnOrderRoutes.js`
- `test/canonical-flow-matrix-static.test.js`
- `test/retired-flow-usage-static.test.js`
- `test/orphan-route-frontend-static.test.js`
- `test/frontend-action-handler-coverage-static.test.js`
- `test/legacy-flow-delegation-static.test.js`
- `PHASE217_CANONICAL_FLOW_RETIREMENT_REPORT.md`
- `PHASE218_BROKEN_ORPHAN_FLOW_DISCONNECT_REPORT.md`
- `PHASE219_LEGACY_FLOW_RETIREMENT_REPORT.md`
- `PHASE220_FINAL_CANONICAL_FLOW_CLEAN_REPORT.md`

## 4. Canonical flows đã xác định

Đã khai báo 29 luồng canonical trong `config/canonical-flows.json`:

- `authAndRole`
- `productCatalog`
- `customerCatalog`
- `webSalesOrder`
- `mobileSalesOrder`
- `salesImportPreviewCommit`
- `dmsInventoryComparison`
- `dmsGapSimulator`
- `displayCheckManager`
- `masterOrder`
- `deliveryMobilePhase23Workflow`
- `deliveryTodayNewOrders`
- `deliveryCloseout`
- `deliveryAdjustment`
- `deliveryAdjustmentBulkCommit`
- `debtNew`
- `mobileDebt`
- `debtCollectionSubmit`
- `debtCollectionConfirm`
- `fundLedger`
- `returnOrders`
- `warehouseReturnCheck`
- `returnStockInAccounting`
- `reportCenter`
- `sseExportByDeliveryStaff`
- `vatExport`
- `backup`
- `resetData`
- `enterpriseConsole`

## 5. Compatibility flows đã xử lý

- `/api/orders` giữ compatibility cho `webSalesOrder`.
- `/api/mobile-sales/products` giữ alias catalog.
- `/api/returns` giữ alias đọc/route returnOrders.
- `/api/debt-collections` giữ compatibility kế toán xác nhận phiếu thu.
- `/api/master-return-orders` chỉ còn GET read-only compatibility cho lịch sử/print/audit; write routes đã bị chặn 410.

## 6. Retired flows đã xử lý

- `legacy-web-delivery-today-alias` → `/api/delivery-today` trả 410.
- `mobile-legacy-namespace` → `/api/mobile-legacy` trả 410.
- `legacy-delivery-report-tab` → retired.
- `legacy-web-debt-from-orders` → retired.
- `legacy-mobile-debt-from-orders` → retired.
- `master-return-orders-write-flow` → retired write blocked, GET only compatibility.
- `master-return-orders-receive-flow` → retired route 410, replacement `/api/return-orders/:id/stock-in`.
- `worker-only-import-commit` → retired.
- `sse-export-by-customer-store-flow` → retired.

## 7. Broken/orphan flows phát hiện và xử lý

Kết quả `scripts/audit-flow-usage.js` sau Phase220:

```txt
OK canonical=29 retired=9 fetches=265 unmatched=0 warnings=0
```

Không còn frontend `/api` fetch orphan sau allowlist/prefix route. Không còn retired runtime ref nghiêm trọng. Không còn warning master-return write flow sau khi chặn bằng retiredRoute.

## 8. Luồng đã được ngắt khỏi UI hoặc route

- UI chính không còn tab/menu `Đơn tổng trả hàng`.
- Deprecated tab redirect `masterReturnOrdersTab -> returnOrdersTab` vẫn giữ để không vỡ deep-link cũ.
- Write route Đơn tổng trả hàng bị chặn 410:
  - `POST /api/master-return-orders`
  - `PUT /api/master-return-orders/:id`
  - `PATCH /api/master-return-orders/:id`
  - `POST /api/master-return-orders/:id/receive`
  - `POST /api/master-return-orders/:id/cancel`

## 9. Route đã delegate/retired

- `/api/delivery-today` → retiredRoute, replacement `/api/new/delivery-today/orders`.
- `/api/mobile-legacy` → retiredRoute, replacement `/api/mobile`.
- `/api/master-return-orders` write/receive/cancel → retiredRoute, replacement `/api/return-orders` hoặc `/api/return-orders/:id/stock-in`.

## 10. File/service retired nhưng chưa xóa

Chưa xóa các file sau vì còn test/print/read-only/audit reference:

- `src/services/masterReturnOrderService.js`
- `src/controllers/masterReturnOrderController.js`
- `src/repositories/masterReturnOrderRepository.js`
- `public/js/app/debt/07d-master-return-orders.js`
- CSS legacy `#masterReturnOrdersTab` trong base CSS

Các file này hiện không còn là canonical runtime write flow. Chỉ cân nhắc xóa ở phase sau nếu print/history/test không còn phụ thuộc.

## 11. File/service đã xóa thật

Không xóa code nghiệp vụ trong Phase217→220. Đây là quyết định an toàn: làm sạch luồng runtime trước, xóa dung lượng/code chết sau khi có bằng chứng.

## 12. Test đã chạy

Pass:

```bash
npm run check:syntax
npm run check:source-size
node scripts/audit-dead-code.js
node scripts/audit-flow-usage.js
node --test test/canonical-flow-matrix-static.test.js test/retired-flow-usage-static.test.js test/orphan-route-frontend-static.test.js test/frontend-action-handler-coverage-static.test.js test/legacy-flow-delegation-static.test.js
node --test test/read-request-budget-static.test.js test/frontend-list-request-governance-static.test.js test/read-api-no-write-static.test.js test/report-read-performance-contract.test.js test/dead-code-audit-static.test.js
node --test test/action-request-budget-static.test.js test/backend-command-boundary-static.test.js test/phase215-p1-command-governance-static.test.js
node --test test/return-order-warehouse-stock-in-workflow-static.test.js test/return-toolbar-standardization-static.test.js test/web-operational-read-rbac-static.test.js test/master-return-order-popup-static.test.js test/master-return-popup-production-grade.test.js
```

Kết quả targeted: 63 pass / 0 fail ở các nhóm governance/flow/read/command/return static đã chạy.

Không chạy được đầy đủ trong sandbox:

- `npm run check:source-bundles` fail do thiếu dependency `terser` trong sandbox (`node_modules` không có trong ZIP).
- `node scripts/run-tests.js` chạy được một phần nhưng các test runtime cần model Mongo fail do thiếu dependency `mongoose` trong sandbox.

Đây là lỗi môi trường sandbox thiếu `node_modules`, không phải lỗi code Phase217→220. Trên máy dev/CI cần chạy lại:

```bash
npm install
npm run check:source-bundles
npm test
```

## 13. Điều kiện hoàn thành Phase220

Đã đạt ở phạm vi static/runtime audit có thể chạy trong sandbox:

- Không còn P0/P1 route ngoài canonical/compatibility/retired classification theo `canonical-flows.json`.
- Không còn frontend fetch `/api` orphan theo `audit-flow-usage`.
- Không còn UI runtime gọi retired namespace cứng.
- Không còn route legacy master-return tự ghi DB/stock qua write/receive cũ.
- Không còn warning trong `scripts/audit-flow-usage.js`.
- Static tests flow/retired/orphan/legacy pass.

## 14. Rủi ro còn lại

- Full `npm test` cần chạy trên môi trường có `node_modules` để xác nhận 100% runtime tests.
- Các file legacy master-return vẫn còn trong source vì còn dependency lịch sử/print/test; chưa giảm dung lượng đáng kể.
- Audit `audit-flow-usage.js` là static approximation, không thay thế manual QA trên UI thật.

## 15. Hướng tiếp theo sau Phase220

Sau khi luồng runtime đã sạch, bước tiếp theo mới nên làm Phase221: size/runtime package cleanup hoặc xóa code legacy có bằng chứng, bắt đầu từ master-return legacy read-only nếu không còn cần print/history.
