# V46 DMS Invoice Template Exact Layout Fixed

## Mục tiêu
Sửa mẫu in đơn con để bám mẫu DMS/Unilever: header 3 cột, Liên/Trang đúng định dạng, CSS compact, bảng hàng đúng tỷ lệ, tổng tiền/chữ ký/CTKM/cấn trừ đúng form.

## File đã sửa

### 1. templates/printTemplates.js
- Ưu tiên đọc dữ liệu từ `data.erpInvoiceV46` trước khi fallback sang dữ liệu cũ.
- Thêm helper chuẩn:
  - `getDmsHeader()`
  - `getDmsDistributor()`
  - `getDmsCustomer()`
  - `getDmsSalesStaff()`
  - `normalizeCopyLabel()`
  - `formatDmsPage()`
- Sửa `renderDmsHeader()` đúng bố cục 3 cột như PDF mẫu.
- Sửa định dạng:
  - `Liên 1` → `(Liên 1)`
  - `Trang: 1 / 1` → `Trang: 1/ 1`
- Sửa `renderDmsInvoiceItemsTable()` theo tỷ lệ cột DMS.
- Sửa `renderDmsPromotionTable()` để vẫn render bảng CTKM rỗng khi chưa có dữ liệu CTKM.
- Sửa `renderDmsRewardTable()` để render phần cấn trừ khi có dữ liệu cấn trừ hoặc tổng cấn trừ.
- Bỏ class `compact-print` khỏi DMS page để không bị CSS mẫu cũ ghi đè.

### 2. public/print.css
- Thêm nhóm CSS riêng cho `body.dms-print-body`.
- Chuẩn hóa DMS page theo A4 portrait.
- Thu nhỏ font/khoảng cách/border cho giống mẫu PDF.
- Ép tiêu đề không bị xuống dòng.
- Sửa header 3 cột, bảng hàng, bảng khuyến mại, bảng cấn trừ, tổng tiền, chữ ký.

### 3. services/printDataBuilder.js
- Khi build `erpInvoiceV46`, truyền đầy đủ dữ liệu chuẩn:
  - header
  - distributor
  - customer
  - salesStaff
  - items
  - promotions
  - offsets
  - totals
- Đảm bảo template DMS không còn phải suy đoán từ dữ liệu rời rạc.

### 4. public/js/app/05-sales-orders.js
- Đã kiểm tra luồng in nhiều đơn, hiện đang giữ `<body class="dms-print-body">` nên CSS DMS không bị mất khi ghép nhiều đơn.

## Kiểm tra kỹ thuật
- `node --check templates/printTemplates.js`: OK
- `node --check services/printDataBuilder.js`: OK
- `node --check services/printService.js`: OK
- `node --check public/js/app/05-sales-orders.js`: OK
- Test render `ORDER_SINGLE` trả về `DMS_DELIVERY_INVOICE`: OK
- HTML sinh ra có:
  - `body class="dms-print-body"`
  - `section class="print-page dms-print-page"`
  - `(Liên 1)`
  - `Trang: 1/ 1`
  - `CHI TIẾT KHUYẾN MÃI: (B+C)`

## Ghi chú triển khai
Sau khi upload bản này lên server, cần hard refresh trình duyệt hoặc xóa cache để `public/print.css` mới có hiệu lực.
