# PHASE123 — Promotion Engine 2 Tabs Production Grade

## 1. Phạm vi xử lý

Triển khai **Phương án A — production-grade** cho module **Khuyến mại**:

1. **Tab SL nhóm SP**: cửa hàng mua đủ tổng số lượng nhiều sản phẩm trong cùng nhóm thì giảm `%` trên các dòng sản phẩm thuộc nhóm.
2. **Tab CK thêm theo DS**: chỉ khách hàng nằm trong danh sách được giảm thêm `%` khi tổng doanh số đơn đạt ngưỡng.

Trọng tâm là chuẩn hóa engine tính khuyến mại tập trung, có API/server validation, UI quản trị, import Excel và test chống tính trùng.

## 2. Tổng quan hiện trạng trước khi sửa

| Khu vực | Hiện trạng |
|---|---|
| `promotionProductRules` | Đang phục vụ rule chiết khấu trực tiếp theo sản phẩm. |
| `promotionGroupItems` | Đang lưu nhóm sản phẩm KM / sản phẩm thuộc nhóm. |
| `promotionGroupRules` | Đang lưu rule theo nhóm sản phẩm kiểu cũ. |
| `promotions` | Collection generic đã tồn tại nhưng chưa được chuẩn hóa đầy đủ cho 2 rule mới. |
| Tạo/sửa đơn | Chủ yếu đi qua `promotionService.calculatePromotions(...)`; trước Phase123 chưa truyền đầy đủ `customerCode` cho rule cấp khách hàng. |
| Import KM | Đã có preview/commit cho nhóm sản phẩm KM sau Phase122, nhưng chưa có template/import cho 2 rule mới. |
| Rủi ro | Nếu thêm logic rời rạc ở UI hoặc từng màn sẽ dễ tính trùng chiết khấu khi tạo/sửa/import đơn. |

## 3. Quyết định kiến trúc

Đã chọn **Phương án A** vì 2 rule mới ảnh hưởng trực tiếp đến giá bán, chiết khấu, đơn hàng và báo cáo. Nếu chỉ vá riêng UI/API, hệ thống dễ phát sinh sai lệch khi sửa đơn hoặc khi mobile/web/import dùng luồng tính khác nhau.

### 3.1. Rule type mới

```js
QUANTITY_GROUP_PERCENT_DISCOUNT
CUSTOMER_ORDER_VALUE_EXTRA_PERCENT
```

### 3.2. Engine tập trung

Tạo mới:

```text
src/services/promotion/promotionEngine.service.js
```

Engine nhận input chuẩn:

```js
{
  customerCode,
  orderDate,
  items: [
    { productCode, quantity, baseQty, salePrice, lineAmount }
  ],
  rules: []
}
```

Engine trả output chuẩn:

```js
{
  items,
  orderDiscounts,
  summary,
  appliedPromotions,
  warnings
}
```

## 4. Công thức tính chiết khấu

### 4.1. Tab SL nhóm SP

Với rule `QUANTITY_GROUP_PERCENT_DISCOUNT`:

1. Lọc các dòng đơn có `productCode` nằm trong `productCodes` của rule.
2. Cộng tổng số lượng theo `baseQty` hoặc `quantity`.
3. Nếu tổng số lượng >= `minQty`:
   - Tính giảm giá trên **các dòng sản phẩm thuộc nhóm**.
   - Không giảm toàn đơn mặc định.
4. Ghi `appliedPromotions` vào từng dòng.
5. Chặn áp dụng trùng cùng `promotionCode`.

Ví dụ đã có test:

```text
A = 5 dây, B = 7 dây, minQty = 12, discount = 17%
=> Đạt 12 dây
=> Giảm 17% trên nhóm sản phẩm
```

### 4.2. Tab CK thêm theo DS

Với rule `CUSTOMER_ORDER_VALUE_EXTRA_PERCENT`:

1. Kiểm tra `customerCode` có trong `customerCodes`.
2. Tính nền mặc định theo `after_line_promotions`.
3. Nếu baseAmount >= `minOrderAmount`:
   - Tạo `orderDiscount` cấp đơn.
   - Phân bổ chiết khấu cấp đơn ngược về các dòng theo tỷ trọng để tương thích với các màn/in/báo cáo đang đọc chiết khấu dòng.
4. Chặn áp dụng trùng cùng `promotionCode`.

Ví dụ đã có test:

```text
customerCode = B0038442, minOrderAmount = 2.000.000, discount = 3%
amount = 2.100.000
=> Giảm thêm 3%
```

## 5. API mới

Bổ sung route production-grade:

```text
GET    /api/promotions/quantity-group-discounts
POST   /api/promotions/quantity-group-discounts
PUT    /api/promotions/quantity-group-discounts/:id
DELETE /api/promotions/quantity-group-discounts/:id

GET    /api/promotions/customer-order-value-discounts
POST   /api/promotions/customer-order-value-discounts
PUT    /api/promotions/customer-order-value-discounts/:id
DELETE /api/promotions/customer-order-value-discounts/:id
```

Các API này dùng server-side validation, không chỉ dựa vào frontend.

## 6. UI đã bổ sung

Trong module **Khuyến mại**, bổ sung 2 tab:

| Tab | Mục đích |
|---|---|
| `SL nhóm SP` | Quản trị rule mua đủ số lượng nhóm sản phẩm giảm %. |
| `CK thêm theo DS` | Quản trị rule khách hàng trong danh sách đạt doanh số đơn giảm thêm %. |

Mỗi tab có:

- Danh sách rule.
- Nút tạo mới/sửa/xóa.
- Form quản trị rule.
- Field hiệu lực ngày.
- Trạng thái active.
- Message scoped trong module khuyến mại.

## 7. Import Excel đã bổ sung

### 7.1. Import CK theo số lượng nhóm SP

Import type:

```text
promotionQuantityGroupDiscounts
```

Template mới:

```text
Mã chương trình KM
Tên chương trình KM
Từ ngày
Đến ngày
Mã nhóm SP
Tên nhóm SP
Mã sản phẩm
Tên sản phẩm
Số lượng tối thiểu
Đơn vị tính
% chiết khấu
Trạng thái
Ghi chú
```

### 7.2. Import CK thêm theo DS khách hàng

Import type:

```text
promotionCustomerOrderValueDiscounts
```

Template mới:

```text
Mã chương trình KM
Tên chương trình KM
Từ ngày
Đến ngày
Mã khách hàng
Tên khách hàng
Doanh số đơn tối thiểu
% chiết khấu thêm
Cách tính nền
Trạng thái
Ghi chú
```

Preview/commit import có validate:

- Mã sản phẩm tồn tại.
- Mã khách hàng tồn tại.
- `%` chiết khấu trong khoảng 0–100.
- Số lượng/doanh số tối thiểu > 0.
- Gom nhiều dòng cùng mã chương trình thành một rule.

## 8. Hook vào luồng tính đơn

Đã mở rộng các điểm gọi `promotionService.calculatePromotions(...)` để truyền thêm ngữ cảnh:

- `customerCode`
- `date/orderDate/saleDate`

Các khu vực đã cập nhật:

```text
src/services/orderLegacy.service.js
src/services/orderLegacy.service.source/part-01.jsfrag
src/services/mobile/sales.service.js
src/services/mobile/sales.service.source/part-01b.jsfrag
src/services/mobile/sales.service.source/part-02.jsfrag
src/services/mobile/sales.service.source/part-03.jsfrag
```

Điều này giúp rule `CUSTOMER_ORDER_VALUE_EXTRA_PERCENT` có đủ dữ liệu để áp dụng đúng theo khách hàng và ngày hiệu lực.

## 9. File đã sửa/thêm chính

| File | Nội dung |
|---|---|
| `src/services/promotion/promotionEngine.service.js` | Engine tính 2 rule mới, chống duplicate promotion. |
| `src/services/promotionService.js` | Tích hợp rule mới, CRUD, tính toán, list/detail. |
| `src/models/Promotion.js` | Mở rộng schema cho promotionType, productCodes, customerCodes, minQty, minOrderAmount... |
| `src/repositories/promotionRepository.js` | Mở rộng search/filter cho rule mới. |
| `src/controllers/promotionController.js` | Controller CRUD cho 2 rule mới. |
| `src/routes/promotionRoutes.js` | API route cho 2 tab. |
| `public/fragments/index/06-index-body.html` | UI 2 tab mới và import option. |
| `public/js/app/admin/08e-promotion-programs.js` | Logic tab/form/list/detail cho rule mới. |
| `services/excelTemplateService.js` | Template Excel cho 2 import mới. |
| `src/models/ImportSession.js` | Thêm import type mới. |
| `src/services/import/core/importRow.util.js` | Parser row cho 2 template mới. |
| `src/services/import/preview/importPreview.impl.js` | Preview import cho 2 rule mới. |
| `src/services/import/operations/adminImport.impl.js` | Commit import cho 2 rule mới. |
| `src/services/import/handlers/PromotionQuantityGroupDiscountImportHandler.js` | Handler commit rule SL nhóm SP. |
| `src/services/import/handlers/PromotionCustomerOrderValueDiscountImportHandler.js` | Handler commit rule CK thêm theo DS. |
| `src/services/import/ImportCommitOrchestrator.js` | Đăng ký handler mới. |
| `src/services/import/importCommit.impl.js` | Truyền operation mới vào orchestrator. |
| `public/js/app/admin/08d-import-excel.js` | Refresh sau import 2 type mới. |
| `public/js/app/admin/08d-import-excel.part02.js` | Refresh sau import 2 type mới. |
| `public/js/app/admin/08d-import-excel.source/part-02.jsfrag` | Source fragment tương ứng. |
| `test/promotion-engine-advanced.test.js` | Unit test engine tính 2 rule mới. |
| `test/promotion-advanced-ui-import-static.test.js` | Static test UI/API/import cho 2 tab. |

