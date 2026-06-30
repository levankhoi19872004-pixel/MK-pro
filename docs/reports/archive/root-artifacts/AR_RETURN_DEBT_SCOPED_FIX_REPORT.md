# AR-RETURN / ReturnOrders Debt Scoped Fix Report

## 1. Tổng quan dự án

- Backend: Node.js / Express / MongoDB / Mongoose.
- Frontend: vanilla JS + HTML fragments.
- Scope kiểm tra: `Đơn giao hôm nay -> returnOrders -> xác nhận kế toán giao hàng -> arLedgers AR-RETURN -> Công nợ khách hàng`.
- Không sửa các module tồn kho, quỹ, import, đơn tổng, xóa đơn bán, dashboard, CSS hoặc middleware auth.

## 2. Khoanh vùng sửa chữa

### File đã kiểm tra

- `src/services/master-order/deliveryAccountingCommand.impl.js`
- `src/services/master-order/deliveryAccountingCore.impl.js`
- `src/services/master-order/masterOrderReturn.impl.js`
- `src/engines/posting.engine.js`
- `src/services/reportLegacy.service.source/part-02.jsfrag`
- `src/services/DebtReadService.js`
- `src/services/mobile/delivery.service.js`
- `src/repositories/returnOrderRepository.js`
- `src/models/ReturnOrder.js`
- `src/models/ArLedger.js`

### File đã sửa thực tế

- `src/services/master-order/deliveryAccountingCore.impl.js`
- `scripts/backfill-ar-return-from-return-orders.js`
- `test/ar-return-debt-scoped-static.test.js`
- `AR_RETURN_DEBT_SCOPED_FIX_REPORT.md`

### File không đụng tới

- Tồn kho / `StockTransaction` / `inventoryService`
- Quỹ / `fundLedgers`
- Import Excel/DMS
- Đơn tổng/master order grouping
- Xóa đơn bán phase49
- CSS/layout toàn hệ thống
- Auth middleware toàn hệ thống

## 3. Nguyên nhân lỗi

### Nguyên nhân chính

Luồng đã có cơ chế repair `AR-RETURN` khi đơn đã xác nhận kế toán nhưng thiếu AR-RETURN. Tuy nhiên check `hasPostedArReturn()` trước đó chỉ loại `status='void'`, chưa loại các dòng `status='reversed'` hoặc `reversed=true`.

Hậu quả: nếu trước đó có dòng AR-RETURN cũ đã bị đảo/reversed, hàm repair vẫn tưởng rằng đơn đã có AR-RETURN còn hiệu lực nên bỏ qua. Công nợ tiếp tục thiếu phần credit hàng trả.

### Nguyên nhân phụ

Một số dữ liệu giao hàng cũ có thể đang giữ số hàng trả ở `salesOrder.returnAmount` / `returnAmountFromReturnOrders`, nhưng `returnOrders` chưa liên kết đầy đủ hoặc chưa tồn tại. Với đơn đã xác nhận kế toán, nhánh repair cũ yêu cầu phải có returnOrders nên không tự sửa được các đơn legacy đang có HT trên màn giao hàng nhưng thiếu AR-RETURN.

## 4. Thay đổi đã thực hiện

### `src/services/master-order/deliveryAccountingCore.impl.js`

- Sửa `hasPostedArReturn()` để chỉ coi AR-RETURN còn hiệu lực là đã tồn tại:
  - `status` không thuộc `void/reversed/cancelled/canceled/deleted`
  - `reversed !== true`
- Thêm `fallbackReturnAmountFromAccountingOrder()` để lấy số hàng trả từ các field kế toán/giao hàng khi dữ liệu legacy thiếu returnOrders.
- Sửa `repairMissingArReturnIfNeeded()`:
  - Nếu có returnOrders: vẫn ưu tiên post AR-RETURN từ returnOrders.
  - Nếu không có returnOrders nhưng order đã có `returnAmountFromReturnOrders` / `returnAmount` > 0: post AR-RETURN fallback có kiểm soát.
  - Vẫn kiểm tra idempotency trước khi post, không sinh trùng AR-RETURN.

### `scripts/backfill-ar-return-from-return-orders.js`

Thêm script backfill thủ công:

- Dry-run mặc định.
- Chạy thật bằng `--apply`.
- Có filter `--from`, `--to`, `--order`, `--customer`, `--limit`.
- Không tạo trùng nếu đã có AR-RETURN còn hiệu lực.
- Không chạy tự động khi app start.

