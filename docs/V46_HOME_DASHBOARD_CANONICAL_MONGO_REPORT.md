# V46 Home Dashboard - Canonical Mongo Read Model

## Mục tiêu

Chuẩn hóa Dashboard tổng quan để mọi số liệu được đọc trực tiếp từ các collection MongoDB chuẩn, không sử dụng inventory snapshot, mobile snapshot hoặc JSON snapshot.

## Nguồn dữ liệu

| Chỉ số | Nguồn chuẩn |
|---|---|
| Doanh số tháng/ngày | `orders` |
| Hàng trả | `returnOrders` |
| Công nợ toàn hệ thống | `arLedgers` |
| Giao hàng tháng | `master_orders` + `orders` con theo batch |
| Giao hàng hôm nay | `masterOrderDeliveryService.listDeliveryTodaySummary()` |
| Chỉ tiêu | `salesTargets` |
| Danh sách nhân viên hợp lệ | `users` |

Response `/api/dashboard/home` có `sources.snapshot = false` để có thể kiểm tra nguồn đọc khi vận hành.

## Quy tắc ngày nghiệp vụ

Dashboard chọn duy nhất field đầu tiên có ngày hợp lệ, sau đó mới fallback `createdAt`:

- Đơn bán: `orderDate -> date -> documentDate -> createdAt`.
- Hàng trả: `returnDate -> documentDate -> date -> deliveryDate -> createdAt`.
- Giao hàng: `deliveryDate -> date -> createdAt`.

Không dùng `$or` giữa ngày nghiệp vụ và `createdAt`, tránh đưa chứng từ sai kỳ vào báo cáo.

## Quy tắc kế toán

Đơn bán chỉ được tính khi có bằng chứng kế toán:

- `accountingConfirmed = true`, hoặc
- `accountingStatus` thuộc `confirmed/locked/posted`, hoặc
- `arPosted = true`, hoặc
- `arStatus` thuộc `confirmed/locked/posted`.

Các trạng thái `reopened/needs_reconfirm/needs_repost` và cờ yêu cầu xác nhận lại bị loại. `lifecycleStatus=completed` không còn được dùng thay cho xác nhận kế toán.

## Công nợ

- Tính toàn hệ thống trực tiếp từ `arLedgers`.
- Nhóm theo đơn trước để `AR-RECEIPT` và `AR-RETURN` giảm đúng khoản nợ của `AR-SALE`.
- Tổng công nợ đầu trang không còn được suy ra từ các dòng NVBH đang hiển thị.
- Bảng NVBH chỉ nhận danh tính hợp lệ từ `users.role=sales`.
- Khoản chưa map được nhân viên được đưa vào `dataQuality.unmapped`, không bị âm thầm bỏ qua khỏi tổng hệ thống.

## Giao hàng

### Trong tháng

`master_orders` xác định các chuyến thuộc kỳ. Toàn bộ tham chiếu đơn con được gom lại và truy vấn `orders` một lần, không N+1. Trạng thái và giá trị được tính theo từng đơn con; dữ liệu master cũ thiếu tham chiếu được fallback bằng `orderCount` của master.

### Hôm nay

Gọi lại luồng chuẩn `listDeliveryTodaySummary()` đang được màn Đơn giao hôm nay sử dụng. Các field `deliveringCount`, `deliveredAmount` và `salesStaffCount` được bổ sung theo kiểu additive, không thay đổi contract cũ.

## Cache

- Mặc định `HOME_DASHBOARD_CACHE_TTL_MS=0`: không cache, luôn đọc MongoDB trực tiếp.
- Khi chủ động đặt TTL lớn hơn 0, cache sử dụng fingerprint `updatedAt/createdAt/_id` của các collection liên quan. Dữ liệu thay đổi sẽ tạo version mới và cache cũ không được dùng.
- `refresh=1` luôn bỏ qua cache.

## Data quality và giám sát

Response bổ sung:

- `sources`: nguồn collection/service thực tế.
- `dataQuality.unmapped`: số chứng từ, số tiền và danh tính chưa map được NVBH/NVGH.
- `dataQuality.warnings`: cảnh báo hiển thị trên Dashboard.
- `metrics.queryDurationMs`: thời gian từng query.
- `metrics.deliveryMonth/deliveryToday`: thống kê số master, child reference và thời gian từ service chuẩn.

Log `dashboard.home.loaded` ghi source, warning count, cache state và query duration; không ghi chi tiết khách hàng hay token.

## Phạm vi an toàn

Không thay đổi các luồng ghi:

- Tạo/sửa/xóa đơn bán.
- Posting tồn kho.
- Posting AR.
- Xác nhận kế toán.
- Ghi nhận trả hàng.
- Thu tiền và quỹ.
- Gán hoặc cập nhật giao hàng.

Dashboard là read model độc lập; thay đổi duy nhất ngoài module Dashboard là bổ sung field tổng hợp additive cho Delivery Today Summary.

## Kiểm thử

- JavaScript syntax check: đạt.
- Dashboard unit/contract tests: đạt.
- Runtime stub cho query bán hàng và master-order child aggregation: đạt.
- Full regression: 459/459 test đạt.
- OpenAPI check: 252 operations, đạt.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerability.
