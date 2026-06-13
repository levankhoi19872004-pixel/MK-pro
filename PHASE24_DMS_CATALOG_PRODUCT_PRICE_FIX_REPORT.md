# Phase 24 — DMS catalog product price fix

## Quy tắc đã khóa

- Cột 3 = cột 4 / 1.08.
- Cột 4 = `products.salePrice` tại thời điểm import, lưu vào `catalogSalePriceAtOrder`.
- Cột 5 = giá bán thực tế của dòng DMS/import.
- Cột 6 = VAT tính theo thành tiền thực tế của cột 5.
- Cột 7 = cột 5 × số lượng lẻ.
- Đơn DMS bán thẳng không sinh chi tiết khuyến mại.

## Tương thích dữ liệu cũ

Đơn DMS cũ chưa có marker `catalogSalePriceSource: product.salePrice` sẽ lấy
`products.salePrice` hiện tại để khôi phục cột 4. Đơn import mới giữ snapshot lịch sử,
không thay đổi khi giá sản phẩm được cập nhật sau này.
