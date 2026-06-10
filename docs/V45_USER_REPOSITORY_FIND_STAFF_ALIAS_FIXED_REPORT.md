# V45 - Fix lỗi tạo đơn tổng: findStaffByIdOrCode

## Lỗi
Khi bấm **Tạo đơn tổng**, backend báo:

```txt
userRepository.findStaffByIdOrCode is not a function
```

## Nguyên nhân
Các service đang gọi:

- `masterOrderService.js`
- `orderService.js`
- `masterReturnOrderService.js`

đều dùng hàm:

```js
userRepository.findStaffByIdOrCode(...)
```

nhưng `src/repositories/userRepository.js` chưa khai báo/export hàm này.

## Đã sửa
Thêm alias trong `src/repositories/userRepository.js`:

```js
async function findStaffByIdOrCode(idOrCode) {
  return findUserByIdOrCode(idOrCode);
}
```

và export hàm này để các service dùng chung.

## Kết quả
- Tạo đơn tổng không còn lỗi function missing.
- Các luồng tìm NVBH/NVGH theo mã/id/tài khoản dùng chung `users` Mongo.
- Đã kiểm tra cú pháp toàn bộ `.js`: OK.
