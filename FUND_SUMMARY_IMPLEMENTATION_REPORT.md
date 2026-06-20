# BÁO CÁO TRIỂN KHAI — SỔ QUỸ TỔNG HỢP

## 1. Kết luận triển khai

Đã triển khai **Phương án A — production-grade** trên bản sao dự án `MK-pro-phase81-stock-card-query-reuse-clean-final(1).zip`.

Tính năng mới:

- Thêm tab **Sổ quỹ tổng hợp** trong module Quỹ.
- Mặc định lọc **ngày hiện tại theo Asia/Ho_Chi_Minh**.
- Tổng hợp thu/chi theo đúng người nộp hoặc người nhận.
- Tách riêng chuyển quỹ nội bộ, không làm tăng giả tổng nộp hoặc tổng chi.
- Có KPI, lọc, sắp xếp, phân trang, popup chi tiết và xuất Excel 2 sheet.
- Dùng `fundLedgers` làm Single Source of Truth và chỉ thực hiện truy vấn đọc.
- Không tạo collection tổng hợp, không ghi thêm ledger, không thay đổi số dư quỹ/công nợ/tồn kho/đơn hàng.

## 2. Tổng quan dự án

| Hạng mục | Kết quả khảo sát |
|---|---|
| Nền tảng | Node.js, Express, MongoDB/Mongoose |
| Quy mô | 958 file, 825 file JavaScript, chưa tính `node_modules` |
| Cấu trúc | Monolith chia controller, route, service, repository, model, frontend fragment/source-bundle |
| Xác thực | JWT/cookie auth; RBAC qua `requireRole(...)` |
| Quỹ SSoT | Collection `fundLedgers` |
| Build frontend/service | Có cơ chế source-bundle tại `config/source-bundles.json` |
| Excel | Hạ tầng `src/utils/excelWriter.util.js` |
| Test | Node test runner qua `scripts/run-tests.js` |

### Cấu trúc module Quỹ hiện tại

```text
src/models/FundLedger.js
src/models/ExpenseVoucher.js
src/controllers/fundController.js
src/routes/fundRoutes.js
src/services/fundService.source/
src/services/fundService.js
src/repositories/fundLedgerRepository.js
public/fragments/index/04-index-body.html
public/fragments/index/05-index-body.html
public/js/app/debt/07f-fund-ledger.source/
```

## 3. Báo cáo khảo sát nghiệp vụ và dữ liệu

### 3.1. Cách dữ liệu quỹ đang được ghi nhận

#### Phiếu nộp quỹ giao hàng

- Nguồn: `src/services/fundService.source/part-02.jsfrag`
- Các dòng ghi vào `fundLedgers` có:
  - `sourceType = DELIVERY_CASH_SUBMISSION`
  - `direction = in`
  - `deliveryStaffCode`, `deliveryStaffName`
- Đây là trường đối tượng nghiệp vụ đáng tin cậy; không dùng `createdBy` làm người nộp.

#### Nộp bù thiếu tiền giao hàng

- Nguồn: `src/services/fundService.source/part-02.jsfrag`
- `sourceType = DELIVERY_SHORTAGE_REPAYMENT`
- Người nộp được xác định bằng `deliveryStaffCode`, `deliveryStaffName`.

#### Phiếu chi

- Nguồn chứng từ: `ExpenseVoucher`
- Nguồn post: `confirmExpenseVoucher()` trong `src/services/fundService.source/part-03.jsfrag`
- Trước patch, dòng ledger chỉ có số tiền và tham chiếu chứng từ; `receiverName` nằm ở phiếu nguồn nên báo cáo có nguy cơ nhầm người nhận.
- Patch bổ sung metadata tương thích ngược:
  - `receiverCode`
  - `receiverName`
  - `receiverRole`
- Dữ liệu cũ được hydrate theo batch bằng `$lookup` từ `ExpenseVoucher`, không N+1.

#### Chuyển quỹ

- Nguồn: `confirmFundTransfer()` trong `src/services/fundService.source/part-03.jsfrag`
- Mỗi chứng từ tạo hai ledger:
  - `out` khỏi quỹ nguồn.
  - `in` vào quỹ đích.
