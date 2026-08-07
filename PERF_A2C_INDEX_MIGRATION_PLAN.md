# PERF-A2C — Unique Index Migration Plan

## Mục tiêu

Tạo unique partial index toàn cục cho `arLedgers.idempotencyKey` chỉ sau khi application guard đã deploy và duplicate audit production sạch.

## Index contract

- Collection: `arLedgers`
- Key: `{ idempotencyKey: 1 }`
- Name: `uniq_arledger_idempotency_key_v1`
- `unique: true`
- Partial filter: `{ idempotencyKey: { $type: 'string', $gt: '' } }`
- Managed desired state: `PENDING_PRODUCTION_APPLY`
- Auto apply bởi startup index service: **false**

## Phase 1 — Audit dry-run

```bash
npm run audit:ar-ledger-idempotency:json > ar-ledger-idempotency-audit.json
```

Điều kiện sạch bắt buộc:

- `duplicateGroups = 0`
- `conflictingPayloadGroups = 0`
- `normalizedVariantGroups = 0`
- `malformedKeys = 0`

Empty key được báo cáo nhưng bị loại khỏi partial index. Không được tự động sửa/xóa/merge dữ liệu.

## Phase 2 — Migration dry-run

```bash
npm run mongo:ar-ledger-idempotency-unique-index:dry > ar-ledger-idempotency-index-dry-run.json
```

Dry-run phải trả `DRY_RUN_CLEAN`. Nếu có duplicate hoặc index name conflict, dừng gate production.

## Phase 3 — Apply có phê duyệt

Chỉ trong maintenance/canary window đã phê duyệt:

```bash
npm run mongo:ar-ledger-idempotency-unique-index > ar-ledger-idempotency-index-apply.json
```

Lệnh apply đã chứa `--apply --confirm-create-index`. Script không drop index cũ và không mutate ledger.

## Phase 4 — Verify

Bắt buộc xác minh:

1. Index name đúng.
2. Key đúng `{ idempotencyKey: 1 }`.
3. `unique=true`.
4. Partial filter đúng contract.
5. Chạy lại duplicate audit.
6. Chạy same-key race trên staging Mongo.
7. Theo dõi 11000, 5xx, transaction abort và latency.

## Rollback runbook

Application rollback: deploy lại ZIP/image A2B nếu phát hiện incompatibility.

DB rollback chỉ làm thủ công sau phê duyệt:

```javascript
db.arLedgers.dropIndex('uniq_arledger_idempotency_key_v1')
```

Không có script A2C nào tự drop index. Không xóa hoặc merge ledger tự động. Trước rollback phải lưu index spec, audit output và snapshot DB.

## Stop conditions

- Có bất kỳ duplicate group nào.
- Có cùng normalized key nhưng nhiều raw key variant.
- Có same-key/different-financial-payload.
- Có malformed key.
- Index cùng tên nhưng khác spec.
- Không có backup hoặc maintenance approval.
