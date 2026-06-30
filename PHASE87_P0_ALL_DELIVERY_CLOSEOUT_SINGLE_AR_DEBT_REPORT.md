# PHASE87 P0 ALL — Delivery Closeout Single AR Debt Report

## 1. Executive Summary

Đã kiểm tra và sửa khoanh vùng luồng công nợ delivery closeout theo 5 P0. Trọng tâm sửa lỗi thực tế: order `SO1782830072433596` đang bị mở công nợ sai theo `originalAmount - returnedAmount = 1.258.899`; sau sửa, closeout/read-model test bắt buộc trả đúng `32.999` theo công thức:

```txt
1.573.635 - 314.736 - 1.125.900 - 100.000 = 32.999
```

Kết quả chính:

- `DeliveryCloseoutService` đã tính đủ `cashAmount`, `transferAmount`, `collectedAmount`, `rewardAmount`, `bonusAmount`, `offsetAmount`.
- `finalDebtAmount` chuyển sang công thức chuẩn `original - returned - collected - offset`.
- `AR-DEBT-OPEN` lưu thêm breakdown vận hành để read model/API công nợ không phải suy từ legacy `AR-SALE`.
- Read model V2 tiếp tục chỉ lấy `AR-DEBT-*`, đồng thời expose breakdown từ `AR-DEBT-OPEN`.
- Thêm regression tests cho case `SO1782830072433596 = 32.999`.
- Không đụng import, promotion, fund ledger business rule, UI lớn, pricing, auth/role.

Final decision: **CONDITIONAL-GO**. Lý do: các test khoanh vùng và syntax đã pass, nhưng `npm test`, `check:source-bundles`, và audit script DB không thể chạy hoàn chỉnh trong sandbox do thiếu dependency `terser`/`mongoose` vì `node_modules` không có trong ZIP/runtime này.

## 2. Project overview

### Cấu trúc thư mục liên quan

- `src/services/accounting`: closeout/accounting/AR posting services.
- `src/domain/settlement`: delivery settlement facade.
- `src/services/master-order`: legacy delivery accounting/return flow, chỉ đọc/không sửa nghiệp vụ cũ.
- `src/services/arDebtReadModel.service.js`: read model công nợ.
- `src/domain/ar`: AR ledger validator/category policy.
- `test`: static/unit regression tests.
- `scripts`: audit/rebuild/reconcile scripts.

### Tech stack

- Node.js / CommonJS.
- MongoDB/Mongoose model layer.
- Native `node:test` + custom scripts.
- Monolith Express/API + service layer.

## 3. 6 vòng đọc source đã thực hiện

Ghi chú trung thực: đã rà soát theo 6 vòng checklist bằng static search/đọc file trong phiên này; không thể xác nhận đủ 120 phút đồng hồ trong môi trường tool-run.

| Vòng | Checklist | File/Module chính đã đọc | Kết luận |
|---|---|---|---|
| 1 | Tổng quan module | `src/services/accounting/*`, `src/domain/settlement/*`, `src/services/master-order/*`, `test/*` | Dự án đã có khung Phase87/88 nhưng thiếu offset/reward trong closeout final debt. |
| 2 | AR posting calls | `posting.engine.js`, `deliveryAccountingCore.impl.js`, `deliveryAccountingCommand.impl.js`, `DeliverySettlementService.js`, `AccountingCloseoutService.js` | Active path đã qua settlement/closeout; legacy còn tồn tại sau env rollback. Không sửa legacy ngoài scope. |
| 3 | Nguồn dữ liệu closeout | `DeliveryCloseoutService.js`, `deliveryTodayList.impl.js`, `deliveryCommon.impl.js`, `deliveryReconciliation.service.js` | Màn giao hàng có `cashAmount/transferAmount/rewardAmount`, nhưng closeout service chỉ trừ `collectedAmount`, chưa trừ offset. |
| 4 | Đơn giao hôm nay vs Công nợ | `deliveryTodayList.impl.js`, `arDebtReadModel.service.js`, tests liên quan | Số sai 1.258.899 là `original - returned`; thiếu `cash/transfer/reward`. |
| 5 | AR ledger schema/idempotency | `ArDebtOpenPostingService.js`, `arLedgerValidator.js`, `arDebtReadModel.service.js` | `AR-DEBT-OPEN` đã có contract cơ bản; cần thêm breakdown và versionNo. |
| 6 | Kế hoạch sửa khoanh vùng | Dịch vụ closeout, AR debt open, read model, tests, audit script | Chỉ sửa file thuộc SCOPE_LOCK bên dưới. |

