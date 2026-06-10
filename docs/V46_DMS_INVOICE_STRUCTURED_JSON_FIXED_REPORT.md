# V46 - Đưa mẫu phiếu giao nhận DMS vào file

## Mục tiêu
Chuẩn hóa mẫu `PHIẾU GIAO NHẬN VÀ THANH TOÁN` theo cấu trúc ERP V46:

```js
{
  header: {},
  customer: {},
  salesStaff: {},
  distributor: {},
  items: [],
  promotions: [],
  offsets: [],
  summary: {}
}
```

## File đã sửa

### 1. `src/repositories/printRepository.js`
- Thêm `enrichSalesOrderForPrint()`.
- Khi in đơn con/DMS invoice, hệ thống tự đọc danh mục `products` theo mã hàng.
- Gắn vào từng dòng hàng:
  - `catalogSalePrice`
  - `catalogConversionRate`
  - `productSnapshot.salePrice`
  - `productSnapshot.conversionRate`

Mục tiêu: cột giá bán và quy cách luôn lấy theo danh mục sản phẩm, không đoán từ tên hàng.

### 2. `services/printDataBuilder.js`
- Chuẩn hóa cột bảng sản phẩm:
  - Cột 1 `CS/SU` = `quantity / conversionRate`.
  - Cột 2 `qty` = số lượng lẻ.
  - Cột 3 `priceBeforeTax` = `priceAfterTaxBeforePromotion / 1.08`.
  - Cột 4 `priceAfterTaxBeforePromotion` = `products.salePrice`.
  - Cột 5 `priceAfterPromotion` = nếu có `%CK` thì `cột 4 - cột 4 * %CK`, nếu bán thẳng thì lấy giá người tạo đơn.
  - Cột 6 `vatAmount` = VAT theo giá sau khuyến mại.
  - Cột 7 `lineAmount` = `priceAfterPromotion * qty`.
- Bổ sung alias dữ liệu đúng mẫu:
  - `productCode`, `productName`
  - `cartonQty`, `unitQty`
  - `priceBeforeTax`
  - `priceAfterTaxBeforePromotion`
  - `priceAfterPromotion`
  - `vatAmount`
  - `lineAmount`
- Bổ sung chuẩn promotions:
  - `promotionCode`
  - `description`
  - `qualifiedAmount`
  - `discountPercent`
  - `discountBeforeTax`
  - `discountAfterTax`
- Bổ sung chuẩn offsets:
  - `programCode`
  - `description`
  - `month`
  - `offsetAmount`
- Bổ sung `erpInvoiceV46` làm cấu trúc dữ liệu chuẩn để app bán hàng, app giao hàng, đơn tổng và mẫu in dùng chung.

## Quy tắc tính cột đã áp dụng

Ví dụ quy cách = 4:

```text
qty = 2  => 0/2
qty = 6  => 1/2
qty = 8  => 2/0
```

Công thức:

```js
cartonQty = Math.floor(qty / conversionRate)
unitQty = qty % conversionRate
```

## Khuyến mại
Mẫu in giữ phần:

```text
CHI TIẾT KHUYẾN MÃI: (B+C)
```

với các cột:

```text
Mã CTKM Tiền
Khuyến mãi bằng tiền
Giá trị hàng hóa mua
% chiết khấu
Tiền CK trước thuế
Tiền CK sau thuế
```

## Cấn trừ nợ / thưởng trưng bày
Mẫu in giữ phần:

```text
CHI TIẾT CẤN TRỪ NỢ:(D+E)
```

với các cột:

```text
Mã CT Trưng bày
Nội dung Chương trình trưng bày
Tháng trưng bày
Chi trả trưng bày hàng hóa
Số lượng thùng/lẻ
Chi trả trưng bày cấn trừ nợ
```
