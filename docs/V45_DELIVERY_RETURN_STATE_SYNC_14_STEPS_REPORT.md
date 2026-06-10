# V45 - Sửa đồng bộ hàng trả màn Đơn đi giao hôm nay theo 14 bước

## Mục tiêu
- KPI Hàng trả bên trái, cột TH từng dòng và khung tổng kết bên phải phải dùng cùng nguồn `returnOrders`.
- Sau khi lưu số lượng hàng trả, không cần F5 vẫn cập nhật lại KPI/list bên trái.
- Danh sách hàng trả bên phải chỉ được lấy đúng phiếu `returnOrders` tương ứng với mã đơn giao đang chọn, không được lấy nhầm phiếu của đơn khác.

## Các điểm đã sửa
1. Thêm hàm `calcReturnAmountFromReturnOrder()` để tính tiền hàng trả từ `totalReturnAmount`, fallback `items[].returnQty * price`.
2. Thêm bộ khóa đối chiếu `deliveryRowOrderKeys()` và `returnOrderSalesKeys()`.
3. Thêm `isReturnOrderForDeliveryRow()` để chỉ match chính xác đơn giao với `returnOrders`.
4. Thêm `findReturnOrderForDeliveryRow()` để lấy đúng returnOrder theo `salesOrderId/salesOrderCode/orderId/orderCode/refId/refCode`.
5. Thêm `applyReturnOrderToDeliveryRow()` để gắn `returnOrder`, `returnOrderItems`, `returnAmount`, `totalReturnAmount` vào row.
6. Thêm `mergeReturnOrdersIntoDeliveryRows()` để merge returnOrders vào toàn bộ list bên trái.
7. Thêm `fetchReturnOrdersForDeliveryFilter()` để tải returnOrders theo ngày + NVGH + trạng thái hiện tại.
8. Sửa `loadDeliveryToday()` để sau khi tải danh sách đơn sẽ tải thêm returnOrders và merge trước khi render KPI/list.
9. Sửa `selectDeliveryOrder()` để sau khi tải returnOrder của đơn đang chọn sẽ cập nhật lại row, KPI và list.
10. Sửa `loadReturnDraftForDeliveryRow()` bỏ fallback sai: nếu không match đúng mã đơn thì không lấy đại dòng returnOrders khác.
11. Sửa `deliveryMetricValues()` để công thức TH/CN tính từ returnOrders đã merge, không lấy công nợ stale từ backend khi đơn chưa ghi AR.
12. Sửa `renderCompactDeliveryOrders()` để cột TH và CN dùng cùng công thức mới.
13. Giữ luồng lưu hiện tại: sau khi PATCH thành công reload list, merge returnOrders, rồi chọn lại đơn.
14. Chặn lỗi danh sách hàng trả bên phải hiện sai đơn: `loadReturnDraftForDeliveryRow()` chỉ hiển thị khi returnOrder match chính xác với đơn giao đang chọn.

## Case cần kiểm tra trên giao diện
- Chọn NVGH, chọn đơn A, nhập hàng trả 1 dòng. KPI Hàng trả bên trái phải đổi ngay.
- Dòng đơn A cột TH phải đổi ngay.
- Công nợ dòng A phải giảm theo hàng trả.
- Đổi số lượng trả về 0, KPI và TH phải về 0.
- Chọn đơn B khác, khung hàng trả không được hiện sản phẩm/returnOrder của đơn A.
- Reload trang, số liệu bên trái và bên phải vẫn khớp.
