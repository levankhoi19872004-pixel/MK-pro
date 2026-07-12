# PHASE250B — SCOPED SELECTION DOMAIN ISOLATION REPORT

**Baseline:** `MK-pro-phase250a-p1-audit-verification-gate(1).zip`  
**Ngày thực hiện:** 12/07/2026  
**Phạm vi:** Chỉ màn **Đơn giao hôm nay (New)** — frontend state/DOM selection governance.  
**Không thay đổi:** backend closeout, AR, Fund, Inventory, accounting writer, API contract nghiệp vụ.

## 1. Kết luận

Phase250B đã tách hai domain state:

```text
selectedSalesmanKeys = bộ lọc/nhóm KPI NVBH
selectedOrderIds     = tập đơn phục vụ bulk action/chốt sổ
```

Sau sửa:

- Tick/bỏ tick NVBH không thêm, xóa hoặc prune `selectedOrderIds`.
- Tick đơn/toggle danh sách đơn không sửa `selectedSalesmanKeys`.
- Thay đổi filter NVBH không thay đổi tập ứng viên payload chốt sổ.
- Refetch chỉ prune ID không còn trong dataset, không tự chọn thêm đơn mới.
- Toggle đơn chỉ tác động các order key selectable trong visible order scope.

## 2. Root cause

Finding Phase250A đúng nhưng nguyên nhân thực tế gồm ba coupling, không chỉ một lời gọi:

| Coupling cũ | Hậu quả |
|---|---|
| `toggleSalesmanSelection()` gọi `selectGroupOrders()` | Tick NVBH trực tiếp thêm/xóa order IDs. |
| `renderRows()` reconcile theo `visibleRows` | Đổi filter NVBH gián tiếp prune order IDs đang ẩn. |
| `getCloseoutSelectionSummary()` mặc định chỉ xét visible rows | Payload chốt sổ thay đổi dù `selectedOrderIds` không đổi. |
| `load()` reset và tự chọn lại tất cả đơn selectable | Manual selection bị mất; refetch tự bổ sung đơn vào selection. |

Vì vậy chỉ xóa `selectGroupOrders()` là chưa đủ để đạt invariant payload/state isolation.

## 3. File và hàm đã sửa

### `public/js/app/new/91-delivery-today-new.js`

| Hàm/vùng | Thay đổi |
|---|---|
| `updateTopKpisFromSelectedSalesmen()` — khoảng dòng 823 | KPI dùng rows thuộc NVBH đang lọc, không suy diễn từ order action selection. |
| `pruneStaleOrderSelection()` — khoảng dòng 869 | Helper riêng chỉ prune selected ID không còn tồn tại trong toàn bộ loaded rows. |
| `deriveVisibleSelectedCount()` — khoảng dòng 881 | Tính selected count trong visible order scope mà không ghi state. |
| `getSelectedOrders()` — khoảng dòng 958 | Resolve selected orders từ toàn bộ `state.rows`, độc lập với NVBH filter. |
| `getCloseoutSelectionSummary()` — khoảng dòng 984 | Mặc định xét toàn bộ loaded rows, sau đó lọc theo `selectedOrderIds` và closeout eligibility. |
| `applySelectedSalesmanFilter()` — khoảng dòng 997 | Chỉ render/filter; không reconcile order selection. |
| `toggleSalesmanSelection()` — khoảng dòng 1004 | Chỉ cập nhật `selectedSalesmanKeys`; đã bỏ side effect chọn đơn. |
| `updateOrderSelectionToolbar()` — khoảng dòng 1154 | Hiển thị tổng selected và visible-selected riêng, không dùng selector toàn trang. |
| `renderRows()` — khoảng dòng 1190 | Không prune selection theo visible rows. |
| `submitCloseout()` — payload khoảng dòng 1509 | `selectedOrderIds` chỉ lấy từ order-domain closeout summary. |
| `load()` — khoảng dòng 2316 | Refetch giữ selection hợp lệ, prune stale; không auto-select đơn. |

Đã loại bỏ các helper coupling cũ:

- `selectGroupOrders()`.
- `selectDefaultOrdersForSelectedSalesmen()`.
- `groupSelectableRows()` / `groupSelectedCount()` phụ thuộc order selection.

