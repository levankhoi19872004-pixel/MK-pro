# BÁO CÁO NÂNG CẤP, KIỂM ĐỊNH LẠI VÀ ĐỊNH GIÁ MK-PRO PHASE 25

**Bản nguồn:** `MK-pro-phase25-fund-service-lazy-delivery-dependency-patched(3).zip`  
**Bản sau nâng cấp:** `MK-pro-phase25-production-hardening-v2`  
**Phương pháp:** white-box, gray-box, negative testing, static contract, dynamic business-flow testing, security review, dependency analysis, coverage, production-readiness review.

> Báo cáo này phản ánh source code và bộ test trong gói bàn giao. Chưa có quyền truy cập MongoDB production, thiết bị thật, dữ liệu thật đã ẩn danh hoặc hạ tầng Render đang chạy, nên không thay thế kiểm thử staging, load test, penetration test và restore drill trước khi triển khai chính thức.

---

# KẾT LUẬN ĐIỀU HÀNH

Bản nâng cấp đã xử lý phần lớn rủi ro nghiêm trọng được phát hiện trong lần kiểm định trước, đặc biệt là lỗi **API giao hàng trả thành công giả nhưng không cập nhật database**, thiếu kiểm tra đơn thuộc đúng NVGH, token trình duyệt lưu trong `localStorage`, quyền đọc/ghi quá rộng, idempotency chỉ nằm trong RAM, hai vòng circular dependency, backup thiếu collection tài chính–kho và reconciliation mặc định tắt.

## Kết quả nghiệm thu cuối

| Chỉ số | Trước nâng cấp | Sau nâng cấp |
|---|---:|---:|
| Test pass | 295/295 | **359/359** |
| File JavaScript kiểm tra cú pháp | Khoảng 444 | **488** |
| OpenAPI operations | 266 | **270, đồng bộ** |
| Circular dependencies | 2 | **0** |
| Dependency vulnerability theo `npm audit --omit=dev` | 0 | **0** |
| Source line coverage | 33,46% | **35,91%** |
| Source function coverage | 19,95% | **28,22%** |
| Production readiness gate | Chưa có | **Pass** |
| Reconciliation tự động | Tắt mặc định | **Bật mặc định, chống chạy chồng** |
| Mobile legacy namespace | Có thể song song | **Tắt mặc định** |
| Browser token | Access/refresh trong localStorage | **HttpOnly cookies** |
| Circular module startup risk | Có | **Đã loại bỏ** |

## Điểm đánh giá sau nâng cấp

| Nhóm | Trước | Sau | Nhận xét |
|---|---:|---:|---|
| Phù hợp nghiệp vụ NPP | 8,4 | **8,7** | Nghiệp vụ vốn đã sâu, nay ổn định hơn |
| Toàn vẹn dữ liệu | 5,8 | **7,8** | Đã sửa false-success, ownership, version, idempotency DB |
| Bảo mật | 4,9 | **7,6** | Cookie HttpOnly, CSRF, RBAC, input guard, data-scope |
| Độ tin cậy | 5,5 | **7,7** | Reconciliation, graceful shutdown, maintenance/reset transaction |
| Hiệu năng | 6,5 | **7,3** | Report query pushdown, bounded cache/import queue |
| Khả năng bảo trì | 6,3 | **7,1** | 0 circular dependency, CI gate; god services vẫn còn |
| Sẵn sàng dùng nội bộ | 7,2 | **8,6** | Phù hợp NPP 12 NVBH + 4 NVGH sau staging |
| Sẵn sàng thương mại | 5,2 | **7,1** | Chưa đạt SaaS do thiếu tenant, E2E/load/restore thật |

**Kết luận:** bản này phù hợp hơn rõ rệt để vận hành nội bộ cho NPP hiện tại, nhưng vẫn phải triển khai qua staging, backup và kiểm thử dữ liệu thật. Chưa nên gọi là SaaS production-grade cho nhiều NPP cho đến khi hoàn thành các hạng mục còn lại ở cuối báo cáo.

---

# 1. TỔNG QUAN KIẾN TRÚC & ĐIỂM SÁNG

## 1.1. Kiến trúc hiện tại

MK-Pro là **modular monolith Node.js/Express/Mongoose**, phù hợp với quy mô một NPP và tốt hơn việc tách microservices quá sớm. Các tầng chính:

