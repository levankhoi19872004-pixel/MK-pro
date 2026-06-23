# DELIVERY PAYMENT CONFIRM FLOW FIX REPORT

## 1. Tổng quan dự án/phần liên quan

- Baseline: `MK-pro-phase39-sales-order-update-api-performance-patched(1).zip`.
- Tech stack: Node.js/Express monolith, MongoDB/Mongoose, frontend mobile dạng HTML/JS/CSS tĩnh chạy WebView/browser.
- Phạm vi khảo sát chính:
  - Frontend App giao hàng: `public/mobile/js/delivery-mobile-view.source.js`.
  - Runtime bundle thực tế được load: `public/mobile/js/delivery-mobile-view.js` + source map.
  - CSS mobile: `public/mobile/mobile.source/mobile-04.css`.
  - API core frontend: `public/js/delivery/delivery-core.js`.
  - Backend canonical delivery routes: `src/routes/deliveryRoutes.js`.
  - Compatibility routes: `src/routes/mobile/delivery.routes.js`, `src/services/mobile/delivery.service.js`.

## 2. Nguyên nhân gốc

### Root cause 1 — Nút sticky phụ thuộc `form="mPaymentForm"`

- File: `public/mobile/js/delivery-mobile-view.source.js`.
- Vùng logic cũ: `renderWorkflowBar()`.
- Trước patch: nút sticky ở dưới màn hình là button submit nằm ngoài form và chỉ liên kết bằng thuộc tính `form="mPaymentForm"`.
- Rủi ro: WebView/mobile có thể không kích hoạt submit ổn định với form external/dynamic, khiến người dùng bấm nút nhưng không có phản hồi.

### Root cause 2 — Sau khi thành công cố tình giữ user ở màn chi tiết

- File: `public/mobile/js/delivery-mobile-view.source.js`.
- Hàm: `savePayment()`.
- Trước patch: sau `DeliveryCore.savePayment()` và `DeliveryCore.confirmDelivery()`, code chuyển sang `state.tab = 'customerReconciliation'` thay vì quay về danh sách.
- Ảnh hưởng: nhân viên giao hàng bị kẹt trong chi tiết khách/đơn, không trở lại `Danh sách giao` như yêu cầu vận hành.

### Root cause 3 — Chưa có chặn double-submit và lỗi thu vượt chưa hiển thị gần form

- Backend `DeliveryEngine.savePayment()` đang chặn thu vượt quá phải thu nếu vượt ngưỡng 1.000đ.
- Case ảnh: thu vượt 14đ, nằm trong ngưỡng tolerance nên backend không chặn.
- Nếu thu vượt lớn hơn, trước patch lỗi có thể chỉ đi qua message chung, dễ bị hiểu là nút không hoạt động.

## 3. Patch đã thực hiện

| File | Loại | Nội dung |
|---|---:|---|
| `public/mobile/js/delivery-mobile-view.source.js` | Sửa | Thay sticky payment button từ external submit sang direct click handler `data-payment-submit`. |
| `public/mobile/js/delivery-mobile-view.source.js` | Sửa | `savePayment()` đọc form hiện tại, validate thu vượt, chặn double-submit, gọi đúng `DeliveryCore.savePayment()` và `DeliveryCore.confirmDelivery()`. |
| `public/mobile/js/delivery-mobile-view.source.js` | Sửa | Sau success: xóa selected order, quay về list mode, refresh danh sách giao. |
| `public/mobile/mobile.source/mobile-04.css` | Sửa | Thêm style lỗi inline `.m-payment-error` và trạng thái disabled cho button. |
| `public/mobile/js/delivery-mobile-view.js` | Generated | Build lại từ canonical source. |
| `public/mobile/js/delivery-mobile-view.js.map` | Generated | Build lại source map. |
| `config/source-bundles.json` | Sửa | Refresh hash cho source bundle đã build. |
| `test/delivery-payment-confirm-flow-static.test.js` | Thêm | Test regression cho click handler, validation, double-submit và quay về danh sách. |
| `test/delivery-compact-customer-workflow-ui-p1-static.test.js` | Sửa | Cập nhật expectation từ `form="mPaymentForm"` sang `data-payment-submit`. |

