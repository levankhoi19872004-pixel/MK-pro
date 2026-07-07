# Phase188 - SSE export theo NVGH từ đơn tổng

## 1. Tổng quan yêu cầu

Sửa chức năng **Báo cáo → Xuất hóa đơn → Xuất Excel SSE** theo mẫu `Mẫu SSE.xlsx`:

- Không xuất SSE theo cửa hàng/khách hàng lẻ làm scope chính.
- Lấy scope từ **đơn tổng đã gán nhân viên giao hàng (NVGH)**.
- Lấy toàn bộ đơn con thuộc đơn tổng.
- Trừ `returnOrders` hợp lệ theo đơn con + mã sản phẩm.
- Gộp sản phẩm theo `deliveryStaffCode + productCode`.
- Giá bán lấy từ danh mục sản phẩm (`product.salePrice`, fallback `price/unitPrice/basePrice`).
- Sheet chính `TỔNG` vẫn giữ mẫu SSE A:AJ, header dòng 5, dữ liệu từ dòng 6.
- Thêm sheet nội bộ `TONG_THEO_NVGH` để đối chiếu bán/trả/còn lại.

## 2. File đã sửa

| File | Nội dung |
|---|---|
| `src/services/sseInvoiceExport.service.js` | Thêm mode `summaryBy=deliveryStaff`, group theo NVGH + mã hàng, xuất `TONG_THEO_NVGH` |
| `src/services/invoiceExportQuery.service.js` | Thêm query đơn tổng/master_orders, lấy child orders, returnOrders, products theo batch |
| `public/fragments/index/05-index-body.html` | Thêm filter “Nhân viên giao hàng SSE” |
| `public/js/app/admin/08f-vat-export.js` | Nút SSE gửi `summaryBy=deliveryStaff` và `deliveryStaffCode`; VAT/không VAT giữ filter NVBH/khách hàng |
| `test/sse-invoice-export.test.js` | Cập nhật test frontend filter NVGH SSE |
| `test/sse-invoice-export-delivery-staff-summary.test.js` | Thêm test riêng cho export SSE theo NVGH/đơn tổng |

## 3. Sheet `TỔNG` bám mẫu SSE như thế nào

- Sheet tên `TỔNG`.
- 4 dòng đầu để trống.
- Header 36 cột A:AJ ở dòng 5.
- Dữ liệu bắt đầu dòng 6.
- Không ghi công thức Excel/VLOOKUP; workbook values-only.
- Cột A/B map theo NVGH:
  - A `Mã khách` = `deliveryStaffCode`.
  - B `Tên khách hàng` = `deliveryStaffName`.
- Cột H/I/J/O/P/Q lấy theo sản phẩm đã gộp:
  - H `Mã hàng` = mã sản phẩm SSE/catalog.
  - O `Số lượng` = số lượng còn lại sau trả.
  - P `Giá bán` = giá danh mục sản phẩm.
  - Q `Tiền hàng` = O × P.
- Cột AJ `Mã NVBH` giữ theo config/mẫu, ví dụ `BANLE`.

## 4. Dữ liệu lấy từ đơn tổng/NVGH

Backend hỗ trợ `summaryBy=deliveryStaff`:

1. Query `master_orders` theo ngày và `deliveryStaffCode` nếu có.
2. Lấy `children`, `childOrderIds`, `orderCodes`, `salesOrderCodes`... từ đơn tổng.
3. Query batch `orders/salesOrders` theo identity của đơn con.
4. Gắn lại metadata NVGH từ đơn tổng vào từng đơn con:
   - `__sseDeliveryStaffCode`
   - `__sseDeliveryStaffName`
   - `__sseMasterOrderId`
   - `__sseMasterOrderCode`
   - `__sseInvoiceDate`
   - `__sseInvoiceCode`

Không lấy NVGH từ khách hàng/cửa hàng/NVBH.

## 5. Cách lấy đơn con thuộc đơn tổng

Dùng các field linh hoạt:

- `children`
- `childOrders`
- `orderIds`
- `childOrderIds`
- `salesOrderIds`
- `salesOrders`
- `orderCodes`
- `salesOrderCodes`

Sau đó query đơn con theo nhiều identity field:

- `id`
- `code`
- `orderCode`
- `salesOrderCode`
- `documentCode`
- `invoiceCode`
- `sourceOrderCode`
- `deliveryOrderCode`
- `orderId`
- `salesOrderId`
- `_id` nếu là ObjectId hợp lệ

## 6. Cách trừ returnOrders

Vẫn dùng logic net hiện có của `invoiceNetSalesService` và rule hợp lệ từ `invoiceExportQueryService.isEligibleReturnOrder`.

Nguyên tắc:

- Chỉ trừ returnOrders hợp lệ.
- Không trừ draft/cancelled/deleted.
- Trừ theo order identity + productCode/lineKey nếu có.
- `netQty <= 0` thì không xuất dòng ở sheet `TỔNG`.

## 7. Cách group theo NVGH + mã hàng

Mode SSE theo NVGH group cuối cùng theo:

```txt
key = deliveryStaffCode + productCode
```

Không group theo:

- khách hàng/cửa hàng
- mã đơn con
- NVBH
- giá thực tế trên đơn
- tài khoản kế toán

## 8. Cách lấy giá bán từ danh mục sản phẩm

Ưu tiên theo thứ tự:

1. `product.salePrice`
2. `product.price`
3. `product.unitPrice`
4. `product.basePrice`

Nếu thiếu giá:

- Không fail export.
- Sheet `TỔNG` vẫn có dòng với giá 0 và tiền 0.
- Sheet `TONG_THEO_NVGH` ghi chú `Thiếu giá bán trong danh mục sản phẩm`.

## 9. Sheet `TONG_THEO_NVGH`

Sheet nội bộ để kế toán đối chiếu, gồm:

1. STT
2. Mã NVGH
3. Tên NVGH
4. Số đơn tổng
5. Số đơn con
6. Mã hàng
7. Tên mặt hàng
8. Đvt
9. Số lượng bán
10. Số lượng trả
11. Số lượng còn lại
12. Giá bán
13. Thành tiền
14. Ghi chú

Có dòng `TỔNG NVGH` sau từng NVGH và `TỔNG CỘNG` cuối sheet.

## 10. Test đã chạy

```bash
node --check src/services/sseInvoiceExport.service.js
node --check src/services/invoiceExportQuery.service.js
node --check public/js/app/admin/08f-vat-export.js
npm run check:source-bundles
node --test test/sse-invoice-export.test.js test/sse-invoice-export-salesman-summary.test.js test/sse-invoice-export-integration.test.js test/sse-invoice-export-all-return.test.js test/sse-invoice-export-delivery-staff-summary.test.js
```

Kết quả targeted SSE tests:

```txt
30 tests
29 pass
1 skip optional golden fixture
0 fail
```

## 11. Rủi ro còn lại

- Nếu đơn tổng không lưu được identity đơn con trong các field đã hỗ trợ, đơn đó sẽ không vào export SSE theo NVGH.
- Nếu một đơn con bị gán trùng nhiều đơn tổng, backend lấy master đầu tiên map được; cần audit dữ liệu nếu phát hiện trùng.
- Nếu ngày lọc là khoảng nhiều ngày, mã chứng từ sinh theo ngày đầu tiên của group `SSE-{date}-{NVGH}`. Nghiệp vụ thực tế nên xuất theo từng ngày để tránh gom liên ngày quá rộng.
