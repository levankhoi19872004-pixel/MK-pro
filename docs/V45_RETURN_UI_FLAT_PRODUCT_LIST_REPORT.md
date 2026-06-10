# V45 - Return UI flat product list fix

## Mục tiêu
Giảm hiện tượng lồng nhiều khung ở phần `Sản phẩm cần giao / hàng trả` trên phần mềm và app giao hàng.

## Nguyên nhân
Khu vực này đang có nhiều lớp giao diện cùng có viền/bo góc:

1. Khung cha `.delivery-return-card`.
2. Khung danh sách sinh ra từ JS: `.delivery-block.return-panel.mobile-return-panel.web-return-copy-panel`.
3. Khung scroll `.mobile-return-scroll.delivery-products-scroll`.
4. Từng dòng sản phẩm `.mobile-return-line.delivery-product-line`.

Dù một số class đã có `border:none`, các rule khác có độ ưu tiên cao hơn vẫn làm phần danh sách nhìn như bị lồng khung.

## Đã sửa
### public/style.css
Thêm override cho màn phần mềm:

- Giữ viền nhẹ của khung cha `.delivery-return-card`.
- Bỏ viền/bo góc/bóng/nền riêng của khung danh sách bên trong.
- Bỏ card riêng của từng sản phẩm.
- Chỉ giữ đường kẻ mờ `border-bottom` giữa các sản phẩm.
- Giữ ô nhập `SL trả` có viền nhẹ để dễ thao tác.

### public/mobile/mobile.css
Thêm override tương tự cho app giao hàng:

- Bỏ viền khung danh sách bên trong.
- Bỏ viền card từng sản phẩm.
- Chỉ còn dòng phân cách mờ giữa sản phẩm.

## Kết quả mong muốn
Giao diện còn một khung cha duy nhất, danh sách sản phẩm thoáng hơn, không còn cảm giác "khung trong khung".
