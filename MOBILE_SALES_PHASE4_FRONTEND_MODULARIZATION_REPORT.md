# MOBILE SALES — GIAI ĐOẠN 4: TÁCH CẤU TRÚC FRONTEND

## 1. Mục tiêu và phạm vi

Giai đoạn 4 được triển khai trên bản Giai đoạn 3 theo chiến lược **strangler pattern**:

- Không viết lại app.
- Không đổi framework JavaScript hiện tại.
- Không đổi API contract.
- Không đổi schema MongoDB.
- Không thay đổi business rule giá, khuyến mại, tồn kho, công nợ, quỹ, giao hàng hoặc trả hàng.
- Tách dần state và pure business/view mapping khỏi file điều phối `sales.js`.

## 2. Kiến trúc trước và sau

### Trước Giai đoạn 4

```text
sales.html
→ sales.js (~45,6 KiB)
   ├── DOM selectors
   ├── mutable state
   ├── customer/debt merge
   ├── product normalization
   ├── cart calculation
   ├── order filters
   ├── offline mapping
   ├── event handlers
   └── API orchestration
```

Các biến trạng thái như khách đang chọn, sản phẩm, giỏ, đơn đang sửa, danh sách đơn và công nợ được quản lý trực tiếp trong module điều phối.

### Sau Giai đoạn 4

```text
sales.html
→ sales.js (~39,0 KiB) — bootstrap/orchestrator
   ├── sales/state.js       — OrderDraftStore + state toàn app
   ├── sales/dom.js         — DOM registry
   ├── sales/customer.js    — identity/debt/customer mapping
   ├── sales/staff.js       — NVBH scope helpers
   ├── sales/product.js     — product/promotion normalization
   ├── sales/cart.js        — quantity, totals, payload mapping
   ├── sales/orders.js      — order query/filter/page merge
   ├── sales/debt.js        — debt parse/filter/page merge
   ├── sales/sync.js        — offline operation projection
   └── sales-ux.js          — component/view helpers từ Giai đoạn 3
```

`sales.js` vẫn chịu trách nhiệm điều phối event và API, nhưng không còn là nơi sở hữu toàn bộ state hoặc các hàm pure domain mapping.

## 3. Module mới

| Module | Trách nhiệm | Side effect |
|---|---|---|
| `public/mobile/js/sales/state.js` | `OrderDraftStore`, customer/cart/editing state, persistence theo NVBH, state customer/product/order/debt/sync/UI | Chỉ đọc/ghi localStorage draft hiện hữu |
| `public/mobile/js/sales/dom.js` | Tập trung toàn bộ selector app bán hàng | Không |
| `public/mobile/js/sales/customer.js` | Chuẩn hóa identity khách, merge page, ghép công nợ code-first, customer display fields | Không |
| `public/mobile/js/sales/staff.js` | Lấy mã NVBH chuẩn và lọc order theo mã | Không |
| `public/mobile/js/sales/product.js` | Quy cách, product view model, payload promotion, apply promotion result | Không |
| `public/mobile/js/sales/cart.js` | Chuyển Thùng/Lẻ sang base quantity, validate số lượng, tính totals, build items payload | Không |
| `public/mobile/js/sales/orders.js` | Query key, status/search filter, merge pagination, upsert order | Không |
| `public/mobile/js/sales/debt.js` | Parse tiền, key khách nợ, merge/sort/filter debt pages | Không |
| `public/mobile/js/sales/sync.js` | Chuyển IndexedDB operation thành order card `pendingSync` | Không |

Tổng kích thước chín module mới khoảng **24,8 KiB**, được tải dưới dạng ES Module và cache độc lập.

## 4. OrderDraftStore

`OrderDraftStore` là nguồn trạng thái duy nhất cho:

```text
customer
product
cart
editingOrderId
paidAmount khi persist
```

Đặc tính:

- Scope draft theo mã/ID NVBH.
- Giữ prefix localStorage tương thích Giai đoạn 3.
- Có `persist()`, `restore()`, `clear()`.
- Không phụ thuộc DOM.
- Có thể unit test trực tiếp.
- Không chứa logic ghi server.

## 5. Data flow sau khi tách

```text
Người dùng
→ DOM registry
→ sales.js event/orchestrator
→ OrderDraftStore / module pure tương ứng
→ mobileApi
→ backend hiện hữu
→ cập nhật state
→ sales-ux.js render
```

