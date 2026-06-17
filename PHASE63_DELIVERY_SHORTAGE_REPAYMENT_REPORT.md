# PHASE 63 — QUẢN LÝ THIẾU QUỸ NVGH VÀ PHIẾU NỘP BÙ

## 1. Tổng quan dự án

- Kiến trúc: Node.js + Express + MongoDB/Mongoose, frontend JavaScript thuần.
- Phạm vi thay đổi: module **Quỹ tiền → Nộp quỹ giao hàng**.
- Mục tiêu: phiếu nộp quỹ đã xác nhận không bị sửa; khoản thiếu được phân loại đúng trách nhiệm; khoản NVGH phải nộp được theo dõi riêng và tất toán bằng phiếu nộp bù.
- Không thay đổi nghiệp vụ tồn kho, đơn hàng, công nợ khách hàng hoặc VAT.

## 2. Quy tắc nghiệp vụ đã áp dụng

1. Phiếu nộp quỹ đã xác nhận là bất biến.
2. Khi tiền mặt/chuyển khoản bị thiếu, kế toán phải phân loại nguyên nhân trước khi xác nhận.
3. Chỉ nguyên nhân `collected_not_remitted` hoặc lựa chọn chịu trách nhiệm tương ứng mới tạo khoản phải thu của NVGH.
4. Khoản thiếu của NVGH không ghi vào `arLedgers`; sử dụng collection riêng `deliveryCashShortages`.
5. Phiếu nộp bù được tạo ở trạng thái `pending`; chưa làm tăng quỹ.
6. Chỉ khi kế toán xác nhận phiếu nộp bù mới:
   - ghi `fundLedgers` với `sourceType = DELIVERY_SHORTAGE_REPAYMENT`;
   - giảm số còn thiếu của NVGH;
   - chuyển trạng thái `open → partial → settled`.
7. Một khoản thiếu có thể nộp bù nhiều lần nhưng tổng phiếu chờ + đã xác nhận không được vượt số còn thiếu.
8. Tiền mặt và chuyển khoản được phân loại, theo dõi độc lập.
9. Các phiếu đã xác nhận từ trước nhưng đang thiếu được hỗ trợ nút **Phân loại thiếu** để bổ sung dữ liệu mà không ghi quỹ lần hai.

## 3. Thiết kế dữ liệu

### `deliveryCashShortages`

Lưu một khoản thiếu duy nhất cho mỗi `sourceSubmissionCode + fundType`:

- Nhân viên chịu trách nhiệm, ngày giao, phiếu nguồn.
- Nguyên nhân và loại trách nhiệm.
- `originalShortageAmount`.
- `pendingRepaymentAmount` — số đang được các phiếu chờ giữ chỗ.
- `settledAmount`.
- `adjustedAmount`.
- `outstandingAmount`.
- Trạng thái và audit metadata.

### `deliveryShortageRepayments`

Lưu từng lần nộp bù:

- Liên kết khoản thiếu và phiếu nộp quỹ gốc.
- Hình thức tiền mặt/chuyển khoản.
- Số tiền, ngày nộp, trạng thái.
- Trạng thái ghi quỹ và người xác nhận.

### Chống trùng và race condition

- Unique index theo ID/code.
- Unique index `sourceSubmissionCode + fundType` cho khoản thiếu.
- Giữ chỗ số tiền nộp bù bằng atomic `findOneAndUpdate + $expr`.
- Không cho hai phiên đồng thời tạo tổng phiếu chờ vượt số còn thiếu.
- Xác nhận phiếu nộp bù dùng transaction và idempotent fund ledger.

## 4. API bổ sung

- `POST /api/funds/delivery-cash-submissions/:id/shortages`
  - Phân loại khoản thiếu của phiếu đã xác nhận trước đây.
- `GET /api/funds/delivery-cash-shortages/:id/history`
  - Lấy khoản thiếu, tổng hợp và lịch sử nộp bù.
- `POST /api/funds/delivery-cash-shortages/:id/repayments`
  - Tạo phiếu nộp bù ở trạng thái chờ xác nhận.
- `POST /api/funds/delivery-shortage-repayments/:id/confirm`
  - Xác nhận, tăng quỹ và giảm khoản thiếu.

## 5. Giao diện

Trong hai tab **Tiền mặt** và **Chuyển khoản**:

- Hiển thị số **Còn thiếu**.
- Phiếu chưa xác nhận và bị thiếu: yêu cầu phân loại khi xác nhận.
- Phiếu cũ đã xác nhận nhưng thiếu: hiển thị **Phân loại thiếu**.
- Khoản do NVGH chịu trách nhiệm: hiển thị **Nộp bù** và **Lịch sử**.
- Popup nộp bù hiển thị thiếu ban đầu, đã nộp, đang chờ và còn được phép lập phiếu.

## 6. Các file chính đã thay đổi

- `src/services/fundService.js`
- `src/controllers/fundController.js`
- `src/routes/fundRoutes.js`
- `src/models/DeliveryCashSubmission.js`
- `src/models/DeliveryCashShortage.js`
- `src/models/DeliveryShortageRepayment.js`
- `src/repositories/deliveryCashShortageRepository.js`
- `src/repositories/deliveryShortageRepaymentRepository.js`
- `src/services/mongoIndexService.js`
- `src/constants/collectionKeys.js`
- `src/services/systemService.js`
- `public/js/app/debt/07f-fund-ledger.js`
- `public/js/app/state/00b-debt-return-fund-state.js`
- `public/index.html`
- `public/css/10-operational-overrides.css`
- `docs/openapi.json`

## 7. Kiểm thử và chất lượng

- Targeted tests: **6/6 đạt**.
- Full regression: **574/574 đạt**.
- JavaScript syntax: **658 file đạt**.
- OpenAPI: đồng bộ, **263 operations**.
- npm audit production dependencies: **0 lỗ hổng**.
- Đã kiểm tra:
  - không ghi quỹ khi mới tạo phiếu nộp bù;
  - chỉ ghi đúng số thực nộp ở phiếu gốc;
  - không dùng `arLedgers` cho nợ NVGH;
  - giảm đúng số còn thiếu khi xác nhận;
  - chặn tổng phiếu chờ vượt số còn thiếu;
  - chống xác nhận trùng;
  - backup/reset hệ thống nhận diện hai collection mới.

## 8. Triển khai

Không cần migration dữ liệu bắt buộc. Hai collection mới sẽ được tạo khi có dữ liệu đầu tiên.

Sau khi deploy, chạy:

```bash
npm run mongo:indexes
```

Khuyến nghị kiểm tra theo thứ tự:

1. Tạo một phiếu nộp quỹ bị thiếu tiền mặt.
2. Chọn nguyên nhân NVGH đã thu nhưng chưa nộp đủ.
3. Xác nhận phiếu và kiểm tra quỹ chỉ tăng theo số thực nộp.
4. Tạo phiếu nộp bù một phần, xác nhận và kiểm tra số còn thiếu.
5. Nộp bù phần còn lại và kiểm tra trạng thái `settled`.

## 9. Rollback

- Có thể rollback code về Phase 62 mà không ảnh hưởng tồn kho, đơn hàng hoặc `arLedgers`.
- Dữ liệu hai collection mới có thể giữ lại để phục vụ audit.
- Không xóa `fundLedgers` đã xác nhận khi rollback; phải đảo chứng từ theo quy trình kế toán nếu cần.
