# V46 Mobile Promotion Locked Price - Fixed

## Khoanh vùng sửa

Các thay đổi được khoanh vùng bằng marker:

- `MOBILE_PROMOTION_PRICE_LOCK_START / END`
- `ORDER_PROMOTION_PRICE_LOCK_START / END`
- `DELIVERY_LOCKED_PRICE_READ_START / END`
- `DMS_DIRECT_PRICE_LOCK_START / END`
- `PRINT_PROMOTION_TOTALS_START / END`
- `MOBILE_SALES_CART_PROMOTION_PRICE_DISPLAY_START / END`

## Nội dung

1. App bán hàng mobile tạo đơn bằng backend promotion engine và lưu tách bạch:
   - `originalPrice`, `grossPrice`, `grossAmount`
   - `unitPrice`, `salePrice`, `price`, `amount`, `netAmount`
   - `discountAmount`, `promotionAmount`, `promotionId`, `promotionCode`, `promotionName`
   - `priceLocked`, `lockedPrice`, `lockedPromotion`

2. Cấp đơn lưu tổng:
   - `grossAmount`, `totalGrossAmount`, `grossAmountBeforePromotion`
   - `discountAmount`, `totalDiscountAmount`, `promotionAmount`, `totalPromotionAmount`
   - `netAmount`, `goodsAmountAfterPromotion`

3. App giao hàng chỉ đọc `unitPrice` đã khóa, không gọi lại promotion engine.

4. Import DMS vẫn ép `DIRECT_PRICE`, khóa giá trực tiếp, không tính khuyến mại.

5. App bán hàng hiển thị giỏ hàng có giá gốc / KM / giá bán nếu đơn đã có khuyến mại.

6. In đơn ưu tiên dùng tổng trước KM / tiền KM / sau KM từ các field chuẩn mới.