- Cả hai dùng cùng `sourceType = FUND_TRANSFER` và cùng `sourceId/sourceCode`.
- Báo cáo khử trùng theo chứng từ và lấy giá trị chuyển tối đa một lần; không cộng vào thu/chi theo người.

#### Thu công nợ

- Luồng mới: `src/services/DebtCollectionService.js`
  - Có `collectorType`, `collectorCode`, `collectorName`.
  - Có `customerCode/customerName`, `salesStaffCode/salesStaffName`, `deliveryStaffCode/deliveryStaffName`.
- Luồng cũ: `postReceiptFundLedger()` trong `src/services/financialService.js`
  - Có `customerCode/customerName` và có thể có `staffName` của người ghi nhận.
- Patch ưu tiên:
  1. Collector thực tế nếu có.
  2. Payer/depositor/counterparty nếu có.
  3. Với `AR_RECEIPT`/`RECEIPT`, ưu tiên khách hàng nộp tiền trước generic `staffName`.
  4. NVBH chuẩn `salesStaffCode/salesStaffName`.
  5. Generic staff chỉ là fallback cuối, không dùng `createdBy`.

#### Thanh toán nhà cung cấp

- Service hiện có truyền `supplierCode/supplierName` vào posting.
- Patch bảo toàn metadata này trong `postFundLedger()` và dùng nó làm người nhận tiền đối với giao dịch chi.

### 3.2. Quy tắc xác định danh tính

Hàm tập trung:

```text
src/services/fundSummary.service.js
resolveFundCounterparty(entry)
```

Kết quả chuẩn:

```javascript
{
  personCode,
  personName,
  personRole,
  sourceField,
  personKey
}
```

Khóa nhóm:

```text
Có mã:  ROLE:CODE:PERSON_CODE
Thiếu mã: ROLE:NAME:normalized_name
Không rõ: UNKNOWN:UNIDENTIFIED
```

Hai người trùng tên nhưng khác mã không bị gộp. `createdBy` chỉ được hiển thị ở chi tiết với ý nghĩa người tạo, không được dùng làm đối tượng nộp/nhận.

### 3.3. Phân loại giao dịch

| Nhóm | Cách nhận diện |
|---|---|
| `DEPOSIT` | Direction hiệu lực là `in` |
| `EXPENSE` | Direction hiệu lực là `out` |
| `TRANSFER` | `sourceType = FUND_TRANSFER` hoặc transaction type transfer |
| `OTHER` | Không đủ căn cứ; loại khỏi tổng thu/chi thay vì suy đoán |

Ưu tiên loại chứng từ/source type trước, sau đó mới dùng direction. Dòng đảo có `isReversal`, amount âm hoặc source type mang dấu hiệu reversal sẽ đảo direction hiệu lực và bù trừ chứng từ gốc.

### 3.4. Trạng thái chứng từ

Được tính:

```text
posted, confirmed, accounting_confirmed, matched, trạng thái rỗng legacy
```

Không tính:

```text
draft, pending, submitted, cancelled/canceled, void, deleted,
isDeleted=true, deletedAt có giá trị
```

`status=reversed` chỉ được giữ nếu chính dòng đó mang dấu hiệu đảo rõ ràng; bản ghi gốc chỉ bị đánh dấu reversed sẽ bị loại.

### 3.5. Index

Index hiện có tại `src/services/mongoIndexService.js`:

```javascript
{ date: 1, fundType: 1, direction: 1 }
{ sourceType: 1, sourceCode: 1, fundType: 1, direction: 1 }
{ createdAt: -1 }
{ idempotencyKey: 1 } // unique sparse
```

Không thêm index mới vì truy vấn báo cáo đưa khoảng ngày/quỹ vào `$match` sớm và đã có index phù hợp. Việc thêm index khác khi chưa có `explain()` production sẽ làm tăng write cost không cần thiết.

### 3.6. Rủi ro đã phát hiện và cách xử lý

