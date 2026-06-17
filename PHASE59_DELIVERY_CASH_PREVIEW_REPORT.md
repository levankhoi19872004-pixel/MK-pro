# PHASE 59 — ĐỐI CHIẾU TIỀN CẦN THU TRONG POPUP NỘP QUỸ

## 1. Tổng quan dự án

- Kiến trúc: Node.js/Express modular monolith.
- Cơ sở dữ liệu: MongoDB/Mongoose.
- Frontend quản trị: HTML/CSS/JavaScript thuần, chia module theo nghiệp vụ.
- Nguồn tiền chuẩn: `fundLedgers`.
- Phiếu nộp quỹ giao hàng: `deliveryCashSubmissions`, chỉ ghi `fundLedgers` sau khi xác nhận.

## 2. Mục tiêu nghiệp vụ

Khi kế toán chọn **Ngày giao** và nhập **Mã NV giao hàng** trong popup tạo phiếu nộp quỹ, hệ thống phải hiển thị ngay:

- Tiền mặt cần thu.
- Tiền tài khoản cần thu.
- Tổng tiền cần thu.
- Số đơn trong ngày.
- Danh sách từng đơn, khách hàng và số tiền mặt/tài khoản tương ứng.
- Chênh lệch giữa số thực nhập và số phải thu để đối chiếu trực quan.

## 3. Phạm vi thay đổi

### `public/index.html`

- Thêm ID riêng cho trường ngày giao và mã NVGH.
- Thêm khối preview trực tiếp trong popup nộp quỹ.
- Thêm 4 KPI:
  - Tiền mặt cần thu.
  - Tài khoản cần thu.
  - Tổng cần thu.
  - Chênh thực nhập theo từng loại tiền.
- Thêm bảng chi tiết:
  - Mã đơn.
  - Khách hàng.
  - Tiền mặt.
  - Tài khoản.
  - Tổng.
- Đổi tên trường nhập thành `Thực nộp tiền mặt` và `Thực nhận tài khoản`.
- Cache-bust asset sang `phase59-delivery-cash-preview-v1`.

### `public/js/app/state/00b-debt-return-fund-state.js`

- Khai báo DOM references cho toàn bộ trường, KPI và bảng preview mới.

### `public/js/app/debt/07f-fund-ledger.js`

- Tự gọi API preview khi thay đổi ngày giao hoặc mã NVGH.
- Debounce nhập mã NVGH để tránh gọi API liên tục.
- Dùng `AbortController` và request sequence để bỏ kết quả cũ khi người dùng đổi lựa chọn nhanh.
- Tự điền số tiền mặt/tài khoản theo báo cáo khi tạo phiếu mới.
- Không ghi đè số thực nộp khi đang sửa phiếu cũ.
- Hiển thị chi tiết từng đơn và dòng thu nợ cũ nếu có.
- Tính chênh lệch riêng:
  - `TM`: thực nộp tiền mặt trừ tiền mặt cần thu.
  - `TK`: thực nhận tài khoản trừ tài khoản cần thu.
- Có trạng thái chờ tải, không có dữ liệu và lỗi tải dữ liệu.

### `public/css/10-operational-overrides.css`

- Mở rộng popup từ 760px lên 980px.
- Thêm layout KPI, bảng cuộn và sticky header/footer.
- Responsive cho tablet/mobile.
- Tô màu chênh lệch khớp hoặc lệch.

### `src/services/fundService.js`

- `buildDeliverySubmissionDraft()` ưu tiên `listDeliveryTodayOrdersCompact()` thay cho truy vấn giao hàng đầy đủ.
- Chỉ lấy dữ liệu cần cho đối chiếu tiền, giảm tải Return/Items/KPI không liên quan.
- Giữ fallback về `listDeliveryToday()` để tương thích an toàn.
- Không thay đổi công thức tiền mặt, tài khoản hoặc quy tắc ghi quỹ.

## 4. Luồng dữ liệu

```text
Ngày giao + Mã NVGH
    ↓
POST /api/funds/delivery-cash-submissions/preview
    ↓
fundService.buildDeliverySubmissionDraft()
    ↓
listDeliveryTodayOrdersCompact()
    ↓
Tổng hợp reportCashAmount + reportBankAmount
    ↓
Trả draft + danh sách đơn
    ↓
Popup render KPI, bảng chi tiết và tự điền số thực nộp
```

## 5. Quy tắc nghiệp vụ giữ nguyên

Không thay đổi:

- Schema MongoDB.
- API tạo/cập nhật/xác nhận phiếu.
- Quy tắc một phiếu theo `ngày giao + NVGH`.
- Trạng thái `pending → confirmed`.
- Chỉ xác nhận phiếu mới ghi `fundLedgers`.
- Tiền mặt ghi quỹ `cash`; tài khoản ghi quỹ `bank`.

## 6. Edge cases đã xử lý

- Thiếu ngày hoặc mã NVGH: chỉ hiện hướng dẫn, không gọi API.
- Không có đơn giao: hiện thông báo rõ ràng.
- Người dùng đổi mã/ngày nhanh: bỏ response cũ.
- Popup đang sửa phiếu: không ghi đè số thực nộp đã lưu.
- Popup tạo mới: tự điền số báo cáo để giảm thao tác.
- Thu nợ cũ: hiển thị thành một dòng riêng nếu backend trả số liệu.
- Danh sách dài: bảng cuộn, header/footer cố định.

## 7. Kiểm thử

- JavaScript syntax: **646 file đạt**.
- Targeted regression: **17/17 đạt**.
- Classic script shared global lexical scope: đạt.
- HTML ID uniqueness: **516 ID, 0 trùng**.
- Kiểm tra route/service preview: đạt.
- Kiểm tra compact delivery query: đạt.

Full test suite chưa chạy hết trong sandbox do không có `node_modules`. Không có migration dữ liệu.

## 8. Kết quả mong đợi

1. Mở tab **Nộp quỹ giao hàng**.
2. Bấm `+ Tạo phiếu nộp quỹ`.
3. Chọn ngày giao và nhập mã NVGH.
4. Popup tự hiển thị bảng tiền mặt/tài khoản cần thu.
5. Hai ô thực nộp được điền theo số báo cáo và có thể sửa.
6. KPI chênh hiển thị riêng `TM` và `TK` để đối chiếu bằng mắt.
7. Tạo phiếu vẫn ở trạng thái pending; xác nhận mới ghi sổ quỹ.
