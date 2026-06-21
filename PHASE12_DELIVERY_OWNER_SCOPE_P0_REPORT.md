# Báo cáo vá P0 — Delivery Owner Scope / NVGH Authorization

Baseline: `MK-pro-phase12-master-order-selected-list-layout-fix-patched.zip`  
ZIP xử lý: `MK-pro-phase12-master-order-selected-list-layout-fix-patched(1).zip`  
Đầu ra: `MK-pro-phase12-delivery-owner-scope-p0-patched.zip`

---

## 1. Tổng quan dự án

| Hạng mục | Ghi nhận |
|---|---|
| Kiến trúc | Node.js / Express monolith, MongoDB/Mongoose, mobile/web API dùng chung một số legacy engine |
| Quy mô | `npm run check:syntax` quét 937 file JavaScript |
| Module liên quan | Delivery routes, mobile delivery routes, mobile debts, debt collections, DeliveryEngine legacy/source bundle |
| Điểm cần chú ý | `src/engines/delivery.legacy.engine.js` là file generated; phải sửa source fragment rồi build lại source bundle |

---

## 2. Kết quả kiểm tra P0 theo API

| API | Auth/Role | Tình trạng sau vá |
|---|---:|---|
| `/api/delivery/orders` | Có `requireAuth`, `requireRole`, `bindDeliveryUser` | Role `delivery` bị ép scope theo NVGH đăng nhập; client gửi `deliveryStaffCode` khác không được tin |
| `/api/delivery/returns` | Có route qua DeliveryEngine | Đã vá lỗ hổng direct lookup theo `orderId/orderCode`; NVGH không xem return của NVGH khác bằng cách đoán mã đơn |
| `/api/delivery/return` | Có route qua DeliveryEngine | Đã có owner guard; bổ sung helper chuẩn hóa alias delivery code để guard chắc hơn |
| `/api/delivery/payment` | Có route qua DeliveryEngine | Đã có owner guard; test xác nhận NVGH A không thu tiền đơn NVGH B |
| `/api/delivery/confirm` | Có route qua DeliveryEngine | Đã có owner guard; test xác nhận NVGH A không xác nhận đơn NVGH B |
| `/api/mobile/delivery/*` | Có mobile context/actor payload | Dùng DeliveryEngine chung; được hưởng owner guard và bản vá `listReturns` |
| `/api/mobile/debts` | Có mobile auth/service scope | Đã sửa để role `delivery` luôn dùng mã NVGH từ login, bỏ qua `collectorType/salesStaffCode/deliveryStaffCode` do client gửi |
| `/api/mobile/debt-collections` | Có service submit collection | Đã sửa để delivery/sales không giả mạo staff scope trong body; admin vẫn giữ khả năng chỉ định nếu đang cần |

---

## 3. Nguyên nhân gốc rễ

### P0-1 — Bypass xem hàng trả về bằng `orderCode/orderId`

Trong `DeliveryEngine.listReturns(query)`, nhánh direct lookup khi có `orderId/orderCode` đọc trực tiếp `ReturnOrder.find(...)` rồi trả kết quả. Nhánh này không lọc theo `actorDeliveryStaffCode` khi `enforceDeliveryOwnership=true`.

Rủi ro thực tế:

- NVGH A đoán/gửi `orderCode` của NVGH B.
- Backend đọc `returnOrders` trực tiếp.
- Nếu đơn B có phiếu trả hàng, NVGH A có thể thấy dữ liệu hàng trả về của B.
- Đây là lỗi backend authorization, không phải lỗi UI.

### P0-2 — Mobile debts còn tin một phần query từ client

`src/services/mobile/debts.service.js` trước vá cho phép `collectorType` từ query ảnh hưởng đến scope. Với user role `delivery`, backend phải luôn ép về `collectorType=delivery` và mã NVGH từ phiên đăng nhập.

### P0-3 — Debt collection có thể ghi sai staff scope/audit lineage

`DebtCollectionService.buildCollectorFields()` trước vá ưu tiên `body.deliveryStaffCode/body.salesStaffCode` trước thông tin user. Với role `delivery/sales`, thông tin staff phải lấy từ server context, không lấy từ body.

---

## 4. File đã sửa

