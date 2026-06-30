# POSTING_ENGINE_RUNTIME_EXPORT_FIX_REPORT

## 1. Tổng quan

Lỗi Render xảy ra khi `npm start` require `src/engines/posting.engine.js`:

```text
ReferenceError: postSalesOrderAR is not defined
```

Build `npm ci` thành công, nhưng app crash ở bước runtime module evaluation vì `module.exports` export symbol chưa có định nghĩa trong cùng file.

## 2. Khoanh vùng sửa chữa

Chỉ sửa đúng phạm vi runtime/export:

- `src/engines/posting.engine.js`
- `test/posting-engine-export-runtime-static.test.js`

Không sửa các module nghiệp vụ:

- returnOrders / AR-RETURN business rule
- công nợ report
- inventory / stockTransactions
- fundLedgers / quỹ
- import
- masterOrders / đơn tổng
- frontend/UI

## 3. Nguyên nhân lỗi

Trong `src/engines/posting.engine.js`, `module.exports` có:

```js
postSalesOrderAR,
reverseSalesOrderAR,
```

nhưng file phase53 hiện tại không còn định nghĩa 2 function này trong scope. Khi Node load module, runtime dừng tại `module.exports` với `ReferenceError`.

## 4. Thay đổi đã thực hiện

### 4.1 Khôi phục `postSalesOrderAR`

Khôi phục function ghi AR-SALE tương thích với contract cũ:

- tăng nợ gốc bằng debit
- type `ar_sale`
- không tự trừ payment/return/bonus
- giữ `skipIfExists` qua `hasExistingSalesOrderAR`
- ghi qua `paymentRepository.upsert`

### 4.2 Khôi phục `reverseSalesOrderAR`

Khôi phục function đảo AR-SALE tương thích với `postDocument(kind='SALES_ORDER_REVERSAL')` và `module.exports`.

### 4.3 Thêm static/runtime guard

Thêm file:

```text
test/posting-engine-export-runtime-static.test.js
```

Test kiểm tra:

- `postSalesOrderAR` có trong export và có định nghĩa cục bộ
- `reverseSalesOrderAR` có trong export và có định nghĩa cục bộ
- các symbol chính trong `module.exports` không bị undefined
- module có thể evaluate bằng dependency stubs mà không phát sinh `ReferenceError`

## 5. Test/kiểm chứng đã chạy

### Syntax file

```bash
node -c src/engines/posting.engine.js
```

Kết quả: pass.

### Check syntax toàn project

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1008 JavaScript files
```

### Test khoanh vùng runtime/export

```bash
node --test test/posting-engine-export-runtime-static.test.js
```

Kết quả: 3/3 pass.

### Regression static liên quan

```bash
node --test \
  test/posting-engine-export-runtime-static.test.js \
  test/ar-return-debt-scoped-static.test.js \
  test/ar-return-reaccounting-idempotency-static.test.js \
  test/delivery-accounting-reconfirm-debt-scoped-static.test.js \
  test/sales-order-delete-ui-scoped-static.test.js \
  test/inventory-ledger-invariants-static.test.js
```

Kết quả: 22/22 pass.

## 6. Ghi chú kiểm chứng runtime require

Trong sandbox này, lệnh direct require:

```bash
node -e "require('./src/engines/posting.engine.js')"
```

không chạy được đến bước app logic vì local `node_modules` chưa cài hoàn chỉnh (`mongoose` missing). Render log cho thấy môi trường Render đã `npm ci` thành công, nên lỗi cần xử lý thực tế là ReferenceError trong chính file `posting.engine.js`. Static/runtime guard bằng VM dependency stubs đã evaluate file và xác nhận không còn `ReferenceError` do export thiếu định nghĩa.

Trên Render/dev machine sau `npm ci`, nên chạy lại:

```bash
node -e "require('./src/engines/posting.engine.js'); console.log('posting engine OK')"
npm start
```

## 7. Deploy

1. Push ZIP/source đã sửa lên GitHub.
2. Render redeploy.
3. Kiểm tra log không còn:

```text
ReferenceError: postSalesOrderAR is not defined
```

4. Sau khi app chạy lại, nếu cần xử lý dữ liệu cũ thiếu AR-RETURN thì chạy script repair/backfill riêng theo phase53. Task này chỉ sửa lỗi runtime export.
