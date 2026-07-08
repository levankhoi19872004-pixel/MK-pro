# PHASE201 - SSE Delivery Staff Scope Fix

## Mục tiêu

Sửa lỗi màn Báo cáo → Xuất hóa đơn → Xuất Excel SSE: UI chọn đúng nhân viên giao hàng SSE nhưng file Excel tải về vẫn chứa số liệu của NVGH khác / tất cả NVGH.

## Bằng chứng từ file Excel lỗi

File `SSE_Hoa_don_tat_ca_tu_02-07-2026_den_02-07-2026 (1).xlsx` được kiểm tra và phát hiện:

- Sheet `TỔNG` có 630 dòng dữ liệu.
- Cột `Mã khách` / `Tên khách hàng` trong sheet `TỔNG` đang dùng làm mã/tên NVGH cho SSE.
- File không chỉ có `ghtp - Hiếu Giao Hàng TP` mà có đủ nhiều NVGH:
  - `ghth - Thành GH Tiền hải`
  - `ghtt - Văn Giao Hàng TT`
  - `ghtp - Hiếu Giao Hàng TP`
  - `ghkx - Hào Giao Hàng KX`
- File còn có ngày Excel serial `46205` và `46206`, tương ứng dữ liệu ngày 02/07/2026 và 03/07/2026, trong khi tên file thể hiện khoảng 02/07/2026 đến 02/07/2026.

Kết luận: file đã lọt scope, không khóa chặt theo NVGH đang chọn.

## Nguyên nhân kỹ thuật

### 1. Frontend gửi filter chưa đủ chặt

File `public/js/app/admin/08f-vat-export.js` có truyền `deliveryStaffCode` khi xuất SSE, nhưng giá trị lấy trực tiếp từ `deliveryStaffSelect.value`. Nếu UI/select bị trạng thái legacy, option label còn hiển thị nhưng value rỗng hoặc bị reset, request sẽ trở thành xuất tất cả.

### 2. Backend chỉ dựa vào Mongo filter, thiếu lớp chốt scope cuối

File `src/services/invoiceExportQuery.service.js` đã build filter masterOrders theo NVGH, nhưng sau khi lấy masterOrders/rawOrders chưa có lớp lọc JS cuối cùng theo `deliveryStaffCode`.

Với nghiệp vụ SSE, đây là rủi ro cao vì chỉ cần query alias hoặc dữ liệu legacy làm Mongo clause không đủ chặt thì file có thể lẫn NVGH khác.

### 3. Filename không thể hiện scope NVGH

`src/services/sseInvoiceExport.service.js` sinh filename dạng:

```txt
SSE_Hoa_don_tat_ca_tu_02-07-2026_den_02-07-2026.xlsx
```

nên người dùng không nhìn được file đang xuất cho tất cả hay cho NVGH cụ thể.

## File đã sửa

| File | Sửa gì | Lý do |
|---|---|---|
| `public/js/app/admin/08f-vat-export.js` | Thêm `selectedDeliveryStaffCode()` lấy value, dataset hoặc fallback parse từ label option | Tránh case UI hiển thị NVGH nhưng value rỗng |
| `public/js/app/admin/08f-vat-export.js` | Khi xuất SSE, label/status/fallback filename có kèm NVGH nếu đã chọn | Dễ kiểm tra đúng scope ngay từ UI |
| `src/services/invoiceExportQuery.service.js` | `normalizeExportQuery()` nhận thêm alias `deliveryStaff`, `delivery`, `nvgh` | Tăng tương thích route/query legacy |
| `src/services/invoiceExportQuery.service.js` | Thêm `normalizeDeliveryStaffKey()` và `matchesDeliveryStaffCode()` | So khớp NVGH ổn định, không lệch do hoa/thường |
| `src/services/invoiceExportQuery.service.js` | Lọc `rawMasterOrders` lần cuối bằng JS theo `deliveryStaffCode` | Chốt scope theo đơn tổng trước khi lấy đơn con |
| `src/services/invoiceExportQuery.service.js` | Lọc `scopedOrders` lần cuối bằng JS theo `deliveryStaffCode` sau khi attach master scope | Không cho đơn con của NVGH khác lọt file |
| `src/services/sseInvoiceExport.service.js` | Filename SSE có hậu tố `_NVGH_<code>` nếu query có NVGH | Nhìn tên file biết đang xuất theo NVGH nào |
| `src/services/sseInvoiceExport.service.js` | Error report URL giữ `deliveryStaffCode` và `summaryBy=deliveryStaff` | Báo cáo lỗi mapping không bị quay về tất cả NVGH |
| `test/sse-invoice-export-delivery-scope-static.test.js` | Thêm static contract test cho frontend/backend SSE scope | Chặn tái phát lỗi lọt NVGH |
| `RELEASE_MANIFEST.json` | Cập nhật release manifest | Đảm bảo check release pass |

