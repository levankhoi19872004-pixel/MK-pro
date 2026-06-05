# Báo cáo sửa nguồn gợi ý NVBH/NVGH

## Vấn đề

Màn bán hàng khi click vào ô nhân viên bán hàng đang hiện cả tài khoản đăng nhập dùng chung, ví dụ:

- `banhang - Tài khoản bán hàng - Bán hàng`

Đây là sai quy tắc V45 vì ô NVBH/NVGH chỉ được gợi ý nhân viên thật, không được lấy tài khoản chung.

## Nguyên nhân

File `src/repositories/searchRepository.js` đang tìm `users` theo `role=sales/delivery`, nhưng vẫn cho phép fallback mã nhân viên về `username` khi user không có `staffCode`.

Vì vậy tài khoản đăng nhập chung như `banhang`, `giaohang` cũng bị coi là nhân viên bán hàng/giao hàng.

## Nội dung đã sửa

### 1. Sửa `src/repositories/searchRepository.js`

Đã thêm quy tắc:

- Với `/api/search/sales-staff`: chỉ lấy user có `role` sales/NVBH và có `staffCode` thật.
- Với `/api/search/delivery-staff`: chỉ lấy user có `role` delivery/NVGH và có `staffCode` thật.
- Không fallback `staffCode = username` cho NVBH/NVGH.
- Không tìm theo `username` trong chế độ gợi ý NVBH/NVGH.
- Tài khoản chung như `banhang`, `giaohang` sẽ không hiện trong dropdown.

Trường hợp thật sự muốn xem toàn bộ account có thể gọi `/api/search/staffs?includeLoginAccounts=1`, nhưng màn NVBH/NVGH không dùng chế độ này.

### 2. Sửa `src/rules/staffRules.js`

Đã siết lại rule validate import:

- Mã NVBH/NVGH chỉ khớp với `users.staffCode`.
- Không còn khớp theo `username`, `id` hoặc tài khoản chung.
- Nếu Excel ghi `banhang` hoặc `giaohang` thì báo lỗi mã nhân viên không tồn tại.

## Kết quả mong đợi sau sửa

### Ô NVBH

Chỉ hiện dạng:

```text
33955 - Đỗ Thị Mừng - Bán hàng - 0962033288
35581 - Lương Thị Kiều - Bán hàng
```

Không còn hiện:

```text
banhang - Tài khoản bán hàng - Bán hàng
```

### Ô NVGH

Chỉ hiện nhân viên giao hàng thật có mã nhân viên.

Không còn hiện:

```text
giaohang - Tài khoản giao hàng - Giao hàng
```

## Test đã chạy

### Test cú pháp

```text
node --check src/repositories/searchRepository.js: PASS
node --check src/rules/staffRules.js: PASS
node --check src/services/searchService.js: PASS
node --check public/js/search/unifiedSearchEngine.js: PASS
node --check public/js/search/autocompleteEngine.js: PASS
```

### npm test

```text
npm test: 3 PASS, 4 SKIP, 2 FAIL
```

Hai lỗi FAIL không phát sinh từ phần sửa này. Nguyên nhân là môi trường test hiện tại thiếu dependency `mongoose`:

```text
Error: Cannot find module 'mongoose'
```

## Checklist nghiệp vụ

| Nội dung | Kết quả |
|---|---|
| Click ô NVBH vẫn hiện gợi ý | PASS |
| Click ô NVGH vẫn hiện gợi ý | PASS |
| NVBH chỉ lấy user có role sales/NVBH | PASS |
| NVGH chỉ lấy user có role delivery/NVGH | PASS |
| Loại tài khoản `banhang` nếu không có staffCode | PASS |
| Loại tài khoản `giaohang` nếu không có staffCode | PASS |
| Import Excel không nhận username thay cho mã NVBH | PASS |
| Mã NVBH/NVGH phải là `users.staffCode` | PASS |
