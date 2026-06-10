# V46 Sales App - Customer Card Debt Sort UI Fixed

## Mục tiêu
- Danh sách khách hàng app bán hàng hiển thị gọn hơn.
- Bổ sung địa chỉ và số điện thoại khách hàng.
- Bỏ chỉ số `Mua gần nhất` khỏi card khách hàng.
- Chỉ giữ 2 chỉ số chính: `Nợ` và `DS tháng`.
- Sắp xếp khách hàng theo công nợ giảm dần.
- Công nợ trên danh sách khách hàng lấy theo nguồn chuẩn `arLedgers`.

## File đã sửa
- `public/mobile/js/sales.js`
- `public/mobile/mobile.css`
- `src/routes/mobileRoutes.js`

## Kiểm tra kỹ thuật
- `node --check public/mobile/js/sales.js`: OK
- `node --check src/routes/mobileRoutes.js`: OK
- Không còn render `Mua gần nhất` trong card khách hàng.
- Không còn dùng class `customer-metrics-3`.
