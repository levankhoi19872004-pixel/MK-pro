# BÁO CÁO SỬA LỖI LOẠI ĐƠN TRẢ HẾT KHỎI VAT VÀ SSE

## 1. Phạm vi và nguyên tắc

Bản sửa được triển khai trên mã nguồn `MK-pro-mobile-sales-phase5-production-hardening-patched.zip`.

Phạm vi duy nhất:

- Dataset xuất hóa đơn VAT TT78.
- Dataset xuất Excel SSE.

Không thay đổi:

- `orders` hoặc trạng thái đơn bán.
- `returnOrders` hoặc trạng thái phiếu trả.
- Tồn kho và stock transaction.
- Công nợ, quỹ, giao hàng, kế toán.
- Schema MongoDB, API route hoặc cấu trúc workbook hiện hữu.

Export vẫn là thao tác đọc dữ liệu.

---

## 2. Khảo sát luồng hiện tại

### 2.1 Luồng xuất VAT

```text
Giao diện Trung tâm báo cáo
→ public/js/app/admin/08f-vat-export.js
→ GET /api/export/invoice-orders.xlsx
→ src/routes/importExportRoutes.js
→ src/controllers/importExportController.js::exportExcel()
→ src/services/importExportLegacy.service.js::exportToExcel()
→ buildVatInvoiceTT78Workbook()
→ buildVatInvoiceRows()
→ excelWriter.util tạo workbook
```

Nguồn dữ liệu được lấy theo batch qua:

```text
src/services/invoiceExportQuery.service.js::loadInvoiceExportData()
```

Service này truy vấn:

- `SalesOrder`.
- `ReturnOrder`.
- `Customer`.
- `Product`.

Không có N+1 query theo từng đơn hoặc từng sản phẩm.

### 2.2 Luồng xuất SSE

```text
Giao diện Trung tâm báo cáo
→ public/js/app/admin/08f-vat-export.js
→ GET /api/export/sse-invoice-orders.xlsx?invoiceType=ALL
→ src/routes/importExportRoutes.js
→ src/controllers/importExportController.js::exportExcel()
→ src/services/importExportLegacy.service.js::exportToExcel()
→ src/services/sseInvoiceExport.service.js::exportSseInvoiceWorkbook()
→ buildSseRows()
→ excelWriter.util tạo sheet TỔNG
```

SSE dùng chung `invoiceExportQuery.service.js`, nhưng trước bản sửa lại có bộ gom/trừ trả hàng riêng với VAT.

### 2.3 Luồng “Đơn giao hôm nay”

```text
GET API giao hàng
→ src/services/mobile/delivery.service.js
→ findReturnOrdersForOrders()
→ getReturnOrderItemsForSalesOrder()
→ mergeOrderItemsWithReturnItems()
→ syncOrderReturnAmountFromReturnOrders()
→ src/utils/deliveryFinance.util.js
→ public/mobile/js/delivery-mobile-view.js
```

Màn hình giao hàng gom các dòng trả đơn giản theo `productCode` và cộng tổng số lượng/giá trị. Vì vậy trường “Hàng trả” có thể hiển thị đúng dù export không tìm thấy dòng trả theo khóa chi tiết.

Lưu ý: màn hình giao hàng phục vụ vận hành nên hiển thị phạm vi trạng thái rộng hơn. Dataset VAT/SSE chỉ trừ phiếu trả đủ điều kiện kế toán.

---

## 3. Trạng thái phiếu trả hợp lệ

Nguồn lifecycle:

```text
src/domain/lifecycle/ReturnStateMachine.js
```

Hàm quyết định cho export:

```text
src/services/invoiceExportQuery.service.js::isEligibleReturnOrder()
```

Chỉ trừ:

- `accounting_confirmed`.
- `posted_to_ar`.
- Alias lịch sử `confirmed`, `posted`, `completed` khi được chuẩn hóa tương ứng.
- Bản ghi có `accountingConfirmed/accountingConfirmedAt` hoặc `arPosted/arPostedAt` hợp lệ.

Không trừ:

- `draft`.
- `waiting_receive`.
- `received`.
- `cancelled/canceled/void/deleted/cleared`.
- Soft-delete qua `deleted`, `isDeleted`, `deletedAt`.

Phiếu trả không bị lọc theo cùng ngày bán. Phiếu phát sinh sau ngày bán vẫn được trừ nếu liên kết đúng và đã đạt trạng thái kế toán hợp lệ tại thời điểm xuất.

---

## 4. Nguyên nhân gốc rễ

### Hiện tượng

`returnOrders` đã tồn tại và màn hình giao hàng hiển thị tiền hàng trả, nhưng VAT/SSE vẫn có thể xuất nguyên số lượng hoặc không loại đơn đã trả hết.

### Nguyên nhân trực tiếp

