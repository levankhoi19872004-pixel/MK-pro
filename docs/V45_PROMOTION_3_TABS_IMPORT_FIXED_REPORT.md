# V45 - Promotion 3 Tabs + Import riêng từng tab

## Đã thực hiện

1. Tạo 3 collection nghiệp vụ mới:
   - `promotionProductRules`: Tab 1 - chiết khấu trực tiếp theo sản phẩm.
   - `promotionGroupItems`: Tab 2 - gán sản phẩm vào nhóm KM, import chính 2 cột.
   - `promotionGroupRules`: Tab 3 - điều kiện doanh số nhóm và mức chiết khấu.

2. Tạo 3 model mới:
   - `src/models/PromotionProductRule.js`
   - `src/models/PromotionGroupItem.js`
   - `src/models/PromotionGroupRule.js`

3. Mở rộng `src/services/promotionService.js`:
   - CRUD Tab 1, Tab 2, Tab 3.
   - Validate mã sản phẩm phải tồn tại trong danh mục sản phẩm.
   - Tự lấy tên sản phẩm từ danh mục sản phẩm.
   - Thêm hàm `calculatePromotions(items)`.

4. Quy tắc tính khuyến mại đã khóa cứng:
   - Doanh số dùng để xét khuyến mại = `quantity × product.salePrice`.
   - Không lấy giá nhập từ Excel.
   - Không lấy giá nhập tay trên đơn.
   - Tất cả CTKM đều tính theo `Giá bán` trong danh mục sản phẩm.

5. Tạo API mới:
   - `GET/POST/DELETE /api/promotions/product-rules`
   - `GET/POST/DELETE /api/promotions/group-items`
   - `GET/POST/DELETE /api/promotions/group-rules`
   - `POST /api/promotions/calculate`

6. Cập nhật màn hình Khuyến mại:
   - Tab 1: CK sản phẩm.
   - Tab 2: Nhóm sản phẩm KM.
   - Tab 3: Điều kiện nhóm KM.

7. Cập nhật mục Import dữ liệu:
   - Import CK sản phẩm.
   - Import nhóm sản phẩm KM.
   - Import điều kiện nhóm KM.

8. Tạo mẫu Excel riêng cho từng loại import:
   - `mau-import-ck-san-pham.xlsx`
   - `mau-import-nhom-san-pham-km.xlsx`
   - `mau-import-dieu-kien-nhom-km.xlsx`

## Quy tắc nghiệp vụ

### Tab 1 - CK sản phẩm
Cột hiển thị:
- Mã chương trình
- Nội dung chương trình
- Mã sản phẩm
- Tên sản phẩm
- Chiết khấu

### Tab 2 - Nhóm sản phẩm KM
Import chính chỉ cần:
- Mã chương trình KM
- Mã sản phẩm

Các sản phẩm cùng `Mã chương trình KM` được hiểu là 1 nhóm sản phẩm.

### Tab 3 - Điều kiện nhóm KM
Cột hiển thị:
- Mã nhóm sản phẩm
- Nội dung chương trình KM
- Mức doanh số cần lấy
- Chiết khấu

Nếu 1 mã nhóm có nhiều mức, mỗi mức là 1 dòng riêng.

## Đã test

- `node -c src/services/promotionService.js`: OK
- `node -c src/services/excelImportService.js`: OK
- `node -c src/controllers/promotionController.js`: OK
- `node -c public/js/app/08-reports-users-promotions-import-excel.js`: OK
- `npm run docs:generate`: OK
- `npm test`: 14/14 test pass
