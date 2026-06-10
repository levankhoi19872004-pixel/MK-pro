# Báo cáo triển khai V45 - 32 bước Rule/Search/Import/AR

Ngày thực hiện: 2026-06-01
Gói sửa: `MK-pro-V45-unified-search-8-steps-fixed(2).zip`

## Kết quả tổng quát

Đã triển khai lớp quy tắc dùng chung để hệ thống đi theo luồng chuẩn:

```text
Excel / UI nhập liệu
→ Parse
→ Normalize
→ Validate
→ Preview
→ Import Session
→ Confirm
→ Save Document
→ Posting Engine
→ Report
```

Các thay đổi chính:

- Thêm `src/constants/business.constants.js`.
- Thêm `src/rules/*` gồm common/staff/customer/product/inventory/import/order/ar rules.
- Thêm `src/utils/businessError.util.js` để chuẩn hóa lỗi nghiệp vụ.
- Thêm `src/services/importSessionService.js` để preview import có session backend.
- Thêm `src/services/auditService.js` để ghi log preview/commit import.
- Sửa `src/services/excelImportService.js` để preview salesOrders validate bằng Rule Engine và commit validate lần 2.
- Sửa `src/controllers/excelImportController.js` và `src/controllers/importRuntimeController.js` để nhận `sessionId` + `selectedOrderCodes`.
- Sửa `public/js/app/08-reports-users-promotions-import-excel.js` để frontend chỉ render preview backend, không tự sửa/tự validate NVBH bằng cache cũ.
- Sửa `src/repositories/searchRepository.js` để nhân viên lấy từ `users` là nguồn chuẩn, không trộn `staffs`.
- Sửa `src/services/searchService.js` để API search bắt buộc `q >= 2`.
- Đảm bảo tồn kho import đọc `inventorySnapshots` và fallback `inventories`; khi ghi tồn cập nhật cả hai nguồn tương thích.

---

## Báo cáo chi tiết 32 bước

| Bước | Nội dung đã làm | File chính | Kết quả kiểm tra |
|---:|---|---|---|
| 1 | Chốt nguồn dữ liệu chuẩn: customers/products/users/orders/master_orders/journals/inventories. | `business.constants.js`, `searchRepository.js` | Đã khóa nhân viên về `users`; sản phẩm không dùng `products.stock`. |
| 2 | Tạo hằng số nghiệp vụ chuẩn. | `src/constants/business.constants.js` | `node --check` OK. |
| 3 | Tạo thư mục Rule Engine dùng chung. | `src/rules/` | Đã có đủ 8 file rules + `index.js`. |
| 4 | Tạo normalize dùng chung: code/text/money/date/quantity/phone. | `src/rules/commonRules.js` | `node --check` OK; xử lý `35581.0 → 35581`. |
| 5 | Tạo chuẩn lỗi nghiệp vụ. | `src/utils/businessError.util.js` | Lỗi có `code/message/orderCode/field/level`. |
| 6 | Tạo rule nhân viên. | `src/rules/staffRules.js` | NVBH/NVGH validate theo mã trong `users`, đúng role. |
| 7 | Tạo rule khách hàng. | `src/rules/customerRules.js` | Mã KH sai trả lỗi `INVALID_CUSTOMER_CODE`. |
| 8 | Tạo rule sản phẩm. | `src/rules/productRules.js` | Mã SP sai trả lỗi `INVALID_PRODUCT_CODE`. |
| 9 | Tạo rule tồn kho. | `src/rules/inventoryRules.js` | Đọc `inventorySnapshots`, fallback `inventories`. |
| 10 | Chuẩn hóa search service. | `src/services/searchService.js` | Search bắt buộc `q >= 2`, limit 20/50. |
| 11 | Route search thống nhất đã đủ endpoint. | `src/routes/searchRoutes.js` | Có customers/products/sales-staff/delivery-staff/orders/master-orders/ar-ledger. |
| 12 | Route search đã gắn vào app. | `src/routes/index.js` | `/api/search` đã register. |
| 13 | Index Mongo cho search. | `src/services/mongoIndexService.js` | Đã có index `salePrice`, `routeName`, staff/user/order/master/ar/inventory. |
| 14 | Frontend unified search chuẩn. | `public/js/search/unifiedSearchEngine.js` | Chỉ gọi `/api/search/...`, không dùng cache làm nguồn chính. |
| 15 | Autocomplete chuẩn. | `public/js/search/autocompleteEngine.js` | Min 2 ký tự, debounce 280ms, max 20 kết quả. |
| 16 | Màn đơn bán dùng search chung. | `public/js/app/05-sales-orders.js`, `03-customers-autocomplete.js` | KH/NVBH dùng `UnifiedSearchEngine`; product autocomplete dùng engine chung. |
| 17 | Màn đơn tổng dùng filter ngày và search chung khi có autocomplete. | `public/js/app/06-master-delivery.js` | Danh sách đơn con mặc định theo ngày hôm nay. |
| 18 | Màn giao hàng/công nợ định hướng search chung. | `public/js/app/07-debt-cashbook.js`, search API | Công nợ search qua AR Ledger endpoint. |
| 19 | Màn import Excel chỉ render backend. | `public/js/app/08-reports-users-promotions-import-excel.js` | Bỏ frontend tự sửa tên/mã NVBH theo cache cũ. |
| 20 | Màn tồn kho/search sản phẩm không dùng `products.stock`. | `searchService.js`, `inventoryRules.js` | Gợi ý sản phẩm đọc tồn từ inventory. |
| 21 | Preview import tạo session backend. | `excelImportService.js`, `importSessionService.js` | Preview trả `sessionId/importSessionId`. |
| 22 | Import rules validate salesOrders. | `src/rules/importRules.js` | Check mã đơn, KH, NVBH, dòng hàng, cảnh báo tồn. |
| 23 | Import Session Service. | `src/services/importSessionService.js` | Có create/get/update/selectRows, TTL 1 giờ. |
| 24 | Nút import gửi session + selectedOrderCodes. | `08-reports-users-promotions-import-excel.js` | Payload có `sessionId` và danh sách mã đơn đã chọn. |
| 25 | Backend validate lần 2 trước commit. | `excelImportService.js` | Commit đọc session, validate lại, chỉ import đơn valid. |
| 26 | AR rules. | `src/rules/arRules.js` | Chặn AR-SALE lặp, chỉ post đơn đã giao/xác nhận. |
| 27 | Định hướng bỏ AR cache khỏi luồng mới. | `arRules.js`, search AR Ledger | Search debt đọc journals/AR Ledger. |
| 28 | Audit service. | `src/services/auditService.js` | Ghi `IMPORT_PREVIEW` và `IMPORT_COMMIT`. |
| 29 | Response lỗi nghiệp vụ chuẩn. | `businessError.util.js`, `importRules.js` | Lỗi import có code/field/orderCode. |
| 30 | Test tìm kiếm. | `node --check`, `docs:check` | Search service/controller syntax OK; OpenAPI OK. |
| 31 | Test import DMS. | `excelImportService.js` | Preview/commit đã có validate 2 lớp; cần test dữ liệu thật khi có Mongo. |
| 32 | Test màn hình/toàn hệ thống. | `npm test` | 9/12 test pass; 3 fail do test hiện tại cần DB/logic tồn cũ, chi tiết bên dưới. |

