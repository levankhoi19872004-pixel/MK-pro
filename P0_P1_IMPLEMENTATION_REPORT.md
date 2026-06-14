# BÁO CÁO TRIỂN KHAI P0–P1

**Nguồn:** `MK-pro-phase37-master-return-list-layout-fix-patched(3).zip`  
**Phạm vi:** Toàn bộ kế hoạch P0 và P1 về transaction, integrity, index, master data, staff identity, mobile, quỹ, phân trang, tồn kho và báo cáo.

## 1. Kết quả tổng hợp

| Chỉ tiêu | Kết quả |
|---|---:|
| Hạng mục hoàn thành | P0.0–P0.6 và P1.1–P1.8 |
| File thay đổi/thêm | 63 |
| Dòng thêm | 2.873 |
| Dòng loại bỏ | 853 |
| JavaScript syntax check | 595/595 hợp lệ |
| Regression test | 442/442 pass |
| OpenAPI | 247 operations, up to date |
| Production dependency audit | 0 vulnerability |
| Git working tree | Clean |

> Các thao tác cần kết nối MongoDB Atlas thật như snapshot, audit dữ liệu, migration, tạo index và reconciliation **chưa được chạy trong môi trường sandbox** vì không có `MONGO_URI` production. Mã nguồn và script đã được chuẩn bị đầy đủ để chạy có kiểm soát trên staging/production.

---

## 2. P0 — Toàn vẹn dữ liệu

### P0.0 — Baseline và cổng kiểm thử

- Cài dependency bằng `npm ci` theo lockfile.
- Baseline ban đầu: 400/400 test pass.
- Kiểm tra cú pháp toàn bộ source.
- Khởi tạo lịch sử Git cục bộ để cô lập từng thay đổi.

### P0.1 — Import đơn bán và tồn kho atomic

**File chính:**

- `src/services/excelImportService.js`
- `src/services/import/importTransaction.service.js`
- `src/utils/transaction.util.js`

**Kết quả:**

- Import đơn bán chạy theo chunk transaction.
- Đơn được insert với `stockPosted=false`.
- `InventoryPostingService.postSaleOut()` chạy cùng Mongo session.
- Chỉ đặt `stockPosted=true` sau khi posting tồn thành công.
- Chunk lỗi rollback toàn bộ đơn và stock movement của chunk.
- Không còn dùng đường `applyInventoryMovementsBulk()` không atomic cho import sales.

### P0.2 — Import thu công nợ atomic

**File chính:**

- `src/services/financialService.js`
- `src/services/excelImportService.js`

**Kết quả:**

Một dòng import thu nợ được xử lý trong cùng transaction:

```text
Receipt
+ AR-RECEIPT
+ Cashbook/Bankbook projection
+ FundLedger
```

- Hỗ trợ session do use case cha truyền xuống.
- Có `importIdempotencyKey` để chống retry trùng.
- Không còn tình trạng chỉ tạo Receipt nhưng không post AR/Fund.

### P0.3 — Nhận đơn tổng trả hàng atomic

**File chính:**

- `src/services/masterReturnOrderService.js`
- `src/services/returnOrderLegacy.service.js`
- `src/repositories/returnOrderRepository.js`
- `src/repositories/masterReturnOrderRepository.js`

**Kết quả:**

- Master return sở hữu một transaction duy nhất.
- Toàn bộ child return, posting tồn và cập nhật master commit/rollback cùng nhau.
- Một child lỗi sẽ rollback tất cả child trước đó.
- Repository hỗ trợ session khi đọc và ghi.

### P0.4 — Chống gộp đồng thời

**File chính:**

- `src/services/master-order/masterOrderLegacy.service.js`
- `src/services/masterReturnOrderService.js`

**Kết quả:**

- Child được claim bằng điều kiện atomic:
  - chưa có master ID;
  - chưa ở trạng thái merged;
  - chưa bị hủy/xóa.
- Kiểm tra `matchedCount` sau claim.
- Request thua race nhận HTTP 409.
- Transaction rollback master mồ côi và các child đã claim một phần.

