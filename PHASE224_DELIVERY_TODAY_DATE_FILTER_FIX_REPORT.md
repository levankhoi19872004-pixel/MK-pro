# PHASE224 — Sửa lọc ngày giao Đơn giao hôm nay (New)

## 1. Lỗi thực tế

Sau Phase223, màn **Đơn giao hôm nay (New)** đã chuyển sang đọc `orders/salesOrders` làm nguồn chính, nhưng khi chọn ngày giao `08/07/2026` có dấu hiệu danh sách/KPI/NVBH group lẫn đơn của ngày khác.

Rủi ro nghiệp vụ: KPI cộng sai, danh sách đơn sai scope ngày, thao tác chốt sổ/ghi nhận điều chỉnh có thể tác động nhầm đơn khác ngày.

## 2. Nguyên nhân ngày bị lẫn

Root cause nằm ở canonical reader mới của Phase223:

- `src/services/delivery/deliveryTodayCanonicalOrderReader.js` lọc ngày bằng `$or` trên nhiều field:
  - `deliveryDate`
  - `orderDate`
  - `documentDate`
  - `date`
- `normalizeCanonicalOrder()` lại chuẩn hóa ngày bằng fallback:
  - `row.deliveryDate || row.orderDate || row.date || row.documentDate`
- `src/services/v2/deliveryTodayNew.service.js` cũng có fallback ngày tương tự khi dựng row trả về.

Vì vậy đơn có `deliveryDate` khác ngày đang chọn nhưng `orderDate/date/documentDate` trùng ngày lọc vẫn có thể lọt vào kết quả.

## 3. Frontend trước sửa gửi ngày thế nào

Frontend dùng input native `type="date"` và gửi query param `date` qua:

```js
new URLSearchParams(filters())
```

Giá trị native là `YYYY-MM-DD`, nhưng frontend chưa có helper canonical rõ ràng, chưa log request date, chưa clear selected state khi đổi ngày và chưa hiển thị `dateFilter` từ API trong chi tiết nguồn.

## 4. Backend trước sửa lọc field nào

Backend trước sửa dùng nhiều field ngày trong `buildCanonicalSalesOrderMatch()`:

```js
$or: [
  { deliveryDate: rx },
  { orderDate: rx },
  { documentDate: rx },
  { date: rx }
]
```

Đây là sai với contract Phase224: **Delivery Today New phải lọc theo `orders.deliveryDate` canonical**.

## 5. Có dùng `$or` nhiều ngày không

Có. Đã loại bỏ `$or` trên `orderDate`, `documentDate`, `date`. Sau sửa chỉ còn điều kiện trên canonical delivery date:

- `orders.deliveryDate` dạng Date trong khoảng ngày Việt Nam.
- `orders.deliveryDate` dạng string `YYYY-MM-DD` / ISO prefix.
- `orders.deliveryDateKey` nếu dữ liệu đã có key chuẩn hóa.

Không dùng `orderDate`, `createdAt`, `documentDate`, `date` làm fallback lọc ngày.

## 6. Có timezone bug không

Có rủi ro. Code cũ dùng helper date-only chung, với Date object có thể lấy ngày theo timezone server. Sau sửa thêm helper:

```js
normalizeDeliveryDateInput(input, 'Asia/Ho_Chi_Minh')
dateKeyInTimeZone(date, 'Asia/Ho_Chi_Minh')
dateKeyToVietnamUtcRange(dateKey)
```

Date object được quy về ngày theo `Asia/Ho_Chi_Minh`, không theo timezone server.

## 7. Công thức filter ngày sau sửa

Input được chuẩn hóa thành:

```js
selectedDateKey = 'YYYY-MM-DD'
startOfDayVN = UTC Date tương ứng 00:00:00 Asia/Ho_Chi_Minh
endOfDayVN = UTC Date tương ứng ngày kế tiếp 00:00:00 Asia/Ho_Chi_Minh
```

Query canonical:

```js
{
  $and: [
    {
      $or: [
        { deliveryDate: selectedDateKey },
        { deliveryDate: /^YYYY-MM-DD(?:T|\s|$)/ },
        { deliveryDateKey: selectedDateKey },
        { deliveryDate: { $gte: startOfDayVN, $lt: endOfDayVN } }
      ]
    }
  ]
}
```