### `test/ar-return-debt-scoped-static.test.js`

Thêm test bảo vệ:

- Repair chỉ check active non-reversed AR-RETURN.
- Có fallback sửa thiếu AR-RETURN cho đơn đã xác nhận.
- Posting engine ghi AR-RETURN là credit và giữ liên kết order.
- Debt report tổng hợp `returnAmount` từ AR ledger type `return`.
- Backfill script dry-run mặc định và chống duplicate.

## 5. Kiểm chứng nghiệp vụ theo ảnh

Với đơn `B0038413`:

- AR-SALE: `3.970.298`
- AR-RECEIPT/CK: `3.243.000`
- AR-RETURN cần ghi: `126.601`
- AR-BONUS/trả thưởng: `600.000`

Công thức đúng:

```text
3.970.298 - 3.243.000 - 126.601 - 600.000 = 697
```

Sau khi AR-RETURN được sinh/backfill đúng, màn công nợ phải hiển thị `Trả hàng = 126.601`. Nếu hệ thống áp dụng Debt Zero Tolerance khoảng 1.000, đơn này có thể được xem như hết nợ.

Các đơn khác cùng ảnh cần được phản ánh tương tự:

- `B0038415`: `531.900`
- `B0038416`: `130.704`
- `B0038432`: `695.016`
- Tổng hàng trả: `1.484.221`

## 6. Test/kiểm chứng đã chạy

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1002 JavaScript files
```

Chạy test khoanh vùng:

```bash
node --test \
  test/ar-return-debt-scoped-static.test.js \
  test/inventory-ledger-invariants-static.test.js \
  test/sales-order-delete-ui-scoped-static.test.js \
  test/master-order-popup-selection-ui-static.test.js
```

Kết quả:

```text
16/16 pass
```

## 7. Backfill/migration nếu cần

Nếu dữ liệu cũ trên production đã có `returnOrders` nhưng thiếu `AR-RETURN`, chạy dry-run trước:

```bash
node scripts/backfill-ar-return-from-return-orders.js --from=2026-06-27 --to=2026-06-29
```

Kiểm tra JSON report, sau đó chạy thật:

```bash
node scripts/backfill-ar-return-from-return-orders.js --from=2026-06-27 --to=2026-06-29 --apply
```

Có thể khoanh vùng theo đơn cụ thể:

```bash
node scripts/backfill-ar-return-from-return-orders.js --order=B0038413
node scripts/backfill-ar-return-from-return-orders.js --order=B0038413 --apply
```

Rollback nếu cần: không xóa ledger cũ bằng tay; tạo bút toán đảo AR-RETURN hoặc dùng flow reversal/correction chuẩn.

## 8. Hướng dẫn deploy

- Cần `npm install` nếu môi trường chưa có đủ dependency.
- Không cần build frontend.
- Không cần thêm index bắt buộc cho bản sửa này.
- Cần restart Render sau khi deploy.
- Nên hard refresh browser nếu đang mở màn công nợ.
- Nếu dữ liệu cũ thiếu AR-RETURN, cần chạy backfill thủ công sau khi backup DB.

## 9. Phương án sửa

### Phương án A - Production-grade dài hạn

- Chuẩn hóa toàn bộ return accounting thành service riêng `ReturnArPostingService`.
- Có unique idempotency key theo `returnOrderId + orderCode + customerCode + ledgerType`.
- Có migration/backfill có báo cáo và rollback script riêng.
- Thêm integration test với Mongo test DB.

Effort: Hard  
Rủi ro: Medium vì cần rà toàn bộ legacy return/debt.

### Phương án B - Khoanh vùng, cân bằng effort

- Giữ flow hiện tại.
- Sửa check active AR-RETURN để không bị dòng reversed chặn repair.
- Bổ sung fallback cho đơn đã xác nhận có returnAmount nhưng thiếu returnOrders liên kết.
- Thêm script backfill thủ công.
- Không động tồn kho/quỹ/import/UI.

Effort: Medium  
Rủi ro: Low-Medium, phù hợp xử lý ngay lỗi công nợ đang sai.

## 10. Kết luận

Bản này áp dụng Phương án B: sửa đúng luồng AR-RETURN/công nợ do hàng trả, giữ nguyên các module khác. Với dữ liệu cũ đã phát sinh trước khi sửa, cần chạy dry-run backfill để xác định các returnOrders thiếu AR-RETURN rồi mới apply.
