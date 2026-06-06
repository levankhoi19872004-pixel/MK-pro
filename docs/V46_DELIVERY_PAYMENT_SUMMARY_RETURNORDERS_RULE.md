# V46 - Quy tắc gộp Thu tiền và Tổng kết

## Quy tắc nghiệp vụ

- Tab **Thu tiền** và tab **Tổng kết** được gộp thành một tab: **Thu tiền & Tổng kết**.
- Người dùng vừa nhập tiền mặt/chuyển khoản/trả thưởng, vừa nhìn thấy đối soát tổng quan của đơn.
- Giá trị **Hàng trả** trong tab này không lấy từ `salesOrders.returnAmount`.
- Giá trị **Hàng trả** phải tính từ các dòng đã lưu trong `returnOrders` theo đơn đang chọn.

## Quy tắc nguồn dữ liệu

- `order.items`: nguồn danh sách sản phẩm và giá gốc.
- `returnOrders`: nguồn duy nhất của hàng trả đã lưu.
- Tab **Sản phẩm giao** tạo/cập nhật phiếu trả vào `returnOrders`.
- Tab **Hàng trả** đọc/sửa từ `returnOrders`.
- Tab **Thu tiền & Tổng kết** tính `returnAmount` từ `returnOrders` rồi mới tính còn nợ.

## Công thức hiển thị

```txt
returnAmount = SUM(returnOrders.amount theo salesOrderId/salesOrderCode/orderId/orderCode)
processed = cash + bank + reward + returnAmount
debt = max(0, receivable - processed)
```

Nếu đã load `returnOrders` mà không có phiếu trả của đơn, `returnAmount = 0`.
Không fallback về `salesOrders.returnAmount` sau khi đã load `returnOrders`.
