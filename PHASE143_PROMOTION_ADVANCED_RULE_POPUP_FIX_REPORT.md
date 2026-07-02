# Phase143 - Promotion Advanced Rule Popup Fix

## Phạm vi

Màn: `Khuyến mãi -> Quản lý khuyến mại`.

Tập trung riêng 2 tab mới:

- `SL nhóm SP`
- `CK thêm theo DS`

## Root cause thật

2 tab mới đã có UI danh sách, form chi tiết và backend API lưu rule, nhưng controller popup frontend chỉ khai báo popup cho 3 tab cũ:

- `productRules`
- `groupItems`
- `groupRules`

Khi bấm `+ Tạo rule` ở `quantityGroupDiscounts` hoặc `customerOrderValueDiscounts`, hàm `openPromotionWorkspace(type, 'create')` không tìm được `overlay/body/title/subtitle` tương ứng trong `popupConfig`, nên thoát sớm và không mở popup.

## Sửa frontend

- Bổ sung popup riêng cho `quantityGroupDiscounts`.
- Bổ sung popup riêng cho `customerOrderValueDiscounts`.
- Mở rộng `popupConfig` để map đúng 2 tab mới vào popup tương ứng.
- Title khi tạo mới hiển thị đúng nghiệp vụ:
  - `Tạo rule SL nhóm SP`
  - `Tạo rule CK thêm theo DS`
- Giữ cơ chế popup tách riêng, không dùng popup chung lẫn nghiệp vụ.
- Bổ sung required/min cơ bản cho form 2 rule mới để chặn lỗi nhập liệu từ UI trước khi gọi API.

## Backend/API

Backend đã có sẵn endpoint và service cho 2 loại rule mới, không cần tạo endpoint mới:

- `POST /api/promotions/quantity-group-discounts`
- `PUT /api/promotions/quantity-group-discounts/:id`
- `POST /api/promotions/customer-order-value-discounts`
- `PUT /api/promotions/customer-order-value-discounts/:id`

Service hiện có đã validate:

- Mã chương trình bắt buộc.
- Tên chương trình bắt buộc.
- Sản phẩm/khách hàng áp dụng bắt buộc.
- Số lượng/doanh số tối thiểu phải > 0.
- Chiết khấu % phải > 0 và <= 100.
- `CK thêm theo DS` kiểm tra mã khách hàng tồn tại.

## Contract dữ liệu

### SL nhóm SP

Lưu trong `promotions` với:

- `type/promotionType: QUANTITY_GROUP_PERCENT_DISCOUNT`
- `programCode/code`
- `programName/name`
- `productGroupCode`
- `productGroupName`
- `productCodes[]`
- `minQty`
- `qtyUnit`
- `discountType: percent`
- `discountPercent`
- `applyScope`
- `startDate/endDate`
- `isActive`

### CK thêm theo DS

Lưu trong `promotions` với:

- `type/promotionType: CUSTOMER_ORDER_VALUE_EXTRA_PERCENT`
- `programCode/code`
- `programName/name`
- `customerCodes[]`
- `minOrderAmount`
- `discountType: percent`
- `discountPercent`
- `baseAmountMode`
- `applyScope`
- `startDate/endDate`
- `isActive`

## File đã sửa/thêm

- `public/fragments/index/06-index-body.html`
- `public/js/app/admin/08e-promotion-programs.js`
- `test/promotion-advanced-rule-popup-static.test.js`
- `PHASE143_PROMOTION_ADVANCED_RULE_POPUP_FIX_REPORT.md`

## Test đã chạy

PASS:

```bash
npm run check:syntax
npm run check:source-bundles
node --test test/promotion-advanced-rule-popup-static.test.js
```

Đã thử chạy `npm test`; lệnh chạy qua nhiều test và không thấy failure trong phần log đã chạy, nhưng bị timeout trong môi trường sandbox trước khi hoàn tất toàn bộ suite.

## Hướng dẫn test UI

1. Vào `Khuyến mãi -> Quản lý khuyến mại`.
2. Chọn tab `SL nhóm SP`.
3. Bấm `+ Tạo rule`.
4. Popup `Tạo rule SL nhóm SP` phải mở ra.
5. Nhập dữ liệu và bấm `Lưu rule`.
6. Chọn tab `CK thêm theo DS`.
7. Bấm `+ Tạo rule`.
8. Popup `Tạo rule CK thêm theo DS` phải mở ra.
9. Tạo thành công thì danh sách đúng tab được reload.

## Rủi ro còn lại

- API hiện tại dùng `upsert` theo mã chương trình để hỗ trợ import/cập nhật an toàn. Vì vậy nếu nhập lại cùng mã CTKM, hệ thống có thể cập nhật rule hiện có thay vì báo trùng tuyệt đối. Đây là hành vi đang dùng chung với import promotion, chưa đổi để tránh phá luồng import.