### P0.5 — Khóa rebuild tồn kho phá hủy

**File chính:**

- `src/utils/inventoryMaintenance.util.js`
- `src/middlewares/inventoryMaintenance.middleware.js`
- `src/controllers/reportController.js`
- `src/services/inventoryService.js`
- `src/routes/index.js`

**Điều kiện bắt buộc để chạy thao tác phá hủy:**

```env
ENABLE_DESTRUCTIVE_INVENTORY_REBUILD=true
SYSTEM_MAINTENANCE_MODE=inventory
```

Và request phải có:

```json
{
  "confirmation": "CONFIRM_REBUILD_INVENTORY"
}
```

- `resetTransactions` mặc định là false.
- Guard tồn tại ở cả controller và service.
- Các command làm thay đổi tồn bị chặn trong maintenance mode.

### P0.6 — Cổng hoàn thành P0

- P0 hoàn thành mà không phát sinh regression.
- Các test rollback, idempotency, concurrency và rebuild guard đã được bổ sung.

---

## 3. P1 — Chuẩn hóa và hiệu năng

### P1.1 — Duplicate audit và unique indexes

**File chính:**

- `scripts/audit-duplicate-business-keys.js`
- `scripts/migrate-duplicate-business-keys.js`
- `scripts/drop-replaced-nonunique-indexes.js`
- `src/services/mongoIndexService.js`

**Kết quả:**

- Audit mở rộng sang Product, Customer, User, Master Return, Receipt và chứng từ quỹ.
- Không tự đổi business code của Product/Customer/User.
- Bổ sung partial unique index cho business key quan trọng.
- Bổ sung unique index cho `Receipt.importIdempotencyKey`.
- So sánh index có xét `partialFilterExpression`.

### P1.2 — Không hard delete master data

**File chính:**

- `src/services/customerService.js`
- `src/repositories/customerRepository.js`
- `src/controllers/customerController.js`
- `src/services/userService.js`
- `src/repositories/userRepository.js`
- `src/controllers/userController.js`

**Kết quả:**

Customer/User được chuyển sang:

```text
isActive=false
+ deactivatedAt
+ deactivatedBy
+ deactivationReason
```

- Giữ nguyên lịch sử đơn, AR, audit.
- Giữ guard không tự vô hiệu hóa tài khoản và không mất admin cuối cùng.

### P1.3 — Canonical NVBH/NVGH

**File chính:**

- `src/utils/canonicalStaffWrite.util.js`
- `scripts/migrate-canonical-staff-identity.js`
- Các repository nghiệp vụ và đường ghi Excel/mobile.

**Chuẩn ghi mới:**

```text
NVBH: salesStaffCode / salesStaffName
NVGH: deliveryStaffCode / deliveryStaffName
```

- Alias cũ chỉ còn ở read compatibility/migration.
- Document ghi mới được loại bỏ alias nghiệp vụ cũ.
- Migration hỗ trợ dry-run và write mode.

### P1.4 — Mobile delivery scoped query

**File chính:**

- `src/repositories/mobile/delivery.repository.js`
- `src/services/mobile/delivery.service.js`

**Kết quả:**

- Không còn dùng `getPrimaryDataSnapshot()` trong danh sách giao hàng.
- Chỉ query master/order/AR/return thuộc ngày và NVGH hiện tại.
- Ownership được kiểm tra lại trước khi trả response.
- Không tải toàn bộ Product, Customer, Orders và ledgers vào RAM.

### P1.5 — FundLedger là nguồn quỹ chuẩn

**File chính:**

- `src/services/fundService.js`
- `src/services/reportLegacy.service.js`
- `src/repositories/fundLedgerRepository.js`

**Kết quả:**

- Số dư tiền mặt/ngân hàng lấy từ `FundLedger`.
- Receipt/Cashbook/Bankbook chỉ là chứng từ chi tiết/projection.
- `listFundLedgers()` dùng `$facet` để:
  - phân trang;
  - đếm tổng;
  - tính summary trên toàn bộ filter.

