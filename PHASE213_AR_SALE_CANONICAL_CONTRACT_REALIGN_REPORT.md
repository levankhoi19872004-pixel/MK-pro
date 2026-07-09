# PHASE213 - AR-SALE Canonical Contract Realign Fix

## Mục tiêu

Sửa tiếp Phase212 sau khi `npm test` còn 6 lỗi trong cụm AR-SALE canonical / AR debt read model.

Trọng tâm: không sửa cực đoan kiểu cấm toàn bộ `AR-SALE`. Tách đúng 3 lớp:

1. Strict Phase87 debt match: chỉ `AR-DEBT-*`.
2. Canonical accounting ledger contract: `AR-SALE`, `AR-RETURN`, `AR-RECEIPT`, `AR-REWARD-ALLOWANCE` vẫn hợp lệ nếu đủ contract.
3. Legacy/dirty AR: không feed Phase87, chỉ audit/migration/manual repair.

## File đã sửa

- `src/domain/ar/arLedgerValidator.js`
- `src/domain/ar/arLedgerQueryPolicy.js`
- `src/services/arDebtReadModel.service.js`
- `src/services/arPosting.service.js`

## Nguyên nhân gốc

Phase212 đã siết `isCanonicalArDebtLedger()` theo `PHASE87_READ_MODEL_CATEGORIES`, làm `AR-SALE` canonical bị coi là non-canonical. Hậu quả:

- `buildArSaleLedger()` tạo đúng contract nhưng validator helper trả false.
- `reverseSalesOrderAR()` không tìm thấy active canonical `AR-SALE` để đảo.
- `groupCanonicalLedgers()` loại mất các detailed AR categories từ `orderPaymentAllocations`.
- `confirmSalesOrderAR()` vô tình rebuild read model từ canonical sale path trong test legacy.

## Cách sửa

### 1. Tách canonical accounting ledger khỏi strict Phase87 match

`isCanonicalArDebtLedger()` nay xác nhận ledger AR canonical theo toàn bộ `DEBT_CATEGORIES` nếu:

- active, confirmed, không reversed/deleted
- đủ contract `category/ledgerType/entryType/source/customer/idempotencyKey`
- debit/credit shape đúng theo category

`isPhase87ReadModelArDebtLedger()` vẫn giữ strict `AR-DEBT-*`.

`buildCanonicalArLedgerMatch()` không đổi rule strict: vẫn chỉ query `AR-DEBT-OPEN`, `AR-DEBT-PAYMENT`, `AR-DEBT-ADJUSTMENT`, `AR-DEBT-VOID`.

### 2. Projection/read-model bridge

Thêm/giữ `canProjectCanonicalAccountingLedgerToDebtReadModel()` cho nhóm accounting ledger có thể projection khi được đưa trực tiếp vào read-model grouping:

- `AR-DEBT-*`
- `AR-SALE`
- `AR-RETURN`
- `AR-RECEIPT*`
- `AR-REWARD-ALLOWANCE`
- allowance/adjustment tương thích

Reversal rows như `AR-SALE-REVERSAL` không được tự tạo negative debt khi không còn original active trong cùng read set.

### 3. `confirmSalesOrderAR()` không rebuild Phase87 hot/read model từ legacy confirm path

Giữ tạo canonical `AR-SALE` và idempotency, nhưng không tự feed `ArDebtOrder/ArDebtCustomer` trong test legacy confirm path.

`AR-SALE` vẫn là accounting ledger hợp lệ để audit/reverse/re-accounting nhận diện.

### 4. `reverseSalesOrderAR()` tìm được canonical `AR-SALE`

Sau khi `isCanonicalArDebtLedger()` nhận canonical `AR-SALE`, `reverseSalesOrderAR()` tìm đúng active sale ledger và tạo một `AR-SALE-REVERSAL` idempotent, credit-only.

## Test đã chạy

### Nhóm 6 lỗi cũ

```bash
node --test \
  test/ar-debt-read-model-v2-categories.test.js \
  test/ar-sale-canonical-contract.test.js \
  test/ar-sale-idempotency.test.js \
  test/ar-sale-reaccounting-contract.test.js \
  test/ar-sale-reversal-idempotency.test.js
```

Kết quả:

```txt
11 pass / 0 fail
```

### Regression chính

```bash
node --test \
  test/ar-ledger-read-standard.test.js \
  test/ar-legacy-normalization-apply-safety.test.js \
  test/ar-ledger-access-contract-static.test.js \
  test/debt-collection-pending-posting-static.test.js \
  test/closeout-api-performance-static.test.js
```

Kết quả các test trên pass.

`test/sse-invoice-export-integration.test.js` không chạy được trong sandbox vì môi trường ZIP thiếu dependency `mongoose`, nhưng log máy dev trước đó cho thấy nhóm SSE đã pass sau Phase212.

### Syntax

```bash
npm run check:syntax
```

Kết quả:

```txt
SYNTAX_OK 1338 JavaScript files
```

`npm run check:source-bundles` không chạy được trong sandbox vì thiếu dependency `terser`; bản sửa Phase213 không thay đổi frontend source bundle.

## Xác nhận giữ rule mới

- Không đưa legacy/dirty `AR-SALE` quay lại Phase87 strict match.
- Không đổi canonical `AR-SALE` thành `AR-DEBT-OPEN`.
- `buildCanonicalArLedgerMatch()` vẫn chỉ `AR-DEBT-*`.
- Canonical `AR-SALE` vẫn tạo/reverse/idempotent đúng.
- `orderPaymentAllocations` detailed categories đủ 5 dòng trong test.
- Không sửa lan closeout/mobile/SSE.
