# Kho Minh Khai Thái Bình - Frontend đã chia nhỏ

Bản này được tách từ file `index(59).html`. Backend/server.js giữ nguyên, không đụng vào API.

## Cấu trúc

```text
index.html
css/style.css
js/components-loader.js
js/mobile-sales-fix.js
js/core.js
components/*.html
```

## Cách dùng

Upload toàn bộ thư mục này lên GitHub/Netlify. Không chỉ upload riêng `index.html`, vì file này cần các thư mục `css`, `js`, `components`.

## Lưu ý

- Không đổi `id`, `class`, tên hàm trong các component nếu chưa kiểm tra kỹ.
- `components-loader.js` đang load đồng bộ để đảm bảo các section có sẵn trước khi `core.js` chạy. Đây là cách an toàn nhất để giữ logic gốc.
- Khi sửa giao diện bán hàng, mở `components/salesApp.html`. Khi sửa giao hàng, mở `components/deliveryApp.html`.