## Contract sau sửa

Khi bấm `Xuất Excel SSE`:

```txt
/api/export/sse-invoice-orders.xlsx?invoiceType=ALL&limit=20000&dateFrom=2026-07-02&dateTo=2026-07-02&summaryBy=deliveryStaff&deliveryStaffCode=ghtp
```

Backend bắt buộc:

1. Lấy masterOrders theo ngày + NVGH.
2. Lọc lại masterOrders bằng `matchesDeliveryStaffCode(master, filters.deliveryStaffCode)`.
3. Lấy đơn con từ masterOrders đã scoped.
4. Attach scope NVGH từ đơn tổng vào đơn con.
5. Lọc lại orders bằng `matchesDeliveryStaffCode(order, filters.deliveryStaffCode)`.
6. Build SSE rows từ orders đã khóa scope.

Nếu chọn `ghtp`, file không được có dòng `ghkx`, `ghth`, `ghtt`.

## Kết quả test

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run check:syntax` | PASS | `SYNTAX_OK 1319 JavaScript files` |
| `node --test test/sse-invoice-export-delivery-scope-static.test.js` | PASS | 3/3 static contract tests |
| `npm run check:release-manifest` | PASS | `RELEASE_MANIFEST_OK 2026-07-08-02` |
| `npm run check:source-bundles` | FAIL do môi trường | Thiếu package `terser` trong sandbox, không phải lỗi do phase này |

## Cách kiểm tra sau deploy

### 1. Kiểm tra request trên trình duyệt

Mở DevTools → Network → bấm `Xuất Excel SSE`.

URL phải có đủ:

```txt
summaryBy=deliveryStaff
&deliveryStaffCode=ghtp
```

### 2. Kiểm tra filename

File tải về khi chọn `ghtp` phải có dạng:

```txt
SSE_Hoa_don_tat_ca_NVGH_ghtp_tu_02-07-2026_den_02-07-2026.xlsx
```

Nếu tên file vẫn là:

```txt
SSE_Hoa_don_tat_ca_tu_02-07-2026_den_02-07-2026.xlsx
```

thì request chưa gửi `deliveryStaffCode`.

### 3. Kiểm tra nội dung Excel

Trong sheet `TỔNG`:

- Cột A `Mã khách` phải chỉ có `ghtp`.
- Cột B `Tên khách hàng` phải chỉ có `Hiếu Giao Hàng TP`.

Trong sheet `TONG_THEO_NVGH`:

- Cột B `Mã NVGH` phải chỉ có `ghtp`.
- Không được còn `ghkx`, `ghth`, `ghtt`.

## Rủi ro còn lại

- Nếu database đơn tổng gán sai NVGH thì Excel sẽ đúng theo dữ liệu DB nhưng vẫn sai nghiệp vụ. Cần kiểm tra trực tiếp `master_orders` cho ngày đó nếu còn lệch.
- Nếu trình duyệt cache JS cũ, cần hard reload hoặc clear cache sau deploy.
- `check:source-bundles` chưa chạy được trong sandbox vì thiếu `terser`; trên môi trường có `npm install` đầy đủ cần chạy lại.
