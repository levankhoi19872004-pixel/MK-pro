# V45 - Sửa đơn tổng trả hàng nhận trạng thái has_return và ẩn phiếu trả giá trị 0

## Mục tiêu

1. Phiếu trả hàng phát sinh từ app giao hàng có trạng thái `has_return` phải được hiển thị trong danh sách `Phiếu trả hàng chưa gộp`.
2. Khi tạo đơn tổng trả hàng, backend phải cho phép gộp phiếu có trạng thái `has_return`.
3. Danh sách đơn/phiếu trả hàng không hiển thị các phiếu có giá trị trả hàng bằng 0.
4. Backend chặn không cho tạo đơn tổng trả từ phiếu có giá trị bằng 0.

## File đã sửa

### 1. `src/services/masterReturnOrderService.js`

Đã thêm bộ trạng thái được phép gộp:

```js
const GROUPABLE_RETURN_STATUSES = ['has_return', 'waiting_receive', 'pending_warehouse_receive', 'pending'];
```

Đã thêm hàm kiểm tra giá trị phiếu trả:

```js
function getReturnOrderValue(row = {}) {
  return toNumber(row.debtReduction ?? row.totalAmount ?? row.amount ?? row.totalValue);
}

function hasPositiveReturnValue(row = {}) {
  return getReturnOrderValue(row) > 0;
}
```

Đã sửa `listUnmergedReturnOrders()`:

- Cho hiện phiếu trạng thái `has_return`.
- Chỉ hiện phiếu chưa gộp.
- Chỉ hiện phiếu có giá trị trả hàng > 0.

Đã sửa `createMasterReturnOrder()`:

- Cho phép gộp phiếu trạng thái `has_return`.
- Chặn phiếu trả hàng có giá trị bằng 0.

### 2. `src/services/returnOrderService.js`

Đã thêm lọc mặc định cho danh sách đơn trả hàng:

- Không hiển thị phiếu trả hàng có giá trị bằng 0.
- Nếu cần xem lại dữ liệu 0 để debug, có thể gọi API với `includeZeroValue=1` hoặc `showZero=1`.

## Kết quả nghiệp vụ

Trước khi sửa:

```text
Chị Dịu Huyền / Hồng Gấm có phiếu trả hàng trạng thái has_return
→ Đơn trả hàng có hiển thị
→ Nhưng Phiếu trả hàng chưa gộp không hiện
→ Không tạo được đơn tổng trả
```

Sau khi sửa:

```text
Phiếu trả hàng has_return + giá trị > 0
→ Hiển thị trong Phiếu trả hàng chưa gộp
→ Tick chọn được
→ Tạo được đơn tổng trả
```

Phiếu trả hàng giá trị 0:

```text
Không hiện ở danh sách đơn trả hàng
Không hiện ở danh sách phiếu chưa gộp
Không được gộp vào đơn tổng trả hàng
```

## Test đã chạy

```text
node --check src/services/masterReturnOrderService.js: OK
node --check src/services/returnOrderService.js: OK
node --check public/js/app/07-debt-cashbook.js: OK
```

Đã thử `npm test` trong sandbox, nhưng môi trường sandbox không có `node_modules/mongoose`, nên các test tích hợp phụ thuộc mongoose không chạy được đầy đủ. Trên máy anh đã có `node_modules`, chạy lại `npm test` sẽ kiểm tra đủ.
