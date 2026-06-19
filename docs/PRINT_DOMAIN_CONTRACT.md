# Print Domain Contract

## 1. Profiles

### SALES_INVOICE

Used for single and batch sales-order invoices from Web, mobile sales, and DMS imports.

Canonical endpoint:

- `GET /api/print/orders/:id`
- `POST /api/print/orders/batch`

### WAREHOUSE_PICKING

Used for master-order picking, aggregate import orders, and master return orders.

Canonical endpoints:

- `GET /api/print/master-orders/:id`
- `POST /api/print/master-orders/batch`
- `GET /api/print/import-orders/:id`
- `POST /api/print/import-orders/aggregate`
- `GET /api/print/master-return-orders/:id`
- `POST /api/print/master-return-orders/batch`

## 2. Historical data precedence

Print data must use the order-line snapshot first:

1. `catalogSalePriceAtOrder`
2. `finalPrice`
3. `conversionRateAtOrder`
4. `warehouseCodeAtOrder`
5. `appliedPromotionRows`
6. `productSnapshot`

The current `products` catalog is only a compatibility fallback for legacy documents missing snapshot values. Legacy promotion-rule lookup may fill missing promotion descriptions, but must not overwrite historical price, pack, warehouse, or existing promotion rows.

## 3. Canonical line merge key

Lines may be merged only when all fields below are equal:

```text
warehouseCode + lineType + productCode + normalizedUnitPrice
```

`lineType` is one of:

- `SALE`
- `PROMO`
- `IMPORT`
- `RETURN`

Products from different warehouses, different line types, or different unit prices must stay on separate lines.

## 4. Canonical dates

| Document | Canonical date |
|---|---|
| Sales order | `orderDate` |
| Master order | `deliveryDate` |
| Import order | `importDate` / `documentDate` |
| Return order | `returnDate` |
| Payment receipt | `receiptDate` |

`createdAt` is legacy fallback only.

## 5. Canonical staff fields

Printing must use business fields only:

- `salesStaffCode`, `salesStaffName`
- `deliveryStaffCode`, `deliveryStaffName`

Generic `staffCode` / `staffName` must not identify NVBH or NVGH in new print code.

## 6. Layout tokens

The final layout layer is `public/print-tokens.css`, loaded after `public/print.css`.

- Paper: A4 portrait
- Page margin: 8 mm
- Font: Arial
- Body: 9 pt
- Metadata: 8.5 pt
- Title: 15 pt
- Line height: 1.15
- Cell padding: 1.2 mm vertical / 1 mm horizontal
- Section gap: 3 mm
- Signature area: minimum 18 mm

### SALES_INVOICE widths

```text
4% | 9% | 31% | 7% | 6% | 9% | 9% | 9% | 7% | 9%
```

### WAREHOUSE_PICKING widths

```text
4% | 13% | 39% | 10% | 8% | 11% | 15%
```

Both profiles total exactly 100%.

## 7. Frontend boundary

Frontend code may only:

1. collect document IDs;
2. call a canonical print endpoint;
3. open the returned HTML.

Frontend must not calculate product price, warehouse, pack conversion, promotion, return amount, aggregate quantity, or aggregate total for printing.

## SALES_INVOICE_DMS_EXACT_V1 - Đơn con theo mẫu Invoice-36

Profile đơn con không dùng hệ token A4 của chứng từ kho. Đây là profile cố định theo mẫu đối chiếu `Invoice-36(7).pdf`:

- Khổ giấy: US Letter dọc, 612 x 792 pt.
- Hai liên: in toàn bộ Liên 1, sau đó toàn bộ Liên 2.
- Header lặp trên mọi trang và hiển thị `Trang: n/tổng` riêng cho từng liên.
- Bảng hàng hóa: 10 cột, tổng chiều rộng 572,76 pt.
- Khóa dữ liệu lịch sử: giá, quy cách, VAT và thành tiền ưu tiên snapshot trên dòng đơn.
- Dòng hàng không bị cắt giữa trang; STT tiếp tục xuyên trang.
- Tổng tiền/chữ ký chỉ xuất hiện sau dòng hàng cuối.
- Khuyến mại và cấn trừ được phân trang theo chiều cao ước lượng, lặp header bảng khi sang trang.

Các file canonical:

```text
src/domain/print/builders/DmsExactSalesInvoiceBuilder.js
src/domain/print/DmsExactPagination.js
templates/print/dmsExactSalesInvoice.template.js
public/dms-exact-sales-invoice.css
```

Không được đưa logic đơn con exact trở lại `public/print.css` hoặc template kho 7 cột.
