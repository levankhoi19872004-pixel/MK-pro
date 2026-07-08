# PHASE206 - DMS Gap Simulator đọc nguồn có sẵn trong MK-Pro

## 1. Bối cảnh

Phase205 đã thêm module `Sinh đơn chấm DMS` nhưng còn hiểu file upload là workbook tự chứa đủ 3 sheet:

- Sheet sản phẩm lệch DMS
- Sheet nhóm KM/Ontop
- Sheet khách cần chấm

Sau khi rà soát nghiệp vụ thực tế, dữ liệu sản phẩm lệch DMS và nhóm KM/Ontop đã có sẵn trong MK-Pro. File upload hằng ngày chỉ nên là danh sách khách hàng cần chấm.

## 2. Điều chỉnh chính

Module `Sinh đơn chấm DMS` chuyển sang mô hình nguồn dữ liệu hybrid/read-only:

```txt
File Excel upload: chỉ đọc khách hàng cần chấm
Sản phẩm lệch DMS: đọc từ MK-Pro Kho → Đối chiếu tồn DMS latest completed
Nhóm KM/Ontop: đọc từ MK-Pro promotionGroupItems + promotionGroupRules
Thuật toán: vẫn chạy trong RAM và xuất Excel tham khảo
```

## 3. API giữ nguyên

```txt
POST /api/tools/dms-gap-simulator/preview
POST /api/tools/dms-gap-simulator/export
```

`preview` hiện nhận file khách hàng + config, sau đó backend tự đọc dữ liệu nội bộ MK-Pro.

## 4. Nguồn dữ liệu mới

### 4.1. Khách hàng cần chấm

Đọc từ Excel upload, yêu cầu cột logic:

```txt
Mã khách hàng
Tên khách hàng
Chỉ tiêu cần chấm
```

Nếu file chỉ có một sheet, module tự lấy sheet đầu tiên làm danh sách khách.

### 4.2. Sản phẩm lệch DMS

Đọc từ service đối chiếu tồn DMS hiện có:

```txt
src/services/dmsInventoryReconciliation.service.js#getLatest
```

Cho phép chọn loại lệch:

```txt
DMS nhiều hơn thực tế
Thực tế nhiều hơn DMS
```

Quy đổi số lượng:

```txt
DMS nhiều hơn thực tế  → dùng dmsExcessQty
Thực tế nhiều hơn DMS → ưu tiên allocation.remainingQty, fallback internalExcessQty
```

Giá bán lấy từ danh mục sản phẩm MK-Pro:

```txt
products.salePrice hoặc products.price
```

Sản phẩm thiếu giá bán sẽ bị cảnh báo và bỏ qua.

### 4.3. Nhóm KM/Ontop

Đọc từ:

```txt
promotionGroupItems
promotionGroupRules
```

Chỉ dùng rule đang active theo ngày áp dụng. Mặc định ngày áp dụng là hôm nay.

Rule nhóm tính theo doanh số (`ORDER_VALUE`) được dùng làm target nhóm.
Rule nhóm tính theo số lượng được cảnh báo và bỏ qua trong module mô phỏng doanh số.

## 5. UI đã chỉnh

Màn `Công cụ → Sinh đơn chấm DMS` hiện có:

```txt
File Excel khách cần chấm
Loại sản phẩm lệch DMS
Ngày áp dụng nhóm KM/Ontop
Cấu hình nâng cao
Sinh đơn tham khảo
Xuất Excel kết quả
```

Mô tả UI đã nhấn mạnh:

```txt
File chỉ cần khách hàng cần chấm.
Sản phẩm lệch DMS và nhóm KM/Ontop đọc từ MK-Pro.
```

## 6. An toàn dữ liệu

Module chỉ đọc dữ liệu từ MK-Pro và không ghi nghiệp vụ thật.

Không gọi:

```txt
order service
accounting service
inventory posting service
delivery closeout service
promotion write service
```

Không tạo:

```txt
orders
master_orders
arLedgers
fundLedgers
stockTransactions
returnOrders
deliveryCloseout
```

## 7. File thay đổi chính

```txt
src/services/tools/dmsGapSimulator.service.js
src/routes/tools/dmsGapSimulator.routes.js
public/fragments/index/06b-dms-gap-simulator.html
public/js/app/tools/dms-gap-simulator.js
PHASE206_DMS_GAP_SIMULATOR_MKPRO_SOURCE_FIX_REPORT.md
```

## 8. Kiểm tra đã chạy

```txt
npm run check:syntax
npm run check:source-size
```

Kết quả:

```txt
SYNTAX_OK 1327 JavaScript files
[source-size-budget] OK
```

## 9. Cách test nhanh

1. Vào `Kho → Đối chiếu tồn DMS`, đảm bảo đã có một lần chốt file DMS completed.
2. Vào `Khuyến mại`, đảm bảo tab phân nhóm và khuyến mại nhóm đã có dữ liệu active.
3. Vào `Công cụ → Sinh đơn chấm DMS`.
4. Upload file Excel chỉ gồm danh sách khách cần chấm.
5. Chọn loại lệch DMS.
6. Bấm `Sinh đơn tham khảo`.
7. Kiểm tra các tab:
   - Đơn tham khảo
   - Chi tiết sản phẩm
   - Nhóm khuyến mại
   - Sản phẩm lệch DMS
   - Cảnh báo
8. Xuất Excel kết quả.

## 10. Giới hạn hiện tại

- Module đang dùng nhóm KM dạng doanh số từ `promotionGroupRules`.
- Rule nhóm tính theo số lượng chưa được đưa vào score doanh số.
- Nếu sản phẩm lệch DMS không có giá bán danh mục thì bỏ qua để tránh sinh sai tiền.
- Module vẫn là công cụ tham khảo, không tạo đơn thật.
