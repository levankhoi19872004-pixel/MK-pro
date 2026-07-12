# PHASE250A — P1 AUDIT VERIFICATION REPORT

**Dự án:** MK-Pro Phase249 — Global Scoped Bulk Selection Governance  
**Baseline ZIP được kiểm tra:** `MK-pro-phase249-global-scoped-bulk-selection-governance-fixed(3).zip`  
**Báo cáo đối chiếu:** `MK_PRO_PHASE249_COMPREHENSIVE_AUDIT.md`  
**Ngày xác minh:** 12/07/2026  
**Chế độ:** source audit + test harness; không kết nối production; không migration/backfill/repair; không sửa business implementation.

---

## 1. Executive summary

Cả bốn phát hiện P1 trong báo cáo Phase249 đều được **xác nhận bằng code path và test có thể lặp lại**. Báo cáo gốc không bị tin mặc định; từng finding đã được truy ngược từ state/route/service/model và được kiểm tra độc lập.

| Finding | Kết luận | Evidence level | File/hàm | Test/lệnh | Hướng sửa đề xuất |
|---|---|---|---|---|---|
| F-01 — Checkbox NVBH làm thay đổi `selectedOrderIds` | Xác nhận. `toggleSalesmanSelection()` gọi `selectGroupOrders()`; tập đơn đủ điều kiện trong nhóm được thêm/xóa. Payload chốt sổ lấy từ `selectedOrderIds` sau khi lọc eligibility. | `CONFIRMED` | `public/js/app/new/91-delivery-today-new.js`: `selectGroupOrders` 883–891; `toggleSalesmanSelection` 1023–1028; handler 1079–1086; `submitCloseout` 1498–1534 | `npm run test:phase250a` — Track A 5/5 pass | Phase250B: tách NVBH filter/KPI state khỏi order command selection. |
| F-02 — Inventory read không giới hạn `warehouseCode: MAIN` | Xác nhận ở canonical summary/availability: query không có warehouse predicate, cộng mọi row theo sản phẩm rồi gắn output là `MAIN`. Ảnh hưởng số liệu production cần chạy audit read-only với Mongo URI. | `CONFIRMED` | `src/services/inventoryStock.service.js`: `getAvailableStocks` 114–155; `getInventorySummary` 165–265; `getCurrentStock` trong `inventoryService.source/part-02.jsfrag` 177–195 | Track B 3/3 pass; `npm run audit:inventory-warehouse-distribution` an toàn khi thiếu URI | Phase251: enforce canonical MAIN predicate trên mọi operational read path; giữ multiwarehouse analytics riêng. |
| F-03 — Role `sales` có thể update/cancel đơn không thuộc mình | Xác nhận tại canonical web boundary: middleware cho `sales`; controller không truyền actor; legacy command tìm đơn theo ID/code và không kiểm ownership. Hai URL mount dùng chung route. Mobile dùng writer khác và có owner filter. | `CONFIRMED` | `src/routes/orderRoutes.js` 8–22; `src/routes/index.js` 112–113; `src/controllers/orderController.js` 143–176; `orderLegacy.../part-03.jsfrag` 139–284 | Track C 4/4 pass bằng route/controller/service harness. Real Mongo endpoint test chưa chạy vì không có test DB. | Phase252: domain authorization policy actor × owner × status × command, áp dụng cho mọi alias. |
| F-04 — Release manifest và artifact verifier không thống nhất | Xác nhận. Hai verifier khác policy `.env.production.example`; source verifier còn dùng `tar -tf` cho ZIP; manifest stale; `quality` bỏ qua manifest/artifact gate; test runner gọi cleanup xóa source. | `CONFIRMED` | `RELEASE_MANIFEST.json`; `verify-source-artifact-clean.js` 35–93; `verify-deployment-artifact.js` 45–93; `package.json` 14, 35, 38, 51; `run-tests.js` 3; `cleanup-retired-files.js` 7–16 | Manifest FAIL 5 trường; deployment verifier PASS 2.139 entry; source directory verifier FAIL `.env.production.example`; Track D 4/4 pass | Phase253: một policy dùng chung, manifest/artifact gate bắt buộc, test non-mutating. |

