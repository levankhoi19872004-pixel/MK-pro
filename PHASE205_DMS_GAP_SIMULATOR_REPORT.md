# Phase205 - DMS Gap Simulator

## Tổng quan

Đã thêm module công cụ ngoài luồng `Sinh đơn chấm DMS`, nhúng vào MK-Pro nhưng tách biệt khỏi nghiệp vụ đơn hàng thật.

Module chỉ thực hiện:

- Upload Excel.
- Parse 3 sheet: DMS lệch, nhóm KM/Ontop, khách cần chấm.
- Validate dữ liệu đầu vào.
- Sinh đơn tham khảo trong RAM bằng thuật toán weighted softmax + multi-scenario scoring.
- Preview trên giao diện.
- Xuất Excel kết quả tham khảo.

Module không tạo đơn thật, không ghi công nợ, không ghi tồn kho, không ghi collection nghiệp vụ.

## File đã thêm/sửa

### Backend

- `src/routes/index.js`
  - Mount route mới: `/api/tools/dms-gap-simulator`.
- `src/routes/tools/dmsGapSimulator.routes.js`
  - API preview/export cho công cụ DMS gap simulator.
- `src/services/tools/dmsGapSimulator.service.js`
  - Parser Excel, validate, thuật toán sinh đơn, scoring, export workbook.

### Frontend

- `public/fragments/index/01-index-body.html`
  - Thêm tab: `Công cụ: Sinh đơn chấm DMS`.
- `public/fragments/index/06b-dms-gap-simulator.html`
  - Màn hình upload, cấu hình, preview, các tab kết quả.
- `public/fragments/index/07-index-body.html`
  - Load script frontend mới.
- `public/index.shell.html`
  - Load CSS mới.
- `public/js/bootstrap/03-tab-loader.js`
  - Lazy-load module khi mở tab `dmsGapSimulatorTab`.
- `public/js/app/tools/dms-gap-simulator.js`
  - Frontend handler cho preview/export/reset/render bảng.
- `public/css/tools/dms-gap-simulator.css`
  - CSS riêng cho module.
- `config/index-page-fragments.json`
  - Thêm fragment `06b-dms-gap-simulator.html` để không vượt source-size budget.

## API mới

```txt
POST /api/tools/dms-gap-simulator/preview
POST /api/tools/dms-gap-simulator/export
```

## Thuật toán

Module dùng:

```txt
Weighted Softmax + Repair Loop + Multi-scenario Scoring
```

Công thức score sản phẩm:

```txt
score(customer, product) =
  0.45 * promotionGroupNeed(product)
+ 0.25 * customerTargetFit(customer, product)
+ 0.15 * dmsGapPressure(product)
+ 0.10 * priceFit(customer, product)
- 0.05 * duplicatePenalty(customer, product)
```

Có hỗ trợ cấu hình UI:

- scenarioCount, mặc định 300, max 1000.
- toleranceAmount, mặc định 10.000đ.
- globalToleranceAmount, mặc định 50.000đ.
- temperature, mặc định 0.35.
- Các trọng số thuật toán.

## Quy tắc cân bằng tổng doanh số

Module tính:

```txt
totalDmsGapAmount = sum(product.diffQty * product.price)
totalCustomerTargetAmount = sum(customer.targetAmount)
```

Sau đó xác định mode:

- `DMS_MORE_THAN_CUSTOMER_TARGET`
  - Chỉ sinh vừa đủ theo tổng chỉ tiêu khách.
  - Không cố dùng hết DMS lệch.
  - Không vì KM/Ontop mà sinh vượt tổng chỉ tiêu khách.
- `DMS_LESS_THAN_CUSTOMER_TARGET`
  - Sort khách theo target tăng dần.
  - Ưu tiên khách chỉ tiêu thấp trước.
  - Hết DMS gap thì đánh dấu khách còn lại chưa sinh do thiếu ngân sách DMS lệch.
- `BALANCED`
  - Sinh theo thuật toán mặc định.

## Guard an toàn

Đã kiểm tra module mới không import/call:

- orders/master_orders.
- arLedgers/fundLedgers.
- stockTransactions/inventory write service.
- deliveryCloseout.
- service tạo đơn thật.

Route mới chỉ đọc upload Excel, xử lý in-memory và export workbook.

## Excel đầu ra

Export gồm 6 sheet:

- `TONG_QUAN`
- `DON_THAM_KHAO`
- `CHI_TIET_SAN_PHAM`
- `NHOM_KHUYEN_MAI`
- `SAN_PHAM_DMS_LECH`
- `CANH_BAO`

## Kiểm tra đã chạy

```txt
npm run check:source-size
npm run check:syntax
```

Kết quả:

```txt
[source-size-budget] OK
SYNTAX_OK 1327 JavaScript files
```

## Kiểm tra chưa chạy được trong sandbox

```txt
npm run check:source-bundles
```

Không chạy được vì môi trường hiện tại thiếu dependency dev `terser` trong `node_modules`.

```txt
npm run check:path-portability
```

Có lỗi tồn tại sẵn ở các test cũ:

- `test/import-promotion-commit-progress-static.test.js -> ../core/importRow.util`
- `test/import-promotion-util-boundary-static.test.js -> ../core/importRow.util`
- `test/order-data-lineage-static.test.js -> ./accounting/arDebtRuntimeView.service`

Các lỗi này không phát sinh từ module `dms-gap-simulator`.

## Cách test nhanh

1. Vào MK-Pro.
2. Mở tab `Công cụ: Sinh đơn chấm DMS`.
3. Upload file Excel có 3 sheet:
   - Sheet 1: Mã sản phẩm, Tên sản phẩm, Số lượng lệch, Giá bán, Tổng tiền.
   - Sheet 2: Mã nhóm, Tên nhóm, Mã sản phẩm, Tên sản phẩm, Doanh số/chỉ tiêu nhóm.
   - Sheet 3: Mã khách hàng, Tên khách hàng, Chỉ tiêu cần chấm.
4. Bấm `Sinh đơn tham khảo`.
5. Kiểm tra các tab preview.
6. Bấm `Xuất Excel kết quả`.

## Giới hạn hiện tại

- Phase này ưu tiên đọc toàn bộ dữ liệu từ Excel, chưa đọc danh mục sản phẩm/KM từ MongoDB.
- Repair nhóm KM ở mức an toàn, không swap phức tạp quá sâu để tránh sinh vượt chỉ tiêu.
- Không lưu session vào DB; khi refresh trang cần upload lại file.
