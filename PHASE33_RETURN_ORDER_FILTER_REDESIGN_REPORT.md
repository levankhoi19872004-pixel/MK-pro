# PHASE 33 — RETURN ORDER FILTER REDESIGN & DATE FILTER FIX

## 1. Phạm vi

- Thiết kế lại khu vực tìm kiếm/lọc ngày của màn **Đơn trả hàng**.
- Loại bỏ dropdown chế độ `Hôm nay / Tất cả / Từ ngày đến ngày`.
- Sửa lỗi chọn ngày nhưng danh sách vẫn hiển thị phiếu ngoài khoảng ngày.
- Giữ nguyên popup chi tiết readonly và toàn bộ luồng kho/công nợ hiện tại.

## 2. Nguyên nhân gốc rễ

### 2.1. Mongoose loại bỏ điều kiện ngày

`src/config/db.js` bật:

```js
mongoose.set('strictQuery', true);
```

Trong khi model `ReturnOrder` chưa khai báo các field được dùng để lọc:

```text
date
documentDate
deliveryDate
returnDate
```

Vì vậy Mongoose có thể loại bỏ các nhánh điều kiện ngày trước khi gửi truy vấn xuống MongoDB, làm API trả về các phiếu ngoài ngày đã chọn.

### 2.2. Nhiều field ngày không đồng nhất

Service cũ dùng `$or` trên nhiều field ngày. Một phiếu có thể khớp `deliveryDate` nhưng UI lại hiển thị `returnDate`, dẫn đến người dùng thấy ngày hiển thị nằm ngoài bộ lọc.

### 2.3. Giao diện gọi API quá nhiều

Search và từng ô ngày đều tự gọi API khi thay đổi. Điều này làm bố cục phức tạp, phát sinh request lặp và dễ bị response cũ ghi đè response mới.

## 3. Giải pháp đã áp dụng

### Backend

- Khai báo đầy đủ các field ngày và field tìm kiếm trong `src/models/ReturnOrder.js` để tương thích `strictQuery`.
- Kiểm tra `dateFrom <= dateTo`; trả HTTP 400 khi khoảng ngày sai.
- MongoDB lọc trước để tận dụng index.
- Service kiểm tra lại kết quả theo **ngày nghiệp vụ chuẩn** với thứ tự:
  1. `returnDate`
  2. `date`
  3. `documentDate`
  4. `deliveryDate`
- Chuẩn hóa ngày trả về API thành `YYYY-MM-DD`.

### Frontend

Khu lọc mới chỉ còn:

```text
Tìm kiếm | Từ ngày | Đến ngày | Lọc | Xóa lọc
```

- Mặc định hai ngày là ngày hiện tại.
- `Xóa lọc` xóa cả từ khóa và ngày, sau đó tải toàn bộ.
- Không gọi API khi người dùng mới đổi từng ô; chỉ gọi khi bấm **Lọc** hoặc Enter.
- Chặn khoảng ngày ngược ngay trên trình duyệt.
- Thêm request sequence để response cũ không ghi đè response mới.
- Ngày trong bảng hiển thị `DD/MM/YYYY`.
- Cập nhật cache-busting cho CSS/JS.

## 4. File thay đổi

```text
public/index.html
public/style.css
public/app.js
public/js/app/00-dom-state.js
public/js/app/07-debt-cashbook.js
src/models/ReturnOrder.js
src/services/returnOrderService.js
src/controllers/returnOrderController.js
test/return-order-filter-redesign-regression.test.js
```

## 5. Kiểm thử

- JavaScript syntax: **498 file PASS**.
- OpenAPI contract: **270 operations PASS**.
- Toàn bộ test: **384/384 PASS**.
- Regression riêng Phase 33: **6/6 PASS**.
- npm audit mức High: **0 vulnerability**.

## 6. Ảnh hưởng hệ thống

Không thay đổi:

- MongoDB collection hoặc dữ liệu hiện hữu.
- Logic tạo/hủy phiếu trả.
- Nhập lại tồn kho.
- AR-RETURN và xác nhận kế toán.
- Popup chi tiết đơn trả hàng.

Không cần migration dữ liệu. Chỉ cần deploy code mới và chạy hard refresh.
