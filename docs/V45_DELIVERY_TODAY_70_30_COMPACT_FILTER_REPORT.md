# V45 - Đơn đi giao hôm nay: bố cục 70/30 và bộ lọc tối giản

## Nội dung đã chỉnh sửa

### 1. Giữ nguyên cấu trúc hiện tại
Không chuyển sang bố cục mới, không tạo màn hình/ảnh mới. Vẫn giữ luồng:

- Bên trái: danh sách + KPI + bộ lọc
- Bên phải: xử lý/chỉnh sửa đơn giao

### 2. Đổi tỷ lệ bố cục
Màn `Đơn đi giao hôm nay` được chỉnh về:

- Bên trái: khoảng 70%
- Bên phải: khoảng 30%

File sửa:

- `public/style.css`

CSS chính:

```css
#deliveryTodayTab .delivery-split-layout{
  grid-template-columns:minmax(680px,70%) minmax(300px,30%)!important;
}
```

### 3. Gộp nút Chọn tất cả / Bỏ chọn tất cả
Trên giao diện chỉ còn 1 nút chính:

- Nếu chưa chọn hết: hiện `Chọn tất cả`
- Nếu đã chọn hết: hiện `Bỏ chọn tất cả`

File sửa:

- `public/index.html`
- `public/js/app/06-master-delivery.js`

Nút `Bỏ chọn` cũ được ẩn để không chiếm giao diện.

### 4. Bộ lọc chỉ còn 3 trường
Bộ lọc bên trái được tối giản còn:

1. Ngày giao hàng
2. Nhân viên giao hàng
3. Tình trạng giao hàng

Đã bỏ ô tìm khách hàng khỏi khu vực lọc chính của màn này.

Tình trạng giao hàng gồm:

- Tất cả
- Chưa giao
- Đã giao

File sửa:

- `public/index.html`
- `public/style.css`
- `src/services/masterOrderService.js`

### 5. Backend hỗ trợ trạng thái gộp
Backend nhận thêm trạng thái:

- `not_delivered` = chưa giao
- `delivered_group` = đã giao

Quy tắc:

- Đã giao gồm các trạng thái delivered/done/completed/paid/unpaid
- Chưa giao là các đơn chưa thuộc nhóm đã giao

## File đã kiểm tra cú pháp

Đã chạy:

```bash
node -c public/js/app/06-master-delivery.js
node -c src/services/masterOrderService.js
```

Kết quả: OK.