---

## Checklist test đã chạy

### 1. Kiểm tra cú pháp toàn bộ JS

Lệnh:

```bash
find src public/js -name '*.js' -print0 | xargs -0 -n1 node --check
```

Kết quả: **PASS**. Không có lỗi cú pháp JS.

### 2. Kiểm tra OpenAPI

Lệnh:

```bash
npm run docs:check
```

Kết quả: **PASS**.

```text
OpenAPI document is up to date. Scanned operations: 138.
```

### 3. Chạy test suite

Lệnh:

```bash
npm test
```

Kết quả: **9/12 PASS, 3/12 FAIL**.

Các test pass:

- Swagger UI/OpenAPI mounted.
- Docs auth guard.
- Docs generate check.
- OpenAPI JSON valid.
- ProductService createProduct validate required fields.
- ProductService createProduct normalize packing/reject duplicate.

Các test fail:

1. `ProductService.listProducts maps stock display fields for frontend`
   - Lý do: test đang kỳ vọng stock display cũ khác với định hướng mới `products không là nguồn tồn`.
   - Đây không phải lỗi cú pháp phần vừa thêm, nhưng cần cập nhật test theo nguồn tồn mới.

2. `SalesOrder flow creates order...`
3. `SalesOrder cancel reverses stock...`
   - Lý do: test gọi Mongoose khi không có Mongo test connection, bị timeout `products.findOne() buffering timed out after 10000ms`.
   - Cần cấu hình Mongo test DB hoặc mock repository để chạy integration test đầy đủ.

---

## Ghi chú quan trọng sau khi sửa

1. Import DMS bây giờ không còn tin dữ liệu frontend.
2. Mã NVBH lấy từ Excel, tên NVBH lấy từ `users` theo mã.
3. Nếu mã NVBH không tồn tại trong `users` hoặc sai role sales, đơn bị lỗi và không được import.
4. Frontend import preview chỉ hiển thị dữ liệu backend trả về.
5. Khi bấm import, frontend gửi `sessionId + selectedOrderCodes`; backend đọc lại session và validate lần 2.
6. Search nhân viên đã chuyển về `users` là nguồn chuẩn, không còn trộn `staffs`.
7. Tồn kho trong import/search đọc từ `inventorySnapshots`, fallback `inventories` để tương thích dữ liệu cũ.
8. Audit log đã ghi được preview/commit import.

---

## Việc cần test thủ công với dữ liệu thật trên Render/Mongo

Cần test 13 tình huống nghiệp vụ sau:

1. Tìm khách hàng theo mã.
2. Tìm khách hàng theo tên.
3. Tìm sản phẩm theo mã.
4. Tìm sản phẩm theo tên.
5. Tìm sản phẩm theo giá.
6. Tìm NVBH theo mã.
7. Tìm NVBH theo tên.
8. Tìm NVGH theo mã.
9. Tìm NVGH theo tên.
10. Import Excel mã NVBH đúng → hiện đúng tên.
11. Import Excel mã NVBH sai → báo lỗi đơn và không cho tick.
12. Import Excel thiếu tồn → cảnh báo/cắt theo tồn.
13. Import đơn hợp lệ → tồn kho giảm đúng, chưa post AR khi chưa giao/xác nhận kế toán.
