# V46 - Quy tắc hàng trả mới: Tab 2 lưu, Tab 3 xem/sửa

## Quy tắc chính

- `order.items` chỉ là nguồn danh sách sản phẩm và giá gốc.
- `returnOrders` là nguồn chính thức duy nhất của hàng trả.
- Không dùng bản nháp frontend để làm nguồn dữ liệu.
- Không mirror `returnAmount`, `returnItems`, `deliveryReturnItems` ngược vào `salesOrders` khi lưu hàng trả.

## Luồng App giao hàng

1. Tab Đơn giao: chọn đơn.
2. Tab Sản phẩm giao: lấy từ `order.items`, nhập SL trả, bấm **Lưu hàng trả**.
3. Backend ghi thẳng vào `returnOrders`.
4. App chuyển sang Tab Hàng trả.
5. Tab Hàng trả đọc lại từ `returnOrders`, cho sửa SL trả, bấm **Cập nhật hàng trả** để ghi lại `returnOrders`.
6. Tab Thu tiền đọc `returnAmount` đã overlay từ `returnOrders`.

## Luồng Phần mềm - Đơn giao hôm nay

1. Tab Sản phẩm giao: lấy từ `order.items`, nhập SL trả, bấm **Lưu hàng trả**.
2. Backend ghi thẳng vào `returnOrders`.
3. Phần mềm chuyển sang Tab Hàng trả.
4. Tab Hàng trả đọc lại từ `returnOrders`, cho sửa SL trả, bấm **Cập nhật hàng trả** để ghi lại `returnOrders`.
5. Các KPI và Thu tiền đọc tiền hàng trả từ `returnOrders`, không tin `salesOrders.returnAmount`.

## API chuẩn

- `POST /api/delivery/return`: tạo/cập nhật hàng trả chính thức trong `returnOrders`.
- `GET /api/delivery/returns`: đọc danh sách hàng trả từ `returnOrders`.
- `POST /api/mobile/delivery/return`: route tương thích cũ đã được chuyển về `DeliveryEngine.saveReturn()` để tránh mirror vào `salesOrders`.