### Kết luận Phase250A

- **4/4 P1 được xác nhận.**
- Không có finding nào bị bác bỏ.
- Không có business implementation nào được sửa.
- Không chạy migration, backfill, repair hoặc writer command.
- Không có Mongo URI nên dữ liệu warehouse production và HTTP authorization end-to-end được để lại cho runbook read-only/test environment.

---

## 2. Tổng quan dự án và phạm vi audit

### 2.1 Quy mô baseline

| Chỉ số | Kết quả |
|---|---:|
| Tổng file trong source baseline | 1.994 |
| JavaScript baseline | 1.456 |
| JavaScript sau khi thêm 6 file audit/test | 1.462 |
| NPM scripts baseline | 135 |
| File frontend Delivery Today New | 2.427 dòng |
| ZIP entries do deployment verifier kiểm tra | 2.139 |
| File baseline được mở/trace trực tiếp theo dòng | 51 |

Ngoài 51 file evidence trực tiếp, toàn bộ 1.994 file baseline được inventory và search repository-wide. Báo cáo audit gốc được đọc riêng từ File Library để đối chiếu.

### 2.2 Tech stack liên quan trực tiếp

- Node.js + Express.
- MongoDB/Mongoose.
- JavaScript frontend thuần.
- Route/controller/service facade/legacy implementation hybrid.
- Governance bằng npm scripts, source-bundle checks, artifact verifiers và release manifest.

### 2.3 Phương pháp

1. Giải nén ZIP vào workspace riêng.
2. Hash toàn bộ 1.994 file baseline trước khi tạo test/audit artifact.
3. Search repository-wide cho state, route, model query và release gate.
4. Mở code theo call graph, không chỉ dựa vào đoạn trích của báo cáo cũ.
5. Viết test harness chỉ trong `test/` và script read-only trong `scripts/`.
6. Chạy targeted tests/gates mà không chạy `npm test`, vì `pretest` và `run-tests.js` có side effect cleanup.
7. So sánh lại hash để xác nhận không có file nghiệp vụ bị thay đổi hoặc xóa.

---

## 3. Track A — Selection state verification

### 3.1 State map

| State/hàm | Vai trò thực tế | Bằng chứng |
|---|---|---|
| `selectedSalesmanKeys` | Danh sách NVBH đang bật để quyết định nhóm đơn hiển thị/KPI | state khai báo dòng 15; `getVisibleRowsBySelectedSalesmen`; `applySelectedSalesmanFilter` |
| `selectedOrderIds` | Tập order key dùng cho checkbox đơn, bulk adjustment và chốt sổ | state dòng 15; `toggleOrderSelection`; `getCloseoutSelectionSummary` |
| `selectGroupOrders(group, checked)` | Thêm hoặc xóa toàn bộ order key có `viewSelectable=true` của một NVBH | dòng 883–891 |
| `toggleSalesmanSelection(key, checked)` | Vừa cập nhật NVBH state, vừa gọi `selectGroupOrders` | dòng 1023–1028 |
| Order checkbox handler | Chỉ gọi `toggleOrderSelection(orderKey, checked)` | dòng 1231–1235 |
| Order-list toggle | Chỉ thay đổi `selectedOrderIds` trong visible scope | dòng 957–974 |
| `getCloseoutSelectionSummary` | Lấy visible rows, đối chiếu `selectedOrderIds`, sau đó chỉ giữ row closeout-eligible | dòng 981–1005 |
| `submitCloseout` | Dùng `eligibleRows`, sinh `orderIds`, gửi cả `orderIds` và `selectedOrderIds` | dòng 1498–1534 |
| `load` | Khi fetch thành công: reset cả hai state, tick tất cả NVBH và tự chọn lại mọi đơn selectable | dòng 2337–2404 |

