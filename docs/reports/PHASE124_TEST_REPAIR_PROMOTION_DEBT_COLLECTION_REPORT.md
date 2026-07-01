# PHASE124 — Test Repair: Promotion Runtime Safety + Debt Collection Available-To-Collect Contract

## 1. Tổng quan dự án

- Dự án MK-Pro là ERP/DMS Node.js + MongoDB, frontend JavaScript thuần.
- Phạm vi Phase124 chỉ sửa các lỗi `npm test` còn lại sau Phase123B.
- Không thay đổi công thức promotion engine, AR posting, return posting, delivery accounting hoặc fund ledger.

## 2. Lỗi đã xử lý

### P0 — `deleteGroupRule is not defined`

**Nguyên nhân:**

`src/services/promotionService.js` đang export `deleteGroupRule` nhưng sau Phase123 chỉ còn `saveGroupRule`; hàm xóa điều kiện nhóm KM bị thiếu khai báo. Vì vậy mọi luồng chỉ cần `require('promotionService')` đều crash runtime.

**Sửa:**

- Bổ sung `async function deleteGroupRule(id)`.
- Xóa trong `PromotionGroupRule` theo `id`, `code`, `programCode` hoặc `_id` hợp lệ.
- Có `clearPromotionProgramCache()` để tránh cache stale.
- Trả lỗi rõ nếu thiếu id hoặc không tìm thấy rule.
- Giữ nguyên export/API cũ `promotionService.deleteGroupRule`.

### Debt New — available-to-collect contract

**Nguyên nhân:**

Một số contract test mới yêu cầu backend/frontend dùng số **còn được thu** sau khi trừ phiếu thu pending, nhưng code còn thiếu tên hàm/field contract rõ ràng:

- Thiếu `function collectibleStateFromRows` trong `DebtReadService`.
- Frontend Debt New thiếu `function parseVndAmount`.
- Popup lập phiếu thu còn dùng nợ mở thuần thay vì ưu tiên `availableToCollect`.
- API Debt New v2 chưa attach pending lock vào từng order row.

**Sửa:**

- Thêm `collectibleStateFromRows()` vào `src/services/DebtReadService.js`.
- Chuẩn hóa field từng đơn nợ:
  - `remainingDebt`
  - `debtAmount`
  - `pendingCollectedAmount`
  - `availableToCollect`
  - `availableDebt`
  - `availableDebtAmount`
  - `collectionLocked`
  - `collectible`
  - `pendingCollections`
- Thêm pending collection state vào `src/services/v2/debtNew.service.js` cho API `/api/new/debt/customers`.
- Thêm `parseVndAmount()` và ưu tiên `availableToCollect` trong `public/js/app/new/92-debt-new.js`.
- Popup Công nợ New hiển thị thêm:
  - Còn nợ
  - Đã báo thu chờ xác nhận
  - Còn được thu
- Allocate phiếu thu theo `availableToCollect`, không theo `remainingDebt` thuần.

## 3. File đã sửa

| File | Nội dung |
|---|---|
| `src/services/promotionService.js` | Bổ sung `deleteGroupRule` tương thích API cũ |
| `src/services/DebtReadService.js` | Bổ sung `collectibleStateFromRows`, pending lock fields, available-to-collect aliases |
| `src/services/v2/debtNew.service.js` | Attach pending collection lock vào AR-DEBT customer/order rows |
| `public/js/app/new/92-debt-new.js` | Thêm `parseVndAmount`, popup/allocate dùng `availableToCollect` |
| `docs/reports/PHASE124_TEST_REPAIR_PROMOTION_DEBT_COLLECTION_REPORT.md` | Báo cáo Phase124 |

## 4. Công thức chuẩn

```js
pendingCollectedAmount = total submitted/under_review allocations for the order
availableToCollect = Math.max(0, remainingDebt - pendingCollectedAmount)
collectionLocked = pendingCollectedAmount > 0
collectible = availableToCollect > 0
```

Phiếu thu `submitted` chỉ khóa số tiền đang chờ xác nhận. Phiếu này chưa tạo AR receipt/fund ledger. Kế toán confirm mới là điểm sinh ledger chính thức.

## 5. Kiểm tra đã chạy trong sandbox

### PASS

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1194 JavaScript files
```

### PASS targeted static tests có sẵn trong ZIP

```bash
node --test test/debt-collection-shared-pending-lock-static.test.js test/debt-collections-ui-static.test.js test/debt-collection-pending-posting-static.test.js
```

Kết quả:

```text
8 tests pass
```

### Syntax check trực tiếp

```bash
node --check src/services/promotionService.js
node --check src/services/DebtReadService.js
node --check src/services/v2/debtNew.service.js
node --check public/js/app/new/92-debt-new.js
```

Kết quả: không lỗi syntax.

## 6. Chưa chạy được trong sandbox

Không chạy được đầy đủ:

```bash
npm run check:source-bundles
npm test
```

Lý do sandbox không có `node_modules`, thiếu dependency như `terser` và `mongoose`. Trên máy dev hiện tại của dự án đã có dependency, cần chạy lại full gate sau khi giải nén ZIP.

## 7. Cách test lại trên máy dev

```bash
cd /d E:\MK-pro
npm run check:syntax
npm run check:source-bundles
node --test test/import-preview-worker-lifecycle.test.js
node --test test/ar-return-accounting-flow.test.js
node --test test/debt-collection-collectible-state.test.js
node --test test/debt-new-collection-available-ui-static.test.js
npm test
```

Nếu `source-bundles` báo stale do môi trường generated file khác, chạy:

```bash
npm run source-bundles:refresh
npm run check:source-bundles
```

## 8. Rủi ro còn lại

- Các test `debt-collection-collectible-state.test.js` và `debt-new-collection-available-ui-static.test.js` không có trong ZIP được gửi, nên đã sửa theo log fail và contract mô tả.
- Cần chạy lại đúng full test trên máy dev để xác nhận 100%.
