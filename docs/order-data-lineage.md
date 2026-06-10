# Order Data Lineage - Chuẩn thông tin đơn hàng

## Mục tiêu

Chuẩn hóa nguồn gốc dữ liệu của đơn hàng từ lúc tạo đơn bán đến khi gộp giao, giao hàng, trả hàng, thu tiền, xác nhận kế toán và lên công nợ.

## Nguồn chuẩn duy nhất

| Thông tin | Nguồn chuẩn |
| --- | --- |
| NVBH | `salesOrders.salesStaffCode` / `salesOrders.salesStaffName` |
| NVGH | `masterOrders.deliveryStaffCode` / `masterOrders.deliveryStaffName`; sau khi gộp phải đồng bộ sang `salesOrders.deliveryStaffCode` / `salesOrders.deliveryStaffName` |
| Khách hàng | `salesOrders.customerCode` / `salesOrders.customerName` |
| Công nợ | `arLedgers` |
| Trả hàng | `returnOrders` |
| Thu tiền | `receipts` / `payment` / collection fields trên đơn giao trước khi kế toán xác nhận |
| Tồn kho | `inventories` |

## Trường không được dùng làm nguồn nghiệp vụ chính

Các trường sau chỉ được dùng cho audit/log/compatibility, không được dùng để suy luận NVBH/NVGH khi post AR hoặc report công nợ:

```txt
staffCode
staffName
createdBy
userName
```

## Luồng chuẩn

```txt
createOrder
  -> salesOrders ghi NVBH chuẩn
createMasterOrder / updateMasterOrder
  -> masterOrders ghi NVGH chuẩn
  -> salesOrders đồng bộ NVGH, không ghi đè NVBH
Delivery Today API
  -> hiển thị NVBH từ salesOrders, NVGH từ masterOrders/salesOrders đã đồng bộ
ReturnOrder
  -> snapshot NVBH từ salesOrders, NVGH từ salesOrders/masterOrders
confirmDeliveryAccounting
  -> AR-SALE lấy NVBH từ salesOrders, NVGH từ masterOrders/salesOrders
  -> AR-RETURN lấy từ returnOrders đã snapshot
Debt report
  -> chỉ hiển thị nhân sự đã ghi trên arLedgers; không tự sửa bằng customer/user metadata
```

## Quy tắc kiểm thử bắt buộc

Case chuẩn:

```txt
NVBH = ghtp - Phạm Văn Hiếu
NVGH = ghtp - Hiếu Giao Hàng TP
```

Sau toàn bộ luồng tạo đơn -> gộp đơn -> giao hàng -> trả hàng -> thu tiền -> xác nhận kế toán -> công nợ, hai thông tin này không được đổi chéo.
