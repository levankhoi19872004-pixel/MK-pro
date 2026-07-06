# Phase176 - Audit nguồn báo cáo Doanh số theo NVBH

## Kết luận

Nguồn gọi của màn báo cáo là đúng tuyến Report Center, không đi qua reporting_snapshots:

- UI xem báo cáo: `/api/reports/run/sales-by-staff`
- Xuất Excel: `/api/excel/export` với `type=REPORT`, `reportCode=sales-by-staff`
- Cả hai cùng đi vào `ReportCenterService.run('sales-by-staff')`
- Service nghiệp vụ: `SalesReportService.salesReport()`
- Nguồn amount: `orders` đã xác nhận kế toán
- Nguồn thu/công nợ liên quan: `arLedgers`
- Nguồn danh sách NVBH để hiện đủ cả người không phát sinh: `users`

## Nguyên nhân có thể làm thiếu / sai số liệu

Dữ liệu không phải chỉ `find orders` rồi hiển thị ngay. Báo cáo đang qua các lớp lọc và công thức:

1. `activeDocumentFilter()` loại đơn hủy/xóa.
2. `accountingConfirmedFilter()` chỉ lấy đơn đã xác nhận kế toán.
3. `businessDateStages()` lọc theo ngày nghiệp vụ: `date`, `orderDate`, `documentDate`.
4. `deduplicateDocuments()` khử trùng đơn cùng business key.
5. `valueOrder()` tính lại tiền từ snapshot/tổng đơn/dòng hàng.
6. `loadArByOrders()` nối `arLedgers` để lấy đã thu, hàng trả, công nợ.
7. `buildSalesmanReportRows()` gom nhóm theo NVBH.

Điểm rủi ro đã tìm thấy:

- `ACCOUNTING_CONFIRMED_STATUSES` thiếu trạng thái `accounting_confirmed`, trong khi hệ thống MK-Pro dùng trạng thái này cho đơn đã xác nhận kế toán. Nếu đơn chỉ có `accountingStatus='accounting_confirmed'` nhưng chưa có `accountingConfirmed=true/arPosted=true`, báo cáo sẽ bỏ sót.
- Danh sách NVBH seed từ `users` trước đó chỉ tìm `role: 'sales'`. Nếu dữ liệu user legacy dùng `sale`, `NVBH`, `salesStaff`, `isSalesman`, `isSalesStaff`, hoặc `salesStaff=true` thì vẫn bị thiếu nhân viên.

## Đã sửa

1. Thêm `accounting_confirmed` vào tập trạng thái đã xác nhận kế toán.
2. Mở rộng filter lấy NVBH active từ `users` theo alias/flag nghiệp vụ, không chỉ exact `role='sales'`.
3. Mở rộng field mã/tên NVBH từ users: `salesStaffCode`, `staffCode`, `salesmanCode`, `employeeCode`, `maNhanVien`, `code`.
4. Bổ sung test xác nhận view và export Excel cùng đi qua `ReportCenterService.run`.

## File thay đổi

- `src/services/dashboard/DashboardMongoExpressions.js`
- `src/services/reports/SalesReportService.js`
- `test/report-sales-by-staff-active-users.test.js`
- `test/report-sales-by-staff-source-contract.test.js`

## Kiểm tra đã chạy

```txt
npm run check:syntax
PASS - SYNTAX_OK 1274 JavaScript files

node --test test/report-sales-by-staff-source-contract.test.js test/report-sales-by-staff-active-users.test.js
PASS - 6/6 tests
```

## Ghi chú

`npm run check:source-bundles` chưa chạy được trong sandbox vì thiếu dependency `terser` trong `node_modules`. Lần sửa này chỉ đổi backend service/test, không sửa frontend bundle.
