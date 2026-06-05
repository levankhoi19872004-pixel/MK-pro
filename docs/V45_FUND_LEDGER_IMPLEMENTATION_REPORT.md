# V45 Fund Ledger Implementation Report

## Mục tiêu
- Tạo `fundLedgers` làm nguồn chuẩn duy nhất cho tiền quỹ.
- Link từ màn `Đơn đi giao hôm nay` sang phiếu nộp quỹ giao hàng.
- Hỗ trợ thu giao hàng, thu công nợ, chi tiền và chuyển/nộp tiền ngân hàng.

## Các bước đã hoàn thành

### 1. Tạo model Mongo mới
Đã thêm:
- `src/models/FundLedger.js` → collection `fundLedgers`.
- `src/models/DeliveryCashSubmission.js` → collection `deliveryCashSubmissions`.
- `src/models/ExpenseVoucher.js` → collection `expenseVouchers`.
- `src/models/FundTransfer.js` → collection `fundTransfers`.

Đã khai báo trong:
- `src/models/index.js`.

### 2. Tạo repository mới
Đã thêm:
- `src/repositories/fundLedgerRepository.js`.
- `src/repositories/deliveryCashSubmissionRepository.js`.
- `src/repositories/expenseVoucherRepository.js`.
- `src/repositories/fundTransferRepository.js`.

### 3. Tạo service tiền quỹ
Đã thêm:
- `src/services/fundService.js`.

Các chức năng chính:
- `listFundLedgers()` — tải sổ quỹ.
- `createDeliveryCashSubmission()` — tạo phiếu nộp quỹ từ báo cáo giao hàng.
- `confirmDeliveryCashSubmission()` — xác nhận phiếu và ghi `fundLedgers`.
- `createExpenseVoucher()` — tạo phiếu chi và ghi giảm quỹ.
- `createFundTransfer()` — tạo chuyển quỹ, ghi 2 dòng đối ứng: tiền mặt giảm / ngân hàng tăng hoặc ngược lại.

### 4. Tạo API mới
Đã thêm:
- `src/controllers/fundController.js`.
- `src/routes/fundRoutes.js`.

Đã mount vào:
- `src/routes/index.js` tại `/api/funds`.

API mới:
- `GET /api/funds/ledger`
- `GET /api/funds/delivery-cash-submissions`
- `POST /api/funds/delivery-cash-submissions/preview`
- `POST /api/funds/delivery-cash-submissions`
- `POST /api/funds/delivery-cash-submissions/:id/confirm`
- `POST /api/funds/expenses`
- `POST /api/funds/transfers`

### 5. Link từ Đơn đi giao hôm nay
Đã thêm nút:
- `Nộp quỹ`

Vị trí:
- `public/index.html`
- Logic xử lý trong `public/js/app/06-master-delivery.js`.

Luồng:
1. Chọn ngày giao.
2. Chọn NVGH.
3. Bấm `Nộp quỹ`.
4. Gọi API tạo phiếu `deliveryCashSubmissions` theo ngày + NVGH.
5. Kế toán sang tab Quỹ tiền để xác nhận ghi `fundLedgers`.

### 6. Tạo tab Quỹ tiền
Đã thêm tab:
- `Quỹ tiền`

Vị trí:
- `public/index.html`.

Gồm:
- KPI tồn tiền mặt.
- KPI tồn ngân hàng.
- Tổng thu.
- Tổng chi.
- Bảng sổ quỹ `fundLedgers`.
- Form phiếu nộp quỹ giao hàng.
- Form phiếu chi.
- Form chuyển quỹ / nộp ngân hàng.

Logic frontend thêm trong:
- `public/js/app/07-debt-cashbook.js`.

### 7. Thu công nợ cũng ghi fundLedgers
Đã sửa:
- `src/services/financialService.js`.

Khi tạo phiếu thu:
- Vẫn ghi `receipts`.
- Vẫn ghi `cashbooks` / `bankbooks` để tương thích dữ liệu cũ.
- Đồng thời ghi thêm `fundLedgers` với `sourceType = AR_RECEIPT`.

Khi hủy phiếu thu:
- Dòng `fundLedgers` liên quan được đánh dấu `status = void`.

### 8. Tạo index Mongo
Đã bổ sung index trong:
- `src/services/mongoIndexService.js`.

Cho:
- `fundLedgers`
- `deliveryCashSubmissions`
- `expenseVouchers`
- `fundTransfers`

### 9. Cập nhật OpenAPI
Đã chạy:
- `npm run docs:generate`

Đã thêm 7 API mới vào:
- `docs/openapi.json`.

## Quy tắc nghiệp vụ đã áp dụng

### fundLedgers
- `fundType = cash` hoặc `bank`.
- `direction = in` tăng quỹ.
- `direction = out` giảm quỹ.
- Tồn quỹ = tổng `in` - tổng `out`.

### Phiếu nộp quỹ giao hàng
- Mỗi ngày + NVGH sinh mã: `NQGH-yyyymmdd-staffCode`.
- Chặn tạo trùng phiếu đang hiệu lực.
- Chỉ khi xác nhận mới ghi `fundLedgers`.

### Phiếu chi
- Ghi `expenseVouchers`.
- Nếu `confirmed`, ghi `fundLedgers direction=out`.

### Chuyển quỹ / nộp ngân hàng
- Ghi `fundTransfers`.
- Ghi 2 dòng `fundLedgers`:
  - Quỹ nguồn: `out`.
  - Quỹ đích: `in`.

## Kết quả test

### Test đạt
- `node --check` tất cả file JS đã sửa: OK.
- Require app/service: OK.
- `node --test test-return-draft-flow.js`: OK.
- `node --test test/docs-generate.test.js test/openapi.test.js test-return-draft-flow.js`: 4/4 pass.
- `npm run docs:generate`: OK, thêm 7 route mới.

### Test toàn bộ `npm test`
Có 10/14 test pass, còn 4 test fail không thuộc phần fundLedgers vừa thêm:
1. `test-delivery-6-metrics-static.js` đang kiểm tra chuỗi template cũ `PT ${deliveryCompactMoney(pt)}`.
2. `product-service.test.js` lỗi mapping tồn kho cũ: expected `1` nhưng actual `0`.
3. `sales-order-flow.test.js` timeout Mongo `returnOrders.find()` do test không có Mongo connection.
4. `sales-order-flow.test.js` timeout tương tự khi cancel order.

Các lỗi trên tồn tại ở test/luồng cũ, không phát sinh từ nhóm file fundLedgers mới.
