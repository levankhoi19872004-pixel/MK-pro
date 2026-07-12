# PHASE252 — SALES ORDER AUTHORIZATION BOUNDARY REPORT

**Baseline:** artifact Phase251  
**Ngày thực hiện:** 12/07/2026  
**Mục tiêu:** role `sales` không thể update/cancel/delete đơn không thuộc phạm vi mã NVBH của mình.  
**Không thay đổi logic inventory posting, AR, Fund, delivery closeout hoặc ownership dữ liệu cũ.**

## 1. Kết luận

Authorization đã được đặt thành domain boundary tập trung và defense-in-depth:

```text
route role/auth middleware
  → salesOrderMutation middleware (load order + policy)
  → controller truyền actor/order/version
  → SalesOrderCommandService kiểm policy lần nữa
  → legacy writer
```

Riêng delete:

```text
route mutation middleware
  → controller
  → SalesOrderDeletionService kiểm policy
  → transaction/context load
  → stock reverse / related cleanup / hard delete
```

Cross-owner role `sales` nhận `403` trước mọi writer/transaction side effect.

## 2. Central policy

### `src/domain/orders/salesOrderMutationPolicy.js`

Hàm chính khoảng dòng 76:

```js
canMutateSalesOrder({ actor, order, command, expectedVersion })
```

Policy kiểm:

- actor tồn tại;
- role thuộc `admin`, `manager`, `accountant`, `sales`;
- command `update`, `cancel`, `delete`;
- ownership exact theo mã `salesStaffCode` cho role `sales`;
- alias code được normalize tại boundary: `salesStaffCode`, `salesmanCode`, `nvbhCode`;
- không OR/so sánh tên NVBH;
- expected version;
- đơn đã gộp;
- delivered/closed/closeout/accounting confirmed;
- inactive/cancelled state.

Admin/manager/accountant giữ quyền rộng theo route policy hiện hành, nhưng vẫn bị state/version guard.

## 3. HTTP/error contract

| Trường hợp | Status |
|---|---:|
| Không có actor/role | 401 |
| Role không hợp lệ hoặc cross-owner sales | 403 |
| Không tìm thấy order | 404 |
| Version/state/merged/accounting conflict | 409 |
| Command/input policy invalid | 422 |
| Unexpected server error | 500 |

`orderController.update/cancel/remove` không còn gom mọi exception thành `400`. Service result trả kèm `code`, `status`, `message`.

## 4. Route matrix

Hai mount web cùng dùng một router:

```text
/api/orders
/api/sales-orders
```

| Route/alias | Role gate | Canonical mutation boundary | Command |
|---|---|---|---|
| `PUT /api/orders/:id` và `/api/sales-orders/:id` | admin/manager/accountant/sales | `authorizeUpdate` | update |
| `PATCH /api/orders/:id` và alias | như trên | `authorizeUpdate` | update |
| `POST /api/orders/:id/cancel` và alias | như trên | `authorizeCancel` | cancel |
| `POST /api/orders/:id/delete` và alias | như trên | `authorizeDelete` | delete |
| `DELETE /api/orders/:id` và alias | như trên | `authorizeDelete` | delete |
| `PUT /api/mobile/sales/orders/:id` | mobile login + sales | `authorizeUpdate` | update |
| `DELETE /api/mobile/sales/orders/:id` | mobile login + sales | `authorizeDelete` | delete |

Mobile vẫn giữ owner filter cũ trong writer; canonical boundary mới bổ sung một lớp thống nhất ở trước controller.

## 5. File/hàm đã sửa

| File | Thay đổi |
|---|---|
| `src/domain/orders/salesOrderMutationPolicy.js` | File mới, pure centralized policy. |
| `src/middlewares/salesOrderMutation.middleware.js` | File mới, load order một lần, kiểm actor × owner × state × command, gắn authorization context vào request. |
| `src/routes/orderRoutes.js` | Áp dụng update/cancel/delete middleware cho toàn bộ web aliases. |
| `src/routes/mobile/sales.routes.js` | Áp dụng cùng boundary cho mobile update/delete; validate route param trước DB lookup. |
| `src/controllers/orderController.js` | Truyền actor/pre-authorized order/version; response mapping 401/403/404/409/422/500. |
| `src/services/sales-order/SalesOrderCommandService.js` | Defense-in-depth policy trước legacy update/cancel/delete writer. |
| `src/domain/lifecycle/SalesOrderDeletionService.js` | Policy chạy trước transaction, stock reverse và delete side effects. |
| `test/phase252-sales-order-authorization-boundary.test.js` | Behavioral/policy/middleware/service/route tests. |
| `test/phase250a-order-authorization-verification.test.js` | Chuyển audit assertion sang regression assertion sau remediation. |

## 6. Role/ownership test matrix

