# PHASE 50 — DEPLOYMENT CHECKLIST

## Trước deploy

- [ ] Tạo backup MongoDB hiện tại.
- [ ] Deploy ngoài giờ NVBH đang tạo đơn.
- [ ] Xác nhận MongoDB Atlas hỗ trợ transaction.
- [ ] Thiết lập `ENABLE_DMS_APP_SALE_QUOTA=true`.
- [ ] Thiết lập `DMS_INVENTORY_UPLOAD_MAX_BYTES=10485760` hoặc giá trị phù hợp.

## Sau deploy

- [ ] Chờ/kiểm tra log tạo index mới.
- [ ] Đăng nhập Admin → Tồn kho → Đối chiếu tồn DMS.
- [ ] Tải file DMS buổi sáng và xem Preview.
- [ ] Kiểm tra số SKU, DMS > thực tế, thực tế > DMS, mã lỗi/quy cách.
- [ ] Bấm xác nhận commit trước khi NVBH bắt đầu tạo đơn.
- [ ] Mở App bán hàng, hard refresh trình duyệt.
- [ ] Tìm một SKU có `Thực tế > DMS`; xác nhận hiển thị tồn thật và số được bán App.
- [ ] Tạo đơn thử số lượng nhỏ; xác nhận cả tồn và `Còn bán App` cùng giảm.
- [ ] Thử vượt hạn mức; API phải trả 409 và không tạo đơn.
- [ ] Xóa đơn thử; xác nhận tồn và hạn mức cùng hoàn.

## Rollback khẩn cấp

Đặt:

```env
ENABLE_DMS_APP_SALE_QUOTA=false
```

Sau đó restart service. App sẽ cho bán theo tồn thực tế và không trừ quota. Không cần xóa dữ liệu snapshot/hạn mức.

## Lưu ý vận hành hằng ngày

1. Mỗi sáng tải file DMS mới.
2. Preview trước, chỉ commit khi số dòng/mã/quy cách hợp lý.
3. File mới thay thế hạn mức cũ, không cộng dồn.
4. Không dùng chức năng đối chiếu để ghi đè tồn kho.
5. Nếu chưa commit file mới, hạn mức lần gần nhất vẫn đang hoạt động; quản lý cần quyết định có cho App tiếp tục bán hay tạm khóa bằng feature flag.
