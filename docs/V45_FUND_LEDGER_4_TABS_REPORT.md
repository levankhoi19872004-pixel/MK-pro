# V45 Fund Ledger 4 Tabs - Báo cáo chỉnh sửa

## Mục tiêu
Tái cấu trúc màn **Quỹ tiền** thành 4 tab riêng biệt để kế toán dễ thao tác và đối soát:

1. Sổ quỹ
2. Nộp quỹ giao hàng
3. Phiếu chi
4. Nộp ngân hàng

## Các bước đã hoàn thành

### 1. Tái cấu trúc giao diện Quỹ tiền
- Sửa `public/index.html`.
- Bỏ bố cục nhồi chung 3 khối trên cùng một màn.
- Thêm thanh tab 4 mục:
  - `Sổ quỹ`
  - `Nộp quỹ giao hàng`
  - `Phiếu chi`
  - `Nộp ngân hàng`
- Chỉ hiển thị nội dung của tab đang chọn.

### 2. Tab Sổ quỹ
- Giữ KPI: Tồn tiền mặt, Tồn ngân hàng, Tổng thu, Tổng chi.
- Thêm bộ lọc: Từ ngày, Đến ngày, Loại quỹ, Thu/Chi.
- Bảng sổ quỹ thêm cột `Tồn sau GD`.
- Nguồn dữ liệu vẫn lấy từ `fundLedgers`.

### 3. Tab Nộp quỹ giao hàng
- Tách riêng form tạo phiếu nộp quỹ giao hàng.
- Tách riêng bảng danh sách phiếu nộp quỹ.
- Thêm trạng thái đối soát trực quan:
  - Khớp
  - Thừa
  - Thiếu
- Chỉ khi xác nhận mới ghi `fundLedgers`.

### 4. Tab Phiếu chi
- Tách riêng form phiếu chi.
- Thêm bảng danh sách phiếu chi.
- Khi lưu phiếu chi, hệ thống ghi `fundLedgers` với `direction = out`.

### 5. Tab Nộp ngân hàng
- Tách riêng form chuyển quỹ/nộp ngân hàng.
- Thêm bảng danh sách phiếu chuyển quỹ.
- Khi lưu, hệ thống ghi 2 dòng `fundLedgers`:
  - Tiền mặt `out`
  - Ngân hàng `in`

### 6. Backend/API bổ sung
Đã bổ sung API đọc danh sách:

- `GET /api/funds/expenses`
- `GET /api/funds/transfers`

Các API cũ vẫn giữ:

- `GET /api/funds/ledger`
- `GET /api/funds/delivery-cash-submissions`
- `POST /api/funds/delivery-cash-submissions`
- `POST /api/funds/delivery-cash-submissions/:id/confirm`
- `POST /api/funds/expenses`
- `POST /api/funds/transfers`

### 7. File đã sửa
- `public/index.html`
- `public/style.css`
- `public/js/app/00-dom-state.js`
- `public/js/app/07-debt-cashbook.js`
- `src/services/fundService.js`
- `src/controllers/fundController.js`
- `src/routes/fundRoutes.js`

## Test đã thực hiện

### Kiểm tra cú pháp JS
Đã chạy:

```bash
node --check public/js/app/00-dom-state.js
node --check public/js/app/07-debt-cashbook.js
node --check src/services/fundService.js
node --check src/controllers/fundController.js
node --check src/routes/fundRoutes.js
```

Kết quả: OK.

### Ghi chú
Không chạy được `npm test` đầy đủ trong sandbox vì thư mục `node_modules` không có trong file ZIP. Anh chạy lại trên máy đang có `node_modules` bằng:

```bash
npm test
```

## Kết quả mong đợi
Màn Quỹ tiền sau chỉnh sửa sẽ gọn hơn, rõ nghiệp vụ hơn:

- Mở Quỹ tiền mặc định vào `Sổ quỹ`.
- Bấm `Nộp quỹ giao hàng` chỉ thấy nghiệp vụ nộp quỹ.
- Bấm `Phiếu chi` chỉ thấy nghiệp vụ chi tiền.
- Bấm `Nộp ngân hàng` chỉ thấy nghiệp vụ chuyển quỹ/nộp bank.
- Kế toán không còn phải nhìn nhiều form lẫn nhau trên cùng một màn.
