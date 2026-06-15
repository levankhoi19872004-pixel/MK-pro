# PHASE 51 — SỬA CHỈNH SỬA ĐƠN TRÊN APP BÁN HÀNG

## 1. Phạm vi

Sửa lỗi tại App bán hàng → tab **Báo cáo** → danh sách **Đơn đã đặt hôm nay**: nút **Chỉnh sửa** xuất hiện nhưng không mở hoặc API từ chối sửa đơn vừa tạo.

Tech stack liên quan:

- Frontend mobile: JavaScript ES module, render động bằng `innerHTML`.
- Backend: Node.js/Express, MongoDB/Mongoose.
- Tồn kho: `InventoryPostingService` và `stockTransactions`.
- Hạn mức bán App: `internalSaleAllocations` và `internalSaleAllocationLedgers`.

## 2. Nguyên nhân gốc rễ

### 2.1. Đơn mobile luôn được post tồn ngay khi tạo

Luồng tạo đơn đặt `stockPosted = true` và trừ kho ngay để chống bán vượt tồn.

### 2.2. API sửa lại khóa toàn bộ đơn đã post tồn

`getSalesOrder()` và `updateSalesOrder()` dùng `stockPosted` như điều kiện cấm sửa. Vì mọi đơn mobile mới đều đã post tồn, gần như toàn bộ đơn vừa chấm không thể chỉnh sửa.

### 2.3. API danh sách trả sai khả năng chỉnh sửa

Projection của danh sách không lấy `stockPosted`, nên frontend thường nhận `canEdit = true` và vẫn render nút. Khi bấm nút, API chi tiết lại trả `canEdit = false`, tạo cảm giác nút không hoạt động.

### 2.4. Listener gắn lại sau mỗi lần render

Danh sách được thay toàn bộ bằng `innerHTML`. Listener trực tiếp trên từng nút dễ mất khi danh sách render lại.

## 3. Giải pháp đã triển khai

### 3.1. Cho phép sửa đơn đã post tồn theo điều kiện an toàn

Đơn được sửa khi đồng thời thỏa mãn:

- Là đơn của chính NVBH đăng nhập.
- Là đơn trong ngày hiện tại.
- Chưa gộp đơn tổng.
- Chưa giao/hoàn tất.
- Chưa xác nhận kế toán.
- Chưa phát sinh trả hàng có giá trị hoặc phiếu trả đã khóa.
- Chưa hủy/xóa.

`stockPosted = true` không còn là lý do khóa đơn.

### 3.2. Điều chỉnh tồn theo phần chênh lệch

Khi sửa số lượng:

- Số mới > số cũ: chỉ trừ thêm phần tăng.
- Số mới < số cũ: chỉ hoàn kho phần giảm.
- Đổi sản phẩm: hoàn sản phẩm cũ và trừ sản phẩm mới.
- Chỉ sửa giá/khách hàng: không tạo movement kho.

Movement sử dụng loại riêng:

- `SALE_EDIT_IN`
- `SALE_EDIT_OUT`
- `refType = SALES_ORDER_EDIT`

Mỗi request có khóa idempotency riêng để không post tồn hai lần.

### 3.3. Điều chỉnh hạn mức DMS/App theo đúng delta

- Tăng số lượng: trừ thêm quota đúng phần tăng.
- Giảm số lượng: chỉ hoàn phần quota trước đó đã thực sự tiêu thụ.
- Đơn cũ chưa có metadata quota: chỉ phần tăng mới tiêu thụ quota; không hoàn khống quota khi giảm.
- Giữ lại dấu vết `allocationConsumedQty` trên từng dòng sản phẩm.

### 3.4. Transaction và chống ghi đè đồng thời

Trong cùng MongoDB transaction:

1. Kiểm tra lại quyền/trạng thái đơn.
2. Kiểm tra nghiệp vụ trả hàng.
3. Khóa idempotency request.
4. Điều chỉnh quota.
5. Điều chỉnh tồn theo delta.
6. Cập nhật đơn bằng optimistic version.
7. Đồng bộ phiếu trả nháp nếu có.
8. Ghi mobile log.

Nếu bất kỳ bước nào lỗi, toàn bộ tồn, quota và đơn hàng rollback.

### 3.5. Sửa frontend

- Dùng event delegation trên `#todayOrders`.
- Nút có `type="button"` rõ ràng.
- Hiển thị chính xác lý do không được sửa.
- Khi mở đơn sửa, thông báo rõ tồn và quota sẽ được điều chỉnh theo chênh lệch.
- Đổi cache version thành `phase51-mobile-edit-posted-v1`.

## 4. File thay đổi

- `public/mobile/js/sales.js`
- `public/mobile/sales.html`
- `src/domain/posting/InventoryPostingService.js`
- `src/models/SalesOrder.js`
- `src/services/internalSaleAllocation.service.js`
- `src/services/mobile/sales.service.js`
- `src/utils/orderItemDelta.util.js` — file mới
- `test/mobile-sales-edit-delta.test.js` — file mới
- `test/mobile-sales-report-edit-ui-static.test.js` — file mới
- Các regression test liên quan được cập nhật.

## 5. Kết quả kiểm thử

- Targeted tests: pass.
- Full project tests: **516/516 pass**.
- Fail: **0**.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**.
- JavaScript thay đổi đã chạy `node --check` thành công.

Chưa chạy trực tiếp với MongoDB Atlas production. Cần smoke test sau deploy bằng một đơn thử nhỏ.

## 6. Kịch bản smoke test sau deploy

1. Tạo đơn App gồm một SKU, số lượng 10.
2. Vào Báo cáo → bấm Chỉnh sửa.
3. Tăng 10 → 12:
   - Tồn thực tế giảm thêm 2.
   - Hạn mức App giảm thêm 2.
4. Giảm 12 → 7:
   - Tồn thực tế tăng lại 5.
   - Hạn mức App hoàn lại 5, nhưng không vượt phần đã tiêu thụ.
5. Thêm SKU mới:
   - Tồn và quota SKU mới cùng giảm.
6. Xóa SKU khỏi đơn:
   - Tồn và quota SKU đó cùng được hoàn.
7. Thử sửa vượt tồn hoặc vượt quota:
   - API phải trả `409` và không thay đổi dữ liệu.
8. Gộp đơn vào đơn tổng rồi thử sửa:
   - App phải khóa và hiển thị đúng lý do.

## 7. Rollback

Nếu cần rollback nhanh, deploy lại bản Phase 50 trước đó. Không có migration bắt buộc và không thay đổi cấu trúc collection theo cách phá vỡ dữ liệu cũ.
