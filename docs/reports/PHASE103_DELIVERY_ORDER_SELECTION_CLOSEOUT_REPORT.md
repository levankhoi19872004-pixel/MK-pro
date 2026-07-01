# PHASE103 — Delivery Today New order selection closeout

## Mục tiêu

Chỉnh lại khu vực **Danh sách đơn** của màn **Đơn giao hôm nay (New)** để:

- Header bảng rõ cột, không còn dính chữ `Đơn / Khách hàngPTTMCKTHHTCNTrạng tháiThao tác`.
- Mỗi dòng đơn có checkbox chọn/bỏ chọn.
- Header danh sách có nút **Chọn tất cả** và **Bỏ chọn**.
- Nút **Chốt sổ giao hàng** chỉ chốt các đơn được tick.
- Backend bắt buộc nhận và validate `orderIds`, không chốt toàn bộ danh sách ngoài ý muốn.
- Giữ nguyên rule công nợ ±1.000: trong khoảng `-1000..1000` thì coi như hết nợ, không sinh AR-DEBT.

## File đã sửa

| File | Nội dung |
|---|---|
| `public/js/app/new/91-delivery-today-new.js` | Thêm `selectedOrderIds`, checkbox từng đơn, toolbar chọn tất cả/bỏ chọn, modal closeout theo selected orders |
| `src/routes/newOperationsRoutes.js` | Closeout route yêu cầu `orderIds` không rỗng, trả `ORDER_SELECTION_REQUIRED` nếu thiếu |
| `src/services/accounting/AccountingCloseoutService.js` | Validate selected order scope theo ngày giao, NVGH, NVBH trước khi confirm/post AR-DEBT |
| `test/delivery-today-new-salesman-group-ui-static.test.js` | Static guard cho checkbox, selected orderIds, selected-order closeout |
| `test/phase91-new-services-contract.test.js` | Static guard cho route/service validate `orderIds` |
| `RELEASE_MANIFEST.json` | Cập nhật hash release |

## UI mới

Khu vực danh sách đơn có toolbar:

```text
Danh sách đơn                              16 đơn | 0 đơn được chọn / 16 đơn có thể chốt
[Chọn tất cả] [Bỏ chọn] [Chốt sổ giao hàng]

[✓] Đơn / Khách hàng | PT | TM | CK | TH | HT | CN | Trạng thái | Thao tác
```

Quy tắc UX:

- Checkbox nằm đầu mỗi dòng đơn.
- Dòng được chọn có nền nhẹ.
- Đơn đã chốt sổ không được chọn để chốt lại trên UI.
- Bấm **Chọn tất cả** chỉ chọn các đơn đang visible và đủ điều kiện.
- Bấm **Bỏ chọn** clear toàn bộ selected orders.
- Khi đổi NVBH/filter hoặc xóa lọc, selection được prune/reset để tránh chốt nhầm đơn đã bị ẩn.

## Closeout contract

Frontend gửi:

```js
{
  deliveryDate,
  date,
  deliveryStaffCode,
  salesStaffCodes,
  orderIds,
  reason,
  closeoutScope: 'selected_orders'
}
```

Backend validate:

- `orderIds` là mảng không rỗng.
- Tất cả orderIds tồn tại trong source order.
- Nếu gửi `deliveryDate`, mọi đơn phải thuộc đúng ngày.
- Nếu gửi `deliveryStaffCode`, mọi đơn phải thuộc đúng NVGH.
- Nếu gửi `salesStaffCodes`, mọi đơn phải thuộc một trong các NVBH đã chọn.
- Backend tự tính PT/TM/CK/TH/HT/CN, không tin amount từ frontend.

## Quy tắc công nợ giữ nguyên

```js
normalizeDebtAmount(amount)
```

- `-1000 <= CN <= 1000` → `CN = 0`
- `CN > 1000` → sinh `AR-DEBT-OPEN`
- `CN < -1000` → warning trả dư/lệch âm, không sinh công nợ âm

## Test đã chạy

```text
node --test test/phase91-new-services-contract.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-closeout-correction-contract-static.test.js
```

Kết quả: `37 pass / 0 fail`.

```text
npm run check:syntax
```

Kết quả: `SYNTAX_OK 1180 JavaScript files`.

```text
npm run release:manifest
npm run check:release-manifest
```

Kết quả: `RELEASE_MANIFEST_OK 2026-07-01-01`.

`npm run check:source-bundles` chưa chạy được trong sandbox do thiếu dependency `terser` trong `node_modules`.

## Checklist tự kiểm tra UI

1. Mở **Đơn giao hôm nay (New)**.
2. Tìm theo NVGH/NVBH.
3. Kiểm tra header bảng đơn rõ cột, không còn chữ dính.
4. Tick từng đơn, quan sát số đơn được chọn tăng/giảm.
5. Bấm **Chọn tất cả**, chỉ các đơn chưa chốt được tick.
6. Bấm **Bỏ chọn**, số đơn chọn về 0 và nút chốt disabled.
7. Chọn một vài đơn rồi bấm **Chốt sổ giao hàng**.
8. Modal phải hiển thị tổng theo selected orders, không phải toàn bộ danh sách.
9. Confirm chốt, backend chỉ nhận `orderIds` đã tick.
10. Mở Công nợ New và tìm khách/đơn có CN > 1.000 để kiểm tra AR-DEBT-OPEN.
