# MOBILE SALES — GIAI ĐOẠN 1: ỔN ĐỊNH DỮ LIỆU

## 1. Phạm vi triển khai

Bản vá thực hiện đúng Giai đoạn 1 của roadmap mobile sales, tập trung vào các rủi ro P0:

1. Chuẩn hóa phạm vi khách hàng theo mã NVBH.
2. Kiểm tra quyền sở hữu khách hàng khi tạo và sửa đơn.
3. Không tin giá, chiết khấu và thành tiền từ frontend khi tạo/sửa đơn.
4. Ràng buộc NVBH của đơn offline theo người dùng đã xác thực.
5. Dùng cùng command path cho đơn online và đơn offline.
6. Không tự retry vô hạn operation conflict.
7. Ghép công nợ khách hàng theo ID/mã thay vì tên khi có danh tính ổn định.
8. Chống response tìm kiếm khách hàng cũ ghi đè kết quả mới.
9. Chặn đổi khách khi giỏ đang có dữ liệu.
10. Hiển thị đơn offline đang chờ đồng bộ và bảo toàn draft đơn.
11. Xóa đơn khỏi cache frontend ngay sau khi backend xác nhận thành công.

Không thay đổi schema MongoDB, API contract công khai, công thức khuyến mại, inventory posting, công nợ, quỹ, giao hàng hoặc lifecycle trả hàng.

---

## 2. Nguyên nhân gốc rễ đã xử lý

### 2.1 Customer ownership mở rộng theo tên dù đã có mã

**File:** `src/domain/staff/customerOwnership.js`

Cơ chế cũ tạo `$or` theo cả mã và tên. Hai NVBH trùng tên nhưng khác mã có thể nhận cùng tập khách hàng.

Cơ chế mới:

```javascript
if (code) {
  // Chỉ các alias mã NVBH.
} else if (name) {
  // Tên chỉ là fallback dữ liệu lịch sử thiếu mã.
}
```

### 2.2 Tạo/sửa đơn chưa khóa khách hàng theo người đăng nhập

**Files:**

- `src/services/mobile/sales.service.source/part-01.jsfrag`
- `src/services/mobile/sales.service.source/part-02.jsfrag`
- `src/services/mobile/sales.service.source/part-03.jsfrag`

`findCustomerForOrderBody()` hiện kết hợp lookup khách với `customerOwnershipFilterForSalesUser(mobileUser)`. Tạo hoặc sửa đơn với khách ngoài phạm vi trả lỗi `403`.

### 2.3 Backend tin dữ liệu giá từ request mobile

Service cũ có thể dùng các trường do client gửi như `salePrice`, `amount`, `discountAmount`, `netAmount` khi sửa đơn.

Cơ chế mới `buildAuthoritativeMobileItems()`:

1. Chỉ nhận mã sản phẩm và số lượng từ mobile.
2. Batch-load danh mục sản phẩm.
3. Lấy giá bán từ Product.
4. Gọi lại `promotionService.calculatePromotions()`.
5. Tính lại gross amount, discount, final price và net amount tại backend.
6. Gắn price/promotion lock vào dòng đơn.

Giá hoặc thành tiền giả trong request không còn là nguồn quyết định.

### 2.4 Offline sync có command path khác online

**Files:**

- `src/services/mobile/MobileSyncService.js`
- `src/controllers/mobile/sync.controller.js`
- `src/routes/mobile/sync.routes.js`

Đơn offline trước đây đi qua command service khác và chưa ép lại danh tính NVBH từ actor.

Cơ chế mới:

- `bindSalesPayload()` ghi đè mọi alias NVBH bằng actor đã xác thực.
- `sales_order_create` gọi lại chính `mobileSalesService.createSalesOrder()`.
- Offline nhận cùng ownership, pricing, stock check, transaction và idempotency như online.
- Giữ fallback cũ chỉ cho consumer nội bộ không có mobile context.

### 2.5 Race condition, debt merge và draft frontend

**Files:**

- `public/mobile/js/sales.source/part-01.jsfrag`
- `public/mobile/js/sales.source/part-01b.jsfrag`
- `public/mobile/js/sales.source/part-02.jsfrag`
- `public/mobile/js/sales.source/part-03.jsfrag`
- `public/mobile/js/offline-sync.js`