## 4. Diff Old/New quan trọng

### Sticky button

Cũ:

```js
'<button type="submit" form="mPaymentForm" class="primary">Xác nhận thu tiền</button>'
```

Mới:

```js
'<button id="mPaymentSubmitButton" type="button" data-payment-submit class="primary"' +
  (state.paymentSubmitting ? ' disabled' : '') + '>' +
  (state.paymentSubmitting ? 'Đang xác nhận...' : 'Xác nhận thu tiền') +
'</button>'
```

### Click handler mới

```js
deliveryLifecycle.delegate(el('mWorkflowBar'), 'click', '[data-payment-submit]', function (event) {
  event.preventDefault();
  savePayment(event);
});
```

### Submit flow mới

```js
await window.DeliveryCore.savePayment(order, values);
await window.DeliveryCore.confirmDelivery(currentOrder() || order, { deliveryStatus: 'delivered' });
window.DeliveryCore.state.selectedOrder = null;
state.selectedKey = '';
state.paymentSubmitting = false;
switchToListMode({ clearSelected: true, forceOrders: true });
await load({ force: true, refreshActiveTab: true });
```

## 5. API/backend contract

Không đổi backend route, schema, business rule hoặc ledger.

Frontend vẫn gọi canonical API qua `DeliveryCore`:

- `POST /api/delivery/payment`
- `POST /api/delivery/confirm`
- `GET /api/delivery/orders`

Compatibility route `/api/mobile/delivery/*` vẫn tồn tại và không bị sửa.

## 6. Kiểm thử đã chạy

### Pass

```bash
npm run check:syntax
# SYNTAX_OK 982 JavaScript files
```

```bash
npm run check:source-bundles
# [source-bundles] OK 19 bundles
```

```bash
node --test \
  test/delivery-payment-confirm-flow-static.test.js \
  test/delivery-compact-customer-workflow-ui-p1-static.test.js \
  test/delivery-split-list-customer-workflow-ui-static.test.js \
  test/delivery-return-tab-only-returned-items-static.test.js \
  test/delivery-dual-api-contract-p1p2-static.test.js \
  test/delivery-offline-queue-p0-static.test.js
# pass 31 / fail 0
```

### Ghi nhận khi chạy full `npm test`

`npm test` chưa pass toàn bộ do lỗi đã tồn tại ở baseline, không phát sinh từ patch này:

1. `test/accounting-ar-sale-staff-from-sales-order-static.test.js` fail ngay trên baseline với lỗi hydrate AR-SALE staff.
2. `node scripts/check-source-size-budget.js` fail ngay trên baseline vì `src/engines/delivery.legacy.engine.source/part-01.jsfrag` có kích thước `24771 bytes > budget 24576`.

Patch này đã giữ `public/mobile/js/delivery-mobile-view.source.js` đúng budget `77824 bytes`.

## 7. Kết quả theo case nghiệp vụ

| Case | Kết quả sau patch |
|---|---|
| Thu đủ | Submit qua direct click, lưu tiền, xác nhận giao, quay về danh sách. |
| Thu thiếu | Không chặn ở frontend; backend tiếp tục xử lý phần còn thiếu theo logic công nợ hiện có. |
| Thu thừa 14đ như ảnh | Được cho đi tiếp vì nằm trong tolerance 1.000đ đang dùng ở backend. |
| Thu thừa > 1.000đ | Hiển thị lỗi inline và message, không gửi request im lặng. |
| API lỗi | Giữ form, hiện lỗi, enable lại nút. |
| Double tap | `state.paymentSubmitting` + disabled button chặn gửi trùng. |

## 8. Rủi ro còn lại

- Cần test thực tế trên APK/WebView đang dùng ở máy NVGH để xác nhận touch/click đã ổn định.
- Nếu muốn rule “không bao giờ được thu thừa dù 1đ”, cần chốt lại nghiệp vụ vì backend hiện đang cho tolerance 1.000đ.
- `npm test` toàn bộ đang bị lỗi baseline ngoài phạm vi; nên đóng một gate riêng xử lý AR-SALE staff hydrate và source-size budget legacy engine.