Ví dụ sửa số lượng giỏ:

```text
Input Thùng/Lẻ
→ cartQuantityFromInputs()
→ validateCartQuantity()
→ cập nhật OrderDraftStore.cart
→ API promotion hiện hữu
→ applyPromotionLines()
→ calculateCartTotals()
→ renderCart()
```

Không có công thức giá, tồn hoặc promotion mới được tạo trong Giai đoạn 4.

## 6. Danh sách file thay đổi

### File runtime mới

```text
public/mobile/js/sales/state.js
public/mobile/js/sales/dom.js
public/mobile/js/sales/customer.js
public/mobile/js/sales/staff.js
public/mobile/js/sales/product.js
public/mobile/js/sales/cart.js
public/mobile/js/sales/orders.js
public/mobile/js/sales/debt.js
public/mobile/js/sales/sync.js
```

### File runtime cập nhật

```text
public/mobile/js/sales.js
public/mobile/js/sales.source/part-01.jsfrag
public/mobile/js/sales.source/part-01b.jsfrag
public/mobile/js/sales.source/part-01c.jsfrag
public/mobile/js/sales.source/part-02.jsfrag
public/mobile/js/sales.source/part-02b.jsfrag
public/mobile/js/sales.source/part-03.jsfrag
public/mobile/js/sales.source/part-03b.jsfrag
public/mobile/sales.html
config/source-bundles.json
config/source-size-budget.json
```

### Test cập nhật/thêm

```text
test/mobile-sales-phase4-architecture.test.js
test/mobile-sales-phase4-viewport-contract.test.js
test/mobile-sales-phase1-data-safety.test.js
test/mobile-sales-phase3-ux.test.js
test/mobile-sales-report-edit-ui-static.test.js
test/mobile-catalog-month-sales-integration-static.test.js
test/mobile-debt-subtabs-static.test.js
test/dms-inventory-app-quota.test.js
```

## 7. Diff quan trọng

### 7.1 State phân tán → Store tập trung

**Trước:**

```javascript
let selectedCustomer = null;
let selectedProduct = null;
let cart = [];
let editingOrderId = '';
let todayOrderCache = [];
```

**Sau:**

```javascript
const state = createMobileSalesState({
  draftStore: new OrderDraftStore({ ownerKey: currentSalesStaffCode(user) })
});

state.draft.customer
state.draft.product
state.draft.cart
state.draft.editingOrderId
state.orders.rows
```

**Lý do:** một nguồn trạng thái rõ ràng, giảm shadow state và chuẩn bị cho việc test/tách view.

### 7.2 Logic ghép công nợ khỏi DOM coordinator

**Trước:** customer identity, debt lookup và merge nằm trong `sales.js`.

**Sau:**

```javascript
buildDebtLookup(rows)
mergeCustomerDebt(customer, lookup)
uniqueCustomerIdentityKeys(customer)
```

nằm trong `sales/customer.js`, giữ nguyên nguyên tắc mã/ID trước và không fallback tên mơ hồ.

### 7.3 Cart calculation thành pure module

**Sau:**

```javascript
cartQuantityFromInputs()
validateCartQuantity()
calculateCartTotals()
buildOrderPayloadItems()
```

được tách khỏi DOM và API orchestration, giúp kiểm thử không cần trình duyệt.

### 7.4 Browser cache version

```text
phase84-mobile-ux-v1
→ phase85-mobile-architecture-v1
```

để tránh thiết bị giữ `sales.js` cũ nhưng tải module mới hoặc ngược lại.

## 8. Kích thước bundle

| Thành phần | Giai đoạn 3 | Giai đoạn 4 |
|---|---:|---:|
| `public/mobile/js/sales.js` | 45.585 bytes | 39.895 bytes |
| Ngân sách | 49.152 bytes | 40.960 bytes |
| Kết quả | Trong budget tạm | Trong budget mục tiêu |

Giảm khoảng **12,5%** cho coordinator chính. Module mới được cache riêng và chỉ thay đổi khi domain tương ứng thay đổi.

## 9. Kiểm thử

### Test kiến trúc Giai đoạn 4

