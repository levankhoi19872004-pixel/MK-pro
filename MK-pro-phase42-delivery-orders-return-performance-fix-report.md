# MK-pro Phase42 - Delivery Orders & Return Performance Fix Report

## 1. Tổng quan dự án/phần liên quan

- Dự án: Node.js/Express + MongoDB/Mongoose, frontend mobile giao hàng chạy qua Web/WebView.
- Route chính của App Giao Hàng:
  - `GET /api/delivery/orders`
  - `GET /api/delivery/returns`
  - `POST /api/delivery/return`
  - `POST /api/delivery/payment`
  - `POST /api/delivery/confirm`
- Route tương thích mobile: `/api/mobile/delivery/*` vẫn delegate về service/engine delivery chuẩn.
- Nguồn xử lý chính:
  - `src/engines/delivery.legacy.engine.source/part-02.jsfrag`
  - `src/engines/delivery.legacy.engine.source/part-03.jsfrag`
  - `src/engines/delivery.legacy.engine.js` (generated bundle)
  - `src/services/mongoIndexService.js`

## 2. Nguyên nhân gốc

### A. Đơn đã confirm vẫn có thể còn trong Danh sách giao

`POST /api/delivery/confirm` đã cập nhật đơn về trạng thái giao xong (`deliveryStatus/status = delivered`). Tuy nhiên `GET /api/delivery/orders` trước patch chỉ loại các trạng thái hủy/xóa/void, chưa loại các đơn đã hoàn tất giao theo mặc định. Hàm `applyDeliveryStatusFilter()` coi `statusFilter` mặc định là `all`, nên đơn đã `delivered` vẫn có thể quay lại danh sách xử lý sau khi frontend refresh.

### B. `/api/delivery/orders` chậm

Query danh sách giao trước patch vẫn để Mongo lấy cả nhóm đơn đã giao xong rồi mới xử lý ở tầng JS. Với dữ liệu lớn, điều này làm tăng số document phải đọc và làm app có cảm giác quay lại danh sách chậm. Patch đã đẩy điều kiện “đơn đang xử lý” xuống Mongo query bằng filter `deliveryStatus/status`.

### C. `/api/delivery/returns` phát sinh `SalesOrder.findOne` theo từng đơn

Log thực tế cho thấy mỗi lần mở tab Hàng trả có thể gọi:

```text
SalesOrder.findOne { id: "SO..." } (400-600ms)
```

Trong `listReturns(query)`, khi frontend hỏi returns theo `orderId/orderCode`, code cũ fallback sang `getCanonicalOrderByKey()`, tức đọc lại `SalesOrder.findOne`, kể cả khi `returnOrders` không có dữ liệu hoặc bản ghi trả hàng đã đủ thông tin hiển thị. Đây là N+1/extra lookup không cần thiết vì `returnOrders` là SSoT của hàng trả.

## 3. Phương án xử lý

| Phương án | Nội dung | Lợi ích | Nhược điểm | Effort | Chọn |
|---|---|---|---|---|---|
| A - Production grade | Loại đơn delivered khỏi list mặc định từ Mongo query; `/returns` đọc trực tiếp `returnOrders`, hỗ trợ batch keys, bỏ fallback `SalesOrder.findOne`; bổ sung index liên quan | Đúng nghiệp vụ, giảm query thừa, giữ route/API cũ | Cần kiểm tra UI nếu có màn muốn xem lịch sử đơn đã giao | Medium | Đã chọn |
| B - Cân bằng effort | Chỉ thêm cache frontend hoặc index `{ id: 1 }` | Ít sửa code | Không xử lý triệt để đơn đã confirm còn hiện lại và N+1 `/returns` | Easy | Không chọn |

## 4. Patch đã thực hiện

### 4.1. Lọc đơn đã giao xong khỏi danh sách mặc định

File:

```text
src/engines/delivery.legacy.engine.source/part-02.jsfrag
src/engines/delivery.legacy.engine.js
```

Thêm nhóm trạng thái hoàn tất:

```js
const COMPLETED_DELIVERY_STATUSES = ['delivered', 'success', 'done', 'completed', 'accounting_confirmed'];
```

Thêm filter mặc định:

```js
function applyDeliveryStatusFilter(rows = [], query = {}) {
  const statusFilter = lower(query.statusFilter || query.deliveryStatusFilter || query.orderStatusFilter || 'all');
  let filteredRows = rows;
  if (shouldExcludeCompletedDeliveryOrders(query)) {
    filteredRows = filteredRows.filter((row) => !isDeliveredOrder(row));
  }
  if (!statusFilter || ['all', 'tat ca', 'tất cả', '*'].includes(statusFilter)) return filteredRows;
  ...
}
```

Đẩy filter xuống Mongo:

```js
if (shouldExcludeCompletedDeliveryOrders(query)) {
  and.push(openStatusMongoClause('deliveryStatus'));
  and.push(openStatusMongoClause('status'));
}
```

Vẫn giữ khả năng xem đơn đã giao khi gọi rõ:

```text
statusFilter=delivered
includeCompleted=1
includeDelivered=1
```

### 4.2. Bỏ fallback `SalesOrder.findOne` trong `/api/delivery/returns` direct order query

File:

```text
src/engines/delivery.legacy.engine.source/part-03.jsfrag
src/engines/delivery.legacy.engine.js
```

Old behavior:

```js
const directOrder = await this.getCanonicalOrderByKey(directKeys[0]);
const directRows = directReturns.flatMap((ro) => flattenReturnOrderRows(ro, directOrder || {}));
```

New behavior:

