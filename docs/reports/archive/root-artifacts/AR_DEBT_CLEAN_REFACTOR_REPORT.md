# AR Debt Clean Refactor Report

## 1. Executive Summary

Đã làm sạch critical path màn Công nợ theo hướng:

```text
arLedgers canonical → Debt API aggregate trực tiếp → UI Công nợ
```

Màn Công nợ không còn dùng `arDebtOrders/arDebtCustomers` làm nguồn chính. Hai collection này vẫn có thể tồn tại để audit/reconcile hoặc compatibility script, nhưng không còn là điều kiện bắt buộc để UI Công nợ hiển thị dữ liệu.

Kết luận source: **CONDITIONAL-GO** cho luồng Công nợ sau refactor.

Điều kiện còn lại trước production: chạy audit DB thật, xử lý các ledger bẩn cũ, đặc biệt các `AR-RECEIPT` thiếu contract trước đây.

## 2. Root Cause

Lỗi thực tế không phải do Mongo không ghi. DB có `arLedgers`, nhưng màn Công nợ đang đi qua read model phụ:

```text
arLedgers → arDebtOrders/arDebtCustomers → UI Công nợ
```

Khi `arDebtOrders/arDebtCustomers` rỗng hoặc stale, UI Công nợ hiển thị 0 dù `arLedgers` đã có `AR-SALE`.

Ngoài ra `posting.engine.postReceiptAR()` tạo `AR-RECEIPT` thiếu canonical contract:

```text
category: ""
ledgerType: ""
entryType: ""
```

Dòng receipt bẩn này không được tính vào canonical debt.

## 3. New Architecture

Luồng mới:

```text
AR-SALE / AR-RECEIPT / AR-RETURN / REVERSAL
→ arLedgers canonical
→ DebtReportService.debtCustomers/debtCustomerDetail
→ arCustomerDebtReadModel.service aggregate trực tiếp
→ UI Công nợ
```

Nguồn bị loại khỏi critical path UI Công nợ:

```text
arDebtOrders
arDebtCustomers
salesOrders.remainingDebt/debtAmount
master_orders CN
delivery formula CN
```

## 4. Files Changed

| File | Nội dung |
|---|---|
| `src/services/reports/DebtReportService.js` | Chuyển `debtCustomers` và `debtCustomerDetail` sang `arCustomerDebtReadModel`, không gọi `phase79ArDebtReadModel.getDebtCustomers/getDebtOrders` nữa. |
| `src/services/accounting/arCustomerDebtReadModel.service.js` | `loadLedgerRows()` dùng `arLedgerRead.service.getCanonicalArLedgers()`; chỉ nhận ledger canonical; đồng bộ test model với `arLedgerReadService`. |
| `src/engines/posting.engine.js` | `postReceiptAR()` sinh `AR-RECEIPT` canonical đầy đủ `category/ledgerType/entryType/active/reversed/sourceId/sourceCode`; validate bằng canonical validator trước upsert. |
| `src/engines/posting.dependencies.js` | Thêm dependency `arLedgerContractValidation` để `posting.engine` không require trực tiếp trong static runtime test. |
| `scripts/audit-ar-debt-cleanliness.js` | Script dry-run audit rác công nợ/ledger, không sửa DB. |
| `scripts/plan-ar-debt-cleanup.js` | Script dry-run lập plan cleanup, không apply. |
| `test/debt-screen-direct-ar-ledger-source.test.js` | Regression test: `arDebtOrders/arDebtCustomers` rỗng nhưng Debt API vẫn trả dữ liệu từ `arLedgers`. |
| `test/ar-receipt-mobile-delivery-canonical-contract-static.test.js` | Guard cho `AR-RECEIPT` mobile delivery canonical. |
| `test/ar-customer-debt-read-model-ssot.test.js` | Fixture test chuyển sang ledger canonical đầy đủ contract. |
| `test/ar-ledger-active-category-contract.test.js` | Fixture test chuyển sang ledger canonical đầy đủ contract. |
| `test/debt-report-salesman-not-fallback-to-delivery-staff.test.js` | Fixture AR-SALE thêm contract canonical. |

## 5. Ledger Canonical Contract

Debt API chỉ tính ledger hợp lệ:

```text
account = AR
accountingConfirmed = true
accountingStatus = confirmed
active = true
reversed != true
category/ledgerType/entryType/sourceId/sourceCode/customerCode/idempotencyKey đầy đủ
validateArLedgerContract(row).ok = true
```

Các ledger bẩn như `AR-RECEIPT` có `category: ""` sẽ bị loại và được audit bằng script.

## 6. Aggregate Logic

Công thức:

```text
remainingDebt = sum(debit) - sum(credit)
```

Theo đơn: group theo `sourceId` canonical.

Theo khách: group theo `customerCode`.

Mapping:

| Category | Ảnh hưởng |
|---|---:|
| `AR-SALE` | debit, tăng nợ |
| `AR-RECEIPT` | credit, giảm nợ |
| `AR-RETURN` | credit, giảm nợ |
| `AR-SALE-REVERSAL` | credit, giảm nợ |
| `AR-RETURN-REVERSAL` | debit, tăng lại nợ |

