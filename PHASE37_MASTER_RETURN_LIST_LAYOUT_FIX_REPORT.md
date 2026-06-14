# PHASE 37 — Sửa bố cục danh sách Đơn tổng trả hàng

## Hiện tượng

Khi danh sách chỉ có một đơn tổng trả, hàng tiêu đề và hàng dữ liệu bị kéo giãn, nằm cách xa nhau theo chiều dọc trong vùng danh sách.

## Nguyên nhân gốc rễ

`#masterReturnOrderTable` sử dụng `display: grid` từ `.order-list` và đồng thời có chiều cao cố định. Khi không cấu hình `align-content` và kích thước implicit grid row, các hàng `auto` bị trình duyệt kéo giãn để lấp đầy toàn bộ chiều cao của grid container.

Vì vậy:

- hàng tiêu đề chiếm gần nửa vùng danh sách;
- hàng dữ liệu chiếm phần còn lại;
- nội dung bị căn giữa từng track, tạo khoảng trắng rất lớn.

## Phạm vi sửa

### `public/css/70-master-return-orders.css`

Bổ sung cho `.master-return-fixed-list`:

```css
align-content: start !important;
grid-auto-rows: max-content !important;
```

Đồng thời đặt chiều cao responsive và khóa từng hàng về đầu track:

```css
height: min(620px, calc(100vh - 300px)) !important;
min-height: 260px !important;
align-self: start !important;
```

### `public/index.html`

Tăng cache-busting của CSS module Đơn tổng trả hàng để trình duyệt nhận bản sửa ngay sau deploy.

### Kiểm thử hồi quy

Thêm:

```text
test/master-return-list-compact-layout-static.test.js
```

Test bảo đảm danh sách luôn có:

- `align-content: start`;
- `grid-auto-rows: max-content`;
- CSS cache version mới.

## Kết quả kiểm thử

- Full test: **400/400 PASS**
- JavaScript syntax: **573 file PASS**
- OpenAPI: **247 operations đồng bộ**
- Dependency audit: **0 vulnerabilities**

## Ảnh hưởng hệ thống

Không thay đổi:

- API đơn tổng trả hàng;
- MongoDB schema;
- logic tạo/hủy/nhập kho;
- tính toán giá trị;
- popup tạo đơn tổng trả.

Chỉ thay đổi cách bố trí danh sách trên giao diện web.
