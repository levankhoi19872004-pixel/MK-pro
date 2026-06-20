# FRONTEND PROFESSIONALIZATION REPORT — PHASE 08

## 1. Baseline và phạm vi

Baseline được sử dụng:

```text
MK-pro-phase07-worker-export-scalability-patched.zip
```

Phạm vi sửa thực tế chỉ gồm các hot path có tác động cao nhất:

1. Mobile Sales:
   - danh sách khách hàng;
   - danh sách khách hàng công nợ;
   - danh sách đơn hôm nay.
2. Mobile Delivery:
   - danh sách đơn giao;
   - danh sách khách hàng công nợ;
   - loading/error/empty state;
   - stale-response guard trong delivery core.
3. Shared mobile UI runtime và benchmark/test bảo vệ.

Web admin đã được khảo sát nhưng không sửa trong giai đoạn này vì đã có các helper chuẩn đang hoạt động:

```text
public/js/ui/clearable-search-inputs.js
public/js/ui/delivery-toolbar.js
public/js/ui/master-orders-toolbar.js
public/js/ui/toolbar-actions.js
public/css/96-ui-toolbar-system.css
public/css/97-clearable-search-inputs.css
```

Không rewrite framework, không thay API, schema, route, package dependency hoặc business rule.

Quy mô source package, không tính `node_modules` dùng tạm khi kiểm thử:

```text
Trước: 1.065 file · 7.283.734 byte
Sau:   1.077 file · 7.464.395 byte
Delta: +12 file · +180.661 byte
```

Phần tăng chủ yếu là source map, benchmark, report và ảnh kiểm thử; runtime JavaScript shared chỉ 5.568 byte raw.

## 2. Nguyên nhân gốc rễ

### 2.1 Listener theo từng dòng bị bind lại sau mỗi render

Baseline có các pattern:

```javascript
container.querySelectorAll('[data-row]').forEach((button) => {
  button.addEventListener('click', ...);
});
```

Pattern xuất hiện tại danh sách khách hàng/mobile debt của Sales và danh sách đơn/debt customer của Delivery. Mỗi lần filter hoặc reload tạo lại DOM và bind lại hàng trăm listener.

Đếm trên canonical source, không tính generated duplicate:

```text
Trước: 8 vòng listener trong row/list render
Sau:   3 vòng
Giảm:  5 vòng
```

Ba vòng còn lại thuộc tab navigation và checkbox/form động cần state theo dòng; chưa mở rộng refactor để tránh ảnh hưởng nghiệp vụ thu nợ.

### 2.2 Render toàn bộ list trong một long task

Các list dùng `innerHTML = rows.map(...).join('')`, khiến 500–1.000 dòng tạo toàn bộ node trước khi trình duyệt có cơ hội phản hồi.

### 2.3 Shared concern bị lặp

Debounce, loading/empty state, request gate và lifecycle cleanup được triển khai khác nhau giữa hai mobile app. Việc sửa một màn hình không bảo đảm màn hình còn lại có cùng safety contract.

### 2.4 Delivery response cũ có thể mutate state

`DeliveryCore.loadOrders()` và `loadReturns()` chưa có request sequence nội bộ. Khi filter/search liên tiếp, response cũ có thể về sau và ghi đè state mới.

### 2.5 `innerHTML` vẫn tồn tại

Card renderer hiện tại có escape helper và đã được giữ để bảo toàn layout. Patch này không thay toàn bộ card sang DOM component vì sẽ mở rộng rủi ro. Loading/error/empty message đã chuyển sang node + `textContent`; HTML append được gom vào helper có contract “trusted escaped HTML”.

## 3. Thiết kế trước và sau

### Trước

```text
Page script
  ├─ local debounce implementation
  ├─ full-list innerHTML
  ├─ querySelectorAll rows
  ├─ addEventListener cho từng row
  └─ request có guard không đồng nhất
```

### Sau

```text
MobileUiRuntime (shared, deterministic generated bundle)
  ├─ createLifecycle
  ├─ debounce
  ├─ createRequestGate
  ├─ renderState
  ├─ createChunkedHtmlRenderer
  └─ bindDebouncedInput
          ↓
Sales feature / Delivery feature
  ├─ module-local state
  ├─ one delegated list listener
  ├─ 60-row first chunk + 80-row next chunks
  ├─ request sequence/abort guard
  └─ pagehide cleanup
```

## 4. Thay đổi quan trọng

### 4.1 Event delegation

**Old**

```javascript
customerList.querySelectorAll('[data-customer-index]').forEach((button) => {
  button.addEventListener('click', () => selectCustomer(rows[Number(button.dataset.customerIndex)]));
});
```

