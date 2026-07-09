# PHASE218_BROKEN_ORPHAN_FLOW_DISCONNECT_REPORT

## 1. Tổng quan

Phase218 lặp lại audit từ Phase217 để tìm luồng BROKEN_ORPHAN: UI gọi endpoint không tồn tại, route thiếu service, data-action không có coverage, route stub 501 trong flow chính.

## 2. Input / Output

- Input ZIP: `MK-pro-phase217-canonical-flow-retirement-cleanup.zip`
- Output ZIP: `MK-pro-phase218-broken-orphan-flow-disconnect.zip`

## 3. File đã sửa/thêm

- Cập nhật `docs/FLOW_RETIREMENT_REPORT.md` với kết quả Phase218.
- Giữ `scripts/audit-flow-usage.js` làm gate chính.
- Giữ các static tests Phase217 để bảo vệ orphan/retired refs.

## 4. Broken/orphan flows phát hiện

Không phát hiện critical orphan trong nhóm frontend `/api` fetch sau khi đối chiếu route mount/allowlist.

Warning còn lại:

- `masterReturnOrderRoutes` còn tồn tại. Đây không phải broken/orphan vì service/controller vẫn đủ, nhưng là legacy flow cần Phase219 retire write route.

## 5. Luồng đã ngắt khỏi UI

- Xác nhận UI chính không còn menu/tab `Đơn tổng trả hàng`.
- `masterReturnOrdersTab` chỉ còn redirect deprecated tab về `returnOrdersTab`, không còn entry nghiệp vụ chính.

## 6. Route đã delegate/retired

- `/api/delivery-today` giữ retiredRoute 410.
- `/api/mobile-legacy` giữ retiredRoute 410.

## 7. Test đã chạy

- `node scripts/audit-flow-usage.js` → OK
- `node --test test/canonical-flow-matrix-static.test.js test/retired-flow-usage-static.test.js test/orphan-route-frontend-static.test.js test/frontend-action-handler-coverage-static.test.js test/legacy-flow-delegation-static.test.js` → pass.

## 8. Việc cần làm Phase219

Retire legacy flow an toàn, trọng tâm là `master-return-orders` write/receive flow: không để route cũ ghi kho hoặc gộp đơn trả hàng ngoài canonical returnOrders lifecycle.
