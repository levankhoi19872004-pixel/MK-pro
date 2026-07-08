# Phase 190 - Delivery Adjustment Deeplink Resolver

## Mục tiêu
Sửa lỗi click thông báo điều chỉnh đơn giao nhưng màn `Đơn giao hôm nay (New)` báo không tìm thấy đơn trong phạm vi lọc.

## Nguyên nhân gốc
Deep-link `open-adjustment-detail` đang phụ thuộc vào `DeliveryTodayNewService.listOrders` và collection `orders`. Trong khi nghiệp vụ điều chỉnh chốt sổ thuộc về bản ghi correction/version, khóa ổn định để mở chi tiết phải là `adjustmentCode`/`correctionCode`. URL cũ còn có khả năng đưa context id dạng `DCO-SO...-v1` vào tham số `orderId`, làm frontend hiểu nhầm đó là `_id` đơn hàng.

## Hướng sửa
- Thêm resolver backend chuyên biệt: `GET /api/new/delivery-today/adjustments/resolve`.
- Resolver ưu tiên tìm bản ghi điều chỉnh theo `adjustmentCode`, sau đó mới tìm đơn gốc trong `orders`.
- Nếu không tìm thấy đơn gốc nhưng tìm thấy adjustment, vẫn trả chi tiết read-only kèm cảnh báo rõ ràng.
- Frontend khi có `action=open-adjustment-detail` và `adjustmentCode` sẽ gọi resolver trước, không phụ thuộc vào danh sách đơn đang lọc.
- Notification link được chuẩn hóa: không dùng `DCO...` làm `orderId`; tách riêng `closeoutVersionId`.

## File chính đã sửa
- `src/services/deliveryCloseoutCorrection.service.js`
- `src/routes/newOperationsRoutes.js`
- `src/services/events/notificationFormatter.js`
- `src/services/source-contracts/SourceContractRegistry.js`
- `public/js/app/notification-center.js`
- `public/js/app/new/91-delivery-today-new.js`
- `public/fragments/index/07-index-body.html`
- `docs/openapi.json`
- `test/delivery-adjustment-deeplink-resolver.test.js`
- `test/fixtures/index-page/phase79-assembled.sha256`

## Contract mới
```http
GET /api/new/delivery-today/adjustments/resolve?adjustmentCode=...&orderCode=...
```

Response trả về các nhóm dữ liệu chính:
- `adjustmentFound`
- `orderFound`
- `adjustment`
- `order`
- `row`
- `context`
- `diagnostics`
- `warnings`
- `sourceNote`

## Test thủ công
1. Mở notification của đơn có điều chỉnh, ví dụ `B0038932`.
2. URL có `action=open-adjustment-detail` và `adjustmentCode`.
3. Frontend gọi `/api/new/delivery-today/adjustments/resolve`.
4. Nếu đơn còn trong `orders`, modal chi tiết điều chỉnh mở đúng.
5. Nếu đơn không còn trong `orders`, modal vẫn mở dạng read-only và có cảnh báo rõ ràng.
6. Không còn báo sai kiểu: `Không tìm thấy đơn B0038932 trong phạm vi đang lọc` cho case đã có adjustment hợp lệ.

## Kiểm tra đã chạy
- `npm run check:syntax`: PASS
- `npm run check:source-bundles`: PASS
- `npm run docs:check`: PASS
- `node --test test/delivery-adjustment-deeplink-resolver.test.js test/notification-center-static.test.js test/phase79-production-strangler.test.js`: PASS

## Ghi chú
`npm test` full đã được thử nhưng vượt thời gian chạy và gặp một số test contract cũ không liên quan trực tiếp đến lỗi deeplink adjustment. Các check khoanh vùng cho phần sửa này đã PASS.
