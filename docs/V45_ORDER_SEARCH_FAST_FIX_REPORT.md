# V45 Order Search Fast Fix

## Mục tiêu
Sửa lỗi màn Lịch sử đơn bán trả dữ liệu chậm 2000ms+ và lọc NVBH không chắc chắn.

## Đã sửa
1. `src/services/orderService.js`
   - Sửa `buildOrderSearchFilter()`:
     - Mặc định lọc ngày bán bằng `orderDate` trực tiếp, không dùng `$or` qua nhiều field ngày.
     - Lọc NVBH bằng field chuẩn `salesStaffCode` để ăn index.
     - Chỉ dùng alias cũ khi truyền `includeStaffAliases=1`.
     - Không để `$or` của ngày/keyword/NVBH ghi đè nhau.
   - Thêm `toListClient()`:
     - API danh sách chỉ map dữ liệu tóm tắt.
     - Không gọi logic nặng của `toClient()` cho danh sách.
   - Sửa `searchOrders()`:
     - Tách log `queryMs`, `countMs`, `mapMs`, `ms`.
     - Trả về các chỉ số này để nhìn rõ chậm ở Mongo hay mapping.

2. `src/services/mongoIndexService.js`
   - Thêm index tối ưu cho bộ lọc thực tế:
     - `salesStaffCode + orderDate + status`
     - `orderDate + salesStaffCode + status`
     - `orderDate + source + status`

3. `src/models/SalesOrder.js`
   - Bổ sung schema index tương ứng.

## Kỳ vọng tốc độ
- 50 dòng: thường dưới 200ms nếu Mongo index đã được tạo xong.
- Nếu vẫn trên 1000ms, xem log:
  - `queryMs` cao: Mongo chưa có index hoặc đang query sai field.
  - `countMs` cao: `countDocuments` chậm, cần tối ưu tiếp bằng estimated count hoặc bỏ total chính xác.
  - `mapMs` cao: lỗi mapping frontend/backend.
