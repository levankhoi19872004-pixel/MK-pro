# PHASE121 — Delivery Today New UI Message Cleanup

## 1. Tổng quan dự án

- Dự án: MK-Pro ERP/DMS nội bộ NPP Minh Khai.
- Tech stack quan sát từ ZIP: Node.js/Express, MongoDB/Mongoose, JavaScript thuần phía frontend, HTML fragments, CSS scoped trong JS module.
- Phạm vi chỉnh sửa: màn **Đơn giao hôm nay (New)**.
- File chính: `public/js/app/new/91-delivery-today-new.js`.
- Không chỉnh backend/API, không đổi công thức tiền, không đổi lazy loading Phase120.

## 2. Hiện trạng trước khi sửa

Màn đã có lazy loading nhưng UI bị dư chữ:

1. Filter bar có message hướng dẫn dài dưới bộ lọc.
2. Empty state lại lặp cùng ý nghĩa với filter message.
3. Khi chọn/xóa filter, màn tiếp tục sinh các message trạng thái dạng “Bấm Tải đơn...” dưới filter bar.
4. Placeholder tìm kiếm còn dài: `Click chọn hoặc nhập mã đơn / khách hàng`.

Rủi ro UX:

- Người dùng thấy quá nhiều hướng dẫn trong khi bộ lọc đã đủ rõ.
- Cùng một trạng thái bị nhắc ở nhiều vị trí.
- Màn nghiệp vụ bị nặng chữ, khó thao tác nhanh.

## 3. Thay đổi đã triển khai

### 3.1. Tối giản initial empty state

Trước:

```text
Chưa có dữ liệu hiển thị.
Chọn NVGH, NVBH hoặc nhập mã đơn / khách hàng rồi bấm Tải đơn để xem danh sách.
```

Sau:

```text
Chưa có dữ liệu
Chọn bộ lọc rồi bấm Tải đơn.
```

### 3.2. Xóa message hướng dẫn mặc định dưới filter bar

- Khi mở màn: không còn dòng xanh hướng dẫn dài dưới filter bar.
- Khi đổi ngày, chọn gợi ý, gõ filter, xóa filter: không tự sinh message “Bấm Tải đơn...” nữa.
- `deliveryTodayNewMessage` chỉ còn dùng cho lỗi validate/error nghiệp vụ thật sự.

### 3.3. Validation message ngắn

Khi bấm **Tải đơn** mà chưa có điều kiện hợp lệ:

```text
Chọn NVGH, NVBH hoặc nhập từ khóa từ 2 ký tự.
```

Khi nhập ô tìm kiếm chỉ 1 ký tự và bấm **Tải đơn**:

```text
Từ khóa tìm kiếm cần tối thiểu 2 ký tự.
```

### 3.4. Loading và empty result gọn

Loading:

```text
Đang tải đơn...
```

Không có kết quả sau khi tải:

```text
Không có đơn phù hợp với bộ lọc.
```

### 3.5. Placeholder tìm kiếm gọn lại

Trước:

```text
Click chọn hoặc nhập mã đơn / khách hàng
```

Sau:

```text
Mã đơn / khách hàng
```

## 4. File đã sửa

| File | Nội dung |
|---|---|
| `public/js/app/new/91-delivery-today-new.js` | Tối giản empty state, bỏ helper text mặc định, rút gọn placeholder/search validation/loading/empty-result message |
| `docs/reports/PHASE121_DELIVERY_TODAY_NEW_UI_MESSAGE_CLEANUP_REPORT.md` | Báo cáo triển khai |

## 5. Không thay đổi

- Không đổi API `/api/new/delivery-today/orders`.
- Không đổi backend `deliveryTodayNew.service.js`.
- Không đổi lazy loading Phase120.
- Không đổi KPI PT/TM/CK/TT/HT/CN.
- Không đổi grouped NVBH header.
- Không sửa Công nợ (New), Đơn giao hôm nay cũ, app giao hàng mobile.

## 6. Acceptance Criteria

| Tiêu chí | Kết quả |
|---|---:|
| Mở màn không còn dòng xanh dài dưới filter bar | PASS |
| Empty state không lặp lại cùng nội dung với filter message | PASS |
| Initial state gọn, ít chữ | PASS |
| Bấm Tải đơn khi chưa có filter hợp lệ chỉ hiện một lỗi ngắn | PASS |
| Search 1 ký tự không gọi API vì không đạt `hasValidSearchCriteria()` | PASS |
| Khi có dữ liệu thì message hướng dẫn bị clear | PASS |
| Lazy loading không bị thay đổi | PASS |
| Không đổi backend/API | PASS |

## 7. Kiểm tra đã chạy

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1188 JavaScript files
```

Targeted static tests chạy được:

```bash
node --test test/delivery-today-new-salesman-group-ui-static.test.js test/new-screens-autocomplete-clear-static.test.js
```

Kết quả:

```text
12 tests pass
```

Một test contract có dependency runtime không chạy được trong sandbox vì thiếu `node_modules/mongoose`:

```text
Cannot find module 'mongoose'
```

`npm run check:source-bundles` cũng không chạy được trong sandbox vì thiếu `terser`:

```text
Cannot find module 'terser'
```

Cần chạy lại trên máy dev đã có `node_modules`:

```bash
npm run check:syntax
npm run check:source-bundles
npm test
```

## 8. Cách test thủ công

1. Mở **Đơn giao hôm nay (New)**.
2. Kiểm tra không còn dòng xanh dài dưới bộ lọc.
3. Empty state chỉ còn:
   - `Chưa có dữ liệu`
   - `Chọn bộ lọc rồi bấm Tải đơn.`
4. Bấm **Tải đơn** khi chưa chọn filter:
   - Chỉ hiện một lỗi ngắn dưới filter bar.
5. Nhập 1 ký tự vào tìm kiếm rồi bấm **Tải đơn**:
   - Hiện `Từ khóa tìm kiếm cần tối thiểu 2 ký tự.`
   - Không tải API orders.
6. Chọn NVGH/NVBH hoặc nhập từ khóa hợp lệ rồi bấm **Tải đơn**:
   - Loading gọn.
   - Có dữ liệu thì không còn message hướng dẫn.
   - Không có dữ liệu thì chỉ hiện `Không có đơn phù hợp với bộ lọc.`
