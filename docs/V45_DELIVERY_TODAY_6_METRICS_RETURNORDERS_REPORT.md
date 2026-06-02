# V45 Delivery Today 6 Metrics + returnOrders Source

## Mục tiêu
Chuẩn hóa toàn bộ màn **Đơn đi giao hôm nay** theo cùng một cấu trúc số liệu:

`PT | TM | CK | TT | TH | CN`

Trong đó:
- `PT`: Tổng phải thu
- `TM`: Tiền mặt
- `CK`: Chuyển khoản
- `TT`: Trả thưởng
- `TH`: Trả hàng, luôn lấy từ collection `returnOrders`
- `CN`: Công nợ = `PT - TM - CK - TT - TH`

## File đã sửa

### `src/services/masterOrderService.js`
- Thêm `buildDeliveryAmount(order, returnAmountFromReturnOrders)` làm helper chuẩn cho 6 chỉ tiêu.
- `calculateDeliveryDebt()` dùng helper mới để tránh lệch công thức.
- `isActiveReturnOrder()` loại cả trạng thái `cleared` để phiếu trả đã xóa hết hàng không còn được tính TH.
- `returnAmountForSalesOrder()` và `returnOrdersForSalesOrder()` nhận diện nhiều khóa hơn: `sourceOrderId`, `sourceOrderCode`, `deliveryOrderId`, `deliveryOrderCode`, `masterOrderId`, `masterOrderCode`.
- `findReturnOrdersForDeliveryChildren()` query `returnOrders` theo đủ khóa liên quan.
- `listDeliveryToday()` set `returnAmountFromReturnOrders` trước khi build row.
- API tổng NVGH, chi tiết NVBH và danh sách đơn đều trả cùng các field:
  - `totalReceivable`
  - `cashAmount`
  - `bankAmount`
  - `bonusAmount`
  - `returnAmount`
  - `debtAmount`

### `public/js/app/06-master-delivery.js`
- Thay dòng tóm tắt cũ `H/T/N` bằng cấu trúc thống nhất:
  - `PT ... | TM ... | CK ... | TT ... | TH ... | CN ...`
- Dòng NVGH, dòng NVBH và dòng đơn đều dùng cùng cấu trúc hiển thị.
- Label hàng trả đổi thành `TH`, tooltip ghi rõ lấy từ `returnOrders`.
- KPI phía trên dùng đúng `totalReceivable`, `bonusAmount`, `returnAmount`, `debtAmount`.

## Luồng không thay đổi
- Không sửa AR Ledger.
- Không sửa luồng đẩy công nợ.
- Không sửa luồng admin mở khóa/re-accounting.
- Chỉ chuẩn hóa báo cáo và hiển thị trong màn **Đơn đi giao hôm nay**.

## Công thức chuẩn

```text
CN = PT - TM - CK - TT - TH
TH = SUM(returnOrders.totalAmount/amount/debtReduction) theo đơn giao
```

## Test đã chạy
- `node --check src/services/masterOrderService.js`
- `node --check src/controllers/masterOrderController.js`
- `node --check src/routes/masterOrderRoutes.js`
- `node --check public/js/app/06-master-delivery.js`
- `npm run docs:generate`
- `npm test`: docs tests OK; các test tích hợp cần `mongoose` nên không chạy trong môi trường hiện tại khi chưa cài dependencies.
