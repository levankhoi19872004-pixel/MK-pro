# RETURN_AR_PIPELINE_REDESIGN_REPORT

## 1. Tổng quan dự án

- Baseline: `MK-pro-phase52-ar-return-confirmed-returnorder-ensure-fixed(2).zip`.
- Tech stack: Node.js/Express, MongoDB/Mongoose, repository layer, service/domain split dần.
- Module liên quan: `returnOrders`, `arLedgers`, delivery accounting, posting engine, reconcile/backfill scripts.
- Mục tiêu phase này: chuyển nghiệp vụ `returnOrders -> AR-RETURN` từ nhiều safety-net rải rác sang một pipeline rõ biên giới.

## 2. Hiện trạng trước khi sửa

### Điểm ghi/đảm bảo AR-RETURN cũ

| File | Hành vi cũ | Rủi ro |
|---|---|---|
| `src/engines/posting.engine.js` | Build và upsert trực tiếp AR-RETURN | Là low-level engine nhưng đang chứa business validation/idempotency |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Hydrate returnRows, safety-net tìm returnOrders confirmed, fallback từ salesOrder returnAmount | Có khả năng tạo AR-RETURN từ object ảo nếu thiếu returnOrders |
| `src/services/returnOrderLegacy.service.js` | Confirm kế toán phiếu trả gọi `postingEngine.postReturnOrderAR` | Phụ thuộc engine cũ |
| `scripts/backfill-ar-return-from-return-orders.js` | Backfill thủ công gọi engine | Có thể dùng logic cũ nếu engine không được gom lại |
| `scripts/repair-delivery-accounting-ar-ledgers.js` | Repair thiếu AR-RETURN gọi engine | Có thể tiếp tục vá theo case |
| `scripts/rebuild-ar-ledger.js` | Rebuild AR gọi engine | Cần được hưởng idempotency mới |

## 3. Thiết kế luồng mới

Pipeline mới:

```text
ReturnOrder confirmed
  -> returnArPostingService.validateReturnOrderForAR()
  -> returnArPostingService.buildReturnARLedgerEntry()
  -> active AR-RETURN lookup/idempotency guard
  -> paymentRepository.upsert(arLedgers)
  -> patch returnOrders.arPosted/arLedgerId
  -> audit log best-effort
  -> reconcile-return-ar dry-run/fix
```

Điểm quan trọng: `src/engines/posting.engine.js::postReturnOrderAR()` hiện chỉ còn là compatibility wrapper. Điểm build/upsert AR-RETURN thật nằm ở `src/services/accounting/returnArPostingService.js`.

## 4. File đã tạo/sửa

| File | Loại | Mục đích |
|---|---:|---|
| `src/services/accounting/returnArPostingService.js` | Tạo mới | Service duy nhất xử lý post AR-RETURN từ returnOrders |
| `src/engines/posting.engine.js` | Sửa | Biến `postReturnOrderAR()` thành wrapper delegating sang service mới |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Sửa | Chặn fallback tạo AR-RETURN từ salesOrder.returnAmount khi không có returnOrders SSoT |
| `src/models/ArLedger.js` | Sửa | Bổ sung field truy vết: `sourceModel`, `direction`, `ledgerType`, `category`, `returnOrderId`, `returnOrderCode`, `idempotencyKey` |
| `src/services/mongoIndexService.js` | Sửa | Thêm index hỗ trợ lookup/idempotency cho AR-RETURN |
| `scripts/reconcile-return-ar.js` | Tạo mới | Dry-run/fix đối chiếu returnOrders confirmed với arLedgers AR-RETURN |
| `package.json` | Sửa | Thêm script `reconcile:return-ar` và `reconcile:return-ar:fix` |
| `RETURN_AR_PIPELINE_REDESIGN_REPORT.md` | Tạo mới | Báo cáo phase |

## 5. Quy tắc validation mới

Một returnOrder chỉ được post AR khi:

- Có identity: `id/code/returnOrderId/returnOrderCode`.
- Là nguồn returnOrders thật: `sourceModel=returnOrders`, `source=returnOrders`, `sourceType=returnOrder`, mã `RO-*`/`THH*`, hoặc có items.
- Không thuộc trạng thái inactive/cancelled/deleted/cleared.
- Đã kế toán xác nhận: `accountingConfirmed=true` hoặc `accountingStatus in confirmed/locked/posted/accounting_confirmed`.
- Có `customerId` hoặc `customerCode`.
- Số tiền > 0.

