# V45 Return UI - Light Border App/Web Report

## Mục tiêu
- Giữ nguyên kết cấu thông tin sản phẩm: mã sản phẩm, tên sản phẩm, SL giao, giá bán, SL trả.
- Giữ nguyên logic lưu hàng trả và nguồn dữ liệu `returnOrders`.
- Giảm viền lồng nhau, bỏ khung nét đứt, giảm padding/bo góc để mở rộng không gian hiển thị.
- Áp dụng đồng bộ cho app giao hàng và phần mềm web.

## File đã chỉnh

### 1. `public/mobile/mobile.css`
Áp dụng cho app giao hàng:
- `.delivery-block`: giảm bo góc từ 16px xuống 10px, viền nhẹ hơn, padding gọn hơn.
- `.mobile-return-panel`: nền trắng hơn, bớt cảm giác khung lồng khung.
- `.mobile-return-scroll`: bỏ `border: 1px dashed`, bỏ bo góc/padding khung trong.
- `.mobile-return-line`: giữ card sản phẩm nhưng giảm viền, bo góc, padding và bỏ bóng.
- `.mobile-return-line input`: giữ ô nhập SL trả nhưng giảm chiều cao/bo góc.

### 2. `public/style.css`
Áp dụng cho phần mềm web:
- `.delivery-return-table` / `.delivery-return-line`: giảm gap, padding, bo góc và dùng viền nhạt.
- `.delivery-return-readonly`: badge readonly gọn hơn, bớt viền nặng.
- `.web-return-copy-panel`: giảm bo góc/padding, viền nhẹ hơn.
- `.web-return-copy-panel .mobile-return-scroll`: bỏ khung nét đứt lồng bên trong.
- `.web-return-copy-panel .mobile-return-line`: giữ kết cấu thông tin sản phẩm nhưng giảm chiều cao/padding/bo góc.
- `.web-return-copy-panel .mobile-return-line input`: giữ readonly/input hiện tại nhưng gọn hơn.

## Phạm vi không thay đổi
- Không sửa `public/mobile/js/delivery.js` logic lưu hàng trả.
- Không sửa `public/js/app/06-master-delivery.js` logic merge sản phẩm gốc với `returnOrders`.
- Không sửa backend/API.
- Không sửa cấu trúc dữ liệu `returnOrders`.

## Test đã chạy
- `node --check public/mobile/js/delivery.js`: OK
- `node --check public/js/app/06-master-delivery.js`: OK
- `node --check public/js/app/07-debt-cashbook.js`: OK
- `node --check server.js`: OK
- Kiểm tra số lượng `{}` trong `public/mobile/mobile.css`: OK
- Kiểm tra số lượng `{}` trong `public/style.css`: OK

## Ghi chú test tổng
`npm test` chưa pass toàn bộ do lỗi cũ/ngoài phạm vi chỉnh CSS:
- `test-delivery-6-metrics-static.js` thiếu chuỗi `PT ${deliveryCompactMoney(pt)}`.
- Một số test cần dependency `mongoose`, nhưng `node_modules` chưa được cài trong môi trường kiểm tra.

Các lỗi này không phát sinh từ thay đổi UI giảm viền vì lần chỉnh này chỉ sửa CSS.
