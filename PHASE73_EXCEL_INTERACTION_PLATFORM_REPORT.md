# PHASE 73 — EXCEL INTERACTION PLATFORM

## 1. Tổng quan dự án

- Kiến trúc: Node.js/Express monolith, MongoDB/Mongoose, frontend JavaScript thuần.
- Quy mô khảo sát: 969 file, 678 file JavaScript, khoảng 5.5 MB chưa gồm `node_modules`.
- Nền tảng Excel sẵn có: `src/utils/excelWriter.util.js` và luồng preview/commit import session.
- Mục tiêu Phase 73: đưa trải nghiệm thao tác nhanh kiểu S3 vào V45 mà không tạo luồng ghi dữ liệu mới đi vòng nghiệp vụ hiện tại.

## 2. Phạm vi đã triển khai

### 2.1 Spreadsheet Grid dùng chung

Thêm component:

- `public/js/components/excel-interaction/SpreadsheetGrid.js`
- `public/js/components/excel-interaction/ExcelFeatureBindings.js`
- `public/css/90-excel-interaction.css`

Khả năng:

- Paste một ô, một cột hoặc nhiều hàng/cột từ Excel bằng Ctrl+V.
- Phân tách theo tab và xuống dòng.
- Giữ mã dạng text, gồm mã có số 0 ở đầu.
- Tự thêm dòng khi vùng paste lớn hơn số dòng hiện có.
- Điều hướng bằng Tab/Shift+Tab/Enter.
- Đánh dấu lỗi ngay tại ô.
- Giới hạn tối đa 5.000 dòng cho import dữ liệu và 2.000 dòng hàng chứng từ.

Áp dụng tại:

- Import dữ liệu tổng quát.
- Dòng hàng đơn bán.
- Dòng hàng phiếu nhập.

### 2.2 Menu chuột phải và xuất Excel

Thêm component `ContextExport.js` và API `POST /api/excel/export`.

Hỗ trợ tại:

- Danh sách đơn con.
- Danh sách đơn tổng.
- Danh sách phiếu nhập.
- Bảng preview import.
- Bảng Trung tâm báo cáo.

Menu cung cấp:

- Sao chép ô.
- Sao chép dòng.
- Xuất dòng đang chọn.
- Xuất các dòng đã chọn.
- Xuất trang/dữ liệu đã tải.
- Xuất toàn bộ theo bộ lọc.
- Xuất dữ liệu đã chọn kèm chi tiết.

### 2.3 Workbook nhiều sheet

- Đơn con: `ThongTin`, `DanhSachDon`, `ChiTietSanPham`.
- Đơn tổng: `ThongTin`, `DonTong`, `DonCon`, `SanPham`.
- Phiếu nhập: `ThongTin`, `PhieuNhap`, `ChiTietHangNhap`.
- Preview import: `ThongTin`, `TatCa`, `HopLe`, `Loi`.
- Báo cáo: `ThongTin`, `BaoCao`, `TongHop`.

## 3. Thiết kế kỹ thuật

### Backend

- `src/services/excel/ExcelInteractionService.js`: registry/dispatcher cho từng loại export, flatten dữ liệu, sinh workbook, giới hạn số dòng, chống formula injection.
- `src/controllers/excelInteractionController.js`: trả file XLSX và xử lý lỗi chuẩn.
- `src/routes/excelInteractionRoutes.js`: RBAC cho export, preview paste và đối chiếu sản phẩm.
- `src/services/excelImportService.js`: `previewPastedRows()` tái sử dụng chính luồng `buildPreviewFromRows()` và import session hiện có.
- `src/services/reports/ReportCenterService.js`: cho phép service nội bộ xuất tối đa 50.000 dòng; query HTTP dạng chuỗi không thể bật nhánh này.

### Data flow paste import

```text
Excel clipboard
  -> SpreadsheetGrid
  -> POST /api/excel/import/preview
  -> buildPreviewFromRows
  -> ImportSession + ImportSessionRows
  -> renderImportPreview
  -> commit import hiện có
```

Không tạo endpoint commit mới và không bỏ qua validation nghiệp vụ cũ.

