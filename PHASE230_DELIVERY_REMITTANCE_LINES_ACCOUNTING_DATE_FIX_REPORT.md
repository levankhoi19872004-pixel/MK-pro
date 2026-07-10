# PHASE230 — Delivery Remittance Lines & Accounting Date Fix

## 1. Phạm vi và tổng quan dự án

- Dự án: MK-Pro, Node.js/Express monolith, MongoDB/Mongoose-compatible repositories, frontend JavaScript thuần.
- Quy mô bản Phase230 sau sửa: khoảng 1.909 file, 1.396 file JavaScript, 546 file test, dung lượng source khoảng 16 MB.
- Phạm vi Phase230 chỉ tập trung vào:
  - Quỹ tiền → Nộp quỹ giao hàng.
  - Tạo/sửa/xác nhận phiếu nộp quỹ.
  - Ghi `fundLedgers` theo ngày thực nhận.
  - Tích hợp với `FundBalanceReadService` của Phase228.
- Không thay đổi AR ledger, Debt New, Debt Collection, delivery closeout debt reconcile, inventory, return order, reward report, VNPT invoice hoặc mobile sales workflow.

## 2. Root cause chính xác

### 2.1. Contract cũ gộp nghĩa vụ giao hàng và thời điểm tiền vào quỹ

Phiếu nộp quỹ cũ chỉ lưu một ngày nghiệp vụ chính là `deliveryDate`. Khi xác nhận, writer dùng ngày giao để tạo `fundLedger.date`.

Với case:

```text
deliveryDate   = 2026-07-09
ngày thực nộp = 2026-07-10
cash           = 15.533.000
```

bút toán bị ghi ngược về 09/07. Vì `FundBalanceReadService` Phase228 đọc chính xác từ `fundLedgers`, writer ghi sai ngày sẽ làm tồn cuối ngày 09/07 bị thay đổi hồi tố.

### 2.2. Một phiếu chỉ có hai tổng cash/bank

Contract cũ dùng:

```text
submittedCashAmount
submittedBankAmount
```

nên không biểu diễn được:

- Tiền mặt và ngân hàng thực nhận khác ngày.
- Cùng một phương thức nộp nhiều lần.
- Xác nhận từng dòng độc lập.
- Một phần đã ghi quỹ, phần còn lại vẫn chờ nộp.

### 2.3. Idempotency chưa có line identity

Identity cũ chủ yếu gắn theo phiếu/ngày giao/NVGH và fund type. Cách này không đủ để phân biệt nhiều lần nộp cash hoặc bank trong cùng một phiếu.

## 3. Runtime flow đã trace

```text
Frontend tab Nộp quỹ giao hàng
→ POST /api/funds/delivery-cash-submissions/preview
→ fundService.buildDeliverySubmissionDraft
→ tải báo cáo theo deliveryDate + deliveryStaffCode
→ POST /api/funds/delivery-cash-submissions
→ fundService.createDeliveryCashSubmission
→ DeliveryCashSubmission repository/model
→ PUT /api/funds/delivery-cash-submissions/:id (sửa draft/partial)
→ POST /api/funds/delivery-cash-submissions/:id/lines/:lineId/confirm
   hoặc POST /api/funds/delivery-cash-submissions/:id/confirm
→ fundService.confirmDeliveryRemittanceLine / confirmDeliveryCashSubmission
→ postDeliveryRemittanceLine
→ postFundLedger
→ fundLedgers
→ FundBalanceReadService Phase228
→ Sổ quỹ / tồn cash-bank cuối ngày
```

Model/collection hiện tại được tái sử dụng:

- Model: `DeliveryCashSubmission`.
- Collection qua flex repository hiện hữu của phiếu nộp quỹ giao hàng.
- SSoT số dư: `fundLedgers`.

## 4. Contract ngày trước và sau

### Trước Phase230

```text
deliveryDate = vừa là ngày giao, vừa bị dùng làm ngày tăng quỹ
confirmedAt  = timestamp audit
```

### Sau Phase230

```text
deliveryDate                 = ngày chuyến giao, dùng tính nghĩa vụ NVGH
remittanceLine.remittanceDate = ngày tiền thực tế vào quỹ/tài khoản
confirmedAt                  = timestamp thao tác xác nhận
fundLedger.date              = remittanceLine.remittanceDate
fundLedger.accountingDate    = remittanceLine.remittanceDate
fundLedger.deliveryDate      = deliveryDate
fundLedger.remittanceDate    = remittanceLine.remittanceDate
```

Invariant chính:

```text
Ngày giao chỉ xác định khoản phải nộp.
Ngày nộp của từng line mới là ngày kế toán tăng quỹ.
```

