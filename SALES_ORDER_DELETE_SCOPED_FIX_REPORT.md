# SALES ORDER DELETE SCOPED FIX REPORT

## 1. Tổng quan dự án

- Backend: Node.js/Express, MongoDB/Mongoose.
- Frontend: HTML fragments + vanilla JavaScript.
- Màn hình liên quan: `Bán hàng` → `Lịch sử đơn bán`.
- Flow liên quan: nút `Xóa` trên dòng đơn bán → API `/api/sales-orders/:id` → `orderController.remove` → `SalesOrderDeletionService.deleteSalesOrder`.

## 2. Khoanh vùng sửa chữa

### File đã kiểm tra

- `public/js/app/05-sales-orders.source/part-03.jsfrag`
- `public/js/app/05-sales-orders.part03.js`
- `src/routes/orderRoutes.js`
- `src/controllers/orderController.js`
- `src/domain/lifecycle/SalesOrderDeletionService.js`
- `src/domain/lifecycle/salesOrderDeletion.policy.js`
- `src/repositories/orderRepository.js`
- `src/repositories/salesOrderDeletion.repository.js`
- `test/sales-order-delete-*.test.js`

### File đã sửa thực tế

- `public/js/app/05-sales-orders.source/part-03.jsfrag`
- `public/js/app/05-sales-orders.part03.js`
- `src/routes/orderRoutes.js`
- `src/domain/lifecycle/SalesOrderDeletionService.js`
- `src/repositories/orderRepository.js`
- `src/repositories/salesOrderDeletion.repository.js`
- `config/source-bundles.json`
- `test/sales-order-delete-ui-scoped-static.test.js`

### File không đụng tới

Không sửa các module ngoài phạm vi:

- Dashboard
- App giao hàng
- App bán hàng mobile
- Đơn tổng/master order
- Đơn trả hàng
- Công nợ tổng thể
- Quỹ tiền
- Import Excel/DMS
- Admin Data Correction
- CSS/layout toàn hệ thống
- Middleware auth toàn hệ thống
- Mongo index service

## 3. Nguyên nhân lỗi

### Nguyên nhân chính

Flow xóa đơn trên UI phụ thuộc một mã định danh đơn duy nhất và gọi trực tiếp `DELETE /api/sales-orders/:id`. Với dữ liệu DMS/BO/import, cùng một đơn có thể tồn tại nhiều mã định danh như `id`, `code`, `orderCode`, `salesOrderCode`, `documentCode`, `invoiceCode`, `externalOrderCode`, `sourceOrderCode`. Nếu frontend gửi mã không khớp field backend dùng để xóa, backend có thể không tìm/xóa đúng đơn.

### Nguyên nhân phụ

- Request xóa chưa gửi header `X-Requested-With`, trong một số môi trường dùng cookie auth có thể bị kiểm tra CSRF chặn.
- Chưa có fallback POST cho trường hợp proxy/trình duyệt/môi trường deploy chặn hoặc xử lý không ổn định `DELETE`.
- Event click chưa chặn propagation, có thể bị ảnh hưởng bởi click row/checkbox ở danh sách.
- Backend không validate `deletedCount`; có thể trả success dù identity xóa không khớp trong một số case edge.

## 4. Thay đổi đã thực hiện

### Frontend

File: `public/js/app/05-sales-orders.source/part-03.jsfrag`

- Thêm `salesOrderDeleteRefs(order)` để gom danh sách mã định danh theo thứ tự an toàn:
  - `id`
  - `code`
  - `orderCode`
  - `salesOrderCode`
  - `documentCode`
  - `invoiceCode`
  - `externalOrderCode`
  - `sourceOrderCode`
- Thêm `sendSalesOrderDeleteRequest(ref, reason)`:
  - Gọi `DELETE /api/sales-orders/:ref`.
  - Có `credentials: 'same-origin'`.
  - Có header `X-Requested-With: XMLHttpRequest`.
  - Fallback sang `POST /api/sales-orders/:ref/delete` nếu route/method không ổn định.
- Nếu backend trả `404/ORDER_NOT_FOUND`, frontend thử ref kế tiếp trong cùng đơn.
- Nếu lỗi nghiệp vụ như đơn đã thuộc đơn tổng/kế toán/công nợ thì dừng ngay và báo đúng message backend.
- Sau khi xóa thành công: xóa cache chi tiết đơn và reload danh sách.
- Chặn `event.preventDefault()` và `event.stopPropagation()` khi bấm nút thao tác.

### Backend

File: `src/routes/orderRoutes.js`

