# V45 - Sắp xếp lại Lịch sử đơn bán theo đúng màn lên đơn

## Mục tiêu
Màn Bán hàng là nơi lên đơn và rà soát đơn bán, không phải màn theo dõi giao hàng/công nợ. Vì vậy phần Lịch sử đơn bán được tinh gọn, chỉ giữ thông tin phục vụ nghiệp vụ bán hàng.

## Đã chỉnh sửa

### 1. Rút gọn bộ lọc phía trên
File: `public/index.html`

Đã bỏ khỏi màn Bán hàng:
- Lọc theo ngày giao.
- Lọc trạng thái giao hàng.
- Lọc trạng thái công nợ.

Giữ lại:
- Tìm mã đơn / khách hàng.
- Tìm NVBH.
- Từ ngày bán.
- Đến ngày bán.
- Nguồn đơn.
- Tải lại.
- Chọn tất cả / In đơn / Xuất Excel.

### 2. Rút gọn cột danh sách đơn
File: `public/index.html`, `public/js/app/05-sales-orders.js`

Đã bỏ khỏi bảng:
- Ngày giao.
- Trạng thái giao hàng.

Danh sách còn:
- Checkbox.
- Mã đơn.
- Khách hàng.
- Ngày bán.
- Giá trị.
- Nguồn.
- Thao tác.

### 3. Đổi KPI đầu danh sách
File: `public/js/app/05-sales-orders.js`

Trước đây hiển thị:
- Tổng đơn.
- Tổng tiền.
- Đã giao.
- Chưa giao.

Hiện tại đổi thành:
- Tổng đơn.
- Doanh số.

Ví dụ:
`4 đơn · Doanh số 7.407.810`

### 4. Chuẩn hóa API gọi lịch sử bán
File: `public/js/app/05-sales-orders.js`

Màn Bán hàng mặc định lọc theo `orderDate` và không gửi điều kiện trạng thái giao hàng/công nợ lên API.

### 5. Sửa CSS bố cục compact
File: `public/style.css`

Đã chỉnh lại grid cho bảng lịch sử đơn bán còn 7 cột, giảm ngang và tránh phải kéo/nhìn các thông tin không cần thiết.

## Kết quả kỳ vọng
- Màn Bán hàng tập trung vào việc lên đơn và xem đơn bán.
- Không còn lẫn thông tin giao hàng/công nợ trong danh sách đơn bán.
- Danh sách gọn hơn, dễ đọc hơn.
- Các màn khác vẫn giữ đúng vai trò:
  - Đơn đi giao hôm nay: theo dõi giao hàng, tiền giao, trả hàng.
  - Công nợ: theo dõi AR Ledger.
  - Quỹ tiền: theo dõi fundLedgers.

## Test đã thực hiện
- `node --check public/js/app/05-sales-orders.js`: OK
- `node --check public/app.js`: OK
