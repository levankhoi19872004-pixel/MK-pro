# V45 - Sửa autocomplete Khách hàng màn Tạo đơn bán

## Mục tiêu

Ô **Khách hàng** trong màn **Tạo đơn bán hàng** phải hoạt động giống ô **NVBH/NVGH**:

- Click/focus vào ô là hiện gợi ý ngay.
- Gõ từ khóa thì lọc theo mã khách, tên khách, số điện thoại, tuyến/địa chỉ.
- Dữ liệu phải lấy từ nguồn chuẩn `customers` qua Unified Search API.
- Không phụ thuộc `customersCache` frontend cũ.

---

## Nội dung đã sửa

### 1. Backend `searchService.searchCustomers()`

File:

```text
src/services/searchService.js
```

Đã thêm cơ chế cho phép tìm khách hàng khi `q` rỗng nếu client truyền:

```text
allowEmpty=1
showOnFocus=1
initial=1
```

Luồng mới:

```text
q rỗng + allowEmpty=1
→ trả 20 khách hàng đầu tiên từ collection customers

q có dữ liệu >= 2 ký tự
→ lọc theo mã/tên/sđt/tuyến/địa chỉ
```

---

### 2. Frontend `unifiedSearchEngine.searchCustomer()`

File:

```text
public/js/search/unifiedSearchEngine.js
```

Đã sửa `searchCustomer()` mặc định hỗ trợ click/focus:

```js
searchCustomer(keyword, {
  minChars: 0,
  allowEmpty: '1',
  showOnFocus: '1',
  limit: 20
})
```

---

### 3. Autocomplete config dùng chung

File:

```text
public/js/app/03-customers-autocomplete.js
```

Đã sửa:

- `config.type === 'customer'` gọi `UnifiedSearchEngine.searchCustomer()` với `allowEmpty=1`.
- Không còn coi customer là nhóm bắt buộc gõ tối thiểu 2 ký tự.
- Click/focus vào ô khách hàng sẽ gọi API và render dropdown.

---

### 4. Màn bán hàng

File:

```text
public/js/app/05-sales-orders.js
```

Đã sửa:

- `getSalesCustomerMatches()` gọi Unified Search với `minChars:0`.
- `renderSalesCustomerSelect()` không phụ thuộc `customersCache` để bật/tắt input nữa.
- Placeholder đổi thành:

```text
Bấm để chọn hoặc gõ mã/tên/sđt/tuyến khách hàng...
```

---

## Kết quả mong muốn

Khi click ô khách hàng:

```text
4501808 | Chị Thuận | Kiến Xương
4501810 | Anh Hùng | Tiền Hải
4501820 | Chị Lan | Đông Hưng
```

Khi chọn khách hàng:

```text
salesCustomerSelect = customer id/code
salesCustomerSearch = nhãn khách hàng
customerCode/customerName được dùng khi lưu đơn
```

---

## Test đã chạy

### PASS

```bash
node --check src/services/searchService.js
node --check public/js/search/unifiedSearchEngine.js
node --check public/js/app/03-customers-autocomplete.js
node --check public/js/app/05-sales-orders.js
```

Kết quả: **PASS**.

---

## Checklist test thủ công sau khi deploy

1. Mở màn Bán hàng.
2. Click vào ô Khách hàng.
3. Phải hiện tối đa 20 khách hàng.
4. Gõ mã khách hàng → lọc đúng.
5. Gõ tên khách hàng → lọc đúng.
6. Gõ số điện thoại → lọc đúng.
7. Gõ tuyến/địa chỉ → lọc đúng.
8. Chọn khách hàng → ô khách hàng hiện nhãn, hidden id/code được gán.
9. Tạo đơn bán → đơn lưu đúng customerCode/customerName.
