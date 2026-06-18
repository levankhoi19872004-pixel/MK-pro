# PHASE80 — BƯỚC 3: MODULE NGHIỆP VỤ MỞ RỘNG

## 1. Mua hàng và công nợ nhà cung cấp

Luồng:

```text
Đơn mua nháp → Duyệt → Nhận hàng
→ Inventory Posting → AP Ledger/Balance → Outbox
```

Đã có:

- Đơn mua và duyệt đơn.
- Nhận từng phần hoặc nhận đủ.
- Phiếu nhập hàng.
- Công nợ nhà cung cấp dạng ledger.
- Balance projection nguyên tử chống thanh toán vượt nợ khi có request đồng thời.
- Thanh toán tiền mặt/chuyển khoản và ghi quỹ OUT.
- Trả hàng bắt buộc tham chiếu phiếu nhập.
- Chặn trả sản phẩm không thuộc phiếu nhập và chặn trả vượt số lượng còn lại.
- Báo cáo số dư nợ và tiền nhà cung cấp phải hoàn lại.

API chính:

- `GET/POST /api/purchase/orders`
- `POST /api/purchase/orders/:id/approve`
- `POST /api/purchase/orders/:id/receive`
- `GET /api/purchase/receipts`
- `GET/POST /api/purchase/returns`
- `GET /api/purchase/payables`
- `POST /api/purchase/payments`

## 2. Kho nâng cao

- Giữ tồn theo chứng từ.
- Giải phóng giữ tồn có kiểm tra lệch reserved balance.
- Kiểm kê và điều chỉnh tồn qua `InventoryPostingService`.
- Không cho người dùng gắn nhãn “consumed” mà chưa có stock posting tương ứng.

## 3. Báo cáo projection

Projection mới:

- Doanh số ngày theo NVBH.
- Tồn kho theo kho.
- Công nợ khách hàng theo ngày.

Operational collection không bị thay bằng reporting collection; projection chỉ phục vụ đọc nhanh.

## 4. Tuyến bán hàng

- Lập kế hoạch ghé khách hàng.
- Check-in với vị trí.
- Hoàn thành/no-sale, ghi lý do, khảo sát và ảnh.
- Cập nhật trạng thái kế hoạch trong cùng transaction.

## 5. Điều hành giao hàng

- Lập tuyến theo độ ưu tiên, khu vực, khung giờ và khách hàng.
- Kiểm tra tải trọng xe.
- Theo dõi trạng thái từng điểm giao.
- Cập nhật kế hoạch qua Command Pipeline.

## Feature flag

Tất cả module trên tắt mặc định và chỉ bật sau migration/index/smoke test.