### P1.6 — Filter trước pagination

**File chính:**

- `src/services/orderLegacy.service.js`

**Kết quả:**

- Source, status, merge, delivery, accounting, NVBH và NVGH được đưa xuống Mongo trước `skip/limit`.
- Không còn scan 5.000–10.000 đơn rồi lọc NVBH trong JavaScript.
- `rows`, `total` và `hasMore` dùng chung filter.

### P1.7 — Shadow rebuild tồn kho

**File chính:**

- `src/domain/reconciliation/InventoryRebuildService.js`
- `src/services/inventoryService.js`

**Quy trình mới:**

```text
StockTransaction
→ aggregate vào shadow collection
→ validate
→ clone indexes
→ rename current thành backup
→ rename shadow thành current
→ restore backup nếu swap lỗi
```

Validation gồm:

- thiếu `productCode`;
- duplicate `productCode + warehouseCode`;
- tổng quantity shadow so với transaction;
- danh sách tồn âm;
- row count và idempotency duplicate.

Không còn xóa `inventories` hoặc `stockTransactions` trước khi dựng dữ liệu thay thế.

### P1.8 — Báo cáo và error handling

**File chính:**

- `src/services/reportLegacy.service.js`
- `src/controllers/reportController.js`
- `src/utils/queryGuard.util.js`
- `src/services/importExportLegacy.service.js`

**Kết quả:**

- Sales, Delivery, Finance, Stock, Stock Card có pagination contract:

```json
{
  "items": [],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 0,
    "totalPages": 0,
    "hasMore": false
  },
  "summary": {}
}
```

- Sales/Delivery dùng `$facet` để tính rows và totals trong cùng pipeline.
- Dashboard chỉ dùng summary aggregation, không gọi full list reports.
- Dashboard mặc định ngày hiện tại.
- Báo cáo vận hành giới hạn tối đa 31 ngày/request.
- Export tồn kho chủ động dùng full mode, không bị pagination API cắt dữ liệu.
- Lỗi data source trả `REPORT_DATA_SOURCE_FAILED`, status 503; không còn `.catch(() => [])` trong report service.

---

## 4. Commit triển khai

```text
2ec69bf fix(import): make sales order and stock posting atomic
9159a2e fix(debt-import): post receipt ar and fund atomically
37bb48a fix(return): receive master return in one transaction
f631b9d fix(master): atomically claim child orders
3a6e351 security(inventory): disable destructive rebuild by default
5827719 fix(master): support driver matched count variants
639aeaf data(index): extend duplicate audit and unique index plan
3ea47f5 data(master): replace hard delete with deactivate
ca1ca9d data(staff): migrate and enforce canonical staff identities
89b020e perf(mobile): replace delivery snapshot with scoped queries
5989eac report(fund): use fund ledger source and full-filter summary
4be66de perf(order): push filters before pagination
97eb4ec data(inventory): rebuild through validated shadow collections
b18461f perf(report): paginate operational reports and surface data errors
```

---

## 5. Lệnh kiểm tra đã chạy

```bash
npm ci
npm run check:syntax
npm test
npm run docs:check
npm audit --omit=dev --audit-level=high
```

Kết quả cuối:

```text
SYNTAX_OK 595 JavaScript files
442 tests passed
OpenAPI up to date — 247 operations
0 production dependency vulnerabilities
```

`check:production` đã được kiểm tra bằng bộ ENV hợp lệ và trả:

```text
PRODUCTION_READINESS_OK
```

Khi chạy không có ENV production, script chủ động thất bại vì thiếu JWT secrets và Mongo URI. Đây là hành vi đúng.

---

## 6. Quy trình triển khai staging/production bắt buộc

### Bước 1 — Backup

- Tạo Atlas snapshot/PITR restore point.
- Ghi lại timestamp và cluster.
- Không triển khai vào giờ import/bán hàng cao điểm.

### Bước 2 — Cấu hình production

Tối thiểu:

