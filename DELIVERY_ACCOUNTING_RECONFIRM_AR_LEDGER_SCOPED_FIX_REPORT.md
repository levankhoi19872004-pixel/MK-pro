# DELIVERY ACCOUNTING RECONFIRM AR LEDGER SCOPED FIX REPORT

## 1. Tổng quan dự án

- Backend: Node.js/Express + MongoDB/Mongoose.
- Frontend: web admin dùng JS fragments/public assets.
- Phạm vi task: chỉ khoanh vùng luồng `Mở khóa kế toán -> Xác nhận kế toán lại -> AR Ledger -> Công nợ khách hàng`.
- Không sửa các module tồn kho, quỹ, import, đơn tổng, xóa đơn bán phase49, dashboard hoặc CSS/layout.

## 2. Khoanh vùng sửa chữa

### File đã kiểm tra

- `src/services/master-order/deliveryAccountingCommand.impl.js`
- `src/services/master-order/deliveryAccountingCore.impl.js`
- `src/engines/posting.engine.js`
- `src/services/reportLegacy.service.source/part-02.jsfrag`
- `src/services/reportLegacy.service.js`
- `scripts/backfill-ar-return-from-return-orders.js`

### File đã sửa thực tế

- `src/engines/posting.engine.js`
- `src/services/reportLegacy.service.source/part-02.jsfrag`
- `src/services/reportLegacy.service.js`
- `scripts/backfill-ar-return-from-return-orders.js`
- `scripts/repair-delivery-accounting-ar-ledgers.js`
- `test/ar-return-reaccounting-idempotency-static.test.js`
- `test/delivery-accounting-reconfirm-debt-scoped-static.test.js`

## 3. Nguyên nhân lỗi

### 3.1. AR-SALE hiển thị x2 trong màn công nợ

Khi mở khóa/xác nhận kế toán lại, hệ thống tạo dòng reversal kỹ thuật kiểu `ar_sale_reversal` và đồng thời mark dòng AR-SALE cũ `reversed = true`, `status = reversed`.

Báo cáo công nợ hiện tại đã loại `status = reversed`, nhưng chưa loại type `ar_sale_reversal`/`ar_return_reversal`. Do aggregation đang nhận diện type chứa chữ `sale` là phát sinh debit, dòng `ar_sale_reversal` bị cộng vào cả debit/credit, làm cột `AR SALE` hiển thị gấp đôi.

Ví dụ từ ảnh:

```text
PT đúng: 3.970.298
AR SALE hiển thị sai: 7.940.596 = 3.970.298 x 2
```

### 3.2. AR-RETURN có nguy cơ bị skip bởi dòng không còn hiệu lực

`hasExistingReturnOrderAR()` đã loại `reversed`, nhưng chưa loại đủ `canceled/deleted/isDeleted`. Với dữ liệu mở khóa/xác nhận lại hoặc dữ liệu cũ, AR-RETURN không còn hiệu lực có thể vẫn chặn lần post AR-RETURN mới.

## 4. Thay đổi đã thực hiện

### 4.1. Loại reversal kỹ thuật khỏi báo cáo công nợ hiện tại

File:

- `src/services/reportLegacy.service.source/part-02.jsfrag`
- `src/services/reportLegacy.service.js`

Thay đổi:

```js
type: {
  $nin: [
    'ar_reversal',
    'reversal',
    'ar_void',
    'ar_sale_reversal',
    'ar_return_reversal'
  ]
}
```

Tác dụng:

- Không còn cộng `ar_sale_reversal` vào cột AR-SALE.
- Không còn để `ar_return_reversal` làm lệch cột Trả hàng.
- Công nợ hiện tại chỉ tính ledger active, không tính dòng đảo kỹ thuật.

### 4.2. Siết điều kiện existing AR-RETURN active

File:

- `src/engines/posting.engine.js`
- `scripts/backfill-ar-return-from-return-orders.js`

Thay đổi:

```js
status: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] },
reversed: { $ne: true },
isDeleted: { $ne: true },
```

Tác dụng:

- AR-RETURN cũ đã reversed/cancel/deleted không chặn post AR-RETURN mới.
- Xác nhận kế toán lại có thể ghi nhận số hàng trả mới nhất.

