# PHASE 52 — Deployment checklist

## Trước deploy

- Backup MongoDB.
- Kiểm tra `products.code` không trùng và `products.salePrice` đã có giá cho các SKU đang bán.
- Ghi lại số liệu Dashboard hiện tại để đối chiếu sau deploy.

## Deploy

1. Deploy mã nguồn Phase 52.
2. Không cần migration database.
3. Restart service trên Render.
4. Hard refresh trình duyệt bằng `Ctrl + F5`.
5. Vào `Tổng quan` và bấm `Tải lại`.

## Kiểm tra nghiệp vụ

Chọn một đơn hôm nay có sản phẩm với:

- Số lượng: `Q`.
- `products.salePrice`: `P`.
- Giá thực bán trên đơn khác `P`.

Kết quả cột `Hôm nay` phải tăng đúng `Q × P`, không dùng giá thực bán.

Kiểm tra thêm:

- `Thực đạt` tháng = tổng `quantity × products.salePrice` của đơn đã xác nhận.
- `Hàng trả` = tổng `returnQty × products.salePrice` của phiếu trả đã xác nhận.
- `Doanh số ròng` = `Thực đạt - Hàng trả`.
- `Tỷ lệ` = `Doanh số ròng / Chỉ tiêu`.
- Đơn hôm nay chưa xác nhận kế toán vẫn xuất hiện trong cột `Hôm nay`.
- `Công nợ` vẫn giữ nguyên theo `arLedgers`.

## Cảnh báo dữ liệu

Nếu Dashboard hiển thị cảnh báo:

- `không tìm thấy mã sản phẩm`: kiểm tra `items.productCode` có khớp `products.code`.
- `giá bán sản phẩm bằng 0`: cập nhật `products.salePrice`.

## Rollback

Rollback về ZIP Phase 51. Không cần rollback dữ liệu vì Phase 52 chỉ thay đổi read model Dashboard, không ghi sửa đơn hàng, tồn kho, công nợ hoặc sản phẩm.
