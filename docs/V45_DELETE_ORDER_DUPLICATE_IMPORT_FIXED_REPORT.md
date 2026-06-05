# V45 - Fix xóa đơn con vẫn báo trùng khi import lại

## Nguyên nhân
Luồng xóa đơn bán trước đây chỉ chuyển đơn sang `status = void` và thêm `deletedAt`, nhưng bản ghi vẫn còn trong collection `orders`. Trong khi đó rule import kiểm tra trùng bằng `documentCode`, `invoiceCode`, `code` mà không loại trừ đơn đã xóa mềm, nên import lại vẫn báo: `Mã đơn / số hóa đơn đã tồn tại trong hệ thống`.

## File đã sửa

### 1. `src/rules/importRules.js`
- Thêm bộ lọc chỉ kiểm tra trùng với đơn còn hiệu lực.
- Bỏ qua các đơn có:
  - `deleted: true`
  - `isDeleted: true`
  - `deletedAt` có giá trị
  - `status` thuộc `void/deleted/removed/cancelled/canceled`

### 2. `src/services/orderService.js`
- Thêm rule phân loại:
  - Đơn chưa gộp, chưa giao, chưa xác nhận kế toán: xóa vật lý khỏi `orders`.
  - Đơn đã gộp/giao/xác nhận kế toán: chỉ xóa mềm để giữ audit.
- Khi xóa mềm có ghi rõ `deleted: true`, `isDeleted: true`, `deletedAt` để import bỏ qua.

### 3. `src/repositories/orderRepository.js`
- Mở rộng định danh tìm/xóa đơn theo:
  - `id`
  - `code`
  - `documentCode`
  - `invoiceCode`
  - `orderCode`
  - `salesOrderCode`

### 4. `src/controllers/orderController.js`
- Trả thông báo đúng theo loại xóa: xóa hẳn hoặc xóa mềm.

### 5. `src/routes/mobileRoutes.js`
- App bán hàng: đơn chưa phát sinh kế toán/giao hàng sẽ xóa hẳn khỏi `orders`.
- Đơn đã phát sinh thì chỉ xóa mềm.

## Kết quả mong muốn
Sau khi xóa đơn con chưa giao/chưa vào kế toán, bản ghi sẽ không còn trong `orders`, nên import lại cùng mã đơn sẽ không bị báo trùng.