### 3.2 Luồng đã chứng minh

```text
NVBH checkbox change
  → toggleSalesmanSelection(groupKey, checked)
  → selectedSalesmanKeys[groupKey] = checked
  → selectGroupOrders(group, checked)
  → selectedOrderIds.add/delete(orderKey)
  → renderRows()
  → getCloseoutSelectionSummary()
  → submitCloseout().payload.selectedOrderIds
```

Do đó mệnh đề sau là đúng:

```text
Tick NVBH
→ selectedOrderIds thay đổi
→ payload chốt sổ có thể thay đổi
```

### 3.3 Kết quả 5 test hành vi

| Test | Actual behavior |
|---|---|
| Tick NVBH có phải chỉ là filter không? | Không. Nó đồng thời chọn/bỏ chọn đơn của nhóm. |
| Tick một đơn có thay đổi NVBH không? | Không. `toggleOrderSelection` chỉ thay đổi order set. |
| Toggle tất cả đơn có ảnh hưởng checkbox NVBH không? | Không. `toggleVisibleOrderSelection` không ghi `selectedSalesmanKeys`. |
| Payload chốt sổ lấy từ state nào? | Từ `selectedOrderIds`, nhưng chỉ với visible rows có `viewSelectable` và `closeoutEligible`. |
| Filter rồi reload có stale selection không? | `renderRows()` prune order key ngoài visible scope. Fetch reload thành công reset cả hai store nên không giữ stale key; tuy nhiên nó mất manual selection và tự chọn lại tất cả đơn selectable. |

### 3.4 Đánh giá chất lượng

**Điểm mạnh:** chiều order → NVBH đã được cô lập; toggle order dùng helper scoped; payload còn guard eligibility.  
**Điểm yếu nghiêm trọng:** chiều NVBH → order vẫn coupling ngầm, trái semantics “NVBH dùng filter/KPI”. Test Phase249 hiện tại chỉ bảo vệ một chiều nên vẫn xanh.

### 3.5 Hướng sửa phase sau

**Phương án A — Production-grade, khuyến nghị**  
Tách action/state reducer: NVBH checkbox chỉ thay đổi visibility/KPI; order selection chỉ thay đổi từ order checkbox/order bulk toggle. Nếu cần nghiệp vụ “chọn đơn của NVBH”, tạo action riêng có nhãn rõ. Thêm DOM integration và payload contract test.  
**Effort:** Medium. **Rủi ro:** code KPI/render đang dựa vào side effect cũ; cần kiểm tra UX sau tách.

**Phương án B — Cân bằng effort**  
Bỏ duy nhất lời gọi `selectGroupOrders()` khỏi `toggleSalesmanSelection()`, giữ cấu trúc file hiện tại, bổ sung regression tests hai chiều.  
**Effort:** Easy–Medium. **Rủi ro:** god file và semantics visible/selected vẫn khó bảo trì.

---

## 4. Track B — Inventory MAIN verification

### 4.1 Canonical operational read path

`InventoryCurrent` trong `inventoryStock.service.js` thực tế trỏ tới `InventoryLegacy`.

#### Available stock

```text
Product aliases
  → InventoryCurrent.find({ $or: product aliases })
  → không có warehouseCode
  → quantityOf(row) cộng mọi row
  → stock map dùng cho validation/product/mobile/import
```

#### Inventory summary

```text
InventoryCurrent.find({})
  → load toàn collection
  → group chỉ theo productCode
  → cộng onHand/available/reserved của mọi warehouse
  → output warehouseCode = stockWarehouseCode() = MAIN
```

Test fixture với cùng sản phẩm có:

- MAIN: 10
- LEGACY/HCM: 5
- thiếu `warehouseCode`: 2

Actual result của service:

- `getAvailableStocks`: 17
- `getInventorySummary`: 17
- output vẫn mang nhãn `MAIN`

