# PHASE145 - Import paste source/session fix

## Phạm vi
- Module: Import dữ liệu Excel.
- Mục tiêu: dữ liệu dán trực tiếp từ Excel phải đi qua cùng luồng preview/session/commit như file Excel, không còn bị chặn bởi kiểm tra file input.

## Root cause
Frontend đã gọi được endpoint preview dữ liệu dán và backend đã tạo `importSessionId`, nhưng luồng commit vẫn kiểm tra cứng `importExcelFile.files.length`. Vì vậy sau preview bằng paste, nút import vẫn báo `Bạn chưa chọn file Excel` dù đã có session và các dòng hợp lệ.

## Thay đổi frontend
- Chuẩn hóa state nguồn import:
  - `currentImportSource = 'file' | 'paste' | 'none'`
  - `currentImportSourceLabel`
  - `importPreviewSessionId`
  - `importPreviewRows`
- `renderImportPreview()` tự nhận biết nguồn `clipboard-paste` và hiển thị:
  - `Nguồn dữ liệu: Dán trực tiếp từ Excel`
  - hoặc `Nguồn dữ liệu: File Excel: <tên file>`
- `commitImportExcel()` không còn yêu cầu file input sau khi đã có preview/session hợp lệ.
- Nút `Import các dòng đã chọn` chỉ yêu cầu:
  - có loại import,
  - có preview/session,
  - có dòng hợp lệ được chọn.
- Đổi thông báo lỗi sang trung lập khi chưa có preview:
  - `Chưa có dữ liệu preview. Vui lòng chọn file Excel hoặc dán dữ liệu từ Excel rồi bấm Đọc dữ liệu.`
- Khi đổi loại import hoặc đổi file, preview/session paste cũ được clear để tránh import nhầm.

## Backend/parser/session
- Backend paste preview hiện đã có sẵn endpoint `/api/excel/import/preview`.
- Endpoint này dùng `previewPastedRows()`, tạo `ImportSession`, lưu preview rows bằng `savePreviewResult()`, và trả `source: 'clipboard-paste'`.
- Không tạo endpoint mới vì endpoint hiện tại đã đúng contract và dùng chung commit pipeline `/api/import/sessions/:sessionId/commit`.

## File đã sửa
- `public/js/app/admin/08d-import-excel.source/part-01.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-02.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-03.jsfrag`
- `public/js/app/admin/08d-import-excel.js`
- `public/js/app/admin/08d-import-excel.part02.js`
- `public/js/app/admin/08d-import-excel.part03.js`
- `public/js/components/excel-interaction/ExcelFeatureBindings.js`
- `public/fragments/index/06-index-body.html`
- `config/source-bundles.json`
- `test/import-paste-source-state-static.test.js`

## Test đã chạy
PASS:
- `npm run check:syntax`
- `npm run check:source-bundles`
- `node --test test/import-paste-source-state-static.test.js`

Đã chạy `npm test`: nhiều suite đã PASS, nhưng bị timeout trong sandbox trước khi hoàn tất toàn bộ. Không ghi nhận fail liên quan import paste trong phần log đã chạy.

Ghi nhận ngoài phạm vi: `npm run check:source-size` vẫn fail ở các file import lớn đã vượt budget từ các phase trước, không xử lý trong phase này để tránh refactor lan.

## Hướng dẫn thao tác UI
### Import bằng file Excel
1. Chọn loại import.
2. Chọn file Excel.
3. Bấm nút xem trước/import để tạo preview.
4. Chọn dòng hợp lệ.
5. Bấm `Import các dòng đã chọn`.

### Import bằng dán trực tiếp từ Excel
1. Chọn loại import.
2. Bấm `Dán trực tiếp từ Excel`.
3. Dán dữ liệu vào bảng popup.
4. Bấm `Kiểm tra và tạo bản xem trước`.
5. Kiểm tra dòng hợp lệ/lỗi trên màn import.
6. Chọn dòng hợp lệ.
7. Bấm `Import các dòng đã chọn`.

Không cần chọn file Excel khi đã tạo preview từ dữ liệu dán.
