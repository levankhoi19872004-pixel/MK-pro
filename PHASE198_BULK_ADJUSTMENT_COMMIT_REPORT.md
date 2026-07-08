# Phase198 - Bulk Adjustment Commit

## Mục tiêu

Thêm thao tác hàng loạt trên màn Đơn giao hôm nay (New): tick nhiều đơn và bấm "Ghi nhận điều chỉnh đã chọn" để backend chạy cùng logic như nút Lưu điều chỉnh từng đơn.

## Luồng đã tìm thấy

- Frontend popup Lưu điều chỉnh: `public/js/app/new/91-delivery-today-new.js`, hàm gọi `correctionEndpoint(row)` và POST `/api/new/delivery-today/closeouts/:id/corrections`.
- Backend route lưu tay: `src/routes/newOperationsRoutes.js` route `POST /delivery-today/closeouts/:id/corrections`.
- Service nghiệp vụ lưu tay: `src/services/deliveryCloseoutCorrection.service.js#createCorrection`.
- Service ghi AR-DEBT-ADJUSTMENT: `src/services/accounting/ArDebtAdjustmentPostingService.js`, nhánh `reconcileDebt` gọi `OrderPaymentDebtReconcileService`.

## File thêm/sửa

| File | Nội dung |
|---|---|
| `src/services/delivery/DeliveryAdjustmentCommitService.js` | Service dùng chung cho 1 đơn; route lưu tay và bulk cùng đi qua đây. |
| `src/services/delivery/DeliveryAdjustmentBulkCommitService.js` | Bulk service xử lý nhiều đơn độc lập, giới hạn 200 đơn/lần, có dry-run ở backend. |
| `src/routes/newOperationsRoutes.js` | Thêm import service dùng chung, chuyển route lưu tay qua `commitOneAdjustment`, thêm API bulk. |
| `public/js/app/new/91-delivery-today-new.js` | Thêm nút “Ghi nhận điều chỉnh đã chọn”, confirm, gọi API bulk, reload dữ liệu. |
| `public/fragments/index/07-index-body.html` | Bump query version file JS để tránh cache trình duyệt. |
| `test/delivery-adjustment-bulk-commit-static.test.js` | Test static contract cho route, service, UI. |

## API mới

`POST /api/new/delivery-today/adjustments/bulk-commit`

Payload mẫu:

```json
{
  "orderCodes": ["B0038756", "B0038757"],
  "date": "2026-07-03",
  "deliveryStaffCode": "ghth",
  "reason": "Bulk ghi nhận lại điều chỉnh công nợ",
  "note": "",
  "dryRun": false
}
```

Response trả `summary` và `items` cho từng đơn.

## Cách chống ghi trùng

Bulk không tự viết công thức AR riêng. Bulk gọi `DeliveryAdjustmentCommitService.commitOneAdjustment()`, service này:

1. Đọc trạng thái hiện tại/latest closeout version.
2. Dùng `OrderPaymentDebtReconcileService` dry-run để kiểm tra AR đã khớp chưa.
3. Nếu AR đã khớp thì skip.
4. Nếu còn lệch thì gọi `deliveryCloseoutCorrection.service#createCorrection()` bằng payload no-change giống thao tác Lưu điều chỉnh.
5. Idempotency dùng key dạng `BULK-ADJ:<orderCode>:v<sourceVersion>:<paymentStateHash>` cho correction.

## Kết quả kiểm tra

```bash
npm run check:syntax
node --test test/delivery-adjustment-bulk-commit-static.test.js
```

Kết quả:

- `SYNTAX_OK 1317 JavaScript files`
- `4/4 selected tests passed`

`npm run check:source-bundles` chưa chạy được trong sandbox vì ZIP không kèm `node_modules`, thiếu package `terser`.
