# V46 - Luồng mới hàng trả giao hàng

## Quy tắc nguồn dữ liệu

1. `salesOrders` / `masterOrders` chỉ là nguồn danh sách đơn giao và danh sách sản phẩm gốc.
2. `returnOrders` là nguồn duy nhất lưu số lượng trả, giá trị trả và phiếu trả phát sinh.
3. `masterReturnOrders` chỉ lưu header + `returnOrderIds`; không copy danh sách item trả vào đơn tổng.
4. Màn Đơn giao hôm nay không được tin `salesOrders.returnAmount` hoặc `masterOrders.returnAmount`.
5. `returnAmount` hiển thị trên giao hàng phải được overlay/tính lại từ `returnOrders`.

## App giao hàng 5 tab

1. Danh sách đơn giao: đọc `salesOrders` + `masterOrders` qua DeliveryEngine.
2. Sản phẩm cần giao: đọc từ `order.items`, nhập số lượng trả nhưng chưa lưu DB.
3. Hàng trả: đọc lại từ `returnOrders`, cho sửa SL; bấm Cập nhật hàng trả sẽ ghi lại `returnOrders`.
4. Thu tiền: giữ luồng hiện tại, tiền hàng trả lấy từ `returnOrders`.
5. Báo cáo: giữ luồng hiện tại.

## Đơn giao hôm nay

Đã thêm tab/danh sách Hàng trả trong chi tiết đơn. Danh sách này đọc qua:

`GET /api/delivery/returns`

Nguồn trả về là `returnOrders`, được lọc theo danh sách đơn giao đang hiển thị.

## API chuẩn

- `GET /api/delivery/orders`: danh sách đơn giao, overlay hàng trả từ `returnOrders`.
- `GET /api/delivery/returns`: danh sách dòng hàng trả đã phát sinh từ `returnOrders`.
- `POST /api/delivery/return`: lưu phiếu trả vào `returnOrders`; không mirror vào `salesOrders`.
- `POST /api/delivery/payment`: lưu thu tiền, đọc `returnAmount` từ canonical order đã overlay `returnOrders`.
- `POST /api/delivery/confirm`: xác nhận giao hàng, không tự tạo phiếu trả.
