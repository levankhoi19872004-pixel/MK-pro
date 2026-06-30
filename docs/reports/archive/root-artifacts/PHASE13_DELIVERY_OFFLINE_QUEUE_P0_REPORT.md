# PHASE 13 — P0 Delivery Offline Queue Lockdown Report

## 1. Tổng quan dự án / baseline

- Baseline thực tế: `MK-pro-phase12-delivery-owner-scope-p0-patched(1).zip` do người dùng upload, là ZIP mới hơn so với tên baseline trong prompt.
- Tech stack: Node.js/Express monolith, MongoDB/Mongoose, frontend classic JS + mobile JS modules, test bằng `node:test` qua `scripts/run-tests.js`.
- Phạm vi xử lý: chỉ khóa rủi ro offline queue trong app giao hàng/mobile debt collection; không sửa UI layout, AR/Fund/Inventory posting, business rule giao hàng hoặc schema.

## 2. Kết quả kiểm tra rủi ro P0

| Khu vực | Trạng thái trước vá | Rủi ro | Kết quả sau vá |
|---|---|---|---|
| `public/js/delivery/delivery-core.js` `saveReturn()` | Khi network error có gọi `MobileOfflineSync.queueOperation('delivery_return_save', payload)` | Trả hàng có thể bị post trễ, lệch tồn/công nợ nếu queue tự drain | Đã bỏ queue; ném lỗi rõ “Giao dịch chưa được ghi nhận.” |
| `public/js/delivery/delivery-core.js` `savePayment()` | Khi network error có gọi `MobileOfflineSync.queueOperation('delivery_payment_save', payload)` | Thu tiền có thể bị post trễ, khó đối soát quỹ/công nợ | Đã bỏ queue; ném lỗi rõ “Giao dịch chưa được ghi nhận.” |
| `public/mobile/js/offline-sync.js` | Queue code tồn tại sau feature flag, nhưng chưa có deny-list cho tiền/tồn/trả hàng | Nếu flag bị bật nhầm, thao tác giao hàng có thể vào queue | Đã thêm deny-list fail-closed cho `delivery_return_save`, `delivery_payment_save`, `delivery_confirm`, `debt_collection_submit` |
| `src/services/mobile/MobileSyncService.js` | Legacy drain backend vẫn có nhánh dispatch operation tiền/trả hàng | Operation cũ trong IndexedDB có thể tự post khi online trở lại | Đã chặn server-side trước khi dispatch business write |
| `src/services/mobile/runtimeConfig.service.js` | `offlineQueueEnabled` chỉ cần `ENABLE_MOBILE_OFFLINE_QUEUE=true` | Dễ bật nhầm một flag là queue hoạt động | Nay cần đồng thời `ENABLE_MOBILE_OFFLINE_SYNC=true` và `ENABLE_MOBILE_OFFLINE_QUEUE=true`; mặc định false |
| Tài liệu ENV/deploy | Có flag false nhưng cảnh báo chưa đủ rõ cho giao hàng | Render ENV dễ bị bật nhầm | Đã bổ sung cảnh báo production online-first và không bật offline queue khi chưa có đối soát/idempotency |

## 3. Root cause

Nguyên nhân chính nằm ở fallback client trong `DeliveryCore.saveReturn()` và `DeliveryCore.savePayment()`: khi `fetch` lỗi mạng, code tự đẩy payload vào `MobileOfflineSync.queueOperation(...)` và trả `ok/offlineQueued`. Với nghiệp vụ giao hàng, đây là nhóm giao dịch nhạy cảm vì ảnh hưởng trực tiếp tới:

- Hàng trả về / tồn kho.
- Tiền thu / quỹ.
- Công nợ khách hàng.
- Trạng thái giao hàng/xác nhận.

Trong khi hệ thống hiện chưa có quy trình reconciliation offline production-grade cho các giao dịch này, nên hướng sửa an toàn là online-first/fail-closed.

## 4. File đã sửa/thêm

### Modified

```text
.env.example
.env.production.example
DEPLOYMENT_CHECKLIST.md
ENVIRONMENT_VARIABLES.md
MOBILE_PRODUCTION_DEPLOYMENT_CHECKLIST.md
public/js/delivery/delivery-core.js
public/mobile/js/offline-sync.js
src/services/mobile/MobileSyncService.js
src/services/mobile/runtimeConfig.service.js
```

### Added

```text
test/delivery-offline-queue-p0-static.test.js
PHASE13_DELIVERY_OFFLINE_QUEUE_P0_DIFF.patch
PHASE13_DELIVERY_OFFLINE_QUEUE_P0_REPORT.md
```

### Deleted

```text
Không có
```

## 5. Old / New quan trọng

### 5.1 `saveReturn()` / `savePayment()`

**Before**

```js
if (window.MobileOfflineSync && window.MobileOfflineSync.isNetworkError(err)) {
  await window.MobileOfflineSync.queueOperation('delivery_return_save', payload);
  return { ok: true, offlineQueued: true, message: 'Đã lưu hàng trả offline, sẽ tự đồng bộ khi có mạng', order: order };
}
```

