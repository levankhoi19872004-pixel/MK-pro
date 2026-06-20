# MOBILE SALES PHASE 3 — UX STANDARDIZATION REPORT

## 1. Phạm vi và nguyên tắc

Bản vá triển khai toàn bộ **Giai đoạn 3 — Chuẩn hóa giao diện mobile** trên nền Giai đoạn 2.

Nguyên tắc giữ nguyên:

- Không đổi framework HTML/CSS/JavaScript hiện tại.
- Không đổi API contract hoặc business rule bán hàng.
- Không sửa schema MongoDB.
- Không sửa `InventoryPostingService`, tồn kho, công nợ, quỹ, giao hàng, trả hàng hoặc công thức khuyến mại.
- Backend tiếp tục là nguồn quyết định cuối cùng cho giá, khuyến mại, tồn kho và quyền dữ liệu.
- Thay đổi tập trung vào thao tác mobile, trạng thái UI, accessibility và chống nhầm lẫn.

## 2. Hai phương án đã đánh giá

### Phương án A — Production-grade dài hạn

Tách app thành các module `customer`, `product`, `order-draft`, `cart`, `orders`, `debt`, `sync`; thêm store trạng thái tập trung và component mobile dùng chung.

- **Lợi ích:** maintainability cao, test độc lập, giảm global state, phù hợp mở rộng offline/PWA.
- **Nhược điểm:** phạm vi lớn, rủi ro regression cao nếu thực hiện trước khi UX và API ổn định.
- **Effort:** Hard.
- **Rủi ro:** Medium–High.
- **Kết luận:** dành cho Giai đoạn 4.

### Phương án B — Cân bằng effort, được triển khai

Giữ luồng nghiệp vụ và framework, bổ sung module helper UI thuần, chuẩn hóa HTML/CSS, điều hướng, giỏ hàng và trạng thái màn hình.

- **Lợi ích:** tác động nhỏ, rollback đơn giản, không ảnh hưởng backend.
- **Nhược điểm:** file `sales.js` vẫn lớn; state mutable vẫn còn.
- **Effort:** Medium.
- **Rủi ro:** Low–Medium.
- **Kết luận:** phù hợp Giai đoạn 3 và tạo ranh giới ban đầu cho Giai đoạn 4.

## 3. Data flow trước và sau

### Trước

```text
Tab trên đầu màn hình
→ mỗi tab tự đổi class
→ đổi tab luôn cuộn lên đầu
→ giỏ tách thành tab riêng nhưng không hiện khách hàng
→ sửa số lượng phải xóa rồi chọn lại sản phẩm
→ thông báo nằm trong từng tab
```

### Sau

```text
Bottom navigation 4 mục
→ Navigation helper quản lý active tab + History API + scroll position
→ Bán hàng mở giỏ như bước kiểm tra trong cùng hành trình
→ giỏ luôn hiển thị khách hàng đang mua
→ sửa Thùng/Lẻ trực tiếp
→ tính lại khuyến mại qua luồng hiện hữu
→ global status + network status luôn nhìn thấy
```

Luồng gửi đơn không đổi:

```text
Frontend tạo payload mã sản phẩm + số lượng
→ mobileApi.createSalesOrder/updateSalesOrder
→ backend Giai đoạn 1 tính lại giá và khuyến mại
→ kiểm tồn và transaction hiện hữu
```

## 4. Nội dung triển khai

### 4.1 Điều hướng mobile

- Chuyển từ 5 tab trên đầu thành bottom navigation 4 mục:
  - Khách hàng.
  - Bán hàng.
  - Đơn hàng.
  - Công nợ.
- Không để Giỏ hàng thành một mục điều hướng độc lập.
- Tích hợp `history.pushState`, `replaceState`, `popstate`.
- Nút Back Android quay về màn trước thay vì rời app ngay.
- Lưu và phục hồi vị trí cuộn riêng theo từng màn hình.
- Badge số dòng giỏ và số đơn chờ đồng bộ nằm ngay trên navigation.

### 4.2 Khách hàng và ngữ cảnh đơn

- Giữ chặn đổi khách khi giỏ có dữ liệu từ Giai đoạn 1.
- Hiển thị mã, tên và thông tin khách đang lập đơn trong khu vực giỏ.
- Ngữ cảnh khách không bị mất khi chuyển giữa Bán hàng và Giỏ.

### 4.3 Chọn sản phẩm và nhập số lượng

