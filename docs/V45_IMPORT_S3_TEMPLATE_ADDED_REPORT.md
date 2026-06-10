# V45 - Thêm mẫu import đơn S3 rút gọn

## Nội dung đã sửa

### 1. Thêm mẫu tải Excel mới
File: `services/excelTemplateService.js`

Thêm template built-in:

- Type: `salesOrdersS3`
- Tên: `Mẫu import đơn S3 rút gọn`
- File tải về: `mau-import-don-s3-rut-gon.xlsx`

Các cột mẫu:

| Cột | Tên cột |
|---|---|
| A | Ngày |
| B | Số Đơn |
| C | Mã Nv |
| D | Tên NV |
| E | Mã Khách |
| F | Tên Khách |
| G | Mã hàng |
| H | Tên hàng |
| I | QC |
| J | Là KM |
| K | Số lượng |
| L | Đơn giá sau KM/Ck |
| M | Thành tiền |
| N | Mã Kho |

## 2. Thêm lựa chọn trên giao diện
File: `public/index.html`

Thêm option:

```html
<option value="salesOrdersS3">Đơn S3 rút gọn</option>
```

Người dùng có thể chọn loại import này rồi bấm `Tải mẫu Excel`.

## 3. Backend vẫn import vào luồng đơn bán DMS chuẩn
File: `src/services/excelImportService.js`

`type = salesOrdersS3` được chuẩn hóa về `salesOrders` khi:

- Preview import
- Commit import
- Import trực tiếp

Nhờ vậy mẫu S3 rút gọn vẫn đi chung luồng đơn con chuẩn của V45:

- tạo đơn con pending
- chưa ghi AR ngay
- tạo return draft
- trừ tồn theo đơn import
- đi tiếp được vào gộp đơn tổng và app giao hàng

## 4. Bổ sung alias đọc cột S3
File: `src/services/excelImportService.js`

Đã bổ sung nhận diện các cột:

- `Số Đơn` → mã đơn/documentCode
- `Mã Nv` → mã NVBH/staffCode
- `Mã Khách` → mã khách hàng/customerCode
- `Tên Khách` → tên khách hàng/customerName
- `Mã hàng` → mã sản phẩm/productCode
- `Số lượng` → quantity
- `Đơn giá sau KM/Ck` → salePrice
- `Thành tiền` → amount/actualAmount
- `Mã Kho` → warehouseCode
- `Là KM` → nhận diện hàng khuyến mại

## 5. Bổ sung ngày dạng S3
File: `src/utils/date.util.js`

Hỗ trợ ngày dạng:

```text
03.06.2026
```

và tự chuyển thành:

```text
2026-06-03
```

## 6. Quy tắc hàng khuyến mại
Nếu cột `Là KM` có một trong các giá trị:

```text
1, Y, YES, TRUE, X, KM, Có
```

thì dòng đó được hiểu là hàng khuyến mại:

- vẫn trừ tồn
- không tính doanh thu
- không cộng công nợ

## 7. Kiểm tra kỹ thuật
Đã chạy kiểm tra cú pháp:

```bash
node -c src/services/excelImportService.js
node -c services/excelTemplateService.js
node -c src/utils/date.util.js
```

Kết quả: không lỗi cú pháp.

Đã kiểm tra chuyển ngày:

```text
03.06.2026 → 2026-06-03
```
