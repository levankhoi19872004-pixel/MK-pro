# V45 API Monitor - DB Queries / Mongo Time / JS Time

## Mục tiêu
Bổ sung API Monitor để biết API chậm do MongoDB hay do code JavaScript.

Ví dụ hiển thị:

```txt
GET /api/debts
Total: 22964ms
Mongo: 22600ms
JS: 364ms
Queries: 5
```

## Đã sửa

### 1. Backend middleware
File: `src/middlewares/apiMonitor.middleware.js`

Đã bổ sung:

- `AsyncLocalStorage` để gắn bộ đo riêng cho từng request.
- Tự động patch `mongoose.Query.prototype.exec`.
- Tự động patch `mongoose.Aggregate.prototype.exec`.
- Đếm số query DB trong mỗi request.
- Cộng tổng thời gian Mongo trong mỗi request.
- Tính JS Time = Total Time - Mongo Time.
- Ghi thêm header phản hồi:
  - `X-Mongo-Time-Ms`
  - `X-JS-Time-Ms`
  - `X-DB-Queries`
- Ghi thêm vào `body.perf`:
  - `mongoMs`
  - `jsMs`
  - `dbQueries`
- Ghi thêm vào log `[API_PERF]` và `[API_SLOW]`:
  - `mongoMs`
  - `jsMs`
  - `dbQueries`

### 2. Thống kê API Monitor
File: `src/middlewares/apiMonitor.middleware.js`

Đã bổ sung vào báo cáo `/api/system/api-monitor`:

- Theo từng API:
  - `avgMongoMs`
  - `avgJsMs`
  - `avgDbQueries`
  - `maxMongoMs`
  - `maxJsMs`
  - `maxDbQueries`
  - `lastMongoMs`
  - `lastJsMs`
  - `lastDbQueries`
- Theo tổng hệ thống:
  - `summary.totalMongoMs`
  - `summary.totalJsMs`
  - `summary.totalDbQueries`
- Theo module:
  - `avgMongoMs`
  - `avgJsMs`
  - `avgDbQueries`

### 3. Giao diện màn Hệ thống
File: `public/index.html`

Đã bổ sung hiển thị:

- Tổng Mongo Time
- Tổng JS Time
- Tổng DB Queries
- Bảng API chậm gần nhất có thêm cột:
  - Total
  - Mongo
  - JS
  - DB Queries
- Bảng API toàn hệ thống có thêm cột:
  - TB Total
  - TB Mongo
  - TB JS
  - TB Query
  - Max Total
  - Max Mongo

### 4. JavaScript render giao diện
File: `public/js/app/09-system.js`

Đã sửa `renderApiMonitor()` để render đủ chỉ số mới.

File: `public/js/app/00-dom-state.js`

Đã khai báo thêm DOM id:

- `apiMonitorTotalMongoMs`
- `apiMonitorTotalJsMs`
- `apiMonitorTotalDbQueries`

## Cách đọc chỉ số

- `Total cao`, `Mongo cao`, `JS thấp`: chậm do Mongo/query/index/dữ liệu quá lớn.
- `Total cao`, `Mongo thấp`, `JS cao`: chậm do xử lý JS sau khi lấy dữ liệu, ví dụ map/filter/reduce quá nhiều ở backend.
- `Queries cao`: có nguy cơ N+1 query hoặc gọi DB lặp trong vòng lặp.
- `Rows cao`: API trả quá nhiều dòng, cần phân trang/limit.

## Kiểm tra

Đã chạy kiểm tra cú pháp:

```bash
node -c src/middlewares/apiMonitor.middleware.js
node -c public/js/app/09-system.js
node -c public/js/app/00-dom-state.js
```

Kết quả: OK.

Đã chạy `npm test` sau khi cài dependency. Một số test cũ vẫn fail do môi trường test không có MongoDB thật và OpenAPI document đang stale:

- `Operation products.find() buffering timed out after 10000ms`
- `OpenAPI document is stale. Run: npm run docs:generate`

Các lỗi này không phát sinh từ phần API Monitor mới.
