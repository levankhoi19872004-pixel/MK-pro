# PHASE 72 — DEPLOYMENT CHECKLIST

## Trước triển khai

- [ ] Backup MongoDB và verify backup.
- [ ] Kiểm tra `JWT_SECRET` và kết nối MongoDB.
- [ ] Chạy `npm ci`.
- [ ] Chạy `npm test` và xác nhận 611/611 đạt.
- [ ] Chạy `node scripts/generate-openapi.js --check`.

## Sau triển khai

- [ ] Đăng nhập bằng admin/manager/accountant và mở tab Báo cáo.
- [ ] Kiểm tra 17 mẫu báo cáo xuất hiện đúng quyền.
- [ ] So sánh doanh số theo ngày với file Excel `sales-report` cùng kỳ.
- [ ] So sánh công nợ theo kỳ với `ar-ledger-detail`.
- [ ] So sánh nhập - xuất - tồn với báo cáo tồn kho đang dùng.
- [ ] Kiểm tra nút KPI mở đúng báo cáo chi tiết.
- [ ] Kiểm tra phân trang và tìm kiếm.
- [ ] Kiểm tra xuất Excel hiện hành.
- [ ] Đăng nhập warehouse: chỉ thấy nhóm tồn kho.
- [ ] Đăng nhập sales: chỉ thấy tồn kho hiện tại.

## Rollback

- Khôi phục bản ZIP Phase 71.
- Không cần rollback database vì Phase 72 không tạo collection hoặc migration dữ liệu mới.
