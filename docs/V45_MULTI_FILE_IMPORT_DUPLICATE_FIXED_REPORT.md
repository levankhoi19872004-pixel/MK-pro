# V45 - Sửa import nhiều file Excel và chặn trùng mã đơn

## Phạm vi đã sửa

- Cho phép chọn nhiều file Excel cùng lúc ở màn import.
- Frontend gửi nhiều file bằng field `files`.
- Backend nhận đồng thời `file` cũ và `files` mới để giữ tương thích.
- Preview gộp dữ liệu nhiều file trong một phiên import.
- Gắn `sourceFile/fileName` vào từng dòng/đơn preview.
- Không gộp nhầm 2 đơn cùng mã giữa 2 file khác nhau; mã trùng được tách thành 2 đơn preview và báo lỗi.
- Rule Engine chặn trùng mã đơn trong batch và trùng với dữ liệu đã có trong MongoDB.
- Chọn tất cả/chọn dòng chỉ áp dụng cho đơn `valid=true` và `canImport !== false`.

## File đã sửa

- `public/index.html`
- `public/js/app/08-reports-users-promotions-import-excel.js`
- `src/routes/excelImportRoutes.js`
- `src/controllers/excelImportController.js`
- `src/services/excelImportService.js`
- `src/rules/importRules.js`

## Quy tắc nghiệp vụ

- Chỉ chặn khi trùng `mã đơn / số hóa đơn`.
- Không chặn khi cùng khách hàng nhưng khác mã đơn.
- Nếu mã đơn đã tồn tại trong hệ thống thì đơn đó không được import.
- Nếu cùng mã đơn xuất hiện giữa nhiều file trong cùng batch preview thì tất cả bản ghi trùng đều bị đánh lỗi.
