# PHASE46 - Remove Flash/RIA UI Skin Rollback Report

## Mục tiêu

Gỡ hoàn toàn lớp giao diện Flash/RIA đã thêm ở Phase45 vì gây nền quá tối, chữ khó đọc và mỏi mắt trong màn nghiệp vụ.

## Phạm vi thay đổi

Chỉ thay đổi lớp giao diện tĩnh phía frontend:

- Gỡ link CSS Flash/RIA khỏi web admin shell.
- Gỡ link CSS Flash/RIA khỏi trang login web.
- Gỡ link CSS Flash/RIA khỏi mobile sales/delivery/login.
- Xóa 2 file CSS Flash/RIA đã thêm ở Phase45.

Không thay đổi:

- Backend/API contract.
- Database/schema/migration.
- Business rule giao hàng/thu tiền/công nợ/tồn kho.
- MongoDB connection/env config.
- Package dependency.

## File đã sửa

| File | Thay đổi |
|---|---|
| `public/index.shell.html` | Bỏ link `/css/00-flash-ria-theme.css?v=phase45-flash-ria-v1` |
| `public/login.html` | Bỏ link `/css/00-flash-ria-theme.css?v=phase45-flash-ria-v1` |
| `public/mobile/sales.html` | Bỏ link `./mobile-flash-ria.css?v=phase45-flash-ria-v1` |
| `public/mobile/delivery.html` | Bỏ link `./mobile-flash-ria.css?v=phase45-flash-ria-v1` |
| `public/mobile/login.html` | Bỏ link `./mobile-flash-ria.css?v=phase45-flash-ria-v1` |

## File đã xóa

| File | Lý do |
|---|---|
| `public/css/00-flash-ria-theme.css` | CSS Flash/RIA gây contrast thấp, nền tối |
| `public/mobile/mobile-flash-ria.css` | CSS Flash/RIA mobile gây khó đọc/mỏi mắt |

## Kiểm tra thực tế

| Lệnh | Kết quả | Ghi chú |
|---|---:|---|
| `npm install` | PASS | Cài dependency để chạy kiểm tra local |
| `npm run check:syntax` | PASS | `SYNTAX_OK 985 JavaScript files` |
| `npm run check:source-bundles` | PASS | `[source-bundles] OK 19 bundles` |
| Assemble index smoke | PASS | Index build được, không còn link `00-flash-ria-theme` |
| Grep Flash/RIA trong `public` | PASS | Không còn `flash-ria` / `00-flash` trong file public |
| `npm run check:source-size` | FAIL baseline | Lỗi cũ không do Phase46: `delivery-mobile-view.js` vượt 46 bytes, `delivery-mobile-view.source.js` vượt 1398 bytes |

## Rủi ro còn lại

- Giao diện quay về hệ CSS cũ của dự án, không còn hiệu ứng Flash/RIA.
- Lỗi source-size budget là tồn tại baseline từ trước, không phát sinh từ bản rollback này vì Phase46 không sửa JS mobile.

## Rollback của Phase46

Nếu muốn bật lại Flash/RIA, có thể lấy lại Phase45. Tuy nhiên không khuyến nghị vì ảnh thực tế cho thấy contrast thấp và gây khó đọc.
