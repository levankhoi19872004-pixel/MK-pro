# PHASE229 — Closeout Order Identity Overlap / Duplicate AR-DEBT-ADJUSTMENT Fix

## 1. Phạm vi

Phase229 sửa riêng lỗi khi **chốt sổ giao hàng thường** tạo thêm `AR-DEBT-ADJUSTMENT` bằng đúng toàn bộ số nợ, mặc dù `AR-SALE` của cùng đơn vừa được ghi hợp lệ.

Case tái hiện từ ảnh production:

- Khách hàng: `5052875 — Trung Liên`
- Đơn: `B0039252`
- NVBH: `35095 — Nguyễn Đình Thành`
- AR-SALE debit: `875.094`
- AR-DEBT-ADJUSTMENT debit tạo sai: `875.094`
- Công nợ bị hiển thị: `1.750.188`

Phase này không sửa UI, không loại `AR-DEBT-ADJUSTMENT` khỏi Debt New, không hard delete/sửa ledger đã posted và không tự chạy reversal production.

---

## 2. Tổng quan dự án

- Kiến trúc: Node.js/Express monolith.
- Database: MongoDB/Mongoose.
- SSoT công nợ: `arLedgers`.
- Luồng chốt sổ: `salesOrders.deliveryCloseout → orderPaymentAllocations → detailed arLedgers/fundLedgers → debt reconcile`.
- Quy mô ZIP sau sửa: khoảng 1.898 file, 1.391 file JavaScript, khoảng 16 MB, không gồm `node_modules`.

### Điểm tốt trong code hiện tại

- Writer `orderPaymentAllocations` ghi `AR-SALE` theo idempotency key.
- Phase226 có canonical AR category/provenance registry.
- Phase227 đã chuyển reconcile sang active canonical AR reader và có raw-versus-canonical diagnostics.
- Reconcile đã dùng delta `expectedDebtAmount - currentCanonicalArBalance`.
- Transaction/session được truyền xuyên suốt closeout → posting → reconcile.

### Rủi ro P0 phát hiện

Helper identity Phase227 có thể tự loại toàn bộ business-order keys trong luồng closeout thường. Khi đó reader không query Mongo, trả balance bằng 0 và writer post full expected debt.

---

## 3. Runtime flow đã trace

```text
POST /api/new/delivery-today/closeout
→ AccountingCloseoutService.confirmDeliveryAccounting
→ confirmDeliveryAccountingInternal
→ confirmOneOrder
→ OrderPaymentAllocationService.buildAndPostFromCloseout
→ postAllocation
→ postArLedgersFromAllocation
→ arPostingService.postArLedgerEntry(AR-SALE)
→ OrderPaymentDebtReconcileService.reconcileOrderDebt
→ reconcileOneOrder
→ getCurrentOrderArBalanceDetails
→ resolveCanonicalArOrderIdentity
→ arLedgerReadService.inspectActiveDebtReadModelLedgersByOrderKeys
→ buildDebtAdjustmentLedger
→ arPostingService.postArLedgerEntry(AR-DEBT-ADJUSTMENT)
```

Thứ tự ghi đúng: `AR-SALE` được post trước khi reconcile. Session Mongo không phải root cause.

---

## 4. Root cause chính xác

### 4.1. Dữ liệu identity của closeout thường

`OrderPaymentAllocationService.allocationIdentity()` tạo:

```js
sourceType = 'delivery_closeout'
sourceId   = orderId
sourceCode = orderCode
```

Ví dụ B0039252:

```text
orderId               = SO-B0039252
orderCode             = B0039252
allocation.sourceType = delivery_closeout
allocation.sourceId   = SO-B0039252
allocation.sourceCode = B0039252
```

### 4.2. Logic Phase227 bị lỗi khi source alias trùng business identity

Logic cũ:

```js
const ignoredSourceAliases = [allocation.sourceId, allocation.sourceCode]
  .filter(value => sourceType không phải business-order source);

const lookupKeys = businessOrderKeys
  .filter(value => !ignoredSourceAliases.includes(value));
```

Vì `delivery_closeout` không thuộc business-order source type, code đưa:

