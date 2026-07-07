# PHASE182 - Notification Delivery Adjustment Deep-link Fix

## Mục tiêu

Sửa luồng `Thông báo -> Đã điều chỉnh đơn giao -> Xem` để mở trực tiếp đúng ngữ cảnh `Đơn giao hôm nay (New)` và popup chi tiết điều chỉnh/lịch sử version của đơn tương ứng.

## File đã sửa/thêm

### Sửa backend

- `src/services/events/notificationFormatter.js`
  - Thêm `deliveryAdjustmentActionUrl()`.
  - Với event `DELIVERY_CLOSEOUT_ADJUSTED`, action URL mới có dạng:
    `/#/delivery-today-new?action=open-adjustment-detail&orderCode=...&deliveryDate=...&adjustmentId=...`.

- `src/services/deliveryCloseoutCorrection.service.js`
  - Bổ sung metadata deep-link khi emit domain event điều chỉnh đơn giao:
    - `orderCode`
    - `orderId`
    - `deliveryDate`
    - `correctionId` / `adjustmentId`
    - `correctionCode` / `adjustmentCode`
    - `targetPage: 'delivery-today-new'`
    - `action: 'open-adjustment-detail'`

### Sửa frontend

- `public/js/app/notification-center.js`
  - Sau khi bấm `Xem`, dùng notification trả về từ API mark-read để nhận metadata.
  - Nhận diện notification điều chỉnh đơn giao bằng `eventType`, metadata hoặc fallback text.
  - Fallback parse `orderCode` từ nội dung cũ dạng `Đơn B0038977 ...`.
  - Điều hướng tới `#/delivery-today-new?...` và dispatch event nội bộ `mkpro:delivery-open-adjustment`.

- `public/js/app/new/91-delivery-today-new.js`
  - Lắng nghe event `mkpro:delivery-open-adjustment`.
  - Hỗ trợ mở lại sau reload bằng hash `#/delivery-today-new?action=open-adjustment-detail...`.
  - Tự set ngày giao nếu có `deliveryDate`; nếu notification cũ thiếu ngày thì bỏ lọc ngày để tìm theo mã đơn rộng hơn.
  - Tự set ô tìm kiếm/mã đơn.
  - Load danh sách đơn.
  - Tìm đúng đơn theo `orderCode/orderId/salesOrderCode/salesOrderId`.
  - Highlight dòng đơn.
  - Mở popup `Chi tiết điều chỉnh đơn giao` ở chế độ view-only, mặc định tab `Lịch sử`.
  - Không hiển thị/lưu thay đổi khi mở từ thông báo.

- `public/fragments/index/07-index-body.html`
  - Bump query version cho script `91-delivery-today-new.js` và `notification-center.js` để tránh cache trình duyệt.

### Test

- `test/notification-center-static.test.js`
  - Thêm static test bảo vệ deep-link notification điều chỉnh đơn giao và view-only modal.

## Payload trước/sau

### Trước

Notification điều chỉnh đơn giao chủ yếu chỉ có nội dung text và action URL chung:

```txt
/#/delivery-today-new?orderCode=B0038977
```

Frontend chỉ chuyển màn, chưa mở đúng popup chi tiết điều chỉnh.

### Sau

Notification mới có action URL/metadata rõ ngữ cảnh:

```js
{
  module: 'delivery',
  eventType: 'DELIVERY_CLOSEOUT_ADJUSTED',
  metadata: {
    orderCode: 'B0038977',
    orderId: '...',
    deliveryDate: '2026-07-07',
    adjustmentId: '...',
    correctionCode: '...',
    targetPage: 'delivery-today-new',
    action: 'open-adjustment-detail'
  },
  actionUrl: '/#/delivery-today-new?action=open-adjustment-detail&orderCode=B0038977&deliveryDate=2026-07-07&adjustmentId=...'
}
```

## Cách deep-link hoạt động

1. Người dùng bấm `Xem` trong màn Thông báo.
2. Frontend gọi `POST /api/notifications/:id/read`.
3. API trả về notification đầy đủ metadata.
4. Notification Center nhận diện event `DELIVERY_CLOSEOUT_ADJUSTED`.
5. Frontend chuyển sang tab `Đơn giao hôm nay (New)`.
6. Dispatch event `mkpro:delivery-open-adjustment`.
7. Module delivery:
   - set filter ngày/mã đơn;
   - load đơn;
   - tìm đúng dòng;
   - highlight dòng;
   - mở popup chi tiết ở chế độ xem;
   - tab mặc định là `Lịch sử`.

## Fallback cho notification cũ

Nếu notification cũ thiếu metadata:

- Parse mã đơn từ `title/message`, ví dụ `Đơn B0038977 có điều chỉnh...`.
- Nếu thiếu `deliveryDate`, module bỏ lọc ngày để tìm theo mã đơn rộng hơn.
- Nếu vẫn không tìm thấy, giữ mã đơn trong ô tìm kiếm và báo rõ:
  `Không tìm thấy đơn ... trong phạm vi đang lọc.`

## Guard không sửa lan

Không thay đổi:

- nghiệp vụ chốt sổ giao hàng;
- logic lưu điều chỉnh;
- công nợ;
- tồn kho;
- báo cáo;
- module Công cụ -> Chia đơn theo giá trị.

Popup mở từ thông báo là view-only, không lưu correction mới.

## Test đã chạy

```txt
npm run check:syntax
# SYNTAX_OK 1299 JavaScript files

npm run check:source-size
# [source-size-budget] OK

node --test test/notification-center-static.test.js
# pass 7/7
```

## Chưa chạy được trong sandbox

```txt
npm run check:source-bundles
```

Lý do: sandbox chưa có `node_modules`, thiếu package dev `terser`. Trên môi trường đã chạy `npm install`, lệnh này sẽ dùng dependency trong `package.json`.

## Giới hạn còn lại

- Notification cũ không có `deliveryDate` sẽ tìm theo mã đơn trên phạm vi rộng hơn, có thể chậm hơn một chút nếu database lớn.
- Nếu đơn đã bị xóa cứng hoặc mã đơn không còn trong `orders/salesOrders`, hệ thống chỉ có thể chuyển màn + giữ mã tìm kiếm + báo không tìm thấy.
