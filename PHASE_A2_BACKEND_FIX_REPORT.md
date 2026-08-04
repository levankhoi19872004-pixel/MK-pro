# PHASE A2 — BACKEND / DATA / DOMAIN FIX REPORT

- **Dự án:** MK-pro-main
- **Nguồn vào:** `MK-pro-phase-a1-delivery-adjustment-audit-red-test.zip`
- **Thời điểm thực hiện:** 2026-08-04T04:16:26.910942+00:00
- **Node.js:** v22.16.0
- **Phạm vi:** Backend/Data/Domain; **không sửa frontend production**

## 1. Kết luận

Phase A2 đã sửa lớp backend/domain để chặn việc payload thu tiền bị diễn giải thành thay đổi hàng trả và để chính backend xác định ý định nghiệp vụ, trạng thái hiện tại, delta, idempotency và concurrency.

Case `B0040961` đã được kiểm chứng ở service runtime với trạng thái canonical:

| Thành phần | Trước | Sau |
|---|---:|---:|
| Phải thu | 1.931.784 | 1.931.784 |
| Tiền mặt | 1.932.000 | 0 |
| Chuyển khoản | 0 | 0 |
| Trả thưởng | 0 | 0 |
| Hàng trả | 1.931.784 | 1.931.784 |
| Công nợ | -1.932.000 | 0 |

Kết quả kỹ thuật:

```text
command intent       = PAYMENT_ONLY
cashDelta            = -1.932.000
returnDelta          = 0
nextDebt             = 0
returnOrders writes  = 0
AR adjustment writes = 0
AR-RECEIPT writes    = 0
order writes         = 1
correction audit     = 1
```

Backend vẫn tương thích tạm thời với frontend A1 hiện tại: request **không khai báo `changeType`**, chỉ có thay đổi tiền và các dòng hàng trả không có delta vật chất, nhưng bị rò `returnAdjustmentAmount`, sẽ được suy luận là `PAYMENT_ONLY`; aggregate rò rỉ bị bỏ qua và ghi vào metadata audit. Khi client khai báo rõ `PAYMENT_ONLY` mà vẫn gửi bất kỳ trường mutation hàng trả nào, request bị từ chối HTTP 400.

## 2. File thay đổi

| File | Loại | Thay đổi chính | Diff xấp xỉ |
|---|---|---|---:|
| `src/domain/accounting/deliveryAdjustmentCommand.js` | Mới | Command intent, shape validation, server return-total validation, error contract | +274 |
| `src/services/deliveryCloseoutCorrection.service.js` | Sửa | Canonical state, command resolution, server-side delta, pre/post-closeout isolation, idempotency, optimistic concurrency | +420 / -68 |
| `src/domain/accounting/correctionDebtDelta.js` | Sửa | Scope guard để policy post-closeout không chạy cho pre-closeout | +8 / -1 |
| `test/phase-a2-delivery-adjustment-backend.test.js` | Mới | 12 runtime behavior tests với model/service stubs | +543 |

### File frontend được bảo toàn

`public/js/app/new/91-delivery-today-new.js` không thay đổi:

```text
SHA256 Phase A1: 9b3af1875b8ed33414d5e1ba6579c1eefd9f1d180736c526a2bbd4806c77773a
SHA256 Phase A2: 9b3af1875b8ed33414d5e1ba6579c1eefd9f1d180736c526a2bbd4806c77773a
```

## 3. Thực hiện theo Requirement

### A2-REQ-01 — Command intent bắt buộc

Đã bổ sung contract:

- `PAYMENT_ONLY`
- `RETURN_ONLY`
- `COMBINED`
- `POST_CLOSEOUT_CORRECTION`

Quy tắc:

- Intent không hợp lệ → `INVALID_ADJUSTMENT_INTENT`, HTTP 400.
- `POST_CLOSEOUT_CORRECTION` trên đơn chưa chốt → `INVALID_ADJUSTMENT_INTENT`, HTTP 400.
- `PAYMENT_ONLY` khai báo rõ nhưng mang trường hàng trả → `PAYMENT_ONLY_CONTAINS_RETURN_MUTATION`, HTTP 400.
- `RETURN_ONLY` thay đổi payment → `INVALID_ADJUSTMENT_INTENT`.
- `COMBINED` thiếu một trong hai phần payment/return → `INVALID_ADJUSTMENT_INTENT`.

Compatibility bridge chỉ áp dụng cho client cũ không gửi intent. Nó không âm thầm chấp nhận forged mutation có delta vật chất.

### A2-REQ-02 — Không tin tổng hàng trả từ client

Đã thay đổi luồng return:

