# PHASE 36 — TEST REGRESSION FIX REPORT

## 1. Kết quả chẩn đoán

Nhóm lỗi test gồm hai nguyên nhân độc lập:

1. `src/routes/mobileRoutes.js` là file legacy đã nghỉ nhưng còn sót khi người dùng giải nén bản mới đè lên thư mục cũ. ZIP không thể tự xóa file cũ nên ba test mobile nhận `fs.existsSync(...) === true`.
2. Phase 35 được refactor từ nhánh chưa mang đầy đủ bản vá Phase 33, làm mất contract bộ lọc ngày trả hàng: schema thiếu field ngày, service chưa recheck ngày nghiệp vụ và UI quay lại bộ chọn `Hôm nay`.

## 2. Thay đổi đã thực hiện

### Legacy mobile cleanup

- Thêm `scripts/cleanup-retired-files.js`.
- Thêm `npm run cleanup:retired` và lifecycle `pretest`.
- `scripts/run-tests.js` cũng gọi cleanup để chạy trực tiếp vẫn an toàn.
- Chỉ xóa đúng file đã retired: `src/routes/mobileRoutes.js`.

### ReturnOrder schema và service

- Bổ sung các path dùng bởi `strictQuery`: `returnDate`, `date`, `documentDate`, `deliveryDate`.
- Bổ sung các path tìm kiếm nhân viên/khách hàng.
- Chuẩn hóa ngày nghiệp vụ theo thứ tự:
  `returnDate -> date -> documentDate -> deliveryDate`.
- Chặn `dateFrom > dateTo` bằng lỗi `INVALID_RETURN_ORDER_DATE_RANGE`, HTTP 400.
- Sau Mongo query, recheck ngày nghiệp vụ chuẩn để loại dòng có các field ngày lệch nhau.

### Frontend bộ lọc trả hàng

- Bỏ selector `Hôm nay / Tất cả / Khoảng ngày`.
- Dùng form gọn: `Tìm kiếm | Từ ngày | Đến ngày | Lọc | Xóa lọc`.
- Hiển thị ngày `DD/MM/YYYY`.
- Thêm request sequence chống response cũ ghi đè response mới.
- Chuyển toàn bộ event ownership về `07b-return-orders.js`.
- Xóa event trả hàng bị đặt nhầm trong `07d-master-return-orders.js`.

## 3. File thay đổi

- `package.json`
- `scripts/cleanup-retired-files.js`
- `scripts/run-tests.js`
- `src/models/ReturnOrder.js`
- `src/services/returnOrderLegacy.service.js`
- `public/index.html`
- `public/js/app/state/00b-debt-return-fund-state.js`
- `public/js/app/debt/07b-return-orders.js`
- `public/js/app/debt/07d-master-return-orders.js`
- `public/css/10-operational-overrides.css`
- `test/return-order-filter-redesign-regression.test.js`

## 4. Kết quả kiểm thử

- 12/12 test lỗi được nêu: PASS.
- Toàn bộ test: 399/399 PASS.
- JavaScript syntax: 572 file PASS.
- OpenAPI: 247 operations đồng bộ.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.

## 5. Cách chạy

```bash
npm ci
npm test
```

`npm test` sẽ tự dọn file mobile legacy còn sót trước khi chạy test.
