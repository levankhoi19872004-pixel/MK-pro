# V45 ReturnOrders No Snapshot Fixed

## Mục tiêu

Đảm bảo `returnOrders` không bị mất do snapshot mobile/primary data ghi đè.

## Nguyên tắc đã áp dụng

1. `returnOrders` không đi qua `persistPrimaryDataSnapshot`.
2. Phiếu trả hàng chỉ được ghi bằng `returnOrderRepository.upsert()`.
3. Không cho `replaceAll returnOrders` trong luồng mobile/primary snapshot.
4. Danh sách đơn trả hàng có bộ lọc rõ ràng: Hôm nay / Tất cả / Từ ngày đến ngày.

## File đã sửa

### Backend

- `src/services/appData.service.js`
  - Xóa `normalized.returnOrders` trước khi persist primary snapshot.

- `src/repositories/appData.repository.js`
  - `replaceAll(data)` chỉ replace collection nếu snapshot thực sự có key đó.
  - Tránh việc xóa trắng collection khi key đã bị loại khỏi snapshot.

- `src/repositories/mobile/delivery.repository.js`
  - `persistDeliverySnapshotSafely()` clone snapshot và `delete snapshot.returnOrders` trước khi persist.

- `src/services/mobile/delivery.service.js`
  - Wrapper persist cũng xóa `returnOrders` trước khi gọi repository persist.
  - Vẫn refresh `returnOrders` từ Mongo khi build danh sách app giao hàng, nhưng không persist ngược vào snapshot.

- `src/services/mobileService.js`
  - Login mobile chỉ ghi mobile log, không gửi `returnOrders` vào snapshot persist.

- `src/services/mobile/auth.service.js`
  - Login mobile-auth chỉ ghi mobile log, không gửi `returnOrders` vào snapshot persist.

- `src/repositories/returnOrderRepository.js`
  - Chặn `replaceAll()` bằng lỗi rõ ràng.
  - Luồng ghi hợp lệ còn lại là `upsert()`.

- `src/services/returnOrderService.js`
  - Không mặc định ép lọc hôm nay trong API nữa.
  - Chỉ lọc hôm nay khi frontend gửi `dateMode=today`.
  - `dateMode=all` trả toàn bộ theo limit/trang.
  - `dateMode=range` lọc theo `dateFrom/dateTo`.

### Frontend

- `public/index.html`
  - Thêm select `returnOrderDateMode` gồm: Hôm nay / Tất cả / Từ ngày đến ngày.

- `public/js/app/00-dom-state.js`
  - Thêm DOM state `returnOrderDateMode`.

- `public/js/app/07-debt-cashbook.js`
  - `loadReturnOrders()` gửi `dateMode` rõ ràng.
  - `today`: gửi dateFrom/dateTo hôm nay.
  - `all`: không gửi dateFrom/dateTo.
  - `range`: gửi khoảng ngày người dùng chọn.
  - Thêm sự kiện tải lại, tìm kiếm, đổi chế độ lọc.

## Luồng sau khi sửa

```text
App giao hàng tạo/sửa hàng trả
→ returnOrderService.upsertDeliveryReturnOrder()
→ returnOrderRepository.upsert()
→ Mongo collection returnOrders
```

```text
Mobile snapshot / đăng nhập / lưu tiền giao hàng
→ delete snapshot.returnOrders
→ persistPrimaryDataSnapshot(snapshot)
→ không thể replaceAll returnOrders
```

## Kết quả

`returnOrders` sẽ không còn bị mất do snapshot cũ ghi đè. Nếu đơn không hiển thị, cần kiểm tra bộ lọc ngày ở giao diện hoặc trạng thái phiếu.
