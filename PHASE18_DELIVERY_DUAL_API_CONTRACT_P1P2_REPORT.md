# PHASE18 — P1/P2 Chuẩn hóa dual API route giao hàng

## 1. Tổng quan dự án / phạm vi

Baseline sử dụng: `MK-pro-phase17-delivery-debt-pagination-p1-patched(1).zip`.

Phạm vi xử lý đúng theo Prompt 7:

- `src/routes/deliveryRoutes.js`
- `src/routes/mobile/delivery.routes.js`
- `src/services/mobile/delivery.service.js`
- `DeliveryEngine` qua các điểm gọi hiện có
- `public/js/delivery/delivery-core.js`
- `public/mobile/js/delivery-mobile-view.source.js`
- Test API/contract delivery

Không sửa UI, không đổi route frontend, không đổi business rule giao hàng, không xóa route đang dùng.

## 2. Kết luận kiến trúc route

### Route canonical tạm thời

Trong giai đoạn hiện tại, chọn `/api/delivery/*` là **canonical route family** cho app giao hàng vì:

- Frontend mobile hiện đang gọi qua `public/js/delivery/delivery-core.js` đến `/api/delivery/*`.
- Route này đã dùng trực tiếp `DeliveryEngine` cho `orders/returns/return/payment/confirm/reconciliation`.
- Route này đã có `requireAuth`, `requireRole` và `bindDeliveryUser()` để ép owner-scope theo NVGH đăng nhập với role `delivery`.

### Route compatibility

`/api/mobile/delivery/*` được giữ là **compatibility layer** cho mobile modular route/future migration:

- Không xóa để tránh client cũ hoặc alias mobile bị 404.
- Tiếp tục dùng `requireMobileLogin + requireMobileRole(['delivery'])`.
- Các write flow vẫn gọi `DeliveryEngine.saveReturn()`, `DeliveryEngine.savePayment()`, `DeliveryEngine.confirm()` để không duplicate business logic.
- Response bổ sung `compatibilityRoute` và `canonicalRoute` để document rõ hướng đi.

## 3. Bảng khảo sát dual route

| Nghiệp vụ | Route `/api/delivery` | Route `/api/mobile/delivery` | Frontend đang gọi | Khác biệt contract trước vá | Khuyến nghị |
|---|---|---|---|---|---|
| List orders | `GET /api/delivery/orders` | `GET /api/mobile/delivery/orders` | `/api/delivery/orders` qua `DeliveryCore.loadOrders()` | Canonical trả `orders/rows/items`, mobile trả `items` và thiếu `success/data/message` chuẩn | Giữ `/api/delivery/orders` canonical; mobile route là compatibility |
| List returns | `GET /api/delivery/returns` | `GET /api/mobile/delivery/returns` | `/api/delivery/returns` khi vào tab Hàng trả hoặc refresh | Mobile thiếu `success/data/message`; canonical chưa có `data` wrapper | Chuẩn hóa response tối thiểu, giữ key legacy |
| Save return | `POST /api/delivery/return` | `POST /api/mobile/delivery/return` | `/api/delivery/return` qua `DeliveryCore.saveReturn()` | Cả hai dùng engine nhưng response shape không đồng nhất; mobile thiếu `success` trong success path | Giữ chung engine, bổ sung `data/success/error` |
| Save payment | `POST /api/delivery/payment` | `POST /api/mobile/delivery/payment` | `/api/delivery/payment` qua `DeliveryCore.savePayment()` | Mobile payment đi qua `confirmDelivery()` adapter; response chưa ghi rõ route canonical | Giữ adapter, ghi rõ compatibility/canonical metadata |
| Confirm delivery | `POST /api/delivery/confirm` | `POST /api/mobile/delivery/confirm` | `/api/delivery/confirm` qua `DeliveryCore.confirmDelivery()` | Cả hai gọi `DeliveryEngine.confirm()`, error/data shape chưa thống nhất | Bổ sung `data/error` và test owner guard chung |
| Metrics/summary | `GET /api/delivery/reconciliation` | `GET /api/mobile/delivery/report` alias về `/orders` | `/api/delivery/reconciliation` nếu dùng đối soát | Mobile không có reconciliation thật; alias report chỉ là compatibility cũ | Không mở rộng trong phase này; document rõ không phải canonical metrics |

## 4. Các thay đổi đã thực hiện

### 4.1 `src/routes/deliveryRoutes.js`

- Thêm `buildErrorPayload()` để lỗi trả shape thống nhất:

```json
{
  "ok": false,
  "success": false,
  "message": "...",
  "error": "DELIVERY_403"
}
```

- Bổ sung `data` wrapper cho các success response nhưng vẫn giữ key legacy:
  - `orders`, `rows`, `items`
  - `returns`, `returnOrders`, `rows`
  - `order`, `allocation`, `returnOrder`
- Bổ sung `message` rõ ràng.
- Bổ sung `canonicalRoute` để document route đang là chuẩn.

### 4.2 `src/services/mobile/delivery.service.js`