| Mức | Rủi ro | Xử lý |
|---|---|---|
| Critical | Hai dòng chuyển quỹ bị tính thành một phiếu nộp và một phiếu chi | Tách `TRANSFER`, gom theo source identity, chỉ đếm một lần |
| Major | Phiếu chi cũ không có mã người nhận ở ledger | `$lookup` phiếu nguồn theo batch, không N+1 |
| Major | Dùng `createdBy/staffName` nhầm thành người nộp | Resolver không fallback `createdBy`; `AR_RECEIPT` ưu tiên khách hàng |
| Major | Hai người cùng tên bị gộp | Khóa nhóm ưu tiên role + code |
| Major | Dòng đảo bị tính thành giao dịch mới | Chuẩn hóa direction hiệu lực và bù trừ cùng voucher |
| Major | Sai giao dịch đầu/cuối ngày do UTC | Chuyển ngày VN thành `[00:00 +07:00, ngày kế tiếp 00:00 +07:00)` |
| Medium | Dữ liệu số cũ dạng chuỗi/phân cách | Biểu thức tiền an toàn; số native giữ nguyên, chuỗi được chuẩn hóa |
| Medium | Truy vấn toàn lịch sử/N+1 | Mặc định hôm nay, `$match` sớm, `$lookup` batch, `$facet` phân trang |
| Medium | Metadata NVBH/supplier/collector bị service posting làm rơi | Bảo toàn các field tùy chọn trong `postFundLedger()` |

## 4. Thiết kế phương án

### Phương án A — Production-grade — Đã chọn

**Thiết kế**

- Service riêng `fundSummary.service.js`.
- MongoDB aggregation dùng chung cho tổng hợp, chi tiết và Excel.
- Resolver danh tính tập trung.
- Chuẩn hóa status/reversal/dedupe/transfer.
- API có validation, RBAC, pagination/sorting.
- Test nghiệp vụ, UI static và regression.

**Lợi ích**

- Một nguồn công thức duy nhất, giảm nguy cơ KPI lệch chi tiết/Excel.
- Chịu được dữ liệu legacy.
- Không N+1, không tải toàn bộ ledger lên Node.js.
- Dễ mở rộng thêm role/source type.

**Nhược điểm**

- Pipeline phức tạp hơn.
- Cần hiểu rõ source documents và identity priority.

**Effort:** Hard  
**Rủi ro:** Medium, đã giảm bằng test và read-only design.  
**Tương thích dữ liệu cũ:** Cao.

### Phương án B — Cân bằng effort — Không chọn

**Thiết kế**

- Tận dụng API list ledger hiện có.
- Tải một tập dữ liệu lên Node.js để group.
- Chỉ hydrate một số loại chứng từ.

**Lợi ích**

- Ít file hơn, triển khai nhanh.

**Nhược điểm**

- Nguy cơ memory cao khi dữ liệu lớn.
- Khó phân trang đúng sau group.
- Dễ lệch công thức giữa màn hình, chi tiết và Excel.
- Dễ phát sinh N+1 khi hydrate người nhận.

**Effort:** Medium  
**Rủi ro:** High khi dữ liệu tăng.  
**Tương thích dữ liệu cũ:** Trung bình.

## 5. Kiến trúc triển khai

### Luồng truy vấn

```text
HTTP query
  -> fundController
  -> normalizeFilters()
  -> buildNormalizedVoucherPipeline()
       $match ngày/trạng thái/quỹ/tenant
       $lookup metadata chứng từ nguồn theo batch
       $project/$addFields chuẩn hóa tiền, loại, người
       $group khử trùng ledger/voucher
       $match filter người/role/type
  -> $facet rows + totals + pagination
  -> JSON / popup chi tiết / Excel
```

### Tính chất read-only

`fundSummary.service.js` chỉ gọi:

```javascript
fundLedgerRepository.aggregate(...)
```

Không gọi `upsert`, `create`, `insert`, `update`, `delete`; việc mở tab/xem chi tiết/xuất Excel không thể phát sinh ledger mới.

## 6. Danh sách file thay đổi

### Backend/API

```text
src/services/fundSummary.service.js                         [mới]
src/controllers/fundController.js
src/routes/fundRoutes.js
src/models/FundLedger.js
src/models/ExpenseVoucher.js
src/services/fundService.source/part-01.jsfrag
src/services/fundService.source/part-02.jsfrag
src/services/fundService.source/part-03.jsfrag
src/services/fundService.js                                [file sinh từ source-bundle]
```

