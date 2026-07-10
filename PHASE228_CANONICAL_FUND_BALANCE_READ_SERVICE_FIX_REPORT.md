# PHASE228 — Canonical Fund Balance Read Service Fix Report

## 1. Phạm vi

Phase228 sửa riêng nghiệp vụ đọc số dư tại **Quỹ tiền → Sổ quỹ** và đồng bộ công thức với báo cáo tài chính. Không thay đổi writer `fundLedgers`, AR ledger, Debt New, Debt Collection, delivery closeout, inventory, return order hay mobile workflow.

Đầu vào: `MK-pro-phase227-bulk-debt-reconcile-canonical-balance-lookup-fix(1).zip`.

Đầu ra: `MK-pro-phase228-canonical-fund-balance-read-service-fix.zip`.

## 2. Root cause chính xác

### 2.1. Backend tính “tồn” từ phát sinh trong khoảng lọc

Runtime cũ tại `src/services/fundService.source/part-01.jsfrag`:

1. Dựng Mongo match có `date >= dateFrom` và `date <= dateTo`.
2. Group tổng thu/chi trên chính tập đã bị cắt theo khoảng ngày.
3. `summarizeFundLedgers()` trả:

```js
cashBalance = cashIn - cashOut;
bankBalance = bankIn - bankOut;
```

Do không có số dư đầu kỳ, `cashBalance` và `bankBalance` thực chất là **phát sinh ròng trong kỳ**, không phải số dư lũy kế cuối ngày.

### 2.2. Frontend tự tính lại running balance từ 0

Runtime cũ tại `public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag`:

```js
const balances = { cash: 0, bank: 0 };
```

Frontend đảo các rows đang tải rồi cộng/trừ từ 0 để dựng “Tồn sau GD”. Kết quả phụ thuộc:

- `dateFrom`;
- keyword/direction filter;
- page/limit;
- số dòng backend thực sự trả về.

Frontend gửi `limit=1000` trong khi backend cap `200`, nên running balance còn có thể sai khi dữ liệu vượt 200 dòng.

### 2.3. Duplicate accounting logic

`FinanceReportService` đã có ý niệm opening/in/out/ending riêng, còn màn Quỹ dùng công thức khác. Hai read path cùng đọc `fundLedgers` nhưng không dùng cùng một contract, gây contract drift.

## 3. Runtime flow đã trace

```text
Quỹ tiền → Sổ quỹ
→ public/js/app/debt/07f-fund-ledger.js
→ GET /api/funds/ledger
→ src/routes/fundRoutes.js: GET /ledger
→ src/controllers/fundController.js:listLedger
→ src/services/fundService.js:listFundLedgers
→ src/services/accounting/FundBalanceReadService.js
→ src/repositories/fundLedgerRepository.js
→ MongoDB fundLedgers
→ response summary + absolute running balance
→ frontend chỉ render
```

Query parameters được hỗ trợ:

- Balance scope: `dateTo`, `fundType`, `bankAccountCode`/`fundAccountCode`/`account`, `tenantId` nếu có.
- Period/listing: `dateFrom`, `direction`, `sourceType`, `q/search`, `page`, `limit`.
- Timezone mặc định: `Asia/Ho_Chi_Minh`.

## 4. SSoT và field ngày canonical

### 4.1. SSoT

Nguồn duy nhất để tính số dư là collection `fundLedgers`.

Không đọc số dư từ orders, debtCollections, deliveryCloseouts, orderPaymentAllocations, frontend cache hoặc snapshot báo cáo.

### 4.2. Field ngày

Field ngày nghiệp vụ canonical của `FundLedger` hiện tại là:

```text
date: YYYY-MM-DD
```

Lý do:

- Schema `FundLedger` khai báo `date`.
- Managed indexes hiện có ưu tiên `date`.
- Writer và màn Quỹ hiện hành đều ghi/đọc theo `date`.

`createdAt` chỉ là fallback cho ledger legacy thiếu `date`; fallback được chuyển thành business date theo `Asia/Ho_Chi_Minh`. Không dùng `createdAt` để ghi đè một `date` hợp lệ.

Query theo date string `YYYY-MM-DD` có semantics half-open tương đương theo ngày nghiệp vụ: ledger có business date `<= dateTo` được tính; fallback `createdAt` được cắt trước đầu ngày kế tiếp theo timezone Việt Nam.