- `Thùng` và `Lẻ` là label cố định, không chỉ là placeholder.
- Input sử dụng `inputmode="numeric"`.
- Hiển thị quy cách, tồn thực tế, hạn mức App và giá theo luồng hiện hữu.
- Không thay đổi công thức quy đổi thùng/lẻ.

### 4.4 Giỏ hàng

- Sửa trực tiếp số Thùng/Lẻ của từng dòng.
- Kiểm tra số lượng dương, tồn đang hiển thị và hạn mức App trước khi cập nhật.
- Gọi lại `recalculateCartPromotions({ silent: true })` sau chỉnh sửa.
- Xóa dòng có xác nhận.
- Hiển thị ba tổng:
  - Tổng trước khuyến mại.
  - Tổng khuyến mại.
  - Tổng thanh toán.
- Sticky action bar giữ nút xác nhận trong vùng dễ bấm.
- Nút xác nhận disabled khi chưa có khách hoặc giỏ rỗng.

### 4.5 Danh sách đơn

- Bộ lọc ngày.
- Tìm kiếm theo mã đơn, mã khách hoặc tên khách.
- Lọc trạng thái:
  - Tất cả.
  - Chờ đồng bộ.
  - Có thể sửa.
  - Đã khóa.
- Giữ phân trang/load-more của Giai đoạn 2.
- Card đơn hiển thị tách biệt ngày, tổng tiền, đã thu và còn nợ.
- Giữ delegated event handling cho sửa/xóa.

### 4.6 Trạng thái mạng và phản hồi

- Badge Online/Offline trên header.
- Global status có `aria-live="polite"` và không bị ẩn khi đổi tab.
- Loading/empty/error state dùng helper chung.
- Error state có nút `Thử lại`.
- Skeleton nhẹ giữ bố cục khi tải.

### 4.7 Accessibility và thao tác một tay

- Hành động chính có vùng bấm tối thiểu 44px.
- `:focus-visible` có outline rõ.
- Tăng tương phản text phụ.
- Hỗ trợ `prefers-reduced-motion`.
- Bottom navigation nằm trong thumb zone và chừa safe-area phía dưới.

## 5. File thay đổi

### Runtime/UI

```text
public/mobile/sales.html
public/mobile/mobile.source/mobile-03.css
public/mobile/js/sales.js
public/mobile/js/sales-ux.js                         (mới)
public/mobile/js/sales.source/part-01.jsfrag
public/mobile/js/sales.source/part-01b.jsfrag
public/mobile/js/sales.source/part-01c.jsfrag       (mới)
public/mobile/js/sales.source/part-02.jsfrag
public/mobile/js/sales.source/part-02b.jsfrag       (mới)
public/mobile/js/sales.source/part-03.jsfrag
public/mobile/js/sales.source/part-03b.jsfrag       (mới)
```

### Build/governance

```text
config/source-bundles.json
config/source-size-budget.json
```

### Test

```text
test/mobile-sales-phase3-ux.test.js                 (mới)
test/mobile-sales-phase2-api-performance.test.js
test/mobile-sales-report-edit-ui-static.test.js
test/dms-inventory-app-quota.test.js
test/phase79b-source-bundles.test.js
```

## 6. Diff quan trọng

### Điều hướng

**Cũ**

```html
<nav class="mobile-tabs sales-tabs-5">
  <!-- 5 tab nằm trên đầu, gồm cả Giỏ hàng -->
</nav>
```

**Mới**

```html
<nav class="mobile-tabs mobile-bottom-nav" role="tablist">
  <!-- Khách hàng | Bán hàng | Đơn hàng | Công nợ -->
</nav>
```

**Lý do:** giảm cuộn ngang, dễ bấm bằng một tay và giữ Giỏ hàng trong đúng ngữ cảnh Bán hàng.

### Nhập số lượng

**Cũ**

```html
<input placeholder="Thùng">
<input placeholder="Lẻ">
```

**Mới**

```html
<label class="mobile-qty-field"><span>Thùng</span><input inputmode="numeric"></label>
<label class="mobile-qty-field"><span>Lẻ</span><input inputmode="numeric"></label>
```

**Lý do:** label không biến mất sau khi nhập và giảm nhập đảo đơn vị.

### Sửa giỏ hàng

**Cũ:** mỗi dòng chỉ có Xóa.

**Mới:** mỗi dòng có số Thùng, số Lẻ, `Cập nhật` và `Xóa`; sau cập nhật gọi lại promotion calculation hiện hữu.

### Trạng thái danh sách

