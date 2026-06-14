# PHASE 35 - Bước 6: Tách CSS, DOM state và bootstrap

## Đã thực hiện
- Tách `public/style.css` thành 8 file theo thứ tự cascade; không thay đổi thứ tự áp dụng rule.
- Tách `00-dom-state.js` thành Catalog/Orders, Debt/Return/Fund và Admin/System.
- Tách `public/app.js` thành bootstrap Catalog/Orders, Delivery/System và Tab Loader.
- Chuyển event ownership của Debt, AR/Cashbook, Reports, Users, Promotions và Excel Import về module nghiệp vụ.
- Loại bỏ bind trùng của Sales Orders và Master Orders khỏi bootstrap.

## Lợi ích
- Giảm xung đột CSS và JavaScript khi nhiều người cùng sửa.
- Không còn một file CSS 10.000 dòng hay DOM state 460 dòng là điểm sửa duy nhất.
- Event có chủ sở hữu rõ, giảm request đôi và submit hai lần.

## Bước tiếp theo
Loại bỏ đường chạy `mobileRoutes.js` legacy: chỉ giữ modular routes, bổ sung guard/metric và tài liệu rollback.
