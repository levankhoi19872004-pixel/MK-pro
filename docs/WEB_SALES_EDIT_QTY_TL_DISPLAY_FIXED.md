# Sửa lỗi dòng hàng không hiển thị khi sửa đơn bán và chuẩn hóa SL thùng/lẻ

## Nguyên nhân
- `public/js/app/05-sales-orders.js` gọi `displayQtyTL(i.quantity, i)` khi render bảng dòng hàng.
- Web app chưa có hàm dùng chung `displayQtyTL`, trong khi mobile đã có logic tương tự.
- Khi sửa đơn, dòng hàng cũng có thể thiếu `conversionRate / packingQty / unitsPerCase`, nên nếu chỉ fallback về `1` sẽ hiển thị sai dạng `24/0` thay vì `1/0` với sản phẩm quy cách 24.

## Đã sửa
1. Thêm các hàm dùng chung trong `public/js/app/01-utils-print-tabs.js`:
   - `normalizePackingRate()`
   - `formatQtyTL()`
   - `displayQtyTL()`
2. Export các hàm lên `window` để các module web khác dùng được.
3. Sửa `productLineMeta()` để luôn giữ đủ:
   - `conversionRate`
   - `packingQty`
   - `unitsPerCase`
4. Sửa `openSalesOrderEdit()` trong `public/js/app/05-sales-orders.js`:
   - Khi mở sửa đơn, ghép dữ liệu dòng hàng với catalog sản phẩm nếu dòng đơn thiếu quy cách.
   - Đảm bảo dòng hàng sau khi load sửa đơn luôn có quy cách để hiển thị đúng `thùng/lẻ`.
5. Giữ nguyên quy tắc dữ liệu:
   - Database và Excel vẫn dùng số lượng lẻ.
   - App/phần mềm chỉ hiển thị dạng `thùng/lẻ`.

## Test cú pháp
```bash
node --check public/js/app/01-utils-print-tabs.js
node --check public/js/app/05-sales-orders.js
```
