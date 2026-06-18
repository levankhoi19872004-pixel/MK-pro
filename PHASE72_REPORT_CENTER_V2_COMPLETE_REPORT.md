# PHASE 72 — REPORT CENTER V2

## 1. Mục tiêu

Thay tab Báo cáo dạng “kho nút xuất Excel” bằng một trung tâm báo cáo quản trị có thể sử dụng trực tiếp trên web, đồng thời giữ nguyên toàn bộ API và mẫu Excel cũ để không làm gián đoạn vận hành.

## 2. Phạm vi thay đổi

### Backend

- Thêm `src/services/reports/ReportCenterService.js`.
- Thêm ba API:
  - `GET /api/reports/catalog`
  - `GET /api/reports/overview`
  - `GET /api/reports/run/:code`
- Catalog được lọc theo vai trò và từng báo cáo kiểm tra quyền lần hai trong service.
- Khoảng ngày của Report Center tối đa 366 ngày.
- Dùng lại các domain report hiện hành; không thay đổi công thức của API/Excel legacy.

### Frontend

- Thiết kế lại toàn bộ `reportsTab`.
- Bổ sung:
  - KPI điều hành.
  - Danh mục báo cáo theo nghiệp vụ.
  - Bảng dữ liệu trực tiếp.
  - Tìm kiếm.
  - Phân trang 25/50/100/200 dòng.
  - Biểu đồ Top dữ liệu không phụ thuộc thư viện ngoài.
  - Cảnh báo ngoại lệ.
  - Mở báo cáo từ KPI.
  - Kho mẫu Excel dạng thu gọn.
- Giao diện responsive cho desktop, tablet và mobile.

## 3. Danh sách 17 báo cáo

### Điều hành

1. KPI nhân viên bán hàng.

### Bán hàng

2. Doanh số theo ngày.
3. Doanh số theo NVBH.
4. Doanh số theo khách hàng.
5. Doanh số theo sản phẩm.
6. Chi tiết đơn bán đã xác nhận.

### Tồn kho

7. Tồn kho hiện tại.
8. Nhập - xuất - tồn.
9. Thẻ kho chi tiết.

### Công nợ

10. Công nợ khách hàng theo kỳ.
11. Sổ công nợ chi tiết.

### Giao hàng

12. Hiệu suất nhân viên giao hàng.
13. Chi tiết chuyến giao.

### Quỹ

14. Sổ quỹ chi tiết.
15. Số dư quỹ theo tài khoản.

### Trả hàng

16. Chi tiết trả hàng.

### Kiểm soát

17. Ngoại lệ và chất lượng dữ liệu.

## 4. Nguồn dữ liệu chuẩn

| Nghiệp vụ | Nguồn chuẩn |
|---|---|
| Doanh số | `orders` đã xác nhận kế toán |
| Công nợ | `arLedgers` |
| Quỹ | `fundLedgers` |
| Tồn hiện tại | `inventories` |
| Biến động kho | `stockTransactions` |
| Trả hàng | `returnOrders` |
| Giao hàng | `master_orders` đối chiếu `orders` |
| Chỉ tiêu | `salesTargets` |

## 5. Quy tắc bảo toàn tương thích

- Không xóa hoặc đổi contract endpoint cũ.
- Không đổi các route export Excel.
- Không sửa service bán hàng, kho, công nợ, quỹ, giao hàng và trả hàng hiện hành.
- Report Center chỉ gọi lại các domain report chuẩn hóa.
- Tồn kho hiện tại không nhận bộ lọc ngày.
- Sales/warehouse không được đọc báo cáo tài chính hoặc công nợ.

## 6. Cảnh báo kiểm soát được bổ sung

- Tồn kho âm.
- Lệch `inventories` và `stockTransactions`.
- Đơn bán thiếu snapshot giá.
- Đơn bán fallback giá danh mục hiện tại.
- Tổng đơn lệch tổng dòng.
- Đơn tổng không tìm thấy đơn con.
- Snapshot đơn tổng lệch dữ liệu đơn con.
- Phiếu trả chưa có AR-RETURN đối ứng.

## 7. Kiểm thử

- `npm test`: **611/611 test đạt**.
- Regression test mới:
  - Catalog và quyền báo cáo.
  - API Report Center không ảnh hưởng endpoint cũ.
  - UI không còn reset KPI về 0.
  - Giữ toàn bộ mẫu Excel.
  - Kiểm tra phép tổng hợp theo ngày và sản phẩm.
  - Kiểm tra dữ liệu ngoại lệ.
- OpenAPI: up to date, 266 operations.
- Toàn bộ JavaScript được kiểm tra cú pháp song song bằng `node --check`: đạt.

## 8. Rủi ro còn lại

### Báo cáo dài hạn

Report Center V2 hiện đọc trực tiếp các collection canonical. Với quy mô dữ liệu hiện tại phù hợp, nhưng khi số lượng đơn tăng lớn cần bổ sung projection ngày/tháng:

- `report_daily_sales`
- `report_daily_product_sales`
- `report_daily_customer_sales`
- `report_daily_staff_sales`
- `report_daily_inventory`
- `report_daily_debt`
- `report_daily_delivery`

Không tự ý tạo các collection này trong Phase 72 vì cần migration, scheduler, cơ chế rebuild và đối soát riêng.

### Dependency security

`npm audit --omit=dev --audit-level=high` phát hiện 1 cảnh báo High ở `multer@2.1.1`. Đây là dependency có sẵn, không phát sinh từ Report Center. Không nâng tự động trong bản vá này để tránh thay đổi ngoài phạm vi; cần xử lý bằng một phase bảo mật riêng và regression test toàn bộ upload/import.
