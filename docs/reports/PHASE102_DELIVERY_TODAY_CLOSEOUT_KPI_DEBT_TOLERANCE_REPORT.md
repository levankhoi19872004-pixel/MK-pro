# PHASE102 — Delivery Today New KPI Cleanup + Closeout AR-DEBT Posting

## 1. Tổng quan

Phase này xử lý màn **Đơn giao hôm nay (New)** sau Phase101:

- Loại bỏ dãy KPI card thứ hai trong khối nhóm NVBH.
- Giữ một dãy KPI chính cho toàn bộ kết quả đang lọc.
- Chuyển tổng theo NVBH đã chọn thành một dòng compact trong header nhóm NVBH.
- Thêm nút **Chốt sổ giao hàng** ở khu vực danh sách đơn.
- Thêm API backend `POST /api/new/delivery-today/closeout`.
- Áp dụng thống nhất rule làm tròn công nợ ±1.000.

## 2. Layout mới

Cấu trúc UI mới:

```text
[Filter]
[KPI tổng toàn bộ kết quả]
[NVBH thuộc NVGH] [Tổng theo NVBH đã chọn compact] [Chọn tất cả] [Bỏ chọn tất cả]
[Danh sách đơn] [Chốt sổ giao hàng]
```

Đã bỏ:

- `.delivery-new-salesman-kpis`
- `renderSalesmanKpis()`
- dãy KPI card lớn dưới nhóm NVBH

Đã thêm:

- `.delivery-new-salesman-compact`
- `renderSelectedSalesmanCompactSummary()`
- `deliveryTodayNewCloseout`
- `deliveryTodayNewCloseoutModal`

## 3. Quy tắc công nợ / zero tolerance

Utility dùng chung hiện có:

```js
normalizeDebtAmount(value)
```

Rule:

```text
Nếu -1000 <= CN_raw <= 1000 → CN = 0
Nếu CN_raw > 1000 hoặc CN_raw < -1000 → giữ nguyên sau làm tròn số nguyên
```

Đã áp dụng tại:

- `src/services/v2/deliveryTodayNew.service.js`
- `src/services/accounting/DeliveryCloseoutService.js`
- `src/services/accounting/ArDebtOpenPostingService.js`

## 4. Nghiệp vụ chốt sổ giao hàng

Endpoint mới:

```text
POST /api/new/delivery-today/closeout
```

Payload frontend gửi:

```js
{
  deliveryDate,
  date,
  deliveryStaffCode,
  salesStaffCodes,
  orderIds,
  reason,
  closeoutScope: 'filtered_selection'
}
```

Backend:

- Yêu cầu `requireAuth`.
- Chỉ role `admin` hoặc `accountant` được chốt.
- Bắt buộc có `reason`.
- Gọi `AccountingCloseoutService.confirmDeliveryAccounting()`.
- Service tự tính công nợ từ order/return/payment, không tin amount từ frontend.
- AR posting dùng `ArDebtOpenPostingService.postDebtOpen()`.
- Chỉ tạo `AR-DEBT-OPEN` nếu CN sau chuẩn hóa > 0.
- CN trong khoảng ±1.000 được bỏ qua với reason `zero_final_debt`.
- CN < -1.000 trả exception/warning overpayment, không tạo công nợ âm.

## 5. File đã sửa

| File | Thay đổi chính |
|---|---|
| `public/js/app/new/91-delivery-today-new.js` | Gỡ KPI card thứ hai, thêm compact summary, thêm nút/modal closeout |
| `src/services/v2/deliveryTodayNew.service.js` | Áp dụng `normalizeDebtAmount`, trả `rawFinalDebtAmount`, diagnostics tolerance |
| `src/services/accounting/DeliveryCloseoutService.js` | Chuẩn hóa `finalDebtAmount`, compare closeout theo tolerance, lưu reason |
| `src/services/accounting/ArDebtOpenPostingService.js` | Chuẩn hóa amount trước khi sinh AR-DEBT-OPEN |
| `src/services/accounting/AccountingCloseoutService.js` | Truyền reason/note vào closeout + AR posting + audit note |
| `src/routes/newOperationsRoutes.js` | Thêm `POST /api/new/delivery-today/closeout` |
| `test/phase91-new-services-contract.test.js` | Thêm test tolerance, closeout UI/route, AR-DEBT source guard |
| `test/delivery-today-new-salesman-group-ui-static.test.js` | Cập nhật expectation compact summary, chặn KPI card thứ hai quay lại |
| `RELEASE_MANIFEST.json` | Cập nhật release manifest |

## 6. Test đã chạy

```text
node --test test/phase91-new-services-contract.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-closeout-correction-contract-static.test.js
```

Kết quả:

```text
33 pass
0 fail
```

```text
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1180 JavaScript files
```

```text
npm run release:manifest
npm run check:release-manifest
```

Kết quả:

```text
RELEASE_MANIFEST_OK 2026-07-01-01
```

Không chạy được `npm run check:source-bundles` trong sandbox vì thiếu dependency `terser`.

## 7. Checklist UI

1. Mở **Đơn giao hôm nay (New)**.
2. Tìm theo NVGH/NVBH.
3. Kiểm tra chỉ còn một dãy KPI chính phía trên.
4. Kiểm tra nhóm NVBH chỉ còn dòng tổng compact trong header, không còn KPI card thứ hai.
5. Tick/bỏ tick NVBH, tổng compact và danh sách đơn thay đổi theo selection.
6. Kiểm tra nút **Chốt sổ giao hàng** disabled khi không có dòng, enabled khi có đơn đang xem.
7. Bấm nút, modal hiện tổng CN sẽ chuyển sang công nợ.
8. Nhập lý do và confirm.
9. Mở **Công nợ (New)**, tìm khách/đơn còn nợ > 1.000 để kiểm tra AR-DEBT-OPEN.

## 8. Rủi ro còn lại

- Cần test với MongoDB thật để xác nhận các đơn production hiện tại đủ `deliveryCloseout` và trạng thái giao để `AccountingCloseoutService` không block.
- Đơn đã có AR legacy trước Phase này cần reconcile riêng, không xử lý trong phase UI/closeout này.
- CN âm lớn hơn -1.000 được cảnh báo overpayment, chưa tự sinh nghiệp vụ dư có.
