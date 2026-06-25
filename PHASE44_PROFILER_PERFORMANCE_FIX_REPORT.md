# PHASE44 - MongoDB/API Profiler Performance Fix Report

Baseline: `MK-pro-phase43-delivery-all-filter-include-delivered-fix-patched(1).zip`  
Mục tiêu: xử lý các điểm chậm trong log profiler/API mà không đổi business rule, không đổi API contract và không dùng cache che query chậm.

## 1. Tổng quan dự án

- Tech stack: Node.js + Express + Mongoose/MongoDB, frontend JavaScript thuần cho web/mobile.
- Cấu trúc chính:
  - `src/services/*`: business service, index service, master-order/delivery/fund logic.
  - `src/repositories/*`: lớp truy cập MongoDB.
  - `public/mobile/js/*`: app giao hàng mobile.
  - `public/js/delivery/*`: delivery core dùng chung.
  - `scripts/*`: migration/audit/index/test/build tools.
- Các collection/model được rà soát theo log: `SalesOrder`, `StockTransaction`, `ReturnOrder`, `FundLedger`, `ArLedger`, `Product`, `ImportSession`, `DmsInventorySnapshot`, `PromotionProductRule`.

## 2. Root cause chính từ profiler

| Nhóm | Bằng chứng profiler | Root cause | Mức ưu tiên |
|---|---|---|---|
| SalesOrder theo `id`/`$in` | 200-800ms cho `findOne`/`find $in` | cần index đúng field + giảm payload khi hydrate đơn con | P0 |
| StockTransaction `idempotencyKey` | reversal/delete order chậm | index unique có rủi ro nếu duplicate; cần ensure production-safe | P0 |
| Delivery mobile gọi `/api/delivery/orders` nhiều | 249 request | reload lặp / không coalesce in-flight / submit lặp | P0 |
| ReturnOrder theo `id` | `findOneAndUpdate` ~209ms | cần index theo id/order/date/staff | P1 |
| FundLedger.find `{}` | nhiều API quỹ/công nợ | sinh mã sổ quỹ đang quét toàn bộ | P1 |
| Product search/stock | `$in`, regex contains/i | broad regex scan; cần exact/prefix trước | P1 |
| Import/DMS | `sessionId`, `importId` | cần index riêng phù hợp query | P1 |

## 3. File đã thêm/sửa

| File | Nội dung thay đổi |
|---|---|
| `src/services/mongoIndexService.js` | Thêm duplicate-audit trước khi tạo unique index; thêm nhóm managed index cho SalesOrder delivery/master, Product active lookup, FundLedger source/ref/date, DMS snapshot importId. |
| `src/repositories/searchRepository.js` | Tối ưu product search: exact/prefix indexed lookup trước, giảm fallback broad regex scan. |
| `src/repositories/fundLedgerRepository.js` | Bổ sung helper tìm mã mới nhất theo prefix bằng query có sort/limit. |
| `src/services/fundService.source/part-01.jsfrag` | Sửa sinh mã `FundLedger`: bỏ `findAll()` quét toàn bộ, dùng query code prefix + sort/limit. |
| `src/services/fundService.js` | File generated được refresh từ source fragment. |
| `src/services/master-order/masterOrderQuery.impl.js` | Thêm projection khi hydrate child SalesOrder của đơn tổng để giảm payload `$in`. |
| `public/js/delivery/delivery-core.js` | Coalesce request `/api/delivery/orders` đang in-flight theo cùng bộ lọc; đây không phải cache stale, chỉ dùng lại promise đang chạy. |
| `public/mobile/js/delivery-state.js` | Thêm trạng thái submit guard cho return/full return/delivery. |
| `public/mobile/js/delivery-mobile-view.source.js` | Chặn double submit; sau payment/confirm/return cập nhật local state thay vì force reload danh sách nhiều lần. |
| `public/mobile/js/delivery-mobile-view.js`, `.map`, `config/source-bundles.json` | Bundle/hash được refresh bằng `npm run source-bundles:refresh`. |

## 4. Index đã bổ sung hoặc làm an toàn hơn

### SalesOrder

- `{ deliveryDate: 1, deliveryStaffCode: 1, status: 1, deliveryStatus: 1, masterOrderId: 1 }`
- `{ deliveryDate: 1, deliveryStaffCode: 1, status: 1, deliveryStatus: 1, masterOrderCode: 1 }`

Lý do: phục vụ `/api/delivery/orders`, filter ngày/NVGH/trạng thái/đơn tổng.

### Product

- `{ isActive: 1, productCode: 1 }`
- `{ isActive: 1, sku: 1 }`
- `{ isActive: 1, barcode: 1 }`

Lý do: product lookup/search ưu tiên exact/prefix thay vì broad regex.

### FundLedger

- `{ sourceType: 1, sourceId: 1, fundType: 1, direction: 1 }`
- `{ refType: 1, refId: 1 }`
- `{ referenceType: 1, referenceId: 1 }`
- `{ date: 1, status: 1, isDeleted: 1, deletedAt: 1 }`

Lý do: idempotency guard, ref lookup, dashboard quỹ ngày.

### DmsInventorySnapshot

- `{ importId: 1 }`

Lý do: `/api/dms-inventory/latest`, preview/commit theo import.

### Unique index safety

`mongoIndexService` hiện kiểm tra duplicate trước khi tạo unique index. Nếu phát hiện duplicate, script sẽ skip index đó và log warning thay vì làm fail deploy/runtime. Đây là thay đổi quan trọng cho production vì các index như `StockTransaction.idempotencyKey`, `SalesOrder.id`, `ReturnOrder.id` có thể fail nếu DB cũ đã có dữ liệu trùng.