**After**

```js
if (window.MobileOfflineSync && window.MobileOfflineSync.isNetworkError(err)) {
  var offlineError = new Error('Mất kết nối. Vui lòng thử lại khi có mạng. Giao dịch chưa được ghi nhận.');
  offlineError.code = 'DELIVERY_OFFLINE_TRANSACTION_NOT_RECORDED';
  offlineError.cause = err;
  throw offlineError;
}
```

### 5.2 Client queue deny-list

```js
const FINANCIAL_OR_STOCK_OPERATION_TYPES = new Set([
  'debt_collection_submit',
  'delivery_return_save',
  'delivery_payment_save',
  'delivery_confirm'
]);

export function canQueueOfflineOperation(type = '') {
  if (isFinancialOrStockOperation(type)) return false;
  return isOfflineQueueEnabled();
}
```

### 5.3 Backend legacy sync deny-list

```js
function assertOfflineOperationAllowed(type) {
  if (!isFinancialOrStockOfflineOperation(type)) return;
  throw Object.assign(new Error('Mất kết nối. Vui lòng thử lại khi có mạng. Giao dịch chưa được ghi nhận.'), {
    status: 409,
    code: 'MOBILE_OFFLINE_FINANCIAL_STOCK_QUEUE_DISABLED'
  });
}
```

## 6. Test đã chạy

### Pass

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check:source-bundles
npm run check:syntax
node --test --test-concurrency=1 \
  test/delivery-offline-queue-p0-static.test.js \
  test/mobile-offline-sync-contract.test.js \
  test/mobile-sales-phase5-production-hardening.test.js
```

Kết quả:

```text
[source-bundles] OK 19 bundles
SYNTAX_OK 938 JavaScript files
# tests 16
# pass 16
# fail 0
```

### Full test theo yêu cầu

```bash
npm test
```

Kết quả thực tế:

```text
# tests 991
# pass 988
# fail 2
# skipped 1
```

Hai test fail là lỗi snapshot characterization cũ, không liên quan các file offline queue vừa sửa:

```text
test/phase79-production-strangler.test.js:38
- assembled index page matches the approved Phase80 characterization snapshot

test/phase79-production-strangler.test.js:46
- split CSS parts preserve exact legacy cascade order
```

Hash fail ghi nhận:

```text
assembled index actual: ff5cc35f968b03777118101d3cab977fcc7fba428b066a6032612d094b961d3c
assembled index expected: 935f3a5294989f410068707fbf2dacba440297c48b6ea54538610d2f3c656a0f

split CSS actual: a61cd0f25b01fcf5219e3b4ee65e850f36a44289336079b332c3435dd1142576
split CSS expected: 2b201385219e49d988319457eaaf18ea50b3494cd6fe526095df1545056e6783
```

## 7. Đánh giá tác động

| Hạng mục | Tác động |
|---|---|
| App giao hàng mất mạng khi lưu trả hàng | Báo lỗi rõ, không ghi nhận, không queue |
| App giao hàng mất mạng khi lưu thu tiền | Báo lỗi rõ, không ghi nhận, không queue |
| Legacy queued operation cũ | Nếu là tiền/trả hàng/xác nhận sẽ bị backend từ chối, không post business write |
| Admin/web delivery online | Không đổi nghiệp vụ khi API online |
| AR/Fund/Inventory | Không sửa logic posting |
| ENV Render | Mặc định false; muốn bật queue phải bật explicit cả hai flag, nhưng production checklist cảnh báo không bật |

## 8. Phương án triển khai

### Phương án A — Khuyến nghị production-grade

- Giữ bản vá hiện tại: online-first/fail-closed cho mọi giao dịch tiền/trả hàng/xác nhận giao hàng.
- Không bật `ENABLE_MOBILE_OFFLINE_SYNC` và `ENABLE_MOBILE_OFFLINE_QUEUE` trên Render production.
- Chỉ triển khai offline transaction thật sau khi có bảng đối soát riêng, idempotency key đầy đủ, trạng thái pending/confirmed/rejected và màn hình kế toán duyệt queue.

Effort: Medium/Hard nếu làm offline thật sau này.  
Rủi ro: thấp với bản vá hiện tại; cao nếu bật queue khi chưa có đối soát.

### Phương án B — Cân bằng effort hiện tại

- Giữ offline queue code legacy nhưng deny-list các operation tài chính/tồn kho như bản vá này.
- Cho phép tiếp tục drain operation không nhạy cảm nếu cần migration, nhưng đóng drain sau khi queue cũ bằng 0.

Effort: Easy/Medium.  
Rủi ro: thấp nếu giám sát và tắt legacy drain đúng hạn.

## 9. Rủi ro còn lại

- `ENABLE_MOBILE_LEGACY_SYNC_DRAIN=true` vẫn cho phép drain operation không nằm trong deny-list. Cần tắt sau khi xác nhận queue cũ bằng 0.
- Full test còn 2 fail snapshot cũ ở `phase79-production-strangler`; không xử lý trong prompt này để tránh sửa lan rộng ngoài phạm vi P0 offline queue.
