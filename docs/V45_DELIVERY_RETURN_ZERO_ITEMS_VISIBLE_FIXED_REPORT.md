# V45 - Delivery Today Return Zero Items Visible Fixed

## Vấn đề
Khung **Danh sách hàng trả** bên phải đang chỉ hiện các dòng có số lượng trả > 0, nên các sản phẩm trong `returnOrders` có `returnQty = 0` bị ẩn. Điều này sai với luồng nghiệp vụ mới: `returnOrders` là đơn chờ trả hàng sinh từ đơn con, phải hiển thị toàn bộ hàng đã bán để người dùng nhập số lượng trả.

## Đã sửa
File sửa chính:

- `public/js/app/06-master-delivery.js`

Các thay đổi:

1. Thêm hàm `deliveryReturnLineKey()` để nhận diện dòng theo mã hàng + đơn vị + giá.
2. Thêm hàm `mergeReturnDraftItemsWithSoldItems()` để trộn dữ liệu `returnOrders.items` với danh sách hàng bán gốc của đơn.
3. Khi `returnOrders` chỉ có dòng đã trả, frontend vẫn bổ sung lại các dòng hàng bán còn lại với `returnQty = 0`.
4. Khi tải `returnOrders`, ưu tiên bản draft sinh từ `sales_order_draft` / `sales_order`, sau đó ưu tiên bản có nhiều dòng item nhất.
5. Tổng tiền hàng trả vẫn chỉ tính theo `returnQty × price`, nên dòng bằng 0 không làm sai báo cáo.

## Quy tắc sau sửa

- Khung Danh sách hàng trả: hiện tất cả sản phẩm đã bán trong đơn.
- Dòng chưa trả: vẫn hiện, ô nhập = 0.
- Tổng Hàng trả: chỉ cộng dòng có `returnQty > 0`.
- Báo cáo/In phiếu trả hàng: vẫn có thể lọc riêng `returnQty > 0`.

## Test

- `node -c public/js/app/06-master-delivery.js`: OK
- `npm run docs:generate`: OK
