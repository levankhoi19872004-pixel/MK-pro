# V47 Home Dashboard - Implementation Report

## Phạm vi

Bổ sung màn hình Tổng quan làm tab đầu tiên sau đăng nhập cho Admin/Manager/Accountant, gồm:

- Chỉ tiêu tháng.
- Doanh số thực đạt tháng đã xác nhận kế toán.
- Hàng trả tháng đã xác nhận/post AR.
- Doanh số ròng.
- Công nợ hiện tại từ `arLedgers`.
- Doanh số ngày hiện tại theo múi giờ Việt Nam.
- Báo cáo giao hàng theo tháng và trong ngày.

## Khoanh vùng an toàn

- Không sửa `reportLegacy.service.js` hoặc API `/api/dashboard` cũ.
- Không thay đổi command tạo/sửa/xóa đơn, tồn kho, AR, trả hàng hoặc quỹ.
- Dashboard mới chỉ đọc dữ liệu qua `/api/dashboard/home`.
- Chỉ tiêu được lưu riêng trong collection `salesTargets`.
- Có rollback bằng `FEATURE_HOME_DASHBOARD=false`.
- Cache in-memory ngắn hạn, mặc định 45 giây.

## File chính

- `src/models/SalesTarget.js`
- `src/services/dashboard/HomeDashboardService.js`
- `src/services/dashboard/SalesTargetService.js`
- `src/controllers/dashboardController.js`
- `src/routes/dashboardRoutes.js`
- `public/js/app/00-dashboard.js`
- `public/css/05-home-dashboard.css`
- `test/home-dashboard.test.js`

## API

- `GET /api/dashboard/home?month=YYYY-MM`
- `GET /api/dashboard/targets?period=YYYY-MM`
- `PUT /api/dashboard/targets/:period`

## Feature flag

```env
FEATURE_HOME_DASHBOARD=true
HOME_DASHBOARD_CACHE_TTL_MS=45000
```

Đặt `FEATURE_HOME_DASHBOARD=false` để giao diện tự quay lại tab Sản phẩm mà không cần rollback mã nguồn.
