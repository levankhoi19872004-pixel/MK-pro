# PHASE114 — New Filter Autocomplete + Per-field Clear UX

## 1. Tổng quan dự án được kiểm tra

- Dự án: MK-Pro ERP/DMS nội bộ.
- Stack: Node.js/Express, MongoDB/Mongoose, JavaScript thuần frontend.
- Phạm vi tác động: chỉ màn `Công nợ (New)` và `Đơn giao hôm nay (New)` trong namespace `/api/new`.
- File trọng tâm:
  - `public/js/app/new/92-debt-new.js`
  - `public/js/app/new/91-delivery-today-new.js`
  - `src/services/v2/debtNew.service.js`
  - `src/services/v2/deliveryTodayNew.service.js`
  - `src/routes/newOperationsRoutes.js`
  - `test/phase91-new-services-contract.test.js`
  - `test/new-screens-autocomplete-clear-static.test.js`

## 2. Nguyên nhân lỗi/rủi ro ban đầu

### Công nợ (New)

- Đã có API `/api/new/debt/suggestions` và frontend autocomplete cho khách/đơn, NVBH, NVGH.
- Thiếu nút `X` clear từng ô lọc.
- Khi người dùng xóa chữ bằng tay hoặc cần bỏ chọn nhanh, state code ẩn (`customerCode`, `orderCode`, `salesStaffCode`, `deliveryStaffCode`) chưa có UX clear rõ ràng.
- Rủi ro chính: UI trông như đã bỏ filter nhưng selected code trong state vẫn còn, làm dữ liệu tải sai điều kiện.

### Đơn giao hôm nay (New)

- Autocomplete cũ dựa vào dữ liệu local sau khi đã tải đơn hoặc `UnifiedSearchEngine` với `allowEmpty`/`minChars: 0`.
- Cách này có rủi ro query rộng hoặc không có gợi ý khi màn đang ở empty/search-gated state.
- Chưa có selected-code state rõ ràng cho NVGH/NVBH/đơn/khách.
- Thiếu nút `X` clear từng field.

## 3. File đã sửa

### `public/js/app/new/92-debt-new.js`

- Bổ sung wrapper `.filter-input-wrap` và nút `X` cho:
  - Tìm khách / đơn
  - NVBH
  - NVGH
  - Trạng thái
- Thêm `updateClearButtons()` để chỉ hiện nút khi input/select hoặc selected-code có giá trị.
- Thêm `clearDebtFilter(scope)` để clear đúng field:
  - `search`: clear text + `customerCode` + `orderCode`
  - `salesman`: clear text + `salesStaffCode`
  - `delivery`: clear text + `deliveryStaffCode`
  - `status`: reset về `open`
- Khi clear điều kiện cuối cùng: đưa màn về empty state, không tự tải lại dữ liệu.
- Khi còn điều kiện khác: chỉ báo “Bấm Tải để cập nhật”, không auto fetch.
- Chuẩn hóa fallback selected code qua `selectedOrTyped()`/`firstText()` để tránh giữ nhầm code ẩn.

### `public/js/app/new/91-delivery-today-new.js`

- Bổ sung selected-code state:
  - `orderCode`
  - `customerCode`
  - `salesStaffCode`
  - `deliveryStaffCode`
- Bổ sung autocomplete gọi API mới `/api/new/delivery-today/suggestions` cho:
  - NVGH
  - NVBH
  - Tìm kiếm đơn/khách
- Guard frontend: không gọi API khi query dưới 2 ký tự.
- Bổ sung debounce 320ms, loading/empty state, click ngoài đóng dropdown, phím lên/xuống, Enter chọn item active, Esc đóng dropdown.
- Bổ sung nút `X` cho:
  - Ngày giao: reset về hôm nay và `deliveryDateTouched = false`
  - NVGH: clear text + `deliveryStaffCode`
  - NVBH: clear text + `salesStaffCode`
  - Tìm kiếm: clear text + `orderCode` + `customerCode`
- Clear từng ô không tự tải lại dữ liệu.
- Clear điều kiện cuối cùng đưa màn về empty state.

### `src/services/v2/deliveryTodayNew.service.js`

- Thêm API service `suggestions(query, options)`.
- Thêm guard `q.length < 2` trả `items: []`, không query DB.
- Giới hạn `limit` tối đa 10.
- Gợi ý theo `orderCustomer`, `salesman`, `delivery`.
- Dùng `escapeRegExp()` trong `buildOrderMatch()` hiện hữu để chống regex injection.
- Bổ sung tìm theo phone/customerPhone/phoneNumber cho q đơn/khách.
- Không thay đổi luồng closeout/accounting/returnOrders.

### `src/routes/newOperationsRoutes.js`

- Thêm route:

```text
GET /api/new/delivery-today/suggestions?type=orderCustomer|salesman|delivery&q=&deliveryDate=&deliveryStaffCode=&limit=10
```

- Route có `requireAuth` + `readRoles`, cùng policy với màn New.

### Test

- Thêm `test/new-screens-autocomplete-clear-static.test.js`.
- Cập nhật test Phase91 cũ để kiểm tra autocomplete mới qua `/api/new/delivery-today/suggestions`, không còn phụ thuộc `UnifiedSearchEngine`/local empty search.

## 4. Autocomplete đã bổ sung/giữ lại

