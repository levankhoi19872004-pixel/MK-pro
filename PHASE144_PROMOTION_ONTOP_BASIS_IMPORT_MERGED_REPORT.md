# PHASE144 - Promotion Ontop Basis Merge + Import Template Update

## 1. Phạm vi xử lý

Tập trung riêng module:

- Khuyến mãi → Quản lý khuyến mại
- Popup `+ Tạo Điều kiện nhóm KM / Ontop`
- Import Excel loại `Điều kiện KM / Ontop`
- Runtime áp dụng khuyến mãi liên quan điều kiện nhóm/Ontop

Không sửa Công nợ (New), không sửa Đơn giao hôm nay (New), không xóa dữ liệu production.

## 2. Root cause / thiết kế cũ bất hợp lý

Trước Phase144, `SL nhóm SP` được tách thành một tab/rule riêng trong UI, trong khi nghiệp vụ thực chất chỉ khác `Điều kiện KM / Ontop` ở cách tính ngưỡng:

- Theo doanh số.
- Theo số lượng.

Việc tách tab làm người dùng phải quản lý hai nơi khác nhau cho cùng một cấu trúc chương trình: nhóm áp dụng, ngưỡng, CK%.

## 3. Thiết kế mới

Bỏ tab riêng `SL nhóm SP` trên UI. Tất cả điều kiện nhóm/Ontop dùng chung tab:

- `Điều kiện KM / Ontop`

Mỗi dòng điều kiện có thêm field:

```js
basis: 'ORDER_VALUE' | 'QUANTITY'
```

Ý nghĩa:

- `ORDER_VALUE`: Tính theo doanh số.
- `QUANTITY`: Tính theo số lượng.

Rule cũ thiếu `basis` được normalize mặc định là `ORDER_VALUE` để không phá dữ liệu cũ.

## 4. Frontend đã sửa

File chính:

- `public/fragments/index/06-index-body.html`
- `public/js/app/admin/08e-promotion-programs.js`

Thay đổi:

- Gỡ tab `SL nhóm SP` khỏi màn Quản lý khuyến mại.
- Gỡ popup/form riêng của `SL nhóm SP` để tránh UI chết/handler thừa.
- Trong popup `Điều kiện KM / Ontop`, thêm select `Tính theo`.
- Khi đổi `Tính theo`, label/placeholder ô ngưỡng đổi realtime:
  - `Doanh số từ` / `VD: 1000000`
  - `Số lượng từ` / `VD: 10`
- Bảng điều kiện thêm cột `TÍNH THEO` và `NGƯỠNG TỪ`.
- Khi thêm/sửa dòng điều kiện, payload gửi kèm `basis`.

## 5. Backend/service đã sửa

File chính:

- `src/models/PromotionGroupRule.js`
- `src/services/promotionService.js`
- `src/services/mongoIndexService.js`
- `src/domain/print/LegacyPromotionFallbackService.js`
- `src/repositories/printRepository.js`

Thay đổi:

- `PromotionGroupRule` thêm `basis` và `calculationBasis`.
- `saveGroupRule`, `listGroupRules`, `getPromotionProgramDetail`, `updatePromotionTier` đều normalize/persist `basis`.
- Validate:
  - `basis` chỉ nhận `ORDER_VALUE` hoặc `QUANTITY`.
  - `threshold/minAmount > 0`.
  - `discountPercent > 0`.
- Upsert key của condition nhóm/Ontop gồm:
  - `programCode`
  - `groupCode`
  - `basis`
  - `minAmount`
- Runtime tính khuyến mãi nhóm/Ontop đã phân biệt:
  - `ORDER_VALUE`: so với tổng doanh số nhóm.
  - `QUANTITY`: so với tổng số lượng nhóm.
- Print fallback/repository cũng nhận basis để không lệch dữ liệu khi in/legacy fallback.

## 6. Import Excel đã sửa

File chính:

- `services/excelTemplateService.js`
- `src/services/import/core/importRow.util.js`
- `src/services/import/preview/importPreview.impl.js`
- `src/services/import/operations/adminImport.impl.js`

Thay đổi:

- Mẫu import `Điều kiện KM / Ontop` có thêm cột `Tính theo`.
- Cột `Ngưỡng từ` dùng chung cho doanh số hoặc số lượng.
- Không còn template riêng `Import CK theo số lượng nhóm SP` trong danh sách template built-in.
- Parser nhận các alias:
  - `Doanh số`, `doanh so`, `ds`, `ORDER_VALUE`, `REVENUE` → `ORDER_VALUE`
  - `Số lượng`, `so luong`, `sl`, `QUANTITY` → `QUANTITY`
