# V45 Return Orders Two-way Sync Fixed

## Mục tiêu

Chuẩn hoá phần hàng trả trên app giao hàng và phần mềm web theo một nguồn duy nhất: `returnOrders`.

## Quy tắc đã áp dụng

1. `order.items` là danh sách sản phẩm gốc của đơn giao.
2. `returnOrders.items` là số lượng trả thực tế.
3. App giao hàng và phần mềm đều hiển thị: `order.items + returnOrders.items`.
4. Cả app và phần mềm đều được sửa `returnQty`.
5. Không sửa tên sản phẩm, giá bán, số lượng giao gốc.
6. Một đơn giao chỉ có một phiếu trả active theo `salesOrderId/salesOrderCode`.
7. Không cho sửa nếu phiếu trả đã gộp đơn tổng trả hàng hoặc đã nhập kho/ghi sổ.
8. Mỗi lần phần mềm sửa sẽ ghi `updatedFrom: web`; app tiếp tục ghi `source: mobile_delivery/mobile`.

## API mới

- `GET /api/return-orders/by-sales-order/:salesOrderId`
- `PUT /api/return-orders/by-sales-order/:salesOrderId/items`

Body mẫu:

```json
{
  "items": [
    { "productCode": "64773957", "returnQty": 1 },
    { "productCode": "65650862", "returnQty": 0 }
  ],
  "source": "web"
}
```

## File đã chỉnh

- `src/routes/returnRoutes.js`
- `src/controllers/returnOrderController.js`
- `src/services/returnOrderService.js`
- `public/js/app/06-master-delivery.js`
- `public/index.html`
- `docs/openapi.json`

## Kết quả

App sửa hàng trả → lưu vào `returnOrders` → phần mềm tải lại thấy số mới.

Phần mềm sửa hàng trả → lưu vào `returnOrders` → app tải lại đơn thấy số mới.