### 4.3. Thêm script repair thủ công cho dữ liệu cũ

File mới:

```text
scripts/repair-delivery-accounting-ar-ledgers.js
```

Chức năng:

- Dry-run mặc định.
- Phát hiện nhiều AR-SALE active cùng một đơn.
- Phát hiện returnOrders có tiền hàng trả nhưng thiếu AR-RETURN active.
- Khi chạy `--apply`, script mark duplicate AR-SALE thành `reversed`, tạo reversal audit và tạo AR-RETURN thiếu từ returnOrders.
- Không chạy tự động khi app start.

## 5. Kiểm chứng nghiệp vụ theo ảnh

Với đơn `B0038413`:

```text
PT = 3.970.298
CK = 3.243.000
TH = 600.000
HT = 126.601
```

Sau sửa + repair dữ liệu cũ nếu cần, công nợ đúng phải là:

```text
AR-SALE = 3.970.298
Đã thu = 3.243.000
Trả hàng = 126.601
Trả thưởng = 600.000
Còn nợ = 697
```

Nếu Debt Zero Tolerance đang áp dụng thì `697` có thể được coi là hết nợ.

Các đơn có HT cùng ngày cũng cần phản ánh vào AR-RETURN:

```text
B0038415 HT = 531.900
B0038416 HT = 130.704
B0038432 HT = 695.016
```

## 6. Test/kiểm chứng

Đã chạy:

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1004 JavaScript files
```

Đã chạy test khoanh vùng:

```bash
node --test \
  test/delivery-accounting-reconfirm-debt-scoped-static.test.js \
  test/ar-return-debt-scoped-static.test.js \
  test/ar-return-reaccounting-idempotency-static.test.js \
  test/sales-order-delete-ui-scoped-static.test.js \
  test/inventory-ledger-invariants-static.test.js
```

Kết quả:

```text
19/19 pass
```

Chưa chạy full `npm test` vì sandbox hiện tại không có `node_modules/terser`. Khi deploy/dev local cần chạy `npm install` rồi chạy full test.

## 7. Backfill/repair dữ liệu cũ

Nếu dữ liệu production đã có AR-SALE active trùng hoặc thiếu AR-RETURN trước khi bản sửa được deploy, cần chạy repair thủ công.

Dry-run theo đơn:

```bash
node scripts/repair-delivery-accounting-ar-ledgers.js --order=B0038413
```

Apply theo đơn:

```bash
node scripts/repair-delivery-accounting-ar-ledgers.js --order=B0038413 --apply
```

Dry-run theo ngày/NVGH:

```bash
node scripts/repair-delivery-accounting-ar-ledgers.js --from=2026-06-29 --to=2026-06-29 --deliveryStaff=ghkx
```

Apply sau khi kiểm tra dry-run:

```bash
node scripts/repair-delivery-accounting-ar-ledgers.js --from=2026-06-29 --to=2026-06-29 --deliveryStaff=ghkx --apply
```

Luôn backup DB trước khi chạy `--apply`.

## 8. Hướng dẫn deploy

1. `npm install`
2. `npm run check:syntax`
3. Chạy nhóm test khoanh vùng ở trên.
4. Deploy lên Render.
5. Restart Render Web Service.
6. Nếu dữ liệu cũ đã sai, chạy script repair dry-run rồi mới `--apply`.
7. Hard refresh trình duyệt nếu cần.

## 9. Phương án sửa

### Phương án A - Production-grade dài hạn

- Chuẩn hóa toàn bộ delivery accounting bằng accounting run/batch table.
- Mỗi lần xác nhận lại tạo một `accountingRunId` mới.
- Debt report chỉ đọc ledger active theo `accountingRunId` mới nhất.
- Có unique index theo `orderCode + ledgerType + accountingRunId`.

Effort: Hard. Rủi ro: Medium vì chạm sâu vào kế toán giao hàng.

### Phương án B - Khoanh vùng, cân bằng effort

- Giữ flow hiện tại.
- Loại reversal kỹ thuật khỏi công nợ hiện tại.
- Siết active check cho AR-RETURN.
- Cung cấp script repair dữ liệu cũ thủ công.

Effort: Medium. Rủi ro: Low-Medium. Phù hợp với MK-Pro nội bộ hiện tại.
