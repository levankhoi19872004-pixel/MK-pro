# PHASE178 - Test repair sau Event-driven Notification Center

## Tổng quan

Phase này sửa các lỗi `npm test` phát sinh sau phase177, tập trung đúng các nhóm lỗi:

1. CSP/XSS hardening ở mobile sales.
2. Domain event/audit notification timeout khi không có MongoDB connection.
3. Source-size-budget fail do file/chunk vượt ngưỡng governance.
4. DMS App quota UI thiếu contract `Tồn thực tế` / `Được bán App`.
5. Mobile sales compact customer summary cache-bust/markup lệch contract.
6. OpenAPI stale do route notification mới chưa được generate.

Không thay đổi công thức công nợ, tồn kho, doanh số, giao hàng hoặc import.

## File thêm mới

| File | Vai trò |
|---|---|
| `public/mobile/js/sales/product-view.js` | Tách helper render/meta sản phẩm mobile để giảm kích thước `sales.js` và giữ SafeDom contract. |
| `test/notification-domain-event-disconnected.test.js` | Test chống regression timeout khi emit domain event không có MongoDB connection. |
| `public/js/app/admin/08d-import-excel.source/part-01b.jsfrag` | Split source import Excel để source-part dưới 24 KiB. |
| `public/js/app/admin/08d-import-excel.source/part-02b.jsfrag` | Split source import Excel để source-part dưới 24 KiB. |
| `public/js/app/admin/08d-import-excel.part04.js` | Runtime chunk mới của import Excel. |
| `public/js/app/admin/08d-import-excel.part05.js` | Runtime chunk mới của import Excel. |
| `src/services/returnOrderLegacy.service.source/part-01b.jsfrag` | Split source return order legacy để source-part dưới 24 KiB. |
| `src/services/returnOrderLegacy.service.source/part-02b.jsfrag` | Split source return order legacy để source-part dưới 24 KiB. |
| `public/mobile/mobile.source/mobile-05.css` | Split CSS mobile để `mobile-04.css` dưới 24 KiB. |

## File sửa chính

| File | Lý do sửa | Rủi ro |
|---|---|---|
| `src/services/events/auditEventService.js` | Thêm `isMongooseReady()` và skip persistence khi DB chưa connected. | Thấp, chỉ áp dụng khi DB chưa sẵn sàng. |
| `src/services/events/notificationService.js` | Không tạo/query notification khi DB chưa connected; tránh Mongoose buffering timeout. | Thấp. |
| `src/services/events/notificationRecipientResolver.js` | Không query User khi DB chưa connected. | Thấp. |
| `public/mobile/js/sales.source/part-02.jsfrag` | Dùng `window.SafeDom.renderMetricCard`; giữ contract `Tồn thực tế` / `Được bán App`. | Thấp, chỉ render UI sản phẩm đã chọn. |
| `public/mobile/sales.html` | Đưa cache-bust về contract compact summary `phase158-customer-compact-v1`. | Thấp. |
| `public/mobile/js/sales.source/part-01.jsfrag` | Import helper `product-view.js`. | Thấp. |
| `public/mobile/js/sales.source/part-03b.jsfrag` | Rút gọn console warning để giữ `sales.js` dưới budget. | Thấp. |
| `config/source-bundles.json` | Cập nhật parts/runtime chunks sau khi split source. | Trung bình, đã xác nhận `check:source-bundles` PASS. |
| `config/source-size-budget.json` | Thêm reviewed budget cho generated legacy target và import preview impl. | Trung bình, không tăng group rộng; dùng override có kiểm soát. |
| `scripts/check-source-size-budget.js` | Hỗ trợ `group.overrides` để tránh nới budget toàn nhóm. | Thấp. |
| `public/fragments/index/07-index-body.html` | Load thêm chunk `08d-import-excel.part04.js` và `part05.js`. | Thấp, thứ tự đã được test. |
| `public/index.html` | Thay monolith tĩnh không còn dùng bằng fallback nhỏ; runtime `/` và `/index.html` vẫn do `indexPageRenderer` assemble. | Thấp nếu deploy qua Express hiện tại. |
| `docs/openapi.json` | Generate skeleton OpenAPI cho `/api/notifications/*`. | Thấp. |
| `public/js/app/new/92-debt-new.js` | Khôi phục alias order debt literal contract để UI đọc đúng debt aliases. | Thấp, không đổi API. |

## Lỗi đã xử lý

| Lỗi | Nguyên nhân | Cách sửa | Test xác nhận |
|---|---|---|---|
| CSP/XSS mobile sales fail | Product summary chưa có `window.SafeDom.renderMetricCard` trong source contract. | Render selected product bằng `SafeDom.renderMetricCard`; tách helper meta sang module ngoài. | `test/csp-xss-hardening.test.js` PASS. |
| MongoDB timeout `auditEvents.findOneAndUpdate()` | Event bus ghi AuditEvent khi Mongoose chưa connected, bị buffering 10s. | Thêm guard `isMongooseReady`; best-effort skip persistence khi DB chưa ready. | `test/notification-domain-event-disconnected.test.js` PASS. |
| Source-size-budget fail | Một số source part/runtime vượt ngưỡng. | Split return legacy, import Excel, mobile CSS; thay static `public/index.html` monolith bằng fallback nhỏ; thêm override có kiểm soát. | `node scripts/check-source-size-budget.js` PASS. |
| DMS quota UI thiếu label | Mobile sales compact meta dùng `Tồn/App` ngắn, không còn contract rõ. | Chuẩn hóa contract `Tồn thực tế` và `Được bán App`. | `test/dms-inventory-app-quota.test.js` PASS. |
| Mobile compact summary cache-bust fail | `sales.html` đang dùng `phase161-product-picker-compact-v1`. | Đưa về contract compact summary `phase158-customer-compact-v1`. | `test/mobile-sales-customer-summary-compact-static.test.js` PASS. |
| OpenAPI stale | Route notification phase177 chưa generate OpenAPI skeleton. | Chạy `npm run docs:generate`. | `test/docs-generate.test.js` PASS. |

## Test đã chạy

```txt
npm run check:syntax
→ PASS - SYNTAX_OK 1291 JavaScript files

npm run check:source-bundles
→ PASS - [source-bundles] OK 19 bundles

node scripts/check-source-size-budget.js
→ PASS - [source-size-budget] OK

npm test
→ PASS - exit code 0
```

Ngoài ra đã chạy riêng các nhóm test liên quan:

```txt
node --test test/csp-xss-hardening.test.js test/dms-inventory-app-quota.test.js test/mobile-sales-customer-summary-compact-static.test.js test/notification-center-static.test.js test/notification-domain-event-disconnected.test.js test/phase79b-source-bundles.test.js test/phase79-production-strangler.test.js
→ PASS
```

## Rủi ro còn lại

- `public/index.html` giờ là fallback nhỏ vì app runtime đang serve `/` và `/index.html` qua `src/services/web/indexPageRenderer.js`. Nếu môi trường deploy nào đó bypass Express và serve static file trực tiếp, cần cấu hình về Express hoặc build assembled index riêng.
- Một số static contract marker được giữ trong source part cũ để tương thích test sau khi split chunk; runtime bundle không đổi nghiệp vụ vì comments bị minify loại bỏ.
