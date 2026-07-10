# PHASE226 — Debt Collection `AR-RECEIPT` Read Model Fix

## 1. Kết quả bàn giao

Phase226 đã sửa khoanh vùng lỗi:

```text
Thu nợ chờ kế toán xác nhận
→ phiếu đã accounting_confirmed
→ AR-RECEIPT đã được ghi vào arLedgers
→ Công nợ (New) vẫn không giảm
```

Giải pháp được triển khai theo **Phương án A — canonical AR category registry dùng chung**, không sửa frontend, không sửa trực tiếp MongoDB và không tạo nguồn công nợ thứ hai.

Kết quả fixture bắt buộc:

| Trường | Giá trị |
|---|---:|
| Customer | `4501680 — Chị Hiền` |
| Order | `B0038774` |
| Debt collection | `DC202607093145492952` |
| Nợ mở | 2.499.694 |
| AR receipt đã xác nhận | 2.499.694 |
| Số dư trước Phase226 | 2.499.694 |
| Số dư kỳ vọng sau Phase226 | **0** |

> Điều kiện để production về 0 ngay sau deploy: ledger hiện hữu phải là `AR-RECEIPT` hợp lệ, có `account=AR`, `accountingConfirmed=true`, `accountingStatus=confirmed`, `active=true`, không reversed/deleted/voided và có provenance debt collection (`refType/sourceType=debtCollection` hoặc `source=DebtCollectionPostingService`). Không cần sửa hoặc tạo lại dữ liệu nếu các trường này đã đúng.

---

## 2. Tổng quan dự án

- Kiến trúc: Node.js/Express monolith.
- Database: MongoDB/Mongoose.
- Accounting SSoT: `arLedgers`.
- Quy mô source sau Phase226: 1.884 file, khoảng 15 MB, không tính `node_modules`.
- Khu vực chính được audit:
  - `src/services/DebtCollectionService.js`
  - `src/engines/posting.engine.js`
  - `src/services/arLedgerRead.service.js`
  - `src/domain/ar/arLedgerQueryPolicy.js`
  - `src/domain/ar/arLedgerValidator.js`
  - `src/services/v2/debtNew.service.js`

Không thay đổi UI, inventory, return order, delivery closeout, quỹ tiền, reward report Phase225 hoặc source bundle không liên quan.

---

## 3. Root cause chính xác

### 3.1. Writer/read-model category mismatch

Writer `postReceiptAR()` ghi đúng:

```js
category: 'AR-RECEIPT'
ledgerType: 'AR-RECEIPT'
debit: 0
credit: allocatedAmount
accountingConfirmed: true
accountingStatus: 'confirmed'
active: true
reversed: false
```

Nhưng danh sách category cục bộ trong Debt New thiếu `AR-RECEIPT`.

### 3.2. Có thêm hai gate runtime bị lệch contract

Audit runtime cho thấy chỉ thêm chuỗi `AR-RECEIPT` vào `ALLOWED_CATEGORIES` là chưa đủ:

1. `DebtNewService.listCustomers()` đọc qua `arLedgerReadService`.
2. `arLedgerReadService` trước đó dùng `buildCanonicalArLedgerMatch()` chỉ lấy nhóm Phase87 `AR-DEBT-*`.
3. `canProjectCanonicalAccountingLedgerToDebtReadModel()` chỉ cho detailed accounting category đi qua khi `sourceType=ORDER_PAYMENT_ALLOCATION`.
4. Receipt của debt collection được writer lưu với:
   - `sourceType=salesOrder` ở ledger theo từng allocation;
   - `refType=debtCollection`;
   - `source=DebtCollectionPostingService`.

Do đó receipt hợp lệ vẫn bị chặn trước bước group/sum.

### 3.3. Kết luận

Đây là lỗi **writer/read-model contract mismatch qua ba lớp**:

```text
Category registry cục bộ
+ Mongo query policy quá hẹp
+ Projection provenance policy chưa nhận debtCollection receipt
```

Không phải lỗi công thức frontend và không phải lý do để sửa số dư trên `customers`/`orders`.

---

## 4. Runtime flow đã trace

```text
Debt collection submit
→ DebtCollectionService.confirmDebtCollection
→ kiểm tra amount + available debt
→ tạo receiptDoc với allocations/staff/refType=debtCollection
→ ArPostingService.postReceipt
→ postingEngine.postReceiptAR
→ một AR-RECEIPT cho mỗi allocation
→ paymentRepository.upsert
→ collection arLedgers
→ DebtCollection cập nhật accounting_confirmed/arPosted/arLedgerIds
→ DebtNewService.listCustomers
→ arLedgerReadService.getActiveDebtReadModelLedgers
→ buildActiveDebtReadModelLedgerMatch
→ validate category + provenance + accounting contract
→ group theo customer/order
→ remainingDebt = tổng debit - tổng credit
→ Debt Zero Tolerance
→ frontend Công nợ (New)
```

