# Staff Identity Contract

## Mục tiêu

Ngăn lẫn người bán, người giao và actor audit. Đây là nguyên nhân hay gây lọc sai công nợ, đơn giao và báo cáo.

## Field canonical

| Vai trò | Code | Name |
|---|---|---|
| NVBH | `salesStaffCode` | `salesStaffName` |
| NVGH | `deliveryStaffCode` | `deliveryStaffName` |
| Actor audit | `staffCode` | `staffName` |

## Được phép

- Giữ alias legacy khi normalize input/output: `salesmanCode`, `nvbhCode`, `deliveryCode`, `nvghCode`.
- Khi có code, filter theo code-only, so sánh normalized case-insensitive.

## Bị cấm

- Dùng `staffCode` thay NVBH/NVGH.
- OR tên nhân viên khi đã có mã.
- Ghi `salesStaffCode` bằng mã giao hàng hoặc ngược lại.

## Static guard

- `test/staff-identity-contract-static.test.js`.
- `src/utils/assertStaffIdentityContract.util.js`.
