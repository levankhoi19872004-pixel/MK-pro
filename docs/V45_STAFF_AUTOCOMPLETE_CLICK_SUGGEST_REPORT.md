# Báo cáo sửa gợi ý NVBH / NVGH khi click vào ô

## Yêu cầu

Với các ô tìm kiếm nhân viên bán hàng và nhân viên giao hàng, khi người dùng click/focus vào khung nhập thì phải hiện gợi ý ngay, không bắt buộc gõ trước 2 ký tự.

## Nội dung đã sửa

### 1. Frontend unified search

File: `public/js/search/unifiedSearchEngine.js`

- Sửa `requestSearch()` để nhận đúng `minChars: 0`.
- `searchSalesStaff()` mặc định cho phép tìm rỗng với `allowEmpty=1`.
- `searchDeliveryStaff()` mặc định cho phép tìm rỗng với `allowEmpty=1`.
- Các nhóm khác như khách hàng/sản phẩm vẫn giữ nguyên nguyên tắc gõ tối thiểu 2 ký tự nếu không cấu hình riêng.

### 2. Autocomplete dùng chung

File: `public/js/app/03-customers-autocomplete.js`

- Với `config.type === 'staff'`, gọi API bằng tùy chọn:

```js
{ limit, minChars: 0, allowEmpty: '1', showOnFocus: '1' }
```

- Autocomplete nhân viên không còn bị chặn bởi điều kiện 2 ký tự.
- Product/customer/debtCustomer vẫn giữ quy tắc hạn chế để tránh load nặng.

### 3. Màn đơn bán

File: `public/js/app/05-sales-orders.js`

- Hàm `getSalesStaffMatches()` cũng cho phép click vào ô NVBH để lấy 20 gợi ý đầu tiên.

### 4. Backend search service

File: `src/services/searchService.js`

- Thêm `allowsEmptyStaffSearch()`.
- `searchStaffs()` chỉ cho tìm rỗng khi có một trong các cờ:

```text
allowEmpty=1
showOnFocus=1
initial=1
```

- Nếu không có cờ này, backend vẫn bảo vệ không cho search rỗng tùy tiện.

## Kết quả mong đợi

### NVBH

Click vào ô nhân viên bán hàng:

```text
→ hiện tối đa 20 nhân viên role sales/NVBH/salesStaff
```

Gõ từ khóa:

```text
→ lọc theo mã / tên / username / SĐT
```

### NVGH

Click vào ô nhân viên giao hàng:

```text
→ hiện tối đa 20 nhân viên role delivery/NVGH/deliveryStaff
```

Gõ từ khóa:

```text
→ lọc theo mã / tên / username / SĐT
```

## Kết quả test

| Nội dung test | Kết quả |
|---|---|
| `node --check public/js/search/unifiedSearchEngine.js` | PASS |
| `node --check public/js/app/03-customers-autocomplete.js` | PASS |
| `node --check public/js/app/05-sales-orders.js` | PASS |
| `node --check src/services/searchService.js` | PASS |
| API staff rỗng không có `allowEmpty` | Trả `[]` để bảo vệ hệ thống |
| API staff rỗng có `allowEmpty=1` | Cho phép trả danh sách nhân viên theo role |

## Ghi chú

Quy tắc mới chỉ mở cho nhân viên bán hàng và nhân viên giao hàng. Không mở đại trà cho sản phẩm/khách hàng để tránh quay lại lỗi load toàn bộ catalog.
