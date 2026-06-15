# PHASE 39 - Dashboard NVBH Filter & Monthly Target Upload

## Mục tiêu

1. Báo cáo bán hàng trên Dashboard chỉ hiển thị tài khoản NVBH đang hoạt động.
2. Loại mã NVGH bị kéo nhầm từ dữ liệu công nợ/chứng từ lịch sử.
3. Bổ sung tải file mẫu và upload chỉ tiêu tháng bằng Excel.
4. Không thay đổi luồng bán hàng, giao hàng, tồn kho, trả hàng, AR hoặc quỹ.

## Nguyên nhân gốc

`mergeSalesRows()` trước đây hợp nhất trực tiếp mọi identity xuất hiện trong:

- salesOrders
- returnOrders
- arLedgers
- salesTargets

Do đó mã NVGH tồn tại trong dữ liệu lịch sử có thể tự sinh thành dòng NVBH, kể cả khi trùng tên với một NVBH thật.

## Giải pháp

### Lọc NVBH theo nguồn chuẩn

- Nguồn whitelist: `users.role = sales` và `isActive != false`.
- Chứng từ có mã: chỉ ghép khi mã exact thuộc whitelist NVBH.
- Chứng từ thiếu mã: chỉ ghép theo tên khi tên khớp duy nhất một NVBH.
- Không fallback từ mã NVGH sang NVBH trùng tên.

### Upload chỉ tiêu tháng

API mới:

- `GET /api/dashboard/targets/template?period=YYYY-MM`
- `POST /api/dashboard/targets/:period/import`

File mẫu:

- Mã NVBH
- Tên NVBH
- Chỉ tiêu tháng
- Ghi chú

Quy tắc an toàn:

- Chỉ nhận `.xlsx`.
- Giới hạn dung lượng theo middleware import hiện có.
- Tối đa 200 NVBH/file.
- Kiểm tra toàn bộ file trước khi ghi.
- Từ chối mã không thuộc NVBH đang hoạt động.
- Từ chối mã trùng, thiếu mã, chỉ tiêu âm hoặc sai định dạng.
- Chỉ upsert collection `salesTargets` theo đúng tháng được chọn.

## File thay đổi

- `src/services/dashboard/HomeDashboardService.js`
- `src/services/dashboard/SalesTargetService.js`
- `src/controllers/dashboardController.js`
- `src/routes/dashboardRoutes.js`
- `public/index.html`
- `public/js/app/00-dashboard.js`
- `docs/openapi.json`
- `test/home-dashboard.test.js`

## Kết quả kiểm thử

- Excel writer -> parser round-trip: đạt.
- JavaScript syntax: 602/602 file đạt.
- OpenAPI check: đạt, 252 operations.
- Home Dashboard tests: 11/11 đạt.
- Full regression: 454/454 đạt.
