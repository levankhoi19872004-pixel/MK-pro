# V45 Batch Post AR - 15 bước tối ưu đẩy sang AR

## Mục tiêu

Tối ưu nút `Đẩy đơn đã chọn sang công nợ` từ kiểu xử lý từng đơn sang batch:

- Lấy dữ liệu một lần.
- Build AR Ledger trong RAM.
- Ghi `arLedgers` bằng `insertMany`.
- Cập nhật đơn bằng `bulkWrite`.
- Không thay đổi nguyên tắc công nợ: AR Ledger là nguồn duy nhất.

## Các bước đã thực hiện

1. Xác định API đang đẩy AR: `POST /api/master-orders/delivery-today/confirm-accounting`.
2. Thêm batch helper trong `src/services/masterOrderService.js`.
3. Lọc đúng danh sách đơn được tick, không tự đẩy cả ngày khi thiếu selection.
4. Gom dữ liệu đơn con được chọn trong RAM.
5. Lấy `returnOrders` liên quan bằng `$in` qua `findReturnOrdersForDeliveryChildren()`.
6. Lấy AR Ledger đã tồn tại một lần để chặn post trùng.
7. Build đủ các dòng AR trong RAM: `ar_sale`, `ar_receipt`, `ar_bonus`, `ar_return`.
8. Ghi AR Ledger bằng `MongoStore.arLedgers.insertMany(..., { ordered:false })`.
9. Cập nhật đơn con bằng `MongoStore.salesOrders.bulkWrite()`.
10. Không cộng/trừ trực tiếp `customer.currentDebt`; công nợ vẫn lấy từ `SUM(debit-credit)` của AR Ledger.
11. Route/controller giữ nguyên API cũ, frontend không cần đổi endpoint.
12. Response vẫn trả `confirmedOrders`, `skippedOrders`, `totalOrders`.
13. Bổ sung index Mongo cho `arLedgers`, `returnOrders`, `masterOrders`.
14. Giữ 5 quy tắc chống sai công nợ: chỉ post khi delivered, không post lặp, sửa sau post phải reversal, hàng trả chỉ vào AR khi kế toán xác nhận, receipt là credit.
15. Kiểm tra các ca logic: chưa thu tiền, thu tiền mặt/chuyển khoản, trả thưởng, hàng trả, bấm xác nhận lại lần nữa.

## Luồng công nợ sau sửa

### Đơn xác nhận lần đầu

```text
selected delivery orders
→ kiểm tra delivered
→ kiểm tra chưa có AR active
→ build AR rows
→ insertMany arLedgers
→ bulkWrite salesOrders: accountingConfirmed=true, accountingLocked=true, arStatus=ar_posted/paid
```

### Đơn đã admin mở khóa điều chỉnh

```text
needReAccounting=true
→ reverseActiveArLedgersForOrder()
→ postDeliveryArLedgerRowsAfterReAccounting()
→ bulkWrite khóa lại đơn
```

## Kiểm tra đã chạy

- `node -c src/services/masterOrderService.js`: OK
- `node -c src/services/mongoIndexService.js`: OK
- `node -c src/controllers/masterOrderController.js`: OK
- `node -c src/routes/masterOrderRoutes.js`: OK
- `node -c public/js/app/06-master-delivery.js`: OK
- `npm run docs:generate`: OK
- `npm test`: chạy được 9/12 test. 3 test còn lại không liên quan phần AR batch:
  - 1 test product stock display đang sai kỳ vọng cũ.
  - 2 test sales-order-flow timeout do cần kết nối MongoDB thật.
