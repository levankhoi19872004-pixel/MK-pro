# V46 Delivery Invoice Payload Builder Fixed

## Mục tiêu
Chuẩn hóa hàm `buildDeliveryInvoicePayload(raw)` làm nguồn JSON duy nhất cho mẫu **PHIẾU GIAO NHẬN VÀ THANH TOÁN**.

## File đã sửa
- `services/printDataBuilder.js`

## Nội dung đã thực hiện

### 1. Thêm hàm `buildDeliveryInvoicePayload(raw)`
Hàm này chuẩn hóa dữ liệu về cấu trúc:

```js
{
  documentType: 'DELIVERY_PAYMENT_INVOICE',
  title: 'PHIẾU GIAO NHẬN VÀ THANH TOÁN',
  header: {},
  distributor: {},
  customer: {},
  salesStaff: {},
  items: [],
  promotions: [],
  offsets: [],
  summary: {}
}
```

### 2. Chuẩn hóa chi tiết sản phẩm
Mỗi dòng sản phẩm có đủ trường:

- `lineNo`
- `productCode`
- `productName`
- `quantityCsSu`
- `cartonQty`
- `unitQty`
- `csSuUnitQty`
- `quantity`
- `priceBeforeTax`
- `priceBeforeTaxBeforePromotion`
- `priceAfterTaxBeforePromotion`
- `priceAfterPromotion`
- `priceAfterTaxAfterPromotion`
- `discountPercent`
- `vatAmount`
- `lineAmount`
- `isPromotionGift`
- `promotionCode`

### 3. Chuẩn hóa công thức cột theo mẫu DMS
- Cột 1: CS/SU lấy từ chuỗi `0/5`, hoặc dữ liệu đã chuẩn hóa.
- Cột 2: số lượng lẻ `quantity`.
- Cột 3: `priceBeforeTax = priceAfterTaxBeforePromotion / 1.08`.
- Cột 4: `priceAfterTaxBeforePromotion`.
- Cột 5: `priceAfterPromotion` / `priceAfterTaxAfterPromotion`.
- Cột 6: `vatAmount`.
- Cột 7: `lineAmount`.

### 4. Chuẩn hóa CTKM
Mỗi dòng CTKM có:

- `promotionCode`
- `description`
- `qualifiedAmount`
- `discountPercent`
- `discountBeforeTax`
- `discountAfterTax`

### 5. Chuẩn hóa cấn trừ / thưởng trưng bày
Mỗi dòng offset có:

- `programCode`
- `description`
- `displayMonth`
- `month`
- `offsetAmount`

### 6. Sửa `toNumber()`
Đã hỗ trợ đúng định dạng tiền Việt:

- `34.028` → `34028`
- `1.100.000` → `1100000`
- `12,11` → `12.11`
- `12.11` vẫn giữ là `12.11`

### 7. Kết nối với `buildPrintData()`
`buildPrintData()` hiện trả thêm:

```js
erpInvoiceV46: structuredInvoicePayload
```

Nguồn này dùng chung cho in đơn, app giao hàng, app bán hàng và đơn tổng.

### 8. Export hàm mới
Đã export:

```js
module.exports = {
  buildPrintData,
  buildDeliveryInvoicePayload,
  formatMoney,
  formatDate,
  formatDateTime,
  numberToVietnameseWords
};
```

## Kiểm tra kỹ thuật
Đã chạy kiểm tra cú pháp:

```bash
node -c services/printDataBuilder.js
```

Kết quả: không lỗi cú pháp.
