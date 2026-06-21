# PHASE20 — P2 Modular hóa frontend app giao hàng

## 1. Tổng quan dự án / phạm vi

Baseline sử dụng: `MK-pro-phase19-delivery-reconciliation-report-p1-patched(1).zip`.

Phạm vi thực hiện đúng Prompt 9:

- `public/mobile/js/delivery-mobile-view.source.js`
- `public/mobile/delivery.html`
- module JS mobile delivery mới
- test static liên quan app giao hàng

Không sửa backend/API, không sửa business rule tiền/tồn/công nợ, không đổi UI lớn, không đổi route.

## 2. Đánh giá trước refactor

Trước khi refactor đã chạy kiểm tra nền:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check:source-bundles
npm run check:syntax
```

Kết quả baseline trước sửa:

```text
[source-bundles] OK 19 bundles
SYNTAX_OK 946 JavaScript files
```

Nhận định:

- P0/P1 trước đó đã ổn định ở các test targeted.
- `delivery-mobile-view.source.js` vẫn là file lớn khoảng 1.382 dòng, chứa nhiều responsibility: state, utility DOM, render card đơn, công nợ, trả hàng, thu tiền, đối soát, load orchestration.
- Refactor lớn toàn bộ một lần có rủi ro cao vì app giao hàng đang có nhiều flow tiền/tồn/công nợ quan trọng.

## 3. Phương án đã chọn

Chọn phương án A — modular hóa có kiểm soát theo stage 1.

Lý do:

- Giảm rủi ro hơn so với tách toàn bộ tab trong một prompt.
- Giữ `delivery-mobile-view.source.js` làm entrypoint/coordinator hiện tại.
- Tách các phần ít phụ thuộc business flow trước: state, UI utility, order card/KPI.
- Không đổi API contract, không đổi behavior, không đổi layout lớn.

## 4. Nội dung đã refactor

### 4.1. Tách state module

Thêm file:

```text
public/mobile/js/delivery-state.js
```

Chứa:

- `DELIVERY_TAB_CACHE_TTL_MS`
- `DELIVERY_REFRESH_THROTTLE_MS`
- `DELIVERY_DEBT_PAGE_LIMIT`
- `createInitialState()`
- `isFresh()`

`delivery-mobile-view.source.js` hiện dùng:

```js
var state = deliveryMobileState.createInitialState();
```

### 4.2. Tách UI utility module

Thêm file:

```text
public/mobile/js/delivery-ui-utils.js
```

Chứa các helper dùng chung:

- `el()`
- `esc()`
- `num()` / `money()` / `amount()`
- `keyOf()`
- `today()`
- `readUser()`
- `selectedOrderSummary()`
- `orderQuickActions()`
- `copyText()`
- `debounce()`
- `msg()`

### 4.3. Tách order rendering module

Thêm file:

```text
public/mobile/js/delivery-orders-view.js
```

Chứa:

- `buildOrderKpi()`
- `buildRouteKpi()`
- `renderOrderCard()`

Entry point chỉ còn điều phối:

```js
function renderOrderCard(order) {
  return deliveryOrdersView.renderOrderCard(order, { selectedKey: state.selectedKey });
}
```

### 4.4. Cập nhật HTML load order

Cập nhật:

```text
public/mobile/delivery.html
```

Load thứ tự mới:

```html
<script src="/js/delivery/delivery-core.js"></script>
<script src="/mobile/js/ui-runtime.js"></script>
<script src="/mobile/js/delivery-state.js"></script>
<script src="/mobile/js/delivery-ui-utils.js"></script>
<script src="/mobile/js/delivery-orders-view.js"></script>
<script src="/mobile/js/delivery-mobile-view.js"></script>
```

Đảm bảo module phụ thuộc được load trước entrypoint.

## 5. File đã sửa/thêm/xóa

### Modified

```text
config/source-bundles.json
public/mobile/delivery.html
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
test/delivery-debt-pagination-p1-static.test.js
test/delivery-mobile-debt-tab-static.test.js
test/delivery-mobile-performance-p1-static.test.js
test/delivery-mobile-ui-p0p1-static.test.js
test/mobile-debt-subtabs-static.test.js
```

### Added

```text
public/mobile/js/delivery-state.js
public/mobile/js/delivery-ui-utils.js
public/mobile/js/delivery-orders-view.js
test/delivery-mobile-modularization-p2-static.test.js
PHASE20_DELIVERY_FRONTEND_MODULARIZATION_P2_REPORT.md
```

### Deleted

```text
Không có
```

## 6. Manual checklist

Không chạy browser manual thực tế trong môi trường này. Checklist cần QA trên máy thật/Chrome DevTools mobile sau khi nhận ZIP:

- [ ] Mở app giao hàng.
- [ ] Load tab Đơn giao.
- [ ] Chọn một đơn.
- [ ] Xem Sản phẩm giao.
- [ ] Nhập/Lưu Hàng trả.
- [ ] Nhập/Lưu Thu tiền.
- [ ] Mở Công nợ, tìm kiếm, tải thêm, tạo phiếu thu.
- [ ] Mở Đối soát cuối ngày.
- [ ] Kiểm tra nhanh trên 360px/390px/412px/768px.

Các flow trên đã được bảo vệ bằng targeted static/integration tests hiện có.

## 7. Test đã chạy

### Baseline trước sửa

```bash
npm run check:source-bundles
npm run check:syntax
```

```text
[source-bundles] OK 19 bundles
SYNTAX_OK 946 JavaScript files
```

### Sau sửa

```bash
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
```

```text
[source-bundles] OK 19 bundles
[source-size-budget] OK
SYNTAX_OK 950 JavaScript files
```

### Targeted delivery tests

```bash
node --test \
  test/delivery-mobile-modularization-p2-static.test.js \
  test/delivery-mobile-ui-p0p1-static.test.js \
  test/delivery-mobile-performance-p1-static.test.js \
  test/delivery-mobile-debt-tab-static.test.js \
  test/delivery-debt-pagination-p1-static.test.js \
  test/delivery-reconciliation-report-p1-static.test.js \
  test/delivery-dual-api-contract-p1p2-static.test.js \
  test/delivery-owner-scope-p0.test.js \
  test/delivery-money-inventory-debt-flow.test.js
