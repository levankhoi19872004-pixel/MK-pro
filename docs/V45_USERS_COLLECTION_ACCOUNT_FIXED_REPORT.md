# V45 - Sửa mục Tài khoản lưu đúng collection `users`

## Vấn đề
Mục **Tài khoản** trước đó đang thao tác qua `Staff`/collection `staffs`, trong khi quy tắc nguồn chuẩn của V45 là:

- Nhân viên / tài khoản đăng nhập: `users`
- Mã NVBH / NVGH dùng cho import và gợi ý: `users.staffCode`

Vì vậy khi tạo/sửa tài khoản trên giao diện, dữ liệu không đi vào `users`, làm autocomplete NVBH/NVGH và rule import không thấy nhân viên mới.

## Nội dung đã sửa

### 1. `src/repositories/userRepository.js`
- Đổi repository tài khoản sang dùng `User` model thay vì `Staff` model.
- `GET /api/users` đọc từ collection `users`.
- `POST /api/users` tạo/cập nhật vào collection `users`.
- `DELETE /api/users/:id` xóa trong collection `users`.
- Tìm tài khoản theo `_id`, `username`, `staffCode`, `code`.
- Check trùng theo `staffCode/code/username`.

### 2. `src/services/userService.js`
- Mã nhập ở form `code` được lưu thành `staffCode` trong users.
- Client vẫn nhận đủ alias `code`, `staffCode`, `name`, `fullName` để không vỡ UI cũ.
- Không còn gọi `findStaffs/createStaff/updateStaff/deleteStaff`.

### 3. `src/models/User.js`
- Bổ sung các trường phục vụ nghiệp vụ:
  - `name`
  - `phone`
  - `code`
  - `staffCode` có index
- Thêm index:
  - `staffCode`
  - `role + staffCode`

### 4. `scripts/migrate-staffs-to-users.js`
- Thêm script chuyển dữ liệu cũ từ `staffs` sang `users`.
- Dùng khi dữ liệu tài khoản đã lỡ được lưu vào `staffs` ở các bản trước.

Lệnh chạy một lần trên server:

```bash
node scripts/migrate-staffs-to-users.js
```

## Kết quả mong đợi sau sửa

### Tạo tài khoản mới
Form Tài khoản nhập:

```text
Mã: 35581
Tên đăng nhập: 35581 hoặc tài khoản riêng
Tên: Lương Thị Kiều
Vai trò: Bán hàng
```

Dữ liệu sẽ lưu vào `users`:

```js
{
  username: '35581',
  staffCode: '35581',
  code: '35581',
  fullName: 'Lương Thị Kiều',
  name: 'Lương Thị Kiều',
  role: 'sales',
  isActive: true
}
```

### Gợi ý NVBH/NVGH
- NVBH đọc từ `users.role = sales` và có `users.staffCode`.
- NVGH đọc từ `users.role = delivery` và có `users.staffCode`.
- Không lấy từ collection `staffs` nữa.

### Import Excel
- Mã NVBH trong Excel so với `users.staffCode`.
- Không so với `username`.
- Không lấy tài khoản chung `banhang/giaohang`.

## Kết quả test

### PASS
```bash
node --check src/repositories/userRepository.js
node --check src/services/userService.js
node --check src/models/User.js
node --check scripts/migrate-staffs-to-users.js
```

### Cần test trên Mongo thật
1. Vào mục Tài khoản tạo 1 NVBH mới.
2. Kiểm tra Mongo collection `users` có document mới.
3. Click ô NVBH ở Đơn bán, thấy nhân viên mới hiện gợi ý.
4. Import Excel có mã NVBH đó, preview hiện đúng tên.
5. Tạo 1 NVGH mới, click ô NVGH ở Đơn tổng/Giao hàng, thấy nhân viên mới hiện gợi ý.
