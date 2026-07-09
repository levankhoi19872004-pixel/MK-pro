# PHASE219_LEGACY_FLOW_RETIREMENT_REPORT

## 1. Tổng quan

Phase219 xử lý legacy/compatibility flow có rủi ro tạo đường ghi DB thứ hai. Trọng tâm là `master-return-orders`, vì module Đơn tổng trả hàng đã bị bỏ khỏi UI chính và luồng chuẩn hiện tại là `returnOrders` + kế toán nhập kho từng đơn trả.

## 2. Input / Output

- Input ZIP: `MK-pro-phase218-broken-orphan-flow-disconnect.zip`
- Output ZIP: `MK-pro-phase219-legacy-flow-retirement.zip`

## 3. File đã sửa

- `src/routes/masterReturnOrderRoutes.js`
- `config/retired-flows.json`
- `scripts/audit-flow-usage.js`
- `docs/FLOW_RETIREMENT_REPORT.md`
- `test/legacy-flow-delegation-static.test.js`

## 4. Luồng compatibility / retired đã xử lý

### master-return-orders write flow

Trước Phase219, route `/api/master-return-orders` vẫn còn đủ write/receive/cancel. Đây là luồng cũ, không còn là canonical.

Sau Phase219:

- GET `/api/master-return-orders` và GET `/:id` còn read-only compatibility cho lịch sử/print/audit.
- POST `/api/master-return-orders` bị chặn 410 qua `retiredRoute`.
- PUT/PATCH `/:id` bị chặn 410.
- POST `/:id/receive` bị chặn 410, replacement là `/api/return-orders/:id/stock-in`.
- POST `/:id/cancel` bị chặn 410.

## 5. Route đã delegate/retired

Không delegate write route cũ vì nếu delegate có thể che giấu UX sai. Route write cũ trả 410 rõ ràng để người dùng/client thấy cần đi theo luồng chuẩn.

## 6. File/service retired nhưng chưa xóa

Chưa xóa `masterReturnOrderService`, controller, repository, frontend JS vì vẫn còn test/print/read-only reference. Đã retired write route trước để đảm bảo runtime không sinh nghiệp vụ cũ.

## 7. Test đã chạy

- `node scripts/audit-flow-usage.js` → OK, warnings=0.
- `node --test test/legacy-flow-delegation-static.test.js` → pass.

## 8. Rủi ro còn lại

- Các file master-return legacy vẫn còn trong source để giữ test/print/history. Có thể cân nhắc xóa ở phase sau nếu chứng minh không còn cần.

## 9. Việc cần làm Phase220

Khóa final gate: audit flow pass, retired route không còn UI gọi, không P0/P1 orphan/stub, compatibility route không tự ghi DB.