```text
SO-B0039252
B0039252
```

vào `ignoredSourceAliases` dù hai giá trị này đồng thời chính là `orderId/orderCode` đáng tin cậy.

Kết quả:

```text
businessOrderKeys = [SO-B0039252, B0039252]
ignoredSourceAliases = [SO-B0039252, B0039252]
lookupKeys = []
```

### 4.3. Hậu quả

Khi `lookupKeys=[]`, `getCurrentOrderArBalanceDetails()` không chạy raw/canonical order lookup và trả:

```text
currentArBalance = 0
```

Reconcile tính:

```text
expectedDebtAmount = 875.094
currentArBalance   = 0
deltaDebt          = 875.094
```

Sau đó tạo:

```text
AR-DEBT-ADJUSTMENT debit 875.094
```

trong khi `AR-SALE debit 875.094` đã tồn tại, làm công nợ thành `1.750.188`.

### 4.4. Vì sao Phase227 không bắt được

Test Phase227 tập trung correction:

```text
sourceId = DCOC-...
orderId  = SO-...
```

Correction ID khác order ID nên việc bỏ correction alias là đúng và business keys vẫn còn.

Test chưa bao phủ trường hợp closeout thường:

```text
sourceId = orderId
sourceCode = orderCode
sourceType = delivery_closeout
```

---

## 5. Giải pháp Phase229

### 5.1. Business identity luôn có ưu tiên cao nhất

`resolveCanonicalArOrderIdentity()` giờ dựng riêng:

```js
businessIdentityKeys
```

từ:

- `salesOrderId`
- `orderId`
- `id/_id` của order
- `salesOrderCode`
- `orderCode/code/documentCode/invoiceCode`
- order aliases rõ ràng từ allocation
- `extraOrderKeys` do caller truyền chủ động

Các giá trị này không bao giờ bị trừ khỏi lookup chỉ vì trùng với source alias.

### 5.2. Phân loại source alias rõ ràng

Helper trả thêm:

```js
allowedSourceAliases
sourceAliasesMatchingBusinessIdentity
ignoredSourceAliases
```

Quy tắc:

- Source alias có sourceType thực sự là business order: được phép tham gia lookup.
- Source alias khác business identity, ví dụ `DCOC-*`: bị bỏ.
- Source alias của closeout trùng business identity: giữ lại vì độ tin cậy đến từ field `orderId/orderCode`, không phải từ sourceType.

Kết quả mới cho B0039252:

```json
{
  "lookupKeys": ["SO-B0039252", "B0039252"],
  "sourceAliasesMatchingBusinessIdentity": ["SO-B0039252", "B0039252"],
  "ignoredSourceAliases": []
}
```

### 5.3. Safety guard mới

Ngay trong reconcile, nếu:

```text
lookupKeys.length = 0
expectedDebtAmount > tolerance
```

thì trả:

```text
manualReviewRequired = true
skipReason = CANONICAL_AR_ORDER_IDENTITY_UNRESOLVED
action = manual-review
```

và không post `AR-DEBT-ADJUSTMENT`.

Guard này ngăn full-debt over-post nếu identity contract lại bị lỗi trong tương lai.

### 5.4. Kết quả runtime mong đợi

```text
lookupKeys            = [SO-B0039252, B0039252]
rawMatchedLedgerCount = 1
canonicalMatchedCount = 1
currentArBalance      = 875.094
expectedDebtAmount    = 875.094
deltaDebt             = 0
action                = skip
skipReason            = NO_DEBT_DELTA
```

Không tạo ledger adjustment mới.

---

## 6. File đã sửa

1. `src/domain/ar/arOrderIdentity.js`
   - Sửa canonical order identity precedence.
   - Không để non-business source alias xóa business key trùng giá trị.
   - Bổ sung diagnostics source aliases.

2. `src/services/accounting/OrderPaymentDebtReconcileService.js`
   - Bổ sung `sourceAliasesMatchingBusinessIdentity` vào diagnostics.
   - Thêm guard `CANONICAL_AR_ORDER_IDENTITY_UNRESOLVED`.

