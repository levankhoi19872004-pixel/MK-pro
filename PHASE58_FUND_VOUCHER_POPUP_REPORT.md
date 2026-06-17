# PHASE 58 — FUND VOUCHER POPUP UI

## 1. Mục tiêu

Chuyển ba biểu mẫu tạo phiếu tại màn hình **Quỹ tiền** khỏi bố cục cố định sang cửa sổ popup độc lập:

- Nộp quỹ giao hàng.
- Phiếu chi.
- Nộp ngân hàng.

Mỗi tab giữ một nút tạo phiếu riêng, mở trực tiếp đúng biểu mẫu của tab, không có bước chọn loại phiếu trung gian.

## 2. Phạm vi thay đổi

### `public/index.html`

- Bỏ cột biểu mẫu cố định khỏi ba tab nghiệp vụ.
- Mở rộng bảng danh sách ra toàn bộ chiều ngang.
- Thêm ba nút tạo phiếu riêng:
  - `createDeliveryCashSubmissionButton`
  - `createExpenseVoucherButton`
  - `createFundTransferButton`
- Thêm ba popup độc lập, giữ nguyên ID của các form cũ để không phá vỡ luồng submit/API hiện tại.
- Cache-bust các asset Quỹ tiền để trình duyệt nhận phiên bản mới ngay sau deploy.

### `public/js/app/state/00b-debt-return-fund-state.js`

- Khai báo DOM reference cho popup, nút tạo và nút đóng mới.
- Tiếp tục dùng `createDeliveryCashSubmissionButton` đã được khai báo trong state bootstrap hiện hữu để tránh trùng global lexical identifier.

### `public/js/app/debt/07f-fund-ledger.js`

- Thêm lifecycle mở/đóng popup dùng chung.
- Nút tạo mới reset đúng form, đặt ngày hiện tại và mở popup tương ứng.
- Nút `Sửa` mở đúng popup và điền dữ liệu phiếu hiện tại.
- Sau khi tạo/cập nhật thành công: tải lại danh sách, tải lại sổ quỹ và đóng popup.
- Hỗ trợ đóng bằng nút Đóng, bấm nền popup và phím Escape.
- Quản lý `modal-open` an toàn, không xung đột với popup khác đang mở.

### `public/css/10-operational-overrides.css`

- Bố cục danh sách toàn chiều ngang.
- Kích thước popup desktop/mobile.
- Toolbar nút tạo responsive trên màn hình nhỏ.

## 3. Ảnh hưởng nghiệp vụ

Không thay đổi:

- API tạo/cập nhật/xác nhận phiếu.
- Schema MongoDB.
- Quy tắc pending/confirmed.
- Cách ghi `fundLedgers`.
- Số dư tiền mặt, ngân hàng, thu và chi.

Đây là thay đổi giao diện có khoanh vùng, không cần migration dữ liệu.

## 4. Kiểm thử

- Kiểm tra cú pháp: `SYNTAX_OK 645 JavaScript files`.
- Targeted regression: `10/10 pass`.
- Kiểm tra global lexical scope của toàn bộ classic scripts: pass.
- Kiểm tra HTML: 498 ID, không có ID trùng.
- Full test suite chưa thể hoàn tất trong môi trường vá file vì dependencies chưa được cài (`mongoose`, `jsonwebtoken`, `read-excel-file/node`). Các lỗi này xuất hiện trước khi chạy logic liên quan đến bản vá.

## 5. Kết quả mong đợi

- Tab **Nộp quỹ giao hàng** chỉ hiển thị danh sách và nút `+ Tạo phiếu nộp quỹ`.
- Tab **Phiếu chi** chỉ hiển thị danh sách và nút `+ Tạo phiếu chi`.
- Tab **Nộp ngân hàng** chỉ hiển thị danh sách và nút `+ Tạo phiếu nộp ngân hàng`.
- Bấm nút tạo hoặc nút sửa sẽ mở popup đúng loại phiếu.
- Sau khi lưu thành công, popup đóng và danh sách được cập nhật.