- Giữ route cũ:
  - `DELETE /api/sales-orders/:id`
- Thêm route fallback khoanh vùng:
  - `POST /api/sales-orders/:id/delete`
- Cả 2 route dùng cùng `orderController.remove`, không mở business rule mới.

File: `src/repositories/orderRepository.js`

- Mở rộng identity fields cho đơn DMS/import:
  - `externalOrderCode`
  - `sourceOrderId`
  - `sourceOrderCode`
  - `deliveryOrderId`
  - `deliveryOrderCode`
  - `orderNo`
- Sửa `remove()` để dùng cùng `identityFilter()`, hỗ trợ `_id` hợp lệ.
- Thêm `removeResolved(order, fallbackRef, options)` để xóa dựa trên toàn bộ identity của order đã resolve.

File: `src/domain/lifecycle/SalesOrderDeletionService.js`

- Dùng `orderRepository.removeResolved(order, idOrCode, { session })`.
- Validate `deletedCount === 1`.
- Nếu identity mismatch thì rollback transaction và trả lỗi rõ.
- Thêm debug log có kiểm soát qua `DEBUG_SALES_ORDER_DELETE=1`.

File: `src/repositories/salesOrderDeletion.repository.js`

- Bổ sung các alias order key để dependency context tìm đúng quan hệ stock/AR/return/master theo đơn BO/import.

## 5. Kiểm chứng nghiệp vụ

| Case | Kết quả sau sửa |
|---|---|
| Đơn chưa post kho | Hard delete theo policy hiện tại |
| Đơn đã post kho | `SalesOrderDeletionService` gọi reverse stock trong transaction rồi xóa |
| Đơn thuộc đơn tổng | Vẫn bị chặn theo policy `ORDER_ALREADY_MERGED`, không sửa lan sang master order |
| Đơn đã kế toán/công nợ | Vẫn bị chặn theo policy `FINANCIAL_DEPENDENCY_EXISTS` |
| Đơn VAT | Không đổi business rule VAT; xóa đi theo policy lifecycle hiện tại |
| UI sau xóa | Reload lại `Lịch sử đơn bán`, refresh stock/debt/cashbook |

## 6. Test/kiểm chứng

Đã chạy:

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1000 JavaScript files
```

Đã chạy:

```bash
node --test \
  test/sales-order-delete-ui-scoped-static.test.js \
  test/sales-order-delete-policy.test.js \
  test/sales-order-delete-static-boundary.test.js \
  test/sales-order-delete-list-visibility-static.test.js \
  test/phase36d-api-response-followup-static.test.js \
  test/inventory-ledger-invariants-static.test.js \
  test/master-order-popup-selection-ui-static.test.js
```

Kết quả:

```text
28/28 pass
```

Chưa chạy full `npm test` trong sandbox vì thiếu dependency local như `terser`/`read-excel-file`. Khi deploy hoặc chạy ở máy dev cần `npm install` trước rồi chạy lại full test.

## 7. Hướng dẫn deploy

```bash
npm install
npm run check:syntax
node --test test/sales-order-delete-ui-scoped-static.test.js test/sales-order-delete-policy.test.js
npm test
```

Sau đó push GitHub và restart Render Web Service.

Script `05-sales-orders.part03.js` đã được đổi cache-busting version sang `phase49-sales-order-delete-scoped-v1`. Nếu trình duyệt vẫn dùng cache cũ, hard refresh bằng `Ctrl + F5`.

## 8. Phương án sửa

### Phương án A - Production-grade dài hạn

- Chuẩn hóa toàn bộ sales order identity thành DTO/API contract rõ ràng.
- Tách lifecycle delete/cancel/reversal thành màn hình quản trị riêng.
- Có integration test với Mongo memory/test DB cho các case kho/công nợ/master order.

Effort: Hard
Rủi ro: Medium

### Phương án B - Khoanh vùng, cân bằng effort

- Giữ business rule hiện tại.
- Sửa đúng flow xóa ở lịch sử bán hàng.
- Bổ sung identity fallback, POST fallback, CSRF ajax header, validate deletedCount.
- Không sửa lan sang module tồn kho/công nợ/quỹ/master order.

Effort: Medium
Rủi ro: Low

## 9. Kết luận

Bản sửa chọn Phương án B: khoanh vùng vào flow xóa đơn bán, không refactor rộng, không thay đổi policy kế toán/kho/công nợ. Các đơn BO/DMS/import có nhiều mã định danh được xử lý robust hơn, UI hiển thị lỗi rõ hơn và reload đúng sau khi xóa.
