# V45 Import NVBH Excel Header Fallback Fixed

## Lỗi
Preview import báo `Thiếu mã NVBH` dù mã NVBH có trong Excel và có trong Mongo `users`.

## Nguyên nhân
Backend gom đơn chỉ đọc một số tên cột cố định như `staffCode`, `salesStaffCode`, `Mã NVBH`.
File DMS thực tế có thể dùng header khác hoặc Unicode khác dấu, ví dụ:

- `Mã NVTT`
- `Ma NVTT`
- `Mã nhân viên`
- `Mã nhân viên TT`
- `Mã nhân viên bán hàng`

Vì vậy frontend vẫn hiển thị được mã từ raw row, nhưng backend validate batch lại không lấy được vào `staffCode`.

## Đã sửa

### `src/services/excelImportService.js`
- Thêm hàm chuẩn hóa header Excel không dấu, bỏ ký tự đặc biệt.
- Thêm `getRowValueByAliases()` để đọc header linh hoạt.
- Mở rộng alias mã NVBH/NVTT.
- `getSalesStaffCodeFromRow()` và `getSalesStaffNameFromRow()` dùng alias linh hoạt.
- Khi import thật, `staffCode`, `salesStaffCode`, `staffName`, `salesStaffName` đều lấy qua hàm chuẩn.

### `src/rules/importRules.js`
- Thêm `extractSalesStaffCode(order)`.
- Validate NVBH fallback theo thứ tự:
  1. `order.staffCode / salesStaffCode`
  2. `order.raw`
  3. `order.__importRows[]`
  4. `order.__adjustedRows[]`
- Build cache `users` theo mã NVBH thật lấy từ Excel, không chỉ lấy từ object preview đã gom.

## Kết quả
Nếu Excel có mã `35095` ở cột dạng `Mã NVTT`, `Mã nhân viên`, `Mã nhân viên bán hàng`..., hệ thống vẫn map đúng, tìm trong `users`, và không còn báo sai `Thiếu mã NVBH`.
