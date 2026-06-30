# PHASE89B Static Test Contract Realignment Report

## 1. Executive Summary

Phase89b sửa các static test stale sau Phase89 để chúng bảo vệ kiến trúc công nợ mới thay vì bảo vệ đường legacy cũ.

Kết luận kỹ thuật:

- Không sửa production service để quay lại đọc `AR-SALE` legacy.
- Không sửa report runtime để quay lại query trực tiếp `ArLedger.find(match).select(...).lean()`.
- Không đổi inventory/fund/delivery closeout/import/promotion/UI business flow.
- Chỉ sửa test static để align với kiến trúc Phase89.

Final Decision: **CONDITIONAL-GO**

Lý do: `npm test` nguyên khối trong sandbox timeout do test suite lớn/môi trường chạy dài. Toàn bộ test files đã được chạy lại theo chunk với kết quả **0 fail**.

## 2. 2 test fail ban đầu

| Test | Contract cũ đang bảo vệ | Lý do stale sau Phase89 | Cách sửa |
|---|---|---|---|
| `test/order-data-lineage-static.test.js` | Debt report lấy staff lineage từ `AR-SALE` legacy qua marker `DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_START` | Phase89 chuyển runtime debt/report sang `AR debt read model v2` / `arDebtRuntimeView`, không phụ thuộc `AR-SALE` legacy | Đổi assertion sang kiểm tra report delegate sang `arDebtRuntimeView` / `arCustomerDebtReadModel.debtReport` và không còn marker legacy |
| `test/phase36d-api-response-followup-static.test.js` | Debt detail query trực tiếp `ArLedger.find(match).select(...).lean()` trong report runtime | Phase89 yêu cầu runtime đi qua service/read model boundary, không raw query trực tiếp trong report/mobile runtime | Đổi assertion sang kiểm tra `debtCustomerDetail` delegate `debtReport`, `debtReport` delegate `arCustomerDebtReadModel.debtReport` và không có `ArLedger.find` trong 2 function runtime này |

## 3. Additional stale test found during chunked full test

Trong quá trình chạy chunked full test, phát hiện thêm 1 static test stale cùng bản chất boundary:

| Test | Vấn đề | Cách sửa |
|---|---|---|
| `test/mobile-sales-ledger-boundary.test.js` | Khi chạy với `refactorReadCompat` preload, test đọc assembled `masterOrderLegacy.service.js` nên nhìn thấy legacy emergency implementation có marker `MOBILE_SALES_PENDING_COLLECTION_POST_START` dù production facade Phase88/89 đã đi qua strict settlement path | Đổi test kiểm tra facade production `deliveryAccounting.service.js`: phải gọi `DeliverySettlementService.confirmAccounting`, có guard `assertLegacyDeliveryAccountingAllowed`, và không có marker/postReceiptAR/source mobile sales accounting confirmed trong facade |

Đây vẫn là sửa test static, không sửa production code.

## 4. File test đã sửa

| File | Thay đổi |
|---|---|
| `test/order-data-lineage-static.test.js` | Realign staff lineage static guard từ `AR-SALE` legacy sang AR debt read model v2 / runtime view |
| `test/phase36d-api-response-followup-static.test.js` | Realign debt detail static guard từ raw `ArLedger.find` sang read model boundary |
| `test/mobile-sales-ledger-boundary.test.js` | Realign accounting-confirm guard về production facade strict settlement path |

## 5. Có sửa production code không?

Không.

Diff thực tế chỉ gồm 3 file test:

```text
modified test/mobile-sales-ledger-boundary.test.js
modified test/order-data-lineage-static.test.js
modified test/phase36d-api-response-followup-static.test.js
```

## 6. Contract static guard mới

Static guard mới bảo vệ các điểm sau:

1. Debt report/runtime phải delegate sang `arDebtRuntimeView` hoặc `arCustomerDebtReadModel.debtReport`.
2. Debt report không còn yêu cầu marker `DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_START`.
3. Debt report không dùng `saleSalesmanName || fallbackSalesmanName` hoặc `saleDeliveryStaffName || fallbackDeliveryStaffName` legacy để dựng staff lineage runtime.
4. `debtCustomerDetail` delegate `debtReport`.
5. `debtReport` delegate `arCustomerDebtReadModel.debtReport(query)` và trả `debtSource: 'AR_DEBT_READ_MODEL_V2'`.
6. `debtCustomerDetail` và `debtReport` không query trực tiếp `ArLedger.find`.
7. Production accounting facade dùng strict delivery settlement path, không post pending mobile sales collection thành AR receipt.