```text
Web / Mobile
    → Routes
    → Controllers
    → Services / Engines / Domain services
    → Repositories
    → MongoDB
```

Các domain quan trọng đã hiện diện:

- `src/domain/posting`
- `src/domain/lifecycle`
- `src/domain/settlement`
- `src/domain/reconciliation`
- `src/domain/staff`
- `src/domain/print`

## 1.2. Điểm sáng sau nâng cấp

### A. Giao hàng dùng một command path chuẩn

Các endpoint mobile/web giao hàng đã được đưa về cùng lõi `DeliveryEngine`, không còn sửa snapshot trong RAM rồi trả `200` giả.

File trọng yếu:

- `src/services/mobile/delivery.service.js`
- `src/engines/delivery.engine.js`
- `src/routes/deliveryRoutes.js`
- `test/mobile-delivery-confirm-canonical.test.js`
- `test/delivery-version-conflict.test.js`

### B. Idempotency bền vững trong MongoDB

Đã thêm:

- `src/models/IdempotencyRequest.js`
- `src/services/requestIdempotency.service.js`

Retry sau deploy/restart không còn phụ thuộc duy nhất vào RAM. Có unique index, TTL và thu hồi request mắc ở trạng thái `processing`.

### C. Authentication trình duyệt an toàn hơn

Đã thêm:

- `src/security/accessTokenCookie.js`
- `src/security/refreshTokenCookie.js`
- `src/middlewares/csrf.middleware.js`

Access token và refresh token được đặt trong cookie `HttpOnly`; browser không ghi mới token vào `localStorage`. Request ghi bằng cookie phải chứng minh same-origin, còn client tích hợp dùng Bearer vẫn tương thích.

### D. Phân quyền và data scope rõ hơn

RBAC được siết ở cả read và write API. Mobile sales chỉ thấy khách hàng được gán; delivery không thể liệt kê toàn bộ khách; các API web toàn cục chỉ dành cho nhóm quản trị phù hợp.

File trọng yếu:

- `src/domain/staff/customerOwnership.js`
- `src/routes/customerRoutes.js`
- `src/routes/orderRoutes.js`
- `src/routes/deliveryRoutes.js`
- `src/routes/searchRoutes.js`
- `src/routes/mobile/catalog.routes.js`
- `src/repositories/searchRepository.js`

### E. Reconciliation trở thành hàng rào vận hành

`src/jobs/reconciliationJob.js` hiện:

- Bật mặc định trừ khi chủ động tắt.
- Chạy chậm sau startup.
- Chống chạy chồng.
- Có trạng thái lần chạy gần nhất, số lỗi liên tiếp và mismatch count.
- Đưa trạng thái vào System Status.

### F. CI và quality gate

Đã thêm:

- `.github/workflows/ci.yml`
- `scripts/check-js-syntax.js`
- `scripts/production-readiness-check.js`
- `.env.production.example`

Quality gate kiểm tra cú pháp, OpenAPI, test và dependency audit. Production gate kiểm tra secret, Mongo URI, CORS, Secure cookie, unsafe flags, reconciliation và backup path.

---

# 2. CÁC NÂNG CẤP ĐÃ THỰC HIỆN

## 2.1. Toàn vẹn dữ liệu và transaction

1. Sửa mobile delivery false-success.
2. Yêu cầu đơn phải thuộc đúng NVGH trước khi confirm/return/payment.
3. Gắn Mongo session cho write path giao hàng.
4. Thêm optimistic version cho `SalesOrder` ở luồng giao hàng.
5. Phát hiện conflict khi client thao tác trên version cũ.
6. Chuyển idempotency mobile sales/delivery sang MongoDB.
7. Thu hồi idempotency record bị treo sau crash.
8. Ngừng mobile sales ghi trực tiếp `journals/cashbooks`.
9. Tiền thu chờ kế toán được lưu trên order và chỉ post qua posting boundary.
10. Tắt auto backfill AR từ journal mặc định.
11. Tắt mobile legacy namespace mặc định để không có hai write path.
12. Maintenance mode chặn write trong lúc reset.
13. Reset nhiều collection chạy trong transaction.
14. Graceful shutdown chờ request và đóng Mongo đúng trình tự.

## 2.2. Bảo mật

