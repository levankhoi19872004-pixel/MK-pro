# V45 Customer Sales Staff Autocomplete + Staff Code Import Fixed

## Nội dung đã sửa

1. Màn Khách hàng: ô Nhân viên phụ trách chuyển sang autocomplete NVBH.
2. Khi chọn nhân viên, form lưu `staffCode` và `staffName` bằng hidden inputs.
3. Danh sách khách hàng hiển thị `staffCode - staffName` để tránh trùng tên.
4. Template import khách hàng đổi cột chính từ `staffName` sang `staffCode`, vẫn giữ `staffName` là tham khảo.
5. Import khách hàng tra `staffCode` trong collection users, tự lấy tên nhân viên từ hệ thống.
6. Backend tạo/cập nhật khách hàng kiểm tra mã nhân viên tồn tại, còn hoạt động và thuộc nhóm sales/admin.

## File đã chỉnh

- public/index.html
- public/js/search/searchFieldsConfig.js
- public/js/app/03-customers-autocomplete.js
- services/excelTemplateService.js
- src/services/customerService.js
- src/services/excelImportService.js

## Quy tắc sau sửa

- Dữ liệu chính để gán NVBH là `staffCode`.
- `staffName` chỉ để hiển thị và được lấy từ users theo mã nhân viên.
- Không dùng tên nhân viên làm khóa tìm kiếm/import chính.