Đã bổ sung:

- `customerRequestSeq` để bỏ response cũ.
- Debt lookup ưu tiên ID/mã; tên chỉ fallback khi cả hai phía đều thiếu mã và không mơ hồ.
- Xác nhận trước khi đổi khách có giỏ hoặc đang sửa đơn.
- Customer context trong tab giỏ hàng.
- Draft persistence theo mã NVBH.
- Cảnh báo khi rời trang với draft chưa lưu.
- Pending offline order trong danh sách đơn.
- Conflict vẫn hiển thị nhưng không auto-retry.
- Xóa order local cache ngay sau delete thành công rồi revalidate server.

---

## 3. Data flow trước và sau

### Trước

```text
Mobile create online
→ mobile sales service
→ kiểm tồn / tạo đơn

Mobile update
→ nhận cả số lượng + giá + amount từ client
→ cập nhật đơn

Mobile create offline
→ MobileSyncService
→ SalesOrderCommandService riêng
→ có nguy cơ khác ownership/pricing với online
```

### Sau

```text
Online hoặc Offline
→ actor đã xác thực
→ bind salesStaffCode/salesStaffName chuẩn
→ customer lookup có ownership scope
→ batch-load Product
→ server tính lại giá/khuyến mại
→ batch stock check
→ transaction / idempotency hiện hữu
→ SalesOrder
```

---

## 4. Danh sách file thay đổi

```text
config/source-bundles.json

public/mobile/sales.html
public/mobile/mobile.source/mobile-03.css
public/mobile/js/offline-sync.js
public/mobile/js/sales.js
public/mobile/js/sales.source/part-01.jsfrag
public/mobile/js/sales.source/part-01b.jsfrag
public/mobile/js/sales.source/part-02.jsfrag
public/mobile/js/sales.source/part-03.jsfrag

src/controllers/mobile/sync.controller.js
src/domain/staff/customerOwnership.js
src/routes/mobile/sync.routes.js
src/services/mobile/MobileSyncService.js
src/services/mobile/sales.service.js
src/services/mobile/sales.service.source/part-01.jsfrag
src/services/mobile/sales.service.source/part-01b.jsfrag
src/services/mobile/sales.service.source/part-02.jsfrag
src/services/mobile/sales.service.source/part-03.jsfrag

test/dms-inventory-app-quota.test.js
test/mobile-customer-ownership-scope.test.js
test/mobile-sales-phase1-data-safety.test.js
test/mobile-sales-report-edit-ui-static.test.js
```

Hai file `part-01b.jsfrag` được tạo để giữ source fragment dưới giới hạn kích thước của dự án; không phải refactor nghiệp vụ ngoài phạm vi.

---

## 5. Diff quan trọng

### 5.1 Ownership

**Cũ**

```javascript
if (code) addCodeClauses();
if (name) addNameClauses();
```

**Mới**

```javascript
if (code) addCodeClauses();
else if (name) addNameClauses();
```

### 5.2 Giá mobile

**Cũ**

```javascript
salePrice = body.items[i].salePrice;
amount = body.items[i].amount;
discountAmount = body.items[i].discountAmount;
```

**Mới**

```javascript
const products = await findProductsForOrderItems(rawItems);
const catalogSalePrice = product.salePrice ?? product.price;
const promotionResult = await promotionService.calculatePromotions(baseItems);
const amount = grossAmount - serverCalculatedDiscount;
```

### 5.3 Offline actor

**Cũ**

```javascript
SalesOrderCommandService.createOrder(payload, context.actor);
```

**Mới**

```javascript
const boundPayload = bindSalesPayload(payload, context.actor);
mobileSalesService.createSalesOrder({
  body: boundPayload,
  mobileUser: context.actor
});
```

---

## 6. Kết quả kiểm thử

### 6.1 Test mục tiêu Giai đoạn 1

| Nhóm test | Kết quả |
|---|---:|
| Ownership/customer scope | Đạt |
| Hai NVBH trùng tên nhưng khác mã | Đạt |
| Offline không giả mạo NVBH | Đạt |
| Online create/update có customer scope | Đạt |
| Server-authoritative pricing | Đạt |
| Offline dùng cùng mobile command path | Đạt |
| Race/debt/draft guards frontend | Đạt |
| Conflict không auto-retry | Đạt |
| Cache-bust và delegated order actions | Đạt |
| Tổng test mục tiêu liên quan | **12/12 đạt** |