| File | Loại thay đổi |
|---|---|
| `src/engines/delivery.legacy.engine.source/part-01.jsfrag` | Thêm helper owner-scope dùng chung: `isDeliveryOwnershipEnforced`, `deliveryAssignedCodeOf`, `deliveryOwnershipMatches`, `filterDeliveryOwnedRows`; nâng cấp `assertDeliveryOwnership` |
| `src/engines/delivery.legacy.engine.source/part-03.jsfrag` | Vá `listReturns` direct lookup để lọc return rows theo NVGH đang đăng nhập, không fallback sang order khác khi scope fail |
| `src/engines/delivery.legacy.engine.js` | File generated được build lại từ source fragments |
| `config/source-bundles.json` | Cập nhật hash source bundle |
| `src/services/mobile/debts.service.js` | Ép mobile debt scope theo role `delivery/sales`; bỏ qua staff spoof từ query |
| `src/services/DebtCollectionService.js` | Không tin staff code/name từ body với role `delivery/sales`; admin giữ override |
| `test/delivery-owner-scope-p0.test.js` | Thêm test P0 owner scope cho returns/payment/confirm/debts/debt-collections |

Không xóa file. Không đổi schema. Không đổi business rule giao hàng. Không sửa UI.

---

## 5. Diff trọng yếu

### 5.1. Owner helper trong DeliveryEngine

```js
function isDeliveryOwnershipEnforced(body = {}) {
  return Boolean(body && body.enforceDeliveryOwnership);
}

function deliveryAssignedCodeOf(row = {}) {
  return text(
    row.deliveryStaffCode
    || row.deliveryCode
    || row.nvghCode
    || row.shipperCode
    || row.driverCode
    || row.staffDeliveryCode
  );
}

function deliveryOwnershipMatches(row = {}, body = {}) {
  if (!isDeliveryOwnershipEnforced(body)) return true;
  const actorCode = deliveryActorCodeOf(body);
  const assignedCode = deliveryAssignedCodeOf(row);
  return Boolean(actorCode && assignedCode && compact(assignedCode) === compact(actorCode));
}
```

### 5.2. Vá direct return lookup

```js
const directReturnsRaw = or.length
  ? (await this.ReturnOrder.find({ ...activeReturnFilter(), $or: or }).lean())
      .map(canonicalizeReturnDocument)
      .filter(hasPositiveReturnDocument)
  : [];
const directReturns = filterDeliveryOwnedRows(directReturnsRaw, query);

if (directReturnsRaw.length && !directReturns.length && isDeliveryOwnershipEnforced(query)) {
  return { rows: [], returnOrdersRaw: [], summary: summarizeReturnRows([]) };
}

for (const key of directKeys) {
  const order = await this.getCanonicalOrderByKey(key);
  if (order && deliveryOwnershipMatches(order, query)) { orders = [order]; break; }
}
if (!orders.length && isDeliveryOwnershipEnforced(query)) {
  return { rows: [], returnOrdersRaw: [], summary: summarizeReturnRows([]) };
}
```

### 5.3. Mobile debts ép scope theo role đăng nhập

```js
if (role === 'delivery') {
  const code = deliveryStaffCode(mobileUser);
  if (code) scopedQuery.deliveryStaffCode = code;
  else if (deliveryStaffName(mobileUser)) scopedQuery.deliveryStaffName = deliveryStaffName(mobileUser);
  delete scopedQuery.salesStaffCode;
  delete scopedQuery.salesmanCode;
  delete scopedQuery.salesStaffName;
  delete scopedQuery.salesmanName;
} else if (role === 'sales') {
  const code = salesStaffCode(mobileUser);
  if (code) scopedQuery.salesStaffCode = code;
  else if (salesStaffName(mobileUser)) scopedQuery.salesStaffName = salesStaffName(mobileUser);
  delete scopedQuery.deliveryStaffCode;
  delete scopedQuery.deliveryCode;
  delete scopedQuery.deliveryStaffName;
}
```

---

## 6. Test đã bổ sung

File: `test/delivery-owner-scope-p0.test.js`

Bao phủ các case bắt buộc:

1. NVGH A gọi direct `listReturns(orderCode=B)` không thấy return của NVGH B.
2. Admin-style lookup không bật owner guard vẫn xem được theo hành vi rộng hiện tại.
3. NVGH A không thể `return/payment/confirm` đơn của NVGH B.
4. Mobile debts role `delivery` bị ép về NVGH đăng nhập, không bypass bằng query/body.
5. Debt collection không nhận `deliveryStaffCode` giả mạo từ body với role `delivery`, nhưng admin vẫn override được.

---

## 7. Kết quả chạy lệnh

### 7.1. Syntax

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 937 JavaScript files
```

### 7.2. Source bundle integrity

```bash
npm run check:source-bundles
```

Kết quả:

```text
[source-bundles] OK 19 bundles
```

### 7.3. Targeted delivery/security tests

```bash
node --require ./test/helpers/refactorReadCompat.js --test --test-concurrency=1 \
  test/delivery-owner-scope-p0.test.js \
  test/mobile-delivery-confirm-canonical.test.js \
  test/mobile-delivery-scoped-query.test.js \
  test/delivery-engine-business-flow.test.js \
  test/debt-collection-pending-posting-static.test.js \
  test/debt-collection-shared-pending-lock-static.test.js