## 4. Current AR posting flow findings

| File | Function/Area | Có thuộc active delivery closeout không | Hành động |
|---|---|---:|---|
| `src/domain/settlement/DeliverySettlementService.js` | `confirmAccounting` | Có | Giữ active path qua `AccountingCloseoutService`; lazy-load để test delivery cash không kéo DB. |
| `src/services/accounting/AccountingCloseoutService.js` | `confirmOneOrder` | Có | Giữ chỉ post `AR-DEBT-OPEN`; lazy-load repository/audit/transaction để unit test khoanh vùng. |
| `src/services/accounting/DeliveryCloseoutService.js` | `buildCloseout` | Có | Sửa công thức final debt, thêm cash/transfer/offset/reward. |
| `src/services/accounting/ArDebtOpenPostingService.js` | `buildDebtOpenLedger/postDebtOpen` | Có | Thêm breakdown/versionNo, adapter test injection. |
| `src/services/arDebtReadModel.service.js` | `groupCanonicalLedgers` | Có | Read model V2 expose breakdown từ `AR-DEBT-OPEN`, vẫn bỏ legacy categories. |
| `src/services/master-order/deliveryAccountingCommand.impl.js` | Legacy confirm | Không, chỉ emergency rollback | Không sửa. |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Legacy AR-SALE/AR-RETURN/AR-RECEIPT | Không, chỉ legacy | Không sửa. |
| `src/engines/posting.engine.js` | Legacy posting wrappers | Không thuộc active closeout | Không sửa. |

## 5. Root cause

Root cause trực tiếp: `DeliveryCloseoutService.buildCloseout()` trước sửa dùng:

```js
finalDebtAmount = originalAmount - returnedAmount - collectedAmount
```

Trong nhiều order, `collectedAmount` chỉ có khi đã được tổng hợp sẵn trong `deliveryCloseout`. Case thực tế có `cashAmount = 1.000.000`, `transferAmount = 125.900`, `rewardAmount = 100.000`, nhưng closeout không tự tách/tổng hợp đủ các field này. Vì vậy màn Công nợ/read model có thể vẫn dựa vào số trung gian `original - returned = 1.258.899`.

Màn “Đơn giao hôm nay” đúng vì service giao hàng/today list đã có breakdown tiền mặt/chuyển khoản/trả thưởng/hàng trả. Màn “Công nợ” sai vì backend debt/open/read model chưa được cấp final debt/breakdown chuẩn.

## 6. New architecture

- `salesOrders`: đơn bán gốc, nguồn `originalAmount` strict từ `totalAmount`.
- `returnOrders`: SSoT hàng trả/tồn kho, `returnedAmount` lấy từ `totalReturnAmount` của returnOrders hợp lệ.
- `deliveryCloseout`: snapshot vận hành, không chứa `debit/credit/direction/active/reversed`.
- `arLedgers`: chỉ mở nợ bằng `AR-DEBT-OPEN` sau accounting confirm.
- `arDebtReadModel`: order V2 chỉ tính `AR-DEBT-*`, không dùng legacy `AR-SALE/AR-RETURN/AR-RECEIPT`.

## 7. SCOPE_LOCK / Anti-Sửa-Lan Report

### SCOPE_LOCK ban đầu