VAT và SSE duy trì hai implementation gom hàng trả khác nhau. Cả hai ưu tiên các khóa chi tiết như:

```text
đơn + productCode + lineKey
đơn + productCode + price
```

Khóa tổng:

```text
đơn + productCode
```

chỉ được dùng trong một số trường hợp fallback.

### Cơ chế gây lỗi

Dữ liệu lịch sử có thể có:

- `lineKey` giữa đơn bán và phiếu trả không giống nhau.
- Giá dòng trả khác giá dòng bán do khuyến mại/làm tròn.
- Cùng `productCode` được tách thành nhiều dòng bán.
- Nhiều phiếu trả cho cùng một đơn và sản phẩm.

Khi đó:

1. Phiếu trả đã được query nhưng không khớp khóa chi tiết của dòng bán.
2. Hoặc tổng trả theo sản phẩm bị áp dụng lặp cho nhiều dòng cùng sản phẩm.
3. VAT và SSE có thể cho kết quả khác nhau vì dùng helper khác nhau.
4. Một đơn trả hết vẫn có thể còn dòng dương giả hoặc sinh header không đúng.

### Vì sao “Đơn giao hôm nay” đúng

`src/services/mobile/delivery.service.js::getReturnOrderItemsForSalesOrder()` gom trực tiếp theo `productCode`, không phụ thuộc `lineKey` hoặc giá. Do đó màn hình giao hàng có thể đọc đúng “Hàng trả”, trong khi helper export cũ không khớp dòng chi tiết.

### Vùng mã gây lỗi trước bản sửa

- `src/services/importExportLegacy.service.source/part-01.jsfrag::buildVatInvoiceRows()`.
- `src/services/sseInvoiceExport.service.js::buildSseRows()`.
- Các helper `buildReturnQtyMap()/getReturnInfoForOrderLine()` và `buildReturnMap()/returnedQtyForLine()` hoạt động độc lập.

---

## 5. Phương án đánh giá

### Phương án A — Net Sale Dataset dùng chung — Đã chọn

Tạo service đọc duy nhất:

```text
src/services/invoiceNetSales.service.js
```

VAT và SSE cùng sử dụng dataset này.

**Lợi ích**

- Một nguồn logic duy nhất.
- Cộng đúng nhiều phiếu trả.
- Không trừ lặp khi một sản phẩm có nhiều dòng bán.
- VAT và SSE nhất quán.
- Dễ test riêng và test workbook end-to-end.
- Không đổi schema/API.

**Nhược điểm**

- Cần chuẩn hóa nhiều alias dữ liệu lịch sử.
- Cần phân bổ lượng trả xuống các dòng cùng sản phẩm.

**Effort:** Medium.  
**Rủi ro:** Low–Medium, được kiểm soát bằng regression test và không ghi database.

### Phương án B — Vá helper trước bước map từng export

Giữ hai luồng hiện tại, thêm `applyReturnAdjustments()` trước VAT và SSE.

**Lợi ích:** ít file sửa ban đầu.  
**Nhược điểm:** vẫn giữ hai pipeline, dễ lệch logic về sau; khó xử lý cùng sản phẩm nhiều dòng; khó kiểm soát header hóa đơn rỗng.  
**Effort:** Easy–Medium.  
**Rủi ro:** Medium–High về maintainability và sai lệch VAT/SSE.

---

## 6. Thuật toán sau bản sửa

### 6.1 Khóa đơn bán

Mỗi đơn bán được lập tập khóa từ:

```text
_id, id, code, orderCode, salesOrderCode,
documentCode, invoiceCode, externalOrderCode, refCode
```

Phiếu trả đọc khóa liên kết từ:

```text
salesOrderId, orderId, sourceOrderId, deliveryOrderId,
salesOrderCode, orderCode, sourceOrderCode,
deliveryOrderCode, originalOrderCode
```

Phiếu trả chỉ được áp dụng khi liên kết chính xác tới duy nhất một đơn trong dataset. Phiếu không liên kết hoặc liên kết mơ hồ được cảnh báo và không tự động trừ.

### 6.2 Khóa sản phẩm

Ghép bắt buộc theo `productCode` và alias mã tương đương đã tồn tại:

```text
productCode, code, sku, barcode, productId, id
```

Không ghép bằng tên sản phẩm.

### 6.3 Chuẩn hóa số lượng

Ưu tiên số lượng đơn vị cơ sở:

```text
quantity, qty, totalQty, qtySale, saleQty, baseQty
```

Hỗ trợ thùng/lẻ:

```text
caseQty/cartonQty/... + looseQty/unitQty/...
```

Hỗ trợ chuỗi:

```text
2/6
```

với `conversionRateAtOrder/conversionRate/...`.

Ví dụ:

```text
2 thùng 6 lẻ, quy cách 24 = 54 lẻ
1 thùng 4 lẻ = 28 lẻ
netQty = 26
```

### 6.4 Cộng và phân bổ hàng trả

1. Chọn phiên bản mới nhất của cùng một phiếu trả để tránh snapshot trùng.
2. Cộng tất cả phiếu trả hợp lệ theo `đơn bán gốc + productCode`.
3. Nếu cùng sản phẩm có nhiều dòng bán:
   - ưu tiên dòng có `lineKey` khớp;
   - sau đó ưu tiên giá khớp;
   - cuối cùng phân bổ tuần tự vào phần số lượng còn lại.
4. Mỗi đơn vị trả chỉ được phân bổ một lần.
5. `netQty = max(soldQty - returnedQty, 0)`.
6. Trả vượt tạo cảnh báo `RETURN_QTY_EXCEEDS_SOLD`, không tạo số âm và không sửa dữ liệu nguồn.

### 6.5 Loại đơn trả hết

```text
fullyReturned = totalSoldQty > 0 && totalNetQty <= 0
```

VAT và SSE chỉ map `exportableLines` có:

```text
productCode tồn tại
soldQty > 0
netQty > 0
```

Nếu không còn dòng dương:

- Không tạo header hóa đơn.
- Không tạo dòng sản phẩm 0.
- Không tính vào `orderCount`.
- Không tính vào `rowCount`.
- Không tạo tổng tiền 0 hoặc âm.

---

## 7. Cách tính giá trị

### VAT TT78

Giữ nguyên contract hiện tại:

```text
Giá sau khuyến mại có VAT trên dòng đơn
→ chia 1,08 để lấy đơn giá trước VAT
→ Thành tiền trước VAT = netQty × đơn giá trước VAT
→ VAT = tổng trước VAT × 8%
```

Không thay đổi thuế suất, nguồn giá hoặc quy tắc làm tròn.

### SSE

Giữ nguyên contract hiện tại:

- VAT: giá nguồn sau khuyến mại được quy đổi theo `vatRate` cấu hình hiện tại.
- Không VAT: dùng giá nguồn hiện hành.
- `Tiền hàng = netQty × unitPrice`.
- Không đổi 36 cột, tên sheet hoặc kiểu dữ liệu.

---

## 8. Danh sách file đã sửa

```text
src/services/invoiceNetSales.service.js                         (mới)
src/services/sseInvoiceExport.service.js
src/services/importExportLegacy.service.source/part-01.jsfrag
src/services/importExportLegacy.service.source/part-02.jsfrag
src/services/importExportLegacy.service.js                      (bundle sinh lại)
config/source-bundles.json
test/invoice-net-sales-full-return.test.js                      (mới)
test/invoice-export-full-return-workbook.test.js                (mới)
INVOICE_EXPORT_FULL_RETURN_EXCLUSION_REPORT.md                  (báo cáo)
```

Không sửa frontend, route, controller, model hoặc database schema.

---

## 9. Diff chính

### Trước — VAT/SSE tự gom trả hàng riêng

```javascript
const returnMap = buildReturnMap(returnOrders);
const rawReturned = returnedQtyForLine(returnMap, order, item);
const returned = Math.min(soldQty, rawReturned);
const quantity = Math.max(0, soldQty - returned);
```

### Sau — dùng chung Net Sale Dataset

```javascript
const netDataset = invoiceNetSalesService.buildNetSaleDataset({
  orders: selectedOrders,
  returnOrders,
  isEligibleReturnOrder: invoiceExportQueryService.isEligibleReturnOrder
});

for (const netOrder of netDataset.orders) {
  for (const line of netOrder.exportableLines) {
    const quantity = line.netQty;
    // map VAT hoặc SSE theo contract hiện hữu
  }
}
```

### Chặn header hóa đơn VAT rỗng

```javascript
if (!detailLines.length || netOrder.fullyReturned) continue;
if (invoiceTotal <= 0) continue;
```

---

## 10. Đối chiếu dữ liệu fixture

Fixture kiểm thử ngày `19/06/2026`:

| Đơn | Nội dung | Kết quả VAT | Kết quả SSE |
|---|---|---:|---:|
| `SO-FULL-ONE` | A bán 10, trả 10 | Loại toàn bộ | Loại toàn bộ |
| `SO-FULL-MULTI` | A/B trả hết qua 2 phiếu | Loại toàn bộ | Loại toàn bộ |
| `SO-PARTIAL` | A trả hết, B bán 5 trả 2 | Chỉ B = 3 | Chỉ B = 3 |
| `SO-CANCELLED-RETURN` | Bán 10; trả hợp lệ 5; trả hủy 5 | A = 5 | A = 5 |
| `SO-NONVAT` | C bán 4, không trả | Không thuộc VAT | C = 4 trong SSE ALL |

### Tổng workbook