1. Tách access/refresh secret và `tokenType`.
2. Refresh tải lại user đang active từ DB.
3. Access/refresh token chuyển sang cookie HttpOnly.
4. Same-origin CSRF guard cho cookie-auth write request.
5. Giới hạn login/refresh bằng rate limiter riêng.
6. Dùng dummy bcrypt khi tài khoản không tồn tại để giảm user enumeration bằng timing.
7. Chính sách mật khẩu tối thiểu, không trùng identity, không thuộc nhóm phổ biến.
8. Bcrypt work factor mẫu nâng lên 12.
9. Input guard chống Mongo operator injection, dotted key, prototype pollution và payload quá sâu.
10. Production error redaction, không trả stack/error nội bộ.
11. CORS mặc định same-origin/allowlist, không mở toàn bộ origin.
12. `/api/data` full snapshot khóa bằng admin + cờ môi trường.
13. System reset/export mặc định tắt.
14. Health/readiness trả HTTP 503 khi DB mất kết nối.
15. Admin không thể tự xóa, tự hạ quyền hoặc xóa admin cuối cùng.
16. Role catalog đồng bộ `admin/manager/accountant/warehouse/sales/delivery` giữa model, service và UI.
17. Tăng output encoding ở các màn khách hàng, sản phẩm, đơn, import, công nợ, khuyến mại và mobile.

## 2.3. Phân quyền

Đã siết role cho các nhóm:

- Sản phẩm/khách hàng.
- Đơn bán/đơn tổng.
- Nhập kho/import/export.
- Trả hàng/đơn tổng trả.
- Phiếu thu/công nợ ngoài luồng.
- Cashbook/bankbook/fund ledger.
- Khuyến mại.
- Inventory check/rebuild.
- Báo cáo, print, system operations.
- Search generic và các alias cũ.
- Customer catalog mobile theo ownership.

`/api/import/excel/direct` dù đang bị vô hiệu vẫn yêu cầu quyền import; `/api/inventory/check` có policy hiển thị rõ tại route.

## 2.4. Hiệu năng và memory control

1. Report date/status filter được đẩy xuống MongoDB.
2. Product catalog cache có max entries.
3. Promotion/cache cũ được giới hạn và cleanup.
4. Import preview có concurrency limit, max queue và backpressure.
5. Parent process dọn file/session khi worker timeout hoặc bị kill.
6. Stale import sessions được recovery.
7. API monitor tiếp tục giới hạn số route/samples.
8. Tìm kiếm mobile escape regex.

## 2.5. Backup và phục hồi

1. Backup dùng gzip.
2. Ghi file nguyên tử qua temporary file + rename.
3. Tạo SHA-256 checksum.
4. Quyền file hạn chế.
5. Danh sách collection chuyển sang collection vật lý canonical, tránh alias trùng.
6. Bổ sung `users`, `stockTransactions`, `fundLedgers`, debt/fund documents và các collection quan trọng bị bỏ sót trước đây.
7. API verify backup kiểm checksum, giải nén, format, collection count và chống path traversal.
8. Không lộ đường dẫn server trong production.

## 2.6. Kiến trúc và maintainability

1. Loại bỏ 2/2 circular dependencies.
2. Tách import preview runner để phá vòng `excelImportService ↔ importExcelJob`.
3. Tách boundary return lifecycle để phá vòng return/delivery.
4. Thêm quality gate và syntax scan.
5. OpenAPI được sinh lại và đồng bộ 270 operations.
6. Thêm 64 test mới so với baseline thực thi, tập trung vào regression bảo mật và toàn vẹn dữ liệu.

---

# 3. KẾT QUẢ KIỂM THỬ PHÁ HOẠI VÀ HỒI QUY

## 3.1. Các case quan trọng đã khóa bằng test

| Case | Kết quả mong đợi |
|---|---|
| Confirm delivery trả 200 nhưng DB không đổi | Đã có test và đã sửa |
| NVGH A confirm đơn NVGH B | Bị từ chối |
| Client gửi expectedVersion cũ | Trả conflict |
| Retry create order sau restart | Idempotency Mongo chặn duplicate |
| Idempotency mắc processing do crash | Có thể thu hồi sau ngưỡng |
| Customer catalog sales không có staff code | Trả rỗng, không fallback toàn bộ |
| Delivery liệt kê full customer catalog | Bị chặn |
| Alias search/customer bỏ qua policy | Bị chặn |
| Legacy mobile route chạy song song | Tắt mặc định |
| Cookie write request từ origin lạ | Bị CSRF guard chặn |
| Token refresh dùng sai token type | Bị chặn |
| User bị khóa vẫn refresh | Bị chặn do reload DB |
| NoSQL operator/prototype payload | Bị input middleware chặn |
| Reset khi không có maintenance/flag | Bị chặn |
| Admin tự xóa/hạ quyền hoặc xóa admin cuối | Bị chặn |
| Backup checksum sai/path traversal | Verify thất bại |
| Reconciliation chạy chồng | Bị skip |
| Direct import endpoint không có role | Đã bổ sung role |

