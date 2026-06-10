# V46 Child Invoice Template Tested Report

Đã kiểm tra mẫu in đơn con theo file mẫu Invoice-36.

## Kết quả kiểm tra

- Header 3 vùng: trái / giữa / phải.
- Có tiêu đề: PHIẾU GIAO NHẬN VÀ THANH TOÁN.
- Có Liên 1 / Liên 2.
- Có số trang dạng 1/ 3, 2/ 3, 3/ 3.
- Bảng hàng hóa có đủ 10 cột theo mẫu.
- Có dòng công thức A / 1 / 2 / 3 / 4 / 5 / 6 / 7=(5*2).
- Có phần tổng cộng, số tiền phải thanh toán, số tiền bằng chữ.
- Có 4 ô chữ ký.
- Có chi tiết khuyến mãi theo từng dòng sản phẩm bán / khuyến mại.
- Có chi tiết cấn trừ nợ.

## Lỗi phát hiện và đã sửa

Bản trước chưa chia trang hàng hóa đúng theo mẫu khi đơn có nhiều dòng. Ví dụ mẫu 25 dòng thì trang 1 có 24 dòng, trang 2 tiếp tục dòng còn lại rồi mới tổng cộng. Bản cũ có nguy cơ dồn toàn bộ dòng hàng lên trang đầu.

Đã sửa:

- `templates/printTemplates.js`
  - Cho phép `renderDmsInvoiceItemsTable(data, itemsOverride, options)`.
  - Tách dòng hàng thành từng trang với `chunkDmsItems()`.
  - Chỉ in `Tổng cộng (A)` ở trang hàng cuối.
  - Nếu có nhiều khuyến mãi / cấn trừ thì tách thêm trang diễn giải.

- `services/printDataBuilder.js`
  - Sửa `paginateDeliveryInvoice()`.
  - Thêm `itemPageSize = 24`.
  - Tính `itemPageCount` và `detailPageCount` rõ ràng.

## Test đã chạy

File test tạm: `test-child-invoice-template.js`

Kết quả:

```text
OK child invoice template test passed
pageCount: 6
2 liên x 3 trang
Mỗi liên chỉ có 1 dòng Tổng cộng (A)
```
