# PERF-A2C — Idempotency Hardening và Duplicate Ledger Guard

## 1. Gate decision

**PASS_WITH_DEFERRED_RUNTIME**

- E1 source/static: PASS.
- E2 deterministic offline: PASS.
- E3 Mongo production: deferred sang PERF-A6.
- Production unique index: **chưa áp dụng**.
- Không tuyên bố duplicate ledger production bằng 0.

## 2. Race condition cũ

Điểm ghi trung tâm `postArLedgerEntry` dùng `findOneAndUpdate({ idempotencyKey }, { $setOnInsert }, { upsert: true })`. Khi chưa có unique index, hai process có thể đồng thời:

1. Cùng không nhìn thấy ledger.
2. Cùng đi qua application pre-check.
3. Cùng thực hiện upsert/insert.
4. Tạo hai document có cùng idempotency key.

RED deterministic barrier tái hiện đúng tình huống này: 2 worker, 1 key và 2 ledger. RED contract trước sửa có 1 PASS/1 FAIL, exit code 1 như dự kiến.

## 3. Application guard mới

### 3.1 Key contract

- Chuẩn hóa Unicode NFKC và trim.
- Key bắt buộc là chuỗi, không rỗng, tối đa 512 ký tự.
- Từ chối khoảng trắng nội bộ và ký tự điều khiển.
- Entry được ghi bằng key đã chuẩn hóa.

### 3.2 Financial payload contract

`arLedgerIdempotencyGuard` tạo canonical financial payload và SHA-256 từ:

- Account/category/ledger type/entry type/direction.
- Debit, credit và amount; giá trị 0 được giữ nguyên.
- Customer/order/source/reference identity.
- Accounting confirmation, active/reversed/deleted state.

Timestamp, note, audit trail và `_id` không tham gia so sánh vì không thay đổi financial meaning.

### 3.3 Duplicate-key mapping

- Mongo error 11000/11001 được nhận diện rõ ràng.
- Sau duplicate-key, service đọc ledger hiện có bằng normalized key.
- Same key + same financial payload: trả ledger hiện có như idempotent success.
- Same key + different financial payload: ghi audit P0 `ar_ledger_idempotency_payload_conflict` và throw `AR_LEDGER_IDEMPOTENCY_PAYLOAD_CONFLICT`.
- Không nuốt duplicate-key không thể resolve thành ledger hiện có.

### 3.4 Safety

- Negative debit/credit/amount bị chặn trước repository write.
- Zero amount không bị fallback sang trường khác.
- Debt Zero Tolerance ±1.000 giữ nguyên.
- Session được truyền xuyên qua; deterministic transaction abort loại bỏ staged ledger, không để bản ghi nửa vời.
- AR-SALE và AR-SALE-REVERSAL được chuyển qua cùng central posting guard.

## 4. RED/GREEN evidence

| Nhóm | Kết quả |
|---|---:|
| RED race reproduction | 1 PASS / 1 expected FAIL |
| PERF-A2C GREEN | 17/17 PASS |
| PERF A1B–A2C regression | 51/51 PASS |
| AR posting core regression | 6/6 PASS |
| JavaScript syntax | 1.609 file PASS |
| Dependency-limited Phase258B | 2 PASS / 1 NOT_RUN vì thiếu mongoose |

Các GREEN scenario bắt buộc đều PASS: concurrent same-key, same/different payload, unknown-commit retry, zero/negative money, tolerance, rollback và read-only duplicate audit.

## 5. Unique index desired state

```javascript
{ idempotencyKey: 1 }
```

Options:

```javascript
{
  name: 'uniq_arledger_idempotency_key_v1',
  unique: true,
  partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } }
}
```

Desired state được khai báo trong `arLedgerIdempotencyIndexContract.js` và `PENDING_INDEX_DEFINITIONS` của main managed registry với `autoApply: false`.

## 6. Migration policy

- Audit dry-run trước.
- Báo exact duplicate, normalized-key collision, financial payload conflict và malformed key.
- Không tự xóa, merge hoặc sửa ledger.
- Chỉ tạo index khi audit sạch và có `--apply --confirm-create-index`.
- Verify index sau create.
- Không drop index tự động.

## 7. Production deployment state

| Thành phần | Trạng thái |
|---|---|
| APPLICATION_IDEMPOTENCY_GUARD | **PASS** |
| DATABASE_UNIQUE_INDEX | **PENDING_PRODUCTION_APPLY** |
| Production duplicate ledger = 0 | **NOT CLAIMED** |

## 8. Source integrity

- Input ZIP SHA-256: `c8779b361ad785a02f409a29a40ef822dbf97343149c64c25ed7560b3e24773f`
- Baseline source tree SHA-256: `250437a1855f09e779720d0c7bd13b35fd265773c367ae9f10b6c96f40abccbb`
- A2C source tree SHA-256: `8e891875377e8b4960461aa77db8a66c70c5eaa8ba5efcd25de41dcf9b17f3da`
- Changed source/test/tooling files: 12
- Production index applied: không.
- Production data mutated: không.