## 10. Kết quả test

### Pass

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1194 JavaScript files
```

### Pass targeted tests

```bash
node --test test/promotion-engine-advanced.test.js test/promotion-advanced-ui-import-static.test.js
```

Kết quả:

```text
7 tests pass
```

### Chưa pass do môi trường sandbox thiếu dependency

```bash
npm run check:source-bundles
npm test
```

Lý do:

```text
Error: Cannot find module 'terser'
Require stack:
- scripts/build-source-bundles.js
```

`npm test` dừng ở `pretest` vì `check:source-bundles` cần `terser`. Trên máy dev có `node_modules` đầy đủ, cần chạy lại:

```bash
npm install
npm run check:syntax
npm run check:source-bundles
npm test
```

## 11. Cách test thủ công

### 11.1. Tab SL nhóm SP

1. Vào **Khuyến mại → SL nhóm SP**.
2. Tạo rule:
   - Mã chương trình: `QTY-GROUP-COMFORT-SURF-202607`
   - Mã nhóm SP: `NXV_COMFORT_SURF`
   - Product codes: nhập nhiều mã SP thuộc nhóm.
   - MinQty: `12`
   - Discount: `17%`
3. Tạo/sửa đơn có:
   - SP A = 5
   - SP B = 7
4. Kỳ vọng: tổng 12, giảm 17% trên các dòng SP thuộc nhóm.
5. Đổi thành 6 + 5 = 11, kỳ vọng không giảm.

### 11.2. Tab CK thêm theo DS

1. Vào **Khuyến mại → CK thêm theo DS**.
2. Tạo rule:
   - Customer codes: `B0038442`, `B0038423`
   - MinOrderAmount: `2000000`
   - Discount: `3%`
3. Tạo đơn cho `B0038442` tổng sau KM dòng >= 2.000.000.
4. Kỳ vọng: giảm thêm 3%.
5. Tạo đơn cho khách ngoài danh sách dù đủ 3.000.000, kỳ vọng không giảm.

### 11.3. Import Excel

1. Vào **Import dữ liệu Excel**.
2. Tải mẫu:
   - `Import CK theo số lượng nhóm SP`
   - `Import CK thêm theo doanh số KH`
3. Điền dữ liệu theo mẫu.
4. Bấm **Xem trước đơn import**.
5. Kỳ vọng preview báo rõ dòng hợp lệ/lỗi, không báo lỗi chung chung.
6. Commit import và kiểm tra rule xuất hiện trong tab tương ứng.

## 12. Rủi ro còn lại

| Rủi ro | Mức độ | Ghi chú |
|---|---:|---|
| Source bundle hash chưa kiểm tra được trong sandbox | Medium | Do thiếu `terser`. Cần chạy lại trên máy dev. |
| Báo cáo cũ có thể chưa tách rõ order-level discount | Medium | Phase123 phân bổ CK đơn về dòng để tương thích; sau này nên bổ sung cột riêng `orderDiscountAmount`. |
| In đơn cũ có thể chưa hiển thị tên rule cấp đơn | Low/Medium | Tiền đã được phân bổ vào dòng, nhưng nếu muốn hiển thị rule riêng cần bổ sung UI in. |
| Chính sách stack/exclusive mới ở mức nền | Low | Đã có field `stackPolicy`; nếu cần exclusive phức tạp hơn nên thêm phase rule priority/exclusion. |

## 13. Kết luận

Phase123 đã xây dựng nền production-grade cho 2 tab khuyến mại mới, gồm UI quản trị, API, import Excel, engine tính tập trung và test cốt lõi. Logic chiết khấu không hardcode riêng ví dụ COMFORT/SURF, không tính trực tiếp ở UI, và đã hook vào luồng tạo/sửa đơn để tránh tính sai khi rule phụ thuộc khách hàng.
