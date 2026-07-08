# Phase200 - Delivery Adjustment ReturnOrders Fix Report

## Mục tiêu

Sửa riêng popup `Đơn giao hôm nay (New) -> Điều chỉnh -> Hàng giao/Hàng trả`:

1. `SL giao` phải lấy từ đơn gốc trong `orders/salesOrders.items`, không lấy từ read model/list row/snapshot.
2. `SL trả đúng` khi bấm `Lưu điều chỉnh` phải ghi thật vào `returnOrders` qua repository boundary.

## Nguyên nhân gốc

- Frontend mở popup bằng row đang có trên danh sách, nên bảng hàng trả phụ thuộc vào `row.items`/read model của màn list. Khi list row đã merge/compact từ nhiều nguồn, cột `SL giao` có thể lệch với đơn gốc.
- Payload lưu trước đây có `correctedReturnItems`, nhưng backend `deliveryCloseoutCorrection.service` chỉ dùng phần này để tính `returnAdjustmentAmount`/version/AR-DEBT adjustment; chưa có bước upsert/update chứng từ gốc `returnOrders`.
- Luồng save vì vậy giống replay tiền thu/closeout state, chưa replay đúng nghiệp vụ hàng trả.

## Thay đổi chính

| File | Thay đổi |
|---|---|
| `src/services/deliveryCloseoutCorrection.service.js` | Thêm resolver `buildDeliveryAdjustmentReturnRows()` đọc `orders.items + returnOrders.items`; thêm `applyReturnOrderAdjustment()` ghi `returnOrders` qua `returnOrderRepository.upsert`; validate SL trả không âm/không vượt SL giao; chặn sửa direct nếu returnOrder đã stock/accounting posted. |
| `src/routes/newOperationsRoutes.js` | Thêm endpoint `GET /api/new/delivery-today/closeouts/:id/adjustment-return-rows`; response save trả thêm `returnOrderAdjustment`/`returnUpdated`. |
| `public/js/app/new/91-delivery-today-new.js` | Khi mở popup, gọi endpoint canonical để thay thế dữ liệu hàng trả; `SL giao` dùng `deliveredQty`; payload save gửi đủ `returnAdjustment.items` và `returnAdjustmentItems`. |
| `test/delivery-adjustment-returnorders-contract-static.test.js` | Thêm static contract cho resolver canonical, ghi `returnOrders`, payload frontend. |
| `test/delivery-closeout-correction-contract-static.test.js` | Cập nhật contract Phase92: cho phép ghi returnOrders qua repository boundary nhưng vẫn cấm inventory/AR-RETURN/reversal flow. |
| `RELEASE_MANIFEST.json` | Regenerate manifest sau khi sửa source. |

## Contract mới của tab hàng trả

Backend trả canonical rows:

```js
{
  orderId,
  orderCode,
  returnRows: [
    {
      productCode,
      productName,
      deliveredQty,        // orders.items
      unitPrice,
      deliveredAmount,
      currentReturnQty,    // returnOrders.items
      desiredReturnQty,
      deltaReturnQty,
      returnAmount,
      deltaReturnAmount,
      source: {
        deliveredQtySource: 'orders.items',
        currentReturnQtySource: 'returnOrders.items'
      }
    }
  ]
}
```

Payload lưu mới:

```js
{
  correctedReturnItems,        // chỉ dòng có chênh lệch, giữ tương thích version/audit
  returnAdjustmentItems,       // toàn bộ dòng sau điều chỉnh
  returnAdjustment: {
    source: 'delivery-adjustment-popup',
    items: fullReturnItems
  },
  returnAdjustmentAmount,
  correctedCashLines,
  paymentCorrection,
  reason,
  note
}
```

## Quy tắc an toàn

- Không ghi trực tiếp `ReturnOrder.updateOne/findOneAndUpdate/bulkWrite`; chỉ qua `returnOrderRepository.upsert()`.
- Không tạo `stockTransactions` khi chỉ điều chỉnh hàng trả.
- Không sinh `AR-RETURN` trong luồng này.
- Nếu returnOrder đã `stockPosted`, `inventoryPosted`, `stockInStatus='posted'`, `accountingConfirmed=true` hoặc `accountingStatus` đã confirmed/posted thì chặn sửa trực tiếp bằng lỗi `RETURN_ORDER_ALREADY_POSTED_OR_CONFIRMED`.
- Nếu có nhiều returnOrder active chưa post cho cùng đơn, service gom desired state vào phiếu chính và cancel phiếu trùng chưa post để tránh cộng lặp.

## Test đã chạy

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run check:syntax` | PASS | `SYNTAX_OK 1318 JavaScript files` |
| `node --test test/delivery-closeout-correction-contract-static.test.js test/delivery-adjustment-bulk-commit-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-adjustment-returnorders-contract-static.test.js` | PASS | 27/27 pass |
| `npm run check:release-manifest` | PASS | Sau khi chạy `npm run release:manifest` |
| `npm run check:source-bundles` | FAIL môi trường | Thiếu dependency local `terser`; không phải lỗi syntax/source đã sửa. |
| `npm test` | FAIL tại pretest môi trường | Dừng ở `check:source-bundles` do thiếu `terser`. |

## MongoDB verification sau deploy

```js
db.orders.findOne(
  { orderCode: 'MÃ_ĐƠN_TEST' },
  { orderCode: 1, items: 1, products: 1, totalAmount: 1, deliveryCloseout: 1 }
)

db.returnOrders.find({
  $or: [
    { orderCode: 'MÃ_ĐƠN_TEST' },
    { salesOrderCode: 'MÃ_ĐƠN_TEST' },
    { sourceOrderCode: 'MÃ_ĐƠN_TEST' },
    { originalOrderCode: 'MÃ_ĐƠN_TEST' }
  ]
}).pretty()
```

Sau khi sửa `SL trả đúng` trên UI và bấm `Lưu điều chỉnh`, query `returnOrders.items.returnQty` phải đổi thật.

## Rủi ro còn lại

- Phase này xử lý direct adjustment cho returnOrder chưa post/chưa accounting confirmed. ReturnOrder đã nhập kho/xác nhận kế toán sẽ bị chặn để tránh lệch tồn kho/AR.
- Nếu nghiệp vụ cần sửa hàng trả sau khi đã nhập kho, nên làm phase riêng theo hướng correction/reversal stock-in an toàn.
