# V45 - Sửa đơn tổng trả hàng nhận trạng thái has_return và ẩn phiếu trả = 0

## 1. Sửa backend danh sách phiếu trả chưa gộp

File: `src/services/masterReturnOrderService.js`

Đã thêm nhóm trạng thái được phép gộp:

```js
waiting_receive
pending_warehouse_receive
pending
has_return
```

Trước đây `has_return` không được đưa vào danh sách chờ gộp, nên các phiếu như Chị Dịu Huyền / Hồng Gấm có đơn trả hàng thật nhưng không hiện hoặc không được gộp vào đơn tổng trả.

## 2. Chặn gộp phiếu trả không có số lượng/giá trị

File: `src/services/masterReturnOrderService.js`

Đã thêm kiểm tra:

- Tổng số lượng trả > 0, hoặc
- Tổng giá trị trả > 0, hoặc
- Có ít nhất 1 dòng sản phẩm có `qtyReturn/returnQty/returnQuantity/returnedQty/quantity/qty > 0`.

Nếu phiếu trả = 0 thì backend không đưa vào danh sách chưa gộp và không cho tạo đơn tổng trả.

## 3. Sửa frontend danh sách "Phiếu trả hàng chưa gộp"

File: `public/js/app/07-debt-cashbook.js`

Đã thêm lớp lọc phụ ở giao diện để đảm bảo danh sách phiếu trả chưa gộp không hiện các phiếu = 0, kể cả khi dữ liệu cũ/backend trả về chưa sạch.

## 4. API giữ tương thích

Endpoint dùng lại:

```text
GET /api/master-return-orders/unmerged-return-orders
POST /api/master-return-orders
```

Frontend gửi thêm:

```text
hideZero=1
```

để thể hiện rõ ý đồ nghiệp vụ.

## 5. Kết quả kỳ vọng

- Chị Dịu Huyền và Hồng Gấm có trạng thái `has_return` sẽ hiện trong danh sách phiếu trả chưa gộp nếu có số lượng/giá trị trả > 0.
- Khi tick 2 phiếu này và bấm "Tạo đơn tổng trả", đơn tổng trả sẽ chứa đúng phiếu con.
- Các phiếu trả hàng có tổng SL = 0 và tổng giá trị = 0 sẽ không hiện trong danh sách chờ gộp.
- Backend cũng chặn không cho gộp nhầm phiếu = 0.

## 6. Kiểm tra đã chạy

```text
node --check src/services/masterReturnOrderService.js: OK
node --check public/js/app/07-debt-cashbook.js: OK
npm test: không chạy đủ trong sandbox vì ZIP không kèm node_modules/mongoose.
```

Ghi chú: trên máy triển khai của anh đã có `node_modules`, hãy chạy lại `npm test` sau khi giải nén file.