### 4.2 Phân loại read/query path

| Nhóm | File/hàm | Phân loại | Nhận định |
|---|---|---|---|
| Inventory summary | `inventoryStock.service.js#getInventorySummary` 165–265 | Không filter warehouse; gộp nhiều warehouse; gắn output MAIN | P1 confirmed |
| Available stock | `inventoryStock.service.js#getAvailableStocks` 114–155 | Không filter warehouse; cộng theo sản phẩm | P1 confirmed |
| Legacy current stock | `inventoryService.source/part-02.jsfrag#getCurrentStock` 177–195 | Không filter; group product; gắn MAIN | Cùng pattern nguy hiểm |
| Reconciliation inventory | `domain/reconciliation/ReconciliationService.js` 57–97 | Aggregate không warehouse predicate; group product | Có thể che chênh lệch giữa warehouse |
| Warehouse inventory | `warehouse/WarehouseService.js` 171–190 | Có filter `warehouseCode` do caller cung cấp | Scoped đúng |
| Snapshot by product | `inventoryService.source/part-01.jsfrag#getSnapshot` 155–165 | Có `warehouseCode: MAIN` | Scoped đúng |
| Bulk stock validation | `inventoryService.source/part-02.jsfrag` 19–24 | Có `warehouseCode: MAIN` | Scoped đúng sau normalize |
| Projection analytics | `analytics/ProjectionService.js` 97–129 | Chủ ý group theo warehouse; warehouse trống fallback MAIN | Multiwarehouse analytics, không nên dùng làm operational MAIN SSoT |
| Normalize-to-MAIN writer | `inventoryService.source/part-01.jsfrag` 168–205 và 574–592 | Đọc mọi warehouse để gom/normalize | Writer migration-like behavior; ngoài phạm vi sửa Phase250A |
| DMS sales import validation | `salesImport.impl.js` 285–288 | Chủ ý dùng helper unfiltered để hỗ trợ row legacy trống | Xác nhận compatibility debt |

### 4.3 Blast radius của helper unfiltered

| Luồng | Caller |
|---|---|
| Inventory current API/stock check | `inventoryController.js` 31–62 |
| Product availability | `productService.js` 87–121 |
| Mobile product list | `mobile/catalog.service.js` 123–148 |
| Mobile sales stock lookup | `mobile/sales.service.source/part-01.jsfrag` 382–396 |
| Product search | `searchRepository.js` 314–331 |
| Excel interaction/product resolution | `ExcelInteractionService.js` 701–718 |
| Import negative stock guard | `importPersistence.util.js` 339–357 |
| Import preview/row validation | `importRow.util.js` 240–248 |
| Current inventory report/export | `InventoryReportService.js` 165–185 |
| Legacy report read model | `reportLegacy.service.source/*` |
| DMS reconciliation | `dmsInventoryReconciliation.service.js` 212–234 |

### 4.4 Production data status

Không có Mongo URI an toàn được cung cấp, nên Phase250A **không kết luận** production hiện có bao nhiêu row legacy/missing warehouse hoặc sản phẩm trùng warehouse. Script mới chỉ đọc đã được tạo:

```bash
npm run audit:inventory-warehouse-distribution
```

Không có URI, script in hướng dẫn và exit 0; không load Mongoose và không thử kết nối. Có URI read-only, script chỉ dùng aggregate/read preference `secondaryPreferred` để:

- group theo `warehouseCode`;
- đếm document;
- tổng `onHand` và `available`;
- tìm product có mặt ở nhiều warehouse;
- liệt kê row thiếu `warehouseCode`.

### 4.5 Hướng sửa phase sau

**Phương án A — Production-grade, khuyến nghị**  
Tạo canonical operational predicate `warehouseCode: MAIN` dùng chung; áp dụng cho summary/available/product/mobile/validation/report. Multiwarehouse analytics phải dùng API/helper riêng. Viết invariant test với MAIN + legacy + missing row. Dữ liệu legacy chỉ audit trước, migration tách phase.  
**Effort:** Medium. **Rủi ro:** row production thiếu warehouse có thể đang đóng góp tồn thực tế; filter ngay có thể làm tồn giảm, cần đọc báo cáo distribution trước deploy.

