# PHASE122 — Import nhóm sản phẩm KM preview fix

## 1. Tổng quan dự án

- Tech stack: Node.js/Express + MongoDB/Mongoose, frontend JavaScript thuần, import Excel qua `read-excel-file` chạy trong worker process.
- Quy mô source trong ZIP kiểm tra: 1.598 file.
- Module liên quan: `Import dữ liệu Excel`, `ImportSession`, `importPreview`, `importCommit`, `PromotionGroupItem`, `PromotionGroupRule`, template Excel.

## 2. Lỗi thực tế

Người dùng chọn:

- Loại import: `Import nhóm sản phẩm KM`
- File: `Nhóm sp t7.xlsx`
- Thao tác: `Xem trước đơn import`

UI báo: `Không đọc được file import`, preview trả 0 dòng.

## 3. Kiểm tra file Excel đính kèm

File `Nhóm sp t7.xlsx` là file hợp lệ theo template nhóm sản phẩm KM:

- Sheet chính: `Import`
- Header: `Mã chương trình KM`, `Mã sản phẩm`
- Dòng dữ liệu đầu: `AD70908439DN11`, `64833959`
- Có sheet hướng dẫn và sheet dữ liệu mẫu.

Kết luận: file không sai template ở mức cơ bản. Lỗi nằm trong code preview import.

## 4. Nguyên nhân gốc

Trong `src/services/import/preview/importPreview.impl.js`, các nhánh preview promotion đã gọi:

- `pickPromotionProductRulePayload`
- `pickPromotionGroupItemPayload`
- `pickPromotionGroupRulePayload`

nhưng file này chưa destructure/import 3 helper đó từ `src/services/import/core/importRow.util.js`.

Khi chạy nhánh `promotionGroupItems`, backend phát sinh `ReferenceError`, sau đó controller bắt lỗi và frontend chỉ nhận message chung `Không đọc được file import`.

## 5. Phương án xử lý

### Phương án A — Production-grade, đã triển khai

- Import đúng 3 helper payload cho nhánh promotion preview.
- Giữ nguyên import type hiện tại `promotionGroupItems`.
- Giữ nguyên template `Mã chương trình KM`, `Mã sản phẩm`.
- Tăng khả năng nhận diện header của parser với các keyword promotion/KM.
- Cải thiện message lỗi parse để không còn quá chung chung khi có thể xác định nguyên nhân.
- Thêm static test chặn tái phát lỗi thiếu import helper.

Effort: Easy/Medium.  
Rủi ro: thấp, khoanh vùng trong module import Excel.

### Phương án B — Sửa nhanh

Chỉ import thiếu 3 helper.  
Effort: Easy.  
Nhược điểm: lỗi message chung và header scoring yếu vẫn còn.

## 6. File đã sửa

| File | Nội dung |
|---|---|
| `src/services/import/preview/importPreview.impl.js` | Bổ sung import 3 helper promotion payload; message khi không có rows rõ hơn |
| `src/controllers/excelImportController.js` | Bổ sung `buildSafeImportErrorMessage()` để trả lỗi import rõ hơn, tránh message chung khi có thể xác định |
| `utils/excelParser.worker.js` | Bổ sung keyword header cho file promotion/KM |
| `test/import-promotion-preview-static.test.js` | Static test chặn lỗi thiếu helper trong preview promotion import |
| `docs/reports/PHASE122_IMPORT_PROMOTION_GROUP_PREVIEW_FIX_REPORT.md` | Báo cáo triển khai |

## 7. API / contract

Không đổi API endpoint.

- Frontend vẫn gửi `type=promotionGroupItems`.
- Backend vẫn nhận `promotionGroupItems`.
- Parser/preview vẫn dùng template `Mã chương trình KM`, `Mã sản phẩm`.
- Không ảnh hưởng các import type khác.

## 8. Test đã chạy

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1189 JavaScript files
```

Targeted static test:

```bash
node --test test/import-promotion-preview-static.test.js
```

Kết quả:

```text
3 tests pass
```

## 9. Cách test thủ công

1. Vào `Import dữ liệu Excel`.
2. Chọn `Import nhóm sản phẩm KM`.
3. Chọn file `Nhóm sp t7.xlsx`.
4. Bấm `Xem trước đơn import`.
5. Kỳ vọng:
   - Không còn báo `Không đọc được file import`.
   - Preview hiện các dòng nhóm sản phẩm KM.
   - Nếu sản phẩm chưa có trong danh mục thì dòng vẫn preview được, có warning `Mã sản phẩm chưa có trong danh mục`.
6. Bấm xác nhận import nếu dữ liệu preview đúng.
