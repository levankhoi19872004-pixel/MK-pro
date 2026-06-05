# V45 Delivery Edit Panel Vertical Layout Report

## Mục tiêu
Sửa khu **Xử lý / chỉnh sửa đơn giao** theo đúng thứ tự nghiệp vụ:

1. Thông tin đơn
2. Danh sách sản phẩm
3. Form thanh toán
4. KPI tiền

## Đã chỉnh sửa

### 1. HTML
File: `public/index.html`

- Đưa `deliveryEditTotalBox` xuống sau phần form thanh toán và ghi chú.
- Thêm class `delivery-payment-form-section` cho nhóm nhập tiền.
- Thêm class `delivery-payment-note` cho ghi chú giao hàng.

### 2. JavaScript
File: `public/js/app/06-master-delivery.js`

- Chuẩn hóa box thông tin đơn thành cấu trúc rõ ràng:
  - Mã đơn
  - Khách hàng
  - Địa chỉ
  - Phải thu
  - NVBH
  - NVGH
- Chuẩn hóa KPI tiền thành các chip riêng:
  - Phải thu
  - Tiền mặt
  - Chuyển khoản
  - Hàng trả
  - Trả thưởng
  - Đã nhập
  - Còn nợ tạm tính
  - Trả vượt nếu có
  - Đối soát: Đã khớp / Chưa khớp

### 3. CSS
File: `public/style.css`

- Đổi tỷ lệ màn giao hàng sang 65% danh sách đơn và 35% chi tiết đơn.
- Ép panel phải xếp dọc bằng `flex-direction: column`.
- Gán order:
  - `selected-delivery-box`: 1
  - `delivery-return-card`: 2
  - `delivery-money-grid` + ghi chú: 3
  - `delivery-edit-total-box`: 4
  - actions: 5
- Sửa danh sách sản phẩm không còn bị bóp chữ từng dòng.
- KPI tiền hiển thị dạng grid 3 cột, không bị vỡ layout.

## Test đã thực hiện

- `node --check public/js/app/06-master-delivery.js`: OK
- Kiểm tra tồn tại DOM ID sau sửa HTML: OK
- Kiểm tra thứ tự CSS override: OK

## Kết quả mong đợi

Panel phải không còn bố cục ngang bị vỡ. Thứ tự hiển thị đúng:

```text
Thông tin đơn
Danh sách sản phẩm
Form thanh toán
KPI tiền
Nút lưu / bỏ chọn
```