**Phương án B — Cân bằng effort**  
Chỉ filter MAIN tại `getAvailableStocks` và `getInventorySummary`, đồng thời log/metric số row bị loại.  
**Effort:** Easy. **Rủi ro:** direct legacy reads/reconciliation vẫn có semantics khác.

---

## 5. Track C — Order authorization verification

### 5.1 Canonical web call graph

```text
/api/orders hoặc /api/sales-orders
  → orderRoutes
  → requireRole(['admin','manager','accountant','sales'])
  → orderController.update/cancel/remove
  → orderService
  → SalesOrderCommandService facade / legacy implementation
  → orderRepository.findByIdOrCode(id)
  → SalesOrder model
```

Hai mount cùng route registry:

- `/api/sales-orders` — `src/routes/index.js:112`
- `/api/orders` — `src/routes/index.js:113`

### 5.2 API matrix và actual behavior

| Actor | Order owner | Command | Actual behavior từ code/harness | Runtime note |
|---|---|---|---|---|
| sales A | A | update | Middleware cho phép; service chạy nếu status/business guards cho phép | Policy hiện tại cho owner flow |
| sales B | A | update | Middleware cho phép; controller bỏ actor; writer không owner check | Cross-owner source behavior confirmed |
| sales B | A | cancel | Middleware cho phép; controller bỏ actor; writer không owner check | Cross-owner source behavior confirmed |
| admin | A | update | Middleware cho phép; không ownership restriction | Theo policy role rộng hiện tại |
| accountant | A | cancel | Middleware cho phép; không ownership restriction | Theo policy role rộng hiện tại |

### 5.3 Route-by-route

| API | Role middleware | Actor truyền xuống? | Ownership check | Status/domain guard |
|---|---|---|---|---|
| `PUT /api/orders/:id` và alias `/api/sales-orders/:id` | admin/manager/accountant/sales | Không, chỉ `id` + `body` | Không | Có một số delivery/accounting/master guards trong legacy writer |
| `PATCH /api/orders/:id` và alias | Như trên | Không | Không | Như PUT |
| `POST /api/orders/:id/cancel` và alias | Như trên | Không | Không | Có cancel/reverse/inventory guards theo trạng thái |
| `POST /api/orders/:id/delete` | Như trên | `remove` truyền user metadata, nhưng không truyền `ownerFilter` | `SalesOrderDeletionService` chỉ enforce nếu caller truyền `ownerFilter`; web caller không truyền | Có delete/reverse guards |
| `DELETE /api/orders/:id` | Như trên | Như POST delete alias | Như trên | Như trên |

### 5.4 Mobile route là writer khác

```text
/api/mobile/sales/orders/:id
  → onlySales middleware
  → mobile sales controller
  → mobileSalesOwnerMongoFilter(mobileUser)
  → SalesOrder.findOne({ $and: [identity, owner, active] })
```

Mobile update/delete có owner scope; điều này **không bảo vệ canonical web aliases**.

### 5.5 Test status

`test/phase250a-order-authorization-verification.test.js` kiểm tra:

1. route registration và role list;
2. controller thực thi request `sales B` trên order owner A bằng service stub;
3. số tham số service chỉ là `id`, `body`, không có actor;
4. legacy writer không có `ownerFilter`/authorization boundary;
5. mobile writer có owner filter riêng.

Test dùng route/controller/service harness và không cần Mongo. HTTP + Mongoose integration thực chưa chạy vì ZIP không có dependency/test DB an toàn. Điều này không làm mất bằng chứng code path, nhưng vẫn nên chạy non-production integration trước Phase252 deploy.

### 5.6 Hướng sửa phase sau

