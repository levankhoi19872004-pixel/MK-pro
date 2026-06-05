# V46 DMS Promo Zero Amount Import Fixed

## Scope
Khoanh vùng sửa duy nhất:
- `src/services/excelImportService.js`

Không đụng:
- Delivery
- AR Ledger
- Inventory posting
- Frontend UI
- Master order

## Root cause
Một số file DMS xuất hàng khuyến mại dưới dạng dòng có `Số lượng` bình thường nhưng `Thành tiền` / `Doanh số mỗi ngày` bằng `0`.
Luồng cũ chỉ nhận biết hàng KM qua cờ `Khuyến mại` hoặc các cột số lượng KM. Khi dòng KM không có cờ nhưng có số lượng và đơn giá, hệ thống coi là hàng bán và tính:
`amount = quantity * salePrice`.

## Fix
Thêm nhận diện dòng KM theo quy tắc:
- Có số lượng bán > 0
- Có cột thành tiền/doanh số rõ ràng
- Giá trị thành tiền/doanh số = 0

Khi đó:
- `saleQuantity = 0`
- `promoQuantity = số lượng trên dòng`
- item sinh ra có `lineType = PROMO`
- `isPromo = true`
- `price = 0`
- `amount = 0`

## Expected result
Hàng khuyến mại vẫn xuất kho nhưng không cộng tiền vào đơn con.