| File được phép sửa | P0 | Function | Lý do |
|---|---|---|---|
| `src/services/accounting/DeliveryCloseoutService.js` | P0-2/P0-5 | `buildCloseout`, `summarizePayments`, `summarizeOffsets`, `calculateFromSources` | Sửa công thức final debt và thêm nguồn cash/transfer/offset. |
| `src/services/accounting/AccountingCloseoutService.js` | P0-3 | `confirmOneOrder`, lazy deps | Active confirm chỉ đi qua closeout/AR-DEBT-OPEN; lazy deps hỗ trợ unit test khoanh vùng. |
| `src/services/accounting/ArDebtOpenPostingService.js` | P0-3/P0-5 | `buildDebtOpenLedger`, `postDebtOpen` | AR-DEBT-OPEN cần lưu breakdown và versionNo; thêm adapter test. |
| `src/services/arDebtReadModel.service.js` | P0-4 | `groupCanonicalLedgers` | Read model V2 expose đúng breakdown và ignore legacy category. |
| `src/domain/settlement/DeliverySettlementService.js` | P0-1 | `recordCollectedMoney`, lazy deps | Delivery cash không sinh AR-RECEIPT; unit test không kéo DB. |
| `test/*closeout*`, `test/*so178283*`, `test/*idempotency*` | P0-5 | tests | Khóa regression case 32.999. |
| `scripts/audit-ar-debt-closeout-v2-consistency.js` | P0-5 | script audit | Dry-run audit V2 consistency. |
| `RELEASE_MANIFEST.json` | Release gate | generated manifest | Cập nhật do sourceSha256 thay đổi sau sửa source/test. |

### File thực tế đã sửa

| File đã sửa | Có nằm trong SCOPE_LOCK không | P0 | Ghi chú |
|---|---:|---|---|
| `src/services/accounting/DeliveryCloseoutService.js` | Có | P0-2/P0-5 | Sửa công thức và contract closeout. |
| `src/services/accounting/AccountingCloseoutService.js` | Có | P0-3 | Lazy deps, không đổi legacy flow. |
| `src/services/accounting/ArDebtOpenPostingService.js` | Có | P0-3/P0-5 | Thêm breakdown/versionNo/test adapters. |
| `src/services/arDebtReadModel.service.js` | Có | P0-4 | Expose breakdown từ AR-DEBT-OPEN. |
| `src/domain/settlement/DeliverySettlementService.js` | Có | P0-1 | Lazy deps để record cash không kéo DB/AR. |
| `scripts/audit-ar-debt-closeout-v2-consistency.js` | Có | P0-5 | Thêm audit dry-run. |
| `test/so178283-regression-final-debt-32999.test.js` | Có | P0-5 | Regression chính. |
| `test/so178283-debt-read-model-v2-final-debt.test.js` | Có | P0-4/P0-5 | Read model V2 case ảnh. |
| `test/delivery-closeout-breakdown-consistency.test.js` | Có | P0-2/P0-5 | Invariant breakdown. |
| `test/delivery-closeout-does-not-use-original-minus-return-only.test.js` | Có | P0-2/P0-5 | Chặn số 1.258.899. |
| `test/hoason-delivery-closeout-final-debt.test.js` | Có | P0-3 | Chuyển sang adapter test không kéo DB. |
| `test/single-ar-debt-open-idempotency.test.js` | Có | P0-3 | Chuyển sang adapter test không kéo DB. |
| `RELEASE_MANIFEST.json` | Có | Release gate | Generated manifest refresh. |

### File đã đọc nhưng không sửa

| File | Lý do chỉ đọc |
|---|---|
| `src/services/master-order/deliveryAccountingCommand.impl.js` | Legacy rollback path, không thuộc active closeout; không sửa lan. |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Legacy AR posting path; không sửa lan. |
| `src/engines/posting.engine.js` | Legacy posting wrappers; không sửa. |
| `src/domain/ar/arLedgerValidator.js` | Category policy đã có AR-DEBT-*; không cần sửa. |
| `src/services/master-order/deliveryTodayList.impl.js` | Màn giao hàng đã có breakdown đúng; không sửa UI/query. |

