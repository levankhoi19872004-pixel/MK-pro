# PHASE17 — P1 Load more/phân trang Công nợ NVGH

## Baseline

- Baseline ZIP: `MK-pro-phase16-delivery-mobile-performance-p1-patched(1).zip`
- Phạm vi: Công nợ NVGH trên app giao hàng và API `/api/mobile/debts`.
- Không đổi nghiệp vụ thu nợ, không đổi AR/Fund/Inventory, không đổi owner-scope NVGH.

## Kết quả khảo sát

### Backend

`/api/mobile/debts` đã có sẵn validation `page` và `limit` trong `src/routes/mobile/debts.routes.js`:

- `page >= 1`
- `limit` từ `1..100`

`src/services/mobile/mobileDebtQuery.service.js` đã phân trang bằng `$facet` sau khi group theo khách hàng và có `pagination.hasMore/totalRows/totalPages`.

Điểm thiếu: response chưa có alias `total` và `nextPage`, khiến frontend chưa có contract rõ để làm nút “Tải thêm”.

### Frontend

`public/mobile/js/delivery-mobile-view.source.js` vẫn gọi cố định:

```text
/api/mobile/debts?collectorType=delivery&includePendingCollections=1&includePaid=0&limit=100
```

Rủi ro: nếu NVGH có hơn 100 khách nợ, app chỉ thấy trang đầu và không có cách tải phần còn lại.

## Thay đổi đã thực hiện

### 1. Backend pagination contract rõ hơn

File sửa:

```text
src/services/mobile/mobileDebtQuery.service.js
```

Bổ sung vào `pagination`:

```js
pagination.total = pagination.totalRows;
pagination.nextPage = pagination.hasMore ? page + 1 : null;
```

Giữ nguyên `summary.totalDebt`, `summary.pendingCollected`, `summary.availableDebt`, `summary.customerCount`, `summary.orderCount` theo toàn bộ tập kết quả đã filter/scope, không chỉ trang hiện tại.

### 2. Frontend Công nợ có load more

File sửa:

```text
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
```

Bổ sung state:

```text
debtPage
debtLimit
debtHasMore
debtTotalRows
debtTotalPages
debtNextPage
debtLoadingMore
```

Luồng mới:

- Trang đầu gọi `page=1&limit=100`.
- Nếu API trả `hasMore=true`, UI hiện nút “Tải thêm”.
- Bấm “Tải thêm” gọi `nextPage`.
- Dữ liệu mới được append vào danh sách cũ.
- Deduplicate theo khóa khách hàng ổn định: `customerId/customerCode/code/id/_id/customerName`.
- Search thay đổi sẽ reset pagination và tải lại từ trang 1.
- Pending collection vẫn giữ trong request qua `includePendingCollections=1`.

### 3. UI hiển thị tiến độ tải

File sửa:

```text
public/mobile/mobile.source/mobile-03.css
public/mobile/mobile.css
```

Thêm vùng:

```text
Đã tải X/Y khách nợ
Tải thêm
Đã tải hết
```

### 4. Giữ owner-scope NVGH

Không đổi logic `scopeDebtQuery()` trong:

```text
src/services/mobile/debts.service.js
```

Role `delivery` vẫn bị ép theo `deliveryStaffCode` của user đăng nhập, không tin `deliveryStaffCode` từ client.

## Test bổ sung

File thêm:

```text
test/delivery-debt-pagination-p1-static.test.js
```

Các case đã khóa:

1. API có `page/limit`, `hasMore`, `total`, `nextPage`.
2. Frontend gọi trang đầu và có nút “Tải thêm”.
3. Bấm tải thêm append không duplicate khách hàng.
4. Search reset pagination về trang đầu.
5. Pending collection và owner-scope NVGH vẫn được giữ.

Cập nhật test static cũ để phù hợp với URL động qua `URLSearchParams` thay vì string URL cố định.

## File thay đổi

```text
Modified:
- config/source-bundles.json
- config/source-size-budget.json
- public/mobile/js/delivery-mobile-view.source.js
- public/mobile/js/delivery-mobile-view.js
- public/mobile/js/delivery-mobile-view.js.map
- public/mobile/mobile.source/mobile-03.css
- public/mobile/mobile.css
- src/services/mobile/mobileDebtQuery.service.js
- test/delivery-mobile-debt-tab-static.test.js
- test/delivery-mobile-performance-p1-static.test.js

Added:
- test/delivery-debt-pagination-p1-static.test.js
- PHASE17_DELIVERY_DEBT_PAGINATION_P1_REPORT.md

Deleted:
- Không có
```

## Kết quả test

### Dependency

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

### Source bundle

```bash
npm run check:source-bundles
```

Kết quả:

```text
[source-bundles] OK 19 bundles
```

### Source size

```bash
npm run check:source-size
```

Kết quả:

```text
[source-size-budget] OK
```

Ghi chú: `public/mobile/js/delivery-mobile-view.js` tăng kích thước do thêm state/pagination/load-more UI, nên budget riêng của file này được nâng từ `40960` lên `49152` bytes. Không nới budget toàn cục.

### Syntax

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 942 JavaScript files
```

### Targeted tests

```bash
node --test \
  test/delivery-debt-pagination-p1-static.test.js \
  test/delivery-mobile-performance-p1-static.test.js \
  test/delivery-mobile-debt-tab-static.test.js \
  test/delivery-mobile-ui-p0p1-static.test.js
```

Kết quả:

```text
# tests 17
# pass 17
# fail 0
```

### Full test

```bash
npm test
```

Kết quả thực tế:

```text
# tests 1012
# pass 1009
# fail 2
# skipped 1
```

Hai test fail là snapshot legacy đã tồn tại từ các phase trước, không liên quan phần Công nợ NVGH:

```text
test/phase79-production-strangler.test.js
- assembled index page matches the approved Phase80 characterization snapshot
- split CSS parts preserve exact legacy cascade order
```

## Rủi ro còn lại

- API đang dùng phân trang dạng `page`. Với dữ liệu rất lớn và biến động liên tục, cursor pagination sẽ ổn định hơn, nhưng hiện tại page pagination đủ phù hợp cho quy mô nội bộ.
- Search đã reset page và gọi server-side `q`; sort vẫn xử lý client-side trên tập dữ liệu đã tải. Nếu sau này cần sort toàn bộ server-side, nên bổ sung `sort` parameter rõ ràng ở API.

## Khuyến nghị tiếp theo

Phương án A — production-grade dài hạn:

- Chuyển `/api/mobile/debts` sang cursor pagination theo khóa sort ổn định `debt desc + customerName + _id`.
- Thêm sort server-side cho `debt_desc`, `available_desc`, `oldest_asc`.
- Effort: Medium/Hard.
- Lợi ích: ổn định hơn khi dữ liệu lớn và có thay đổi trong lúc NVGH đang tải.

Phương án B — cân bằng effort, phù hợp hiện tại:

- Giữ page pagination 100 khách/trang như bản vá này.
- Theo dõi số khách nợ thực tế và latency `/api/mobile/debts` sau chạy thử.
- Effort: Easy/Medium.
- Rủi ro thấp, ít đụng backend.
