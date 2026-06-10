# MOBILE SALES CART PACKING RATE FIXED

## Lỗi

App bán hàng hiển thị sai số lượng trong giỏ hàng: sản phẩm có quy cách 24, chấm lẻ 24 nhưng giỏ hàng hiển thị `24/0` thay vì `1/0`.

## Nguyên nhân

Dòng sản phẩm khi đưa vào giỏ hàng chỉ lưu số lượng lẻ (`quantity`) và giá, nhưng không lưu quy cách sản phẩm (`conversionRate` / `packingQty` / `unitsPerCase`). Khi render giỏ hàng, hàm hiển thị fallback về quy cách `1`, nên `24` bị hiểu là `24 thùng / 0 lẻ`.

## File đã sửa

- `public/mobile/js/sales.js`

## Nội dung sửa

1. Thêm hàm `normalizePackingRate()` để chuẩn hóa quy cách từ nhiều field:
   - `conversionRate`
   - `unitsPerCase`
   - `packingQty`
   - `packQty`
   - `pack`
   - `packageQty`

2. Thêm hàm `attachPackingRate()` để mọi dòng giỏ hàng luôn mang theo đủ:
   - `conversionRate`
   - `packingQty`
   - `unitsPerCase`

3. Sửa `toMobileProduct()` để sản phẩm lấy từ API/gợi ý luôn được chuẩn hóa quy cách trước khi chọn.

4. Sửa logic thêm sản phẩm vào giỏ:
   - Dòng mới: lưu kèm quy cách.
   - Dòng đã tồn tại: cộng dồn số lượng nhưng vẫn giữ/khôi phục quy cách.

5. Giữ nguyên quy tắc dữ liệu:
   - Database và Excel vẫn dùng số lượng lẻ.
   - App/phần mềm hiển thị dạng `thùng/lẻ`.

## Kết quả mong đợi

- Quy cách 24, nhập lẻ 24 → hiển thị `SL: 1/0`.
- Quy cách 24, nhập lẻ 25 → hiển thị `SL: 1/1`.
- Quy cách 24, nhập 2 thùng 3 lẻ → hiển thị `SL: 2/3`.

## Kiểm tra

Đã kiểm tra cú pháp bằng:

```bash
node --check public/mobile/js/sales.js
```