Các invariant được giữ nguyên:

- `debtCollections` chỉ là chứng từ/workflow, không phải SSoT số dư.
- `arLedgers` là nguồn duy nhất tính công nợ.
- Pending chỉ gồm `submitted`, `under_review`.
- `accounting_confirmed` không bị trừ pending lần hai.
- Confirm lặp lại giữ idempotency hiện có.
- Staff filter dùng mã chính xác và alias code, không OR sang tên khi đã có mã.

---

## 5. Giải pháp đã triển khai

### Phương án A — Canonical category registry dùng chung (**đã triển khai**)

Tạo:

```text
src/domain/ar/arDebtCategoryRegistry.js
```

Registry phân loại:

#### Tăng công nợ

- `AR-DEBT-OPEN`
- `AR-SALE`

#### Giảm công nợ

- `AR-DEBT-PAYMENT`
- `AR-RECEIPT`
- `AR-RECEIPT-CASH`
- `AR-RECEIPT-BANK`
- `AR-RETURN`
- `AR-REWARD-ALLOWANCE`

#### Điều chỉnh

- `AR-DEBT-ADJUSTMENT`
- `AR-DEBT-VOID`

#### Loại khỏi active balance

- `AR-SALE-REVERSAL`
- `AR-RETURN-REVERSAL`
- `AR-RECEIPT-REVERSAL`
- ledger inactive/reversed/deleted/voided/cancelled.

Detailed category chỉ được project khi có provenance hợp lệ:

- `ORDER_PAYMENT_ALLOCATION`; hoặc
- receipt xác nhận từ `debtCollection`.

Cách này cho phép receipt của phiếu thu đi vào balance nhưng vẫn chặn receipt legacy từ closeout/correction.

### Phương án B — Chỉ thêm `AR-RECEIPT` vào mảng cục bộ (**không chọn**)

| Tiêu chí | Đánh giá |
|---|---|
| Effort | Easy |
| Lợi ích | Diff nhỏ |
| Nhược điểm | Không vượt qua strict query/projection gate thực tế |
| Rủi ro | Test cục bộ có thể xanh nhưng production vẫn lỗi |
| Kết luận | Không đủ để xử lý runtime hiện tại |

### Đánh giá phương án A

| Tiêu chí | Đánh giá |
|---|---|
| Effort | Medium |
| Maintainability | Cao — một registry thay cho nhiều danh sách lệch nhau |
| Accounting safety | Cao — exact category + provenance + active status |
| Performance | Query `$in` hữu hạn; code filter theo mã được push xuống Mongo |
| Rủi ro còn lại | Dữ liệu production cũ thiếu accounting/provenance field sẽ bị audit báo, không được tự động sửa |

---

## 6. Danh sách file code đã thay đổi

### File mới

1. `src/domain/ar/arDebtCategoryRegistry.js`
2. `scripts/audit-confirmed-debt-collections-missing-from-debt-read-model.js`
3. `test/phase226-debt-collection-ar-receipt-read-model.test.js`
4. `PHASE226_DRY_RUN_FIXTURE_RESULT.json`

### Artifact bàn giao

1. `PHASE226_DEBT_COLLECTION_AR_RECEIPT_READ_MODEL_FIX_REPORT.md`
2. `PHASE226_DEBT_COLLECTION_AR_RECEIPT_READ_MODEL_FIX.diff`
3. `PHASE226_DRY_RUN_FIXTURE_RESULT.json`

### File sửa

1. `src/domain/ar/arLedgerValidator.js`
2. `src/domain/ar/arLedgerQueryPolicy.js`
3. `src/services/arLedgerRead.service.js`
4. `src/services/v2/debtNew.service.js`
5. `src/utils/arLedgerCategoryEffect.util.js`
6. `src/engines/posting.dependencies.js`
7. `src/engines/posting.engine.js`
8. `test/helpers/phase79FakeModels.js`
9. `test/ar-receipt-mobile-delivery-canonical-contract-static.test.js`
10. `test/delivery-closeout-correction-contract-static.test.js`
11. `package.json`

Không thay đổi schema dữ liệu và không thêm migration ghi dữ liệu.

---

## 7. Diff logic trước/sau

### Trước Phase226

```text
Debt New local category list không có AR-RECEIPT
→ strict read service chỉ query AR-DEBT-*
→ validator chỉ bridge detailed category từ ORDER_PAYMENT_ALLOCATION
→ debtCollection AR-RECEIPT bị loại
→ credit 2.499.694 không tham gia phép cộng
→ remainingDebt vẫn 2.499.694
```

### Sau Phase226

