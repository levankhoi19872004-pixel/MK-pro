# V45 Import Excel - sửa nguồn so sánh mã NVBH từ Mongo users

## Vấn đề
Khi preview import Excel, giao diện đã đọc được `Mã NVBH: 35095` nhưng đơn vẫn báo lỗi `Thiếu mã NVBH` hoặc `Mã NVBH không tồn tại`.

Nguyên nhân thường gặp là dữ liệu tài khoản trong Mongo collection `users` có mã nhân viên lưu ở nhiều trường khác nhau, đặc biệt `code`, không chỉ riêng `staffCode`.

## Đã sửa
File:

- `src/rules/staffRules.js`

Nội dung sửa:

1. So sánh mã NVBH/NVGH trực tiếp với collection `users`.
2. Ưu tiên `users.staffCode`, đồng thời hỗ trợ thêm các trường mã nhân viên cũ:
   - `code`
   - `employeeCode`
   - `salesStaffCode`
   - `deliveryStaffCode`
3. Hỗ trợ mã dạng số và dạng text, ví dụ `35095` trong Excel vẫn khớp nếu Mongo lưu là số `35095` hoặc chuỗi `"35095"`.
4. Không fallback sang `username` hoặc `id` để tránh nhận nhầm tài khoản chung như `banhang`, `giaohang`.
5. Kiểm tra role sau khi tìm tài khoản:
   - NVBH: `sales`, `sale`, `NVBH`, `salesStaff`, `banhang`, `nhanvienbanhang`, hoặc cờ `isSalesman/isSalesStaff`.
   - NVGH: `delivery`, `shipper`, `NVGH`, `deliveryStaff`, `giaohang`, `nhanviengiaohang`, hoặc cờ `isDelivery/isDeliveryStaff`.

## Kết quả mong đợi
Nếu trong Mongo `users` có tài khoản:

```js
{
  staffCode: "35095" // hoặc code: "35095"
  role: "sales",
  fullName: "NGUYỄN ĐÌNH THÀNH"
}
```

thì import Excel sẽ nhận đúng NVBH và không báo lỗi thiếu mã NVBH.
