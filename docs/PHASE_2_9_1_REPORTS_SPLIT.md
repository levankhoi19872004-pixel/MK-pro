# Phase 2.9.1 - Reports Split

Mục tiêu: tách nhóm báo cáo khỏi legacyApp.js, đưa API báo cáo sang route/controller/service riêng và đọc Mongo là nguồn chính.

## Đã tách

- `src/routes/reportRoutes.js`
- `src/controllers/reportController.js`
- `src/services/reportService.js`

## Endpoint tương thích cũ

- `GET /api/stock`
- `GET /api/debts`
- `GET /api/dashboard`

## Endpoint namespace mới

- `GET /api/reports/stock`
- `GET /api/reports/debts`
- `GET /api/reports/dashboard`
- `GET /api/reports/sales`
- `GET /api/reports/finance`
- `GET /api/reports/delivery`

## Nguyên tắc

- Route được mount trước `legacyApp.js`, nên các endpoint báo cáo chính sẽ chạy qua module mới.
- `legacyApp.js` vẫn giữ fallback, chưa xóa ngay.
- Service đọc Mongo qua model chính: `SalesOrder`, `MasterOrder`, `Inventory`, `Receipt`, `Payment`, `Cashbook`, `Bankbook`, `ReturnOrder`, `ImportOrder`.
