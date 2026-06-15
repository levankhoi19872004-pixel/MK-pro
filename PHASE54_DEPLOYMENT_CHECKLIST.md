# PHASE 54 — Deployment checklist

## A. Deploy mã nguồn

1. Upload/push bản Phase 54.
2. Chờ Render build và restart hoàn tất.
3. Xác nhận log không có lỗi syntax hoặc lỗi kết nối MongoDB.

## B. Chuẩn hóa dữ liệu trả hàng

Chạy dry-run trước:

```bash
npm run migrate:return-state:dry
```

Kiểm tra JSON kết quả, đặc biệt các trường:

- `scanned`
- `changed`
- `legacyGrouped`
- `targetStates.waiting_receive`

Sau đó mới ghi dữ liệu:

```bash
npm run migrate:return-state
```

Migration không post tồn kho và không sinh AR; chỉ chuẩn hóa trạng thái.

## C. Làm mới giao diện

1. Mở trang quản trị.
2. Nhấn `Ctrl + F5`.
3. Vào **Đơn tổng trả hàng**.
4. Bấm **Tải lại**.

## D. Kiểm tra nghiệp vụ bắt buộc

### Đơn chưa nhập kho, dữ liệu cũ `grouped`

- Chọn đơn như `DTH00006`.
- Bấm **Nhập kho**.
- Kỳ vọng: API `200`, phiếu con chuyển sang `received`, tồn kho cộng đúng một lần.

### Đơn đã nhập kho

- Gọi lại nhập kho đơn như `DTH00007` nếu đơn đã nhận trước đó.
- Kỳ vọng: trả thông báo đã nhận kho trước đó; không báo “đã hủy/xóa”; không cộng tồn thêm.

### Đơn đã hủy/xóa

- Kỳ vọng: không chọn được checkbox.
- “Chọn tất cả” không tích đơn này.
- API vẫn chặn nếu gửi request thủ công.

### Kiểm tra tồn kho

Đối chiếu `stockTransactions` theo:

```text
refType = RETURN_ORDER
refId = id phiếu trả hàng con
```

Mỗi sản phẩm/phiếu chỉ có một movement hợp lệ theo idempotency key.

## E. Kiểm tra hồi quy

- Tạo đơn tổng trả mới: phiếu con có `returnState = waiting_receive` và `returnMergeStatus = merged`.
- Hủy đơn tổng chưa nhập kho: phiếu con quay về `waiting_receive + unmerged`.
- Xác nhận kế toán chỉ thực hiện sau trạng thái `received`.
- AR-RETURN không được sinh tại bước nhận kho.
