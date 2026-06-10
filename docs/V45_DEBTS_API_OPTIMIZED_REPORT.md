# V45 - Tối ưu API công nợ `/api/debts`

## Vấn đề cũ

`GET /api/debts` đang mất khoảng 22-23 giây dù trả 0 dòng vì hàm `debtReport()` load toàn bộ collection lớn:

- `SalesOrder.find({})`
- `ArLedger.find({})`
- `Receipt.find({})`
- `ReturnOrder.find({})`
- `Customer.find({})`

Sau đó mới lọc, group, reduce bằng JavaScript. Đây là nguyên nhân API Monitor báo Mongo/DB Query cao và phản hồi rất chậm.

## Đã sửa

### 1. Chuẩn hóa backend công nợ

File sửa chính:

- `src/services/reportService.js`
- `src/controllers/reportController.js`
- `src/routes/reportRoutes.js`

Đã thay `debtReport()` bằng luồng tối ưu:

- Không load toàn bộ đơn hàng, phiếu thu, trả hàng, khách hàng.
- Đọc trực tiếp từ `arLedgers` theo filter.
- Dùng MongoDB aggregate để group theo khách/đơn.
- Giới hạn `limit` tối đa 100.
- Có `page`, `limit`, `hasMore`.
- Chỉ lấy customer meta liên quan đến dòng công nợ đang cần.
- Không dùng `ledger.some()` lồng trong `orders.forEach()` nữa.

### 2. Thêm API tách nhỏ

Đã thêm các endpoint mới:

```text
GET /api/debts/init
GET /api/debts/customers
GET /api/debts/customer-detail/:customerCode?
GET /api/debts/ar-ledger
```

Vẫn giữ endpoint cũ để tương thích:

```text
GET /api/debts
```

nhưng endpoint cũ hiện cũng dùng luồng tối ưu.

### 3. Sửa frontend màn công nợ

File:

```text
public/js/app/07-debt-cashbook.js
```

Đã đổi:

```text
/api/debts?...               -> /api/debts/customers?...
/api/debts?... cho AR Ledger -> /api/debts/ar-ledger?...
```

## Mục tiêu sau sửa

```text
/api/debts/customers       < 300-500ms
/api/debts/ar-ledger       < 300-500ms
/api/debts/init            < 100ms
```

## Cách test

1. Chạy server.
2. Vào Hệ thống → API Monitor.
3. Bấm Xóa thống kê.
4. Vào màn Công nợ.
5. Nhập NVBH hoặc khách hàng.
6. Bấm Tải API Monitor.
7. Kiểm tra các API:

```text
GET /api/debts/customers
GET /api/debts/ar-ledger
```

Không còn tình trạng `/api/debts` mất 22-23 giây khi trả 0 dòng.