## 7. Bằng chứng không reintroduce AR-SALE legacy runtime

- Không thêm lại marker `DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_START`.
- Test mới assert source không có marker `ORDER_DATA_LINEAGE_REPORT_AR_SALE_STAFF_ONLY_START`.
- Test mới assert report runtime delegate sang `AR_DEBT_READ_MODEL_V2`.
- Không sửa production code để đọc lại `AR-SALE`.

## 8. Bằng chứng không reintroduce ArLedger.find direct runtime

- Test `phase36d-api-response-followup-static.test.js` không còn yêu cầu `ArLedger.find(match)` trong debt detail runtime.
- Test mới assert `debtReport` và `debtCustomerDetail` không chứa `ArLedger.find(`.
- Existing Phase89 guard `no-runtime-sales-order-debt-calculation.test.js` vẫn PASS.

## 9. Test results

### Targeted tests

| Command | Result |
|---|---|
| `node --test test/order-data-lineage-static.test.js` | PASS — 7/7 |
| `node --test test/phase36d-api-response-followup-static.test.js` | PASS — 8/8 |
| `node --test test/no-runtime-sales-order-debt-calculation.test.js` | PASS — 1/1 |
| `node --test test/report-runtime-uses-ar-debt-v2.test.js` | PASS — 1/1 |
| `node --test test/frontend-mobile-sales-no-debt-calculation.test.js` | PASS — 1/1 |
| `node --test test/mobile-sales-uses-ar-debt-runtime-view.test.js` | PASS — 1/1 |
| `node --test test/mobile-sales-ledger-boundary.test.js` | PASS — 2/2 |

### Full test status

`npm test` nguyên khối timeout trong sandbox. Đã chạy toàn bộ 419 test files theo isolated + shared chunks:

| Group | Files | Result |
|---|---|---|
| Isolated files | 9 | PASS — 34 tests |
| Shared chunk 1 | 1-40 | PASS — 100 tests |
| Shared chunk 2 | 41-80 | PASS — 176 tests |
| Shared chunk 3 | 81-120 | PASS — 151 tests |
| Shared chunk 4 | 121-160 | PASS — 133 tests |
| Shared chunk 5 | 161-200 | PASS — 113 tests |
| Shared chunk 6 | 201-240 | PASS — 142 tests |
| Shared chunk 7 | 241-280 | PASS — 119 tests |
| Shared chunk 8 | 281-320 | PASS — 150 tests |
| Shared chunk 9 | 321-360 | PASS — 120 tests |
| Shared chunk 10 | 361-400 | PASS — 120 tests, 119 pass, 1 skipped |
| Shared chunk 11 | 401-410 | PASS — 20 tests |

Summary:

```text
files: 419
tests: 1378
pass: 1377
fail: 0
skipped: 1
```

## 10. Command results

| Command | Result |
|---|---|
| `npm run check:syntax` | PASS — 1160 JavaScript files |
| `npm run check:source-bundles` | PASS — 19 bundles |
| `npm run check:release-manifest` | PASS |
| `npm run docs:check` | PASS — 343 operations |
| `node scripts/audit-global-software-rules.js --strict` | PASS — 0 issue |
| `node scripts/audit-ar-access-violations.js --strict` | PASS — 0 issue |
| `node scripts/audit-inventory-access-violations.js --strict` | PASS — 0 issue |
| `node scripts/audit-fund-access-violations.js --strict` | PASS — 0 issue |
| `node scripts/audit-frontend-business-calculation.js --strict` | PASS — 0 issue |

## 11. Risks còn lại

| Risk | Mức | Ghi chú |
|---|---|---|
| `npm test` nguyên khối timeout trong sandbox | P3 | Chunked full test đã PASS. Nên chạy lại `npm test` trên máy/CI local không giới hạn timeout để chốt GO tuyệt đối. |
| Legacy emergency delivery accounting implementation vẫn tồn tại sau facade | P3 | Đã có production guard từ Phase88/89. Không sửa trong Phase89b vì phạm vi là static test realignment. |

## 12. Final Decision

**CONDITIONAL-GO**

Có thể dùng ZIP này để tiếp tục kiểm tra/deploy sau khi chạy lại `npm test` nguyên khối trên máy local/CI. Về logic sửa Phase89b, các test fail cũ đã được realign và không có fail trong chunked full test.
