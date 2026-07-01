# PHASE112 — Debt New Customer Detail Popup

## Mục tiêu

Thiết kế lại màn Công nợ (New) theo mô hình:

- Màn chính: bộ lọc, KPI tổng, danh sách khách công nợ.
- Chi tiết khách: mở bằng popup/modal.
- Đơn nợ, lập phiếu thu, lịch sử công nợ và phiếu thu chờ xác nhận nằm trong popup.

## File đã kiểm tra / chỉnh sửa

| File | Thay đổi chính |
|---|---|
| `public/js/app/new/92-debt-new.js` | Bỏ panel chi tiết cố định bên phải; thêm popup chi tiết khách; thêm tab Tổng quan/Đơn nợ/Lập phiếu thu/Lịch sử/Phiếu thu chờ xác nhận; giữ search-gated và autocomplete |
| `src/services/v2/debtNew.service.js` | Thêm `customerDetail()` scoped theo `customerCode`, không query rộng khi thiếu khách |
| `src/routes/newOperationsRoutes.js` | Thêm `GET /api/new/debt/customers/:customerCode/detail` có auth/readRoles và guard customerCode |
| `test/phase91-new-services-contract.test.js` | Thêm static guard cho popup, bỏ panel cũ, tab popup và route detail |
| `RELEASE_MANIFEST.json` | Cập nhật manifest |

## Nguyên nhân UI cũ khó nhìn tổng quát

Màn chính vừa hiển thị danh sách khách, vừa hiển thị chi tiết đơn/phân bổ/phiếu thu ở panel phải. Với dữ liệu nhiều cột, người dùng phải kéo ngang và bị mất góc nhìn tổng quan.

## Layout mới

Màn chính còn:

1. Bộ lọc.
2. KPI tổng.
3. Bảng khách công nợ.
4. Phiếu thu chờ xác nhận dạng summary gọn.

Không còn panel cố định `Đơn của khách / Phiếu thu` bên phải.

## Popup chi tiết khách

Popup có các tab:

- Tổng quan
- Đơn nợ
- Lập phiếu thu
- Lịch sử công nợ
- Phiếu thu chờ xác nhận

Popup có header riêng, nút đóng rõ, overlay, ESC để đóng và scroll riêng.

## Luồng lập phiếu thu

- Người dùng mở popup khách.
- Vào tab Đơn nợ, tick các đơn cần thu.
- Vào tab Lập phiếu thu.
- Nhập số tiền/phương thức/ghi chú.
- Tạo phiếu `submitted`.
- `submitted` chưa làm giảm công nợ; confirm mới sinh `AR-DEBT-PAYMENT` và fund ledger theo backend hiện tại.

## Backend/API

Bổ sung endpoint scoped:

```text
GET /api/new/debt/customers/:customerCode/detail
```

Guard:

- Thiếu `customerCode` trả lỗi `CUSTOMER_CODE_REQUIRED`.
- Không query rộng.
- Dữ liệu vẫn đọc từ `AR-DEBT-*` read model.

## Search contract

Giữ nguyên:

- Không tự tải toàn bộ khi mở màn.
- Chỉ tải khi có criteria hợp lệ.
- Trạng thái mặc định không phải criteria đủ mạnh.
- Autocomplete giữ nguyên.

## Test

Đã thêm/cập nhật guard:

- Màn chính có bảng khách và popup.
- Không còn panel cố định `Đơn của khách / Phiếu thu`.
- Popup có đủ 5 tab nghiệp vụ.
- Tab Đơn nợ có checkbox.
- Tab Lập phiếu thu dùng đơn đã tick.
- API detail scoped theo customerCode.

## Rủi ro còn lại

- Nếu cần movement ledger chi tiết hơn, có thể mở rộng backend detail để trả danh sách ledger đầy đủ theo customer/order.
- Confirm/reject phiếu thu vẫn dùng service hiện tại; cần test thêm trên MongoDB thật với dữ liệu production.
