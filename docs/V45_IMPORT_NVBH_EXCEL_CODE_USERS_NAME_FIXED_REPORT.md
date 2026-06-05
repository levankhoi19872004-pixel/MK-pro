# V45 Import NVBH lấy mã từ Excel, tên từ users Mongo

## Mục tiêu
- Mã nhân viên bán hàng (`staffCode`, `salesStaffCode`) phải lấy trực tiếp từ file Excel import.
- Thông tin NVBH hiển thị/lưu (`staffName`, `salesStaffName`) phải tra từ collection `users` theo mã NVBH lấy từ Excel.
- Không fallback mã/tên NVBH từ khách hàng để tránh sai tuyến/sai nhân viên.

## File đã sửa
- `src/services/excelImportService.js`
- `src/rules/importRules.js`

## Quy tắc mới
1. Đọc mã NVBH từ Excel bằng nhiều alias cột: `Mã NVBH`, `Mã NVTT`, `Mã nhân viên bán hàng`, `staffCode`, `salesStaffCode`,...
2. Dùng mã Excel đó để tìm trong `users` theo các trường:
   - `staffCode`
   - `code`
   - `employeeCode`
   - `salesStaffCode`
   - `username`
   - `maNhanVien`
   - `employeeId`
   - `staffId`
3. Nếu không có mã NVBH trong Excel: báo lỗi `Thiếu mã NVBH trong file Excel import`.
4. Nếu mã có trong Excel nhưng không có trong `users`: báo lỗi `Mã NVBH ... không tồn tại trong users`.
5. Khi lưu đơn, `staffCode`/`salesStaffCode` giữ nguyên theo mã Excel; `staffName`/`salesStaffName` lấy từ user.

## Đã kiểm tra
- `node --check` toàn bộ file `.js`: OK.
