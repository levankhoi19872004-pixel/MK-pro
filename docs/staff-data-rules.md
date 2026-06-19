# Staff data rules

## Quy tắc chốt toàn hệ thống

- **NVBH** chỉ dùng dữ liệu nghiệp vụ: `salesStaffCode` / `salesStaffName`.
- Alias chỉ để đọc dữ liệu cũ: `salesmanCode`, `salesmanName`, `nvbhCode`, `nvbhName`.
- **NVGH** chỉ dùng dữ liệu nghiệp vụ: `deliveryStaffCode` / `deliveryStaffName`.
- Alias chỉ để đọc dữ liệu cũ: `deliveryCode`, `deliveryName`, `nvghCode`, `nvghName`.
- `staffCode` / `staffName` **không phải dữ liệu nghiệp vụ**.
- `staffCode` / `staffName` chỉ dùng cho audit/log/createdBy/updatedBy/actionBy hoặc hiển thị legacy có comment rõ ràng.

## Không được dùng `staffCode` / `staffName` để tính

- NVBH / NVGH.
- AR / Return / Debt Report / Delivery Report.
- Posting accounting hoặc re-accounting.

## Quy tắc collection

| Collection | Field bắt buộc | Ghi chú |
|---|---|---|
| `salesOrders` | `salesStaffCode`, `salesStaffName` | Có thể thêm `deliveryStaffCode`, `deliveryStaffName` sau khi gộp/giao. |
| `masterOrders` | `deliveryStaffCode`, `deliveryStaffName` | Không ghi đè NVBH. |
| `returnOrders` | `salesStaffCode`, `salesStaffName`, `deliveryStaffCode`, `deliveryStaffName`, `salesOrderId`, `salesOrderCode` | Snapshot đủ tại thời điểm trả hàng. |
| `arLedgers` | `salesmanCode`, `salesmanName`, `deliveryStaffCode`, `deliveryStaffName` | `salesman*` là NVBH, `deliveryStaff*` là NVGH. |
