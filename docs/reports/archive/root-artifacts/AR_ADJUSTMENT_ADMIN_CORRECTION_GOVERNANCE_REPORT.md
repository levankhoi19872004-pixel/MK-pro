# PHASE58 - Admin AR Adjustment Idempotency & Audit Governance

## A. Audit các điểm tạo AR adjustment

| File | Hàm | Loại adjustment | Có idempotency trước patch | Có rollback trước patch | Rủi ro trước patch |
|---|---|---|---:|---:|---|
| `src/services/admin-correction/AdminDataCorrectionService.js` | `createArAdjustment()` | `AR-ADJUSTMENT` công nợ admin | Không đủ chặt; không check existing ledger theo key/correction | Có reversal qua rollback correction nhưng sinh key rỗng/random | P0: apply/retry/partial transaction có thể tạo ledger lặp |
| `src/services/admin-correction/AdminDataCorrectionService.js` | `createRollbackLedger()` nhánh `ar` | rollback công nợ | Không ổn định vì dùng `makeId('CORRROLL')` | Có tạo đảo, nhưng replay có thể sinh thêm | P0: rollback script chạy lại có thể đảo nhiều lần |
| `src/services/admin-correction/AdminDataCorrectionService.js` | `applyCorrectionRequest()` | route apply correction | Phụ thuộc `createArAdjustment()` | Có qua `rollbackCorrectionRequest()` | Nếu status chưa update nhưng ledger đã ghi thì replay nguy hiểm |
| `src/services/admin-correction/AdminDataCorrectionService.js` | `rollbackCorrectionRequest()` | route rollback | Không khóa rollback idempotent theo adjustment gốc | Có | Replay/partial failure dễ sinh bút toán đảo trùng |
| `src/services/accounting/arAdjustmentService.js` | `createArAdjustment()` | boundary mới | Có | Có qua service | Writer chuẩn sau patch |

## B. Thiết kế service chuẩn

Tạo boundary mới: `src/services/accounting/arAdjustmentService.js`.

Public API:

- `createArAdjustment(input, options)`
- `buildAdjustmentIdempotencyKey(input)`
- `validateArAdjustment(input, options)`
- `rollbackArAdjustment(adjustmentId, options)`
- `findExistingAdjustment(idempotencyKey, options)`

Rule chuẩn:

```js
AR-ADJUSTMENT:<correctionId>:<customerCode>:<amount>:<reasonCode>
```

Mỗi AR adjustment ledger mới có:

- `type: 'AR-ADJUSTMENT'`
- `sourceType: 'adminCorrection'`
- `sourceId/correctionId`
- `correctionCode`
- `idempotencyKey`
- `reasonCode/reasonText`
- `createdBy/approvedBy`
- `auditTrail[]`
- `status: 'active'`
- `accountingStatus: 'posted'`

Rollback không xóa ledger gốc. Rollback tạo bút toán đảo với idempotency:

```js
AR-ADJUSTMENT-ROLLBACK:<originalIdempotencyKey>
```

Service cũng đánh dấu metadata rollback (`rollbackStatus`, `rolledBackAt`, `rollbackLedgerId`) nhưng không chuyển ledger gốc sang `void`, để không mất audit trail và không làm sai ledger lịch sử.

## C. File đã sửa/tạo mới

