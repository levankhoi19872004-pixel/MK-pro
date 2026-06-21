# PHASE28 — Delivery Return Tab Only Returned Items

## Baseline

`MK-pro-phase27-delivery-split-list-customer-workflow-ui-patched.zip`

## Mục tiêu

Sửa App Giao Hàng MK-Pro để tab **Hàng trả** chỉ hiển thị các sản phẩm thực sự có số lượng trả (`returnQty > 0`), không hiển thị toàn bộ danh sách hàng giao có `SL trả = 0`. Đồng thời tăng cường ẩn các thông tin ngoài danh sách khi đã vào xử lý một khách/cửa hàng.

## Khảo sát trước khi sửa

| File | Hàm/đoạn code | Hành vi hiện tại | Vấn đề | Cách sửa |
|---|---|---|---|---|
| `public/mobile/js/delivery-mobile-view.source.js` | `renderReturns(body)` | Gọi `buildReturnInputRows(order, rows)` rồi render toàn bộ dòng sản phẩm | Tab Hàng trả giống tab Hàng giao, hiển thị cả sản phẩm `SL trả = 0` | Tạo `returnedRowsForOrder(order)` và chỉ render dòng `returnQty > 0` |
| `public/mobile/js/delivery-mobile-view.source.js` | `renderWorkflowBar()` | Tab Hàng trả luôn hiện `Lưu hàng trả & sang Thu tiền` và `Xóa hàng trả` | Khi chưa có hàng trả vẫn hiện nút xóa/lưu gây hiểu nhầm | Nếu chưa có hàng trả, chỉ hiện `Quay lại Hàng giao` |
| `public/mobile/js/delivery-mobile-view.source.js` | `renderListChromeVisibility()` | Đã set `hidden` cho filter/KPI khi customer mode | Một số WebView/CSS có thể vẫn hiển thị thông tin ngoài danh sách | Bổ sung class `customer-workflow-mode`/`list-workflow-mode` lên root |
| `public/mobile/mobile.source/mobile-04.css` | CSS mobile Phase27 | Chưa có CSS guard mạnh cho customer mode | Filter/KPI chung có nguy cơ còn hiện khi xử lý khách | Thêm CSS `customer-workflow-mode #mDeliveryFilter/#mDeliveryKpis { display:none!important; }` |

## Nội dung đã sửa

### 1. Tab Hàng trả chỉ render sản phẩm đã trả

Thêm helper:

```js
sourceReturnRowsForOrder(order)
returnedRowsForOrder(order)
hasReturnedRowsForCurrentOrder(order)
```

Trong `renderReturns(body)`, danh sách render được lấy từ:

```js
var rows = returnedRowsForOrder(order);
```

Quy tắc lọc:

```js
num(it.returnQty) > 0
```

Kết quả: sản phẩm có `SL trả = 0` không còn xuất hiện ở tab Hàng trả.

### 2. Empty state khi chưa có hàng trả

Khi chưa có dòng trả hàng:

```text
Chưa có hàng trả cho đơn này.
Nhập số lượng trả ở tab Hàng giao nếu khách trả hàng.
[Quay lại Hàng giao]
```

Không render toàn bộ danh sách sản phẩm giao.

### 3. Sticky action của tab Hàng trả theo trạng thái

- Có hàng trả: giữ `Lưu hàng trả & sang Thu tiền` và `Xóa hàng trả`.
- Chưa có hàng trả: chỉ hiện `Quay lại Hàng giao`.

### 4. Khi đã vào cửa hàng/khách, ẩn chắc thông tin ngoài danh sách

Bổ sung class ở root:

```js
list-workflow-mode
customer-workflow-mode
```

Và CSS guard:

```css
.mobile-delivery-v46.customer-workflow-mode #mDeliveryFilter,
.mobile-delivery-v46.customer-workflow-mode #mDeliveryKpis {
  display: none !important;
}
```

Mục tiêu: khi xử lý một khách, không còn hiển thị bộ lọc ngày/trạng thái/tìm khách và KPI chung toàn ngày.

## File đã sửa/thêm

### Modified

- `config/source-bundles.json`
- `public/mobile/js/delivery-mobile-view.source.js`
- `public/mobile/js/delivery-mobile-view.js`
- `public/mobile/js/delivery-mobile-view.js.map`
- `public/mobile/mobile.source/mobile-04.css`
- `public/mobile/mobile.css`

### Added

- `test/delivery-return-tab-only-returned-items-static.test.js`
- `PHASE28_DELIVERY_RETURN_TAB_ONLY_RETURNED_ITEMS_REPORT.md`

### Deleted

- Không có

## Test đã chạy

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
node --test \
  test/delivery-return-tab-only-returned-items-static.test.js \
  test/delivery-split-list-customer-workflow-ui-static.test.js \
  test/delivery-customer-workflow-ui-p1-static.test.js \
  test/delivery-real-workflow-ui-p1-static.test.js \
  test/delivery-compact-customer-workflow-ui-p1-static.test.js \
  test/delivery-deduplicate-actions-ui-static.test.js \
  test/delivery-mobile-performance-p1-static.test.js \
  test/delivery-reconciliation-report-p1-static.test.js
npm test
```

## Kết quả test

```text
[source-bundles] OK 19 bundles
[source-size-budget] OK
SYNTAX_OK 957 JavaScript files
Targeted delivery/UI tests: 43 pass / 0 fail
Full npm test: 1067 tests / 1064 pass / 2 fail / 1 skipped
```

Hai lỗi fail vẫn là snapshot legacy cũ, đã tồn tại từ các phase trước và không liên quan Phase28:

```text
test/phase79-production-strangler.test.js
- assembled index page matches the approved Phase80 characterization snapshot
- split CSS parts preserve exact legacy cascade order
```

## Rủi ro còn lại

- Nếu backend `saveReturn` không coi dòng `returnQty = 0` gửi từ tab Hàng trả là lệnh xóa dòng trả đã lưu, cần kiểm tra thực tế trên môi trường dữ liệu thật. Frontend đã đảm bảo nếu một dòng đang có hàng trả được sửa về 0, dòng đó vẫn được submit ở lần lưu hiện tại.
- Nếu WebView có CSS tùy biến ngoài ZIP override `[hidden]`, CSS guard `customer-workflow-mode` đã giảm rủi ro này nhưng vẫn nên test APK thật.

## Xác nhận phạm vi

- Không sửa backend.
- Không đổi API contract.
- Không đổi business rule tiền/tồn/công nợ.
- Không phá Phase27 list mode/customer mode.
- Tab Hàng giao vẫn hiển thị toàn bộ sản phẩm để nhập SL trả.
- Search sản phẩm trong tab Hàng giao vẫn giữ nguyên.
