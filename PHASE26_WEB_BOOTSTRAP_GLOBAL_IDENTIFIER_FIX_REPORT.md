# PHASE 26 — WEB ADMIN BOOTSTRAP GLOBAL IDENTIFIER FIX

## Hiện tượng

- Header đứng ở `Đang kiểm tra server...`.
- Danh sách sản phẩm đứng ở `Đang tải...` / `Đang tải dữ liệu...`.
- Speed monitor vẫn có thể hiển thị một API khác trả `200`, tạo cảm giác backend vẫn bình thường.

## Nguyên nhân gốc

Trang quản trị tải các file JavaScript bằng classic `<script>`, nên các khai báo top-level dùng chung global lexical scope.

Hai file cùng khai báo tên `escapeImportHtml`:

- `public/js/app/04-import-orders.js`: `const escapeImportHtml = ...`
- `public/js/app/08-reports-users-promotions-import-excel.js`: `function escapeImportHtml(...)`

Trình duyệt phát sinh `SyntaxError: Identifier 'escapeImportHtml' has already been declared` khi parse module 08. Sau đó `public/app.js` gọi một hàm thuộc module 08 chưa được tạo, phát sinh `ReferenceError`, làm bootstrap dừng trước `checkServer()` và `loadProducts()`.

## Bản vá

- Đổi helper riêng của phiếu nhập kho thành `escapeImportOrderHtml`.
- Giữ nguyên helper `escapeImportHtml` của module báo cáo/import Excel.
- Tăng cache-busting version cho `04-import-orders.js`.
- Thêm regression test ghép toàn bộ classic script theo đúng thứ tự trong `public/index.html` và parse trong cùng global scope.

## Phạm vi ảnh hưởng

Chỉ đổi tên helper encode HTML nội bộ. Không thay đổi API, model, dữ liệu, nghiệp vụ nhập kho hoặc import Excel.
