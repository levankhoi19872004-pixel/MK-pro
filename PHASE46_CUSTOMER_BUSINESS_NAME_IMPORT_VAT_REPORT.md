# PHASE 46 - TÊN HỘ KINH DOANH / IMPORT / VAT

## Phạm vi
- Bổ sung `businessName` vào hồ sơ khách hàng.
- Bổ sung trường trên popup thêm/sửa khách hàng.
- Bổ sung cột `Tên hộ kinh doanh` vào mẫu import khách hàng.
- Hỗ trợ import thường và Cập nhật an toàn, ô trống/cột thiếu giữ nguyên dữ liệu cũ.
- Tìm kiếm theo tên hộ kinh doanh.
- Xuất VAT ưu tiên tên hộ kinh doanh làm tên pháp lý; nếu trống dùng tên khách hàng.
- Báo cáo thông tin khách hàng bổ sung `TenHoKinhDoanh`.

## Tương thích
Đọc các alias cũ: `customerBusinessName`, `householdBusinessName`, `taxBusinessName`, `invoiceBusinessName`, `tenHoKinhDoanh`.
Không cần migration MongoDB. Không thay đổi luồng đơn hàng, tồn kho, công nợ hoặc quỹ.
