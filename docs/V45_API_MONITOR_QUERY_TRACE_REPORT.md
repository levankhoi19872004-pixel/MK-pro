# V45 API Monitor - Query Trace

Đã bổ sung Query Trace vào API Monitor để bóc tách từng Mongo query bên trong mỗi API.

## Đã chỉnh

- `src/middlewares/apiMonitor.middleware.js`
  - Tự động trace từng `Mongoose Query.exec()`
  - Tự động trace từng `Mongoose Aggregate.exec()`
  - Ghi lại:
    - label query
    - thời gian ms
    - rows/result count
    - lỗi nếu có
  - Lưu `queryTraces` vào metric của API
  - Tính `slowestQueryLabel`, `slowestQueryMs`
  - Trả thêm `topQueryTraceApis` trong `/api/system/api-monitor`

- `public/index.html`
  - Thêm Tab 5: Query Trace
  - Thêm cột “Query chậm nhất” vào bảng API Monitor và API chậm

- `public/js/app/09-system.js`
  - Render Query Trace
  - Hiển thị query Mongo chậm nhất theo API
  - Hiển thị ms và rows của query chậm nhất

- `public/js/app/00-dom-state.js`
  - Thêm DOM binding cho `apiTopQueryTraceTable`

## Cách dùng

1. Vào `Hệ thống`
2. Bấm `Xóa thống kê`
3. Thao tác màn cần kiểm tra, ví dụ App giao hàng
4. Quay lại `Hệ thống → API Monitor`
5. Mở `Tab 5. Query Trace`

Ví dụ mong muốn:

```text
/api/mobile/delivery/orders
  Query chậm nhất: ReturnOrder.find {"salesOrderCode":{"$in":[...]}}
  MS: 8500ms
  Rows: 0
```

Khi đó có thể biết chính xác query Mongo nào đang kéo chậm API.