| Chỉ tiêu | VAT | SSE ALL |
|---|---:|---:|
| Số hóa đơn | 2 | 3 |
| Số dòng sản phẩm | 2 | 3 |
| Đơn trả hết xuất hiện | 0 | 0 |
| Dòng số lượng 0 | 0 | 0 |
| Dòng âm | 0 | 0 |

VAT fixture:

```text
SO-CANCELLED-RETURN / A / qty 5
SO-PARTIAL / B / qty 3
```

SSE fixture:

```text
SO-PARTIAL / B / qty 3 / tiền 30.000
SO-CANCELLED-RETURN / A / qty 5 / tiền 50.000
SO-NONVAT / C / qty 4 / tiền 40.000
```

---

## 11. Kết quả test

| Test | Kết quả | Ghi chú |
|---|---|---|
| Trả hết trong một lần | PASS | `fullyReturned=true`, không còn dòng xuất |
| Trả hết qua nhiều lần | PASS | Tổng 3 + 7 = 10 |
| Đơn nhiều sản phẩm trả hết | PASS | Không tạo header/rỗng |
| Chỉ trả hết một sản phẩm | PASS | Dòng còn lại xuất đúng netQty |
| Phiếu trả hủy/nháp/received | PASS | Không được trừ |
| Trả vượt | PASS | Giới hạn 0 và tạo cảnh báo |
| Cùng productCode nhiều dòng bán | PASS | Không trừ lặp |
| Quy đổi thùng/lẻ | PASS | 54 - 28 = 26 |
| Phiếu trả khác ngày bán | PASS | Vẫn trừ theo link/state |
| Workbook VAT thực tế | PASS | Không có đơn trả hết, không dòng 0 |
| Workbook SSE thực tế | PASS | Đúng sheet/36 cột và netQty |
| Full regression | PASS | 884 pass, 0 fail, 1 skip |
| Golden fixture SSE gốc | NOT RUN/SKIP | File SSE golden thật chưa được cung cấp |

Full test:

```text
885 tests
884 pass
0 fail
1 skip
```

Quality gates:

```text
Source bundles: 18/18 PASS
JavaScript syntax: 868 files PASS
Path portability: 1.052 paths PASS
Source-size budget: PASS
Enterprise smoke: PASS
OpenAPI: 310 operations, đồng bộ
npm audit mức high: 0 lỗ hổng
```

---

## 12. Side effect và tính read-only

Bản sửa chỉ tạo object/Map trong bộ nhớ và workbook buffer.

Không gọi:

- `save`, `create`, `update`, `delete` trên MongoDB.
- Inventory posting/reversal.
- AR/Fund posting.
- Thay đổi trạng thái đơn bán hoặc đơn trả.

| Khu vực | Ảnh hưởng |
|---|---|
| Đơn bán | Không sửa/xóa |
| `returnOrders` | Không sửa/xóa |
| Tồn kho | Không ảnh hưởng |
| Công nợ | Không ảnh hưởng |
| Quỹ | Không ảnh hưởng |
| Giao hàng | Không ảnh hưởng |
| Trạng thái kế toán | Không ảnh hưởng |
| Không VAT | Dùng chung net dataset nếu chạy export tương ứng; đã regression test |

---

## 13. Rủi ro còn lại và giới hạn xác nhận

Không có trong phiên làm việc:

- Hai file lỗi production gốc.
- Bản ghi MongoDB thực tế của `B0037855`.
- Bản ghi `returnOrders` thực tế liên quan `B0037855`.

Vì vậy chưa thể công bố số lượng/tiền trước–sau của chính đơn `B0037855`. Hai workbook bàn giao là fixture được tạo bằng exporter thật của dự án, không phải dữ liệu production.

Sau deploy cần thực hiện đối chiếu read-only:

1. Query đơn `B0037855` và toàn bộ `returnOrders` liên kết.
2. Xác nhận phiếu trả đã ở `accounting_confirmed` hoặc `posted_to_ar`.
3. Xuất lại VAT/SSE ngày thực tế.
4. Kiểm tra mã đơn không xuất hiện nếu tất cả `netQty=0`.
5. Nếu vẫn xuất hiện, kiểm tra các khóa liên kết không có trong danh sách alias hiện tại và bổ sung bằng bằng chứng dữ liệu thật.

---

## 14. Kết luận

Bản sửa đáp ứng quy tắc:

```text
Đơn trả hết = mọi dòng có netQty <= 0
→ không có dòng sản phẩm
→ không có header hóa đơn
→ không tính orderCount/rowCount
→ không xuất trong VAT và SSE
```

VAT và SSE hiện dùng cùng một Net Sale Dataset, cộng nhiều phiếu trả hợp lệ theo đơn bán gốc và `productCode`, không tạo số âm và không thay đổi dữ liệu nguồn.
