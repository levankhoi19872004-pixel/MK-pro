# V46 DMS Invoice Print Module Functions Added

## Mục tiêu
Đưa bộ hàm chuẩn hóa mẫu `PHIẾU GIAO NHẬN VÀ THANH TOÁN` vào đúng module in đơn.

## File đã sửa

### 1. `services/printDataBuilder.js`
Đã bổ sung và xuất các hàm:

- `normalizeInvoiceItem(item, index)`
- `normalizeInvoicePromotion(row)`
- `normalizeInvoiceOffset(row)`
- `calculateDeliveryInvoiceSummary(payload)`
- `paginateDeliveryInvoice(payload)`
- `validateAgainstDmsSample(payload)`
- `buildDeliveryInvoicePayload(raw)`

Kết quả: dữ liệu in DMS được chuẩn hóa về `erpInvoiceV46` gồm:

```js
{
  header,
  distributor,
  customer,
  salesStaff,
  items,
  promotions,
  offsets,
  summary,
  pagination,
  validation
}
```

### 2. `templates/printTemplates.js`
Đã cập nhật mẫu `DMS_DELIVERY_INVOICE` để ưu tiên đọc dữ liệu từ `data.erpInvoiceV46`.

Các phần đã chuẩn hóa:

- Header Liên 1 / Liên 2.
- Số trang động theo `pagination.pagesPerCopy`.
- Bảng hàng theo đúng cột DMS.
- Tổng tiền theo `summary` chuẩn.
- Chi tiết khuyến mại theo `promotions` chuẩn.
- Chi tiết cấn trừ/trưng bày theo `offsets` chuẩn.
- Nếu đơn dài: tách trang 1 hàng hóa + tổng tiền, trang 2 khuyến mại + cấn trừ.
- Nếu đơn ngắn: in gọn trên 1 trang/liên.

### 3. `services/printService.js`
Giữ nguyên luồng hiện tại:

```js
ORDER_SINGLE / SALES_ORDER / ORDER -> DMS_DELIVERY_INVOICE
```

Không đổi API, không đổi route, không chồng thêm module mới.

## Kiểm tra kỹ thuật

Đã chạy kiểm tra cú pháp Node:

```bash
node -c services/printDataBuilder.js
node -c templates/printTemplates.js
```

Đã chạy thử `renderPrintHtml('ORDER_SINGLE', ...)` và xác nhận HTML có `Liên 1`, phân trang hợp lệ.
