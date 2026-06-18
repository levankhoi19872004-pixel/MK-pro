# PHASE79B — DEPLOYMENT CHECKLIST

## Trước triển khai

- [ ] `npm ci`
- [ ] `npm run quality`
- [ ] Xác nhận không có `node_modules`, log hoặc file tạm trong ZIP bàn giao
- [ ] Backup cấu hình production hiện tại
- [ ] Ghi nhận artifact Phase79A để rollback

## Smoke test sau triển khai

- [ ] Đăng nhập web và mobile
- [ ] Danh sách/tạo/sửa/xóa đơn bán
- [ ] Import Excel: preview, commit, polling tiến độ
- [ ] Đơn giao hôm nay và lọc NVBH/NVGH
- [ ] Trả hàng, nhận kho, xác nhận kế toán
- [ ] Công nợ và sổ quỹ
- [ ] Báo cáo và export Excel
- [ ] In đơn con, đơn tổng và phiếu thu
- [ ] Không có asset 404 cho các file `.partXX.js`
- [ ] Console trình duyệt không có lỗi lexical/global declaration

## Rollback

- [ ] Redeploy ZIP Phase79A
- [ ] Purge cache asset nếu cần
- [ ] Không chạy migration ngược
