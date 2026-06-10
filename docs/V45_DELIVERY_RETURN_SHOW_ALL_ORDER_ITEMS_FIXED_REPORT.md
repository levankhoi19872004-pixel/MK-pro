# V45 Delivery Today - Return Items Show All Order Items Fixed

## Mục tiêu
Panel "Danh sách hàng trả" trong màn "Đơn đi giao hôm nay" phải hiển thị đầy đủ sản phẩm gốc của đơn giao, kể cả sản phẩm có số lượng trả = 0, để người dùng có thể sửa/bổ sung mã sản phẩm chưa trả.

## Thay đổi chính

### 1. Frontend
File: `public/js/app/06-master-delivery.js`

- Thêm hàm `deliverySoldItemsForReturn(row)` để lấy danh sách sản phẩm gốc theo thứ tự ưu tiên:
  - `soldItems`
  - `orderItems`
  - `salesOrderItems`
  - `originalItems`
  - `items`
- Sửa `mergeReturnDraftItemsWithSoldItems()`:
  - Không còn trả trực tiếp `returnOrders.items` khi số dòng return draft >= số dòng đơn gốc.
  - Luôn dùng sản phẩm gốc của đơn giao làm danh sách chính.
  - `returnOrders` chỉ dùng để map số lượng trả theo `lineKey` hoặc `productCode`.
- Sửa `renderDeliveryReturnItems()`:
  - Render theo danh sách sản phẩm gốc đã merge với dữ liệu trả.
  - Sản phẩm chưa trả vẫn hiện với `returnQty = 0`.

### 2. Backend
File: `src/services/masterOrderService.js`

- Bổ sung thêm vào response của `delivery-today`:
  - `orderItems`
  - `soldItems`
- Hai trường này giữ nguyên danh sách sản phẩm gốc của đơn con, tránh bị nhầm với `returnItems` từ `returnOrders`.

## Kết quả mong muốn

- Mở đơn giao hôm nay.
- Chọn một đơn ở danh sách bên trái.
- Panel bên phải "Danh sách hàng trả" hiển thị đầy đủ mã sản phẩm trong đơn.
- Dòng nào chưa trả sẽ vẫn hiện và có ô số lượng bằng `0`.
- Người dùng có thể sửa từ `0` sang số lượng trả mới.

## Kiểm tra đã thực hiện

- `node --check public/js/app/06-master-delivery.js`: OK.
- `node --check src/services/masterOrderService.js`: OK.
- `npm test`: chưa pass toàn bộ vì bộ test sẵn có đang lỗi cũ/thiếu dependency `mongoose` và một static test cũ thiếu chuỗi `PT ${deliveryCompactMoney(pt)}`; các lỗi này không phát sinh từ thay đổi lần này.
