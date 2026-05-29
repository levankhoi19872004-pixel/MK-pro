# Phase 3.6 fix - Server-side search không giới hạn nguồn dữ liệu

Đã sửa lỗi hiểu nhầm `limit=50` thành giới hạn nguồn dữ liệu.

Nguyên tắc mới:

- Frontend vẫn chỉ nhận tối đa 50 kết quả để UI không đơ.
- Server tìm trên toàn bộ collection MongoDB `products` / `customers`.
- Không tìm trong 50/100 dòng đầu tiên.
- Có fallback tìm không dấu cho dữ liệu cũ chưa có `searchText`.
- Thêm `searchText` cho Product / Customer để các bản ghi tạo/sửa mới tìm nhanh hơn.

Luồng chuẩn:

```text
Nhân viên gõ từ khóa
        ↓
/api/catalog/products/search?q=...
/api/catalog/customers/search?q=...
        ↓
MongoDB tìm toàn bộ collection
        ↓
Server trả tối đa 50 kết quả phù hợp
        ↓
Frontend cache theo từ khóa
```

Lưu ý: `limit=50` là giới hạn số kết quả trả về màn hình, không phải giới hạn số bản ghi được đem ra tìm.