## 5. Thiết kế `remittanceLines`

Document phiếu giữ thông tin chuyến giao và có các dòng thực nhận:

```js
{
  deliveryDate: '2026-07-09',
  deliveryStaffCode: 'ghtp',
  reportCashAmount: 15533000,
  reportBankAmount: 0,
  remittanceLines: [
    {
      lineId: 'NQGHL-...',
      method: 'cash',
      fundType: 'cash',
      amount: 10000000,
      remittanceDate: '2026-07-10',
      status: 'confirmed',
      fundLedgerId: '...',
      idempotencyKey: 'FUND-DELIVERY-REMITTANCE:<submission>:<line>:CASH'
    },
    {
      lineId: 'NQGHL-...',
      method: 'cash',
      fundType: 'cash',
      amount: 5533000,
      remittanceDate: '2026-07-11',
      status: 'draft'
    }
  ]
}
```

Line status được chuẩn hóa:

```text
draft | submitted | confirmed | reversed | cancelled
```

Document status được suy ra:

```text
draft | pending | partially_confirmed | confirmed | cancelled
```

Ví dụ một dòng cash confirmed và một dòng bank chưa confirmed → `partially_confirmed`.

## 6. Posting và idempotency

Mỗi line confirmed tạo đúng một fund ledger:

```js
{
  fundType: line.method,
  direction: 'in',
  amount: line.amount,
  date: line.remittanceDate,
  accountingDate: line.remittanceDate,
  remittanceDate: line.remittanceDate,
  deliveryDate: submission.deliveryDate,
  sourceType: 'DELIVERY_CASH_SUBMISSION',
  sourceId: submission.id,
  sourceCode: submission.code,
  sourceLineId: line.lineId,
  accountingConfirmed: true,
  status: 'posted'
}
```

Idempotency key:

```text
FUND-DELIVERY-REMITTANCE:<submissionIdentity>:<lineIdentity>:CASH
FUND-DELIVERY-REMITTANCE:<submissionIdentity>:<lineIdentity>:BANK
```

Dự án đã có unique sparse managed index:

```text
uniq_fund_ledger_idempotency_key
```

Xác nhận lại/retry/concurrency không tạo ledger thứ hai.

## 7. Transaction và concurrency

Line confirmation chạy tuần tự trong Mongo transaction:

```text
đọc lại document trong session
→ kiểm tra trạng thái và immutable fields
→ validate ngày/phương thức/số tiền
→ kiểm tra/post idempotent fund ledger
→ cập nhật line status + fundLedgerId
→ tính lại document status
→ lưu document
```

Không dùng thao tác song song không an toàn trong cùng session.

## 8. Validation bắt buộc

Đã triển khai:

- `amount > 0`.
- Method chỉ nhận cash/bank và aliases đã kiểm soát.
- Chặn `remittanceDate < deliveryDate`.
- Chặn xác nhận ngày tương lai theo `Asia/Ho_Chi_Minh`.
- Chặn ngày thuộc kỳ quỹ đã khóa qua:
  - `FUND_ACCOUNTING_LOCKED_THROUGH_DATE`, hoặc
  - `ACCOUNTING_LOCKED_THROUGH_DATE`.
- Dòng đã posted không được sửa:
  - amount,
  - method/fund type,
  - remittance date,
  - bank account/reference.
- Sai ngày sau posted phải reversal + replacement, không update ledger cũ.

## 9. Partial/multiple remittance

### Nộp nhiều lần cùng phương thức

```text
Ngày giao 09/07
Cash 10.000.000 nộp 10/07
Cash  5.533.000 nộp 11/07
```

Kết quả:

- Tồn cash ngày 10 tăng 10.000.000.
- Tồn cash ngày 11 tăng 5.533.000.
- Không có ledger 15.533.000 ghi ngày 09/07.

### Cash và bank khác ngày

```text
Cash 10.000.000 ngày 10/07
Bank  5.533.000 ngày 11/07
```

Tạo hai ledger độc lập theo đúng fund type và accounting date.

## 10. Compatibility dữ liệu legacy

### Legacy confirmed đã có fund ledger

- Không đổi ngày ledger.
- Không post lại.
- Dựng `remittanceLines` read-only từ ledger hiện hữu.
- Đánh dấu `legacyDerived=true`.

### Legacy pending chưa có ledger

- Có thể dựng draft line từ tổng tiền cũ.
- Không tự suy đoán `remittanceDate = deliveryDate`.
- Nếu chưa có ngày thực nhận:
  - `remittanceDate=''`,
  - `manualReviewRequired=true`,
  - chặn confirm cho đến khi kế toán chọn ngày.

