# V46 - Đồng bộ bỏ đơn con khỏi đơn tổng và gỡ gán giao hàng

## Hiện tượng

Sau khi bỏ một đơn con khỏi đơn tổng, đơn vẫn xuất hiện tại màn **Đơn giao hôm nay** của nhân viên giao hàng cũ.

## Nguyên nhân gốc

Luồng sửa đơn tổng trước đây chỉ cập nhật:

- `mergeStatus = unmerged`
- `status = pending`
- bỏ `masterOrderId/masterOrderCode`

Nhưng không xóa các trường gán giao hàng đã được sao chép sang `salesOrders`:

- `deliveryStaffId/deliveryStaffCode/deliveryStaffName`
- `deliveryDate`
- `routeName/deliveryRoute`
- các alias cũ như `deliveryCode`, `shipperCode`, `nvghCode`, `driverCode`...

Trong khi `/api/delivery/orders` đọc trực tiếp `salesOrders` theo `deliveryDate + deliveryStaffCode`, vì vậy đơn đã tách vẫn tiếp tục hiện cho NVGH cũ.

Ngoài ra, `masterOrders` có thể còn các mảng tham chiếu legacy (`orderIds`, `salesOrderIds`, `orderCodes`...) do update kiểu `$set`, gây nguy cơ một số API cũ đọc lại đơn đã bỏ.

## Quy tắc mới

1. `masterOrders.childOrderIds` là nguồn duy nhất xác định đơn con thuộc đơn tổng.
2. SalesOrder chỉ được mang thông tin NVGH/ngày giao/route khi đang thuộc đơn tổng.
3. Bỏ đơn con phải đồng bộ trong cùng Mongo transaction:
   - cập nhật `masterOrders.childOrderIds`;
   - xóa toàn bộ liên kết master và gán NVGH khỏi `salesOrders`;
   - xóa liên kết tương ứng khỏi `returnOrders` chưa khóa;
   - đưa đơn về trạng thái `pending/unmerged`.
4. Không cho bỏ đơn nếu đã phát sinh giao hàng, thu tiền, hàng trả hoặc xác nhận kế toán.
5. `DeliveryEngine` chỉ đọc các SalesOrder còn có liên kết đơn tổng; snapshot NVGH/ngày giao trôi nổi không còn đủ điều kiện xuất hiện.

## File thay đổi

- `src/services/master-order/masterOrderLegacy.service.js`
- `src/services/returnOrderService.js`
- `src/engines/delivery.engine.js`
- `src/utils/masterOrderAssignment.util.js`
- `scripts/repair-detached-delivery-assignments.js`
- `package.json`
- `test/master-order-detach-delivery-invariant.test.js`
- `test/master-order-remove-child-flow.test.js`
- `test-return-draft-flow.js`

## Sửa dữ liệu cũ

Dry-run một đơn:

```bash
npm run repair:detached-delivery -- --order=SO1781309656775700
```

Ghi sửa sau khi kiểm tra kết quả dry-run:

```bash
npm run repair:detached-delivery -- --order=SO1781309656775700 --write
```

Script tự bỏ qua:

- đơn vẫn thuộc `childOrderIds` của một đơn tổng đang hoạt động;
- công nợ ngoài luồng;
- đơn đã phát sinh giao hàng/tiền/hàng trả/kế toán.

## Kiểm thử

```bash
npm test
```

Kết quả tại thời điểm vá:

- 252 tests
- 252 passed
- 0 failed
