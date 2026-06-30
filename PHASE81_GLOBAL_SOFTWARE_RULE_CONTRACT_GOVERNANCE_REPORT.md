# Phase81 — Global Software Rule Contract & Governance Hardening

## 1. Tổng quan dự án

- Tech stack: Node.js/Express, MongoDB/Mongoose, JavaScript frontend/mobile, Node test runner.
- Quy mô ZIP: 1.543 file; `src` ~551 file, `test` ~392 file, `scripts` ~83 file.
- Module lõi đã audit: AR ledger/công nợ, inventory, fund ledger, return order, staff identity, frontend data contract, reports/dashboard.
- Tình trạng ban đầu: đã có AR read model Phase79/80/81 nhưng thiếu bộ `docs/contracts`, thiếu global audit scripts, thiếu static guard cross-module và còn một số report đọc `ArLedger` trực tiếp.

## 2. Audit nhiều lượt

### Lượt 1 — Keyword scan

Đã scan các pattern:

```text
ArLedger.find / ArLedger.aggregate / remainingDebt / debtAmount / totalAmount - paidAmount
inventorySnapshots / fundLedgers / returnOrders / salesStaffCode / deliveryStaffCode / staffCode
```

Kết quả runtime trước khi sửa có nhóm rủi ro chính:

| Mức độ | Module | Vấn đề |
|---|---|---|
| P0 | Reports/Dashboard | Một số report đọc `ArLedger.find/aggregate` trực tiếp |
| P0 | AR posting hygiene | `arPosting.service` còn fallback dirty AR-SALE bằng regex code |
| P1 | Governance | Chưa có contract docs/global static guard đầy đủ |
| P1 | Runtime validation | Chưa có util assertion chung cho AR/Fund/Stock/Staff |
| P3 | Legacy compatibility | Một số legacy/mobile cache còn `debtAmount = totalAmount - paidAmount` để giữ tương thích display cũ |

### Lượt 2 — Semantic scan

Đã đọc sâu các vùng:

- `src/services/arLedgerRead.service.js`
- `src/services/arDebtReadModel.service.js`
- `src/domain/ar/arLedgerValidator.js`
- `src/domain/ar/arLedgerQueryPolicy.js`
- `src/services/arPosting.service.js`
- `src/services/reports/*ReportService.js`
- `src/services/analytics/ProjectionService.js`
- `src/services/admin-correction/AdminDataCorrectionService.js`
- `public/js`, `public/mobile/js`
- `test/*static.test.js`

### Lượt 3 — Contract validation

Đã đối chiếu với các contract mới:

- AR Ledger contract.
- Inventory contract.
- Fund Ledger contract.
- Return Order contract.
- Staff Identity contract.
- Frontend Data contract.
- API/read-model boundary contract.

## 3. Thay đổi đã thực hiện