## 5. Query trước/sau tiêu biểu

### FundLedger code generation

Trước:

```js
const all = await fundLedgerRepository.findAll();
```

Sau:

```js
const latest = await fundLedgerRepository.findAll(
  { code: { $regex: '^FL\\d+$' } },
  { projection: 'code', sort: { code: -1 }, limit: 1 }
);
```

Tác dụng: tránh đọc toàn bộ `FundLedger` chỉ để lấy mã mới.

### Product search

Trước: broad `$regex` contains/i trên nhiều field.  
Sau: exact/prefix lookup theo `code`, `sku`, `productCode`, `barcode` trước; chỉ fallback broad regex khi chưa đủ kết quả.

### Delivery orders

Trước: cùng bộ lọc có thể tạo nhiều request song song.  
Sau: request cùng `date/status/staff` đang chạy được coalesce bằng promise in-flight; sau khi xong thì xoá promise, không giữ cache stale.

## 6. Kiểm thử đã chạy

### Pass

```bash
node --check src/services/mongoIndexService.js \
  src/repositories/fundLedgerRepository.js \
  src/repositories/searchRepository.js \
  src/services/master-order/masterOrderQuery.impl.js \
  src/services/fundService.js \
  public/js/delivery/delivery-core.js \
  public/mobile/js/delivery-state.js \
  public/mobile/js/delivery-mobile-view.source.js \
  public/mobile/js/delivery-mobile-view.js
```

```bash
npm run source-bundles:refresh
```

```bash
node --test test/fund-ledger-idempotency.test.js test/fund-delivery-shortage-repayment.test.js
```

Kết quả targeted fund tests: 8/8 pass.

### Full test suite

Đã chạy:

```bash
npm test
```

Kết quả: full suite chưa pass. Các lỗi chính ghi nhận:

- Một số static test đang kỳ vọng flow mobile cũ vẫn force reload hoặc chuyển sang reconciliation ngay sau payment; patch này cố ý giảm reload theo yêu cầu profiler.
- `managed index policy is reduced...` fail vì số lượng managed index tăng từ baseline test cũ.
- Source size budget vượt nhẹ sau patch mobile:
  - `public/mobile/js/delivery-mobile-view.js`: 61,486 bytes > 61,440 bytes.
  - `public/mobile/js/delivery-mobile-view.source.js`: 79,222 bytes > 77,824 bytes.
- Một số lỗi khác xuất hiện ở static docs/OpenAPI/master-return/mobile-debt/dashboard contract; không được sửa trong phạm vi performance patch này để tránh đổi business rule ngoài yêu cầu.

## 7. Hướng dẫn chạy index trên Render/MongoDB Atlas

### Cách khuyến nghị trên Render Shell

```bash
npm ci --omit=optional
npm run mongo:indexes
```

Hoặc chạy trực tiếp:

```bash
node scripts/ensure-mongo-indexes.js
```

Yêu cầu biến môi trường:

```bash
MONGODB_URI=<connection-string-production>
```

### Kiểm tra duplicate trước/sau

Nếu log báo skip unique index do duplicate, chạy:

```bash
npm run audit:duplicate-keys
npm run migrate:duplicate-keys:dry
```

Chỉ khi báo cáo hợp lệ mới chạy bản ghi thật:

```bash
npm run migrate:duplicate-keys
npm run mongo:indexes
```

### Rollback index nếu cần

Dùng MongoDB Atlas UI hoặc shell để drop đúng tên index mới, ví dụ:

```js
db.salesorders.dropIndex('idx_orders_delivery_staff_master_id_perf')
db.salesorders.dropIndex('idx_orders_delivery_staff_master_code_perf')
db.dmsinventorysnapshots.dropIndex('idx_dms_snapshot_import_id')
```

## 8. Rủi ro còn lại

1. Chưa có DB production trong sandbox nên chưa chạy được `explain('executionStats')` thực tế trên MongoDB Atlas.
2. Full test suite chưa pass vì một số static test đang khóa hành vi cũ hoặc khóa số lượng index cũ.
3. Product search vẫn còn fallback regex để giữ API contract/kết quả tìm kiếm; muốn tối ưu triệt để cần chuẩn hóa thêm field search normalized hoặc text index có migration riêng.
4. Dashboard aggregate chỉ được hỗ trợ index thêm, chưa rewrite pipeline để tránh đổi logic báo cáo.
5. Mobile source size vượt budget; cần phase nhỏ riêng để refactor/rút gọn source nếu muốn full quality gate pass.

## 9. Đề xuất bước tiếp theo

### Phương án A - Production-grade

- Chạy patch này trên staging/Render với DB thật.
- Chạy `npm run mongo:indexes`.
- Dùng profiler hoặc `explain('executionStats')` đo lại các query P0: `SalesOrder.id/$in`, `StockTransaction.idempotencyKey`, `/api/delivery/orders`, `ReturnOrder.id`.
- Sau đó mở phase riêng để cập nhật static tests theo flow mới và xử lý source-size budget.

Effort: Medium.  
Rủi ro: thấp nếu index script không báo duplicate nghiêm trọng.

### Phương án B - Cân bằng effort

- Merge phần index + FundLedger query trước.
- Nếu muốn cực an toàn cho UI, có thể tách phần mobile reload optimization ra phase sau.
- Chạy lại profiler 1 ngày vận hành thực tế rồi mới tối ưu dashboard/product sâu hơn.

Effort: Easy-Medium.  
Rủi ro: tốc độ app giao hàng có thể chưa giảm tối đa nếu chưa merge mobile coalescing/local update.
