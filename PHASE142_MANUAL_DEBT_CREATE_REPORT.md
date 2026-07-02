# Phase142 — Công nợ (New): Tạo công nợ thủ công

## Mục tiêu

Bổ sung nút `+ Tạo công nợ` tại màn `Công nợ (New)` để kế toán/admin tạo công nợ ban đầu, công nợ ngoài bán hàng hoặc điều chỉnh tăng công nợ thủ công qua popup, không tạo đơn bán/trả hàng giả và không đi qua luồng giao hàng.

## Thiết kế đã chọn

- AR ledger vẫn là SSoT.
- Manual debt được ghi dưới canonical category/ledgerType `AR-DEBT-ADJUSTMENT` theo chiều debit để tăng công nợ.
- `sourceType` riêng: `MANUAL_DEBT`.
- `debtType` nghiệp vụ nằm trong metadata/reasonCode:
  - `OPENING_DEBT`
  - `MANUAL_DEBT`
  - `DEBT_ADJUSTMENT_INCREASE`
- Không tạo `salesOrders`, `returnOrders`, `debtCollections` hay ghi vào luồng giao hàng.

Lý do không tạo category mới `AR-MANUAL-DEBT`: read model hiện tại đã đọc nhóm `AR-DEBT-*`, còn `AR-DEBT-OPEN` đang gắn contract delivery closeout. Vì vậy `AR-DEBT-ADJUSTMENT` debit-only là lựa chọn ít rủi ro hơn, không đổi công thức công nợ đang chạy.

## File đã sửa/thêm

- `src/services/accounting/manualDebtPostingService.js`
- `src/routes/newOperationsRoutes.js`
- `public/js/app/new/92-debt-new.js`
- `docs/openapi.json`
- `scripts/lib/globalRuleAuditCore.js`
- `test/manual-debt-posting-service.test.js`
- `test/debt-new-manual-debt-ui-static.test.js`
- `test/no-direct-ledger-write.test.js`

## API mới

```txt
POST /api/new/debt/manual
```

Payload chính:

```json
{
  "customerCode": "BBHOASON",
  "customerName": "Hoa Sơn",
  "debtType": "OPENING_DEBT",
  "amount": 1000000,
  "postingDate": "2026-07-03",
  "salesStaffCode": "...",
  "salesStaffName": "...",
  "deliveryStaffCode": "...",
  "deliveryStaffName": "...",
  "referenceNo": "...",
  "note": "Công nợ đầu kỳ"
}
```

## Kiểm tra đã chạy

PASS:

```bash
npm run check:syntax
npm run check:source-bundles
npm run docs:check
node --test test/docs-generate.test.js test/global-software-rules-static.test.js test/no-direct-ledger-write.test.js test/manual-debt-posting-service.test.js test/debt-new-manual-debt-ui-static.test.js
```

Ghi nhận thêm:

- `npm run check:source-size` đang fail ở các file import Excel cũ, không thuộc phạm vi thay đổi Phase142:
  - `src/services/import/preview/importPreview.impl.js`
  - `public/js/app/admin/08d-import-excel.source/part-01.jsfrag`
  - `public/js/app/admin/08d-import-excel.source/part-02.jsfrag`
  - `public/js/app/admin/08d-import-excel.part02.js`
- `npm test` toàn bộ đã chạy nhưng không hoàn tất trong timeout môi trường; các lỗi thấy được sau khi sửa là source-size legacy nêu trên, không phát sinh từ chức năng tạo công nợ thủ công.

## Hướng dẫn thao tác UI

1. Vào `Công nợ (New)`.
2. Bấm `+ Tạo công nợ`.
3. Chọn khách hàng.
4. Chọn loại công nợ.
5. Nhập số tiền dương, ngày ghi nhận, diễn giải.
6. Có thể chọn NVBH/NVGH phụ trách và nhập mã tham chiếu.
7. Bấm `Tạo công nợ`.
8. Màn sẽ reload lại dữ liệu công nợ, ưu tiên hiển thị khách vừa tạo nếu màn đang chưa lọc hoặc đang lọc đúng khách đó.
