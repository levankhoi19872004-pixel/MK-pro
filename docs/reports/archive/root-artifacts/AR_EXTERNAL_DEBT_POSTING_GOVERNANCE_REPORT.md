# PHASE60 — External Debt AR Posting Governance Report

## Mục tiêu

Chuẩn hóa `postExternalDebt()` để nợ ngoài luồng luôn có source rõ, idempotency key ổn định, audit trail và reconcile được. Không tự tạo ledger nếu input thiếu thông tin bắt buộc.

## A. Audit bug `id/code`

| File | Hàm | Source input | Biến id/code lấy từ đâu | Có thể undefined không | Có idempotency không | Rủi ro |
|---|---|---|---|---:|---:|---|
| `src/domain/posting/ArPostingService.js` | `postExternalDebt(order)` | Object ledger/order từ `ExternalDebtOrderService` hoặc caller legacy | Trước patch: tự suy diễn từ `order.orderId/sourceId/refId/id/code`; có thể dùng `id/code` không ổn định giữa source và ledger | Có, nếu caller truyền thiếu source hoặc truyền `id/code` ledger thay vì source | Không | P0: crash/missing source/không reconcile được, retry có thể mutate ledger |
| `src/services/ExternalDebtOrderService.js` | `createExternalDebtOrder()` | Web API nợ ngoài luồng | Tạo `id/code` order nội bộ rồi tự build ledger payload | Không trong block hiện tại, nhưng retry idempotency có thể trả order cũ mà không ensure ledger | Order có idempotency, ledger thiếu | P0: nếu crash sau khi tạo order trước khi ghi ledger, retry trả order mà vẫn thiếu AR |
| `src/services/accounting/externalDebtArPostingService.js` | `postExternalDebt()` | Contract chuẩn mới | `sourceId/sourceCode` qua helper rõ ràng, không dùng biến ngoài scope | Không | Có | Writer chuẩn mới |
| `scripts/reconcile-external-debt-ar.js` | Reconcile | `externalDebtOrders` + `arLedgers` | Không tạo ledger | Không | N/A | Phát hiện missing/duplicate/mismatch/orphan |

## B. Input contract mới

`postExternalDebt(input, options)` yêu cầu tối thiểu:

```js
{
  sourceType: 'externalDebt',
  sourceId,
  sourceCode,
  customerId,
  customerCode,
  customerName,
  amount,
  date,
  reason,
  createdBy
}
```

Quy tắc bắt buộc:

- `sourceType` được normalize về `externalDebt`; legacy `externalDebtOrder` chỉ được reconcile cảnh báo P1.
- Phải có ít nhất `sourceId` hoặc `sourceCode`; không fallback sang `customerName` hoặc field mơ hồ.
- Phải có `customerId`, `customerCode`, `customerName`.
- `amount > 0`, `date` hợp lệ, `reason` và `createdBy` rõ.
- `idempotencyKey = AR-EXTERNAL-DEBT:<sourceId || sourceCode>` nếu caller không truyền sẵn.

## C. Ledger entry chuẩn

Giữ convention đang được report/mobile dùng:

```js
{
  type: 'ar_external_debt',
  ledgerType: 'AR-EXTERNAL-DEBT',
  category: 'AR-EXTERNAL-DEBT',
  direction: 'debit',
  account: 'AR',
  sourceType: 'externalDebt',
  sourceModel: 'ExternalDebtOrder',
  sourceId,
  sourceCode,
  externalDebtId: sourceId,
  externalDebtCode: sourceCode,
  idempotencyKey,
  auditTrail: [{ action: 'post_external_debt', ... }],
  status: 'posted',
  accountingStatus: 'confirmed',
  accountingConfirmed: true
}
```

## D. Idempotency/conflict rule

- Retry cùng `idempotencyKey/sourceId/sourceCode` trả ledger existing, không tạo trùng.
- Nếu cùng key/source nhưng `amount/customer/date/source` khác, throw `P0_AR_EXTERNAL_DEBT_CONFLICT`.
- `ExternalDebtOrderService` retry theo `idempotencyKey` không còn trả order cũ ngay; luôn gọi `ensureArLedgerForExternalDebtOrder()` để xử lý case order đã tạo nhưng AR ledger thiếu.

## E. Reconcile rule mới

`scripts/reconcile-external-debt-ar.js` phát hiện:

| Rule | Mức độ | Ý nghĩa |
|---|---|---|
| `confirmed_external_debt_missing_ar` | P0 | ExternalDebtOrder active/confirmed nhưng thiếu AR |
| `duplicate_external_debt_ledger_for_source` | P0 | Một external debt có nhiều active AR ledger |
| `duplicate_external_debt_idempotencyKey` | P0 | Nhiều ledger cùng idempotencyKey |
| `duplicate_external_debt_sourceId` | P0 | Nhiều ledger cùng sourceId |
| `duplicate_external_debt_sourceCode` | P0 | Nhiều ledger cùng sourceCode |
| `external_debt_ledger_missing_source` | P0 | Ledger thiếu sourceId/sourceCode |
| `external_debt_ledger_invalid_sourceType` | P0 | Ledger external debt nhưng sourceType không đúng |
| `external_debt_ar_mismatch` | P0 | Lệch amount/customer/date với source |
| `orphan_external_debt_ledger_source_not_found` | P0 | Ledger không tìm thấy source order |
| `external_debt_ledger_legacy_sourceType` | P1 | Ledger cũ dùng `externalDebtOrder` |

## F. Lệnh vận hành

```bash
npm run reconcile:external-debt-ar
npm run reconcile:external-debt-ar:json
```

Index deploy-safe:

```bash
npm run mongo:indexes
```

Các index liên quan:

```js
{ idempotencyKey: 1 } // idx_arledger_idempotencyKey đã có từ phase trước
{ type: 1, sourceType: 1, sourceId: 1 } // idx_ar_return_source_lookup dùng chung lookup source
{ sourceType: 1, sourceCode: 1, type: 1 } // idx_ar_external_debt_source_code_lookup
{ ledgerType: 1, sourceType: 1, sourceId: 1 } // idx_ar_external_debt_ledger_source_lookup
```

## G. Test evidence

```text
SYNTAX_OK 1036 JavaScript files
```

Focused tests:

```text
# tests 28
# pass 28
# fail 0
```

Đã cover:

- Input hợp lệ tạo ledger đúng source/idempotency/audit.
- Thiếu `sourceId/sourceCode` thì reject.
- Chạy lại không duplicate.
- Cùng key nhưng amount khác báo `P0_AR_EXTERNAL_DEBT_CONFLICT`.
- Không còn `ReferenceError id/code is not defined` ở `postExternalDebt`.
- Retry idempotent của external order vẫn ensure ledger nếu order đã tồn tại.
- Reconcile detect duplicate/missing source/missing AR/mismatch/orphan.

## Kết luận

`postExternalDebt()` không còn dùng biến undefined và có idempotency/source rõ ràng. Nợ ngoài luồng được ghi qua boundary chuẩn `externalDebtArPostingService`, retry an toàn và reconcile được.