**New**

```javascript
mobileSalesLifecycle.delegate(
  customerList,
  'click',
  '[data-customer-index]',
  (_event, button) => selectCustomer(state.customer.rows[Number(button.dataset.customerIndex)])
);
```

### 4.2 Chunked DOM update

**Old**

```javascript
customerList.innerHTML = rows.map(renderCustomerCard).join('');
```

**New**

```javascript
customerListRenderer.render(rows, renderCustomerCard);
```

Cấu hình hiện tại:

```text
initialCount: 60
chunkSize:    80
scheduler:    requestIdleCallback hoặc setTimeout fallback
```

### 4.3 Stale response guard

**Old**

```javascript
const rows = await requestJson(url);
state.orders = rows;
```

**New**

```javascript
const requestSeq = state.requestSeq.orders + 1;
state.requestSeq.orders = requestSeq;
const rows = await requestJson(url);
if (requestSeq !== state.requestSeq.orders) return state.orders;
state.orders = rows;
```

### 4.4 Loading/error/empty state

**Old**

```javascript
container.innerHTML = `<div class="m-empty danger">${escape(error.message)}</div>`;
```

**New**

```javascript
MobileUiRuntime.renderState(container, {
  state: 'error',
  title: 'Không tải được dữ liệu giao hàng',
  detail: error.message || 'Vui lòng thử lại.'
});
```

`renderState()` sử dụng `textContent` cho dữ liệu động.

## 5. Benchmark thực tế

Benchmark chạy bằng Chromium Headless 144, ba lần cho mỗi dataset. Baseline mô phỏng đúng pattern cũ: full `innerHTML` và một listener/row. Bản tối ưu dùng chính `MobileUiRuntime` production.

| Rows | First interaction trước | First interaction sau | Cải thiện | Initial DOM trước | Initial DOM sau | Listener trước/sau |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1,2 ms | 1,3 ms | −8,3% | 600 | 360 | 100 / 1 |
| 500 | 6,4 ms | 0,8 ms | **87,5%** | 3.000 | 360 | 500 / 1 |
| 1.000 | 11,8 ms | 0,5 ms | **95,8%** | 6.000 | 360 | 1.000 / 1 |

Tổng thời gian hoàn tất toàn bộ DOM:

| Rows | Trước | Sau |
|---:|---:|---:|
| 100 | 1,2 ms | 6,9 ms |
| 500 | 6,4 ms | 62,3 ms |
| 1.000 | 11,8 ms | 100,0 ms |

Đây là trade-off có chủ đích: bản mới nhường main thread giữa các chunk nên first interaction nhanh hơn, nhưng thời gian đến khi toàn bộ 1.000 dòng xuất hiện dài hơn. Không tuyên bố total-render nhanh hơn.

Các số đo khác:

```text
10 ký tự liên tiếp → request: 1 trước / 1 sau
Heap delta sau 50 lần chuyển màn hình synthetic:
  trước: 25.468 byte
  sau:   0 byte
```

Memory là số đo synthetic trong Chromium, chỉ dùng để phát hiện xu hướng listener/lifecycle leak, không thay thế profiling trên Android thật.

## 6. Bundle size

### Feature bundle

| File | Trước raw/gzip | Sau raw/gzip | Chênh lệch raw |
|---|---:|---:|---:|
| `sales.js` | 40.536 / 12.371 B | 40.847 / 12.516 B | +311 B |
| `delivery-core.js` | 25.471 / 6.034 B | 26.116 / 6.135 B | +645 B |
| `delivery-mobile-view.js` | 32.041 / 8.800 B | 34.547 / 9.379 B | +2.506 B |
| `ui-runtime.js` | — | 5.568 / 1.921 B | +5.568 B shared |

Raw local JavaScript được load bởi trang:

```text
Mobile Sales:    104.547 → 110.426 byte (+5,6%)
Mobile Delivery:  82.129 →  90.848 byte (+10,6%)
```

Shared runtime được browser cache giữa hai màn hình. Không sao chép helper vào từng feature bundle. `sales.js` vẫn dưới budget 40.960 byte.

## 7. Màn hình đã chuẩn hóa

| Màn hình | Hạng mục |
|---|---|
| Mobile Sales — Khách hàng | chunk render, delegated click, loading/error/empty, cleanup |
| Mobile Sales — Công nợ khách hàng | chunk render, delegated click, cleanup |
| Mobile Sales — Đơn hôm nay | chunk render, request sequence hiện hữu được giữ |
| Mobile Delivery — Đơn giao | chunk render, delegated click, request gate |
| Mobile Delivery — Công nợ | chunk render, delegated click, loading/empty, cleanup |
| Mobile Delivery core | stale-response guard cho orders và returns |

