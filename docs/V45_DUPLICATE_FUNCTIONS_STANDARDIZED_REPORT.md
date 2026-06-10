# V45 - Duplicate Functions Standardized Report

## Mục tiêu

Dọn nhóm hàm trùng nhóm 2 và nhóm 3:

- Nhóm 2: utility lặp lại nhiều nơi: normalize/search text, toNumber, today/nowIso, toDateOnly, calculateCartonUnit, escapeHtml.
- Nhóm 3: nghiệp vụ giao hàng/công nợ lặp lại nhiều nơi: firstPositiveAmount, deliveryDebtBase, deliveryReturnAmount, calculateDeliveryDebt.

## File utility backend đã chuẩn hóa

- `src/utils/search.util.js`
  - `normalizeSearchText()`
  - `normalizeText()` dùng cho search không dấu.

- `src/utils/html.util.js`
  - `escapeHtml()`.

- `src/utils/deliveryFinance.util.js`
  - `firstPositiveAmount()`
  - `deliveryDebtBase()`
  - `deliveryReturnAmount()`
  - `amountFromReturnOrder()`
  - `calculateDeliveryDebt()`
  - `buildDeliveryAmount()`
  - `isDeliveryArLedgerSynced()`
  - `deliveryArLedgerDebt()`

- `src/utils/date.util.js`
  - thêm `nowIso()` để bỏ các bản copy `new Date().toISOString()`.

## File utility frontend đã chuẩn hóa

- `public/js/utils/v45-common-utils.js`
  - `window.V45Common.normalizeText()`
  - `window.V45Common.toNumber()`
  - `window.V45Common.escapeHtml()`
  - `window.V45Common.todayValue()`
  - `window.V45Common.toDateOnly()`
  - `window.V45Common.calculateCartonUnit()`
  - `window.V45Common.deliveryDebtBase()`
  - `window.V45Common.deliveryReturnAmount()`
  - `window.V45Common.calculateDeliveryDebt()`

Đã nhúng file này trước các script dùng chung trong:

- `public/index.html`
- `public/mobile/delivery.html`
- `public/mobile/sales.html`

## Các file backend đã dọn bản copy

- `src/models/Customer.js`
- `src/models/Product.js`
- `src/repositories/customerRepository.js`
- `src/repositories/productRepository.js`
- `src/repositories/searchRepository.js`
- `src/repositories/printRepository.js`
- `src/services/customerService.js`
- `src/services/productService.js`
- `src/services/excelImportService.js`
- `src/services/searchService.js`
- `src/services/orderService.js`
- `src/services/masterOrderService.js`
- `src/services/mobile/delivery.service.js`
- `src/routes/mobileRoutes.js`
- `src/rules/commonRules.js`

## Các file frontend đã dọn bản copy

- `public/mobile/js/delivery.js`
- `public/mobile/js/sales.js`
- `public/js/app/01-utils-print-tabs.js`
- `public/js/app/03-customers-autocomplete.js`
- `public/js/app/06-master-delivery.js`
- `public/js/search/autocompleteEngine.js`
- `public/js/search/productSearchBox.js`
- `public/js/search/catalogCacheService.js`
- `public/js/search/unifiedSearchEngine.js`

## Kết quả kiểm tra tĩnh

Đã chạy `node -c` cho các file đã chỉnh. Các file đều qua kiểm tra cú pháp.

Lưu ý: môi trường sandbox không có `node_modules`, nên chưa chạy được `npm test` đầy đủ. Khi triển khai trên máy có đầy đủ dependency, nên chạy thêm:

```bash
npm install
npm test
npm run mongo:indexes
```

## Nguyên tắc sau khi chuẩn hóa

- Công thức công nợ/giao hàng backend chỉ sửa tại `src/utils/deliveryFinance.util.js`.
- Công thức công nợ/giao hàng frontend chỉ sửa tại `public/js/utils/v45-common-utils.js`.
- Không tạo lại các hàm `deliveryDebtBase()` hoặc `calculateDeliveryDebt()` riêng trong từng màn.
- Không tạo lại `normalizeSearchText()` trong model/service/repository; dùng `src/utils/search.util.js`.
- Không tạo lại `today()`/`nowIso()` trong từng service; dùng `dateUtil.todayVN()` và `dateUtil.nowIso()`.
