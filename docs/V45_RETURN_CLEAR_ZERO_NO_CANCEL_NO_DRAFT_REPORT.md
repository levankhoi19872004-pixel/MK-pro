# V45 - Sửa lỗi hàng trả về 0 tự sinh RO-DRAFT/cancel

## Lỗi
Khi NVGH hoặc web sửa toàn bộ số lượng trả về 0, hệ thống vẫn có thể:
- sinh/giữ `RO-DRAFT-...` trạng thái `waiting_receive` có tiền,
- hoặc chuyển sang bản `cancelled`, làm màn giao hàng/công nợ vẫn đọc lệch.

## Đã sửa
- `upsertDeliveryReturnOrder()` giờ nếu tổng SL trả = 0 thì clear bản returnOrder tạm hiện có, không insert bản mới.
- `createPendingReturnOrder()` chặn tạo RO-DRAFT nếu payload không có số lượng trả.
- `updateReturnDraftItemsBySalesOrder()` khi tất cả returnQty = 0 sẽ clear trực tiếp các returnOrders cùng SalesOrder, không tạo/cancel bản mới.
- `updateReturnDraftItems()` khi dòng trả về 0 sẽ đưa phiếu về `cleared`, `items=[]`, `amount=0`.
- `ensureReturnDraftForSalesOrder()` không tự cancel khi hết returnQty, mà clear về 0.
- `syncErpDeliveryReturnOrder()` không cancel khi web/ERP xóa hết hàng trả, mà clear phiếu tạm.

## Trạng thái chuẩn khi trả về 0
```js
{
  items: [],
  totalQuantity: 0,
  totalAmount: 0,
  amount: 0,
  debtReduction: 0,
  status: 'cleared',
  returnStatus: 'cleared',
  warehouseReceiveStatus: 'cleared',
  accountingStatus: 'cleared'
}
```
