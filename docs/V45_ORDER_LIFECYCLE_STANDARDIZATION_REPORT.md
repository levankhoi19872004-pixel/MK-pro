# V45 - Báo cáo chuẩn hóa vòng đời đơn con

## Mục tiêu
Chuẩn hóa quy tắc: `orders` là nguồn gốc duy nhất của đơn con. Đơn con không bị xóa khỏi lịch sử sau khi gộp, giao hàng, xác nhận công nợ hoặc trả hàng.

## Các bước đã thực hiện

### 1. Thêm bộ quy tắc vòng đời dùng chung
- Tạo `src/utils/orderStatus.util.js`.
- Tạo `public/js/shared/orderStatus.js`.
- Chuẩn hóa các trạng thái:
  - `status`: `pending | assigned | delivered | cancelled`
  - `mergeStatus`: `unmerged | merged`
  - `deliveryStatus`: `pending | delivered | failed | cancelled`
  - `accountingStatus`: `pending | confirmed`

### 2. Chuẩn hóa model đơn con
- Cập nhật `src/models/SalesOrder.js`.
- Bổ sung các field chuẩn:
  - `orderDate`
  - `deliveryDate`
  - `source`
  - `orderSource`
  - `externalOrderCode`
  - `status`
  - `lifecycleStatus`
  - `deliveryStatus`
  - `mergeStatus`
  - `masterOrderId`
  - `masterOrderCode`
  - `accountingStatus`
  - `accountingConfirmed`
  - `cancelledAt`
  - `cancelReason`

### 3. Chuẩn hóa API lịch sử đơn bán
- Cập nhật `src/services/orderService.js`.
- `/api/sales-orders` hỗ trợ lọc:
  - `dateType=orderDate | deliveryDate | all`
  - `source=sales_app | dms | s3 | manual`
  - `status=pending | assigned | delivered | cancelled`
  - `mergeStatus=unmerged | merged`
  - `deliveryStatus`
  - `accountingStatus=pending | confirmed`
  - `salesStaffCode`
  - `deliveryStaffCode`
  - `q`

### 4. Không để đơn biến mất khỏi lịch sử bán hàng
- Frontend lịch sử bán hàng không tự lọc lại theo status/source/date kiểu cũ.
- Backend là nguồn lọc chuẩn.
- Đơn đã gộp/giao/xác nhận công nợ vẫn hiện nếu phù hợp bộ lọc.

### 5. Chuẩn hóa tạo đơn mới
- Đơn tạo mới dùng:
  - `status=pending`
  - `mergeStatus=unmerged`
  - `deliveryStatus=pending`
  - `accountingStatus=pending`
  - `orderDate` tách riêng với `deliveryDate`

### 6. Chuẩn hóa gộp đơn tổng
- Khi gộp đơn:
  - `masterOrderId/masterOrderCode` được ghi vào `orders`
  - `mergeStatus=merged`
  - `status=assigned`
  - `lifecycleStatus=assigned`
  - Không xóa đơn con khỏi `orders`

### 7. Chuẩn hóa hủy/xóa đơn tổng
- Khi hủy/xóa đơn tổng:
  - `masterOrderId/masterOrderCode` được xóa khỏi đơn con
  - `mergeStatus=unmerged`
  - `status=pending`
  - `deliveryStatus=pending`
  - đơn con quay lại danh sách chưa gộp

### 8. Chuẩn hóa xóa đơn bán
- Không hard-delete `orders` nữa.
- `deleteOrder()` chuyển sang xóa mềm/void để giữ lịch sử và audit.

### 9. Thêm bộ lọc chuẩn ở giao diện Bán hàng
- Thêm lựa chọn `Ngày bán / Ngày giao / Cả 2 ngày`.
- Thêm trạng thái `Tất cả / Chưa gộp / Đã gộp / Đã giao / Đã hủy`.
- Thêm lọc công nợ `Chưa xác nhận CN / Đã xác nhận CN`.
- Thêm nguồn `NVBH/App / DMS / S3 / Thủ công`.

### 10. Thêm script repair dữ liệu cũ
- Tạo `scripts/repair-order-lifecycle.js`.
- Dùng để tự động bổ sung field còn thiếu cho đơn cũ:
  - `orderDate`
  - `deliveryDate`
  - `mergeStatus`
  - `deliveryStatus`
  - `accountingStatus`
  - `status/lifecycleStatus`

## Kiểm tra đã chạy

### Cú pháp JS
Đã chạy `node --check` các file chính:
- `src/services/orderService.js`
- `src/services/masterOrderService.js`
- `src/services/mobile/sales.service.js`
- `src/services/mobileService.js`
- `src/models/SalesOrder.js`
- `src/utils/orderStatus.util.js`
- `scripts/repair-order-lifecycle.js`
- `public/js/app/05-sales-orders.js`
- `public/js/app/00-dom-state.js`
- `public/js/shared/orderStatus.js`

Kết quả: OK.

### npm test
Trong sandbox hiện tại thiếu `node_modules/mongoose`, nên các test cần Mongoose không chạy được đầy đủ. Test static đầu tiên chạy OK. Trên máy anh đã có `node_modules`, hãy chạy lại:

```bash
npm test
```

## Ghi chú vận hành
Sau khi deploy bản này, nên chạy repair một lần trên dữ liệu thật:

```bash
node scripts/repair-order-lifecycle.js
```

Mục tiêu là sửa lại đơn cũ để màn Bán hàng không còn hiện tượng “đơn đi giao có nhưng lịch sử đơn con bị mất”.