Không có migration write tự động khi startup.

## 11. Thay đổi frontend

Popup giữ hai field nguồn báo cáo:

- Ngày giao.
- Mã NV giao hàng.

Thay hai input tổng bằng line editor hỗ trợ:

- Thêm dòng tiền mặt.
- Thêm dòng ngân hàng.
- Số tiền từng dòng.
- Ngày nộp từng dòng.
- Tài khoản/tham chiếu ngân hàng.
- Xóa dòng draft.
- Xác nhận từng dòng.

Ngày nộp mặc định là ngày hiện tại tại Việt Nam, không mặc định bằng ngày giao.

Danh sách phiếu tách rõ:

- Ngày giao.
- Ngày nộp/nhận hoặc khoảng ngày nếu nhiều dòng.

Frontend không tính số dư quỹ; chỉ gửi workflow data và hiển thị kết quả backend.

## 12. Tích hợp Phase228 và Phase229

### Phase228

`FundBalanceReadService` tiếp tục là nguồn duy nhất tính số dư từ canonical `fundLedgers`.

Regression xác nhận:

- Pending line không vào quỹ.
- Confirmed line vào quỹ theo `remittanceDate`.
- Cùng `dateTo` vẫn cho cùng ending balance.

### Phase229

Canonical order identity guard cho delivery closeout vẫn hiện diện và test xanh. Phase230 không thay đổi AR reconcile.

## 13. File đã sửa/thêm

### Domain, model, repository

- `src/domain/fund/deliveryRemittanceLines.js` — mới.
- `src/models/DeliveryCashSubmission.js`.
- `src/models/FundLedger.js`.
- `src/repositories/deliveryCashSubmissionRepository.js`.
- `src/domain/settlement/DeliverySettlementService.js`.

### Service/API

- `src/services/fundService.source/part-01.jsfrag`.
- `src/services/fundService.source/part-01b.jsfrag` — shard mới.
- `src/services/fundService.source/part-02.jsfrag`.
- `src/services/fundService.source/part-02b.jsfrag` — shard mới.
- `src/services/fundService.source/part-03.jsfrag`.
- Generated `src/services/fundService.js`.
- `src/controllers/fundController.js`.
- `src/routes/fundRoutes.js`.
- `docs/openapi.json`.

### Frontend/source bundle

- `public/fragments/index/04-index-body.html`.
- `public/fragments/index/05-index-body.html`.
- `public/fragments/index/07-index-body.html`.
- `public/js/app/state/00b-debt-return-fund-state.js`.
- `public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag`.
- `public/js/app/debt/07f-fund-ledger.source/part-01b.jsfrag` — shard mới.
- `public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag`.
- `public/js/app/debt/07f-fund-ledger.source/part-02b.jsfrag` — shard mới.
- `public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag`.
- Generated runtime chunks `07f-fund-ledger.js`, `part02.js` … `part05.js`.
- `public/css/overrides/10-operational-04.css`.
- `config/source-bundles.json`.
- `CSP_XSS_SINK_INVENTORY.json` — generated inventory đồng bộ với UI mới; blocker count không tăng.

### Audit/test

- `scripts/audit-delivery-remittance-accounting-date.js` — mới, read-only.
- `package.json` — thêm audit command.
- `test/phase230-delivery-remittance-lines-accounting-date.test.js` — mới.
- Các static/regression test liên quan fund/source bundle/index snapshot được cập nhật theo thay đổi chủ đích.

## 14. Test và exit code

### Test Phase230 + regression trọng tâm

```text
41/41 pass
```

### Toàn bộ project

```text
Tests:     1.874
Pass:      1.873
Skip:      1 (theo thiết kế)
Fail:      0
Exit code: 0
```

### Source governance

```text
Source bundles: 19/19 OK
Source size budget: OK
JavaScript syntax: 1.396 file hợp lệ
```

### Gate tồn tại từ baseline

`check:path-portability` vẫn có đúng 3 unresolved local require trong test như Phase229; Phase230 không tăng thêm.

`check:csp-xss` vẫn có đúng 4 blocking inline handler đã tồn tại từ Phase229. Tổng findings tăng từ 489 lên 493 do UI mới, nhưng số blocker và vị trí blocker không đổi; không có blocker Phase230 mới.

## 15. Audit script read-only

Chạy production:

```bash
node scripts/audit-delivery-remittance-accounting-date.js \
  --delivery-date=2026-07-09 \
  --delivery-staff-code=ghtp \
  --json
```

Script so sánh:

