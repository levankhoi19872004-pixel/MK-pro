# AR-RETURN Idempotency Guard / Migration-safe Unique Index

## A. Báo cáo hiện trạng

### Tổng quan dự án
- Tech stack: Node.js/Express monolith, MongoDB/Mongoose flex models, Render Web Service.
- AR ledger source-of-truth: collection `arLedgers`, model `src/models/ArLedger.js`.
- AR-RETURN write path hiện tại đã được gom về `src/services/accounting/returnArPostingService.js`, được gọi qua wrapper `src/engines/posting.engine.js`.

### Audit luồng tạo AR-RETURN

| File | Hàm/điểm gọi | Có tạo AR-RETURN không | Có idempotency không | Rủi ro duplicate trước patch |
|---|---|---:|---:|---|
| `src/services/accounting/returnArPostingService.js` | `buildReturnARLedgerEntry` + `postReturnOrderToAR` | Có, đây là write path chính | Có `idempotencyKey` | Nếu DB có nhiều active row cùng key/source, logic cũ có thể chọn dòng đầu tiên khi tổng tiền khớp |
| `src/engines/posting.engine.js` | `postReturnOrderAR` | Không ghi trực tiếp, chỉ wrapper sang service | Kế thừa service | Thấp sau phase54, vẫn là entrypoint legacy |
| `src/domain/posting/ArPostingService.js` | `postReturnOrderAR` | Không ghi trực tiếp, gọi posting engine | Kế thừa service | Thấp |
| `src/services/master-order/deliveryAccountingCore.impl.js` | `ensureArReturnForConfirmedReturnOrder`, `postDeliveryCollectionsAfterAccountingConfirmed` | Có gọi wrapper để post | Kế thừa service | Trung bình nếu dữ liệu cũ đã duplicate |
| `src/services/returnOrderLegacy.service.js` | confirm return legacy | Có gọi wrapper để post | Kế thừa service | Trung bình nếu gọi lại cùng chứng từ |
| `scripts/reconcile-return-ar.js` | `--fix` missing AR-RETURN | Có gọi service | Kế thừa service | Đã bổ sung audit idempotency totals |
| `scripts/backfill-ar-return-from-return-orders.js` | manual backfill | Có gọi wrapper | Kế thừa service | Được chặn bởi service mới |
| `scripts/repair-delivery-accounting-ar-ledgers.js` | repair missing AR-RETURN | Có gọi wrapper | Kế thừa service | Được chặn bởi service mới |
| `scripts/rebuild-ar-ledger.js` | rebuild AR ledger | Có gọi wrapper | Kế thừa service | Được chặn bởi service mới |

### Index hiện trạng trước patch
- `arLedgers` đã có các index liên quan AR lookup như `id`, `code`, `returnOrderCode/type/status`, `refType/refId`, `refCode/type`.
- Có index `idempotencyKey` cũ dạng non-unique/partial, nhưng chưa enforce unique DB-level.
- Chưa tự bật unique index để tránh deploy fail khi dữ liệu thật còn duplicate.

## B. File đã sửa/tạo mới

### Sửa
- `src/models/ArLedger.js`
  - Bổ sung metadata schema cho `accountingBatchId`, `reversed`, `isDeleted`, `deletedAt` để audit/guard rõ ràng hơn.
- `src/services/mongoIndexService.js`
  - Thêm tầng 1 non-unique deploy-safe:
    - `idx_arledger_idempotencyKey` trên `{ idempotencyKey: 1 }`
    - `idx_ar_return_source_lookup` trên `{ type: 1, sourceType: 1, sourceId: 1 }`
  - Không thêm unique index vào auto-deploy.
- `src/services/accounting/returnArPostingService.js`
  - `idempotencyKey` ổn định theo returnOrder key, không phụ thuộc `accountingBatchId`/`forceRepostReturn`.
  - Tra active AR-RETURN theo `idempotencyKey` trước khi insert.
  - Nếu có đúng 1 active ledger cùng key: trả existing, không tạo mới.
  - Nếu có nhiều active ledger cùng key/source: throw lỗi `P0_AR_RETURN_DUPLICATE`, không tự chọn bừa.
  - Mọi AR-RETURN mới đều bắt buộc có `idempotencyKey`, `sourceType`, `sourceId`, `sourceCode`, `returnOrderId`, `returnOrderCode`.
- `scripts/reconcile-return-ar.js`
  - Bổ sung `idempotencyAudit` totals vào output reconcile.
- `package.json`
  - Thêm script audit và tạo unique index an toàn.

### Tạo mới
- `scripts/lib/arReturnIdempotencyAudit.js`
  - Pure audit library dùng chung cho audit script, create unique script, test.
- `scripts/audit-ar-return-idempotency.js`
  - Audit duplicate/missing metadata, không sửa dữ liệu.
- `scripts/create-ar-return-unique-index.js`
  - Chạy audit trước; chỉ tạo unique index khi dữ liệu sạch và có `--apply`.
