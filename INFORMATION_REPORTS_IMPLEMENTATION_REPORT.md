# MK-Pro Phase31 - Báo cáo thông tin

## Tổng quan dự án

- Baseline: `MK-pro-phase30-disable-delivery-gps-patched(1).zip`.
- Stack nhận diện: Node.js/Express, MongoDB/Mongoose, frontend admin report center tại `public/js/app/admin/08a-reports.js`.
- Khu vực ảnh hưởng chính: report catalog, report runner, Excel export report chung.

## File đã kiểm tra

- `src/services/reports/ReportCenterService.js`: danh mục báo cáo, quyền xem, chạy báo cáo và contract dữ liệu cho UI/Excel.
- `src/services/excel/ExcelInteractionService.js`: export `type=REPORT` dùng chung `ReportCenterService.run()`.
- `public/js/app/admin/08a-reports.js`: UI báo cáo đã render động từ `/api/reports/catalog` và `/api/reports/run/:code`, không cần thêm UI riêng.
- Models: `Product.js`, `Customer.js`, `Staff.js`, `User.js`, `SalesOrder.js`, `ArLedger.js`.

## Thay đổi chính

### Thêm category mới

- `information` / `Báo cáo thông tin`.

### Thêm 3 báo cáo mới

1. `info-products` - Thông tin sản phẩm.
2. `info-customers` - Thông tin khách hàng.
3. `info-staffs` - Thông tin nhân viên.

### Thêm service mới

- `src/services/reports/InformationReportService.js`

Service này chỉ đọc dữ liệu từ collection hiện hữu:

- Sản phẩm: `products`.
- Khách hàng: `customers` + `arLedgers` + `salesOrders`.
- Nhân viên: `staffs` + `users`.

Không tạo collection mới, không sửa schema, không đổi API contract.

## Diff tóm tắt

### `ReportCenterService.js`

Old:

```js
const HomeDashboardService = require('../dashboard/HomeDashboardService');
```

New:

```js
const HomeDashboardService = require('../dashboard/HomeDashboardService');
const InformationReportService = require('./InformationReportService');
```

Old:

```js
{ code: 'control', title: 'Kiểm soát', description: 'Ngoại lệ số liệu và cảnh báo chất lượng dữ liệu.' }
```

New:

```js
{ code: 'control', title: 'Kiểm soát', description: 'Ngoại lệ số liệu và cảnh báo chất lượng dữ liệu.' },
{ code: 'information', title: 'Báo cáo thông tin', description: 'Tra cứu master-data sản phẩm, khách hàng và nhân viên.' }
```

New definitions:

```js
info-products
info-customers
info-staffs
```

New runner cases:

```js
case 'info-products'
case 'info-customers'
case 'info-staffs'
```

## Test đã chạy

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 963 JavaScript files
```

Kiểm tra require runtime chưa chạy được trong sandbox vì thiếu `node_modules/mongoose`, đây là hạn chế môi trường giải nén ZIP, không phải lỗi syntax.

## Regression cần kiểm tra sau deploy

1. Mở menu Báo cáo.
2. Kiểm tra xuất hiện nhóm `Báo cáo thông tin`.
3. Mở `Thông tin sản phẩm`.
4. Mở `Thông tin khách hàng`.
5. Mở `Thông tin nhân viên`.
6. Tìm kiếm theo mã/tên.
7. Xuất Excel từng báo cáo.
8. Kiểm tra Excel sản phẩm có `Quy cách` và `Giá bán`.

## Rủi ro còn lại

- Một số field như `customerType`, `branch`, `lastLoginAt` có thể trống nếu dữ liệu hiện tại chưa lưu.
- Báo cáo khách hàng có bổ sung công nợ từ `arLedgers` và doanh số tháng từ `salesOrders`; đây là thông tin đối chiếu nhanh, không thay thế báo cáo công nợ/doanh số chuyên sâu.