```

```text
# tests 42
# pass 42
# fail 0
```

### Full test

```bash
npm test
```

Kết quả thực tế:

```text
# tests 1028
# pass 1025
# fail 2
# skipped 1
```

Hai lỗi fail là snapshot legacy cũ, đã tồn tại từ các phase trước và không liên quan refactor frontend delivery:

```text
test/phase79-production-strangler.test.js
- assembled index page matches the approved Phase80 characterization snapshot
- split CSS parts preserve exact legacy cascade order
```

Không cập nhật snapshot này để tránh thay đổi lan rộng ngoài phạm vi Prompt 9.

## 8. Rủi ro còn lại

| Rủi ro | Mức độ | Ghi chú |
|---|---:|---|
| Browser cache còn giữ bundle cũ | Medium | Đã đổi query string module mới `delivery-modular-p2-v1`; khi deploy nên hard refresh hoặc bump version nếu CDN cache mạnh. |
| Module load order bị chỉnh nhầm sau này | Medium | Đã có test `delivery-mobile-modularization-p2-static.test.js` khóa thứ tự load. |
| File entrypoint vẫn còn lớn | Medium | Đây là stage 1; chưa tách sâu debt/return/payment/reconciliation để tránh rủi ro. |
| Chưa test manual trên máy thật | Medium | Cần QA checklist trên thiết bị NVGH trước pilot rộng. |

## 9. Đề xuất bước tiếp theo

### Phương án A — dài hạn / production-grade

Tách tiếp theo từng tab riêng:

- `delivery-debts-view.js`
- `delivery-returns-view.js`
- `delivery-payment-view.js`
- `delivery-reconciliation-view.js`

Effort: Medium/Hard.

Lợi ích: maintainability tốt hơn, dễ test từng tab, giảm xung đột khi sửa UI.

Rủi ro: cần thêm browser smoke test để tránh lỗi load order/event binding.

### Phương án B — cân bằng effort

Giữ stage 1 trong 1-2 tuần pilot, chỉ tách tiếp khi có nhu cầu sửa tab cụ thể.

Effort: Easy/Medium.

Lợi ích: an toàn, ít đụng flow tiền/tồn/công nợ.

Rủi ro: `delivery-mobile-view.source.js` vẫn còn nhiều responsibility ở phần công nợ/trả hàng/đối soát.
