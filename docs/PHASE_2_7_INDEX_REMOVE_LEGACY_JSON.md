# Phase 2.7 - Index + bỏ legacy JSON khỏi nghiệp vụ chính

## Mục tiêu

- MongoDB là luồng chính cho API nghiệp vụ.
- `data/kho-data.json` chỉ còn dùng cho migration/fallback khẩn cấp.
- Các route đã tách ở `src/routes/*` được mount trước legacy.
- Legacy API JSON bị chặn mặc định bằng route guard.
- Tạo index cho các collection chính để phân trang, tìm kiếm, lọc theo ngày giao hàng, trạng thái, khách hàng, nhân viên, chứng từ.

## Thay đổi chính

### 1. Route guard chặn legacy JSON

Trong `src/legacy/legacyApp.js` đã thêm guard sau `registerApiRoutes(app)`:

```js
const ENABLE_LEGACY_JSON = process.env.ENABLE_LEGACY_JSON === 'true';
```

Mặc định:

```env
ENABLE_LEGACY_JSON=false
```

Khi một API nghiệp vụ chưa được tách route Mongo, server trả `410 Gone` thay vì rơi xuống logic JSON cũ.

Muốn bật lại tạm thời để debug/migration:

```env
ENABLE_LEGACY_JSON=true
```

### 2. Tạo index Mongo tập trung

File mới:

```text
src/services/mongoIndexService.js
scripts/ensure-mongo-indexes.js
```

Chạy thủ công:

```bash
npm run mongo:indexes
```

Hoặc để server tự check khi khởi động:

```env
AUTO_ENSURE_MONGO_INDEXES=true
```

Tắt tự check index:

```env
AUTO_ENSURE_MONGO_INDEXES=false
```

### 3. JSON không còn là luồng nghiệp vụ chính

`readData()` / `writeData()` vẫn còn trong legacy để phục vụ migration, mobile auth cũ và cứu dữ liệu khi cần. Nhưng API nghiệp vụ chính không còn tự động rơi xuống legacy JSON nữa.

## Việc còn lại sau Phase 2.7

- Tách nốt `/api/mobile/login` ra mobile auth route Mongo riêng.
- Xóa hẳn `legacyApp.js` sau khi mọi API đã có route/controller/service/repository mới.
- Chuẩn hóa transaction thật cho: tạo đơn bán, sửa đơn, hủy đơn, trả hàng, phiếu thu.
- Bỏ hẳn `data/kho-data.json` khỏi deploy production sau khi migration đã xác nhận đủ dữ liệu.
