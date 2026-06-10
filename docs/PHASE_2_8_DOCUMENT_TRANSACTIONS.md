# Phase 2.8 - Transaction cho toàn bộ chứng từ

Mục tiêu: mọi nghiệp vụ tạo/sửa/hủy chứng từ quan trọng phải chạy trong một MongoDB transaction, để tránh trạng thái nửa vời như đã tạo chứng từ nhưng chưa ghi sổ tiền/công nợ, hoặc đã gộp đơn tổng nhưng đơn con chưa cập nhật.

## Đã bọc transaction

- Sales Orders
  - Tạo đơn bán
  - Sửa đơn bán
  - Hủy đơn bán

- Master Orders
  - Tạo đơn tổng + cập nhật toàn bộ đơn con
  - Hủy đơn tổng + nhả toàn bộ đơn con

- Import Orders
  - Tạo phiếu nhập
  - Sửa phiếu nhập

- Return Orders
  - Tạo phiếu trả hàng

- Receipts / Payments / Cashbook / Bankbook
  - Tạo phiếu thu + ghi bút toán công nợ + ghi sổ quỹ/sổ ngân hàng
  - Hủy phiếu thu + void bút toán liên quan + void sổ quỹ/sổ ngân hàng liên quan
  - Tạo phiếu sổ quỹ thủ công

## Repository đã nhận session

Các repository dùng `mongoCollection.repository` đã truyền được `{ session }` xuống `findOneAndUpdate`, `insertMany`, `deleteMany`.

Đã bổ sung session cho:

- `masterOrderRepository.upsert(masterOrder, { session })`
- `paymentRepository.upsert(payment, { session })`

## Nguyên tắc sau Phase 2.8

Không tạo nghiệp vụ chứng từ mới bằng nhiều lệnh ghi rời rạc ngoài transaction. Mẫu chuẩn:

```js
await withMongoTransaction(async (session) => {
  await documentRepository.upsert(document, { session });
  await journalRepository.upsert(journal, { session });
  await cashbookRepository.upsert(cashEntry, { session });
});
```

## Lưu ý triển khai

MongoDB transaction yêu cầu MongoDB chạy dạng replica set. MongoDB Atlas hỗ trợ sẵn. Nếu chạy local standalone cũ, cần bật replica set hoặc dùng Atlas/Render Mongo URI phù hợp.
