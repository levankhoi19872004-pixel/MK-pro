# V46 - Sửa quy tắc phương thức bán linh động

## Quy tắc đã áp dụng

- Đơn tạo tay/App: mặc định `PROMOTION` / Bán theo khuyến mại.
- Đơn import Excel/DMS: mặc định `DIRECT_PRICE` / Bán thẳng giá mặc định.
- Radio phương thức bán không bị khóa; kế toán/admin có thể đổi linh động khi tạo/sửa đơn.
- Khi sửa đơn: ưu tiên giữ đúng `saleMethod/saleMode/pricingMode/orderPricingMode` đã lưu trên đơn.
- Backend tôn trọng mode gửi lên, không ép đơn import/DMS về bán thẳng nếu người dùng đã đổi sang khuyến mại.

## File đã sửa

- `public/index.html`
- `public/js/app/05-sales-orders.js`
- `src/services/orderService.js`

## Điểm kiểm tra

1. Mở form bán hàng mới: mặc định tích Bán theo khuyến mại.
2. Radio vẫn đổi được sang Bán thẳng giá mặc định.
3. Đơn import vẫn được tạo mặc định DIRECT_PRICE ở import service.
4. Khi sửa đơn import, người dùng đổi sang khuyến mại thì backend nhận PROMOTION và tính lại theo khuyến mại.
5. Khi sửa đơn đã lưu, form đọc đúng mode của đơn, không tự reset sai.