### Frontend

```text
public/fragments/index/04-index-body.html
public/fragments/index/05-index-body.html
public/fragments/index/07-index-body.html
public/index.shell.html
public/css/61-fund-summary.css                              [mới]
public/js/app/debt/07g-fund-summary.js                      [mới]
public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag
public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag
public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag
public/js/app/debt/07f-fund-ledger.js                       [file sinh]
public/js/app/debt/07f-fund-ledger.part02.js                [file sinh]
public/js/app/debt/07f-fund-ledger.part03.js                [file sinh]
```

### Tài liệu/build/test

```text
config/source-bundles.json
docs/openapi.json
test/fund-summary.test.js                                  [mới]
test/fund-summary-ui-static.test.js                        [mới]
test/fixtures/index-page/phase79-assembled.sha256
FUND_SUMMARY_IMPLEMENTATION_REPORT.md                       [mới]
```

Không thay package/dependency và không thêm collection mới.

## 7. Diff quan trọng

### 7.1. Route báo cáo

**Mã cũ**

```javascript
router.get('/ledger', viewFund, fundController.listLedger);
```

**Mã mới**

```javascript
router.get('/ledger', viewFund, fundController.listLedger);
router.get('/summary', viewFund, fundController.getSummary);
router.get('/summary/export', viewFund, fundController.exportSummary);
router.get('/summary/:personKey/transactions', viewFund, fundController.getSummaryTransactions);
```

**Lý do:** tái sử dụng đúng quyền xem Quỹ hiện hữu; route `export` đặt trước route động.

### 7.2. Metadata người nhận phiếu chi

**Mã cũ**

```javascript
postFundLedger({
  direction: 'out',
  sourceType: 'EXPENSE_VOUCHER',
  amount
});
```

**Mã mới**

```javascript
postFundLedger({
  direction: 'out',
  sourceType: 'EXPENSE_VOUCHER',
  amount,
  receiverCode: updated.receiverCode,
  receiverName: updated.receiverName,
  receiverRole: updated.receiverRole
});
```

**Lý do:** bút toán mới tự mô tả đúng người nhận; dữ liệu cũ vẫn dùng lookup phiếu nguồn.

### 7.3. Khóa danh tính

```javascript
if (personCode) return `${roleKey}:CODE:${personCode}`;
if (personName) return `${roleKey}:NAME:${normalizedName}`;
return 'UNKNOWN:UNIDENTIFIED';
```

**Lý do:** không gộp người trùng tên nhưng khác mã; dữ liệu cũ thiếu mã vẫn được giữ.

### 7.4. Chuyển quỹ

```javascript
if (transactionClass === 'TRANSFER') {
  // Cùng voucherKey chỉ lấy amount một lần.
  current.amount = Math.max(current.amount, Math.abs(transaction.amount));
}
```

**Lý do:** một chứng từ chuyển tạo hai ledger nhưng chỉ là một nghiệp vụ nội bộ.

### 7.5. Khoảng ngày Việt Nam

```javascript
const start = new Date(`${fromDate}T00:00:00+07:00`);
const end = new Date(`${nextDay}T00:00:00+07:00`);
// $gte start, $lt end
```

**Lý do:** không mất giao dịch sát 00:00 hoặc 23:59:59.

## 8. API contract

### 8.1. Tổng hợp

```http
GET /api/funds/summary
```

Query:

```text
fromDate        YYYY-MM-DD, mặc định hôm nay
ToDate/toDate   YYYY-MM-DD, mặc định fromDate
personCode      mã người chính xác
q               tìm theo mã hoặc tên
personRole      nvbh|nvgh|accountant|cashier|supplier|customer|other|unknown
transactionType all|deposit|expense|transfer
fundCode        cash|bank hoặc mã quỹ hợp lệ
page            >= 1
limit           1..200
sortBy          personName|depositedAmount|depositVoucherCount|expenseAmount|
                expenseVoucherCount|netAmount|lastTransactionAt|internalTransferAmount
sortOrder       asc|desc
```

Response mẫu:

