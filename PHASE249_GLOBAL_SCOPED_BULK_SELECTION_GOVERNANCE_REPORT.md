# Phase249 — Global Scoped Bulk Selection Governance

## 1. Executive summary

Phase249 triển khai **Phương án A**: tạo lõi chọn hàng loạt theo phạm vi dùng chung và migrate toàn bộ màn active được phân loại P0/P1 trong đợt audit này.

Quy tắc đã được khóa bằng code, test và static audit:

```text
Một toggle
→ một scope
→ một loại entity
→ một selection store
→ một tập payload
```

Kết quả trọng yếu:

- Không còn cặp nút `Chọn tất cả` / `Bỏ chọn` trong cùng scope đã migrate.
- Caption chuyển trạng thái giữa `Chọn tất cả` và `Bỏ chọn tất cả`.
- Toggle chỉ tác động các dòng hợp lệ đang hiển thị trong đúng scope.
- Màn **Đơn giao hôm nay (New)** đã tách tuyệt đối selection đơn và selection NVBH.
- Bulk payload tiếp tục dùng đúng tập entity của từng module; riêng closeout vẫn lấy giao của `selected order ∩ closeout eligible`.
- Không thay đổi API, route, permission, database schema, accounting writer, Fund writer, Inventory writer hoặc nghiệp vụ closeout.

## 2. Root cause

Các màn active hình thành bulk selection ở nhiều thời điểm khác nhau nên tồn tại ba loại sai lệch:

1. Hai nút rời `Chọn tất cả` và `Bỏ chọn`, mỗi nút có handler riêng.
2. Selector checkbox được tìm từ phạm vi quá rộng hoặc payload được dựng lại từ DOM.
3. Một màn có nhiều loại entity nhưng selection state bị đồng bộ chéo.

Lỗi P0 tại Delivery Today:

```text
Scope A: NVBH thuộc NVGH đang chọn
Scope B: Danh sách đơn
```

Nút bulk tại danh sách đơn trước đây có thể làm thay đổi cả state NVBH. Điều đó khiến thao tác chọn/bỏ chọn đơn vô tình thay đổi bộ lọc/KPI NVBH.

## 3. Audit active runtime

Audit chỉ quét nguồn frontend đang được mount/runtime; không dùng tài liệu hoặc màn retired làm căn cứ migration.

| Mức | Module/màn | Entity | Vấn đề trước sửa | Xử lý |
|---|---|---|---|---|
| P0 | Đơn giao hôm nay (New) | Sales order | Hai scope NVBH/đơn có nguy cơ mutate chéo; nhiều bulk control | Tách store, một toggle cho order list |
| P1 | Công nợ (New) — popup đơn nợ | Debt order | Hai nút riêng | Một toggle scoped |
| P1 | Import preview | Preview row hợp lệ | Hai nút riêng; selector DOM rộng | Một toggle + scoped container |
| P1 | Bán hàng | Sales order | Header toggle và selected payload dựa nhiều vào DOM | State Set + scoped toggle/payload |
| P1 | Đơn tổng | Master order | Toggle chưa theo shared state contract | Migrate shared helper |
| P1 | Đơn con chưa gộp | Sales order | Toggle riêng chưa thống nhất accessibility | Migrate shared helper |
| P2 | Danh mục sản phẩm/khách hàng | Header checkbox | Header-checkbox active, chưa có lỗi paired-button/scope P0/P1 | Theo dõi ở phase sau |
| P2 | Import orders header | Header checkbox | Header-checkbox active, chưa có lỗi paired-button/scope P0/P1 | Theo dõi ở phase sau |

Không tuyên bố đã migrate P2. Static audit ghi rõ inventory P2 còn lại.

## 4. Shared scoped-selection core

Tạo:

```text
public/js/shared/scoped-bulk-selection.js
```

API chính:

- `collectSelectableKeys()`
- `deriveScopeSelectionState()`
- `toggleScopeSelection()`
- `reconcileScopeSelection()`
- `applyToggleButtonState()`

Đặc tính:

- Không query DOM toàn trang.
- Không biết nghiệp vụ từng module.
- Không gọi API.
- Bỏ qua key rỗng, dedupe key và bỏ dòng không selectable.
- Chỉ mutate `Set` được truyền vào.
- Caption, `disabled`, `aria-disabled`, `aria-pressed`, `aria-label` và tooltip cùng lấy từ một summary.

Helper được load trước feature code trong:

```text
public/fragments/index/07-index-body.html
```

## 5. Scope registry