```env
NODE_ENV=production
MONGO_URI=mongodb+srv://...
JWT_SECRET=<random-min-32-chars>
JWT_REFRESH_SECRET=<different-random-min-32-chars>
PUBLIC_APP_ORIGIN=https://your-domain
CORS_ORIGIN=https://your-domain
TRUST_PROXY=1
BACKUP_DIR=/persistent-volume/backups
AUTO_RECONCILIATION_JOB=true
```

Kiểm tra:

```bash
npm run check:production
```

### Bước 3 — Audit duplicate, chưa ghi dữ liệu

```bash
npm run audit:duplicate-keys
npm run migrate:duplicate-keys:dry
```

Điều kiện trước khi tạo unique index:

```text
TOTAL_DUPLICATE_KEYS=0
```

Product/Customer/User duplicate phải được review theo domain, không tự đổi code.

### Bước 4 — Staff identity dry-run

```bash
npm run migrate:staff-identity:dry
```

Kiểm tra số document sẽ thay đổi theo từng collection. Sau khi đối chiếu:

```bash
npm run migrate:staff-identity
```

### Bước 5 — Xử lý duplicate được phê duyệt

Chỉ với các collection/chứng từ được phép tự sửa:

```bash
npm run migrate:duplicate-keys
npm run audit:duplicate-keys
```

### Bước 6 — Thay index cũ và tạo unique index

```bash
npm run drop:old-indexes:dry
npm run drop:old-indexes
npm run mongo:indexes
```

Kiểm tra log không còn index conflict.

### Bước 7 — Reconciliation trước rebuild

```bash
npm run reconcile:stock
npm run reconcile:ar
npm run reconcile:fund
```

Lưu toàn bộ output làm baseline.

### Bước 8 — Shadow rebuild tồn kho trong maintenance window

Bật tạm:

```env
ENABLE_DESTRUCTIVE_INVENTORY_REBUILD=true
SYSTEM_MAINTENANCE_MODE=inventory
```

Gọi endpoint admin:

```http
POST /api/reports/inventory/rebuild
Content-Type: application/json

{
  "confirmation": "CONFIRM_REBUILD_INVENTORY",
  "resetTransactions": false
}
```

Chỉ đặt `resetTransactions=true` nếu đã xác nhận cần tái tạo toàn bộ stock transaction và đã có snapshot.

Sau khi hoàn tất:

```env
ENABLE_DESTRUCTIVE_INVENTORY_REBUILD=false
SYSTEM_MAINTENANCE_MODE=
```

### Bước 9 — Reconciliation sau triển khai

```bash
npm run reconcile:stock
npm run reconcile:ar
npm run reconcile:fund
npm test
```

So sánh với baseline:

- Không có stock movement mồ côi.
- Không có order `stockPosted=true` thiếu movement.
- Receipt posted có AR và FundLedger.
- Không child active thuộc hai master.
- Không master return nhận một phần.

### Bước 10 — Theo dõi sau deploy

Theo dõi tối thiểu:

- HTTP 409 `CHILD_ORDER_ALREADY_CLAIMED`.
- HTTP 503 `REPORT_DATA_SOURCE_FAILED`.
- Import chunk failure và shortage report.
- Mongo transaction abort rate.
- P95/P99:
  - mobile delivery list;
  - sales order list;
  - reports sales/delivery/fund;
  - Excel import commit.

---

## 7. Điểm không thể thực hiện từ sandbox

Các việc sau cần quyền truy cập hạ tầng của chủ hệ thống:

1. Tạo Atlas snapshot/PITR restore point.
2. Chạy audit duplicate trên dữ liệu thật.
3. Chạy migration staff identity trên dữ liệu thật.
4. Xử lý duplicate business key thực tế.
5. Tạo/drop index trên Atlas.
6. Chạy reconciliation trên production/staging.
7. Chạy shadow rebuild và atomic rename collection thật.
8. Đo P95/P99 bằng traffic thật.

Không có kết quả nào trong các mục trên được giả lập hoặc tuyên bố đã chạy.