3. `scripts/audit-closeout-debt-adjustment-duplicate-ar-sale.js`
   - Audit read-only các adjustment sinh từ closeout thường.
   - Tính raw/canonical balance trước posting.
   - Phát hiện identity collapse và over-post.
   - Chỉ lập kế hoạch reversal.

4. `test/phase229-closeout-order-identity-overlap-debt-adjustment.test.js`
   - Regression B0039252.
   - Overlapping source/order identity.
   - Correction identity exclusion.
   - Unresolved identity guard.
   - Audit/reversal-plan fixture.

5. `package.json`
   - Thêm lệnh `audit:closeout-duplicate-debt-adjustment`.

Không sửa frontend, source-bundle UI, AR category registry, fund ledger, inventory hoặc delivery closeout calculation.

---

## 7. Test đã thêm

### Test 1 — Closeout source alias trùng order identity

Kỳ vọng:

```text
lookupKeys = [orderId, orderCode]
ignoredSourceAliases = []
```

### Test 2 — Regression B0039252

Input:

```text
AR-SALE debit = 875.094
expected debt = 875.094
sourceType = delivery_closeout
sourceId = orderId
sourceCode = orderCode
```

Kỳ vọng:

```text
currentArBalance = 875.094
deltaDebt = 0
NO_DEBT_DELTA
không tạo AR-DEBT-ADJUSTMENT
```

### Test 3 — Correction ID vẫn bị loại

`DCOC-*` khác business order identity không được vào lookup.

### Test 4 — Không có business identity

Kỳ vọng manual review, không post full expected debt.

### Test 5 — Audit fixture

Kỳ vọng nhận diện over-post `875.094` và chỉ đưa reversal plan credit.

---

## 8. Kết quả kiểm thử

### Test trọng tâm

- Phase229: `5/5` pass.
- Phase226 + Phase227 + closeout/reconcile regression: `50/50` pass.

### Toàn bộ suite

Do một lệnh `npm test` đơn khối vượt giới hạn wall-clock của công cụ, suite được chạy lại theo đúng chiến lược của `scripts/run-tests.js`:

- 9 test file có global module patch chạy isolated.
- 536 test file còn lại chạy 14 shared chunks, concurrency=1.
- Tổng 23 invocation; tất cả exit code `0`.

Kết quả tổng:

```text
Tests:   1.850
Pass:    1.849
Skip:    1 (theo thiết kế)
Fail:    0
```

Kiểm tra khác:

```text
JavaScript syntax: 1.391 file OK
Source bundles:    19/19 OK
Source-size budget: OK
Package lock registry: OK
```

`check:path-portability` vẫn báo 3 unresolved local require đã có sẵn trong ZIP Phase228; chạy trên ZIP đầu vào cho kết quả giống hệt. Phase229 không tạo thêm lỗi portability.

---

## 9. Audit production read-only

Chạy toàn bộ:

```bash
node scripts/audit-closeout-debt-adjustment-duplicate-ar-sale.js --json
```

Chạy riêng đơn:

```bash
node scripts/audit-closeout-debt-adjustment-duplicate-ar-sale.js \
  --order-code=B0039252 \
  --customer-code=5052875 \
  --json
```

Script xuất:

- customer/order identity
- canonical lookup keys
- legacy lookup keys
- `legacyIdentityCollapsed`
- raw/canonical balance trước adjustment
- expected debt/delta
- debit/credit đã post
- over-post amount
- AR-SALE ledger IDs hiện hữu
- excluded ledger reasons
- severity
- reversal plan

Script tuyệt đối không update/delete/reverse dữ liệu.

---

## 10. Query Mongo kiểm chứng

### 10.1. Xem AR-SALE và adjustment của B0039252

