# PHASE217_CANONICAL_FLOW_RETIREMENT_REPORT

## 1. Tổng quan mục tiêu Phase217

Phase217 lập bản đồ luồng chuẩn, phân loại legacy/retired/compatibility/broken-orphan và tạo audit gate để không còn sửa theo cảm tính. Phase này chưa xóa mạnh code nghiệp vụ.

## 2. Input / Output

- Input ZIP: `MK-pro-phase216-read-request-budget-performance-cleanup.zip`
- Output ZIP: `MK-pro-phase217-canonical-flow-retirement-cleanup.zip`

## 3. File đã sửa/thêm

- `docs/CANONICAL_FLOW_MATRIX.md`
- `docs/FLOW_RETIREMENT_REPORT.md`
- `config/canonical-flows.json`
- `config/retired-flows.json`
- `scripts/audit-flow-usage.js`
- `test/canonical-flow-matrix-static.test.js`
- `test/retired-flow-usage-static.test.js`
- `test/orphan-route-frontend-static.test.js`
- `test/frontend-action-handler-coverage-static.test.js`
- `test/legacy-flow-delegation-static.test.js`

## 4. Canonical flows đã bổ sung

Đã khai báo 29 canonical flows bắt buộc: auth, catalog, sales web/mobile, import, DMS, DMS gap simulator, display-check, master order, app giao hàng Phase23, delivery today new, closeout, adjustment, bulk adjustment, debt new, mobile debt, debt collection submit/confirm, fund, returnOrders, warehouse return check, return stock-in accounting, report center, SSE, VAT export, backup, reset, enterprise.

## 5. Compatibility / retired flows đã xác định

- `/api/delivery-today` → retired guard, replacement `/api/new/delivery-today/orders`.
- `/api/mobile-legacy` → retired guard, replacement `/api/mobile`.
- Legacy delivery report tab → retired.
- Legacy debt math từ orders/master_orders → retired.
- Legacy mobile debt dùng DCOC/DCOA/DCOV làm orderCode → retired.
- Master return write flow → compatibility-quarantined, chưa xóa trong Phase217 vì vẫn còn service/test/print references.
- Master return receive flow → retired candidate, replacement `returnStockInAccounting`.
- Worker-only import commit → retired.
- SSE export theo cửa hàng → retired, replacement SSE theo NVGH.

## 6. Broken/orphan flows phát hiện

Audit script phát hiện chưa có critical orphan ở frontend `/api` fetch sau allowlist. Có warning chính: route `masterReturnOrderRoutes` vẫn còn tồn tại nên cần xử lý tiếp ở Phase218/219.

## 7. Luồng đã ngắt khỏi UI

Phase217 xác nhận UI chính không còn tab/menu `Đơn tổng trả hàng`; `masterReturnOrdersTab` chỉ còn trong redirect deprecated tab về `returnOrdersTab`.

## 8. Route delegate/retired

Phase217 chưa thay đổi route nghiệp vụ, chỉ xác nhận hai namespace đã retired sẵn: `/api/delivery-today`, `/api/mobile-legacy`.

## 9. File/service retired nhưng chưa xóa

- `src/services/masterReturnOrderService.js`
- `src/routes/masterReturnOrderRoutes.js`
- `src/controllers/masterReturnOrderController.js`
- `public/js/app/debt/07d-master-return-orders.js`

Lý do chưa xóa: vẫn còn test/source/print references. Phase219 sẽ chặn write route trước khi tính xóa.

## 10. Test đã chạy

- `node scripts/audit-flow-usage.js` → OK
- `node --test test/canonical-flow-matrix-static.test.js test/retired-flow-usage-static.test.js test/orphan-route-frontend-static.test.js test/frontend-action-handler-coverage-static.test.js test/legacy-flow-delegation-static.test.js` → 12 pass / 0 fail

## 11. Rủi ro còn lại

- MasterReturnOrders vẫn có route write, cần Phase219 xử lý thành retired/410 hoặc compatibility rõ.
- Audit flow mới là static guard, chưa thay thế full integration test.

## 12. Việc cần làm Phase218

Ngắt broken/orphan rõ ràng, xử lý fetch/route/data-action không có owner, chuẩn bị chặn master-return write flow.
