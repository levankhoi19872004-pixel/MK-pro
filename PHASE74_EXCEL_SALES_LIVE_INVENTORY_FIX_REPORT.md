# PHASE 74 — EXCEL SALES LIVE INVENTORY RESOLVE FIX

## 1. Phạm vi

Sửa lỗi chức năng **Dán hàng vào đơn bán** luôn báo sản phẩm hết tồn mặc dù màn tồn kho còn hàng.

Không thay đổi:
- Công thức tồn kho.
- Luồng ghi/xuất kho.
- InventoryPostingService.
- Tạo/sửa/xóa đơn bán.
- Import phiếu nhập.
- Các màn tìm kiếm sản phẩm hiện tại.

## 2. Nguyên nhân gốc rễ

Luồng mới Phase 73 gọi:

`POST /api/excel/products/resolve`

Hàm `ExcelInteractionService.resolveProducts()` chỉ trả thông tin danh mục sản phẩm, không trả các trường tồn:

- `availableQty`
- `availableStock`
- `stockQuantity`
- `openSaleQty`

Frontend `applyPastedSalesItems()` gọi `productAvailableQty(product)`. Khi không có các trường trên, hàm mặc định về `0`, vì vậy toàn bộ sản phẩm bị đánh dấu **hết tồn mở bán**.

Màn tìm kiếm sản phẩm thông thường không lỗi vì đã đọc tồn qua `inventoryStock.service`.

## 3. Giải pháp áp dụng

`resolveProducts()` hiện:

1. Resolve mã/barcode theo batch.
2. Gom mã chuẩn của sản phẩm.
3. Đọc tồn hiện tại theo batch từ `inventoryStockService.getAvailableStocks()`.
4. Trả cùng contract tồn mở bán với tìm kiếm sản phẩm:
   - `availableQty`
   - `availableStock`
   - `stockQuantity`
   - `openSaleQty`
   - `stock`
   - `quantity`
   - `qty`
   - `stockCase`
   - `stockLoose`
   - `stockDisplay`
   - `isOutOfStock`
   - `inventorySource = inventories`
5. Bổ sung `sku`, `barcode`, `productName` để paste bằng mã vạch/alias hoạt động đúng.
6. Chuẩn hóa so khớp `missingCodes` không phân biệt hoa/thường.

## 4. File thay đổi

- `src/services/excel/ExcelInteractionService.js`
- `test/excel-sales-live-inventory-resolve.test.js`

## 5. Kiểm thử

- `node --check` các file thay đổi: PASS.
- Test trọng điểm Excel + Inventory + Product: **16/16 PASS**.
- Test mới:
  - Tồn `999999` phải được trả về và không báo hết hàng.
  - Tồn thực bằng `0` vẫn phải báo hết hàng.
  - Alias barcode được giữ trong response.
  - `missingCodes` hoạt động không phân biệt hoa/thường.
- Full syntax checker của dự án không kết thúc trong 300 giây tại môi trường kiểm tra; các file trực tiếp thay đổi đã kiểm tra cú pháp thành công.

## 6. Rủi ro

Thấp. Thay đổi chỉ bổ sung dữ liệu đọc tồn vào API resolve sản phẩm của bảng paste, không ghi dữ liệu và không đổi nghiệp vụ kho.