```

Kết quả:

```text
# tests 19
# pass 19
# fail 0
```

### 7.4. Lệnh người dùng yêu cầu

```bash
npm test -- --grep delivery
```

Kết quả: **không pass toàn bộ**, nhưng nguyên nhân không nằm trong phần vá delivery owner-scope.

Ghi nhận thực tế:

```text
# tests 986
# pass 983
# fail 2
# skipped 1
```

Hai lỗi fail là snapshot characterization cũ ở:

- `test/phase79-production-strangler.test.js:38`
- `test/phase79-production-strangler.test.js:46`

Nội dung fail liên quan hash snapshot `assembled index page` và `split CSS parts preserve exact legacy cascade order`. Các file frontend/snapshot này không được sửa trong bản vá P0 phân quyền NVGH.

Lưu ý kỹ thuật: script `scripts/run-tests.js` hiện không lọc theo `--grep delivery`, nên lệnh trên chạy gần như toàn bộ test suite thay vì chỉ nhóm delivery.

---

## 8. Đánh giá chất lượng sau vá

### Điểm mạnh

- Quyền thao tác quan trọng `return/payment/confirm` đã được chặn tại backend engine, không phụ thuộc frontend.
- Role `delivery` được bind từ server context, không tin query/body client.
- Bản vá giữ behavior admin rộng, không phá luồng quản trị hiện tại.
- Có test chống bypass bằng cách sửa `deliveryStaffCode`, `collectorType`, `orderCode`.

### Rủi ro còn lại

| Mức | Rủi ro | Khuyến nghị |
|---:|---|---|
| Major | Authorization logic còn nằm rải rác ở route/service/engine, dễ phát sinh bypass ở API mới | Tách `DeliveryAuthorizationPolicy`/middleware owner guard dùng chung |
| Major | Legacy generated bundle khó review thủ công vì minified/compact | Tiếp tục sửa source fragment và bắt buộc check source bundle trong CI |
| Minor | `npm test -- --grep delivery` không lọc đúng test như kỳ vọng | Sửa test runner để support grep/tag rõ ràng |
| Minor | Một số alias NVGH cũ vẫn tồn tại để tương thích | Khi dữ liệu ổn định, chuẩn hóa dần về `deliveryStaffCode/deliveryStaffName` |

---

## 9. Phương án giải pháp

### Phương án A — Khuyến nghị dài hạn / production-grade

Xây dựng lớp authorization tập trung:

- `DeliveryAuthorizationPolicy.assertCanReadOrder(user, order)`
- `DeliveryAuthorizationPolicy.assertCanMutateOrder(user, order)`
- `DeliveryAuthorizationPolicy.buildReadScope(user, query)`
- Áp dụng bắt buộc ở route/service/repository cho mọi API delivery/mobile debts/debt collections.
- Thêm test ma trận role: `delivery`, `sales`, `accounting`, `manager`, `admin`.

| Tiêu chí | Đánh giá |
|---|---|
| Lợi ích | Giảm bypass dài hạn, dễ audit, dễ thêm API mới |
| Nhược điểm | Cần chạm nhiều module hơn, phải regression toàn bộ giao hàng/công nợ |
| Effort | Hard |
| Rủi ro | Trung bình nếu refactor rộng; cần làm theo feature branch và test đầy đủ |

### Phương án B — Cân bằng effort / đã áp dụng trong ZIP này

Vá đúng điểm bypass P0 và ép scope tại service hiện tại:

- Chặn direct return lookup trong DeliveryEngine.
- Ép mobile debts theo role login.
- Không cho delivery/sales giả mạo staff scope khi tạo phiếu thu nợ.
- Giữ admin behavior.

| Tiêu chí | Đánh giá |
|---|---|
| Lợi ích | Ít ảnh hưởng, xử lý ngay lỗ hổng P0, không đổi business rule |
| Nhược điểm | Authorization vẫn phân tán, chưa phải kiến trúc ACL tập trung |
| Effort | Medium |
| Rủi ro | Thấp nếu chỉ deploy bản vá này |

---

## 10. Khuyến nghị triển khai

1. Deploy bản ZIP này trước để chặn P0 quyền NVGH.
2. Sau deploy, test thủ công bằng 2 tài khoản NVGH khác nhau:
   - NVGH A mở danh sách đơn.
   - Dùng DevTools/Postman sửa `deliveryStaffCode=NVGH-B`.
   - Gọi thử returns/payment/confirm/debts/debt-collections.
   - Kỳ vọng: không thấy/không thao tác được dữ liệu của B; thao tác mutation trả 403.
3. Sau giai đoạn ổn định, làm tiếp Phương án A để gom ACL delivery thành một policy tập trung.
