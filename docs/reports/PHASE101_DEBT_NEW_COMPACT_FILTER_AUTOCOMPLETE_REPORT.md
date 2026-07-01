# PHASE101 — Công nợ (New) compact filter + autocomplete

## 1. Tổng quan

Phase này chỉ chỉnh trong phạm vi màn **Công nợ (New)**:

- Cân đối lại card filter/search phía trên.
- Đưa nút **Tải** và **Xóa lọc** vào cùng grid với input.
- Đưa badge nguồn dữ liệu về góc phải header card.
- Rút gọn mô tả để giảm chiều cao card.
- Bổ sung autocomplete cho khách/đơn, NVBH, NVGH.
- Giữ nguyên search-gated contract: không tự tải toàn bộ khi mở màn, trạng thái mặc định không được coi là điều kiện tìm kiếm.

## 2. Nguyên nhân UI cũ mất cân đối

- Header, mô tả, toolbar và actions dùng layout rời nên nút bị xuống dòng.
- Card filter kế thừa class generic, không có grid riêng cho form nghiệp vụ.
- Badge `AR-DEBT-* only` nằm trong action header chung nên chưa cân với tiêu đề.
- Input không có suggestion nên người dùng phải nhập thủ công mã NVBH/NVGH/KH.

## 3. File đã sửa

| File | Lý do sửa | Thay đổi chính |
|---|---|---|
| `public/js/app/new/92-debt-new.js` | UI + UX Công nợ New | Thêm layout compact, CSS scoped, suggestion dropdown, keyboard UX, selected filter code |
| `src/services/v2/debtNew.service.js` | Backend suggestion | Thêm API service `suggestions()`, guard q tối thiểu 2 ký tự, limit 10, gợi ý từ AR-DEBT read rows |
| `src/routes/newOperationsRoutes.js` | Route suggestion | Thêm `GET /api/new/debt/suggestions` có auth/read role |
| `test/phase91-new-services-contract.test.js` | Static/contract guard | Thêm test layout compact, route suggestion, guard min query, limit, chọn code không phá search-gate |
| `RELEASE_MANIFEST.json` | Release tracking | Cập nhật hash nguồn |

## 4. Layout mới

Card filter mới dùng các class scoped:

- `debt-new-filter-card`
- `debt-new-filter-header`
- `debt-new-filter-grid`
- `debt-new-suggest-wrap`
- `debt-new-suggest`
- `debt-new-suggest-item`

Desktop grid:

```text
[Tìm khách / đơn] [NVBH] [NVGH] [Trạng thái] [Tải] [Xóa lọc]
```

Responsive:

- Dưới 900px: chia 2 cột.
- Dưới 640px: 1 cột.

## 5. Autocomplete đã bổ sung

| Ô | Type API | Gợi ý | Khi chọn |
|---|---|---|---|
| Tìm khách / đơn | `customerOrder` | Customer + order còn trong AR-DEBT read rows | Set `customerCode` hoặc `orderCode` |
| NVBH | `salesman` | Mã/tên NVBH từ AR-DEBT read rows | Set `salesStaffCode` |
| NVGH | `delivery` | Mã/tên NVGH từ AR-DEBT read rows | Set `deliveryStaffCode` |

UX hỗ trợ:

- Debounce 320ms.
- Chỉ gọi API khi nhập từ 2 ký tự.
- Loading state trong dropdown.
- Empty state nếu không có gợi ý.
- Click ngoài đóng dropdown.
- Arrow up/down chọn item.
- Enter chọn item đang active.
- Esc đóng dropdown.
- Xóa lọc clear cả text input và selected code.

## 6. API suggestion

```http
GET /api/new/debt/suggestions?type=customerOrder|customer|order|salesman|delivery&q=<keyword>&limit=10
```

Guard:

- `q.length < 2` trả `items: []` và không query DB.
- `limit` bị clamp tối đa 10 item.
- API có `requireAuth` + `readRoles`.
- Response chỉ trả field cần cho UI: `type`, `code`, `name`, `orderCode`, `customerCode`, `customerName`, `debtAmount`, `label`, `subLabel`.

## 7. Search contract giữ nguyên

- Mở màn Công nợ (New) vẫn không tự tải dữ liệu.
- Chỉ chọn suggestion không tự tải danh sách.
- Người dùng vẫn bấm **Tải** hoặc nhấn Enter để tải theo criteria.
- Trạng thái mặc định `open` không phải criteria hợp lệ.
- Backend `/api/new/debt/customers` vẫn có `hasSearchCriteria` guard.
- Autocomplete không thay thế search guard và không trả toàn bộ dữ liệu.

## 8. Test đã chạy

```text
node --test test/phase91-new-services-contract.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-closeout-correction-contract-static.test.js
```

Kết quả:

```text
28 pass
0 fail
```

Syntax:

```text
npm run check:syntax
SYNTAX_OK 1180 JavaScript files
```

Release manifest:

```text
npm run release:manifest
npm run check:release-manifest
RELEASE_MANIFEST_OK 2026-06-30-01
```

Không chạy được `npm run check:source-bundles` trong sandbox vì thiếu dependency dev `terser` trong `node_modules`.

## 9. Checklist tự kiểm tra UI

1. Mở **Công nợ (New)**: card filter thấp hơn, nút nằm cùng hàng, badge ở góc phải.
2. Không nhập gì, bấm **Tải**: báo cần nhập ít nhất một điều kiện.
3. Nhập 1 ký tự: không gọi suggestion.
4. Nhập từ 2 ký tự ở ô khách/đơn: có dropdown gợi ý.
5. Chọn khách: input hiển thị label, bấm **Tải** mới tải danh sách.
6. Nhập/chọn NVBH hoặc NVGH: ưu tiên code khi query.
7. Bấm **Xóa lọc**: clear input, clear selected code, ẩn kết quả, quay về empty state.

## 10. Rủi ro còn lại

- Gợi ý lấy từ AR-DEBT read rows nên khách/NVBH/NVGH chưa từng phát sinh AR-DEBT sẽ không hiện trong suggestion Công nợ New.
- Nếu dữ liệu AR-DEBT thiếu `salesStaffName`/`deliveryStaffName`, gợi ý theo tên có thể ít kết quả hơn theo mã.
- Cần kiểm tra với MongoDB thật để xác nhận tốc độ suggestion trên dữ liệu production; hiện API có q guard và limit UI để giảm rủi ro query rộng.