### Khu vực xác nhận không đụng tới

- Import: không sửa.
- Promotion: không sửa.
- Fund ledger business rule: không sửa.
- Inventory ngoài returnOrders liên quan trực tiếp: không sửa.
- UI lớn: không sửa.
- Auth/role: không sửa.
- Package/deploy config: không sửa.

### git diff evidence

Workspace không có `.git`, đã dùng `diff -qr` so với ZIP gốc. File khác biệt:

```txt
RELEASE_MANIFEST.json
scripts/audit-ar-debt-closeout-v2-consistency.js
src/domain/settlement/DeliverySettlementService.js
src/services/accounting/AccountingCloseoutService.js
src/services/accounting/ArDebtOpenPostingService.js
src/services/accounting/DeliveryCloseoutService.js
src/services/arDebtReadModel.service.js
test/delivery-closeout-breakdown-consistency.test.js
test/delivery-closeout-does-not-use-original-minus-return-only.test.js
test/hoason-delivery-closeout-final-debt.test.js
test/single-ar-debt-open-idempotency.test.js
test/so178283-debt-read-model-v2-final-debt.test.js
test/so178283-regression-final-debt-32999.test.js
```

### Kết luận sửa lan

**CLEAN-SCOPE**: các file sửa đều thuộc SCOPE_LOCK công nợ delivery closeout/test/audit/release manifest. Không có import/promotion/fund/UI lớn/package/deploy bị sửa.

## 8. Files changed

Xem bảng SCOPE_LOCK ở mục 7.

## 9. Services added/modified

### DeliveryCloseoutService

- Thêm `cashAmount`, `transferAmount`, `bankAmount`.
- Thêm `rewardAmount`, `bonusAmount`, `offsetAmount`.
- `finalDebtAmount = original - returned - collected - offset`.
- Thêm `overpaymentAmount`, `contractVersion: 2`, `currentVersionNo`, `sourceVersion`.
- Thêm `calculateFromSources()`.

### AccountingCloseoutService

- Giữ active path `confirmOneOrder -> DeliveryCloseoutService -> ArDebtOpenPostingService`.
- Lazy-load repository/audit/transaction để unit tests không kéo DB khi không cần.

### ArDebtOpenPostingService

- `AR-DEBT-OPEN` lưu thêm:
  - `deliveryCloseoutVersionNo`
  - `deliveryCloseoutContractVersion`
  - `cashAmount`, `transferAmount`, `bankAmount`
  - `rewardAmount`, `bonusAmount`, `offsetAmount`
- Thêm test adapters trong `_internal` để unit test idempotency không phụ thuộc DB.

### arDebtReadModel.service

- Với `AR-DEBT-OPEN`, debt order nhận breakdown:
  - `arSale = originalAmount` như alias tương thích, không phải ledger AR-SALE.
  - `paidAmount = collectedAmount`
  - `returnAmount = returnedAmount`
  - `rewardAmount/offsetAmount`
- Vẫn chỉ nhận canonical `AR-DEBT-*` trong group V2.

## 10. AR categories allowed after redesign

- `AR-DEBT-OPEN`
- `AR-DEBT-PAYMENT`
- `AR-DEBT-ADJUSTMENT`
- `AR-DEBT-VOID`

## 11. AR categories blocked from delivery

- `AR-SALE`
- `AR-SALE-REVERSAL`
- `AR-RETURN`
- `AR-RECEIPT`

## 12. ReturnOrders handling

- `returnedAmount` tiếp tục lấy strict từ `returnOrders.totalReturnAmount` của returnOrders active/hợp lệ.
- Không fallback sang `amount/debtReduction`.
- Không sinh `AR-RETURN` từ delivery closeout active path.

## 13. Delivery cash handling

- `cashAmount` và `transferAmount/bankAmount` là dữ liệu vận hành.
- `collectedAmount = cashAmount + transferAmount` khi có split amount rõ ràng.
- Không suy diễn từ legacy `cashCollected`/`receiptAmount` trong closeout strict path.
- Không sinh `AR-RECEIPT` từ `recordCollectedMoney`.