- Tồn tại đầy đủ chín module.
- `sales.js` import module và không khai báo lại state global cũ.
- `OrderDraftStore` persist/restore/clear theo user.
- Customer/debt merge code-first với hai khách trùng tên.
- Staff scope chỉ dùng mã NVBH.
- Order page merge không tạo dòng trùng.
- Offline operation hiển thị dạng pending, không editable.
- Bundle dưới 40 KiB và cache version đúng.
- Viewport contract cho 320/360/390/412px, bottom navigation, safe-area, touch target và responsive breakpoint.

### Kết quả full suite

| Hạng mục | Kết quả |
|---|---:|
| Full test Giai đoạn 3 đầu vào | 852/857 đạt, 4 lỗi nền, 1 skip |
| Full test Giai đoạn 4 | **860/865 đạt, 4 lỗi nền, 1 skip** |
| Test mới đạt | **8** |
| Regression mới | **0** |
| JavaScript syntax | 858 file đạt |
| Source bundles | 18/18 đạt |
| Source-size budget | Đạt |
| Path portability | 1.039 đường dẫn đạt |
| OpenAPI | 308 operations, đồng bộ |
| Enterprise smoke | Đạt |
| npm audit high | 0 lỗ hổng |

Bốn lỗi nền không thuộc Giai đoạn 4:

1. Snapshot/cache-version DMS Inventory web.
2. Hai assertion import worker về `importMode`.
3. Snapshot/cache-version sales-order web shard.

Một test golden fixture SSE được skip giống bản đầu vào.

## 10. Kiểm tra viewport

Dự án chưa có Playwright/Puppeteer và không bổ sung package mới. Giai đoạn 4 thêm **viewport regression contract** tự động cho các độ rộng 320, 360, 390 và 412px, kiểm tra:

- Viewport meta.
- Giới hạn chiều rộng app.
- Bottom navigation bốn cột không phụ thuộc desktop table.
- Safe-area bottom.
- Touch target tối thiểu 44px.
- Breakpoint màn hình hẹp.
- Focus-visible và xử lý text dài.

Kiểm thử trình duyệt Android thật vẫn là bước nghiệm thu deploy, không được thay thế bằng static contract.

## 11. Side effect

| Khu vực | Đánh giá |
|---|---|
| API mobile | Không đổi contract |
| Backend | Không sửa file backend |
| MongoDB schema | Không đổi |
| Giá/khuyến mại | Không đổi rule; vẫn do server quyết định |
| Tồn kho | Không sửa read/posting service |
| Công nợ | Không sửa `arLedgers`/DebtReadService |
| Quỹ | Không ảnh hưởng |
| Giao hàng | Không ảnh hưởng |
| Trả hàng | Không ảnh hưởng |
| Offline queue | Không đổi format IndexedDB |
| Draft local | Giữ key/prefix tương thích |

## 12. Rollback

Không có migration dữ liệu. Rollback bằng cách redeploy ZIP Giai đoạn 3.

Các module mới chỉ được import từ `sales.js`; không có collection, index hoặc dữ liệu cần đảo. Khi rollback cần bảo đảm cache browser nhận lại version `phase84-mobile-ux-v1` cùng bundle Giai đoạn 3.

## 13. Technical debt còn lại

- `sales.js` đã dưới 40 KiB nhưng vẫn còn nhiều event orchestration.
- View render vẫn phụ thuộc DOM ID hiện tại.
- Chưa có browser E2E thật trong CI.
- Chưa có service worker/PWA.
- Offline conflict UI mới ở mức hiện hữu của Giai đoạn 1–3.
- `sales-ux.js` và coordinator có thể tiếp tục chia theo feature flag nếu mở rộng lớn.

## 14. Giai đoạn tiếp theo

**Giai đoạn 5 — Đánh giá và triển khai Offline/PWA có kiểm soát**, chỉ nên thực hiện khi dữ liệu vận hành chứng minh nhu cầu. Phạm vi dự kiến:

1. Sync Center đầy đủ.
2. Retry/backoff/dead-letter.
3. Conflict resolution.
4. Catalog cache có version.
5. Revalidate giá/tồn khi đồng bộ.
6. Manifest và Service Worker sau cùng.
7. Force-update và cache invalidation.
8. Test mất mạng trên thiết bị thật.

Không nên cache dài hạn tồn kho, giá hoặc công nợ trước khi hoàn thành chiến lược version/revalidation.