Web admin không có code change trong phase này; standard hiện hữu được ghi nhận và đưa vào `FRONTEND_UI_STANDARD.md` để các phase tiếp theo dùng chung.

## 8. Danh sách file

### Thêm

```text
FRONTEND_BENCHMARK.csv
FRONTEND_BENCHMARK.json
FRONTEND_PROFESSIONALIZATION_REPORT.md
FRONTEND_STATIC_METRICS.json
FRONTEND_UI_STANDARD.md
FRONTEND_UI_TEST.html
FRONTEND_UI_TEST.png
public/mobile/js/ui-runtime.source.js
public/mobile/js/ui-runtime.js
public/mobile/js/ui-runtime.js.map
scripts/performance/frontend-dom-benchmark.js
test/frontend-professionalization-phase08.test.js
```

### Sửa

```text
config/source-bundles.json
config/source-size-budget.json
package.json
public/js/delivery/delivery-core.js
public/mobile/delivery.html
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
public/mobile/sales.html
public/mobile/js/sales.source/part-01.jsfrag
public/mobile/js/sales.source/part-01b.jsfrag
public/mobile/js/sales.source/part-01c.jsfrag
public/mobile/js/sales.source/part-03.jsfrag
public/mobile/js/sales.source/part-03b.jsfrag
public/mobile/js/sales.js
test/phase79b-source-bundles.test.js
```

### Xóa

```text
0 file
```

Tổng thay đổi so với baseline:

```text
Thêm: 12 file
Sửa:  16 file
Xóa:   0 file
```

`package-lock.json` không thay đổi. `package.json` chỉ thêm script benchmark, không thêm/gỡ dependency.

## 9. Quality gate

| Gate | Kết quả thực tế |
|---|---:|
| Syntax | **PASS — 900 JavaScript** |
| Source bundles | **PASS — 19 bundle** |
| Source-size budget | **PASS** |
| Path portability | **PASS — 1.111 path** |
| Enterprise smoke | **PASS — 10 module / 11 flag** |
| OpenAPI/docs | **PASS — 313 operation** |
| Test Phase 08 + mobile targeted | **PASS — 24/24** |
| Full test suite | **PASS — 942, FAIL 0, SKIP 1** |
| Full test duration | **7,99 giây TAP; 10,73 giây process** |
| npm audit production | **PASS — 0 vulnerability** |
| `npm run quality` | **PASS — 18,68 giây** |
| Benchmark Chromium synthetic | **PASS** |
| UI HTML screenshot | **PASS — 430×844** |
| HTTP bind | **PASS — 6 ms** |
| MongoDB application readiness | **NOT RUN — thiếu `MONGO_URI`** |
| Mobile browser smoke chính thức | **SKIPPED — Chromium smoke bị giới hạn DBus trong môi trường** |
| Android device/E2E production | **NOT RUN** |

## 10. Rủi ro còn lại

1. Chunked renderer không phải true virtualization: sau khi hoàn tất, tổng số DOM node vẫn bằng baseline.
2. Total render dài hơn vì nhường main thread; đây là đánh đổi để giảm first-interaction latency.
3. `appendTrustedHtml()` không phải sanitizer. Renderer gọi nó vẫn phải escape mọi field động.
4. Checkbox thu nợ và một số form động vẫn bind listener theo row sau render; chưa chuyển để tránh mở rộng rủi ro nghiệp vụ.
5. Shared runtime tăng raw bundle lần đầu; lợi ích phụ thuộc cache và reuse giữa màn hình.
6. Chưa đo trên Android thiết bị thật, mạng di động thật và production dataset.
7. Chưa triển khai route-level lazy loading vì HTML hiện đã tách riêng Sales/Delivery; các script dùng chung hiện còn nhỏ và có cache.

## 11. Rollback

Rollback toàn bộ frontend Phase 08 bằng cách deploy lại:

```text
MK-pro-phase07-worker-export-scalability-patched.zip
```

Không cần rollback database vì phase này không migration, không thay schema, API hoặc dữ liệu nghiệp vụ.

Rollback riêng shared runtime:

1. Khôi phục hai HTML mobile về cache version Phase 07.
2. Khôi phục canonical source Sales/Delivery và `delivery-core.js` từ Phase 07.
3. Xóa entry `ui-runtime.js` khỏi `config/source-bundles.json` và budget tương ứng.
4. Chạy lại `npm run build:source-bundles`, `npm test`, `npm run quality`.
