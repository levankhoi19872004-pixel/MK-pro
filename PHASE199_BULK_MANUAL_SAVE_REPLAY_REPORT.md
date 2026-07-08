# PHASE199 - Bulk Manual Save Replay Fix

## Mục tiêu

Sửa chức năng `Ghi nhận điều chỉnh đã chọn` để không chạy logic bulk/reconcile riêng nữa, mà replay đúng luồng `Lưu điều chỉnh` trong popup điều chỉnh đơn giao.

## Luồng lưu tay đã xác định

Frontend:
- File: `public/js/app/new/91-delivery-today-new.js`
- Hàm mở popup: `openAdjustmentPopup(row)`
- Hàm submit: `submitAdjustmentPopup(row)`
- Endpoint: `POST /api/new/delivery-today/closeouts/:id/corrections`
- Payload chính: `correctedReturnItems`, `correctedCashLines`, `paymentCorrection`, `reason`, `note`

Backend:
- Route: `src/routes/newOperationsRoutes.js`
- Service correction: `src/services/deliveryCloseoutCorrection.service.js#createCorrection`
- Service ghi AR: `src/services/accounting/ArDebtAdjustmentPostingService.js`

## Lỗi Phase198

Bulk Phase198 còn phụ thuộc preflight/reconcile riêng và chỉ gửi `orderCode/orderId`, không gửi đủ snapshot tiền đang hiển thị trên row. Vì vậy bulk có thể skip hoặc build payload khác popup.

## Sửa Phase199

### 1. Frontend gửi đủ row context

`submitBulkAdjustmentCommit()` giờ gửi thêm `orders: [...]`, mỗi item gồm:
- orderCode/orderId
- closeoutId/closeoutCode/closeoutVersionId/closeoutVersionCode nếu row có
- customerCode/customerName
- salesStaffCode/deliveryStaffCode
- deliveryDate/sourceVersion
- originalAmount/cashAmount/bankAmount/rewardAmount/returnedAmount/finalDebtAmount

### 2. Backend bulk nhận order objects

Route `POST /api/new/delivery-today/adjustments/bulk-commit` nhận `orders` bên cạnh `orderCodes/orderIds`.

### 3. Bulk service xử lý từng order object

`DeliveryAdjustmentBulkCommitService.commitManyAdjustments()` ưu tiên `input.orders`, rồi mới fallback `orderCodes/orderIds`.

### 4. One-order commit replay đúng manual save

`DeliveryAdjustmentCommitService.commitOneAdjustment()`:
- Build snapshot từ row UI nếu có.
- Build payload giống popup save:
  - `correctedCashLines: []` nếu không có delta.
  - `paymentCorrection` giữ current/corrected bằng nhau.
- Không tự gắn custom `BULK-ADJ:*` idempotencyKey nữa.
- Gọi trực tiếp `deliveryCloseoutCorrectionService.createCorrection()` để dùng đúng idempotency/AR posting của luồng lưu tay.
- Không pre-skip trước khi gọi service correction ở apply mode.

### 5. Diagnostic

Mỗi item trả thêm:
- `payloadBuiltLikeManualSave`
- `manualSaveRouteUsed`
- `calledService`
- `closeoutId`
- `sourceVersion`
- `createdArLedgerIds`
- `correctionCreated`
- `correctionVersion`

## Không sửa lan

Không đổi kho, import, SSE, báo cáo. Không tạo repair engine mới. Không xóa/update đè ledger cũ. Không tạo fundLedger cho debt adjustment.

## Kiểm tra

Đã chạy:

```bash
node -c src/services/delivery/DeliveryAdjustmentCommitService.js
node -c src/services/delivery/DeliveryAdjustmentBulkCommitService.js
node -c src/routes/newOperationsRoutes.js
node -c public/js/app/new/91-delivery-today-new.js
node --test test/delivery-adjustment-bulk-commit-static.test.js
npm run check:syntax
```

Kết quả:

```txt
4/4 selected tests passed
SYNTAX_OK 1317 JavaScript files
```