| File | Thay đổi |
|---|---|
| `src/services/accounting/arAdjustmentService.js` | Service mới idempotent, validate, conflict guard, rollback by reversal |
| `src/services/admin-correction/AdminDataCorrectionService.js` | `createArAdjustment()` không còn `ArLedger.create`; redirect sang service mới; rollback AR gọi `rollbackArAdjustment()` |
| `src/models/ArLedger.js` | Bổ sung field governance: `correctionId`, `reasonCode`, `auditTrail`, `isRollback`, `rollbackOf`, `rollbackStatus`, `metadata` |
| `src/models/ArAdjustment.js` | Bổ sung `idempotencyKey`, `reasonCode`, `reasonText`, `direction`, rollback refs, audit trail |
| `src/services/mongoIndexService.js` | Bổ sung non-unique lookup index tầng 1 cho AR adjustment |
| `scripts/lib/arAdjustmentIdempotencyAudit.js` | Logic audit duplicate/missing idempotency |
| `scripts/audit-ar-adjustment-idempotency.js` | CLI audit dry-run/json |
| `scripts/create-ar-adjustment-unique-index.js` | CLI tạo unique partial index sau khi audit sạch |
| `package.json` | Thêm npm scripts audit/index |
| `test/prompt4-ar-adjustment-service.test.js` | Runtime tests cho create/replay/conflict/rollback/validation |
| `test/prompt4-admin-ar-adjustment-static.test.js` | Static guard chống AdminDataCorrection ghi AR trực tiếp |
| `test/admin-data-correction-static.test.js` | Cập nhật expectation sang service boundary |
| `test/no-direct-ledger-write.test.js` | Bổ sung approved accounting boundaries và legacy fund exception |

## D. Index/migration đề xuất

Deploy-safe non-unique index tạo cùng `npm run mongo:indexes`:

```js
db.arLedgers.createIndex({ idempotencyKey: 1 }, { name: 'idx_arledger_idempotencyKey' })
db.arLedgers.createIndex({ sourceType: 1, sourceId: 1, type: 1 }, { name: 'idx_ar_adjustment_source_lookup' })
db.arLedgers.createIndex({ correctionId: 1, type: 1 }, { name: 'idx_ar_adjustment_correction_lookup' })
```

Audit dữ liệu cũ:

```bash
npm run audit:ar-adjustment-idempotency
npm run audit:ar-adjustment-idempotency:json
```

Bật unique index sau audit sạch:

```bash
npm run mongo:ar-adjustment-unique-index:dry
npm run mongo:ar-adjustment-unique-index
```

Unique index đề xuất:

```js
db.arLedgers.createIndex(
  { idempotencyKey: 1 },
  {
    unique: true,
    name: 'uniq_ar_adjustment_idempotencyKey',
    partialFilterExpression: {
      type: 'AR-ADJUSTMENT',
      idempotencyKey: { $exists: true, $type: 'string' }
    }
  }
)
```

## E. Test evidence

Syntax:

```text
SYNTAX_OK 1024 JavaScript files
```

Focused regression:

```text
tests 27
pass 27
fail 0
```

Covered cases:

- Tạo adjustment thành công.
- Chạy lại cùng adjustment không tạo trùng.
- Cùng `correctionId` nhưng khác amount báo `P0_AR_ADJUSTMENT_CONFLICT`.
- Rollback tạo bút toán đảo.
- Rollback chạy lại không tạo trùng.
- Thiếu reason/customer/amount thì reject.
- `AdminDataCorrectionService` không còn `ArLedger.create()`.

## F. Rủi ro còn lại

| Rủi ro | Mức độ | Cách xử lý |
|---|---:|---|
| Dữ liệu cũ có AR-ADJUSTMENT thiếu idempotencyKey | P0 | Chạy audit, xử lý thủ công theo case trước khi bật unique |
| Dữ liệu cũ có cùng correctionId nhưng nhiều ledger | P0 | Audit báo duplicate; không tự xóa trong phase này |
| Fund adjustment vẫn là legacy direct writer | P1 | Ngoài phạm vi prompt AR; đã giữ legacy exception, cần phase riêng nếu muốn chuẩn hóa fund |
| Inventory adjustment rollback vẫn dùng correction rollback random | P1 | Ngoài phạm vi prompt AR; inventory đã đi qua `postStockMovement` nhưng rollback idempotency có thể cần phase riêng |

## Kết luận

`AdminDataCorrectionService` không còn ghi AR trực tiếp thiếu idempotency. Mọi AR adjustment admin hiện đi qua `arAdjustmentService`, có idempotency key ổn định, audit trail, conflict guard và rollback bằng bút toán đảo idempotent.