Regression đã chứng minh case:

```text
B0038442: 487.484.570 - 190.000.000 = 297.484.570
B0038355: 237.632.080
Total = 535.116.650
```

## 7. Deprecated Read Models

`arDebtOrders/arDebtCustomers` chưa bị xóa code ngay để tránh phá script Phase79/81 cũ. Tuy nhiên UI/API Công nợ chính không còn phụ thuộc chúng.

Vai trò còn lại:

```text
- audit/reconcile
- compatibility test cũ
- cleanup plan
```

Không dùng làm nguồn chính của màn Công nợ.

## 8. Cleanup Scripts

Thêm:

```bash
node scripts/audit-ar-debt-cleanliness.js
node scripts/plan-ar-debt-cleanup.js
```

Cả hai script đều **dry-run/report only**, không sửa DB.

Audit báo:

```text
totalArLedgers
canonicalArLedgers
dirtyArLedgers
dirtyByCategory
missingCategory
missingLedgerType
missingEntryType
missingActive
missingReversed
arDebtOrdersCount
arDebtCustomersCount
debtApiWouldReturnCustomers
debtApiWouldReturnOrders
sampleDirtyLedgers
sampleLedgerWithoutOrderKey
```

## 9. Tests Added / Updated

Thêm mới:

```text
test/debt-screen-direct-ar-ledger-source.test.js
test/ar-receipt-mobile-delivery-canonical-contract-static.test.js
```

Các test quan trọng pass:

```text
npm run check:syntax → PASS, SYNTAX_OK 1125 JavaScript files
npm test → PASS, 1311 pass, 0 fail, 1 skip
```

Chạy riêng nhóm trọng yếu:

```text
node --test test/debt-screen-direct-ar-ledger-source.test.js
node --test test/ar-receipt-mobile-delivery-canonical-contract-static.test.js
node --test test/ar-customer-debt-read-model-ssot.test.js
node --test test/ar-ledger-read-standard.test.js
node --test test/ar-sale-reaccounting-contract.test.js
node --test test/no-legacy-ar-debt-read.test.js
node --test test/debt-api-canonical-read-model.test.js
node --test test/phase81-debt-ui-read-model-display-fix.test.js
```

Kết quả: **30/30 pass**.

## 10. Static Guard / Audit Results

Đã chạy:

```bash
node scripts/audit-global-software-rules.js --strict
node scripts/audit-ar-access-violations.js --strict
node scripts/audit-inventory-access-violations.js --strict
node scripts/audit-fund-access-violations.js --strict
node scripts/audit-frontend-business-calculation.js --strict
```

Kết quả:

| Audit | P0 | P1 | P2 | Ghi chú |
|---|---:|---:|---:|---|
| Global rules | 0 | 0 | 0 | còn 5 P3 legacy compatibility |
| AR access | 0 | 0 | 0 | còn 5 P3 legacy compatibility |
| Inventory access | 0 | 0 | 0 | sạch |
| Fund access | 0 | 0 | 0 | sạch |
| Frontend business calculation | 0 | 0 | 0 | sạch |

## 11. Performance / Index

Cần kiểm tra/tạo index production bằng migration riêng, không apply tự động trong task này:

```js
db.arLedgers.createIndex({
  account: 1,
  accountingConfirmed: 1,
  active: 1,
  reversed: 1,
  category: 1,
  customerCode: 1
});

db.arLedgers.createIndex({
  account: 1,
  accountingConfirmed: 1,
  active: 1,
  reversed: 1,
  deliveryStaffCode: 1
});

db.arLedgers.createIndex({
  orderCode: 1,
  sourceCode: 1,
  sourceId: 1
});
```

## 12. Production DB Impact

Source mới không tự sửa ledger bẩn cũ.

Trước production cần chạy:

```bash
node scripts/audit-ar-debt-cleanliness.js
node scripts/plan-ar-debt-cleanup.js
node scripts/audit-ar-ledger-contract.js --dry-run --markdown
```

Nếu còn `AR-RECEIPT` thiếu contract, Debt API direct sẽ không tính dòng đó. Đây là đúng về mặt SSoT, nhưng cần repair plan để normalize dữ liệu cũ nếu muốn số nợ giảm theo receipt đã xác nhận.

## 13. Final Decision

**CONDITIONAL-GO** cho source code.

Điều kiện bắt buộc trước khi vận hành thật:

1. Deploy đúng ZIP source mới.
2. Chạy DB audit dry-run.
3. Xử lý/repair plan các ledger bẩn cũ, đặc biệt `AR-RECEIPT` thiếu contract.
4. Hard refresh UI Công nợ.
5. Kiểm tra lại case:
   - `B0038442` còn nợ 297.484.570 nếu receipt canonical.
   - `B0038355` còn nợ 237.632.080.
   - filter `deliveryStaffCode=ghnpp` trả đúng 2 khách.
