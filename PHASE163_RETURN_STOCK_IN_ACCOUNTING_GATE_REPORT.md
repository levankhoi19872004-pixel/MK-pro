# Phase 163 - Warehouse return check → Accounting stock-in gate

## Mục tiêu

Tách trách nhiệm luồng hàng trả:

1. NVGH chỉ ghi nhận hàng trả từ khách.
2. Thủ kho chỉ kiểm hàng vật lý trên mobile và xác nhận khớp/lệch.
3. Kế toán/Admin mới được bấm **Nhập kho** trên web để cộng tồn MAIN.
4. Ẩn/deprecate module **Đơn tổng trả hàng** khỏi nghiệp vụ mới.

## Module đã chạm

- Backend returnOrders lifecycle / route / controller.
- Mobile warehouse return check service.
- Web UI `Đơn trả hàng`.
- Index/sidebar/tab loader.
- ReturnOrder schema.
- OpenAPI generated docs.
- Source-bundles canonical target for `returnOrderLegacy.service.js`.

## API mới

- `POST /api/return-orders/:id/stock-in`
- Theo route alias hiện hữu, OpenAPI cũng sinh `POST /api/returns/:id/stock-in`.
- Guard role: `admin`, `accountant`.

## Điều kiện nhập kho

`canStockIn = true` khi:

- `warehouseCheckStatus = matched`
- `stockInStatus = ready`
- `stockPosted !== true`
- phiếu chưa bị hủy/deleted

Nếu không đủ điều kiện, API trả lỗi rõ, ví dụ:

> Phiếu trả chưa được thủ kho xác nhận khớp, chưa thể nhập kho.

## Chống cộng tồn 2 lần

Endpoint nhập kho kiểm tra trước khi post:

- lifecycle/field `stockPosted`, `stockInStatus = posted`, `status/returnState` đã nhận kho;
- tồn tại `stockTransactions` cũ theo `sourceType/refType = RETURN_ORDER | RETURN_ORDER_STOCK_IN` và `sourceId/refId` là id/code phiếu trả.

Nếu đã có dấu hiệu nhập kho, hệ thống không post thêm và trả message:

> Phiếu trả đã nhập kho.

## Trạng thái returnOrders mới/chuẩn hóa

- `warehouseCheckStatus`: `pending`, `matched`, `discrepancy`
- `stockInStatus`: `pending`, `ready`, `blocked`, `posted`
- `stockPosted`, `stockPostedAt`, `stockPostedBy`, `stockTransactionId(s)`
- Status hiển thị: `Chờ thủ kho kiểm`, `Đã kiểm khớp - Chờ nhập kho`, `Có lệch kho`, `Đã nhập kho`

## Thủ kho confirm mobile

Khi phiên warehouse return check được confirm:

- Nếu khớp: các returnOrders nguồn chuyển sang `warehouseCheckStatus = matched`, `stockInStatus = ready`, `status = ready_to_stock_in`.
- Nếu lệch: chuyển sang `warehouseCheckStatus = discrepancy`, `stockInStatus = blocked`, `status = warehouse_discrepancy`.
- Không cộng tồn kho.

## Ẩn Đơn tổng trả hàng

- Sidebar ẩn tab `masterReturnOrdersTab`.
- Section cũ được đánh dấu `hidden`, `aria-hidden`, `data-deprecated-module`.
- Tab loader không tải module cũ, redirect về `Đơn trả hàng` nếu bị gọi trực tiếp.
- Không xóa dữ liệu cũ.

## Kiểm tra đã chạy

- `npm install`: OK, cài dependencies trong môi trường sandbox để chạy script.
- `npm run source-bundles:refresh`: OK, built 19 bundles.
- `npm run check:syntax`: OK - `SYNTAX_OK 1253 JavaScript files`.
- `npm run check:source-bundles`: OK - `[source-bundles] OK 19 bundles`.
- `npm run docs:generate`: OK, thêm OpenAPI skeleton cho stock-in endpoint.
- `npm run docs:check`: OK.
- `node --test test/return-order-warehouse-stock-in-workflow-static.test.js`: OK - 3/3 pass.
- `npm test`: còn FAIL ở 6 static tests không thuộc phạm vi luồng nhập kho trả hàng, chủ yếu mobile sales/cache/version/bundle budget đã tồn tại trong baseline phase163.

## Rủi ro còn lại

Nếu dữ liệu production cũ đã từng cộng tồn ngay lúc tạo/nhận returnOrder, cần chạy audit `returnOrders → stockTransactions` trước khi cho kế toán nhập kho hàng loạt. Endpoint mới đã tự nhận diện stock transaction cũ và mark idempotent, nhưng audit dữ liệu thật vẫn cần làm để phát hiện phiếu cũ thiếu `stockPosted/stockTransactionIds`.