- `deliveryDate`.
- declared `remittanceDate`.
- `fundLedger.date`.
- `fundLedger.accountingDate`.
- `confirmedAt`.

Severity:

```text
OK
WARNING_MISSING_REMITTANCE_DATE
P0_FUND_LEDGER_POSTED_ON_DELIVERY_DATE
P0_REMITTANCE_LEDGER_DATE_MISMATCH
```

Script không update/delete và `writesPerformed=0`.

## 16. Kết quả dry-run fixture

Fixture gồm 3 trường hợp:

| Trường hợp | Kết quả |
|---|---|
| Giao 09/07, khai báo nộp 10/07, ledger ngày 10/07 | `OK` |
| Khai báo nộp 10/07 nhưng ledger ghi ngày giao 09/07 | `P0_FUND_LEDGER_POSTED_ON_DELIVERY_DATE` |
| Legacy ledger không có remittance date | `WARNING_MISSING_REMITTANCE_DATE` |

Dry-run intentionally trả exit code 2 vì fixture chứa một P0 detector. Đây là hành vi đúng của audit script, không phải lỗi test.

## 17. Kế hoạch remediation dữ liệu cũ

Phase230 không tự sửa production.

Khi audit xác nhận ledger đã posted sai ngày:

```text
1. Tạo reversal ledger cho original ledger ở accounting date cũ.
2. Tạo replacement ledger cùng số tiền ở remittanceDate đúng.
3. Liên kết reversal/replacement với original submission, line và ledger.
4. Giữ nguyên audit trail.
```

Không hard delete, không update trực tiếp `date`, không sửa `createdAt`, không cộng replacement nếu chưa reversal original.

## 18. Performance và index assessment

- Danh sách phiếu dùng batch lookup shortage và fund ledger, không query ledger từng row.
- Confirmation từng line chạy tuần tự trong transaction.
- Không load toàn bộ collection.
- Không tạo collection hoặc snapshot mới.
- Không thêm index mới vì:
  - idempotency đã có unique sparse index trên `fundLedgers.idempotencyKey`;
  - lookup danh sách hiện đã batch theo source identity;
  - chưa có explain production chứng minh cần nested index mới.
- Khi dữ liệu tăng mạnh, có thể đánh giá thêm index `deliveryDate + deliveryStaffCode` và nested line fields bằng explain trước khi đưa vào managed index registry.

## 19. Hai phương án và quyết định

### Phương án A — Remittance lines production-grade — Đã triển khai

- Lợi ích: đúng ngày từng phương thức, hỗ trợ partial/multiple remittance, line idempotency, audit rõ.
- Nhược điểm: thay đổi model/UI/API rộng hơn.
- Effort: Hard.
- Rủi ro: Medium, đã giảm bằng compatibility view, transaction và regression suite.

### Phương án B — Một `remittanceDate` chung cho phiếu — Không chọn

- Lợi ích: ít sửa, effort Easy–Medium.
- Nhược điểm: không biểu diễn cash/bank khác ngày hoặc nhiều lần nộp; dễ tiếp tục tạo dữ liệu kế toán giả.
- Rủi ro dài hạn: High.

## 20. Rollback plan

Nếu cần rollback code:

1. Dừng xác nhận phiếu mới trong thời gian rollback.
2. Rollback application về Phase229.
3. Không xóa `remittanceLines` hoặc fund ledger đã ghi bởi Phase230.
4. Xác minh Phase229 có thể đọc compatibility totals.
5. Mọi ledger Phase230 đã posted vẫn phải được giữ nguyên; nếu cần sửa ngày, dùng reversal + replacement.

## 21. Kết luận nghiệm thu

Case:

```text
Ngày giao: 09/07/2026
Ngày thực nộp cash: 10/07/2026
Số tiền: 15.533.000
```

sau Phase230:

- Tồn cuối ngày 09/07 không tăng.
- Tồn cuối ngày 10/07 tăng 15.533.000.
- `fundLedger.date/accountingDate = 2026-07-10`.
- `fundLedger.deliveryDate = 2026-07-09`.

Cash và bank khác ngày tạo các ledger đúng quỹ, đúng ngày riêng của từng line.

**Ngày giao chỉ dùng xác định nghĩa vụ phải nộp của NVGH. Ngày nộp trên từng remittance line mới là ngày kế toán ghi tăng quỹ. `FundBalanceReadService` tiếp tục tính số dư duy nhất từ canonical `fundLedgers`.**

## 22. Giới hạn xác minh

Môi trường sửa ZIP không kết nối MongoDB production. Kết quả production phải được xác nhận bằng audit script read-only sau deploy. Không có dữ liệu production nào bị update/delete trong Phase230.