## 14. Delivery reward/offset handling

- `rewardAmount`/`bonusAmount` được tính vào `offsetAmount`.
- `offsetAmount` trừ khỏi final debt nhưng không phải tiền thật thu.
- Công thức case ảnh: `1.573.635 - 314.736 - 1.125.900 - 100.000 = 32.999`.

## 15. Idempotency design

- `AR-DEBT-OPEN` dùng `idempotencyKey = AR-DEBT-OPEN:<orderId>`.
- Nếu cùng key và cùng amount: idempotent, không insert duplicate.
- Nếu cùng key nhưng khác amount: throw conflict, yêu cầu correction flow.

## 16. Legacy cutover

- Active V2 read model vẫn filter `PHASE87_READ_MODEL_CATEGORIES`: chỉ `AR-DEBT-*`.
- Legacy services còn trong code chỉ dùng rollback env và không bị sửa lan.
- Với order V2, legacy `AR-SALE` không được dùng để tính remainingDebt; regression test đã assert nếu có `AR-SALE = 1.258.899` cạnh `AR-DEBT-OPEN = 32.999`, read model vẫn lấy `32.999`.

## 17. Regression case SO1782830072433596

Input:

```txt
originalAmount = 1.573.635
returnedAmount = 314.736
cashAmount = 1.000.000
transferAmount = 125.900
rewardAmount = 100.000
```

Expected/Actual after fix:

```txt
collectedAmount = 1.125.900
offsetAmount = 100.000
finalDebtAmount = 32.999
```

Bằng chứng test:

- `test/so178283-regression-final-debt-32999.test.js` pass.
- `test/so178283-debt-read-model-v2-final-debt.test.js` pass.
- `test/delivery-closeout-does-not-use-original-minus-return-only.test.js` pass.
- `test/delivery-closeout-breakdown-consistency.test.js` pass.

## 18. Hoa Sơn large case

Input:

```txt
originalAmount = 487.484.570
returnedAmount = 549.540
collectedAmount = 190.000.000
offsetAmount = 0
```

Expected/Actual:

```txt
finalDebtAmount = 296.935.030
AR-DEBT-OPEN debit = 296.935.030
```

Bằng chứng test:

- `test/hoason-strict-closeout.test.js` pass.
- `test/hoason-delivery-closeout-final-debt.test.js` pass.

## 19. Tests added/updated

Added:

- `test/so178283-regression-final-debt-32999.test.js`
- `test/so178283-debt-read-model-v2-final-debt.test.js`
- `test/delivery-closeout-breakdown-consistency.test.js`
- `test/delivery-closeout-does-not-use-original-minus-return-only.test.js`

Updated:

- `test/hoason-delivery-closeout-final-debt.test.js`
- `test/single-ar-debt-open-idempotency.test.js`

## 20. Audit script added

Added:

- `scripts/audit-ar-debt-closeout-v2-consistency.js`

Script is dry-run/read-only; no apply mode.

## 21. Command results

### Passed

```txt
npm run check:syntax
SYNTAX_OK 1166 JavaScript files
```

```txt
node --test test/delivery-closeout-uses-returnorders.test.js test/strict-delivery-cash-no-ar-receipt-inference.test.js test/strict-closeout-no-fallback-original-amount.test.js test/strict-returnorders-no-fallback-return-amount.test.js test/accounting-confirm-blocks-missing-returnorders.test.js test/no-ar-receipt-from-delivery-cash.test.js test/no-delivery-direct-ar-posting.test.js test/no-ar-return-from-delivery-flow.test.js test/ar-debt-read-model-v2-categories.test.js test/hoason-strict-closeout.test.js test/hoason-delivery-closeout-final-debt.test.js test/single-ar-debt-open-idempotency.test.js test/so178283-regression-final-debt-32999.test.js test/delivery-closeout-breakdown-consistency.test.js test/delivery-closeout-does-not-use-original-minus-return-only.test.js test/so178283-debt-read-model-v2-final-debt.test.js
# tests 16
# pass 16
# fail 0
```