## 5. Phương án A đã triển khai

Tạo canonical service:

```text
src/services/accounting/FundBalanceReadService.js
```

Service chịu trách nhiệm duy nhất cho:

- opening balance;
- thu/chi trong kỳ;
- ending balance;
- số dư tiền mặt;
- số dư ngân hàng;
- tổng số dư;
- tổng hợp theo account;
- absolute running balance từng giao dịch;
- canonical active/confirmed policy;
- phân trang và listing-only filters;
- compatibility aliases cho consumer cũ.

Không tạo collection mới và không tạo snapshot quỹ.

## 6. Công thức trước và sau

### Trước Phase228

```text
Tồn hiển thị = Thu trong khoảng lọc - Chi trong khoảng lọc
```

### Sau Phase228

```text
Opening balance
= tổng signed amount hợp lệ trước dateFrom

In period
= tổng thu hợp lệ từ dateFrom đến dateTo

Out period
= tổng chi hợp lệ từ dateFrom đến dateTo

Ending balance
= Opening balance + In period - Out period
= tổng signed amount hợp lệ lũy kế đến hết dateTo
```

Service kiểm tra invariant cho từng account:

```text
openingBalance + inPeriod - outPeriod
=== cumulativeBalanceThroughDateTo
```

Nếu lệch, service phát `FUND_BALANCE_RECONCILIATION_FAILED` thay vì trả số sai im lặng.

## 7. Canonical fund ledger policy

Ledger chỉ được tính khi thỏa contract hiện tại:

- `active != false`;
- không deleted;
- không reversed/isReversal/reversalOf;
- status không thuộc draft, pending, submitted, voided, cancelled, deleted, removed, superseded, reversed;
- đã confirmed/posted theo một trong các field canonical hiện có;
- có amount hợp lệ;
- có business date hợp lệ.

Phase228 không thay đổi semantics writer hoặc reversal; chỉ gom read policy về một nơi.

## 8. Balance-scope filter và listing-only filter

### 8.1. Balance scope

Các filter này được phép thay đổi số dư:

- `dateTo`;
- `fundType`;
- account/bank account;
- tenant scope nếu hệ thống thực sự truyền vào.

### 8.2. Listing-only

Các filter sau chỉ thay đổi rows và filtered totals, không thay đổi ending balance toàn quỹ:

- keyword;
- direction Thu/Chi;
- sourceType;
- mã phiếu/NVGH/khách hàng/ghi chú;
- page/limit.

Response có field riêng:

```text
filteredRowsTotalIn
filteredRowsTotalOut
```

Không ghi đè vào `cashEndingBalance` hoặc `bankEndingBalance`.

## 9. Running balance và pagination

Backend sử dụng `$setWindowFields` theo partition:

```text
fundType + account
```

Thứ tự deterministic:

```text
business date ASC
createdAt ASC
_id ASC
```

Window running balance được tính **trước** khi áp dụng:

- `dateFrom`;
- keyword;
- direction;
- sourceType;
- skip/limit.

Sau đó rows mới được lọc và trả theo DESC cho UI. Vì vậy cùng một ledger luôn có cùng `runningBalanceAfterTransaction`, bất kể nằm ở trang nào hoặc query từ ngày nào.

Frontend đã bỏ hoàn toàn phép cộng/trừ từ 0 và chỉ render:

```js
row.runningBalanceAfterTransaction
```

## 10. API contract

### Canonical summary

```js
summary: {
  period: { dateFrom, dateTo, timezone },
  cashOpeningBalance,
  cashInPeriod,
  cashOutPeriod,
  cashEndingBalance,
  bankOpeningBalance,
  bankInPeriod,
  bankOutPeriod,
  bankEndingBalance,
  totalOpeningBalance,
  totalInPeriod,
  totalOutPeriod,
  totalEndingBalance,
  accounts,
  filteredRowsTotalIn,
  filteredRowsTotalOut
}
```

### Row

```js
{
  date,
  fundType,
  account,
  direction,
  amount,
  inAmount,
  outAmount,
  runningBalanceAfterTransaction
}
```

### Compatibility aliases

Các consumer cũ vẫn nhận:

```text
cashBalance = cashEndingBalance
bankBalance = bankEndingBalance
totalIn = totalInPeriod
totalOut = totalOutPeriod
totalBalance = totalEndingBalance
```

Không tồn tại công thức thứ hai cho aliases.

## 11. Frontend

Đã thay đổi:

- request limit từ 1000 về đúng contract 200;
- summary đọc canonical fields từ backend;
- cột “Tồn sau GD” đọc absolute running balance;
- nhãn hiển thị rõ `Tồn ... cuối ngày dateTo` và `Tổng ... trong kỳ`;
- bổ sung DOM refs cho label;
- cập nhật characterization snapshot có kiểm soát;
- không thay đổi lớn layout.

## 12. Đồng bộ FinanceReportService

`src/services/reports/FinanceReportService.js` hiện sử dụng cùng `FundBalanceReadService` cho:

- loading rows;
- canonical ledger filter;
- opening/in/out/ending;
- running balance;
- summary cash/bank/total.

Các wrapper export cũ được giữ để không phá consumer hiện tại, nhưng đều delegate sang canonical service.

## 13. Performance và index assessment

### Query count

Mỗi request màn Sổ quỹ dùng 2 Mongo aggregation:

1. Summary lũy kế/opening/in/out/ending.
2. Windowed rows + count + filtered totals trong một `$facet`.

Không có N+1.

### Memory

Runtime không load toàn bộ `fundLedgers` vào Node.js RAM. Summary và running balance được tính ở MongoDB; rows được giới hạn/paginate.

### Index hiện có

Managed index registry đã có:

```text
{ date: 1, fundType: 1, direction: 1 }
{ date: 1, status: 1, isDeleted: 1, deletedAt: 1 }
{ createdAt: -1 }
```

Phase228 dùng early match theo `date <= dateTo` và fallback `createdAt`, nên có thể tận dụng các index hiện có. Không thêm index mới để tránh conflict với managed index registry khi chưa có `explain()` trên production dataset.

### Lưu ý vận hành

`$setWindowFields` cần MongoDB hỗ trợ window functions. Cần chạy smoke test trên Atlas sau deploy. Không có kết nối production trong môi trường sửa ZIP nên chưa thể cung cấp live `explain()`.

## 14. Audit script read-only

Đã tạo:

```text
scripts/audit-fund-ending-balance-consistency.js
```

Ví dụ production read-only:

```bash
node scripts/audit-fund-ending-balance-consistency.js \
  --date-from-a=2026-07-09 \
  --date-from-b=2026-07-10 \
  --date-to=2026-07-10 \
  --timezone=Asia/Ho_Chi_Minh \
  --json
```

Fixture dry-run không update/delete và cho kết quả:

| Chỉ tiêu | 09–10/07 | 10–10/07 |
|---|---:|---:|
| Cash opening | 0 | 185.755.730 |
| Cash in period | 229.687.449 | 43.831.719 |
| Cash out period | 500.000 | 400.000 |
| **Cash ending** | **229.187.449** | **229.187.449** |
| Bank opening | 0 | 172.610.381 |
| Bank in period | 192.045.699 | 19.435.318 |
| Bank out period | 0 | 0 |
| **Bank ending** | **192.045.699** | **192.045.699** |

Kết quả:

```text
cashEndingMatch = true
bankEndingMatch = true
cashEndingDifference = 0
bankEndingDifference = 0
```

Severity fixture là `WARNING` vì script cố ý phát hiện công thức legacy range-net cho hai khoảng khác nhau; canonical ending balance đã khớp.

## 15. Test đã thêm và kết quả

### Test Phase228

`test/phase228-canonical-fund-balance-read-service.test.js` có 12 scenario bắt buộc:

1. Cùng dateTo, cùng ending balance.
2. Opening + in - out = ending.
3. Cash/bank độc lập.
4. Listing filter không đổi balance.
5. Fund scope filter.
6. Running balance không phụ thuộc dateFrom.
7. Pagination >200 ledger.
8. Timezone cuối ngày Việt Nam.
9. Loại ledger unconfirmed/inactive/reversal/cancelled/deleted.
10. Cash → bank transfer.
11. Compatibility aliases.
12. Finance report dùng cùng canonical service.

