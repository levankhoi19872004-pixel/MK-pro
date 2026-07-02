# PHASE146 - Import paste promotion preview service fix

## Scope

Module: Import dữ liệu Excel → Dán trực tiếp từ Excel.

Focus: lỗi runtime khi tạo preview cho loại import `Import điều kiện nhóm KM` sau khi dán dữ liệu từ Excel.

## Root cause

`src/services/import/preview/importPreview.impl.js` sử dụng `promotionService.normalizeGroupRuleBasis(...)` trong nhánh preview `promotionGroupRules`, nhưng file này chưa `require('../../promotionService')`.

Vì vậy khi backend preview xử lý cột `Tính theo` của Điều kiện nhóm KM / Ontop, Node phát sinh `ReferenceError: promotionService is not defined`. Frontend popup chỉ hiển thị lại message lỗi API nên người dùng thấy lỗi đỏ: `promotionService is not defined`.

Đây không phải lỗi bảng Excel và cũng không phải lỗi người dùng chưa chọn file.

## Fix

- Bổ sung import backend service đúng chỗ trong `importPreview.impl.js`.
- Không khai báo global frontend `window.promotionService`.
- Không cho frontend gọi trực tiếp backend service.
- Giữ nguyên pipeline chuẩn: paste modal → API preview import → import session → commit selected rows.
- Bổ sung coverage runtime require để module preview promotion không tái lỗi thiếu helper/service.

## Files changed

- `src/services/import/preview/importPreview.impl.js`
- `test/import-promotion-runtime-require.test.js`
- `RELEASE_MANIFEST.json`

## Verification

Passed:

```bash
npm run check:syntax
npm run check:source-bundles
npm run check:release-manifest
node --test test/import-promotion-runtime-require.test.js test/import-paste-source-state-static.test.js test/promotion-advanced-ui-import-static.test.js test/promotion-group-rule-basis-static.test.js
```

Targeted result: 9 tests passed, 0 failed.

`npm test` was started and reached 112 passing tests with no failure observed before the sandbox timeout.

## UI retest

1. Vào `Import dữ liệu Excel`.
2. Chọn `Import điều kiện nhóm KM`.
3. Bấm `Dán trực tiếp từ Excel`.
4. Dán dữ liệu có cột `Tính theo`.
5. Bấm `Kiểm tra và tạo bản xem trước`.
6. Popup không còn báo `promotionService is not defined`.
7. Preview tạo session thành công, sau đó bấm `Import các dòng đã chọn` như luồng paste chuẩn.
