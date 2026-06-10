# V46 - Sales History Compact Toolbar + NVBH Column + Note Search

## Phạm vi sửa
Chỉ khoanh vùng trong màn `#salesTab` - Lịch sử đơn bán.

## File đã sửa

1. `public/index.html`
   - Đổi placeholder tìm kiếm thành: `Tìm mã đơn, khách hàng, ghi chú...`.
   - Thêm cột header `NV bán hàng`.
   - Khoanh vùng bằng comment:
     - `SALES_HISTORY_COMPACT_TOOLBAR_PATCH_START/END`
     - `SALES_HISTORY_NVBH_COLUMN_PATCH_START/END`

2. `public/js/app/05-sales-orders.js`
   - Render thêm cột NV bán hàng.
   - Fallback dữ liệu: `salesStaffName -> staffName -> salesmanName -> salesPersonName -> salesStaffCode -> staffCode -> salesmanCode -> '-'`.
   - Gom KPI thành các chip ngắn trong `salesOrderCount`.
   - Khoanh vùng bằng comment:
     - `SALES_HISTORY_NVBH_COLUMN_PATCH_START/END`
     - `SALES_HISTORY_COMPACT_TOOLBAR_PATCH_START/END`

3. `src/services/orderService.js`
   - Bổ sung tìm kiếm theo ghi chú trong ô `q`:
     - `note`
     - `remark`
     - `description`
   - Khoanh vùng bằng comment:
     - `SALES_HISTORY_NOTE_SEARCH_PATCH_START/END`

4. `public/style.css`
   - Thêm override cuối file, chỉ scoped trong `#salesTab`.
   - Nút `+ Tạo đơn mới` nằm cùng hàng tiêu đề.
   - Ô tìm kiếm chia tỷ lệ `7fr / 3fr`.
   - Bộ lọc + nút bấm gom flex một hàng, tự xuống dòng khi hẹp.
   - Bảng đổi từ 7 cột sang 8 cột để thêm `NV bán hàng`.
   - Sticky header top còn `72px`.
   - Danh sách đơn tăng chiều cao hiển thị: `calc(100vh - 220px)`.

## Kiểm tra kỹ thuật
- `node --check public/js/app/05-sales-orders.js`: OK
- `node --check src/services/orderService.js`: OK