- `test/ar-return-idempotency-service.test.js`
- `test/ar-return-idempotency-audit.test.js`
- `test/ar-return-idempotency-db-guard-static.test.js`

## C. Lệnh chạy audit

```bash
npm run audit:ar-return-idempotency
npm run audit:ar-return-idempotency:json
```

Hoặc chạy trực tiếp:

```bash
node scripts/audit-ar-return-idempotency.js --dry-run
node scripts/audit-ar-return-idempotency.js --json
```

Audit kiểm tra:
- Tổng AR-RETURN.
- Tổng AR-RETURN active.
- AR-RETURN thiếu `idempotencyKey`.
- Duplicate theo `idempotencyKey`.
- Duplicate theo `sourceType + sourceId`.
- Duplicate theo `returnOrderCode`.
- AR-RETURN thiếu `sourceId/sourceCode`.
- `sourceType` không canonical.
- Duplicate global `idempotencyKey` trên toàn `arLedgers` để tránh create unique index fail.

## D. Lệnh tạo index an toàn

### Tầng 1 — non-unique index deploy ngay
Được chạy qua existing index service:

```bash
npm run mongo:indexes
```

Index được quản lý trong `mongoIndexService`:

```js
db.arLedgers.createIndex({ idempotencyKey: 1 }, { name: 'idx_arledger_idempotencyKey' })
db.arLedgers.createIndex({ type: 1, sourceType: 1, sourceId: 1 }, { name: 'idx_ar_return_source_lookup' })
```

### Tầng 2 — unique index chỉ khi audit sạch
Dry-run trước:

```bash
npm run mongo:ar-return-unique-index:dry
```

Tạo thật sau khi sạch:

```bash
npm run mongo:ar-return-unique-index
```

Script sẽ tạo:

```js
db.arLedgers.createIndex(
  { idempotencyKey: 1 },
  {
    unique: true,
    name: 'uniq_arledger_idempotencyKey',
    partialFilterExpression: {
      idempotencyKey: { $exists: true, $type: 'string' }
    }
  }
)
```

Nếu audit còn duplicate/thiếu key/source thì script dừng với exit code khác 0, không sửa/xóa dữ liệu.

## E. Test evidence

Đã chạy trong sandbox:

```bash
node scripts/check-js-syntax.js
# SYNTAX_OK 1014 JavaScript files
```

```bash
node --test \
  test/ar-return-idempotency-service.test.js \
  test/ar-return-idempotency-audit.test.js \
  test/ar-return-idempotency-db-guard-static.test.js \
  test/ar-return-debt-scoped-static.test.js \
  test/phase52-ar-return-ensure-static.test.js \
  test/posting-engine-export-runtime-static.test.js \
  test/ar-return-reaccounting-idempotency-static.test.js

# tests 20
# pass 20
# fail 0
```

Các case mới bao phủ:
- Post cùng returnOrder 2 lần chỉ tạo 1 AR-RETURN.
- Nếu có 2 active ledger cùng `idempotencyKey`, service throw `P0_AR_RETURN_DUPLICATE`.
- Audit phát hiện AR-RETURN thiếu `idempotencyKey`.
- Unique index script bị gate bởi audit và không auto-create khi deploy.

## F. Rủi ro còn lại

| Rủi ro | Mức độ | Ghi chú |
|---|---:|---|
| Dữ liệu thật đang có duplicate AR-RETURN cũ | P0 | Script chỉ audit/dừng, không tự xóa để tránh làm sai công nợ |
| Existing DB có index cũ cùng key nhưng khác option/name | P1 | `mongoIndexService` sẽ skip conflict an toàn; cần drop index cũ thủ công sau audit nếu muốn chuẩn hóa tên |
| Unique index global theo `idempotencyKey` có thể bị chặn bởi duplicate ở ledger loại khác | P1 | Script đã audit duplicate global `idempotencyKey` trước khi tạo |
| Các dòng reversed lịch sử cùng key | P1 | Nếu dữ liệu lịch sử cần lưu nhiều bản ghi cùng key, cần quyết định chính sách unique partial nâng cao trước khi bật unique global |

## G. Khuyến nghị triển khai

### Phương án A — Production-grade khuyến nghị
1. Deploy code này.
2. Chạy `npm run mongo:indexes` để tạo non-unique index.
3. Chạy `npm run audit:ar-return-idempotency:json` trên DB thật.
4. Nếu sạch mới chạy `npm run mongo:ar-return-unique-index`.
5. Nếu bẩn, export danh sách P0, xử lý đối soát thủ công từng case, không xóa tự động.

Effort: Medium. Rủi ro thấp nhất, đúng hướng ledger integrity.

### Phương án B — Cân bằng effort
1. Deploy code + non-unique index.
2. Chưa bật unique index ngay.
3. Chạy audit định kỳ sau mỗi ngày/kỳ kế toán.
4. Chỉ bật unique khi dữ liệu sạch nhiều ngày liên tiếp.

Effort: Easy/Medium. Rủi ro deploy thấp, nhưng DB-level unique chưa enforce tuyệt đối cho tới khi bật tầng 2.
