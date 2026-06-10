# Phase 2.9.2 - Print split

Mục tiêu: tách nhóm API in chứng từ ra khỏi `src/legacy/legacyApp.js`.

## Đã tách

- `src/routes/printRoutes.js`
- `src/controllers/printController.js`
- `src/services/printDocumentService.js`
- `src/repositories/printRepository.js`

## API

### API tương thích cũ

- `POST /api/print/render`
- `GET /api/print/:type/:id`

### API mới dễ đọc hơn

- `GET /api/print/types`
- `GET /api/print/orders/:id`
- `GET /api/print/master-orders/:id`
- `GET /api/print/import-orders/:id`
- `GET /api/print/receipts/:id`

## Loại mẫu in hiện hỗ trợ

- `ORDER_SINGLE` - đơn bán/phiếu giao nhận
- `ORDER_TOTAL` - đơn tổng
- `IMPORT_ORDER` - phiếu nhập kho
- `PAYMENT_RECEIPT` - phiếu thu tiền

## Ghi chú kỹ thuật

- `legacyApp.js` không còn xử lý trực tiếp `/api/print/*`.
- `printDocumentService` không đọc snapshot JSON nữa, mà lấy chứng từ qua repository.
- `printRepository` hỗ trợ alias như `ORDER`, `SALES_ORDER`, `MASTER_ORDER`, `RECEIPT` để tránh vỡ link cũ.
