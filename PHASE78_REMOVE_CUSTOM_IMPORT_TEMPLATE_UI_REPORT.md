# PHASE 78 — Gỡ khu vực “Tự tạo mẫu import”

## 1. Yêu cầu

Gỡ toàn bộ khu vực “Tự tạo mẫu import” khỏi màn hình **Import dữ liệu Excel** theo yêu cầu người dùng.

## 2. Phạm vi thay đổi

- `public/index.html`
  - Xóa toàn bộ khối giao diện tạo/nạp/lưu/xóa mẫu import tự tạo.
  - Xóa hướng dẫn nhắc người dùng sử dụng khu vực này.
  - Giữ nguyên các chức năng import chuẩn, cập nhật an toàn, xem trước, báo cáo hàng thiếu.
- `public/js/app/state/00c-admin-system-state.js`
  - Xóa các DOM binding và biến trạng thái chỉ phục vụ khu vực đã gỡ.
- `public/js/app/admin/08d-import-excel.js`
  - Xóa các hàm và event handler tạo/nạp/lưu/xóa/tải mẫu tự tạo.
  - Không còn gửi `templateId` vào API preview.
  - Giữ nguyên luồng chọn loại import, chế độ import, tải mẫu chuẩn, preview và commit.
- `public/css/00-base.css`
  - Xóa CSS chỉ dành cho khu vực đã gỡ.
  - Giữ `.compact-toolbar` vì vẫn được nhiều màn hình khác sử dụng.

## 3. Vùng không thay đổi

- Không thay đổi schema MongoDB.
- Không thay đổi API import chuẩn.
- Không thay đổi nghiệp vụ import sản phẩm, khách hàng, tài khoản, tồn kho, đơn hàng, công nợ và quỹ.
- Không xóa API/backend mẫu tự tạo để tránh ảnh hưởng dữ liệu cũ hoặc tích hợp ngoài giao diện; tính năng chỉ bị gỡ khỏi frontend.

## 4. Kiểm thử

- `node --check public/js/app/state/00c-admin-system-state.js`: đạt.
- `node --check public/js/app/admin/08d-import-excel.js`: đạt.
- `node --test test/phase78-import-custom-template-ui-removal.test.js`: đạt 3/3.
- Kiểm tra tĩnh xác nhận không còn ID, handler, CSS hoặc nội dung “Tự tạo mẫu import” trên frontend.

## 5. Rủi ro

Rủi ro thấp. Người dùng không còn chọn được mẫu mapping tự tạo trên giao diện. Các mẫu từng lưu trong database không bị xóa và có thể phục hồi giao diện sau này nếu cần.