Sau khi đọc DB còn có in-memory guard:

```js
row.deliveryDate === selectedDateKey
```

Nếu không khớp thì loại khỏi response.

## 8. SourceBreakdown dateFilter

Response `/api/new/delivery-today/orders` bổ sung:

```json
{
  "sourceBreakdown": {
    "dateFilter": {
      "requestedDate": "2026-07-08",
      "timezone": "Asia/Ho_Chi_Minh",
      "canonicalField": "orders.deliveryDate",
      "startInclusive": "...",
      "endExclusive": "...",
      "fallbackDateFieldsUsed": [],
      "warnings": []
    }
  }
}
```

Mỗi order row bổ sung debug ngày:

```json
{
  "deliveryDate": "2026-07-08",
  "deliveryDateDisplay": "08/07/2026",
  "deliveryDateSource": "orders.deliveryDate",
  "dateFilterMatched": true,
  "dateWarnings": []
}
```

Nếu order thiếu `deliveryDate`, API không kéo vào ngày đang xem và ghi warning `ORDER_MISSING_CANONICAL_DELIVERY_DATE`.

## 9. File đã sửa

- `src/utils/date.util.js`
- `src/services/delivery/deliveryTodayCanonicalOrderReader.js`
- `src/services/v2/deliveryTodayNew.service.js`
- `public/js/app/new/91-delivery-today-new.js`
- `test/delivery-today-date-filter-canonical.test.js`
- `test/delivery-today-date-query-frontend-static.test.js`

## 10. Test đã thêm

- `test/delivery-today-date-filter-canonical.test.js`
  - chỉ trả đơn đúng `deliveryDate`.
  - không dùng `createdAt` fallback.
  - không dùng `orderDate` fallback.
  - không lấy ngày từ `masterOrders`.
  - xử lý Date object theo timezone Việt Nam.
- `test/delivery-today-date-query-frontend-static.test.js`
  - frontend canonical hóa ngày input.
  - không dùng `new Date('dd/mm/yyyy')`.
  - source detail hiển thị `requestedDate` và `canonicalField`.

## 11. Kết quả test

Đã chạy và pass:

```bash
npm install --ignore-scripts
npm run check:syntax
npm run check:source-bundles
npm run check:source-size
node scripts/audit-dead-code.js
node scripts/audit-flow-usage.js
node scripts/verify-runtime-flows.js
node --test test/delivery-today-date-filter-canonical.test.js test/delivery-today-date-query-frontend-static.test.js test/delivery-today-canonical-source-reader.test.js test/delivery-today-source-note-contract.test.js test/delivery-today-kpi-horizontal-reconcile.test.js
node --test test/*delivery-today* test/*date* test/*canonical* test/*kpi* test/*flow*
```

Kết quả chính:

- `check:syntax` → `SYNTAX_OK 1377 JavaScript files`
- `check:source-bundles` → `OK 19 bundles`
- `check:source-size` → `OK`
- `audit-dead-code` → `OK`
- `audit-flow-usage` → `OK canonical=29 retired=9 fetches=263 unmatched=0 warnings=0`
- `verify-runtime-flows` → `OK canonical=29 retired=9 routeChecks=72 unmatchedFetches=0 retiredHits=0`
- Targeted Phase224/date/source/KPI tests → `14 pass / 0 fail`
- Expanded delivery/date/canonical/kpi/flow tests → `189 pass / 0 fail`

`npm test` full đã chạy sau `npm install`, nhưng bị timeout 300s trong sandbox. Trước timeout không thấy test fail; log đang pass tới test số 123.

## 12. Rủi ro còn lại

Cần kiểm tra runtime trên máy dev/staging với MongoDB thật:

```bash
FLOW_VERIFY_MODE=1 npm start
```

Mở màn **Đơn giao hôm nay (New)**, chọn ngày `08/07/2026`, kiểm tra Network response:

- `sourceBreakdown.dateFilter.requestedDate = 2026-07-08`
- `sourceBreakdown.dateFilter.canonicalField = orders.deliveryDate`
- Không có order row nào `deliveryDate !== 2026-07-08`
- KPI/NVBH/danh sách đơn cùng scope ngày.

## 13. ZIP output

```txt
MK-pro-phase224-delivery-today-date-filter-fix.zip
```
