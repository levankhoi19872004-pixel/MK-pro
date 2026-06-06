# V46 - Sửa danh sách đơn con chưa gộp dạng 1 dòng

## Mục tiêu
Chuẩn hóa danh sách **Đơn con chưa gộp** theo mẫu:

```text
☑ | Mã đơn | Khách hàng | NVBH | Ngày bán | Giá trị
```

## File đã sửa

### 1. `public/js/app/06-master-delivery.js`

Đã sửa hàm `renderUnmergedChildOrders()`:

- Bỏ render cũ dạng `.order-row compact-order-row master-child-row`.
- Chuyển sang render đúng class `.master-child-one-line`.
- Thêm header cố định trong danh sách:
  - Mã đơn
  - Khách hàng
  - NVBH
  - Ngày bán
  - Giá trị
- Ngày hiển thị là **ngày bán hàng**, ưu tiên nguồn:

```js
order.orderDate || order.documentDate || order.date || order.createdAt
```

- Không dùng `deliveryDate` cho cột ngày bán.
- Sắp xếp mặc định theo ngày bán tăng dần, đơn cũ lên trước.
- Thêm escape HTML để tránh lỗi ký tự hoặc dữ liệu đặc biệt.

### 2. `public/style.css`

Đã sửa CSS cho danh sách đơn con chưa gộp:

```text
Checkbox  4%
Mã đơn    20%
Khách hàng 25%
NVBH      20%
Ngày bán  12%
Giá trị   19%
```

Đã thêm:

- Dòng header sticky.
- Hover rõ ràng.
- Dòng đang chọn đổi nền.
- Cột giá trị căn phải, in đậm.
- Responsive cho màn nhỏ.

## Kết quả mong muốn
Danh sách không còn bị vỡ dòng kiểu:

```text
SO20260606327573Sinh Độ
Nguyễn Thị Thùy
06/06/2026
750.720
```

Mà hiển thị chuẩn:

```text
☑ | SO20260606327573 | Sinh Độ | Nguyễn Thị Thùy | 06/06/2026 | 750.720
```
