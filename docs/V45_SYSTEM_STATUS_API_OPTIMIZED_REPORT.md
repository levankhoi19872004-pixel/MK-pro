# V45 - Tối ưu API GET /api/system/status

## Mục tiêu

Giảm tải cho API trạng thái hệ thống:

- Trước: `/api/system/status` gọi `getDataSourceStatus()` và `settingRepository.findAll()`.
- Hậu quả: API status thực hiện khoảng 27 Mongo queries để chỉ hiển thị trạng thái.
- Sau sửa: `/api/system/status` chỉ trả trạng thái nhẹ của server và Mongo connection.

## File đã chỉnh

1. `src/services/systemService.js`
2. `public/js/app/09-system.js`
3. `public/index.html`
4. `public/js/app/00-dom-state.js`
5. `public/app.js`

## Chi tiết thay đổi

### 1. Tách status thành API nhẹ

`systemService.status()` không còn gọi:

```js
getDataSourceStatus()
settingRepository.findAll()
```

API status giờ chỉ trả:

```js
ok
app
time
uptimeSeconds
env
legacyJsonEnabled
resetEnabled
mongoReadyState
mongoState
mongoOk
primaryDataSource
```

### 2. Giữ thống kê collection ở API riêng

Phần đếm số dòng collection vẫn giữ tại:

```text
GET /api/system/data-source
```

API này chỉ chạy khi người dùng bấm nút tải số lượng dữ liệu.

### 3. Frontend không tự render counts từ status

`loadSystemStatus()` chỉ cập nhật:

- Mongo state
- Reset state
- Nguồn dữ liệu
- Thông báo trạng thái

Không gọi render số lượng collection nữa.

### 4. Thêm nút tải số lượng dữ liệu riêng

Trong màn Hệ thống thêm nút:

```text
Tải số lượng dữ liệu
```

Nút này gọi:

```js
loadSystemDataSource()
```

### 5. Kiểm tra cú pháp

Đã kiểm tra bằng:

```bash
node -c src/services/systemService.js
node -c public/js/app/09-system.js
node -c public/js/app/00-dom-state.js
node -c public/app.js
```

## Kết quả kỳ vọng

Trước:

```text
GET /api/system/status
DB Queries: ~27
Mongo: ~5.000ms+
```

Sau:

```text
GET /api/system/status
DB Queries: 0
Mongo: gần 0ms
Total: thường < 100ms
```

Nếu muốn xem số dòng collection, dùng nút `Tải số lượng dữ liệu`, không tự động chạy khi mở màn Hệ thống.