| Actor | Owner | Status | Command | Kết quả test |
|---|---|---|---|---|
| sales A | A | editable | update | 200/allowed |
| sales B | A | editable | update | 403 |
| sales B | A | editable | cancel | 403 |
| sales A | A | accounting confirmed | update | 409 |
| sales A | A | accounting confirmed | cancel | 409 |
| admin | A | editable | update | allowed theo policy hiện tại |
| accountant | A | editable | cancel | allowed theo policy hiện tại |
| anonymous | A | editable | update | 401 |

Bổ sung test:

- order missing → 404;
- version mismatch → 409;
- merged/delivered/closed → 409;
- tên giống nhau nhưng không có mã owner → 403;
- code alias normalize đúng;
- mobile/web aliases đều có cùng boundary.

## 7. Side-effect evidence

Behavioral middleware test dựng counters:

```text
order write = 0
stock write = 0
AR write    = 0
Fund write  = 0
audit success = 0
```

Với `sales B` thao tác order owner A:

- response `403 ORDER_OWNERSHIP_FORBIDDEN`;
- `next()` không được gọi;
- order object không đổi;
- tất cả counters vẫn bằng 0.

Command-service test cũng chứng minh legacy writer invocation count bằng 0 khi policy deny.

Delete source-order test xác minh policy nằm trước:

- `tx.withMongoTransaction`;
- `InventoryPostingService.reverseMovement`;
- `orderRepository.removeResolved`.

## 8. Test evidence

### Lệnh

```bash
npm run check:syntax
npm run test:phase251
npm run test:phase252
node --test test/phase250a-order-authorization-verification.test.js
npm run test:phase250a
npm run audit:order-ownership
```

### Kết quả thực tế

| Gate | Kết quả |
|---|---|
| JavaScript syntax | PASS — 1.468 files |
| Phase251 regression | PASS — 13/13 |
| Phase252 suite | PASS — 26/26 |
| Phase250A Track C remediated | PASS — 4/4 |
| Toàn bộ Phase250A regression | PASS — 15/15 |
| Order ownership audit không URI | PASS safe-skip; không kết nối DB |

Không có Mongo test environment/dependencies được cài trong artifact, nên không chạy HTTP + Mongoose integration thật. Test hiện có là pure policy + middleware handler + command-service harness + route registration/source call-order evidence. Trước production deploy nên chạy API integration trên test DB riêng.

## 9. Luồng cũ bị ảnh hưởng

| Luồng | Ảnh hưởng |
|---|---|
| Sales desktop update/cancel đơn của chính mình | Tiếp tục hoạt động nếu order còn editable. |
| Sales desktop cross-owner mutation | Bị chặn 403 — thay đổi có chủ đích. |
| Mobile sales owner mutation | Tiếp tục có owner filter cũ và thêm boundary mới. |
| Admin/manager/accountant trên order editable | Giữ quyền route hiện hành. |
| Mutation order đã merged/delivered/accounting confirmed | Bị chặn 409, yêu cầu luồng điều chỉnh nghiệp vụ. |
| Delete service internal/mobile | Phải có actor/role canonical; mobile source được normalize role `sales` để giữ compatibility và vẫn kiểm owner code. |

## 10. Phạm vi cấm đã giữ

- Không sửa inventory posting/reverse implementation.
- Không sửa AR writer.
- Không sửa Fund writer.
- Không sửa delivery closeout.
- Không đổi owner của document cũ.
- Không thêm role mới.
- Không migration/backfill/production write.

## 11. Rollback plan

Rollback code-only, không cần rollback dữ liệu:

1. Revert route middleware registrations trong `orderRoutes.js` và `mobile/sales.routes.js`.
2. Revert controller context/error mapping.
3. Revert command-service/deletion-service authorization calls.
4. Xóa hai file mới `salesOrderMutationPolicy.js` và `salesOrderMutation.middleware.js`.
5. Chạy lại Phase251/250B regression tests.

Không có schema/data migration nên rollback không đòi repair DB.

## 12. Rủi ro còn lại

| Rủi ro | Mức | Hướng xử lý |
|---|---|---|
| Một flow nội bộ gọi command service mà không truyền actor | Medium | Sẽ nhận 401; inventory toàn bộ call sites trước deploy/UAT. |
| Actor web cũ không có `salesStaffCode/staffCode/code` | Medium | Audit read-only user payload/session; không fallback tên. |
| Status alias production ngoài danh sách lock | Medium | Bổ sung fixture từ dữ liệu test, không nới ownership. |
| Chưa có real Mongo HTTP integration | Medium | Chạy test DB với matrix và snapshot side effects trước deploy. |

## 13. Integrity

So với đầu Phase252:

- File mới: policy, middleware, behavioral test, report.
- File writer nghiệp vụ AR/Fund/Inventory/closeout sửa: 0.
- File bị xóa: 0.
- Migration/data write: 0.
