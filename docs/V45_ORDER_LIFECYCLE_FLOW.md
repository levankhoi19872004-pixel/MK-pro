# V45 order lifecycle adjustment

Luồng chuẩn đã chốt:

Đơn bán hàng
→ Tạo đơn tổng
→ Đẩy sang app giao hàng
→ Chốt giao hàng hoàn thành
→ Tính công nợ theo từng đơn
→ Chuyển sang sổ công nợ
→ Thu nợ theo đúng đơn
→ Hết nợ / còn nợ

Các điểm đã chỉnh:
- Đơn bán mới tạo chưa đưa vào công nợ AR.
- Khi tạo đơn tổng, đơn con chuyển sang trạng thái giao hàng `assigned_delivery`, AR chưa ghi.
- Khi chốt giao hàng hoàn thành, hệ thống tính công nợ còn lại:
  Công nợ = Phải thu - Tiền mặt - Chuyển khoản - Trả thưởng - Hàng trả
- Chỉ sau khi giao hoàn thành mới ghi AR Ledger theo số công nợ còn lại.
- Nếu công nợ còn lại = 0, bút toán AR-SALE được upsert về 0 để đơn không còn nằm trong công nợ.
- Thu nợ sau giao phải phân bổ theo orderId/orderCode; phiếu thu cập nhật debtAmount/arBalance của đúng đơn.
- Khi hết nợ, đơn chuyển `arStatus = paid`, `lifecycleStatus = paid`.
- Báo cáo công nợ không backfill ảo cho đơn chưa giao xong.
