# V45 Mobile Delivery App Rebuilt Clean

## Mục tiêu
Làm lại luồng app giao hàng để tránh lỗi hàng trả cũ hiện lại khi NVGH xác nhận đơn không có hàng trả.

## Thay đổi chính

### 1. Làm lại `public/mobile/js/delivery.js`
- Luồng sạch 4 tab: Đơn giao → Hàng giao → Thu tiền → Báo cáo.
- Tab Hàng giao là nơi duy nhất tạo/sửa phiếu hàng trả.
- Tab Thu tiền chỉ lưu tiền mặt/chuyển khoản/trả thưởng, không tạo/sửa phiếu hàng trả.
- Khi xác nhận hàng giao:
  - Chỉ gửi các dòng có `qtyReturn > 0`.
  - Nếu không có hàng trả, gửi `items: []` để backend clear phiếu trả cũ.

### 2. Sửa `src/services/mobile/delivery.service.js`
- `getActiveReturnOrdersForSalesOrder()` loại thêm trạng thái `cleared/clear` để phiếu đã clear không còn được cộng tiền.
- `createReturnFromDelivery()` lọc `rawItems` thành `items` chỉ gồm dòng có số lượng trả > 0.
- `confirmDelivery()` refresh `returnOrders` từ Mongo ngay trước khi tính hàng trả, tránh dùng snapshot cũ.

## Lỗi đã chặn
- App gửi toàn bộ sản phẩm `qtyReturn = 0` nhưng backend vẫn hiểu là có items.
- Confirm giao hàng sau clear vẫn kéo lại `returnOrders` cũ trong snapshot.
- Tab Thu tiền vô tình gọi lại tạo phiếu trả.

## Kiểm tra kỹ thuật
- `node --check public/mobile/js/delivery.js`: OK
- `node --check src/services/mobile/delivery.service.js`: OK