## 3.2. Kết quả quality gate

```text
Tests:                 359/359 pass
Syntax:                488 JavaScript files pass
OpenAPI:               270 operations, up to date
Circular dependencies: 0
npm audit:              0 known vulnerabilities
Production readiness:  PASS với cấu hình an toàn mẫu
Source coverage:        lines 35,91%; branches 52,14%; functions 28,22%
```

---

# 4. PHÂN TÍCH CHUYÊN SÂU CÁC ĐIỂM CÒN LỎNG LẺO

Không còn lỗi Critical đã tái hiện trong phạm vi source/test hiện tại. Tuy nhiên các rủi ro sau vẫn phải được xử lý trước khi bán rộng.

## M01 — Chưa có integration test với Mongo replica set thật

Bộ test hiện vẫn chứa nhiều static contract và mock. Chưa chứng minh đầy đủ:

- Transaction rollback thật.
- Unique index thật.
- Write conflict thật.
- Replica-set failover.
- Duplicate retry qua nhiều instance.
- Kill process giữa transaction.

**Mức độ:** Major  
**Khuyến nghị:** Testcontainers hoặc MongoDB staging replica set; chạy API integration qua Supertest.

## M02 — Coverage core vẫn thấp

Source coverage sau nâng cấp:

- Lines: 35,91%.
- Functions: 28,22%.
- Branches: 52,14%.

Coverage tăng rõ ở function nhưng vẫn chưa đủ cho phần mềm tài chính–tồn kho.

**Mục tiêu:** core domain/service ≥80% line coverage; toàn source ≥65%.

## M03 — Flexible schema còn tồn tại

`src/models/_flexModel.js` vẫn dùng:

```js
strict: false,
versionKey: false,
timestamps: false
```

Một số model đã được tăng kiểm soát riêng, nhưng phần lớn schema legacy vẫn cho phép field sai âm thầm.

**Rủi ro:** typo field, alias trùng, last-write-wins, dữ liệu khó migrate.

## M04 — Legacy financial collections chưa được loại bỏ hoàn toàn

Đã ngừng mobile sales ghi trực tiếp, nhưng vẫn còn:

- `journals`
- `cashbooks`
- `bankbooks`
- import cashbook cũ
- report/reconciliation tham chiếu legacy

Hiện chúng được xem như nguồn migration/reference, nhưng vẫn có một số API manual ghi vào cashbook.

**Rủi ro:** fund ledger và cashbook cho hai số khác nhau.

## M05 — Module lõi vẫn quá lớn

Các file còn lớn:

- `masterOrderLegacy.service.js`
- `excelImportService.js`
- `returnOrderService.js`
- `orderService.js`
- `delivery.engine.js`
- `reportService.js`
- `public/mobile/js/sales.js`

Không còn circular dependency, nhưng cognitive complexity và regression radius vẫn cao.

## M06 — CSP chưa thể bật strict hoàn toàn

Đã encode nhiều điểm render và chuyển token sang HttpOnly cookie, nhưng code frontend legacy vẫn dùng nhiều `innerHTML`, inline handler và print HTML.

**Khuyến nghị:** bật `Content-Security-Policy-Report-Only`, thu log violation, rồi loại inline handler trước khi enforce.

## M07 — Refresh token rotation/revocation chưa đạt mức enterprise

Đã tách token type/secret và reload user, nhưng chưa có:

- Persistent refresh-session family.
- One-time rotation.
- Reuse detection.
- Revoke theo thiết bị.
- Danh sách phiên đăng nhập.

## M08 — Backup ứng dụng vẫn tải nhiều dữ liệu vào RAM

Backup đã đầy đủ và có verify, nhưng chưa thay thế Atlas PITR/offsite backup. Với dữ liệu lớn, dump toàn bộ collection bằng ứng dụng sẽ tốn RAM.

