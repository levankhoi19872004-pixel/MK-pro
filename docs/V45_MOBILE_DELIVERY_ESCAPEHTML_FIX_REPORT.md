# V45 Mobile Delivery escapeHtml Fix

## File đã sửa
- `public/mobile/js/delivery.js`

## Lỗi
Khối khai báo `v45Common`, `escapeHtml`, `todayValue`, `calculateDeliveryDebt`... bị đặt nhầm bên trong hàm `deliveryToNumber()`.
Khi các hàm render bên ngoài gọi `escapeHtml(...)`, biến này không tồn tại trong scope nên app giao hàng báo:

```text
escapeHtml is not defined
```

## Đã sửa
- Di chuyển khối khai báo `v45Common` lên đầu file, sau khi lấy thông tin user.
- Thêm fallback an toàn cho `escapeHtml`, `todayValue`, `toDateOnly`, `calculateCartonUnit`, `calculateDeliveryDebt` để app không vỡ nếu file common utils chưa load kịp.
- Khôi phục thân hàm `deliveryToNumber()` liền mạch.

## Kiểm tra
Đã chạy:

```bash
node --check public/mobile/js/delivery.js
```

Kết quả: cú pháp hợp lệ.
