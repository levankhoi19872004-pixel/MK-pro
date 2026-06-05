# V45 - Chuẩn hóa 1 đơn bán = 1 phiếu trả hàng

## Mục tiêu

- App giao hàng và phần mềm web dùng chung một mã phiếu trả: `RO-{salesOrderCode}`.
- Không tạo thêm `RO-DRAFT-*`, `RO-MOBILE-*`, `THH*` cho cùng một đơn bán.
- Khi sửa số lượng trả về 0: clear chính phiếu `RO-{salesOrderCode}`.
- Khi nhập lại hàng trả: update chính phiếu `RO-{salesOrderCode}`.
- Các bản trùng cũ được chuyển sang `duplicate_cancelled`.

## File đã chỉnh

- `src/services/returnOrderService.js`
- `src/services/mobile/delivery.service.js`
- `src/routes/mobileRoutes.js`
- `src/services/mobile/sales.service.js`
- `src/services/excelImportService.js`
- `src/services/masterOrderService.js`
- `src/services/reportService.js`
- `scripts/repair-return-orders-canonical.js`

## Quy tắc mới

Ví dụ:

```txt
SalesOrder.code = HU90202293
ReturnOrder.code = RO-HU90202293
ReturnOrder.id   = RO-HU90202293
```

## Script dọn dữ liệu cũ

Chạy thủ công sau khi deploy:

```bash
node scripts/repair-return-orders-canonical.js
```

Script sẽ gom returnOrders theo `salesOrderId/salesOrderCode`, giữ 1 bản chính, đổi về `RO-{salesOrderCode}`, hủy bản trùng và tạo unique index `uniq_return_orders_code` nếu dữ liệu đã sạch.