- Bổ sung response shape tối thiểu cho compatibility route:

```json
{
  "ok": true,
  "success": true,
  "message": "...",
  "data": {},
  "compatibilityRoute": "/api/mobile/delivery/...",
  "canonicalRoute": "/api/delivery/..."
}
```

- Giữ key legacy để không phá client cũ: `items`, `orders`, `rows`, `returns`, `returnOrders`.
- Chuẩn hóa error validation ở confirm mobile:
  - `MOBILE_DELIVERY_MISSING_ORDER`
  - `MOBILE_DELIVERY_INVALID_STATUS`
  - `MOBILE_DELIVERY_NEGATIVE_AMOUNT`
- Không đổi flow payment/return/confirm: vẫn đi qua `DeliveryEngine` và owner guard.

### 4.3 Test mới

Thêm:

```text
 test/delivery-dual-api-contract-p1p2-static.test.js
```

Test khóa các điểm:

1. Frontend hiện tại vẫn dùng `/api/delivery/*`.
2. `/api/delivery/*` trả shape `success/data/message/error` nhưng không mất key legacy.
3. `/api/mobile/delivery/*` vẫn tồn tại và có mobile auth/role guard.
4. Compatibility service không duplicate business write logic, vẫn dùng `DeliveryEngine`.
5. Mobile compatibility response có `compatibilityRoute/canonicalRoute`, `success/data/error`.

## 5. Đánh giá chất lượng / rủi ro

### Điểm mạnh

- Không phá tương thích frontend hiện tại.
- Không xóa route mobile đang tồn tại.
- Không đổi business rule.
- Không thêm API route mới.
- Không duplicate xử lý nghiệp vụ tiền/trả hàng/xác nhận.

### Rủi ro còn lại

| Rủi ro | Mức độ | Ghi chú |
|---|---:|---|
| Hai route vẫn cùng tồn tại | Medium | Đã document rõ canonical/compatibility, nhưng dài hạn vẫn nên migrate về một route duy nhất |
| Mobile compatibility chỉ cho role `delivery` | Low | Đúng với thiết kế mobile hiện tại; admin xem rộng vẫn qua `/api/delivery/*` |
| Metrics/summary mobile chưa có route riêng tương đương reconciliation | Low | Không mở rộng để tránh đổi contract lớn; giữ alias `/api/mobile/delivery/report` về orders |
| Full test còn 2 snapshot legacy fail | Low | Lỗi cũ từ baseline, không liên quan delivery API contract |

## 6. Phương án đề xuất tiếp theo

### Phương án A — Production-grade dài hạn

- Chọn một canonical API duy nhất cho mobile delivery, khuyến nghị `/api/mobile/delivery/*` nếu sau này tách app mobile rõ khỏi web.
- Frontend chuyển dần qua adapter `DeliveryCore.API_BASE` có feature flag.
- `/api/delivery/*` chỉ giữ cho web/admin hoặc compatibility trong một số version.
- Có OpenAPI contract riêng cho delivery mobile.

Effort: Medium/Hard  
Lợi ích: sạch kiến trúc, giảm drift contract.  
Rủi ro: cần regression UI/mobile kỹ vì đổi route frontend.

### Phương án B — Cân bằng effort, phù hợp hiện tại

- Giữ `/api/delivery/*` là canonical tạm thời.
- `/api/mobile/delivery/*` là compatibility layer, chỉ gọi chung service/engine.
- Bổ sung test contract như phase này.
- Chỉ migrate route khi app giao hàng chạy ổn ngoài thực tế.

Effort: Easy/Medium  
Lợi ích: an toàn, ít side effect, phù hợp chạy thử nội bộ.  
Rủi ro: còn song song hai namespace trong một thời gian.

## 7. Test đã chạy

### Cài dependency

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

### Check pass

```bash
npm run check:source-bundles
npm run check:syntax
npm run check:source-size
```

Kết quả:

```text
[source-bundles] OK 19 bundles
SYNTAX_OK 943 JavaScript files
[source-size-budget] OK
```

### Targeted tests pass

```bash
node --test test/delivery-dual-api-contract-p1p2-static.test.js test/delivery-owner-scope-p0.test.js
```

Kết quả:

```text
# tests 10
# pass 10
# fail 0
```

### Full test

```bash
npm test
```

Kết quả thực tế:

```text
# tests 1017
# pass 1014
# fail 2
# skipped 1
```

Hai lỗi fail là snapshot legacy cũ:

```text
test/phase79-production-strangler.test.js
- assembled index page matches the approved Phase80 characterization snapshot
- split CSS parts preserve exact legacy cascade order
```

Không sửa 2 snapshot này để tránh thay đổi ngoài phạm vi Prompt 7.

## 8. File thay đổi

Modified:

- `src/routes/deliveryRoutes.js`
- `src/services/mobile/delivery.service.js`

Added:

- `test/delivery-dual-api-contract-p1p2-static.test.js`
- `PHASE18_DELIVERY_DUAL_API_CONTRACT_P1P2_REPORT.md`

Deleted:

- Không có
