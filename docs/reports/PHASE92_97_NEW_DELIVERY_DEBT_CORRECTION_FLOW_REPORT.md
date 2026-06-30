# Phase92-97 — New Delivery Today + New Debt Correction Flow Report

## A. Tổng quan thay đổi

Triển khai lần lượt 7 bước xây dựng hai mục mới:

1. Phase92A — Backend Correction Core
2. Phase92B — API Correction
3. Phase93 — Công nợ (New) đọc đúng `AR-DEBT-ADJUSTMENT`
4. Phase94 — UI Correction cho Đơn giao hôm nay (New)
5. Phase95 — Static guard khóa luồng cũ
6. Phase96 — Audit dữ liệu cũ
7. Phase97 — Repair plan/migration có kiểm soát

## B. File thêm mới

```text
src/models/DeliveryCloseoutCorrection.js
src/models/DeliveryCloseoutVersion.js
src/services/deliveryCloseoutCorrection.service.js
scripts/create-delivery-closeout-correction-indexes.js
scripts/audit-delivery-closeout-corrections.js
scripts/audit-new-delivery-debt-consistency.js
scripts/plan-new-delivery-debt-repair.js
test/delivery-closeout-correction-contract-static.test.js
docs/reports/PHASE92_97_NEW_DELIVERY_DEBT_CORRECTION_FLOW_REPORT.md
```

## C. File chỉnh sửa

```text
src/models/index.js
src/services/accounting/DeliveryCloseoutCorrectionService.js
src/services/accounting/ArDebtAdjustmentPostingService.js
src/services/v2/deliveryTodayNew.service.js
src/services/v2/debtNew.service.js
src/routes/newOperationsRoutes.js
public/js/app/new/91-delivery-today-new.js
```

## D. Luồng dữ liệu mới

```text
Original closeout trên salesOrders.deliveryCloseout
→ POST /api/new/delivery-today/closeouts/:id/corrections
→ DeliveryCloseoutCorrectionService.createCorrection()
→ deliveryCloseoutCorrections
→ deliveryCloseoutVersions
→ AR-DEBT-ADJUSTMENT
→ Công nợ (New) đọc AR-DEBT-*
```

## E. Quy tắc đã khóa

Correction flow mới không được:

```text
- sửa in-place salesOrders.deliveryCloseout bản cũ
- tạo returnOrders correction
- gọi ReturnOrderService
- gọi ReturnArPostingService
- gọi InventoryPostingService
- sinh AR-RETURN
- sinh AR-SALE-REVERSAL
- sinh AR-RECEIPT trực tiếp
```

## F. Contract tính công nợ correction

```js
debtAdjustmentAmount = -returnAdjustmentAmount - cashAdjustmentAmount
```

Ý nghĩa:

```text
returnAdjustmentAmount > 0 → khách trả thêm hàng → công nợ giảm → credit
returnAdjustmentAmount < 0 → giảm hàng trả → công nợ tăng → debit
cashAdjustmentAmount > 0 → thu thêm tiền → công nợ giảm → credit
cashAdjustmentAmount < 0 → thu ít hơn → công nợ tăng → debit
```

## G. API mới

```http
POST /api/new/delivery-today/closeouts/:id/corrections
GET  /api/new/delivery-today/closeouts/:id/corrections
GET  /api/new/delivery-today/closeouts/:id/versions
```

## H. UI mới

Màn `Đơn giao hôm nay (New)` có thêm:

```text
- nút Tạo điều chỉnh
- modal điều chỉnh hàng trả/tiền thu
- preview chênh lệch hàng trả, tiền thu, công nợ
- cảnh báo tạo version mới, không sửa bản cũ
- nút lịch sử version
```

## I. Audit và repair

```bash
node scripts/create-delivery-closeout-correction-indexes.js
node scripts/audit-delivery-closeout-corrections.js --strict
node scripts/audit-new-delivery-debt-consistency.js --strict
node scripts/plan-new-delivery-debt-repair.js --json
```

`plan-new-delivery-debt-repair.js` chỉ lập kế hoạch, không apply tự động để tránh repair mù.

## J. Kiểm tra đã chạy trong sandbox

```text
npm run check:syntax
→ SYNTAX_OK 1176 JavaScript files

node --test test/delivery-closeout-correction-contract-static.test.js
→ pass 5/5
```

`npm test` chưa chạy được trong sandbox vì thư mục không có `node_modules`; pretest dừng tại `Cannot find module 'terser'`. Trên máy thật cần chạy `npm install` trước rồi chạy lại full test.

## K. Lệnh nên chạy trên máy thật

```bash
npm install
npm run check:syntax
node --test test/delivery-closeout-correction-contract-static.test.js
npm test
npm run check:source-bundles
npm run check:release-manifest
npm run docs:check
node scripts/create-delivery-closeout-correction-indexes.js
node scripts/audit-delivery-closeout-corrections.js --strict
node scripts/audit-new-delivery-debt-consistency.js --strict
```