## M09 — Import queue vẫn in-process

Đã có concurrency/backpressure, nhưng nhiều instance không chia sẻ queue và deploy sẽ mất job đang chờ.

**Khuyến nghị:** Mongo job queue hoặc BullMQ/Redis khi số khách tăng.

## M10 — Chưa có E2E, load, offline và restore drill

Còn thiếu:

- Playwright/Cypress.
- k6/Artillery.
- PWA offline command queue.
- Network interruption/retry test.
- Restore backup vào staging và chạy reconciliation.

## M11 — Chưa có tenant isolation

Không phải vấn đề với một NPP, nhưng là blocker nếu bán SaaS dùng chung database cho nhiều NPP.

---

# 5. PHƯƠNG ÁN TỐI ƯU HƠN TIẾP THEO

## Phương án A — Khuyến nghị production-grade

### Ledger V2 Command Pipeline + Transactional Outbox + Strict Aggregate Schema

Mọi thao tác ghi đi theo một pipeline duy nhất:

```text
Authentication
→ Permission + Ownership
→ Request schema validation
→ Command handler
→ State invariant
→ Mongo transaction
→ Aggregate update
→ Ledger entries
→ Audit log
→ Outbox event
→ Commit
→ Projection worker
```

### Các command bắt buộc

- `CreateSalesOrderCommand`
- `UpdateSalesOrderCommand`
- `CancelSalesOrderCommand`
- `ConfirmDeliveryCommand`
- `SaveDeliveryPaymentCommand`
- `CreateReturnCommand`
- `ReceiveReturnCommand`
- `ConfirmDeliveryAccountingCommand`
- `ConfirmReturnAccountingCommand`
- `SubmitDeliveryCashCommand`

### Lợi ích

- Không còn controller/service ghi model rải rác.
- Transaction và idempotency áp dụng đồng nhất.
- Dễ test invariant.
- Dễ truy vết bằng audit/outbox.
- Chuẩn bị tốt cho worker và tích hợp hóa đơn/kế toán.

### Nhược điểm

- Effort: Hard.
- Phải migration dần, không nên big-bang.
- Cần integration test DB thật trước khi thay write path tài chính.

## Phương án B — Cân bằng effort

1. Giữ modular monolith.
2. Viết integration test cho 10 flow tiền/tồn quan trọng.
3. Chuyển toàn bộ cashbook/bankbook write sang `fundLedgers`.
4. Chuyển AR read/cache sang `arLedgers` hoàn toàn.
5. Strict schema trước cho `SalesOrder`, `ReturnOrder`, `ArLedger`, `FundLedger`, `StockTransaction`.
6. Chia `excelImportService` và `masterOrderLegacy.service` theo use case.
7. CSP Report-Only và loại dần raw HTML.
8. Atlas PITR + restore drill.

**Khuyến nghị thực tế:** thực hiện Phương án B trước trong 6–10 tuần, sau đó tiến dần sang A.

---

# 6. LỘ TRÌNH NÂNG CẤP TIẾP THEO

## P0 — Trước khi deploy bản này

1. Tạo Atlas snapshot/PITR.
2. Deploy lên staging dùng bản sao dữ liệu đã ẩn danh.
3. Chạy `npm ci`.
4. Chạy `npm run quality`.
5. Chạy `npm run check:production` với biến production thật.
6. Chạy `npm run mongo:indexes`.
7. Chạy smoke test 12 luồng ở checklist triển khai.
8. Chạy reconciliation stock/AR/fund.
9. Xác minh backup mới bằng API verify.
10. Chỉ promote production khi mismatch bằng 0 hoặc được giải trình.

## P1 — 2–4 tuần

1. Mongo integration tests.
2. API tests bằng Supertest.
3. Refresh-session rotation.
4. CSP Report-Only.
5. Migrate manual cashbook/bankbook sang fund ledger.
6. Tăng coverage core lên 60% trước.

## P2 — 4–8 tuần

1. Strict schemas cho 5 aggregate chính.
2. Command handlers cho sales/delivery/return/accounting.
3. Transactional outbox.
4. Tách god services.
5. E2E browser/mobile.
6. Load/concurrency test.

## P3 — Trước khi bán SaaS

1. `tenantId` và tenant guard toàn hệ thống.
2. Tenant-scoped indexes.
3. Tenant-aware backup/export/audit.
4. Billing/license.
5. Central queue và observability.
6. SLA, incident runbook, restore drill định kỳ.