```text
Debt New dùng ACTIVE_DEBT_READ_MODEL_CATEGORIES từ registry
→ read service dùng active debt query policy
→ Mongo chỉ đọc confirmed/active/not reversed/not deleted categories hợp lệ
→ validator nhận AR-RECEIPT có provenance debtCollection
→ group cùng canonical order B0038774
→ debit 2.499.694 - credit 2.499.694 = 0
→ Debt Zero Tolerance áp dụng sau tổng
→ khách không còn trong status=open
```

### Idempotency writer

Writer vẫn giữ một ledger trên mỗi allocation với key xác định từ collection/order. Phase226 chỉ thay literal category bằng constant registry; không thay đổi quy tắc upsert và không tạo receipt mới khi reload màn.

---

## 8. Test đã thêm và kết quả

### Test Phase226 chuyên biệt — 8/8 pass

1. `AR-RECEIPT` là active decrease category; reversal bị loại.
2. Chỉ debtCollection receipt hợp lệ được project; legacy closeout receipt bị chặn.
3. Mongo match có `AR-RECEIPT`; NVBH lọc theo exact code alias.
4. Full payment 2.499.694 → remaining debt 0 và không còn trong `status=open`.
5. Partial payment 10.000.000 − 2.499.694 = 7.500.306.
6. Pending chỉ `submitted`/`under_review`, không có `accounting_confirmed`.
7. Multi-allocation sinh một deterministic ledger/key cho mỗi đơn; replay không nhân đôi.
8. Dry-run fixture báo đúng mismatch cũ và số dư kỳ vọng 0.

### Regression tập trung

- 57/57 test liên quan debt/correction/read-model pass.

### Full project suite

```text
TAP groups: 23
Tests:      1.827
Pass:       1.826
Skipped:    1
Fail:       0
Cancelled:  0
```

### Static/build checks

```text
[source-bundles] OK 19 bundles
SYNTAX_OK 1383 JavaScript files
```

`node_modules` không được đóng vào ZIP bàn giao.

---

## 9. Query MongoDB kiểm chứng production — read-only

### 9.1. Kiểm tra debt collection

```javascript
db.debtCollections.find(
  {
    $or: [
      { code: "DC202607093145492952" },
      { id: "DC202607093145492952" }
    ]
  },
  {
    _id: 1,
    id: 1,
    code: 1,
    status: 1,
    accountingStatus: 1,
    accountingConfirmed: 1,
    accountingConfirmedAt: 1,
    arPosted: 1,
    arLedgerIds: 1,
    customerCode: 1,
    customerName: 1,
    amount: 1,
    allocations: 1,
    salesStaffCode: 1,
    salesStaffName: 1,
    deliveryStaffCode: 1,
    deliveryStaffName: 1
  }
).pretty()
```

Kỳ vọng tối thiểu:

```text
status = accounting_confirmed
accountingStatus = confirmed
accountingConfirmed = true
arPosted = true
arLedgerIds có dữ liệu
allocation B0038774 = 2.499.694
```

### 9.2. Kiểm tra AR ledger

```javascript
db.arLedgers.find(
  {
    $or: [
      { refCode: "DC202607093145492952" },
      { refId: "DC202607093145492952" },
      { sourceCode: "B0038774" },
      { orderCode: "B0038774" },
      { salesOrderCode: "B0038774" },
      { customerCode: "4501680" }
    ]
  },
  {
    _id: 1,
    id: 1,
    code: 1,
    account: 1,
    category: 1,
    ledgerType: 1,
    customerCode: 1,
    sourceType: 1,
    sourceId: 1,
    sourceCode: 1,
    salesOrderId: 1,
    salesOrderCode: 1,
    orderId: 1,
    orderCode: 1,
    debit: 1,
    credit: 1,
    amount: 1,
    direction: 1,
    accountingConfirmed: 1,
    accountingStatus: 1,
    active: 1,
    reversed: 1,
    status: 1,
    refType: 1,
    refId: 1,
    refCode: 1,
    source: 1,
    idempotencyKey: 1,
    salesStaffCode: 1,
    salesStaffName: 1,
    deliveryStaffCode: 1,
    deliveryStaffName: 1
  }
).sort({ createdAt: 1 }).pretty()
```

Receipt hợp lệ cần có:

```text
category/ledgerType = AR-RECEIPT
customerCode = 4501680
orderCode hoặc salesOrderCode/sourceCode = B0038774
credit = 2.499.694
debit = 0
accountingConfirmed = true
accountingStatus = confirmed
active = true
reversed != true
refType = debtCollection hoặc source = DebtCollectionPostingService
```

### 9.3. Kiểm tra duplicate idempotency

```javascript
db.arLedgers.aggregate([
  {
    $match: {
      category: "AR-RECEIPT",
      $or: [
        { refCode: "DC202607093145492952" },
        { refId: "DC202607093145492952" }
      ]
    }
  },
  {
    $group: {
      _id: {
        idempotencyKey: "$idempotencyKey",
        orderCode: { $ifNull: ["$salesOrderCode", "$orderCode"] }
      },
      count: { $sum: 1 },
      totalCredit: { $sum: "$credit" },
      ledgerIds: { $push: "$id" }
    }
  }
]).pretty()
```