| Screen | Scope ID | Entity | Toggle caption | Selection store | Bulk payload | Status |
|---|---|---|---|---|---|---|
| Delivery Today — danh sách đơn | `delivery-order-list` | Sales order | Chọn tất cả ↔ Bỏ chọn tất cả | `selectedOrderIds` | Selected + closeout eligible | Migrated |
| Debt New — đơn công nợ | `debt-order-list` | Debt order | Chọn tất cả ↔ Bỏ chọn tất cả | Debt order selected Set | Selected debt orders | Migrated |
| Import preview | `import-preview-valid-rows` | Valid preview row | Chọn tất cả ↔ Bỏ chọn tất cả | Preview selected Set | Selected valid rows | Migrated |
| Bán hàng | `sales-order-list` | Sales order | Chọn tất cả ↔ Bỏ chọn tất cả | `window.__selectedSalesOrderKeys` | Selected sales orders | Migrated |
| Đơn tổng | `master-order-list` | Master order | Chọn tất cả ↔ Bỏ chọn tất cả | Master selected Set | Selected master orders | Migrated |
| Đơn con chưa gộp | `master-unmerged-child-list` | Sales order | Chọn tất cả ↔ Bỏ chọn tất cả | Child-order selected Set | Selected child orders | Migrated |

## 6. Delivery Today before/after

### Before

- Có nhiều bulk control trong khu vực danh sách đơn.
- Order selection và NVBH selection có logic đồng bộ chéo.
- `Bỏ chọn` đơn có thể làm thay đổi `selectedSalesmanKeys`.
- Checkbox NVBH vừa đóng vai trò filter explicit, vừa bị suy diễn từ order selection.

### After

Hai store độc lập:

```text
selectedSalesmanKeys  → scope NVBH/filter/KPI
selectedOrderIds      → scope danh sách đơn/view selection
```

Nút `deliveryTodayNewToggleOrders` chỉ gọi shared helper với:

```text
visibleRows       = đơn đang hiển thị theo NVBH/filter hiện tại
selectedKeys      = selectedOrderIds
getKey            = orderSelectionKey
isSelectable      = isViewSelectableOrder
```

Không gọi handler NVBH và không mutate `selectedSalesmanKeys`.

Case regression bắt buộc đã pass:

```text
NVBH tick = 1
Order tick = 1
Bấm Bỏ chọn tất cả tại danh sách đơn
→ selectedOrderIds = 0
→ selectedSalesmanKeys vẫn = 1
```

Closeout payload không đổi nghiệp vụ:

```text
selectedOrderIds ∩ closeoutEligibleRows
```

## 7. Caption và accessibility

Tất cả toggle đã migrate dùng:

- `type="button"`
- `data-selection-toggle`
- `data-selection-scope`
- `aria-controls`
- `aria-label`
- `aria-pressed`
- `aria-disabled`
- tooltip theo entity

Quy tắc caption:

| State | Caption |
|---|---|
| Không chọn hoặc chọn một phần | `Chọn tất cả` |
| Chọn toàn bộ dòng hợp lệ | `Bỏ chọn tất cả` |
| Không có dòng hợp lệ | disabled |

Không còn caption mơ hồ `Bỏ chọn` trong các bulk control được governance.

## 8. Filter/reload/pagination contract

- Toggle chỉ nhận dataset đang hiển thị của scope.
- Dòng filtered-out không được tự chọn.
- `reconcileScopeSelection()` loại key stale/không selectable mà không tác động Set khác.
- Caption và accessibility luôn được tính lại từ dataset mới.
- Không có action chọn toàn bộ dữ liệu chưa tải trên server.

## 9. Static governance audit

Tạo:

```text
scripts/audit-scoped-bulk-selection.js
npm run audit:bulk-selection
```

Audit kiểm tra:

- duplicate/retired bulk controls;
- caption `Bỏ chọn` mơ hồ;
- global checkbox selectors trong các bulk handler đã migrate;
- scope container/entity contract;
- accessibility attributes;
- Delivery Today order toggle không mutate NVBH state;
- package script;
- inventory P2 còn lại.

Kết quả:

```text
[bulk-selection-audit] OK 6 governed scopes
[bulk-selection-audit] P2 ... header-checkbox bulk control retained as P2
```

## 10. Files changed

### Shared/governance

- `public/js/shared/scoped-bulk-selection.js`
- `scripts/audit-scoped-bulk-selection.js`
- `docs/frontend/BULK_SELECTION_SCOPE_RULE.md`
- `package.json`

### Runtime UI/source

- `public/fragments/index/02-index-body.html`
- `public/fragments/index/03-index-body.html`
- `public/fragments/index/07-index-body.html`
- `public/js/app/new/91-delivery-today-new.js`
- `public/js/app/new/92-debt-new.js`
- `public/js/app/06-master-delivery.js`
- `public/js/app/05-sales-orders.source/part-03.jsfrag`
- `public/js/app/05-sales-orders.source/part-04.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-01.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-01b.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-02.jsfrag`

### Generated source bundles

- `public/js/app/05-sales-orders.part03.js`
- `public/js/app/05-sales-orders.part04.js`
- `public/js/app/admin/08d-import-excel.js`
- `public/js/app/admin/08d-import-excel.part02.js`
- `public/js/app/admin/08d-import-excel.part04.js`
- `config/source-bundles.json`