**Phương án A — Production-grade, khuyến nghị**  
Tạo `canMutateSalesOrder(actor, order, command)` hoặc command policy tương đương; controller bắt buộc truyền actor; policy kiểm role, canonical owner code, trạng thái và command; cùng policy cho mọi alias/web/mobile. Test matrix role × owner × status × route.  
**Effort:** Medium. **Rủi ro:** desktop flow cũ của NVBH có thể đang dựa vào quyền rộng; cần telemetry/test trước khóa.

**Phương án B — Cân bằng effort**  
Loại `sales` khỏi `writeOrders` ở canonical web routes; giữ mobile writer hiện có với owner filter.  
**Effort:** Easy. **Rủi ro:** có thể chặn một desktop sales flow hợp lệ chưa được inventory.

---

## 6. Track D — Release governance verification

### 6.1 Trả lời năm câu hỏi bắt buộc

#### 1. Hai verifier có cùng policy không?

**Không.**

- Source verifier chỉ cho phép basename chính xác `.env.example`.
- Deployment verifier cho phép `.env.example` **hoặc** `.env.production.example`.
- Source verifier dùng `tar -tf` để đọc ZIP; deployment verifier dùng `unzip -Z1`. Trong môi trường audit, source verifier không đọc được ZIP hợp lệ mà deployment verifier pass.

#### 2. Manifest đang phản ánh phase nào?

Manifest mang metadata:

- `releaseId`: `2026-07-08-05`
- `releasedBy`: `chatgpt-phase204`
- `buildTime`: `2026-07-08T13:01:17.235Z`

Vì baseline đang là Phase249 và check hiện tại báo 5 trường mismatch, manifest không phản ánh source Phase249.

#### 3. Quality gate có gọi manifest check không?

**Không.** `quality` không gọi `check:release-manifest` và cũng không gọi `test:artifact-clean`.

#### 4. Test có thay đổi source không?

**Có thể có.**

- `pretest` chạy `cleanup:retired`.
- `run-tests.js` dòng 3 `require('./cleanup-retired-files')`.
- `cleanup-retired-files.js` dùng `fs.rmSync` trên ba retired source path nếu tồn tại.

Phase250A không chạy `npm test` để tránh side effect này.

#### 5. Một artifact có thể pass gate A nhưng fail gate B không?

**Có, đã tái hiện.**

- Deployment verifier trên ZIP baseline: **PASS**, 2.139 entries.
- Source verifier trên thư mục baseline: **FAIL** vì `.env.production.example`.
- Source verifier trên ZIP baseline: **FAIL trước policy check** vì `tar -tf` không đọc được ZIP trong môi trường này.

### 6.2 Release gate result

| Lệnh | Kết quả thực tế |
|---|---|
| `npm run check:release-manifest` | FAIL: `sourceSha256`, `sourceFileCount`, `bundleSha256`, `bundleCount`, `configurationVersion` stale |
| `npm run test:artifact-clean` | FAIL: script thiếu target mặc định, in Usage |
| `npm run test:artifact-clean -- --directory .` | FAIL: `.env.production.example` bị cấm |
| `node scripts/verify-deployment-artifact.js --zip <baseline.zip>` | PASS: 2.139 entries |
| `node scripts/verify-source-artifact-clean.js --zip <baseline.zip>` | FAIL: ZIP parser dùng `tar -tf` không tương thích trong môi trường này |

### 6.3 Hướng sửa phase sau

**Phương án A — Production-grade, khuyến nghị**  
Tạo một artifact policy module dùng chung cho source/deployment verifiers; cùng ZIP reader; `quality` bắt buộc gọi manifest + artifact clean; manifest chỉ generate ở release step và check sau bundle; test runner tuyệt đối non-mutating.  
**Effort:** Medium. **Rủi ro:** clean baseline ban đầu sẽ fail nhiều gate, cần xử lý có kế hoạch.

