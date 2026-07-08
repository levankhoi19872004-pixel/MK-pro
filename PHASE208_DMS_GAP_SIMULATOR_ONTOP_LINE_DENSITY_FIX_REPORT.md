# PHASE208 - DMS Gap Simulator Ontop Line Density Fix

## Mục tiêu

Sửa lỗi nghiệp vụ trong module `Công cụ: Sinh đơn chấm DMS`:

- Đơn tham khảo sinh ra quá ít dòng hàng.
- Thuật toán chọn một SKU số lượng lớn để khớp chỉ tiêu khách, làm nhiều đơn chỉ có 1-2 dòng.
- Nhóm KM/Ontop đang được đánh giá theo tổng toàn bộ kịch bản, trong khi điều kiện Ontop thực tế cần đạt theo từng đơn/khách.
- Nhiều dòng hàng thuộc nhóm KM có giá trị thấp hơn ngưỡng nên không đủ điều kiện ăn Ontop.

## Nguyên nhân

Bản cũ tối ưu chủ yếu theo:

- Tổng tiền đơn gần chỉ tiêu khách.
- Tổng doanh số nhóm KM toàn kịch bản.
- Không vượt số lượng lệch DMS.

Nhưng chưa tối ưu theo:

- Số dòng tối thiểu trên mỗi đơn.
- Tỷ trọng tối đa của một SKU trong một đơn.
- Ngưỡng KM/Ontop theo từng đơn.
- Tránh tạo dòng nhóm KM bị “treo” dưới ngưỡng.

## Thay đổi chính

### Backend

File: `src/services/tools/dmsGapSimulator.service.js`

Đã thêm:

- `lineStrategy` trong cấu hình thuật toán:
  - `minLinesPerOrder`: mặc định 3
  - `maxLinesPerOrder`: mặc định 8
  - `targetAmountPerLine`: mặc định 900.000đ
  - `maxSkuValueRatio`: mặc định 0.65
  - `promotionThresholdAware`: mặc định true
- Theo dõi doanh số KM/Ontop theo từng đơn qua `order.groupAmounts`.
- Tăng điểm cho sản phẩm giúp top-up nhóm KM đã có trong đơn nhưng chưa đủ ngưỡng.
- Phạt sản phẩm mở nhóm KM mới khi phần còn lại của đơn không đủ để đạt ngưỡng Ontop.
- Phạt một SKU chiếm tỷ trọng quá lớn trong đơn.
- Chia lượng chọn SKU theo “ngân sách mỗi dòng” thay vì nhồi toàn bộ phần còn thiếu vào một dòng.
- Thêm repair theo từng đơn: `repairOrderPromotionThresholds`.
- Thêm `promotionOrderSummary` để kiểm tra Ontop theo khách/đơn.
- Chấm điểm kịch bản theo số lượt đơn đủ/chưa đủ điều kiện Ontop.

### Frontend

File: `public/js/app/tools/dms-gap-simulator.js`

Đã thêm:

- Gửi cấu hình dòng hàng lên API.
- Summary hiển thị:
  - Nhóm KM đạt theo đơn.
  - Lượt đơn đủ Ontop.
  - Lượt đơn chưa đủ Ontop.
- Tab mới `Ontop theo đơn`.
- Tab nhóm KM chuyển sang hiển thị số đơn đạt/chưa đủ thay vì chỉ tổng doanh số toàn kịch bản.

File: `public/fragments/index/06b-dms-gap-simulator.html`

Đã thêm cấu hình nâng cao:

- Số dòng tối thiểu/đơn.
- Số dòng tối đa/đơn.
- Mục tiêu tiền/dòng.
- Tỷ trọng tối đa 1 sản phẩm.
- Tab `Ontop theo đơn`.

### Export Excel

File xuất kết quả có thêm sheet:

- `ONTOP_THEO_DON`

Sheet `NHOM_KHUYEN_MAI` đổi ý nghĩa theo từng đơn:

- Ngưỡng/đơn.
- Doanh số gợi ý.
- Số đơn đạt.
- Số đơn chưa đủ.
- Doanh số đủ điều kiện.
- Doanh số chưa đủ.
- Còn thiếu theo đơn.
- Trạng thái.

## An toàn hệ thống

Không thay đổi nguyên tắc an toàn:

- Không tạo orders.
- Không tạo master_orders.
- Không ghi arLedgers.
- Không ghi fundLedgers.
- Không ghi stockTransactions.
- Không trừ tồn kho.
- Không cập nhật công nợ.
- Không ảnh hưởng báo cáo thật.

Module vẫn chỉ đọc dữ liệu và mô phỏng trong RAM.

## Kiểm tra

Đã chạy:

```bash
npm run check:source-size
npm run check:syntax
```

Kết quả:

```txt
[source-size-budget] OK
SYNTAX_OK 1327 JavaScript files
```

## Ghi chú vận hành

Khi preview kết quả, cần xem thêm tab `Ontop theo đơn`.

Nếu còn nhiều dòng `Chưa đủ điều kiện Ontop`, có thể tăng:

- `Số dòng tối thiểu/đơn`: 4 hoặc 5.
- `Mục tiêu tiền/dòng`: giảm về 600.000-700.000.
- `Tỷ trọng tối đa 1 sản phẩm`: giảm về 0.5-0.6.

Tuy nhiên nếu chỉ tiêu khách thấp hơn ngưỡng Ontop của nhóm thì không thể ép đơn đó ăn Ontop mà không vượt chỉ tiêu.