### Test

- Thêm `test/phase250b-scoped-selection-domain-isolation.test.js`.
- Cập nhật `test/phase250a-selection-state-verification.test.js` từ audit-vulnerability expectation sang regression expectation sau sửa.
- Thêm npm script `test:phase250b`.

## 4. Invariant verification

| # | Invariant | Kết quả |
|---:|---|---|
| 1 | Tick/bỏ tick NVBH không đổi `selectedOrderIds` | PASS |
| 2 | Tick/bỏ tick đơn không đổi `selectedSalesmanKeys` | PASS |
| 3 | Toggle order list chỉ quản lý checkbox đơn trong scope | PASS |
| 4 | Không tick lan sang “NVBH thuộc NVGH được chọn” | PASS |
| 5 | Payload chốt sổ chỉ lấy từ `selectedOrderIds` | PASS |
| 6 | Filter/search/render không tự bổ sung đơn | PASS |
| 7 | Refetch prune stale order ID | PASS |
| 8 | Không dùng selector checkbox toàn trang | PASS |

## 5. Behavioral test evidence

### Lệnh

```bash
npm run check:syntax
npm run test:phase249
npm run test:phase250b
node --test test/phase250a-selection-state-verification.test.js
```

### Kết quả

| Gate | Kết quả thực tế |
|---|---|
| JavaScript syntax | PASS — 1.463 files |
| Phase249 regression | PASS — 13/13 |
| Phase250B behavioral suite | PASS — 17/17 |
| Phase250A Track A remediated suite | PASS — 5/5 |

Bảy behavioral cases bắt buộc đều chạy bằng state/handler harness, không chỉ regex source:

1. Tick NVBH không đổi order IDs.
2. Bỏ tick NVBH không đổi order IDs.
3. Tick order không đổi salesman keys.
4. Toggle tất cả chỉ đổi selectable orders trong visible container scope.
5. Đổi NVBH filter không đổi closeout candidates/payload.
6. Refetch loại order thì stale ID bị prune, order mới không tự được chọn.
7. Hai domain độc lập hai chiều.

## 6. Payload closeout evidence

Luồng sau sửa:

```text
order checkbox / scoped order toggle
  → selectedOrderIds
  → getCloseoutSelectionSummary(state.rows)
  → giữ row có key trong selectedOrderIds
  → giữ row closeoutEligible
  → orderIds
  → payload.selectedOrderIds = orderIds
```

`selectedSalesmanKeys` không nằm trong chuỗi tạo payload. Nó chỉ điều khiển visibility/KPI.

## 7. Phạm vi không sửa

- Không sửa API closeout.
- Không sửa công thức closeout.
- Không sửa AR/Fund/Inventory/accounting writer.
- Không sửa backend route/controller/service.
- Không refactor toàn bộ file frontend dù file lớn.
- Không tạo action “chọn toàn bộ đơn của NVBH”; nếu cần sau này phải là nút riêng có nhãn rõ.

## 8. Rủi ro còn lại và kiểm tra thủ công đề xuất

| Rủi ro | Mức | Kiểm tra |
|---|---|---|
| Người dùng cũ quen tick NVBH là tự chọn đơn | Medium — thay đổi semantics có chủ đích | UAT: tick NVBH chỉ lọc KPI; chọn đơn bằng checkbox/toggle đơn. |
| Selected order có thể đang ẩn bởi filter NVBH | Low | Toolbar hiển thị tổng selected và số visible-selected để tránh hiểu nhầm. |
| Initial/refetch không còn auto-select tất cả đơn | Medium — an toàn hơn nhưng thay đổi thao tác | Xác nhận UX: chốt sổ yêu cầu người dùng chọn rõ ràng. |
| Chưa chạy browser automation thật | Low–Medium | Behavioral handler/state tests đã pass; nên smoke test Chrome trên màn thật trước deploy. |

## 9. Integrity

So với đầu Phase250B:

- File mới: 1 test + report này.
- File production sửa: duy nhất `public/js/app/new/91-delivery-today-new.js`.
- File backend sửa: 0.
- File bị xóa: 0.
- Migration/write production: 0.