- Nếu thiếu `Tính theo`, mặc định `ORDER_VALUE` để tương thích file cũ.
- Preview/commit import validate theo basis.

## 7. Cách xử lý dữ liệu cũ `SL nhóm SP`

Chọn phương án an toàn:

- Không xóa dữ liệu cũ.
- UI không còn tạo mới `SL nhóm SP` riêng.
- Backend/API legacy `quantityGroupDiscounts` được giữ để không phá dữ liệu hoặc tích hợp cũ.
- Runtime legacy vẫn còn khả năng đọc rule cũ, trong khi rule mới đi theo `Điều kiện KM / Ontop` với `basis = QUANTITY`.

Nếu muốn hiển thị toàn bộ dữ liệu cũ `SL nhóm SP` chung trong tab `Điều kiện KM / Ontop`, nên làm thêm script migration riêng có dry-run trước, không tự chạy khi startup.

## 8. File đã sửa/thêm

- `public/fragments/index/06-index-body.html`
- `public/js/app/admin/08e-promotion-programs.js`
- `services/excelTemplateService.js`
- `src/domain/print/LegacyPromotionFallbackService.js`
- `src/models/PromotionGroupRule.js`
- `src/repositories/printRepository.js`
- `src/services/import/core/importRow.util.js`
- `src/services/import/operations/adminImport.impl.js`
- `src/services/import/preview/importPreview.impl.js`
- `src/services/mongoIndexService.js`
- `src/services/promotionService.js`
- `test/promotion-advanced-rule-popup-static.test.js`
- `test/promotion-advanced-ui-import-static.test.js`
- `test/promotion-group-rule-basis-static.test.js`
- `RELEASE_MANIFEST.json`

## 9. Test đã chạy

PASS:

```bash
npm run check:syntax
npm run check:source-bundles
npm run docs:check
npm run check:release-manifest
node --test test/promotion-advanced-rule-popup-static.test.js test/promotion-advanced-ui-import-static.test.js test/promotion-group-rule-basis-static.test.js
```

Kết quả test trọng tâm:

- 8 tests
- 8 pass
- 0 fail

`npm test` chạy được nhiều suite và đã PASS 140 test trong shared suite chính, nhưng bị chặn bởi lỗi `source-size-budget` tồn tại từ baseline trước Phase144:

```txt
src/services/import/preview/importPreview.impl.js: > 40960 bytes
public/js/app/admin/08d-import-excel.source/part-01.jsfrag: > 24576 bytes
public/js/app/admin/08d-import-excel.source/part-02.jsfrag: > 24576 bytes
public/js/app/admin/08d-import-excel.part02.js: > 24576 bytes
```

Đã xác nhận lỗi size-budget này có sẵn trong ZIP đầu vào Phase143, không phát sinh mới hoàn toàn từ Phase144.

## 10. Rủi ro còn lại

- Dữ liệu `SL nhóm SP` cũ chưa được migrate hiển thị chung trong tab Ontop; backend/runtime vẫn giữ tương thích để không mất dữ liệu.
- Source-size-budget của module import Excel đang vượt ngân sách từ baseline cũ; cần một phase riêng để tách nhỏ import preview/import UI nếu muốn `npm test` full sạch tuyệt đối.

## 11. Hướng dẫn UI

Vào:

```txt
Khuyến mãi → Quản lý khuyến mại → Điều kiện KM / Ontop
```

Thao tác:

1. Bấm `+ Tạo rule`.
2. Nhập mã CTKM, nội dung, ngày, trạng thái.
3. Ở khu thêm điều kiện, chọn `Nhóm áp dụng`.
4. Chọn `Tính theo`:
   - `Tính theo doanh số`: nhập `Doanh số từ`.
   - `Tính theo số lượng`: nhập `Số lượng từ`.
5. Nhập `Chiết khấu %`.
6. Bấm `Thêm điều kiện`.
7. Bấm `Lưu chương trình`.

## 12. Hướng dẫn import Excel mẫu mới

Loại import:

```txt
Điều kiện KM / Ontop
```

Cột mẫu:

```txt
Mã CTKM
Nội dung chương trình
Từ ngày
Đến ngày
Tình trạng
Nhóm áp dụng
Tính theo
Ngưỡng từ
Chiết khấu %
Ghi chú
```

Quy tắc:

- `Tính theo = Doanh số`: `Ngưỡng từ` là số tiền doanh số.
- `Tính theo = Số lượng`: `Ngưỡng từ` là số lượng.
- Thiếu `Tính theo`: mặc định doanh số.