## 6. Quy tắc amount

Thứ tự ưu tiên số tiền:

```text
amount -> debtReduction -> returnAmount -> totalReturnAmount -> totalAmount -> returnedAmount -> totalValue -> items
```

Nếu nhiều field số tiền dương nhưng lệch nhau, service không im lặng bỏ qua. Ledger entry sẽ có:

- `amountField`
- `amountWarnings`

Reconcile sẽ tiếp tục đưa case lệch vào báo cáo.

## 7. Idempotency

Ledger mới có:

```text
idempotencyKey = AR-RETURN:<returnOrderCode hoặc returnOrderId>
```

Khi re-accounting có `forceRepostReturn + accountingBatchId`:

```text
idempotencyKey = AR-RETURN:<returnOrderKey>:<accountingBatchId>
```

Hiện tại index thêm là non-unique để tránh deploy fail nếu dữ liệu lịch sử đang có duplicate. Sau khi chạy reconcile sạch, có thể nâng cấp lên unique index theo kế hoạch migration riêng.

## 8. Reconcile/backfill

Lệnh dry-run:

```bash
node scripts/reconcile-return-ar.js
# hoặc
npm run reconcile:return-ar
```

Lệnh fix thiếu AR-RETURN an toàn:

```bash
node scripts/reconcile-return-ar.js --fix
# hoặc
npm run reconcile:return-ar:fix
```

`--fix` chỉ tự xử lý case an toàn:

- returnOrder confirmed hợp lệ nhưng thiếu AR-RETURN.

Không tự sửa/xóa cứng:

- duplicate AR-RETURN.
- sai amount.
- sai customer.
- AR-RETURN mồ côi.
- AR-RETURN của returnOrder không hợp lệ/cancelled.

## 9. Test evidence

Đã chạy:

```bash
node scripts/check-js-syntax.js
```

Kết quả:

```text
SYNTAX_OK 1007 JavaScript files
```

Đã chạy các static tests liên quan trực tiếp AR-RETURN:

```bash
node --test \
  test/ar-return-reaccounting-idempotency-static.test.js \
  test/ar-return-debt-scoped-static.test.js \
  test/phase52-ar-return-ensure-static.test.js
```

Kết quả:

```text
11 tests, 11 pass, 0 fail
```

Chưa chạy được full runtime test vì thư mục extract không có `node_modules`; khi chạy runtime test có lỗi thiếu dependency `mongoose`. Cần chạy `npm ci` trong môi trường dự án thật trước khi `npm test`.

## 10. Phương án triển khai

### Phương án A — Production-grade khuyến nghị

- Deploy service mới.
- Chạy `npm run mongo:indexes` để tạo index hỗ trợ.
- Chạy `npm run reconcile:return-ar` trên production để lấy báo cáo.
- Chỉ khi báo cáo sạch hoặc đã xử lý duplicate, mới cân nhắc unique index cứng cho `idempotencyKey`/`sourceType+sourceId`.

Ưu điểm: chuẩn ledger, dễ audit, chặn phát sinh lỗi mới.  
Nhược điểm: cần chạy reconcile trước khi enforce unique.  
Effort: Medium.  
Rủi ro: dữ liệu cũ có duplicate/sai amount cần xử lý thủ công.

### Phương án B — Cân bằng effort

- Deploy service mới và non-unique index như hiện tại.
- Chạy dry-run hằng ngày sau kế toán xác nhận.
- Chỉ dùng `--fix` cho case thiếu AR-RETURN rõ ràng.
- Tạm chưa enforce unique index.

Ưu điểm: ít rủi ro deploy, phù hợp vận hành hiện tại.  
Nhược điểm: vẫn cần discipline vận hành reconcile.  
Effort: Easy/Medium.  
Rủi ro: nếu có race condition cực hiếm, unique DB-level chưa chặn tuyệt đối.

## 11. Khuyến nghị

Dùng Phương án B để deploy trước, chạy reconcile trên dữ liệu thật. Sau khi báo cáo không còn duplicate/mismatch nghiêm trọng thì nâng lên Phương án A bằng unique index/migration riêng.
