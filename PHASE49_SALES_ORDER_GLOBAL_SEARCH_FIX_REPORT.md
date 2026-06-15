# Phase 49 — Sửa tìm kiếm đơn bán chỉ trong 50 dòng đầu

## Triệu chứng

Khi chọn NVBH `35093`, màn Lịch sử đơn bán báo tổng 63 đơn nhưng chỉ hiển thị 1 đơn và ghi `Chặn sai NVBH 49`. Những đơn khác của cùng NVBH vẫn thấy khi bỏ bộ lọc.

## Nguyên nhân gốc

Ứng dụng bật `mongoose.set('strictQuery', true)` nhưng model `SalesOrder` chưa khai báo `salesStaffCode` và các alias NVBH. Mongoose vì vậy loại điều kiện NVBH khỏi câu query trước khi Mongo chạy `skip/limit`.

Luồng lỗi:

```text
Chọn NVBH 35093
→ backend tạo filter salesStaffCode=35093
→ Mongoose strictQuery loại field chưa khai báo
→ Mongo trả 50 đơn đầu tiên không lọc NVBH
→ frontend chỉ giữ các dòng trùng 35093 trong 50 dòng đó
→ client guard khóa nút tải thêm
→ các đơn ở trang sau không thể xuất hiện
```

## Thay đổi

- `src/models/SalesOrder.js`
  - Khai báo đầy đủ các field dùng để tìm kiếm, đặc biệt `salesStaffCode` và alias lịch sử.
  - Alias mã dùng kiểu `Mixed` để đọc được cả mã string và mã number cũ.
- `src/services/orderLegacy.service.js`
  - Lọc exact mã NVBH trên Mongo trước `skip/limit`.
  - Khi `includeStaffAliases=1`, đọc các alias: `salesPersonCode`, `salesmanCode`, `nvbhCode`, `maNVBH`, `salesStaff.code`.
  - Không tìm theo tên, username, `id` hoặc `_id` khi đã có mã.
- `public/js/app/05-sales-orders.js`
  - Client guard không còn vô hiệu hóa phân trang.
- `public/index.html`
  - Đổi cache key script sang `phase49-sales-order-global-search-v1`.

## Kỳ vọng

- Tìm NVBH chạy trên toàn bộ tập đơn trong khoảng ngày, không phụ thuộc 50 dòng đang hiển thị.
- `total`, `rows`, `hasMore` dùng cùng một Mongo filter.
- Không còn chỉ số `Chặn sai NVBH 49` trong luồng bình thường.