1. Chuẩn hóa line items.
2. Khi có quantity mutation, đọc canonical rows từ `orders.items + returnOrders.items`.
3. Lấy `currentReturnQty` và `unitPrice` từ canonical rows.
4. Tính lại `adjustmentQty` và `adjustmentAmount` trên server.
5. So sánh tổng client với tổng server, tolerance 1 đồng.
6. Mismatch → `RETURN_TOTAL_MISMATCH`, HTTP 400, kèm:
   - `expectedReturnAdjustmentAmount`
   - `receivedReturnAdjustmentAmounts`
   - `tolerance`
7. SKU không tồn tại trong canonical order/return rows → `RETURN_ADJUSTMENT_PRODUCT_NOT_IN_ORDER`.

Đối với `PAYMENT_ONLY`, backend ép:

```js
returnAdjustmentAmount = 0;
materialReturnItems = [];
```

### A2-REQ-03 — Tách pre-closeout / post-closeout

Luồng đơn chưa chốt gọi `calculateCorrectionDebtDelta()` để tính event delta nhưng **không gọi** policy `POST_CLOSEOUT_*`.

`assertCorrectionDebtDeltaPolicy()` chỉ áp dụng post-closeout khi caller không khai báo pre-closeout; caller confirmed truyền rõ:

```js
{ closeoutConfirmed: true }
```

Thông báo đã đổi thành đúng ngữ cảnh tiếng Việt:

```text
Hàng trả sau chốt không được làm tăng công nợ.
```

### A2-REQ-04 — Trạng thái canonical

Pre-closeout backend dùng `DeliveryPaymentStateReadService.resolvePaymentStatesForOrders()`.

Thứ tự nguồn chuẩn hiện có:

1. `orderPaymentAllocations.current`
2. `deliveryCloseoutVersions.latest`
3. Fallback `salesOrders.deliveryCloseout` / top-level order khi read model không có snapshot

Backend không lấy current cash/bank/reward/return/debt từ row UI hoặc các field `current*` do client gửi.

Nếu canonical read phát lỗi, service fail-closed với `CANONICAL_PAYMENT_STATE_READ_FAILED`; fallback khi lỗi chỉ bật bằng option test/chủ động `allowCanonicalStateFallback=true`.

### A2-REQ-05 — Không ghi ngoài intent

Runtime test case `B0040961` chứng minh:

- không query `returnOrders` ở payment-only;
- không gọi repository upsert return;
- không gọi `ArDebtAdjustmentPostingService`;
- không gọi `OrderPaymentAllocationService.postAllocation`;
- không tạo closeout version;
- correction audit ghi `cashDeltaAmount=-1932000` và `returnAdjustmentAmount=0`;
- `metadata.doesNotPostArReceipt=true`;
- SalesOrder/payment state được cập nhật về cash 0 và debt 0.

### A2-REQ-06 — Concurrency và idempotency

Đã bổ sung:

- `expectedVersion` check → `STALE_ADJUSTMENT_VERSION` 409.
- Optimistic update filter theo order identity + `version` + `updatedAt` khi có.
- `$inc: { version: 1 }` khi ghi SalesOrder.
- `matchedCount !== 1` → `STALE_ADJUSTMENT_VERSION`.
- Stable request fingerprint từ intent + final payment state + canonical return items + reason/note.
- Retry cùng idempotency key và cùng fingerprint trả kết quả cũ, không ghi trùng.
- Cùng idempotency key nhưng payload khác → `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`, HTTP 409.
- Luồng vẫn chạy trong `withOptionalMongoTransaction`, do đó correction/order/return writes thuộc cùng Mongo transaction.

### A2-REQ-07 — Error contract

| Code | HTTP | Trạng thái |
|---|---:|---|
| `INVALID_ADJUSTMENT_INTENT` | 400 | Đã triển khai và test |
| `PAYMENT_ONLY_CONTAINS_RETURN_MUTATION` | 400 | Đã triển khai và test |
| `RETURN_TOTAL_MISMATCH` | 400 | Đã triển khai và test |
| `STALE_ADJUSTMENT_VERSION` | 409 | Đã triển khai và test cả expectedVersion và optimistic conflict |
| `POST_CLOSEOUT_RETURN_CANNOT_INCREASE_DEBT` | 409 | Vẫn hoạt động cho confirmed scope |
| `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | 409 | Bổ sung và test |
| `RETURN_ADJUSTMENT_PRODUCT_NOT_IN_ORDER` | 400 | Bổ sung và test |

## 4. Test evidence

### 4.1 RED trước sửa

Phase A1 đã chứng minh frontend hiện tại gửi `returnAdjustmentAmount=1.931.784` trong thao tác payment-only và RED test thất bại đúng lỗi contract.

### 4.2 GREEN backend Phase A2

Command:

```bash
node --test \
  test/phase-a2-delivery-adjustment-backend.test.js \
  test/delivery-closeout-correction-contract-static.test.js \
  test/delivery-adjustment-returnorders-contract-static.test.js \
  test/delivery-adjustment-reward-allocation-integration-static.test.js \
  test/delivery-closeout-correction-no-change-optional-reason.test.js \
  test/delivery-adjustment-bulk-commit-static.test.js
