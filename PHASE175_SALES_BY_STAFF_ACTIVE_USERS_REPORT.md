# PHASE175 - Sales-by-staff report scans all active sales users

## 1. Phạm vi

Tập trung riêng phần báo cáo liên quan đến nhân viên bán hàng trong Trung tâm báo cáo:

- Báo cáo `sales-by-staff` / `Doanh số theo NVBH`
- Endpoint chạy/xuất qua Report Center và Excel export `/api/excel/export`

## 2. Lỗi thực tế

Popup báo cáo theo NVBH chỉ trả các NVBH có đơn phát sinh trong khoảng ngày đang lọc.

Ví dụ theo ảnh: ngày `2026-07-02` chỉ hiển thị `6/6 dòng`, trong khi danh sách nhân viên bán hàng thực tế có nhiều hơn. Các NVBH không có đơn trong ngày bị mất khỏi bảng, khiến kế toán/admin không nhìn được đầy đủ đội NVBH và dễ hiểu nhầm là hệ thống chưa quét hết nhân viên.

## 3. Nguyên nhân kỹ thuật

Trong `src/services/reports/SalesReportService.js`, dữ liệu `bySalesman` trước đây được build trực tiếp từ `rows` đơn hàng đã xác nhận kế toán:

```js
for (const row of rows) {
  const key = row.salesStaffCode || row.salesStaffName || 'UNKNOWN';
  ...
}
```

Do đó:

- NVBH có đơn trong kỳ lọc -> có dòng báo cáo.
- NVBH không có đơn trong kỳ lọc -> không có dòng báo cáo.
- Báo cáo theo NVBH đang là “NVBH có phát sinh” chứ chưa phải “toàn bộ NVBH đang hoạt động”.

## 4. Hướng sửa

Chuẩn hóa lại báo cáo `sales-by-staff` theo nguyên tắc:

```txt
Danh sách dòng báo cáo NVBH = users.role='sales' đang hoạt động
Sau đó mới cộng số liệu orders/arLedgers vào từng NVBH
NVBH không có phát sinh vẫn hiển thị với chỉ số = 0
```

## 5. File đã sửa

| File | Nội dung |
|---|---|
| `src/services/reports/SalesReportService.js` | Thêm load active sales users, seed đầy đủ NVBH trước khi aggregate số liệu đơn |
| `src/services/reports/ReportSourceRegistry.js` | Cập nhật source contract: `users` là nguồn phụ của report `sales-by-staff` |
| `test/report-sales-by-staff-active-users.test.js` | Thêm static test kiểm tra report có seed active sales users và source contract khai báo đúng |

## 6. Quy tắc sau khi sửa

Báo cáo `Doanh số theo NVBH` sẽ hoạt động như sau:

| Trường hợp | Kết quả |
|---|---|
| NVBH có đơn trong ngày/kỳ lọc | Hiển thị dòng có số liệu thực tế |
| NVBH không có đơn trong ngày/kỳ lọc | Vẫn hiển thị dòng với số liệu 0 |
| User role khác `sales` | Không đưa vào báo cáo NVBH |
| User `isActive=false` | Không đưa vào báo cáo NVBH |
| Đơn chưa xác nhận kế toán | Không tính vào doanh số xác nhận hiện tại |

## 7. Kiểm tra đã chạy

```txt
npm run check:syntax
→ PASS - SYNTAX_OK 1273 JavaScript files

node --test test/report-sales-by-staff-active-users.test.js
→ PASS - 2/2 tests
```

## 8. Kiểm tra chưa chạy được trong sandbox

```txt
npm run check:source-bundles
```

Không chạy được vì sandbox hiện không có `node_modules`, thiếu package dev `terser`:

```txt
Error: Cannot find module 'terser'
```

Lưu ý: lần sửa này chỉ thay đổi backend service/report registry/test, không sửa source-bundled frontend file nên không phát sinh stale bundle từ thay đổi này.

## 9. Cách nghiệm thu trên giao diện

1. Vào `Báo cáo`.
2. Mở `Báo cáo NVBH` / `Doanh số theo NVBH`.
3. Chọn một ngày ít phát sinh đơn.
4. Bấm xem báo cáo.
5. Bảng phải hiển thị đủ NVBH đang hoạt động trong `users.role='sales'`, kể cả NVBH doanh số 0.
6. Sheet nguồn trong popup/export phải ghi `Nguồn phụ: users`.

