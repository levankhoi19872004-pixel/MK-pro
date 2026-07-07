# PHASE179 - VNPT TT78 Template-based VAT Export

## Phạm vi

Sửa riêng chức năng xuất hóa đơn VAT / VNPT TT78.

## Thay đổi chính

- Thêm template VNPT thật tại `templates/vnpt/FileMauHoaDon1Thue_TT78.xlsx`.
- Thêm dependency `exceljs` và không thêm package `xlsx`.
- Tạo service `src/services/invoice/VnptTt78TemplateExportService.js` để clone template VNPT, validate header, clear dữ liệu từ dòng 2 và fill dữ liệu mới.
- Chuyển `buildVatInvoiceTT78Workbook()` sang dùng template service thay vì tự dựng `Sheet1` bằng `createWorkbook()`/`appendAoaSheetToWorkbook()`.
- Giữ nguyên export không VAT dùng writer cũ, không sửa lan.
- Cập nhật source fragments và build lại generated file `src/services/importExportLegacy.service.js`.
- Cập nhật test bảo vệ contract template VNPT và workbook VAT.

## Header VNPT được validate

Các cell trọng yếu được validate theo file mẫu thật:

- `S1 = TyLeChietKhau`
- `AD1 = Fkey`
- `AS1 = LDDNBo`
- `AT1 = HDSo`
- `AU1 = HVTNXHang`
- `AV1 = TNVChuyen`
- `AW1 = PTVChuyen`
- `AX1 = HDKTNgay`
- `AY1 = HDKTSo`
- `AZ1 = CCCDan`
- `BC1 = mau_01`

Lưu ý: template VNPT thật đang có `A1 = STT`, `B1 = NgayHoaDon`, `C1 = MaKhachHang`, nên validation được căn theo file mẫu thật chứ không tự đổi header.

## Ghi dữ liệu

- `Fkey` được ghi bằng mã đơn và không để trống trên dòng sản phẩm.
- Các mã quan trọng như `MaKhachHang`, `MaSoThue`, `DienThoaiKhachHang`, `MaSanPham`, `Fkey` được ép định dạng text (`numFmt = '@'`).
- `Extra1SP` và `Extra2SP` tiếp tục lấy từ catalog enrichment (`Quy cách`, `Giá bán`).
- Sheet `DoiChieu` và `ThongTin` vẫn được tạo để audit nội bộ, không ảnh hưởng `Sheet1`.

## Lệnh đã chạy

```bash
npm install exceljs@^4.4.0 --package-lock-only --ignore-scripts
npm install --ignore-scripts
npm run source-bundles:refresh
npm run check:source-bundles
node --test test/invoice-export-workbook.test.js test/invoice-export-full-return-workbook.test.js test/invoice-export-restoration-static.test.js
npm run check:syntax
npm test
```

## Kết quả kiểm tra

- `npm run check:source-bundles`: PASS.
- `npm run check:syntax`: PASS, `SYNTAX_OK 1292 JavaScript files`.
- `npm run check:lock-registry`: PASS, mọi tarball URL đều dùng `registry.npmjs.org`.
- Targeted invoice tests: PASS, 7/7.
- `npm test`: đến thời điểm bị môi trường dừng do timeout, log ghi nhận 141/141 subtests PASS, 0 fail; process test runner chưa thoát trước timeout của sandbox.

## Rủi ro còn lại

- Cần upload thử file export thật lên VNPT bằng dữ liệu production để xác nhận rule validate riêng của VNPT ngoài cấu trúc template.
- File mẫu VNPT có shared formulas trong các dòng mẫu; service hiện clear value từ dòng 2 trở xuống thay vì splice row để không làm hỏng shared formula metadata khi ExcelJS ghi lại workbook.