Bản vá bổ sung 7 test/assertion mới; toàn bộ đều đạt trong full suite.

### 6.2 Full regression

| Phiên bản | Tổng | Đạt | Lỗi | Skip |
|---|---:|---:|---:|---:|
| ZIP gốc | 826 | 821 | 4 | 1 |
| Sau Giai đoạn 1 | 833 | 828 | 4 | 1 |

Không phát sinh lỗi regression mới. Bốn lỗi còn lại giống baseline:

1. Snapshot/cache-version inventory frontend cũ.
2. Import worker làm mất `importMode` trong kiểm tra cũ.
3. Import session/worker `importMode` trong kiểm tra cũ.
4. Cache-version sales-order web cũ.

### 6.3 Quality gates

| Kiểm tra | Kết quả |
|---|---|
| Source bundles | 18/18 đạt |
| Source-size budget | Đạt |
| JavaScript syntax | 841 file đạt |
| Path portability | 1.018 đường dẫn đạt |
| Enterprise smoke | 10 modules, 9 flags đạt |
| OpenAPI | 306 operations, đồng bộ |
| `npm audit --omit=dev --audit-level=high` | 0 lỗ hổng |

---

## 7. Side effect assessment

| Khu vực | Ảnh hưởng |
|---|---|
| Tồn kho | Không đổi service/posting rule; chỉ tiếp tục gọi contract hiện hữu |
| Công nợ | Không ghi `arLedgers`; chỉ sửa cách ghép hiển thị frontend |
| Quỹ | Không thay đổi |
| Giao hàng | Không thay đổi |
| Trả hàng | Không thay đổi lifecycle hoặc dữ liệu |
| Khuyến mại | Không đổi công thức; backend gọi lại service hiện hữu |
| Giá bán | Nguồn quyết định chuyển về Product + promotion service khi create/update mobile |
| Đơn online | Giữ route/response contract |
| Đơn offline | Dùng cùng mobile command path, tăng tính nhất quán |
| Schema MongoDB | Không thay đổi |
| API public | Không phá vỡ contract |

---

## 8. Rollback

Bản vá không có migration nên rollback bằng code an toàn hơn rollback dữ liệu.

Thứ tự rollback nếu cần:

1. Tắt auto-sync phía client nhưng giữ IndexedDB queue nếu lỗi offline.
2. Rollback frontend draft/pending UI độc lập.
3. Rollback `createMobileSyncService()` về dispatch cũ nếu sync có lỗi, nhưng không chấp nhận payload giả owner.
4. Không rollback server-authoritative pricing về việc tin giá client; khi có sự cố nên tạm khóa sửa đơn mobile.
5. Ownership strict có thể tạm feature-flag fallback với dữ liệu cũ thiếu mã, nhưng không OR tên khi đã có mã.

---

## 9. Giới hạn kiểm chứng

- Không kết nối MongoDB production nên chưa đo số bản ghi khách lịch sử thiếu mã NVBH.
- Chưa chạy thử trên điện thoại thật/mạng 4G trong môi trường người dùng.
- Chưa benchmark API vì đó thuộc Giai đoạn 2.
- Không thay đổi các lỗi nền ngoài phạm vi Giai đoạn 1.

---

## 10. Giai đoạn tiếp theo

**Giai đoạn 2 — Tối ưu API mobile** nên thực hiện sau khi bản Giai đoạn 1 được deploy và theo dõi ổn định.

Phạm vi đề xuất:

1. Lazy-load các tab, giảm request lúc mở app.
2. API nhóm sản phẩm riêng, không tải 2.000 sản phẩm.
3. Pagination/cursor cho khách hàng, đơn và công nợ.
4. Totals công nợ tách khỏi page rows.
5. Tối ưu customer monthly sales aggregation.
6. `AbortController`/timeout/telemetry trong API client.
7. Kiểm tra `explain()` và index cho search mobile.
8. Tách cache metadata sản phẩm khỏi tồn kho/quota.

Chưa triển khai Giai đoạn 2 trong bản vá này.