---

# 7. CHECKLIST TRIỂN KHAI AN TOÀN

## Environment bắt buộc

Dùng `.env.production.example` làm mẫu. Đặc biệt:

- Secret access/refresh khác nhau và đủ mạnh.
- `ACCESS_TOKEN_COOKIE_SECURE=true`.
- `REFRESH_TOKEN_COOKIE_SECURE=true`.
- `CORS_ALLOW_ALL=false`.
- `CORS_ORIGIN` đúng domain.
- `PUBLIC_APP_ORIGIN` đúng domain.
- `AUTO_RECONCILIATION_JOB=true`.
- `AUTO_BACKFILL_ARLEDGERS=false`.
- `ALLOW_SYSTEM_RESET=false`.
- `ALLOW_SYSTEM_DATA_EXPORT=false`.
- `ENABLE_LEGACY_MOBILE_ROUTES=false`.
- `BACKUP_DIR` nằm trên persistent volume hoặc dùng Atlas PITR.

## Smoke test sau deploy

1. Admin login/logout/refresh.
2. Sales chỉ thấy khách được gán.
3. Sales tạo đơn; tồn giảm đúng một lần.
4. Retry create order không tạo trùng.
5. NVGH A không mở/xác nhận đơn NVGH B.
6. NVGH xác nhận đơn; DB chuyển trạng thái thật.
7. Lưu hàng trả; return order và tồn khớp.
8. Thu tiền; chưa post AR/fund sai thời điểm.
9. Kế toán xác nhận; AR/fund ledger sinh đúng một lần.
10. Reconciliation stock/AR/fund không critical.
11. Backup + verify pass.
12. Health/readiness trả đúng trạng thái Mongo.

## Rollback

1. Không bật legacy mobile để rollback nghiệp vụ.
2. Rollback ứng dụng về image/release trước.
3. Không restore DB trừ khi có bằng chứng migration/write sai.
4. Nếu cần restore, restore vào staging trước và chạy reconciliation.
5. Lưu audit log, timestamp và mã đơn bị ảnh hưởng.

---

# 8. ĐỊNH GIÁ THƯƠNG MẠI SAU NÂNG CẤP

Đây là ước lượng kỹ thuật, không phải chứng thư thẩm định giá tài chính.

| Hình thức | Trước nâng cấp | Sau nâng cấp đề xuất |
|---|---:|---:|
| Source không độc quyền, as-is | 180–320 triệu | **280–450 triệu** |
| Source + deploy + 1–2 tháng hỗ trợ | 280–450 triệu | **400–650 triệu** |
| Chuyển giao độc quyền IP | 500–900 triệu | **700 triệu–1,3 tỷ** |
| Setup cho một NPP tương tự | 60–120 triệu | **80–180 triệu** |
| Phí duy trì/NPP/tháng | 3–7 triệu | **5–12 triệu** |

Mức giá cao hơn chỉ hợp lý khi có:

- Staging/integration/load test.
- SLA và đội support.
- Tài liệu onboarding.
- Ít nhất 2–3 khách hàng trả phí.
- Restore drill và monitoring production.

---

# 9. KẾT LUẬN CUỐI

Bản nâng cấp đã chuyển MK-Pro từ trạng thái “nhiều tính năng nhưng còn một số đường ghi và quyền nguy hiểm” sang trạng thái **modular monolith nội bộ khá vững**, phù hợp hơn cho NPP 12 NVBH + 4 NVGH.

Những cải thiện có tác động lớn nhất:

1. Không còn confirm giao hàng thành công giả ở route modular.
2. Có ownership/version/idempotency cho các write path quan trọng.
3. Browser token không còn lưu trong localStorage.
4. RBAC và dữ liệu theo tuyến được siết mạnh.
5. Không còn circular dependency.
6. Reconciliation tự động và production gate đã có.
7. Backup đầy đủ hơn, có checksum và verify.
8. Legacy mobile bị tắt mặc định.
9. 359/359 test pass.

Điểm nghẽn tiếp theo không phải thêm nhiều chức năng. Ưu tiên tối ưu tiếp phải là:

```text
Mongo integration tests
→ hợp nhất fund/AR ledger
→ strict core schemas
→ command pipeline + outbox
→ E2E/load/restore
→ tenant architecture khi thương mại hóa
```

