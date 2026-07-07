# PHASE181 - Order Split Tool ngoài luồng

## Phạm vi

Thêm module `Công cụ → Chia đơn theo giá trị` trong MK-Pro để upload Excel đơn tổng, chia số lượng hàng thành nhiều đơn con theo giá trị target, preview và xuất Excel.

Module này là công cụ ngoài luồng, không tạo/sửa/xóa dữ liệu nghiệp vụ MK-Pro.

## File thêm/sửa

### Thêm mới

- `src/routes/tools/orderSplit.routes.js`
- `src/services/tools/orderSplitExcelParser.service.js`
- `src/services/tools/orderSplitAlgorithm.service.js`
- `src/services/tools/orderSplitExport.service.js`
- `src/services/tools/orderSplitVatExport.service.js`
- `public/js/app/tools/order-split-tool.js`
- `public/css/tools/order-split-tool.css`
- `test/order-split-tool-isolation-static.test.js`
- `PHASE181_ORDER_SPLIT_TOOL_REPORT.md`

### Sửa

- `src/routes/index.js`: mount route `/api/tools/order-split`
- `public/index.shell.html`: thêm CSS module
- `public/fragments/index/01-index-body.html`: thêm tab menu
- `public/fragments/index/06-index-body.html`: thêm màn module
- `public/fragments/index/07-index-body.html`: thêm script frontend
- `public/js/bootstrap/03-tab-loader.js`: lazy init module khi mở tab

## API

- `GET /api/tools/order-split/template`
- `POST /api/tools/order-split/preview`
- `POST /api/tools/order-split/export`
- `POST /api/tools/order-split/export-vat`

## Thuật toán

1. Validate sheet `DON_TONG` và `DON_CON_TARGET`.
2. Tính tổng đơn tổng và tổng target.
3. Chia sơ bộ từng mã hàng theo tỷ lệ `target / tổng target`.
4. Làm tròn số lượng về số nguyên.
5. Local optimization bằng move/swap giữa các đơn con để giảm tổng sai lệch tuyệt đối.
6. Xuất đối chiếu target/thực tế/chênh lệch/cảnh báo.

## Excel đầu vào

- `DON_TONG`: Mã SP, Tên SP, Số lượng, Đơn giá, Thành tiền, Đơn vị tính, Thuế suất VAT.
- `DON_CON_TARGET`: Mã đơn con, Giá trị mong muốn.
- `THONG_TIN_HOA_DON` không bắt buộc: Mã đơn con, Tên khách hàng, Mã số thuế, Địa chỉ, Người mua hàng, Hình thức thanh toán, Ghi chú hóa đơn.

## Excel kết quả chia đơn

- `KET_QUA_CHIA_DON`
- `DOI_CHIEU_TARGET`
- `TON_CON_LAI`
- `CANH_BAO`

## Excel VAT

- `HOA_DON_VAT`
- `DOI_CHIEU_HOA_DON`
- `CANH_BAO`

Chức năng VAT chỉ xuất Excel theo mẫu, chưa phát hành hóa đơn điện tử và không gọi API VNPT.

## Guard an toàn

- Route prefix riêng `/api/tools/order-split`.
- Không import `orderService`, `arService`, `inventoryService`, `accountingService`, `invoiceService`.
- Không ghi collections nghiệp vụ: orders/master_orders/returnOrders/arLedgers/fundLedgers/inventories/stockTransactions/reporting_snapshots.
- Static test `order-split-tool-isolation-static.test.js` chặn import service nghiệp vụ và mount sai prefix.

## Giới hạn hiện tại

- Thuật toán là heuristic, không đảm bảo nghiệm tối ưu tuyệt đối như Integer Programming.
- Kết quả phụ thuộc cấu trúc giá và số lượng nguyên; một số target không thể khớp tuyệt đối.
- `roundingMode=invoice` đã có UI/API option nhưng VAT export hiện tính an toàn theo từng dòng để tránh lệch dòng hàng.
- Export không lưu lịch sử DB; dữ liệu export lấy từ kết quả preview trên trình duyệt.

## Kiểm thử đã chạy

- `npm run check:syntax` → PASS.
- `npm run check:source-size` → PASS.
- `node --test test/order-split-tool-isolation-static.test.js` → PASS.

## Kiểm thử chưa chạy được trong sandbox

- `npm run check:source-bundles` chưa chạy được vì sandbox hiện thiếu package runtime `terser` trong `node_modules`.
- Smoke test ExcelJS chưa chạy được vì sandbox hiện thiếu package runtime `exceljs` trong `node_modules`.

Trên Render/production, các dependency này đã nằm trong `package.json`/`package-lock.json` và sẽ được cài bằng `npm install` trước khi chạy app.