| Màn | Field | Nguồn gợi ý | Selected code |
|---|---|---|---|
| Công nợ New | Tìm khách / đơn | `/api/new/debt/suggestions?type=customerOrder` | `customerCode` hoặc `orderCode` |
| Công nợ New | NVBH | `/api/new/debt/suggestions?type=salesman` | `salesStaffCode` |
| Công nợ New | NVGH | `/api/new/debt/suggestions?type=delivery` | `deliveryStaffCode` |
| Đơn giao hôm nay New | NVGH | `/api/new/delivery-today/suggestions?type=delivery` | `deliveryStaffCode` |
| Đơn giao hôm nay New | NVBH | `/api/new/delivery-today/suggestions?type=salesman` | `salesStaffCode` |
| Đơn giao hôm nay New | Đơn/khách | `/api/new/delivery-today/suggestions?type=orderCustomer` | `orderCode` hoặc `customerCode` |

## 5. Search-gated contract

- Mở màn vẫn không tự tải toàn bộ dữ liệu.
- Chọn gợi ý không tự gọi `load()`.
- Xóa từng field không tự gọi `load()`.
- Ngày mặc định ở Đơn giao hôm nay New không được tính là điều kiện chủ động nếu `deliveryDateTouched = false`.
- Bấm `Tải`/`Tải đơn` khi không có criteria vẫn hiển thị cảnh báo/empty state.

## 6. Message scope

- Autocomplete ở màn chính chỉ dùng message màn chính.
- Không thay đổi popup Công nợ New, không đẩy lỗi popup ra màn chính.
- Không thay đổi popup closeout/correction của Đơn giao hôm nay New.

## 7. Kiểm thử đã chạy

Pass:

```text
npm run check:syntax
npm run check:source-bundles
npm run check:release-manifest
node --test test/phase91-new-services-contract.test.js test/phase91-new-modules-static.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/new-screens-autocomplete-clear-static.test.js
```

Kết quả khoanh vùng:

```text
SYNTAX_OK 1185 JavaScript files
[source-bundles] OK 19 bundles
RELEASE_MANIFEST_OK 2026-07-01-01
56 tests pass / 0 fail
```

Full `npm test` đã chạy nhưng fail 1 test không thuộc phạm vi Phase114:

```text
strict delivery closeout does not infer collectedAmount from AR-RECEIPT-like or legacy cash fields
Expected: 0
Actual: 200000
File: test/strict-delivery-cash-no-ar-receipt-inference.test.js
Service: src/services/accounting/DeliveryCloseoutService
```

Không sửa lỗi này trong Phase114 vì nằm ngoài phạm vi autocomplete/clear filter và liên quan closeout accounting strictness.

## 8. Cách tự kiểm tra UI

### Công nợ New

1. Mở màn `Công nợ (New)`.
2. Gõ ít nhất 2 ký tự ở `Tìm khách / đơn`, `NVBH`, `NVGH`.
3. Chọn một gợi ý.
4. Kiểm tra input hiển thị label, nhưng màn chưa tự tải.
5. Bấm `Tải`, dữ liệu lọc theo code đã chọn.
6. Bấm `X` trong từng ô:
   - Ô đó mất text.
   - Code ẩn tương ứng bị clear.
   - Các filter khác vẫn giữ nguyên.

### Đơn giao hôm nay New

1. Mở màn `Đơn giao hôm nay (New)`.
2. Gõ ít nhất 2 ký tự ở `NVGH`, `NVBH`, `Tìm kiếm`.
3. Kiểm tra dropdown gợi ý không xuất hiện khi chỉ gõ 0–1 ký tự.
4. Chọn gợi ý, màn không tự tải.
5. Bấm `Tải đơn` để áp dụng filter.
6. Bấm `X` từng ô để xác nhận không tự tải lại và không xóa nhầm filter khác.
7. Đổi ngày giao, nút `X` ngày hiện; bấm `X` reset về hôm nay và `deliveryDateTouched = false`.

## 9. Rủi ro còn lại

- Endpoint gợi ý Đơn giao hôm nay New hiện dùng `SalesOrder` fallback để tìm staff/order/customer; nếu dữ liệu vận hành chỉ tồn tại trong service legacy/master-order mà không đồng bộ về SalesOrder, cần bổ sung adapter suggestion theo source vận hành. Hiện vẫn giữ scope an toàn, không query khi q ngắn.
- Full `npm test` đang có 1 fail ngoài phạm vi Phase114 ở `DeliveryCloseoutService`. Nên xử lý ở phase riêng để tránh sửa lan vào autocomplete/filter UX.

## 10. Phương án tiếp theo

| Phương án | Nội dung | Lợi ích | Nhược điểm | Effort | Rủi ro |
|---|---|---|---|---|---|
| A — Production grade | Tách helper autocomplete/clear dùng chung cho các màn New, có contract test shared và adapter nguồn dữ liệu chuẩn | Ít trùng code, dễ bảo trì, giảm lỗi scope về sau | Cần refactor frontend nhiều hơn | Medium/Hard | Cần test regression UI kỹ |
| B — Cân bằng effort | Giữ helper cục bộ như Phase114, chỉ bổ sung khi màn New phát sinh thêm field | Nhanh, ít đụng code, phù hợp nội bộ hiện tại | Có thể trùng logic giữa màn | Medium | Cần discipline khi thêm màn mới |

Khuyến nghị: hiện tại chọn B là hợp lý vì phạm vi đang khoanh vùng. Sau khi các màn New ổn định, gom thành helper shared ở phase riêng.
