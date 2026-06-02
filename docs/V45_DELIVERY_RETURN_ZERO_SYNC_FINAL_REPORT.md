# V45 - Fix đồng bộ tiền hàng trả khi sửa về 0

## Lỗi
- App giao hàng tab Thu tiền vẫn hiển thị Hàng trả 594.097 dù danh sách sản phẩm trả hiện tại đã về 0.
- Web bên trái dòng đơn vẫn hiện Hàng trả cũ, bên phải chi tiết tính lại bằng 0.

## Nguyên nhân
1. Backend mobile list dùng biểu thức `syncedReturn.total || order.returnAmount`, nên khi tổng hàng trả thật bằng 0 lại fallback về `order.returnAmount` cũ.
2. App mobile đọc trực tiếp `order.returnAmount`, chưa ưu tiên tính lại từ `returnItems/deliveryReturnItems`.
3. Web ERP hàm lấy payload hàng trả còn lọc bỏ dòng `qtyReturn = 0`, làm thao tác sửa về 0 không gửi đủ dữ liệu để clear phiếu cũ.
4. Idempotency key của mobile return/confirm chưa chứa số lượng hàng trả/số tiền mới, nên sửa lại trong thời gian ngắn có thể nhận lại response cache cũ.

## Đã sửa
- `src/services/mobile/delivery.service.js`
  - Khi sync returnOrders về app, dùng `syncedReturn.total` trực tiếp, kể cả bằng 0.
  - Idempotency key của `/delivery/return` có thêm danh sách productCode + qtyReturn.
  - Idempotency key của `/delivery/confirm` có thêm cash/bank/reward/collect/debtOrderIds.

- `public/mobile/js/delivery.js`
  - Thêm `deliveryReturnAmount(order)` để ưu tiên tính tiền hàng trả từ `deliveryReturnItems/returnItems`.
  - Các màn Đơn giao, Thu tiền, Báo cáo dùng nguồn này thay vì đọc thẳng `order.returnAmount` cũ.

- `public/js/app/06-master-delivery.js`
  - Cho phép gửi cả dòng hàng trả = 0 khi lưu chỉnh sửa.
  - Thêm `deliveryReturnAmountFromItems(row)` để hiển thị tiền hàng trả theo chi tiết hàng trả hiện tại.

## Kết quả đúng
- Nếu nhân viên nhập trả hàng rồi sửa tất cả SL trả về 0:
  - returnOrders tạm cũ được clear/cancel.
  - salesOrder.returnAmount về 0.
  - App tab Thu tiền hiển thị Hàng trả = 0.
  - Web danh sách bên trái và chi tiết bên phải cùng = 0.