Kỳ vọng: `count = 1` cho mỗi allocation/order.

---

## 10. Dry-run audit production

Script:

```text
scripts/audit-confirmed-debt-collections-missing-from-debt-read-model.js
```

Đặc tính:

- Chỉ dùng `.find()`/aggregate nội bộ tính toán.
- Không có `update`, `delete`, `insert`, `bulkWrite` hoặc repair tự động.
- Tìm phiếu `accounting_confirmed`, `arPosted=true`.
- Đối chiếu allocation với AR ledger.
- Báo receipt thiếu, category bị loại, provenance/contract bị reject hoặc số dư cũ khác số dư kỳ vọng.

Chạy riêng case production:

```bash
MONGO_URI="<mongodb-uri>" \
npm run audit:confirmed-debt-collection-receipts -- \
  --collection-code=DC202607093145492952 \
  --limit=20
```

Hoặc:

```bash
MONGO_URI="<mongodb-uri>" \
node scripts/audit-confirmed-debt-collections-missing-from-debt-read-model.js \
  --collection-code=DC202607093145492952 \
  --json
```

Chạy fixture offline:

```bash
node scripts/audit-confirmed-debt-collections-missing-from-debt-read-model.js \
  --fixture \
  --json
```

Kết quả fixture đã lưu tại:

```text
PHASE226_DRY_RUN_FIXTURE_RESULT.json
```

Kết quả chính:

```json
{
  "collectionCode": "DC202607093145492952",
  "customerCode": "4501680",
  "orderCode": "B0038774",
  "allocatedAmount": 2499694,
  "category": "AR-RECEIPT",
  "currentDebt": 2499694,
  "expectedDebt": 0,
  "mismatchReason": "AR_RECEIPT_CATEGORY_MISSING_FROM_PRE_PHASE226_READ_MATCH",
  "receiptProjectableAfterPhase226": true,
  "receiptActiveConfirmed": true
}
```

### Giới hạn xác minh

Môi trường audit hiện tại không có `MONGO_URI` production, nên không thể trung thực khẳng định nội dung document production đã đủ toàn bộ field. Code flow, contract và fixture đã được xác minh; query/script trên phải được chạy trên môi trường production để lấy evidence dữ liệu thật.

---

## 11. Xác nhận case Chị Hiền

Nếu query production xác nhận ledger hiện tại thỏa contract nêu trên, sau deploy Phase226:

```text
B0038774 debit  = 2.499.694
B0038774 credit = 2.499.694
raw remaining   = 0
normalized debt = 0
```

Kết quả:

- `totalDebt = 0`.
- `debtOrderCount = 0` theo semantics hiện tại.
- Khách `4501680` không còn xuất hiện trong bộ lọc `status=open`.
- Bộ lọc NVBH `39534` không còn hiển thị case này là khách còn nợ.
- Không cần post thêm receipt và không được sửa số công nợ trên customer/order.

Nếu audit báo receipt thiếu `accountingStatus`, provenance hoặc staff identity, cần sửa writer/data contract theo evidence riêng; không được tạo receipt trùng để che lỗi.

---

## 12. Checklist deploy

1. Backup/deploy theo quy trình hiện tại.
2. Chạy full test hoặc tối thiểu Phase226 test trên artifact deploy.
3. Chạy script audit với `--collection-code=DC202607093145492952`.
4. Mở Công nợ (New), tìm:
   - customer `4501680`; hoặc
   - order `B0038774`; hoặc
   - NVBH `39534`, `status=open`.
5. Xác nhận case không còn nợ.
6. Kiểm tra không có duplicate `AR-RECEIPT` theo idempotency query.
7. Chạy audit rộng hơn với limit phù hợp để tìm các phiếu confirmed khác từng bị bỏ qua.

### Rollback

Rollback code về Phase225 sẽ khiến receipt `AR-RECEIPT` tiếp tục bị bỏ khỏi Debt New, nhưng không làm biến đổi dữ liệu vì Phase226 không migration/write MongoDB.

---

## 13. Xác nhận không sửa lan

Phase226 không thay đổi:

- UI Công nợ (New).
- UI Thu nợ chờ kế toán xác nhận.
- Fund ledger/quỹ tiền.
- Delivery closeout nghiệp vụ.
- `orderPaymentAllocations` writer.
- Reward report Phase225.
- `returnOrders`.
- Inventory.
- Snapshot/fallback.
- Số dư lưu trên customers/orders.

Không tạo persisted read model mới; chỉ chuẩn hóa **query policy + category/provenance contract** của cùng SSoT `arLedgers`.