### Kết quả toàn bộ suite

```text
npm test
exit code: 0
Tổng: 1.848 test
Pass: 1.847
Skip theo thiết kế: 1
Fail: 0
```

### Quality gates

```text
check:source-bundles: 19/19 OK
check:source-size: OK
check:syntax: 1.389 JavaScript files OK
```

Standalone `check:csp-xss` vẫn trả exit code 1 do 4 inline-event-handler đã tồn tại từ chính baseline Phase227 tại các fragment 06/06b/06d. Chạy trên ZIP đầu vào cho cùng 489 findings và cùng 4 blockers; Phase228 không tạo blocker mới và không sửa lan sang các fragment đó.

## 16. Source-bundle governance

Canonical source đã sửa trước, sau đó chạy:

```bash
node scripts/build-source-bundles.js --refresh-hashes
node scripts/build-source-bundles.js --check
```

Kết quả 19/19 bundles hợp lệ.

Source/generated chính:

- `src/services/fundService.source/part-01.jsfrag` → `src/services/fundService.js`;
- `public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag`;
- `public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag`;
- generated `public/js/app/debt/07f-fund-ledger.js` và part bundle liên quan;
- `config/source-bundles.json` cập nhật hash.

## 17. Danh sách file tác động chính

### Backend

- `src/services/accounting/FundBalanceReadService.js` — mới.
- `src/services/fundService.source/part-01.jsfrag`.
- `src/services/fundService.js` — generated.
- `src/services/reports/FinanceReportService.js`.

### Frontend

- `public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag`.
- `public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag`.
- `public/js/app/debt/07f-fund-ledger.js` — generated.
- `public/js/app/debt/07f-fund-ledger.part03.js` — generated.
- `public/js/app/state/00b-debt-return-fund-state.js`.
- `public/fragments/index/04-index-body.html`.

### Governance/test/audit

- `scripts/audit-fund-ending-balance-consistency.js` — mới.
- `package.json`.
- `config/source-bundles.json`.
- `test/phase228-canonical-fund-balance-read-service.test.js` — mới.
- `test/fund-ledger-report-source.test.js`.
- `test/report-finance-fund-ledger-source.test.js`.
- `test/phase79-production-strangler.test.js`.
- `test/fixtures/index-page/phase79-assembled.sha256`.

## 18. Rủi ro và rollback

### Rủi ro

- Dataset rất lớn có thể làm window aggregation nặng hơn query range cũ; bù lại query có early date/scope match và pagination.
- Ledger legacy thiếu cả `date` và parseable `createdAt` sẽ bị loại, đúng hơn việc gán ngày giả nhưng cần audit production.
- Atlas phải hỗ trợ `$setWindowFields`.

### Rollback

Rollback bằng cách deploy lại ZIP Phase227. Phase228 không migration, không update/delete dữ liệu và không tạo snapshot, nên rollback code không cần rollback database.

Không khuyến nghị rollback sau khi kế toán đã dùng số dư canonical để đối chiếu, trừ khi có lỗi runtime nghiêm trọng, vì Phase227 hiển thị range net sai như tồn cuối ngày.

## 19. Xác nhận nghiệm thu

Với cùng:

```text
dateTo = 10/07/2026
```

hai query:

```text
09/07/2026 → 10/07/2026
10/07/2026 → 10/07/2026
```

trả cùng:

```text
cashEndingBalance = 229.187.449
bankEndingBalance = 192.045.699
```

Trong khi opening, inPeriod, outPeriod và rows được phép khác nhau.

Một ledger cụ thể có cùng `runningBalanceAfterTransaction` bất kể dateFrom, keyword, direction, page hoặc limit.

**Kết luận:** “Tồn tiền mặt” và “Tồn ngân hàng” sau Phase228 là số dư lũy kế cuối ngày `dateTo`, không còn là phát sinh ròng trong khoảng `dateFrom–dateTo`.

## 20. Xác nhận không rollback các phase AR

Phase228 không sửa:

- canonical AR category registry Phase226;
- AR-RECEIPT read model;
- canonical AR order lookup và anomaly guard Phase227;
- OrderPaymentDebtReconcileService;
- AR writer/idempotency.

Toàn bộ suite 1.848 test pass/skip như trên, không có regression AR.
