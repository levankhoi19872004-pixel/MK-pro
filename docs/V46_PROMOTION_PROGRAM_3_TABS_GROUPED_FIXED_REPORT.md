# V46 Promotion Program 3 Tabs Grouped Fixed Report

## Mục tiêu

Giữ nguyên 3 loại import khuyến mại hiện có, nhưng trong từng tab quản lý sẽ gom các dòng cùng mã chương trình thành 1 dòng cha.

## Phạm vi sửa

- `public/index.html`
- `public/style.css`
- `public/js/app/08-reports-users-promotions-import-excel.js`
- `src/services/promotionService.js`
- `src/controllers/promotionController.js`
- `src/routes/promotionRoutes.js` giữ nguyên route, dùng query `type`.

## Quy tắc đã áp dụng

1. Không đổi mẫu import Excel.
2. Không gom lẫn 3 loại khuyến mại.
3. `type=productRules` chỉ đọc/sửa/hủy `promotionProductRules`.
4. `type=groupItems` chỉ đọc/sửa/hủy `promotionGroupItems`.
5. `type=groupRules` chỉ đọc/sửa/hủy `promotionGroupRules`.
6. Huỷ chương trình là hủy mềm: `isActive=false`, `cancelledAt`, `updatedAt`.
7. Mỗi tab có bố cục 2 cột: bên trái danh sách mã CTKM, bên phải chi tiết chương trình.

## Test đã chạy

- `node -c src/services/promotionService.js`: OK
- `node -c src/controllers/promotionController.js`: OK
- `node -c public/js/app/08-reports-users-promotions-import-excel.js`: OK
- `npm run docs:check`: OK
- `npm test`: có lỗi môi trường thiếu dependency `mongoose`, các test không phụ thuộc mongoose vẫn chạy OK.
