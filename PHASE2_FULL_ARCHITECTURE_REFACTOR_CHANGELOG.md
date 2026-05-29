# PHASE 2 Full Architecture Refactor

## Đã thay đổi

- Giữ `server.js` siêu mỏng: chỉ nạp `.env`, gọi `startServer`.
- Làm mỏng `src/app.js`: chỉ export `app` và `startServer`.
- Chuyển phần app legacy lớn sang `src/legacy/legacyApp.js` để cô lập code cũ.
- Bổ sung khung kiến trúc chuẩn V45:
  - `src/routes`
  - `src/controllers`
  - `src/services`
  - `src/engines`
  - `src/middlewares`
  - `src/config`
  - `src/models`
- Thêm các engine nền: posting, inventory, debt, promotion, delivery.
- Giữ nguyên API/UI cũ để tránh lỗi frontend sau refactor.

## Ghi chú quan trọng

Đây là bước refactor an toàn: code legacy được cô lập thay vì xóa hoặc tách nóng toàn bộ handler trong một lần.
Để đạt clean architecture tuyệt đối, bước tiếp theo là bóc từng nhóm route từ `src/legacy/legacyApp.js` sang `routes/controllers/services` theo thứ tự:

1. products
2. customers
3. stock/import-orders
4. sales-orders/master-orders
5. debts/receipts/returns
6. promotions
7. mobile delivery/sales

Cách này tránh vỡ hệ thống đang chạy trên Render.
