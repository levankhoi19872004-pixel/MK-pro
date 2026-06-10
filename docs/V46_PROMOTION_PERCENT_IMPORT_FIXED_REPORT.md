# V46 - Sửa import khuyến mại % chiết khấu

## Mục tiêu

Import file CK sản phẩm/nhóm của Unilever phải lưu được vào MongoDB dù mã sản phẩm chưa có trong danh mục `products`, đồng thời chuẩn hóa đúng giá trị chiết khấu dạng thập phân.

## Luồng dữ liệu chuẩn

```text
Excel CK sản phẩm
→ src/services/excelImportService.js
→ src/services/promotionService.js
→ promotionProductRules
```

```text
Excel nhóm sản phẩm KM
→ src/services/excelImportService.js
→ src/services/promotionService.js
→ promotionGroupItems
→ promotionGroupRules
```

## Đã sửa

1. Thêm `normalizeDiscountPercent(value)` trong `promotionService.js`:
   - `0.08` → `8`
   - `0.16` → `16`
   - `0.095` → `9.5`
   - số âm/rỗng → `0`

2. Áp dụng chuẩn hóa % cho:
   - `pickPromotionProductRulePayload()`
   - `pickPromotionGroupRulePayload()`
   - `saveProductRule()`
   - `saveGroupRule()`

3. Preview import không còn chặn khi sản phẩm chưa có trong danh mục:
   - chuyển lỗi “Mã sản phẩm không có trong danh mục” thành warning
   - dòng vẫn `valid = true` nếu không có lỗi bắt buộc khác

4. `saveProductRule()` cho phép lưu CK sản phẩm dù chưa tìm thấy product.

5. `saveGroupItem()` cho phép lưu nhóm sản phẩm KM dù chưa tìm thấy product.

6. Import đếm đúng:
   - `imported`
   - `skipped`
   - `errors`
   - `warnings`

7. Lưu thêm trạng thái đối soát sản phẩm:
   - `productMatched`
   - `missingProduct`
   - `source: "excel-import"`

8. Thêm index tập trung trong `mongoIndexService.js`:
   - `promotionProductRules`: `{ programCode: 1, productCode: 1 }` unique
   - `promotionGroupItems`: `{ programCode: 1, productCode: 1 }` unique
   - `promotionGroupRules`: `{ programCode: 1, minAmount: 1 }`

9. Frontend reload lại 3 tab khuyến mại sau import:
   - CK sản phẩm
   - Nhóm sản phẩm KM
   - Điều kiện nhóm KM

## Collection lưu đúng

- CK sản phẩm: `promotionProductRules`
- Nhóm sản phẩm KM: `promotionGroupItems`
- Điều kiện nhóm KM: `promotionGroupRules`

Không lưu CK % vào `promotions` và không lưu vào `orders.items[]`.