```js
const directRows = directReturns.flatMap((ro) => flattenReturnOrderRows(ro, {}));
return { rows: directRows, returnOrdersRaw: directReturns, summary: summarizeReturnRows(directRows) };
```

Nếu không có `returnOrders` chính thức:

```js
return { rows: [], returnOrdersRaw: [], summary: summarizeReturnRows([]) };
```

Lý do: Tab Hàng trả chỉ cần dữ liệu hàng trả đã lưu; không cần đọc lại `SalesOrder` để tạo fallback hiển thị.

### 4.3. Hỗ trợ batch key cho `/api/delivery/returns`

`listReturns()` hiện đọc được cả các tham số dạng danh sách:

```text
orderIds=SO1,SO2,SO3
salesOrderIds=SO1,SO2,SO3
orderCodes=...
salesOrderCodes=...
```

Điều này giúp mở đường cho frontend gom request thay vì gọi từng đơn.

### 4.4. Bổ sung index liên quan

File:

```text
src/services/mongoIndexService.js
```

Bổ sung/giữ nhóm index phục vụ route delivery:

```js
// SalesOrder đã có index chính
{ id: 1 }
{ deliveryDate: -1, deliveryStaffCode: 1, deliveryStatus: 1 }

// ReturnOrder lookup theo order aliases
{ salesOrderId: 1, status: 1 }
{ salesOrderCode: 1, status: 1 }
{ orderId: 1, status: 1 }
{ orderCode: 1, status: 1 }
{ sourceOrderCode: 1, status: 1 }
{ deliveryOrderId: 1, status: 1 }
{ deliveryOrderCode: 1, status: 1 }
```

Lưu ý deploy: cần chạy `npm run mongo:indexes` hoặc quy trình tạo index production tương ứng để MongoDB Atlas thực sự có index mới.

## 5. File đã sửa/thêm

```text
Sửa:
- src/engines/delivery.legacy.engine.source/part-02.jsfrag
- src/engines/delivery.legacy.engine.source/part-03.jsfrag
- src/engines/delivery.legacy.engine.js
- src/services/mongoIndexService.js
- config/source-bundles.json

Thêm:
- test/delivery-orders-return-performance-fix.test.js
- MK-pro-phase42-delivery-orders-return-performance-fix-report.md
```

## 6. Test thực tế

### Pass

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 984 JavaScript files
```

```bash
npm run check:source-bundles
```

Kết quả:

```text
[source-bundles] OK 19 bundles
```

Suite liên quan trực tiếp Phase42 + regression delivery/payment/owner scope:

```bash
node --test \
  test/delivery-orders-return-performance-fix.test.js \
  test/delivery-owner-scope-p0.test.js \
  test/delivery-payment-stale-conflict-fix.test.js \
  test/delivery-version-conflict.test.js \
  test/delivery-money-inventory-debt-flow.test.js \
  test/delivery-payment-confirm-flow-static.test.js \
  test/delivery-dual-api-contract-p1p2-static.test.js \
  test/delivery-mobile-performance-p1-static.test.js \
  test/mobile-delivery-confirm-canonical.test.js \
  test/mobile-delivery-return-flow.test.js \
  test/mobile-delivery-scoped-query.test.js
```

Kết quả:

```text
# tests 38
# pass 38
# fail 0
```

### `npm run build`

Không chạy được vì `package.json` không có script `build`.

```text
npm error Missing script: "build"
```

### `npm test`

`npm test` toàn bộ vẫn fail do các lỗi ngoài phạm vi phase42. Đã kiểm tra riêng: test `mongo-index-cleanup-policy` đã fail ở baseline phase41 với `orders: 24 !== 13` trước khi phase42 sửa. Ngoài ra còn các static test UI/route cũ và source-size budget cũ:

```text
src/engines/delivery.legacy.engine.source/part-01.jsfrag: 24782 bytes > budget 24576
```

Phase42 không làm tăng size của `part-01`; `part-02` sau patch vẫn dưới budget:

```text
part-02.jsfrag: 24306 bytes
```

## 7. Rủi ro còn lại

- Cần test APK/WebView thật với tài khoản NVGH `ghth` để xác nhận sau confirm đơn biến khỏi danh sách ngay.
- Cần chạy tạo index trên MongoDB Atlas production; nếu chỉ deploy code mà chưa tạo index, hiệu năng query có thể chưa cải thiện đầy đủ.
- Nếu có màn nghiệp vụ cần xem lại đơn đã giao trong App Giao Hàng, phải gọi rõ `includeCompleted=1` hoặc `statusFilter=delivered`; mặc định danh sách xử lý sẽ ẩn đơn đã giao xong.
- Frontend hiện vẫn có thể gọi `/api/delivery/returns` theo từng đơn; backend đã bỏ `SalesOrder.findOne` thừa. Tối ưu tiếp theo nên gom frontend thành một request batch nếu log vẫn còn nhiều request nhỏ.

## 8. Hướng dẫn deploy/test nhanh

```bash
npm install
npm run check:syntax
npm run check:source-bundles
node --test test/delivery-orders-return-performance-fix.test.js test/delivery-owner-scope-p0.test.js
npm run mongo:indexes
```

Sau deploy, test thực tế:

1. Vào App Giao Hàng bằng NVGH.
2. Chọn đơn chưa giao.
3. Vào Hàng trả nếu có trả hàng.
4. Vào Thu tiền, bấm Xác nhận thu tiền.
5. Kiểm tra log có `payment 200`, `confirm 200`, `orders 200`.
6. Đơn đã confirm không còn trong danh sách giao đang xử lý.
7. Mở tab Hàng trả, log không còn `SalesOrder.findOne { id: "SO..." }` lặp theo từng đơn.