| File | Thay đổi | Lý do | Rủi ro |
|---|---|---|---|
| `docs/contracts/global-software-rules.md` | Tạo mới | Contract tổng thể SSoT và rule cấm | Thấp |
| `docs/contracts/ar-ledger-contract.md` | Tạo mới | Khóa công nợ qua AR canonical/read model | Thấp |
| `docs/contracts/inventory-contract.md` | Tạo mới | Khóa tồn kho qua stockTransactions/inventories | Thấp |
| `docs/contracts/fund-ledger-contract.md` | Tạo mới | Khóa quỹ qua fundLedgers canonical | Thấp |
| `docs/contracts/return-order-contract.md` | Tạo mới | Khóa returnOrders là SSoT trả hàng | Thấp |
| `docs/contracts/staff-identity-contract.md` | Tạo mới | Chuẩn NVBH/NVGH/audit actor | Thấp |
| `docs/contracts/frontend-data-contract.md` | Tạo mới | Cấm frontend tự tính nghiệp vụ lõi | Thấp |
| `src/utils/assertArLedgerContract.util.js` | Tạo mới | Wrapper contract AR write/read path | Thấp |
| `src/utils/assertFundLedgerContract.util.js` | Tạo mới | Validate fund ledger source/idempotency/amount | Thấp |
| `src/utils/assertStockPostingContract.util.js` | Tạo mới | Validate stock movement source/idempotency/product | Thấp |
| `src/utils/assertStaffIdentityContract.util.js` | Tạo mới | Normalize/validate NVBH-NVGH-audit actor | Thấp |
| `src/services/arLedgerRead.service.js` | Thêm bulk helper `getCanonicalLedgersByOrderKeys`, `getCanonicalLedgersByCustomerCodes` | Cho report đọc AR qua read service thay vì model raw | Trung bình thấp |
| `src/services/arPosting.service.js` | Bỏ fallback dirty sale ledger bằng regex code `AR-SALE-*` | Chặn hợp thức hóa ledger bẩn theo pattern code | Thấp |
| `src/services/reports/SalesReportService.js` | Chuyển AR lookup sang `arLedgerRead.service` | Report không đọc `ArLedger.find` trực tiếp | Trung bình |
| `src/services/reports/ReturnReportService.js` | Chuyển AR-RETURN lookup sang `arLedgerRead.service` | Return report dùng canonical AR | Trung bình |
| `src/services/reports/DashboardReportService.js` | Dashboard debt summary dùng `aggregateDebtByCustomer` | Không aggregate AR raw tại dashboard | Trung bình |
| `src/services/reports/InformationReportService.js` | Customer debt map dùng canonical bulk customer helper | Không aggregate AR raw tại information report | Trung bình |
| `src/services/reports/RewardReportService.js` | Reward report đọc canonical AR qua read service | Không aggregate AR raw theo regex code | Trung bình |
| `src/services/analytics/ProjectionService.js` | Customer debt projection dùng AR read service | Analytics không aggregate AR raw | Trung bình |
| `src/services/admin-correction/AdminDataCorrectionService.js` | Customer debt calculation dùng AR read service | Admin correction không tự aggregate AR raw | Trung bình |
| `scripts/lib/globalRuleAuditCore.js` | Tạo core scanner dùng chung | Một nguồn rule cho audit scripts/static tests | Thấp |
| `scripts/audit-global-software-rules.js` | Tạo mới | Audit tổng thể AR/inventory/fund/frontend | Thấp |
| `scripts/audit-ar-access-violations.js` | Tạo mới | Audit riêng AR access contract | Thấp |
| `scripts/audit-inventory-access-violations.js` | Tạo mới | Audit riêng inventory boundary | Thấp |
| `scripts/audit-fund-access-violations.js` | Tạo mới | Audit riêng fund boundary | Thấp |
| `scripts/audit-frontend-business-calculation.js` | Tạo mới | Audit frontend business calculation | Thấp |
| `scripts/reconcile-core-read-models.js` | Tạo mới | Reconcile read-only AR/inventory/fund khi có DB | Thấp |
| `package.json` | Thêm npm scripts audit/reconcile | Dễ chạy lại governance gate | Thấp |
| `test/global-software-rules-static.test.js` | Tạo mới | Guard tồn tại docs/scripts/util + không có P0/P1 unclassified | Thấp |
| `test/ar-ledger-access-contract-static.test.js` | Tạo mới | Guard AR direct read/debt math/regex fallback | Thấp |
| `test/inventory-access-contract-static.test.js` | Tạo mới | Guard inventorySnapshots runtime | Thấp |
| `test/fund-ledger-access-contract-static.test.js` | Tạo mới | Guard FundLedger raw access + fund contract | Thấp |
| `test/return-order-contract-static.test.js` | Tạo mới | Guard returnOrders/AR-RETURN contract | Thấp |
| `test/frontend-no-business-calculation-static.test.js` | Tạo mới | Guard frontend core business calculation | Thấp |
| `test/staff-identity-contract-static.test.js` | Bổ sung test util staff identity | Khóa NVBH/NVGH/audit actor | Thấp |
| `reports/phase81-global-software-rules-audit.*` | Tạo report audit JSON/Markdown | Bằng chứng audit sau sửa | Thấp |

## 4. Contract mới

| Contract | Nội dung chính |
|---|---|
| AR Ledger | Công nợ chỉ từ AR canonical + read model; cấm regex code fallback |
| Inventory | Tồn kho runtime qua stockTransactions/inventories; cấm snapshot runtime |
| Fund Ledger | Quỹ qua fundLedgers canonical có source/idempotency |
| Return Order | returnOrders là business SSoT; AR-RETURN/stock chỉ sau kế toán xác nhận |
| Staff Identity | NVBH=`salesStaffCode`, NVGH=`deliveryStaffCode`, audit actor=`staffCode` |
| Frontend Data | Frontend chỉ render/format payload chuẩn, không tự tính nghiệp vụ lõi |

## 5. Static guard mới

| Test | Rule bảo vệ |
|---|---|
| `global-software-rules-static.test.js` | Có đủ contract/docs/scripts/util; không còn P0/P1 unclassified |
| `ar-ledger-access-contract-static.test.js` | Chặn direct AR read, debt math, regex AR-SALE fallback |
| `inventory-access-contract-static.test.js` | Chặn inventorySnapshots runtime ngoài boundary |
| `fund-ledger-access-contract-static.test.js` | Chặn FundLedger raw access ngoài boundary và validate fund contract |
| `return-order-contract-static.test.js` | Khóa returnOrders/AR-RETURN contract |
| `staff-identity-contract-static.test.js` | Khóa canonical NVBH/NVGH/audit actor |
| `frontend-no-business-calculation-static.test.js` | Chặn frontend tự tính công nợ/fund/tồn lõi |

## 6. Audit result sau sửa

```text
node scripts/audit-global-software-rules.js --strict     PASS
node scripts/audit-ar-access-violations.js --strict      PASS
node scripts/audit-inventory-access-violations.js --strict PASS
node scripts/audit-fund-access-violations.js --strict    PASS
node scripts/audit-frontend-business-calculation.js --strict PASS
```

Kết quả global audit hiện còn 5 mục `P3-legacy-compatibility`, không còn P0/P1 unclassified:

| Mức độ | File | Vấn đề | Ghi chú |
|---|---|---|---|
| P3 | `src/services/arLedgerMigrationService.js` | Migration đọc ArLedger trực tiếp | Boundary migration/backfill, không phải runtime API |
| P3 | `src/services/mobile/sales.service.js` | Legacy display debt cache | Cần phase riêng nếu muốn xóa hẳn cache field |
| P3 | `src/services/mobileService.js` | Legacy mobile sales order cache | Không dùng làm AR SSoT |
| P3 | `src/services/reportLegacy.service.js` | Legacy report debt math | Chỉ legacy compatibility |
| P3 | `public/mobile/js/sales/sync.js` | Pending offline display debt | UI pending-sync, không phải AR SSoT |

## 7. Test result

### Đã chạy thành công

```text
npm run check:syntax
=> SYNTAX_OK 1118 JavaScript files
```

```text
node --test \
  test/global-software-rules-static.test.js \
  test/ar-ledger-access-contract-static.test.js \
  test/inventory-access-contract-static.test.js \
  test/fund-ledger-access-contract-static.test.js \
  test/return-order-contract-static.test.js \
  test/frontend-no-business-calculation-static.test.js \
  test/staff-identity-contract-static.test.js
=> 18 pass / 0 fail
```

```text
node scripts/reconcile-core-read-models.js --skip-db
=> Skipped DB reconcile (--skip-db)
```

### `npm test`

Đã chạy nhưng không thể hoàn tất trong sandbox vì ZIP không kèm `node_modules` và môi trường thiếu dependency dev `terser`:

```text
Error: Cannot find module 'terser'
Require stack:
- scripts/build-source-bundles.js
```

Không báo `npm test` pass. Cần chạy lại sau khi `npm ci`/cài dependency đầy đủ trên máy dự án hoặc CI.

## 8. Phương án kiến trúc

### Phương án A — Production-grade dài hạn

- Contract hóa toàn bộ SSoT.
- Mọi controller/report/mobile đi qua read/write service chuẩn.
- Static guard chặn direct collection access và business math sai tầng.
- Audit scripts chạy định kỳ hoặc trước release.
- Runtime validation cho write path mới.
- Reconcile read-only cho AR/inventory/fund.

Effort: Hard.

Lợi ích: giảm lỗi dây chuyền, ngăn lỗi cũ quay lại, dễ audit số liệu kế toán.

Rủi ro: cần tiếp tục bóc legacy compatibility P3 theo từng phase để tránh đổi hành vi đột ngột.

### Phương án B — Cân bằng effort

- Siết ngay AR report/dashboard + static guard.
- Giữ legacy display cache P3 có whitelist và report rõ.
- Chưa rewrite toàn bộ mobile/offline/reportLegacy.

Effort: Medium.

Lợi ích: ít rủi ro, cải thiện ngay governance P0/P1.

Nhược điểm: vẫn còn 5 điểm P3 cần phase sau nếu muốn sạch tuyệt đối.

## 9. Rủi ro còn lại

| Rủi ro | Mức độ | Có nên xử lý ngay không | Gợi ý phase sau |
|---|---|---|---|
| Legacy mobile/report cache còn `debtAmount = totalAmount - paidAmount` | P3 | Chưa bắt buộc nếu không dùng làm AR SSoT | Phase82 bóc legacy debt cache khỏi mobile/reportLegacy |
| Chưa chạy được `npm test` full do thiếu dependency | P1 vận hành | Có, trên máy/CI có `node_modules` | Chạy `npm ci && npm test` |
| `reconcile-core-read-models` chưa chạy DB thật | P1 dữ liệu | Có, sau deploy/staging DB | Chạy reconcile read-only với Mongo thật |
| Bulk helper AR read service dùng `$in` nhiều alias | P2 performance | Theo dõi nếu dữ liệu lớn | Thêm index hoặc paging nếu cần |

## 10. Tiêu chí hoàn thành trong phạm vi hiện tại

- Đã có contract docs: đạt.
- Đã có static guard: đạt.
- Đã chuyển các report/dashboard chính khỏi direct AR raw access: đạt.
- Đã bỏ regex fallback AR-SALE trong `arPosting.service`: đạt.
- Không còn P0/P1 unclassified theo global audit: đạt.
- Syntax pass và static tests mới pass: đạt.
- `npm test` full: chưa pass do thiếu dependency local, không được coi là bằng chứng pass.

## 11. Đề xuất Phase82

Phase82 nên tập trung bóc nốt 5 điểm P3 legacy compatibility:

1. `src/services/mobile/sales.service.js`
2. `src/services/mobileService.js`
3. `src/services/reportLegacy.service.js`
4. `public/mobile/js/sales/sync.js`
5. `src/services/arLedgerMigrationService.js` — giữ migration nhưng chuyển marker/whitelist rõ hơn hoặc tách khỏi runtime package nếu cần.

Mục tiêu Phase82: không còn bất kỳ pattern `totalAmount - paidAmount` nào trong runtime/UI, kể cả legacy display cache.
