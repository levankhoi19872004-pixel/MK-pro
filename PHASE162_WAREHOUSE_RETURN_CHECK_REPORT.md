# Phase162 - App thủ kho kiểm hàng trả về theo NVGH/ngày

## Phạm vi

Triển khai nghiệp vụ thủ kho kiểm tổng hàng trả theo từng NVGH/ngày trên điện thoại, gom theo sản phẩm, không kiểm từng đơn mặc định.

## Backend

- Thêm model `WarehouseReturnCheck` dùng collection `warehouseReturnChecks`.
- Thêm service `src/services/mobile/warehouseReturnCheck.service.js`:
  - Gom `returnOrders` theo ngày + NVGH + sản phẩm.
  - Quy đổi thùng/lẻ theo `conversionRate` từ item hoặc catalog sản phẩm.
  - Lưu nháp số kho thực nhận.
  - Xác nhận `confirmed` nếu khớp, `discrepancy` nếu lệch.
  - Drilldown nguồn theo đơn/khách cho từng sản phẩm.
  - Audit log khi lưu/xác nhận.
- Thêm API mobile `/api/mobile/warehouse/return-checks*`.
- Phân quyền: role `warehouse`; admin được qua guard có sẵn.
- Bổ sung guard chốt kế toán phiếu trả hàng: nếu returnOrder có hàng trả nhưng chưa có check kho terminal hoặc check chưa bao gồm returnOrder đó, trả lỗi `WAREHOUSE_RETURN_CHECK_REQUIRED`.

## Frontend mobile

- Thêm `/mobile/warehouse.html` và `/mobile/warehouse`.
- Thêm `public/mobile/js/warehouse.js`.
- Thêm `public/mobile/warehouse.css` để không làm phình bundle CSS mobile dùng chung.
- Login role `warehouse` chuyển vào `warehouse.html`.
- UI mobile gồm:
  - Danh sách NVGH cần kiểm trong ngày.
  - Chi tiết sản phẩm gom theo NVGH.
  - Input thùng/lẻ kho nhận.
  - Tính lệch live trên client.
  - Lưu nháp, xác nhận hàng trả.
  - Bottom sheet xem nguồn đơn/khách.

## Kiểm thử đã chạy

```bash
npm run check:syntax
# SYNTAX_OK 1252 JavaScript files

npm run check:source-bundles
# [source-bundles] OK 19 bundles

npm test
# Exit 1 do các static/budget test cũ không liên quan phase này.
```

Các lỗi npm test còn lại trước hết nằm ở static contract/budget của mobile sales/import hiện có, ví dụ:

- `mobile customer and product summary data no longer passes through innerHTML`
- `admin and mobile UI expose actual stock, DMS difference, and App selling limit`
- cache-busting version kỳ vọng phase cũ trong `sales.html`
- `public/mobile/js/sales.js` vượt budget 40960 bytes
- `public/js/app/admin/08d-import-excel.js` và import preview vượt budget

Phase162 không sửa luồng bán hàng/import này.

## Rủi ro còn lại

- Cần test bằng dữ liệu thật để xác nhận `returnOrders.items` đang lưu quantity theo tổng lẻ hay có trường thùng/lẻ riêng.
- Nếu hệ thống hiện tại đã cộng tồn ngay khi NVGH báo trả, Phase162 chỉ thêm bằng chứng kiểm kho/chặn kế toán, chưa đổi cơ chế cộng tồn để tránh vỡ dữ liệu.
