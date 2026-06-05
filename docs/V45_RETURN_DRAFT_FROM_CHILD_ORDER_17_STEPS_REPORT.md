# V45 - Return Draft sinh từ đơn con và đồng bộ 17 bước

## Mục tiêu

Chuyển luồng `returnOrders` sang mô hình chuẩn:

```text
Đơn con tạo ra  -> sinh returnOrder draft
Đơn con sửa     -> đồng bộ returnOrder draft
Đơn con hủy/xóa -> hủy returnOrder draft nếu chưa phát sinh trả
Đơn tổng        -> chỉ gắn/gỡ thông tin giao hàng vào returnOrder draft
```

## Các thay đổi chính

1. Thêm bộ hàm trong `src/services/returnOrderService.js`:
   - `ensureReturnDraftForSalesOrder(order)`
   - `syncReturnDraftWithSalesOrder(order)`
   - `cancelReturnDraftForSalesOrder(order)`
   - `restoreReturnDraftForSalesOrder(order)`
   - `attachMasterOrderToReturnDrafts(masterOrder, childOrders)`
   - `detachMasterOrderFromReturnDrafts(childOrders)`
   - `updateReturnDraftItems(idOrCode, body)`

2. Sửa `src/services/orderService.js`:
   - Khi tạo đơn con: tự sinh `returnOrder` trạng thái `draft`.
   - Khi sửa đơn con: đồng bộ lại `soldQty`, `price`, `soldAmount` trong `returnOrders`.
   - Khi hủy/xóa đơn con: chặn nếu đơn chờ trả đã có `returnQty > 0`; nếu chưa có trả thì chuyển `returnOrder.status = cancelled`.

3. Sửa `src/services/masterOrderService.js`:
   - Khi gộp đơn tổng: không tạo phiếu trả mới, chỉ gắn `masterOrderId`, `masterOrderCode`, `deliveryStaff`, `deliveryDate` vào `returnOrders` đã sinh từ đơn con.
   - Khi cập nhật đơn tổng: đồng bộ lại thông tin NVGH/ngày giao vào `returnOrders`.
   - Khi hủy/xóa đơn tổng: không hủy `returnOrders`, chỉ gỡ thông tin đơn tổng và NVGH để đơn con có thể gộp lại.

4. Sửa `src/services/excelImportService.js`:
   - Import DMS bulk sau khi tạo `SalesOrder` sẽ tạo kèm `ReturnOrder` draft.
   - Draft có đầy đủ mã sản phẩm, tên sản phẩm, số lượng bán, giá bán, `returnQty = 0`, `returnAmount = 0`.

5. Sửa `src/services/mobile/sales.service.js`:
   - App bán hàng tạo đơn cũng sinh `returnOrders` trong snapshot.
   - App bán hàng sửa đơn chưa gộp thì đồng bộ lại đơn chờ trả.
   - App bán hàng xóa đơn thì chặn nếu return draft đã có số lượng trả.

6. Sửa API trả hàng:
   - Thêm `PUT /api/returns/:id/items`.
   - Thêm `PUT /api/return-orders/:id/items` trong OpenAPI.
   - API cập nhật `returnQty`, tự tính `returnAmount = returnQty * price`, chặn `returnQty > soldQty`.

## Quy tắc dữ liệu

- 1 đơn con chỉ có 1 đơn chờ trả hàng hiệu lực.
- Khóa logic: `salesOrderId` / `salesOrderCode`.
- Không dùng `masterOrderId + salesOrderId` làm khóa chính vì đơn tổng có thể hủy và gộp lại.
- `returnAmount` không nhập tay, luôn tính từ `returnQty * price`.
- Nếu tất cả `returnQty = 0` thì `status = draft`.
- Nếu có dòng `returnQty > 0` thì `status = has_return`.
- Nếu đã `posted/received/warehouse_received/completed` thì không tự đồng bộ hoặc sửa từ màn giao hàng.

## Test đã chạy

- `node -c` các file đã sửa: OK.
- `npm run docs:generate`: OK, OpenAPI đã cập nhật route mới.
- `node test-return-draft-flow.js`: OK.

Case test riêng đã kiểm tra:

1. Tạo đơn con -> sinh đúng 1 returnOrder draft.
2. Sửa số lượng đơn con -> returnOrder cập nhật `soldQty`.
3. Sửa `returnQty = 2` -> status thành `has_return`, tính đúng tiền trả.
4. Nhập `returnQty > soldQty` -> bị chặn.
5. Hủy đơn con khi đã có trả hàng -> bị chặn.
6. Đưa `returnQty` về 0 -> status quay lại `draft`.
7. Gộp đơn tổng -> returnOrder được gắn `masterOrderId`, `deliveryStaffCode`.
8. Hủy đơn tổng -> returnOrder được gỡ `masterOrderId`, không bị hủy.

## Lưu ý

`npm test` tổng thể vẫn còn các test cũ ngoài phạm vi thay đổi đang fail:

- `test-delivery-6-metrics-static.js` yêu cầu chuỗi UI cũ `PT ${deliveryCompactMoney(pt)}` không còn khớp với file hiện tại.
- `ProductService.listProducts maps stock display fields` đang fail do quy tắc list sản phẩm yêu cầu query/allowAll, không liên quan luồng return draft.