### Tests/fixtures

- `test/scoped-bulk-selection.test.js`
- `test/phase249-delivery-today-scope-isolation.test.js`
- `test/phase249-active-bulk-selection-migration.test.js`
- `test/delivery-today-new-sales-staff-selection.test.js`
- `test/phase91-new-services-contract.test.js`
- `test/phase234-desktop-feature-lazy-loading-static.test.js`
- `test/fixtures/index-page/phase79-assembled.sha256`

### Regression environment templates restored

Baseline ZIP thiếu hai template non-secret nhưng test contract hiện hữu bắt buộc đọc. Phase249 khôi phục với placeholder an toàn, không chứa credential thật:

- `.env.example`
- `.env.production.example`

Các template giữ offline financial queue fail-closed và các feature defaults đã được test hiện hữu quản lý.

## 11. Test evidence

### Targeted behavioral/governance

```text
36 tests
36 pass
0 fail
```

Bao phủ shared helper, Delivery Today scope isolation, active P0/P1 migration, Phase246 state consistency, Phase243 closeout result contract và Phase234 initial shell.

### Regression liên quan template/shell

```text
26 tests
26 pass
0 fail
```

### Full repository regression

Lệnh chạy:

```bash
TEST_SHARED_CHUNK_SIZE=1000 npm test
```

`TEST_SHARED_CHUNK_SIZE` chỉ thay đổi cách gom test process trong môi trường kiểm tra, không thay đổi nội dung test.

Kết quả tổng hợp các process:

```text
1,992 tests
1,991 pass
0 fail
1 skipped
exit code 0
```

### Source bundles

```text
[source-bundles] OK 19 bundles
```

### Static governance

```text
[bulk-selection-audit] OK 6 governed scopes
```

## 12. Artifact verification

Deployment artifact được tạo bằng verifier Phase247:

```text
MK-pro-phase249-global-scoped-bulk-selection-governance-fixed.zip
2,139 entries
[deployment-artifact] OK
```

Đã xác minh:

- giữ nguyên `src/`, `public/`, `test/`, `scripts/`;
- có `package.json` và `package-lock.json` tại root;
- không flatten source tree;
- không duplicate ZIP entry;
- không có `.git`, `node_modules`, coverage, log, runtime temp hoặc nested archive;
- extraction smoke test pass.

## 13. Không thay đổi nghiệp vụ

Phase249 không sửa:

- AR/Fund/Inventory/Return writer;
- transaction;
- accounting/debt formula;
- closeout eligibility;
- route hoặc API contract;
- permission;
- MongoDB schema;
- pagination business contract.

## 14. Remaining risks / P2 backlog

Hai nhóm header-checkbox P2 còn được inventory rõ trong audit:

1. Header checkbox danh mục sản phẩm/khách hàng trong `public/fragments/index/01-index-body.html`.
2. Header checkbox import orders trong `public/js/app/05-sales-orders.source/part-02.jsfrag`.

Chúng chưa được migrate vì audit không phát hiện paired-button hoặc cross-scope P0/P1. Không coi Phase249 đã chuẩn hóa P2.

## 15. Rollback plan

Rollback bằng code version về Phase248. Không có migration DB và không cần sửa dữ liệu. Khi rollback phải đồng thời khôi phục source fragments, generated source bundles, index hash fixture và package script để tránh source-bundle mismatch.

## 16. Production smoke-test checklist

- Delivery Today: NVBH tick 1, order tick 1; toggle order không đổi NVBH.
- Delivery Today: selected closed/view-selectable row vẫn theo contract; closeout payload chỉ chứa eligible.
- Debt New: toggle chỉ tác động đơn trong popup hiện tại.
- Import preview: toggle chỉ tác động valid rows đang hiển thị.
- Sales Orders: export/print chỉ dùng selected order keys trong scope.
- Master Orders: master toggle không tác động child-order scope và ngược lại.
- Thay filter/reload: caption và checkbox được recompute, không giữ stale `allSelected`.
- Kiểm tra keyboard, tooltip, `aria-pressed` và disabled state.

## 17. Acceptance status

- [x] Một toggle cho mỗi scope P0/P1 được migrate
- [x] Caption động đúng
- [x] Không tác động ngoài scope
- [x] Selection store tách theo entity
- [x] Payload lấy đúng scope
- [x] View selection tách business eligibility
- [x] Delivery Today order toggle không đổi NVBH state
- [x] Accessibility contract
- [x] Static audit pass
- [x] Targeted behavioral tests pass
- [x] Full regression exit code 0
- [x] Source bundles pass
- [x] Deployment artifact verification pass
- [x] ZIP giữ nguyên source tree
- [x] Không sửa accounting/API/business workflow
- [ ] P2 header-checkbox migration — backlog đã inventory, không thuộc P0/P1 acceptance của Phase249
