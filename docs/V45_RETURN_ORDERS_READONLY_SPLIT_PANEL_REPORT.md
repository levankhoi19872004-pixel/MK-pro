# V45 Return Orders Readonly Split Panel Report

## Mục tiêu
Chuyển màn **Đơn trả hàng** sang bố cục chuyên nghiệp dạng 2 cột:

- Bên trái: danh sách phiếu trả hàng.
- Bên phải: chi tiết phiếu trả hàng readonly.
- Có thể xem sản phẩm trả về của từng đơn.
- Không có ô input/select/textarea để chỉnh sửa dữ liệu trả hàng.

## File đã chỉnh sửa

1. `public/index.html`
   - Đổi bảng đơn trả hàng một cột thành layout `return-order-split-layout`.
   - Thêm panel phải `returnOrderDetailPanel` để xem chi tiết.
   - Rút gọn bảng bên trái còn các cột tổng quan: mã phiếu, ngày, khách, số lượng, giá trị, trạng thái.

2. `public/js/app/07-debt-cashbook.js`
   - Thêm state:
     - `returnOrdersCache`
     - `selectedReturnOrderKey`
   - Thêm các hàm helper:
     - `returnOrderRowKey()`
     - `returnOrderItems()`
     - `returnItemQty()`
     - `returnItemPrice()`
     - `returnItemAmount()`
     - `returnOrderStatusLabel()`
     - `returnOrderStatusBadgeClass()`
   - Thêm hàm render chi tiết readonly:
     - `renderReturnOrderDetail(order)`
   - Thêm hàm chọn phiếu trả:
     - `selectReturnOrderByKey(key)`
   - Sau khi tải danh sách, tự chọn phiếu đầu tiên nếu chưa có phiếu đang chọn.
   - Click dòng bên trái sẽ đổi chi tiết bên phải.

3. `public/style.css`
   - Thêm CSS cho layout 40% - 60%.
   - Thêm trạng thái dòng đang chọn.
   - Thêm khung chi tiết, khối tổng hợp, bảng sản phẩm trả.
   - Responsive về 1 cột khi màn hình nhỏ.

## Quy tắc readonly
Panel chi tiết chỉ render bằng `div`, `span`, `strong`, `table`.
Không tạo `input`, `select`, `textarea`, nên người dùng chỉ xem, không chỉnh sửa.

## Kiểm tra
- `node --check public/js/app/07-debt-cashbook.js`: OK.
- Kiểm tra ZIP được tạo lại thành công.