```

Kết quả:

```text
40 tests
40 pass
0 fail
exit code 0
```

A2 runtime behavior riêng:

```text
12 tests
12 pass
0 fail
```

Bao phủ:

- B0040961 payment-only pre-closeout;
- explicit forged return payload;
- return-only canonical price/quantity;
- total mismatch;
- retry idempotent;
- stale expected version;
- genuine post-closeout violation;
- invalid intent;
- post-closeout intent trên open order;
- idempotency key conflict;
- optimistic write conflict;
- unknown product.

### 4.3 Syntax

```bash
npm run check:syntax
```

```text
SYNTAX_OK 1561 JavaScript files
exit code 0
```

### 4.4 Test chưa chạy được do môi trường

Ba runtime test cũ phụ thuộc Mongoose không thể load vì ZIP không có `node_modules`:

- `test/phase260c-r1-stop-the-bleeding.test.js`
- `test/closeout-correction-add-return.test.js`
- `test/closeout-correction-reduce-return.test.js`

Lỗi môi trường:

```text
Cannot find module 'mongoose'
```

Phase A1 đã thử:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

nhưng isolated registry trả 404 cho `zip-stream@4.1.1`, nên không thể phục hồi dependency suite trong môi trường hiện tại.

## 5. Acceptance Criteria

| AC | Kết quả | Evidence |
|---|---|---|
| A2-AC-01: B0040961 cash 1.932.000 → 0, nextDebt=0 | **PASS** | Runtime test 1 |
| A2-AC-02: payment-only không write returnOrders | **PASS** | counters returnRead=0, returnWrite=0 |
| A2-AC-03: backend không tin client return total | **PASS** | canonical line test + mismatch test |
| A2-AC-04: post-closeout validator chỉ chạy confirmed | **PASS** | policy scope test |
| A2-AC-05: không sinh AR-RECEIPT trực tiếp | **PASS** | AR/allocation counters=0, metadata audit |
| A2-AC-06: toàn bộ RED test A1 chuyển GREEN | **DEFERRED A3** | Frontend production bị khóa trong A2 |

### Lý do A2-AC-06 chưa thể kết luận PASS

A1 RED test kiểm tra **object payload thực tế do frontend tạo**, cụ thể yêu cầu frontend không gửi `returnAdjustmentAmount` và các return fields. Phase A2 lại cấm sửa frontend. Vì vậy test đó vẫn RED với actual `1.931.784` như bằng chứng trước đó.

Backend đã GREEN cho chính payload legacy bị rò: nó suy luận `PAYMENT_ONLY`, ép `returnDelta=0`, không ghi return và không phát lỗi post-closeout. Để A1 frontend RED chuyển GREEN đúng nghĩa, bắt buộc thực hiện Phase A3 payload isolation; không được sửa kỳ vọng test để che lỗi.

## 6. Rủi ro còn lại

1. **Frontend vẫn gửi payload thừa**: backend đã phòng thủ, nhưng network payload và UI intent chưa sạch. Xử lý ở A3.
2. **Full dependency suite chưa chạy**: cần CI/máy có registry đầy đủ chạy toàn bộ `npm test` và Mongo integration tests trước deploy.
3. **Legacy client inference là bridge tạm thời**: sau khi A3 rollout ổn định, nên chuyển API sang bắt buộc `changeType` và loại compatibility branch theo release plan.
4. **Production data B0040961 chưa được sửa**: Phase A2 chỉ sửa code. Sau deploy, dùng popup/service chuẩn để đưa cash về 0; không hard-delete ledger.

## 7. Diff tóm tắt

### `deliveryAdjustmentCommand.js`

- Tạo command boundary thuần domain.
- Phân biệt intent và operation intent.
- Chặn shape sai.
- Tính payment delta từ current canonical state và final state.
- Chỉ coi return changed khi có material line delta.
- So sánh client aggregate với server-calculated total.

### `deliveryCloseoutCorrection.service.js`

- Đọc canonical payment state.
- Canonicalize return qty/price theo order + returnOrders.
- Payment-only không đọc/ghi returnOrders.
- Pre-closeout không chạy post-closeout policy và không post AR.
- Thêm audit metadata, stable fingerprint, idempotency replay/conflict.
- Thêm expected version và optimistic write guard.
- Confirmed correction vẫn giữ return mutation guard, closeout version, allocation và AR adjustment flow.

### `correctionDebtDelta.js`

- Bổ sung explicit pre-closeout scope bypass.
- Giữ nguyên policy cho confirmed correction.

### Test

- Thêm 12 runtime behavior tests bằng Node built-ins và stubs.
- Không cần Mongo thật để chứng minh branch/write boundary.

## 8. Gate kết thúc Phase A2

Phase A2 dừng tại backend/data/domain đúng yêu cầu. Không có thay đổi frontend production. Working ZIP sẵn sàng làm input cho Phase A3.
