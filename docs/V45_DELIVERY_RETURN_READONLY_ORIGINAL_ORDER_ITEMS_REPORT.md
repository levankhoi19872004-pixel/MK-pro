# V45 - Delivery return list uses original order items + readonly returnOrders merge

## Mục tiêu
Chỉnh lại danh sách trả hàng trên phần mềm theo hướng chuẩn:

1. Lấy đơn giao gốc.
2. Lấy toàn bộ `order.items`.
3. Lấy `returnOrders` theo đúng `salesOrderId` / `salesOrderCode`.
4. Ghép theo `productCode`.
5. Hiển thị tất cả sản phẩm của đơn.
6. Dòng nào không trả thì `returnQty = 0`.
7. Không cho sửa thông tin đơn gốc.
8. Chỉ cho xem/duyệt trên phần mềm; số lượng trả chỉ sửa trên app giao hàng.

## File đã chỉnh

### `public/js/app/06-master-delivery.js`
- `getDeliveryReturnItemsPayload()` không còn lấy dữ liệu từ input chỉnh sửa hàng trả.
- `renderDeliveryReturnItems(row)` luôn render theo danh sách sản phẩm gốc của đơn giao.
- `returnOrders.items` chỉ dùng để ghép số lượng trả theo mã sản phẩm.
- Dòng không trả vẫn hiện với SL trả = 0.
- Bỏ input nhập số lượng trả; thay bằng block readonly gồm:
  - SL trả
  - giá trị trả
- `submitDeliveryEdit()` luôn xóa `payload.returnItems`, không gửi danh sách trả hàng từ phần mềm lên backend.

### `src/services/masterOrderService.js`
- `updateDeliveryTodayOrder()` không nhận `returnItems` / `returnAmount` từ form web.
- Tổng hàng trả và danh sách hàng trả được đọc lại từ `returnOrders`.
- Nếu web cố gửi `returnItems`, backend trả lỗi nghiệp vụ.
- Bỏ việc màn giao hàng hôm nay tự sinh/chỉnh `returnOrders`; nguồn trả hàng chuẩn là app giao hàng.

### `public/style.css`
- Thêm style cho bảng hàng trả readonly.
- Dòng có hàng trả được nhấn nhẹ bằng nền/viền riêng.
- Dòng không trả vẫn hiển thị rõ SL trả = 0.

## Kiểm tra kỹ thuật
- `node --check public/js/app/06-master-delivery.js`: OK.
- `node --check src/services/masterOrderService.js`: OK.
- `npm test` chưa pass toàn bộ vì môi trường ZIP thiếu `node_modules/mongoose` và có test static cũ đang kiểm tra chuỗi `PT ${deliveryCompactMoney(pt)}` không còn khớp với UI hiện tại.
