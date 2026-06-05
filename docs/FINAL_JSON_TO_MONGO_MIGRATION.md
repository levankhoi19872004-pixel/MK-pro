# Final JSON -> Mongo Migration

Script chính:

```bash
npm run migrate:json
```

Chức năng:

- Đọc dữ liệu từ `data/kho-data.json`
- Chuyển toàn bộ nhóm dữ liệu chính sang MongoDB
- Tự chuẩn hóa alias cũ `cashbook` -> `cashbooks`
- Tự bổ sung tài khoản mặc định, roles và permissions nếu JSON chưa có
- Tự hash password staff/user nếu trong JSON còn là plain text
- Mặc định chạy theo cơ chế **upsert an toàn**, không xóa dữ liệu Mongo hiện có

## Các lệnh sử dụng

### 1. Chạy thử, không ghi Mongo

```bash
npm run migrate:json:dry-run
```

### 2. Migration an toàn, khuyến nghị dùng

```bash
npm run migrate:json
```

### 3. Replace toàn bộ collection bằng dữ liệu JSON

Chỉ dùng khi chắc chắn Mongo chưa có dữ liệu thật cần giữ.

```bash
npm run migrate:json:replace
```

## Điều kiện trước khi chạy

Trong `.env` phải có:

```env
MONGO_URI=mongodb+srv://...
```

## Các collection được migrate

- products
- customers
- staffs
- roles
- permissions
- warehouses
- suppliers
- stock / inventories
- importOrders
- salesOrders
- masterOrders
- payments / journals
- receipts
- returnOrders
- cashbooks
- bankbooks
- importLogs
- mobileLogs
- auditLogs
- promotions
- importTemplates

Sau khi chạy xong, JSON chỉ nên được xem là backup/legacy reference. Nghiệp vụ chính phải dùng MongoDB.