**Phương án B — Cân bằng effort**  
Đồng bộ allowlist `.env.production.example`, đổi source ZIP reader sang `unzip`, thêm target mặc định `--directory .`, đưa hai check vào `quality`, bỏ cleanup khỏi `pretest/run-tests.js` nhưng giữ lệnh cleanup thủ công.  
**Effort:** Easy–Medium. **Rủi ro:** policy vẫn nằm ở hai script và có thể drift lại.

---

## 7. Test và quality gate thực tế

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `node --check` trên 6 file JS mới | PASS | Không có syntax error |
| `npm run check:syntax` | PASS | `SYNTAX_OK 1462 JavaScript files` |
| `npm run test:phase249` | PASS | 13 pass, 0 fail |
| `npm run audit:scoped-bulk-selection` | PASS | 6 governed scopes; 2 P2 header-checkbox inventory |
| `npm run test:phase250a` | PASS | 16 pass, 0 fail |
| `npm run check:release-manifest` | FAIL — expected finding | 5 trường stale |
| `npm run test:artifact-clean` | FAIL — expected finding | Không có target mặc định |
| `npm run test:artifact-clean -- --directory .` | FAIL — expected finding | `.env.production.example` policy conflict |
| `npm run audit:inventory-warehouse-distribution` không URI | PASS safe-skip | Không load Mongoose, không kết nối DB |
| `npm run audit:order-ownership` không URI | PASS safe-skip | Không load Mongoose, không kết nối DB |
| `npm test` | NOT RUN | Cố ý không chạy vì pretest/test runner cleanup source |

---

## 8. File changes và integrity evidence

### 8.1 File mới

1. `scripts/audit-inventory-warehouse-distribution.js`
2. `scripts/audit-order-ownership-read-only.js`
3. `test/phase250a-selection-state-verification.test.js`
4. `test/phase250a-inventory-main-verification.test.js`
5. `test/phase250a-order-authorization-verification.test.js`
6. `test/phase250a-release-governance-verification.test.js`
7. `PHASE250A_P1_AUDIT_VERIFICATION_REPORT.md`
8. `PHASE250A_PRODUCTION_READ_ONLY_RUNBOOK.md`

### 8.2 File baseline được chỉnh

- `package.json`: chỉ thêm 5 command audit/test:
  - `test:phase249`
  - `audit:scoped-bulk-selection`
  - `audit:inventory-warehouse-distribution`
  - `audit:order-ownership`
  - `test:phase250a`

### 8.3 File production nghiệp vụ

- File thay đổi dưới `src/`: **0**
- File thay đổi dưới `public/`: **0**
- Controller/service/model/route business code thay đổi: **0**
- File baseline bị xóa: **0**
- Migration/backfill/repair chạy: **0**
- Production DB connection: **0**

---

## 9. Roadmap sửa tiếp theo

| Finding | Phase tiếp theo | Phạm vi bắt buộc |
|---|---|---|
| F-01 | Phase250B — Scoped Selection Domain Isolation | Chỉ Delivery Today selection state + DOM/payload regression test |
| F-02 | Phase251 — MAIN Inventory Read Enforcement | Operational reads + production distribution evidence; không migration cùng phase |
| F-03 | Phase252 — Sales Order Authorization Boundary | Actor/ownership/status policy cho update/cancel/delete và aliases |
| F-04 | Phase253 — Release Gate Consistency | Unified artifact policy, manifest gate, non-mutating test runner |

---

## 10. Final verdict

Phase250A đạt mục tiêu verification gate:

- `F-01`: **CONFIRMED**
- `F-02`: **CONFIRMED**
- `F-03`: **CONFIRMED**
- `F-04`: **CONFIRMED**

Không nên gộp bốn bản sửa vào một phase. Mỗi finding chạm một boundary khác nhau—frontend state, inventory SSoT read, domain authorization và release governance—nên phải tách Phase250B/251/252/253 để giữ rollback rõ và không sửa lan sang AR/Fund/Inventory/Delivery writers.
