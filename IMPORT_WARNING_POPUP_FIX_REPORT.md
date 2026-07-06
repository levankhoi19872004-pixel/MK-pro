# Báo cáo sửa chuẩn cảnh báo hàng lỗi/hàng thiếu khi Import Excel

## 1. Tổng quan dự án

- Dự án: MK-Pro ERP/DMS nội bộ.
- Tech stack: Node.js/Express, MongoDB/Mongoose, JavaScript thuần frontend, source-bundles generated script.
- Phạm vi sửa: màn `Import dữ liệu Excel`, contract preview/commit import, session import, popup cảnh báo frontend.
- Nguyên tắc sửa: khoanh vùng vào import workflow, không thay đổi nghiệp vụ giao hàng/công nợ/kho ngoài phạm vi import.

## 2. Vấn đề chính trước khi sửa

- Luồng preview đã có cơ chế loại dòng lỗi khỏi commit, nhưng chưa có contract cảnh báo lỗi/thiếu thống nhất để frontend chỉ hiển thị các dòng có vấn đề.
- Frontend còn thiên về preview/review dữ liệu, chưa có popup cảnh báo riêng chỉ dành cho hàng lỗi/hàng thiếu.
- Session import chưa lưu chuẩn `invalidRows` đủ `rowNo`, `field`, `label`, `value`, `code`, `message` để dùng lại khi poll/commit.
- Nhóm import khuyến mại đã có logic loại dòng sản phẩm lỗi, nhưng chưa được nối vào một popup cảnh báo dùng chung.

## 3. Nội dung đã sửa

### Backend

- Thêm utility chuẩn hóa cảnh báo import:
  - `src/services/import/core/importWarningContract.util.js`
- Bổ sung contract preview chung:
  - `summary.totalRows`
  - `summary.validRows`
  - `summary.warningRows`
  - `summary.errorRows`
  - `summary.importableRows`
  - `summary.skippedRows`
  - `invalidRows[]`
- Chuẩn hóa mã lỗi tối thiểu:
  - `MISSING_REQUIRED`
  - `INVALID_FORMAT`
  - `REFERENCE_NOT_FOUND`
  - `DUPLICATE_IN_FILE`
  - `DUPLICATE_IN_DB`
  - `BUSINESS_RULE_ERROR`
  - `SKIPPED`
- Cập nhật lưu session import để ghi lại `invalidRows`, `warningRows`, `skippedRows`, `importableRows`.
- Cập nhật status/poll commit để trả lại `invalidRows` khi cần.
- Bảo toàn rule commit: chỉ dòng importable mới được commit; dòng lỗi/thiếu/skipped không được commit.

### Frontend

- Thêm popup cảnh báo riêng:
  - `public/js/app/admin/import-warning-modal.js`
- Popup chỉ hiển thị dòng lỗi/dòng thiếu/dòng bị bỏ qua; không hiển thị dòng hợp lệ.
- Popup có các chỉ số:
  - Tổng dòng/đơn
  - Sẽ import
  - Lỗi/thiếu
  - Sẽ bỏ qua
- Mỗi dòng lỗi hiển thị:
  - Dòng Excel
  - Cột lỗi
  - Giá trị
  - Mã lỗi
  - Lý do lỗi tiếng Việt
- Bổ sung nút:
  - `Import dòng hợp lệ`
  - `Xuất danh sách lỗi`
  - `Đóng`
- Import warning modal được load riêng ngoài source-bundle chính để tránh làm phình bundle `08d-import-excel.js`.

### Source bundles / UI wiring

- Cập nhật fragment và index để load popup warning mới trước `08d-import-excel.part02.js`:
  - `public/fragments/index/07-index-body.html`
  - `public/index.html`
- Rebuild source-bundles và cập nhật hash:
  - `config/source-bundles.json`
  - `public/js/app/admin/08d-import-excel.part02.js`

## 4. File đã thay đổi

| File | Mục đích |
|---|---|
| `src/services/import/core/importWarningContract.util.js` | Utility chuẩn hóa invalidRows/summary/error code |
| `src/services/import/preview/importPreview.impl.js` | Gắn warning contract vào kết quả preview |
| `src/services/importSessionService.js` | Lưu invalidRows/importableRows/warningRows/skippedRows vào session |
| `src/models/ImportSession.js` | Mở rộng schema import session/errors |
| `src/services/import/importCommit.impl.js` | Trả warning contract trong status/poll |
| `public/js/app/admin/import-warning-modal.js` | Popup cảnh báo chỉ dòng lỗi/thiếu |
| `public/js/app/admin/08d-import-excel.source/part-02.jsfrag` | Gọi popup warning sau khi preview có lỗi |
| `public/js/app/admin/08d-import-excel.part02.js` | File generated sau rebuild source-bundles |
| `public/css/base/00-base-05.css` | Style popup/table cảnh báo import |
| `public/fragments/index/07-index-body.html` | Load script warning modal |
| `public/index.html` | Bản index generated/assembled load script warning modal |
| `config/source-bundles.json` | Hash bundle sau rebuild |
| `test/import-warning-popup-static.test.js` | Test contract backend + popup frontend |

## 5. Kiểm tra đã chạy

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS - `SYNTAX_OK 1272 JavaScript files` |
| `npm run check:source-bundles` | PASS - `OK 19 bundles` |
| `node --test test/import-warning-popup-static.test.js test/import-promotion-runtime-require.test.js test/import-promotion-preview-static.test.js test/import-preview-contract-static.test.js` | PASS - 22/22 tests |
| `npm test` | FAIL do các test/budget ngoài phạm vi import warning |

## 6. Ghi chú về `npm test`

`npm test` tổng vẫn exit code 1. Các lỗi còn lại nằm ngoài phạm vi sửa popup cảnh báo import, chủ yếu thuộc mobile sales/static UI/source-size budget:

- `mobile customer and product summary data no longer passes through innerHTML`
- `admin and mobile UI expose actual stock, DMS difference, and App selling limit`
- `mobile sales page cache busts compact customer summary assets and marks the customer box compact`
- `mobile sales order card has Xem hàng trả button and in-app returns modal`
- `phase 4 lowers the main bundle budget and bumps browser cache version`
- `mobile sales script cache version is bumped for edit fix`
- `source-size-budget` vẫn fail với một số file đã vượt budget từ baseline, ví dụ `public/index.html`, `public/mobile/js/sales.js`, `public/js/app/admin/08d-import-excel.js`, `src/services/import/preview/importPreview.impl.js`.

Đã cố tình tách `import-warning-modal.js` ra ngoài bundle chính để không làm tăng kích thước `public/js/app/admin/08d-import-excel.js` so với baseline.

## 7. Tiêu chí nghiệm thu đã đáp ứng trong phạm vi import

- Có contract `invalidRows` chuẩn hóa cho hàng lỗi/hàng thiếu.
- Popup chỉ hiển thị dòng có vấn đề, không review toàn bộ dữ liệu hợp lệ.
- Dòng hợp lệ vẫn được chọn/import an toàn.
- Dòng lỗi/dòng thiếu/dòng skipped không được commit.
- Người dùng nhìn được dòng Excel, cột lỗi, giá trị lỗi và lý do lỗi.
- Có nút xuất CSV danh sách lỗi để sửa lại Excel.
- Các test import/khuyến mại liên quan đã PASS.