**Cũ:** mỗi nơi tự gán chuỗi `Đang tải...` hoặc empty text.

**Mới:** `renderMobileListState()` chuẩn hóa `loading`, `empty`, `error`, `retry`.

## 7. Technical debt được ghi nhận

`public/mobile/js/sales.js` của Giai đoạn 2 đã ở mức **40.592 byte**, sát giới hạn 40 KiB. Giai đoạn 3 bổ sung điều hướng và UX làm bundle tăng lên khoảng **45,6 KiB**.

Biện pháp tạm thời có kiểm soát:

- Tách pure UI helper sang `public/mobile/js/sales-ux.js`.
- Chia source thành các fragment dưới 24 KiB.
- Khóa ngân sách riêng của `sales.js` ở 48 KiB.
- Test source-bundle đọc ngân sách được duyệt thay vì bỏ kiểm soát kích thước.

Đây **không phải trạng thái dài hạn**. Giai đoạn 4 phải tách tiếp `customer`, `cart`, `orders`, `debt`, `navigation` để đưa bundle điều phối chính về dưới 32–40 KiB.

## 8. Kiểm thử

### Test mục tiêu

```text
Mobile Phase 1 + Phase 2 + Phase 3 + edit UI: 32/32 đạt
```

### Full suite

| Phiên bản | Tổng | Đạt | Lỗi | Skip |
|---|---:|---:|---:|---:|
| ZIP đầu vào Giai đoạn 2 | 847 | 842 | 4 | 1 |
| Bản vá Giai đoạn 3 | 857 | 852 | 4 | 1 |

Không có lỗi regression mới. Bốn lỗi còn lại trùng baseline:

1. Snapshot/cache version của DMS inventory admin.
2. Hai assertion cũ của import worker liên quan `importMode`.
3. Snapshot/cache version sales-order web shard.

Một test golden fixture SSE được skip vì chưa có workbook gốc.

### Quality gates

| Hạng mục | Kết quả |
|---|---:|
| Source bundles | 18/18 đạt |
| JavaScript syntax | 847 file đạt |
| Path portability | 1.026 đường dẫn đạt |
| Source-size budget | Đạt |
| Enterprise smoke | 10 module, 9 flag đạt |
| OpenAPI | 308 operations, đồng bộ |
| npm audit mức high | 0 lỗ hổng |

## 9. Side effect

| Khu vực | Đánh giá |
|---|---|
| API mobile | Không đổi contract |
| Tạo/sửa/xóa đơn | Không đổi business rule |
| Giá và khuyến mại | Tiếp tục do backend Giai đoạn 1 quyết định |
| Tồn kho | Không sửa service hoặc posting |
| Công nợ | Không sửa `DebtReadService` hoặc `arLedgers` |
| Quỹ | Không ảnh hưởng |
| Giao hàng | Không ảnh hưởng |
| Trả hàng | Không ảnh hưởng |
| Offline queue | Chỉ hiển thị trạng thái hiện hữu; không đổi sync rule |
| Database/schema | Không thay đổi |

## 10. Rollback

Có thể rollback độc lập bằng cách:

1. Khôi phục `public/mobile/sales.html` và `mobile-03.css` từ ZIP Giai đoạn 2.
2. Khôi phục các source fragment và `source-bundles.json`.
3. Chạy lại `npm run source-bundles:refresh`.
4. Không cần rollback database vì bản vá không ghi migration hoặc thay dữ liệu.

## 11. Giới hạn kiểm chứng

- Chưa có thiết bị Android thật trong môi trường chạy test.
- Chưa đo thao tác một tay và bàn phím ảo trên Chrome Android production.
- Chưa có số liệu p50/p95 UX thực tế sau deploy.
- Các kiểm thử viewport hiện chủ yếu là static contract/regression; nên bổ sung E2E viewport ở Giai đoạn 4.

## 12. Giai đoạn tiếp theo

**Giai đoạn 4 — Tách cấu trúc frontend**, chỉ nên bắt đầu sau khi bản Giai đoạn 3 được chạy thử thực địa.

Phạm vi đề xuất:

- Tách `customer`, `product`, `order-draft`, `cart`, `orders`, `debt`, `sync` thành ES modules.
- Tạo `OrderDraftStore` làm nguồn state duy nhất.
- Tách business logic thuần khỏi DOM.
- Chuẩn hóa API client/request state.
- Bổ sung E2E mobile viewport.
- Giảm `sales.js` xuống dưới ngưỡng 32–40 KiB mà không đổi framework.