```javascript
{
  success: true,
  filters: {
    fromDate: '2026-06-20',
    toDate: '2026-06-20',
    personCode: '',
    personRole: '',
    q: '',
    transactionType: 'all',
    fundCode: '',
    sortBy: 'netAmount',
    sortOrder: 'desc'
  },
  totals: {
    totalDeposited: 0,
    totalExpense: 0,
    netAmount: 0,
    totalPeople: 0,
    depositVoucherCount: 0,
    expenseVoucherCount: 0,
    internalTransferAmount: 0,
    internalTransferCount: 0
  },
  rows: [{
    personKey: 'DELIVERY:CODE:GH01',
    personCode: 'GH01',
    personName: 'Nguyễn Văn A',
    personRole: 'NVGH',
    depositedAmount: 1000000,
    depositVoucherCount: 2,
    expenseAmount: 100000,
    expenseVoucherCount: 1,
    netAmount: 900000,
    internalTransferAmount: 0,
    lastTransactionAt: '2026-06-20T08:00:00.000Z'
  }],
  pagination: { page: 1, limit: 50, totalRows: 1, totalPages: 1 }
}
```

### 8.2. Chi tiết theo người

```http
GET /api/funds/summary/:personKey/transactions
```

Dùng cùng filter ngày, loại giao dịch, quỹ, role và cùng pipeline chuẩn hóa. Response có `transactions`, `totals`, `pagination`.

### 8.3. Excel

```http
GET /api/funds/summary/export
```

Kết quả:

```text
So_quy_tong_hop_dd-mm-yyyy_den_dd-mm-yyyy.xlsx
```

Hai sheet:

```text
Tong_hop
Chi_tiet
```

Cả hai có dòng tổng cộng và dùng chung pipeline với API màn hình.

### 8.4. Phân quyền

```text
admin, accountant, manager: được xem/tải Excel
role khác: HTTP 403
```

### 8.5. Error response

```javascript
{
  success: false,
  ok: false,
  code: 'INVALID_DATE',
  message: 'Từ ngày không hợp lệ, định dạng yêu cầu YYYY-MM-DD'
}
```

Validation lỗi trả 400. Lỗi hệ thống trả 500 và không lộ exception trong production.

## 9. Giao diện

Tab mới dùng cùng `fund-tab-nav`, toolbar, nút, bảng và modal của module Quỹ.

Có:

- Từ ngày / Đến ngày.
- Tìm mã hoặc tên người.
- Vai trò.
- Loại giao dịch.
- Quỹ.
- Tìm kiếm / Đặt lại / Xuất Excel.
- 7 KPI, gồm 6 KPI bắt buộc và chỉ tiêu chuyển quỹ nội bộ.
- Bảng tổng hợp, sort, phân trang.
- Nút **Xem chi tiết** mở modal.

Khi mở tab lần đầu, frontend thiết lập ngày hiện tại tại Việt Nam và chỉ tải phạm vi một ngày; không tải toàn bộ lịch sử.

## 10. Kết quả kiểm thử

### 10.1. 18 trường hợp bắt buộc

| # | Test case | Kết quả |
|---:|---|---|
| 1 | Một người nộp nhiều phiếu | Pass |
| 2 | Một người nhận nhiều phiếu chi | Pass |
| 3 | Một người vừa nộp vừa nhận | Pass |
| 4 | Trùng tên, khác mã | Pass |
| 5 | Dữ liệu cũ thiếu mã | Pass |
| 6 | Chưa xác định người | Pass |
| 7 | Hủy/nháp/deleted | Pass |
| 8 | Đảo/hoàn tác | Pass |
| 9 | Chuyển quỹ hai dòng | Pass |
| 10 | Dedupe reference/idempotency | Pass |
| 11 | Timezone một ngày | Pass |
| 12 | Biên 00:00 và 23:59:59 | Pass |
| 13 | KPI bằng tổng dòng | Pass |
| 14 | Chi tiết bằng tổng hợp | Pass |
| 15 | Không có quyền trả 403 | Pass |
| 16 | Query sai trả 400 | Pass |
| 17 | Dữ liệu lớn/phân trang/no N+1 | Pass |
| 18 | Không ghi thêm fundLedgers | Pass |

Bổ sung:

- NVBH chuẩn được ưu tiên hơn generic staff: Pass.
- `AR_RECEIPT` cũ ưu tiên khách hàng thay vì người nhập phiếu: Pass.
- 5 test tích hợp UI/static/source-bundle: Pass.

**Bộ test riêng tính năng: 25/25 Pass.**

### 10.2. Quality gate

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | Pass — 825 JS files |
| `npm run check:source-bundles` | Pass — 18 bundles |
| `npm run check:path-portability` | Pass |
| `npm run check:enterprise` | Pass |
| `npm run check:source-size` | Pass |
| `npm run docs:check` | Pass — 306 operations |
| `npm audit --omit=dev --audit-level=high` | Pass — 0 vulnerabilities |
| `npm test` | 730/734 Pass |

### 10.3. Bốn lỗi tồn tại trước patch

Đã đối chiếu trực tiếp với ZIP gốc; bốn lỗi sau không do tính năng Sổ quỹ tổng hợp:

1. `dms-inventory-live-current.test.js`: kỳ vọng cache version cũ `phase71-dms-live-inventory-v1`, trong ZIP gốc đã dùng `ui-toolbar-inventory-v1`.
2. `import-preview-full-row-pagination-static.test.js`: test kỳ vọng `payload.importMode`, trong ZIP gốc worker đã dùng `activePayload.importMode`.
3. `import-selective-update-static.test.js`: cùng kỳ vọng import worker cũ.
4. `sales-order-decimal-price-input.test.js`: kỳ vọng cache version `phase79b-source-shards-v1`, trong ZIP gốc một số sales script đã dùng cache version khác.

Không sửa bốn lỗi này để tránh refactor/vá lan ngoài phạm vi Quỹ.

## 11. Đánh giá side effect

| Vùng | Ảnh hưởng |
|---|---|
| Số dư quỹ | Không thay đổi; report read-only |
| Phiếu thu/nộp | Không đổi business rule; chỉ bảo toàn metadata tùy chọn đã có |
| Phiếu chi | Không đổi cách post hoặc số tiền; thêm mã/vai trò người nhận tùy chọn |
| Chuyển quỹ | Không đổi hai dòng ledger hiện có; chỉ thay cách đọc báo cáo |
| Công nợ | Không ghi AR, không sửa số dư; chỉ hydrate metadata nguồn |
| Tồn kho | Không truy cập/không thay đổi |
| Đơn hàng | Không truy cập/không thay đổi trạng thái |
| Quyền truy cập | Dùng đúng `viewFund`: admin/accountant/manager |
| Dữ liệu cũ | Hỗ trợ fallback name, source lookup, unknown bucket |
| Hiệu năng | `$match` sớm, aggregation, `$facet`, no N+1, phân trang |
| Package/schema DB | Không thêm package, không tạo collection/migration bắt buộc |

## 12. Tiêu chí nghiệm thu

| Tiêu chí | Trạng thái |
|---|---|
| Tab xuất hiện đúng module Quỹ | Đạt |
| Mặc định ngày hiện tại | Đạt |
| Tổng hợp đúng theo người | Đạt |
| Phân biệt người nộp/người nhận | Đạt |
| Trùng tên khác mã không gộp | Đạt |
| Transfer không tăng giả thu/chi | Đạt |
| Chứng từ hủy không tính | Đạt |
| KPI bằng bảng | Đạt |
| Chi tiết bằng tổng hợp | Đạt |
| Không phát sinh ledger | Đạt |
| Không đổi số dư | Đạt |
| Không N+1 | Đạt |
| Excel 2 sheet | Đạt |
| Regression tính năng Quỹ mới | Đạt |

## 13. Ghi chú triển khai production

- Không cần migration bắt buộc; các field metadata mới đều optional.
- Nên chạy `npm run mongo:index-audit` trên môi trường production trước khi cân nhắc index mới.
- Sau deploy, kiểm tra một ngày thực tế bằng cách đối chiếu:
  1. Tổng dòng `fundLedgers` hợp lệ theo ngày.
  2. KPI màn hình.
  3. Tổng sheet `Tong_hop`.
  4. Tổng sheet `Chi_tiet`.
- Bốn lỗi baseline ở mục 10.3 nên xử lý ở task riêng để không trộn phạm vi.
