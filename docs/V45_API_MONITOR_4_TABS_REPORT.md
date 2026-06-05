# V45 API Monitor - bổ sung 4 tab phân tích

## Mục tiêu

Nâng API Monitor từ bảng realtime thành màn phân tích tối ưu toàn hệ thống.

## Đã chỉnh sửa

### 1. Backend API Monitor

File: `src/middlewares/apiMonitor.middleware.js`

Đã bổ sung thống kê:

- `topSlowestApis`: Top API chậm nhất, sắp xếp theo `maxMs`, sau đó `avgMs`.
- `topCalledApis`: Top API gọi nhiều nhất, sắp xếp theo `count`.
- `topRowsApis`: Top API trả nhiều rows nhất, sắp xếp theo `maxRows`, sau đó `avgRows`.
- Thêm chỉ số rows tích lũy:
  - `totalRows`
  - `avgRows`
  - `maxRows`

API dùng chung vẫn là:

```http
GET /api/system/api-monitor?limit=200
```

Response giờ có thêm:

```js
{
  data: [...],
  topSlowestApis: [...],
  topCalledApis: [...],
  topRowsApis: [...],
  slowApis: [...]
}
```

### 2. Frontend giao diện API Monitor

File: `public/index.html`

Đã đổi khu API Monitor thành 4 tab:

1. Tab 1. Tất cả API
2. Tab 2. Top API chậm nhất
3. Tab 3. Top API gọi nhiều nhất
4. Tab 4. API có nhiều rows nhất

### 3. DOM State

File: `public/js/app/00-dom-state.js`

Đã thêm DOM references:

- `apiTopSlowTable`
- `apiTopCalledTable`
- `apiTopRowsTable`
- `apiMonitorTabButtons`
- `apiMonitorTabPanels`

### 4. Render dữ liệu tab

File: `public/js/app/09-system.js`

Đã thêm các hàm:

- `renderApiMonitorTopSlowRows()`
- `renderApiMonitorTopCalledRows()`
- `renderApiMonitorTopRowsRows()`
- `setupApiMonitorTabs()`

### 5. Gắn sự kiện chuyển tab

File: `public/app.js`

Đã gọi:

```js
if(typeof setupApiMonitorTabs==='function')setupApiMonitorTabs();
```

### 6. CSS

File: `public/style.css`

Đã thêm style cho:

- `.api-monitor-tabs`
- `.api-monitor-tab`
- `.api-monitor-tab.active`
- `.api-monitor-tab-panel`
- `.api-monitor-tab-panel.active`

## Ý nghĩa từng tab

### Tab 1. Tất cả API

Dùng để xem toàn bộ route đã được đo.

### Tab 2. Top API chậm nhất

Dùng để biết API nào cần tối ưu trước.

Ví dụ:

```text
/api/debts                         22964ms
/api/master-orders/delivery-today  7822ms
/api/system/status                 5582ms
```

### Tab 3. Top API gọi nhiều nhất

Dùng để phát hiện frontend gọi API quá nhiều hoặc autocomplete bị spam.

Ví dụ:

```text
/api/search/products   500 lần
/api/search/customers  320 lần
/api/search/staffs     280 lần
```

### Tab 4. API có nhiều rows nhất

Dùng để phát hiện API đang kéo quá nhiều dữ liệu.

Ví dụ:

```text
/api/products   10000 rows
/api/customers   5000 rows
```

## Test đã thực hiện

### Syntax check

```bash
node -c src/middlewares/apiMonitor.middleware.js
node -c public/js/app/00-dom-state.js
node -c public/js/app/09-system.js
node -c public/app.js
```

Kết quả: OK.

### Logic test thủ công

Đã giả lập 3 API:

- `/api/debts`: chậm nhất
- `/api/search/products`: gọi nhiều nhất
- `/api/products`: rows nhiều nhất

Kết quả trả về đúng thứ tự:

```text
GET /api/debts GET /api/search/products GET /api/products
```

### npm test

Có chạy `npm test`.

Kết quả: phần test API Monitor không lỗi cú pháp, nhưng bộ test tổng thể vẫn fail do môi trường thiếu package `mongoose` và OpenAPI document stale. Đây là lỗi môi trường/tài liệu cũ, không phát sinh từ phần API Monitor mới.
