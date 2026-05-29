# Phase 3.3 - Unified Product Autocomplete

Đã gom logic gợi ý sản phẩm về 1 engine dùng chung:

- `public/js/search/autocompleteEngine.js`: xử lý UI gợi ý, chọn bằng chuột/phím, đóng/mở danh sách.
- `public/js/search/productSearchBox.js`: cache catalog sản phẩm, normalize không dấu, tìm theo mã/tên/barcode/nhóm/thương hiệu/quy cách, label theo ngữ cảnh nhập/bán.
- `public/js/search/searchFieldsConfig.js`: khai báo các ô gợi ý của phần mềm chính.

Các module sử dụng chung engine:

- Nhập kho: `importProductSearch`
- Bán hàng chính: `salesProductSearch`
- App bán hàng mobile: `productSearch`

Đã xóa logic tìm sản phẩm trùng trong:

- `public/js/app/04-import-orders.js`
- `public/js/app/05-sales-orders.js`
- `public/mobile/js/sales.js`

Nguyên tắc mới: nếu cần sửa gợi ý sản phẩm, sửa tại `public/js/search/productSearchBox.js` và cấu hình tại `public/js/search/searchFieldsConfig.js`.
