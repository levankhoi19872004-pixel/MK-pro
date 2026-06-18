# PHASE 73 — DEPLOYMENT CHECKLIST

## Trước triển khai

- [ ] Sao lưu source đang chạy.
- [ ] Xác nhận Node.js 20–22 và chạy `npm ci`.
- [ ] Không cần migration MongoDB.
- [ ] Kiểm tra các role `admin`, `manager`, `accountant`, `warehouse`, `sales`, `delivery` theo policy route.
- [ ] Chạy test trọng điểm Phase 73.

## Triển khai

```bash
npm ci
npm start
```

Sau deploy, hard refresh trình duyệt để nhận bundle `phase73-excel-interaction-v1`.

## Smoke test bắt buộc

### Đơn bán

- [ ] Mở tạo đơn bán → Dán từ Excel.
- [ ] Paste mã SP, thùng, lẻ, giá.
- [ ] Mã sai được tô đỏ; mã đúng được thêm và tính lại khuyến mại.
- [ ] Chọn đơn → Xuất Excel; file có sheet chi tiết.
- [ ] Chuột phải một dòng → xuất đúng dòng.

### Phiếu nhập

- [ ] Mở phiếu nhập → Dán từ Excel.
- [ ] Kiểm tra quy đổi thùng/lẻ và tổng số lượng.
- [ ] Xuất phiếu đã chọn, file có chi tiết hàng.

### Import dữ liệu

- [ ] Chọn loại import → Dán trực tiếp từ Excel.
- [ ] Preview hiển thị cùng quy tắc lỗi như import file.
- [ ] Commit các dòng đã chọn bằng luồng cũ.
- [ ] Chuột phải preview → xuất TatCa/HopLe/Loi.

### Đơn tổng

- [ ] Chọn một hoặc nhiều đơn tổng → Xuất Excel.
- [ ] File có DonTong/DonCon/SanPham.
- [ ] Xuất toàn bộ theo bộ lọc không làm thay đổi dữ liệu.

### Báo cáo

- [ ] Nút Xuất Excel của báo cáo đang mở xuất đúng bộ lọc.
- [ ] Các nút export legacy bên dưới vẫn tải đúng mẫu cũ.
- [ ] Ctrl+click chọn nhiều dòng báo cáo rồi chuột phải → xuất các dòng chọn.
- [ ] Dữ liệu bắt đầu bằng `=`, `+`, `-`, `@` mở trong Excel dưới dạng text.

## Giám sát sau triển khai

- [ ] Theo dõi `EXCEL_CONTEXT_EXPORT_ERROR`.
- [ ] Theo dõi `EXCEL_PASTE_PREVIEW_ERROR`.
- [ ] Kiểm tra audit action `EXPORT_EXCEL_CONTEXT` và `IMPORT_PASTE_PREVIEW`.
- [ ] Theo dõi RAM khi xuất báo cáo lớn.
- [ ] Tạm thời yêu cầu thu hẹp bộ lọc nếu file gần 50.000 dòng.

## Rollback

Không có migration. Rollback bằng cách deploy lại bản Phase 72 trước đó. Các import session đã tạo vẫn dùng schema hiện hữu và không cần dọn dữ liệu bắt buộc.