```javascript
db.arLedgers.find(
  {
    customerCode: "5052875",
    $or: [
      { orderCode: "B0039252" },
      { salesOrderCode: "B0039252" },
      { sourceCode: "B0039252" },
      { refCode: "B0039252" }
    ],
    category: { $in: ["AR-SALE", "AR-DEBT-ADJUSTMENT"] }
  },
  {
    _id: 1,
    id: 1,
    code: 1,
    category: 1,
    ledgerType: 1,
    sourceType: 1,
    sourceId: 1,
    sourceCode: 1,
    orderId: 1,
    orderCode: 1,
    salesOrderId: 1,
    salesOrderCode: 1,
    customerCode: 1,
    debit: 1,
    credit: 1,
    amount: 1,
    direction: 1,
    accountingConfirmed: 1,
    accountingStatus: 1,
    active: 1,
    reversed: 1,
    status: 1,
    idempotencyKey: 1,
    reason: 1,
    metadata: 1,
    createdAt: 1
  }
).sort({ createdAt: 1, _id: 1 })
```

### 10.2. Tìm adjustment closeout thường có nguy cơ duplicate

```javascript
db.arLedgers.find(
  {
    account: "AR",
    category: "AR-DEBT-ADJUSTMENT",
    ledgerType: "AR-DEBT-ADJUSTMENT",
    $or: [
      { sourceType: /^delivery_closeout$/i },
      {
        sourceModel: /^orderPaymentAllocations$/i,
        reason: /^order payment debt reconcile$/i
      }
    ]
  },
  {
    id: 1,
    code: 1,
    customerCode: 1,
    orderId: 1,
    orderCode: 1,
    sourceType: 1,
    sourceId: 1,
    sourceCode: 1,
    debit: 1,
    credit: 1,
    metadata: 1,
    createdAt: 1
  }
).sort({ createdAt: 1 })
```

---

## 11. Remediation ledger đã sai

Deploy Phase229 chỉ ngăn phát sinh sai mới. Ledger `AR-DEBT-ADJUSTMENT` đã posted vẫn tiếp tục nằm trong AR SSoT.

Nếu audit production xác nhận:

```text
canonicalBalanceBefore = 875.094
expectedDebtAmount     = 875.094
expectedDelta          = 0
postedDebit            = 875.094
overPostedAmount       = 875.094
```

thì kế hoạch kế toán an toàn là:

```text
Tạo reversal credit: 875.094
Tham chiếu original AR-DEBT-ADJUSTMENT ledger
```

Bắt buộc:

- Không hard delete.
- Không sửa debit/credit của ledger posted.
- Không tạo AR-SALE mới.
- Không loại adjustment khỏi read model.
- Reversal phải có idempotency key riêng và tham chiếu original ledger.
- Chỉ apply sau khi kế toán duyệt kết quả audit production.

Phase229 không tự áp dụng reversal.

---

## 12. Rủi ro và rollback

### Rủi ro

Thấp. Thay đổi chỉ tác động identity resolution và guard trước AR debt adjustment posting.

### Rollback code

Có thể rollback 2 file runtime:

```text
src/domain/ar/arOrderIdentity.js
src/services/accounting/OrderPaymentDebtReconcileService.js
```

Tuy nhiên rollback sẽ mở lại lỗi P0 nhân đôi công nợ trong closeout thường.

### Dữ liệu

Không có migration và không thay đổi dữ liệu khi deploy.

---

## 13. Xác nhận hồi quy

- Phase226 `AR-RECEIPT` vẫn nằm trong canonical balance.
- Phase227 correction ID vẫn không thay business-order identity.
- Bulk/manual correction vẫn dùng cùng resolver.
- Delta tăng/giảm nợ thật vẫn post đúng phần chênh lệch.
- Debt Zero Tolerance không thay đổi.
- Không sửa frontend Debt New.
- Không sửa FundBalanceReadService Phase228.

## 14. Kết luận

Lỗi không phải do `AR-DEBT-ADJUSTMENT` tự nhiên sai dấu và cũng không phải do Mongo session không nhìn thấy write.

Root cause là helper identity Phase227 đã dùng source-type exclusion để xóa luôn business-order keys khi closeout source aliases trùng `orderId/orderCode`.

Sau Phase229:

```text
AR-SALE 875.094 đã tồn tại
expected debt 875.094
→ current canonical balance 875.094
→ delta 0
→ skip NO_DEBT_DELTA
→ không tạo AR-DEBT-ADJUSTMENT
```
