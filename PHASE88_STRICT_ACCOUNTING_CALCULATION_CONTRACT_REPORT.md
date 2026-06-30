# PHASE88_STRICT_ACCOUNTING_CALCULATION_CONTRACT_REPORT

## 1. Executive Summary

Phase88 siết lại Phase87 theo hướng **deterministic accounting calculation**: dữ liệu thiếu contract thì chặn, không fallback, không đoán ledger canonical và không suy luận `returnOrders`/tiền NVGH thành nghiệp vụ AR legacy.

Kết luận: **CONDITIONAL-GO**.

Lý do không kết luận GO tuyệt đối: trong sandbox, lệnh `npm test` nguyên khối nhiều lần không hoàn tất do timeout runtime của môi trường; tuy nhiên toàn bộ 410 file test đã được chạy theo từng chunk nhỏ và đều PASS, có 1 skipped kế thừa. Các command bắt buộc khác và audit strict đều PASS/không có P0/P1/P2.

## 2. Fallback/Heuristic Findings

| Nhóm | Vị trí/biểu hiện | Rủi ro | Xử lý Phase88 |
|---|---|---|---|
| `DeliveryCloseoutService` original amount fallback | `debtBeforeCollection || totalReceivable || totalAmount || payableAmount || amount` | Tính sai công nợ nếu đơn có field cũ/lệch | Loại bỏ, chỉ nhận `salesOrders.totalAmount` |
| Return amount fallback | `debtReduction/returnAmount/amount/totalAmount/value` | Hàng trả có thể bị tính sai hoặc tính nhầm field | Loại bỏ, chỉ nhận `returnOrders.totalReturnAmount` |
| Delivery cash fallback | `cashCollected/bankCollected/paidAmount/...` | Tiền giao hàng bị suy luận thành receipt hoặc bị cộng trùng | Chỉ nhận `deliveryCloseout.collectedAmount` hoặc payment record đúng contract |
| AR amount fallback | `ledger.credit || ledger.amount`, `ledger.debit || ledger.amount` | Ledger thiếu contract vẫn bị tính | Loại bỏ khỏi read model v2 |
| Category heuristic | legacy AR categories lẫn read model | Dễ lặp lỗi `AR-SALE-REVERSAL`, `AR-RETURN amountField` | Read model v2 chỉ dùng exact enum AR-DEBT-* |
| Legacy delivery accounting rollback | `USE_LEGACY_DELIVERY_ACCOUNTING` | Có thể quay lại sinh `AR-SALE/AR-RETURN/AR-RECEIPT` | Thêm production startup/route guard, yêu cầu `ALLOW_UNSAFE_LEGACY_AR_ROLLBACK=true` nếu emergency rollback |

## 3. Files Changed

### Runtime/source

| File | Nội dung chính |
|---|---|
| `src/services/accounting/DeliveryCloseoutService.js` | Strict source contract, không fallback nhiều field, validate `salesOrders`, `returnOrders`, payment/cash trước khi tính |
| `src/domain/ar/arLedgerValidator.js` | Strict debit/credit/amount/direction/amountField; thêm tách `isPhase87ReadModelArDebtLedger` cho v2 read model |
| `src/domain/ar/arLedgerQueryPolicy.js` | Bỏ orphan/reversal heuristic trong read model; filter bằng v2 strict eligibility |
| `src/services/accounting/arCustomerDebtReadModel.service.js` | Chỉ tính `AR-DEBT-OPEN/PAYMENT/ADJUSTMENT/VOID`; reject ledger thiếu contract |
| `src/services/accounting/ArDebtOpenPostingService.js` | Bỏ fallback customerCode từ customerId và fallback amount khi so sánh idempotency |
| `src/services/accounting/ArDebtAdjustmentPostingService.js` | Bỏ fallback customerCode từ customerId |
| `src/services/master-order/deliveryAccounting.service.js` | Guard legacy accounting rollback trong production |
| `src/domain/settlement/DeliverySettlementService.js` | Guard legacy settlement rollback, chỉ cho rollback unsafe khi explicit |
| `src/config/app.config.js` | Startup guard production chặn `USE_LEGACY_DELIVERY_ACCOUNTING=true` nếu chưa bật unsafe rollback |
| `scripts/run-tests.js` | Chia shared tests thành chunks để giảm rủi ro monolithic test process timeout |

### Tests

Đã thêm/sửa test strict theo yêu cầu, gồm:

- `strict-closeout-no-fallback-original-amount.test.js`
- `strict-returnorders-no-fallback-return-amount.test.js`
- `strict-delivery-cash-no-ar-receipt-inference.test.js`
- `strict-ar-read-model-v2-no-legacy-category.test.js`
- `strict-ar-read-model-no-amount-fallback.test.js`
- `strict-ar-category-exact-enum.test.js`
- `production-startup-blocks-legacy-delivery-accounting.test.js`
- `hoason-strict-closeout.test.js`

Và cập nhật các test legacy/static liên quan để phù hợp rule mới: legacy AR có thể còn tồn tại cho audit/migration, nhưng không được đi vào read model v2.

## 4. Strict Contract mới

### `salesOrders`

Bắt buộc:

- `id` hoặc `_id` hoặc `code`
- `customerCode`
- `totalAmount`

Không cho `deliveryCloseout` chứa field ledger:

- `debit`
- `credit`
- `direction`
- `amountField`
- `active`
- `reversed`

### `returnOrders`

Bắt buộc:

- `id` hoặc `_id` hoặc `code`
- `sourceOrderId` hoặc `salesOrderId` hoặc `sourceOrderCode`
- `totalReturnAmount`
- `status`
- nếu đã confirmed/received/posted thì phải có `inventoryPosted=true` hoặc `inventoryImpact`

Không đọc fallback từ `amount`, `debtReduction`, `returnAmount`, `totalAmount`, `value`.

### Delivery cash/payment

Chỉ nhận một trong hai nguồn rõ ràng:

1. `deliveryCloseout.collectedAmount` chuẩn.
2. Payment record có đủ `id/code/paymentId`, `amount`, `sourceType`, `status`.

Không suy luận tiền NVGH thu là `AR-RECEIPT`.

## 5. Delivery Closeout Strict Formula

Công thức duy nhất:

```text
originalAmount = salesOrders.totalAmount
returnedAmount = SUM(returnOrders.totalReturnAmount)
collectedAmount = deliveryCloseout.collectedAmount hoặc SUM(payment.amount hợp lệ)
finalDebtAmount = originalAmount - returnedAmount - collectedAmount
```

Nếu thiếu field bắt buộc: throw `CONTRACT_VALIDATION_ERROR` và chặn confirm/rebuild.

Case Hoa Sơn được khóa bằng test:

```text
487.484.570 - 549.540 - 190.000.000 = 296.935.030
```

## 6. Read Model v2 Contract

Read model công nợ v2 chỉ tính:

| Category | Effect |
|---|---|
| `AR-DEBT-OPEN` | debit |
| `AR-DEBT-PAYMENT` | credit |
| `AR-DEBT-ADJUSTMENT` | debit hoặc credit theo `direction` exact |
| `AR-DEBT-VOID` | debit hoặc credit theo contract exact |

Không tính các legacy category:

- `AR-SALE`
- `AR-SALE-REVERSAL`
- `AR-RETURN`
- `AR-RETURN-REVERSAL`
- `AR-RECEIPT`
- `AR-BONUS`
- `AR-ALLOWANCE`
- `AR-ADJUSTMENT` legacy

Ledger thiếu `debit/credit/amount/direction/amountField` đúng contract sẽ bị reject/không tính, không fallback sang `amount`.

## 7. Legacy còn giữ và lý do

| Nhóm | Lý do giữ |
|---|---|
| Builder/validator legacy AR-SALE/AR-RETURN/AR-RECEIPT | Phục vụ audit, repair, migration và test compatibility dữ liệu cũ |
| `arLedgerMigrationService` | P3 legacy compatibility, cần cho migration/dry-run |
| Một số report/mobile legacy debt calc | Audit báo P3; chưa xử lý trong phase này để tránh sửa lan |

Quy tắc: legacy được giữ cho audit/migration, không dùng làm nguồn tính read model v2.

## 8. Command Results

| Command | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 1150 JavaScript files` |
| `npm run check:source-bundles` | PASS — `[source-bundles] OK 19 bundles` |
| `npm run check:release-manifest` | PASS — `RELEASE_MANIFEST_OK 2026-06-30-01` |
| `npm run docs:check` | PASS — OpenAPI up to date, 343 operations |
| `node scripts/audit-global-software-rules.js --strict` | PASS, 0 P0/P1/P2, còn 5 P3 legacy compatibility |
| `node scripts/audit-ar-access-violations.js --strict` | PASS, 0 P0/P1/P2, còn 5 P3 legacy compatibility |
| `node scripts/audit-inventory-access-violations.js --strict` | PASS, 0 issue |
| `node scripts/audit-fund-access-violations.js --strict` | PASS, 0 issue |
| `node scripts/audit-frontend-business-calculation.js --strict` | PASS, 0 issue |
| Strict/targeted tests | PASS — 33/33 |
| Full test files chunked | PASS — 410 test files, 1 skipped inherited |
| `npm test` nguyên khối trong sandbox | Không hoàn tất do timeout môi trường; log sau lần cuối đã tới subtest 964, các lỗi trước đó đã được fix và verified bằng targeted/chunked tests |

## 9. Risks

| Risk | Mức | Ghi chú |
|---|---|---|
| Legacy data thiếu `totalAmount`/`totalReturnAmount` | P1 | Strict mode sẽ chặn thay vì tự cứu; cần migration/audit dữ liệu cũ |
| P3 legacy compatibility còn tồn tại | P3 | Cần phase riêng xử lý mobile/report legacy debt calc |
| `npm test` nguyên khối quá lâu trong sandbox | P2 vận hành test | Đã chia `scripts/run-tests.js` thành chunks, nhưng sandbox vẫn timeout; CI/Local nên chạy lại |
| Legacy rollback vẫn tồn tại | P1 nếu bật sai | Production guard đã chặn mặc định |

## 10. Backlog Migration

1. Tạo audit dữ liệu cũ thiếu `salesOrders.totalAmount`.
2. Tạo audit `returnOrders` thiếu `totalReturnAmount` hoặc thiếu inventory status.
3. Tạo dry-run mapping legacy `AR-SALE/AR-RETURN/AR-RECEIPT` sang `AR-DEBT-*`.
4. Xử lý 5 P3 legacy compatibility còn lại.
5. Tách legacy validator/repair sang namespace `legacy/audit/migration` rõ hơn.

## 11. Final Decision

**CONDITIONAL-GO**

Lý do: Contract strict và test chunked đầy đủ đã PASS, nhưng cần chạy lại `npm test` nguyên khối trên máy/CI không bị timeout để có GO tuyệt đối theo đúng checklist release nội bộ.