### Data flow xuất Excel

```text
Chuột phải / nút xuất
  -> payload whitelist (type, scope, filters, selectedIds)
  -> ExcelInteractionService
  -> query lại dữ liệu theo quyền
  -> workbook nhiều sheet
  -> tải XLSX
```

## 4. Bảo mật và toàn vẹn

- RBAC ở route.
- Whitelist loại export; không nhận Mongo query trực tiếp từ frontend.
- Tối đa 2.000 ID được chọn và 50.000 dòng export.
- Tối đa 1.000 mã sản phẩm mỗi lần đối chiếu.
- Chặn Excel Formula Injection cho giá trị bắt đầu bằng `=`, `+`, `-`, `@`.
- Export ghi audit `EXPORT_EXCEL_CONTEXT`.
- Paste preview ghi audit `IMPORT_PASTE_PREVIEW`.
- Preview paste dùng cùng validation/import session với import file.
- Không thay đổi schema MongoDB và không cần migration.

## 5. Tối ưu hiệu năng

- Đối chiếu sản phẩm theo batch, không query từng dòng.
- Hydrate chi tiết đơn bán theo batch 500 ID để tránh N+1.
- Chỉ xuất chi tiết khi người dùng chọn tùy chọn kèm chi tiết.
- Export bị chặn ở 50.000 dòng để tránh tăng RAM không kiểm soát.
- Frontend chỉ cập nhật grid tại vùng thao tác, không tạo request theo từng ô.

## 6. Ảnh hưởng hệ thống

### Được thay đổi

- UI bán hàng, phiếu nhập, import dữ liệu và báo cáo.
- Thêm route/service Excel độc lập.
- Mở rộng report service cho export nội bộ.

### Không thay đổi

- Contract tạo/sửa/xóa đơn.
- InventoryPostingService.
- Luồng post nhập kho.
- Luồng commit import hiện tại.
- Schema collection.
- Công thức giá, khuyến mại và tồn kho.

## 7. Rủi ro còn lại

- Export 50.000 dòng vẫn tạo workbook trong RAM; phù hợp quy mô hiện tại nhưng chưa phải background streaming job.
- Trải nghiệm chọn vùng nhiều ô như Excel đầy đủ chưa được triển khai; Phase 73 hỗ trợ paste vùng, chọn dòng và chuột phải theo ô/dòng.
- Cần kiểm tra E2E trên trình duyệt thật với dữ liệu production clone, đặc biệt file Excel lớn và quyền từng role.

## 8. Phương án

### Phương án A — Đã áp dụng

Nền tảng dùng chung gồm Spreadsheet Grid, Context Menu, Export Registry và API batch.

- Lợi ích: đồng nhất, tái sử dụng, không lặp code theo module.
- Nhược điểm: số file nền tảng nhiều hơn phương án vá riêng.
- Effort: Hard.
- Rủi ro: Trung bình, đã giảm bằng RBAC, giới hạn dữ liệu và regression test.

### Phương án B — Không áp dụng

Thêm export/paste riêng lẻ cho từng màn hình.

- Lợi ích: làm nhanh ở một màn hình.
- Nhược điểm: logic trùng, định dạng lệch nhau, khó bảo trì và khó kiểm soát bảo mật.
- Effort: Medium.
- Rủi ro dài hạn: Cao.

## 9. Kiểm thử

- `node --check`: 14/14 file JavaScript trực tiếp thay đổi đạt.
- Test trọng điểm: 19/19 đạt.
- Test behavior thực tế: formula injection, thùng/lẻ, khuyến mại, flatten đơn tổng và tạo buffer XLSX đạt.
- Kiểm tra ID HTML: 618 ID, không có ID trùng.
- `npm ci`: cài 146 package thành công.
- Full `npm test`: đã khởi chạy nhưng môi trường dừng do giới hạn 300 giây sau 8 test đầu đều đạt; không tuyên bố full suite hoàn tất.
- Script syntax toàn dự án cũng vượt giới hạn thời gian; các file sửa trực tiếp đều đã kiểm tra riêng.
