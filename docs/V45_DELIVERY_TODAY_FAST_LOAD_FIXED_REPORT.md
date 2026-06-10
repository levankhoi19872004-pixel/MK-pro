# V45 - Sửa chậm mục Đơn tổng hôm nay / Đơn đi giao hôm nay

## Vấn đề
Màn Đơn tổng hôm nay / Đơn đi giao hôm nay load lâu vì backend dùng luồng nặng:

1. `listDeliveryToday()` gọi `listMasterOrders()`.
2. `listMasterOrders()` lại gọi `orderService.getMasterChildren()` cho từng đơn tổng.
3. `getMasterChildren()` đang `findAll()` toàn bộ `salesOrders` mỗi lần lấy con.
4. `listDeliveryToday()` còn gọi `returnOrderRepository.findAll()` toàn bộ `returnOrders`.

Khi dữ liệu nhiều, đây là lỗi N+1 query + full collection scan.

## Đã sửa

### File sửa

`src/services/masterOrderService.js`

Thêm luồng tải nhanh:

- `compactDeliveryOrderKeys()`
- `masterChildOrderRefs()`
- `buildIdentityInFilter()`
- `buildMasterChildrenMapFast()`
- `findReturnOrdersForDeliveryChildren()`

### Nguyên tắc mới

Màn Đơn đi giao hôm nay chỉ được tải dữ liệu của ngày đang xem:

```text
masterOrders theo deliveryDate/date
↓
collect childOrderIds
↓
query salesOrders 1 lần bằng $in
↓
query returnOrders liên quan 1 lần bằng $in
↓
render danh sách
```

Không còn:

```text
mỗi đơn tổng -> load toàn bộ salesOrders
load toàn bộ returnOrders
```

## Index bổ sung

File:

`src/services/mongoIndexService.js`

Thêm index cho `returnOrders`:

- `salesOrderId`
- `salesOrderCode`
- `orderId`
- `orderCode`

Giúp đồng bộ hàng trả theo đơn giao nhanh hơn.

## Không thay đổi luồng công nợ

Bản sửa này chỉ tối ưu tốc độ tải danh sách, không thay đổi nguyên tắc AR Ledger:

```text
Chưa xác nhận kế toán -> chưa ghi công nợ
Xác nhận kế toán -> post AR Ledger
Admin mở khóa -> cần xác nhận lại
Xác nhận lại -> reverse AR cũ + post AR mới
```