```txt
npm run check:release-manifest
RELEASE_MANIFEST_OK 2026-06-30-01
```

```txt
npm run docs:check
OpenAPI document is up to date. Scanned operations: 343.
```

### Not completed in sandbox

```txt
npm run check:source-bundles
FAILED: Cannot find module 'terser'
```

```txt
npm test
FAILED during pretest check:source-bundles because Cannot find module 'terser'
```

```txt
node scripts/audit-ar-debt-closeout-v2-consistency.js --strict
FAILED: Cannot find module 'mongoose'
```

Nguyên nhân: ZIP sandbox không có `node_modules`; không phải lỗi syntax của source đã sửa. Cần chạy lại trên máy dự án đã `npm install`.

## 22. Risks

- `compareCloseout()` hiện strict hơn với các field V2 mới; order có `deliveryCloseout.status` cũ nhưng thiếu `cashAmount/offsetAmount` sẽ bị chặn xác nhận. Đây là đúng hướng P0 nhưng cần migration/dry-run để thống kê legacy closeout cũ.
- Audit script cần chạy ở môi trường có MongoDB/Mongoose dependency.
- Full `npm test` chưa chạy được trong sandbox vì thiếu `terser`.

## 23. Backlog Phase88/89

- Migration dry-run thống kê order có `deliveryCloseout.status` nhưng thiếu field V2.
- Correction flow hoàn chỉnh: add/reduce return sau accounting_confirmed -> `AR-DEBT-ADJUSTMENT`.
- UI label: đổi `AR SALE` thành `Phải thu gốc`/`Mở công nợ`, tránh hiểu nhầm ledger AR-SALE.
- Production audit job định kỳ cho closeout V2.

## 24. Final decision

**CONDITIONAL-GO**

Điều kiện để lên GO:

1. Chạy `npm install` hoặc dùng môi trường có `node_modules` đầy đủ.
2. Chạy lại:
   - `npm run check:source-bundles`
   - `npm test`
   - `node scripts/audit-ar-debt-closeout-v2-consistency.js --strict`
3. Nếu cả 3 pass thì có thể đổi sang **GO**.

## 25. SHA256

SHA256 sẽ được ghi sau khi tạo ZIP/report cuối cùng.

## Follow-up Hotfix — Audit DB Connect + Static Boundary Contract

### Trigger
Local validation reported:

- `node scripts/audit-ar-debt-closeout-v2-consistency.js --strict` failed with `MongooseError: Operation orders.find() buffering timed out after 10000ms`.
- `npm test` had two static boundary failures around `DeliverySettlementService` source patterns.

### Root cause

1. `scripts/audit-ar-debt-closeout-v2-consistency.js` used Mongoose models before explicitly opening the MongoDB connection, so `orders.find()` buffered until timeout.
2. `src/domain/settlement/DeliverySettlementService.js` used lazy getter functions for `AccountingCloseoutService`, `DeliveryCashInTransitReportService`, and `fundService`. Runtime logic was valid, but existing static boundary tests required direct boundary constants and direct service invocation strings.

### Scoped fix

Changed only:

- `scripts/audit-ar-debt-closeout-v2-consistency.js`
- `src/domain/settlement/DeliverySettlementService.js`

No import, promotion, fund ledger business logic, inventory business logic, or UI files were changed.

### Validation available in this sandbox

- `npm run check:syntax` → `SYNTAX_OK 1166 JavaScript files`
- `node --test test/delivery-settlement-service-boundary-static.test.js test/domain-boundary-contract.test.js` → 6 passed / 0 failed

### Required local re-run

Run on the local machine where `node_modules` and MongoDB env exist:

```bash
npm run check:source-bundles
npm test
node scripts/audit-ar-debt-closeout-v2-consistency.js --strict
```

