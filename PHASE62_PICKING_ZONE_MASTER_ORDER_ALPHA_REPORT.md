# PHASE 62 — Khu bốc hàng HC/PC và in đơn tổng theo ABC

## 1. Mục tiêu nghiệp vụ

- Thay khái niệm **Kho mặc định** trên sản phẩm bằng **Khu bốc hàng khi in đơn tổng**.
- `HC` và `PC` chỉ là nhãn phân chia hàng để bốc và in, không phải kho tồn vật lý.
- Tồn kho nghiệp vụ tiếp tục dùng duy nhất `MAIN`.
- Một đơn tổng nghiệp vụ được in thành hai trang độc lập: `HC` trước, `PC` sau.
- Trong từng trang HC/PC, sản phẩm được sắp xếp tăng dần theo tên (ABC/A–Z), mã sản phẩm là tiêu chí phụ.

## 2. Thiết kế đã triển khai

### Danh mục sản phẩm

- Field mới: `Product.pickingZone` với giá trị `HC`, `PC`, `UNASSIGNED`.
- Giao diện đổi nhãn thành **Khu bốc hàng khi in đơn tổng**.
- API ghi mới/cập nhật chỉ ghi `pickingZone`; không ghi `warehouseCode` làm kho mặc định.
- Các field cũ `warehouseCode/defaultWarehouse/printGroup` chỉ được đọc để tương thích dữ liệu lịch sử.

### Tồn kho

- `STOCK_WAREHOUSE_CODE = MAIN` vẫn là nguồn xác định kho vật lý duy nhất.
- Phiếu nhập mới và đơn DMS import được ghim kho vật lý `MAIN` ở cấp chứng từ.
- `pickingZone` không được sử dụng trong `InventoryPostingService`, truy vấn tồn hoặc rebuild tồn.
- HC/PC trên item chỉ là metadata phục vụ in.

### Snapshot đơn hàng

Khi tạo/import đơn, item lưu:

- `pickingZoneAtOrder`: snapshot chuẩn cho bản in.
- `warehouseCodeAtOrder`: alias `KHO_HC/KHO_PC` chỉ để tương thích các mẫu in cũ.

Do đó thay đổi khu bốc trên danh mục sản phẩm không làm thay đổi bản in của đơn cũ đã có snapshot.

### In đơn tổng

- Chuẩn hóa item theo `pickingZone`.
- Gộp hàng theo `pickingZone + lineType + productCode + catalogPrice`.
- Thứ tự trang: `HC → PC → chưa phân loại`.
- Thứ tự sản phẩm trong mỗi trang: tên sản phẩm A–Z theo locale tiếng Việt, sau đó theo mã sản phẩm.
- Renderer sinh mỗi khu thành một `warehouse-picking-page`, vì vậy HC và PC là hai phiếu/trang in riêng nhưng không tạo hai master order trong MongoDB.

## 3. Tương thích và migration

Script mới:

```bash
npm run migrate:picking-zone:dry
npm run migrate:picking-zone
```

Quy tắc chuyển đổi:

- `KHO_HC`, `KHO HC`, `HC` → `HC`
- `KHO_PC`, `KHO PC`, `PC` → `PC`
- Không nhận diện được → `UNASSIGNED`
- `MAIN` bị bỏ qua vì là kho vật lý, không phải khu bốc.

Script mặc định chỉ dry-run; chỉ ghi MongoDB khi có `--write`. Các field cũ chưa bị xóa nên có thể rollback ứng dụng an toàn.

## 4. File chính đã thay đổi

- `src/models/Product.js`
- `src/utils/pickingZone.util.js`
- `src/services/productService.js`
- `src/repositories/productRepository.js`
- `src/services/orderLegacy.service.js`
- `src/mobile/mobileContext.js`
- `src/services/excelImportService.js`
- `src/services/importOrderService.js`
- `src/domain/print/PrintLineNormalizer.js`
- `src/domain/print/builders/MasterPickingBuilder.js`
- `services/printDataBuilder.legacy.js`
- `src/services/master-order/masterOrderLegacy.service.js`
- `public/index.html`
- `public/js/app/02-products.js`
- `services/excelTemplateService.js`
- `scripts/migrate-product-picking-zone.js`

## 5. Kiểm thử

- JavaScript syntax: **652 file đạt**.
- Full regression suite: **568/568 test đạt**.
- Test mới kiểm tra:
  - Chuẩn hóa HC/PC và bỏ qua `MAIN` khi tìm khu bốc.
  - HC được in trước PC.
  - Mỗi khu là một trang in riêng.
  - Sản phẩm trong từng trang được sắp xếp A–Z.
  - `pickingZone` không quyết định kho tồn.
  - Phiếu nhập và DMS import vẫn dùng kho vật lý `MAIN`.
  - UI/API sản phẩm không còn ghi `warehouseCode` làm kho mặc định.
  - Migration chỉ ghi dữ liệu khi dùng `--write`.

## 6. Triển khai đề xuất

1. Sao lưu collection `products`.
2. Deploy phiên bản Phase 62; code có fallback đọc dữ liệu cũ.
3. Chạy `npm run migrate:picking-zone:dry` và kiểm tra số bản ghi thay đổi.
4. Chạy `npm run migrate:picking-zone`.
5. Kiểm tra một đơn tổng có cả HC và PC:
   - hai trang in riêng;
   - tổng số lượng HC + PC bằng tổng đơn;
   - thứ tự tên hàng A–Z;
   - tồn kho chỉ còn/được ghi tại `MAIN`.
