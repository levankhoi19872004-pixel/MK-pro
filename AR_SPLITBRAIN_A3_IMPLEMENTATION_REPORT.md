# AR_SPLITBRAIN_A3_IMPLEMENTATION_REPORT

## Phương án A đã triển khai
Chỉ sửa một production source:
`src/services/deliveryCloseoutCorrection.service.js`

SHA256:
- BEFORE: `18f77aa78e5bbe269bd64260ce9e040d316fa9e65411b2d56367eb6c98fb57a7`
- AFTER: `3b8f0e34b4ce6841ac68e7e6b31010c45a3103db25e34eb3dbed1dc759ff2138`

## Thay đổi chính
1. Thay dependency runtime từ retired `ArDebtAdjustmentPostingService` sang canonical `OrderPaymentDebtReconcileService`.
2. Sau khi upsert current `OrderPaymentAllocation`, derive expected debt server-side bằng `computeExpectedDebtFromAllocation(...)`.
3. Guard `CORRECTION_ALLOCATION_DEBT_MISMATCH` nếu allocation debt khác correction canonical debt.
4. Call `reconcileOrderDebt(...)` với **cùng `session`** và actor/source/ref metadata.
5. Re-read canonical AR bằng `getCurrentOrderArBalanceDetails(...)` trong cùng session.
6. Guard `CORRECTION_CANONICAL_AR_INVARIANT_FAILED` nếu deviation vượt tolerance.
7. Throw ở mọi mismatch/reconcile error; transaction owner rollback correction/version/allocation.
8. Giữ nguyên payment/return isolation và không thêm query vào GET Delivery Today.

## Kiến trúc AFTER fix
`route -> DeliveryAdjustmentCommitService -> createCorrection -> transaction -> correction -> version -> allocation -> canonical AR reconcile -> AR read-after-write invariant -> commit`

Nếu reconcile hoặc invariant fail:
`throw -> transaction rollback -> không trả success`.

## Idempotency
Canonical service giữ debt adjustment idempotency theo allocation/source identity và thực hiện re-read trước posting. Bản sửa truyền stable source:
- `sourceType=DELIVERY_CLOSEOUT_CORRECTION`
- `sourceId=correctionId`
- `sourceCode=correctionCode`
- `accountingBatchId=AR-DEBT-RECONCILE-<correctionId>-<version>`

Executable retry test PASS.

## Performance
Không thay GET/list path. Extra work chỉ ở correction write path:
- canonical reconcile;
- AR invariant read-after-write.
Không tạo N+1 cho Delivery Today list và không vô hiệu canary/performance instrumentation hiện có.

## Không thay đổi
- Debt New vẫn đọc AR SSoT.
- Không hard-code case B0041181.
- Không sửa production DB.
- Không revive `ArDebtAdjustmentPostingService.postAdjustment()`.
- Không sửa authorization.
