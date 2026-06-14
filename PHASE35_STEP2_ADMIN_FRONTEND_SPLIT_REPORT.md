# PHASE 35 - Bước 2: Tách Reports / Users / Import / Promotions / VAT

## Đã thực hiện
- Tách file frontend đa trách nhiệm `08-reports-users-promotions-import-excel.js` thành 6 module.
- Giữ nguyên thứ tự classic-script để không đổi global contract hiện tại.
- `08-reports-users-promotions-import-excel.js` chỉ còn compatibility manifest, không chạy runtime.

## Module mới
- `public/js/app/admin/08a-reports.js`
- `public/js/app/admin/08b-users.js`
- `public/js/app/admin/08c-promotions-legacy.js`
- `public/js/app/admin/08d-import-excel.js`
- `public/js/app/admin/08e-promotion-programs.js`
- `public/js/app/admin/08f-vat-export.js`

## Bước tiếp theo
Tách backend `excelImportService.js` theo Handler Registry, giữ facade/API cũ để rollback an toàn.
