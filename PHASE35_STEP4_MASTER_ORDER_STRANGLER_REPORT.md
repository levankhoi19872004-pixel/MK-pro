# PHASE 35 - Bước 4: Tách ranh giới Master Order bằng Strangler Pattern

## Đã thực hiện
- Tách toàn bộ quy tắc identity/reference đơn con sang `masterOrderIdentity.util.js`.
- Tạo các boundary rõ ràng: query đơn tổng, command đơn tổng, query giao hàng hôm nay, command giao hàng, accounting và return projection.
- `masterOrderDelivery.service.js` hiện chỉ compose các boundary; route/controller không đổi.
- Accounting tiếp tục có feature flag `USE_NEW_DELIVERY_SETTLEMENT` để rollback.
- Giữ legacy implementation trong giai đoạn chuyển tiếp nhằm không thay đổi transaction/AR/tồn kho trong một lần refactor.

## Module mới
- `masterOrderQuery.service.js`
- `masterOrderCommand.service.js`
- `deliveryTodayQuery.service.js`
- `deliveryOrderCommand.service.js`
- `deliveryAccounting.service.js`
- `masterReturnProjection.service.js`
- `masterOrderIdentity.util.js`

## Bước tiếp theo
Tách các service nghiệp vụ còn lại: Return Order, Sales Order, Delivery Engine, Reports, Import/Export và Print Data Builder theo facade nhỏ.
