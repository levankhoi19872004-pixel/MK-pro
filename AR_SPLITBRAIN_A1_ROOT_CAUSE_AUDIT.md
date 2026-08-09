# AR_SPLITBRAIN_A1_ROOT_CAUSE_AUDIT

## Kết luận
**Root cause CONFIRMED.** Post-closeout correction đã cập nhật `DeliveryCloseoutCorrection`, `DeliveryCloseoutVersion` và `OrderPaymentAllocation` trong transaction, nhưng AR canonical không được reconcile. `deliveryCloseoutCorrection.service.js` gọi facade `ArDebtAdjustmentPostingService.postAdjustment()`, trong khi facade này trả `AR_DEBT_ADJUSTMENT_POSTING_RETIRED` vô điều kiện trước nhánh reconcile phía sau. Transaction do đó vẫn commit và API vẫn có thể trả success, tạo split-brain giữa delivery financial state và AR SSoT.

## Baseline
- Input ZIP SHA256: `b83ba6e807d36f72319312f04317cf326a5eb678db8f3eddda31d2586cace6a4`
- Stack: Node.js / Express / MongoDB/Mongoose.
- Test runner: `node scripts/run-tests.js`
- Syntax gate: `node scripts/check-js-syntax.js`
- Production file baseline SHA256:
  - `src/services/deliveryCloseoutCorrection.service.js`: `18f77aa78e5bbe269bd64260ce9e040d316fa9e65411b2d56367eb6c98fb57a7`

## Call graph BEFORE fix
1. `POST /api/new/delivery-today/closeouts/:id/corrections`
   - `src/routes/newOperationsRoutes.js`
2. `DeliveryAdjustmentCommitService.commitOneAdjustment(...)`
   - `src/services/delivery/DeliveryAdjustmentCommitService.js`
3. `deliveryCloseoutCorrectionService.createCorrection(...)`
   - `src/services/deliveryCloseoutCorrection.service.js`
4. `withOptionalMongoTransaction(...)`
   - `src/utils/transaction.util.js`
5. Trong cùng session:
   - create/upsert `DeliveryCloseoutCorrection`
   - create `DeliveryCloseoutVersion`
   - upsert `OrderPaymentAllocation`
   - call `ArDebtAdjustmentPostingService.postAdjustment(...)`
6. `ArDebtAdjustmentPostingService.postAdjustment(...)`
   - trả ngay contract `AR_DEBT_ADJUSTMENT_POSTING_RETIRED`
   - code reconcile sau `return` là unreachable.
7. Transaction commit dù AR chưa thay đổi.

Bulk path `DeliveryAdjustmentBulkCommitService.commitManyAdjustments()` cũng đi qua `DeliveryAdjustmentCommitService.commitOneAdjustment()`, nên cùng bị ảnh hưởng nhưng cũng được sửa tại shared service boundary.

## Transaction ownership
`createCorrection()` gọi `withOptionalMongoTransaction(options, work)`. Nếu caller truyền `session`, transaction owner bên ngoài được giữ nguyên; nếu không, utility mở `mongoose.startSession()` và `session.withTransaction()`. Đây là boundary phù hợp để bắt buộc AR reconcile atomic với correction/version/allocation.

## Canonical AR contract thực tế
`OrderPaymentDebtReconcileService` là service canonical hiện hành:
- derive expected debt từ `OrderPaymentAllocation`;
- đọc AR balance theo order identity;
- giữ idempotency;
- re-read trước write để chống stale/concurrent reconcile;
- post ledger bằng `arPostingService.postArLedgerEntry(..., { session })`;
- read-after-write AR balance trong cùng session.

Lưu ý kỹ thuật: service canonical hiện hành vẫn có implementation ledger category `AR-DEBT-ADJUSTMENT`. Bản sửa **không revive facade retired** và không tự đổi ledger semantics; việc đổi category accounting nếu cần là một migration/contract riêng, vì yêu cầu hiện tại buộc dùng contract canonical thật của source thay vì tự đoán loại ledger.

## Debt New read path
`src/services/v2/debtNew.service.js` đọc canonical `arLedgers` qua `arLedgerReadService`. Không có thay đổi nào được thực hiện ở read model. Vì vậy fix xử lý đúng write-path thay vì che split-brain bằng một nguồn công nợ thứ hai.

## Root cause B0041181
Fixture:
- receivable: 23,800,085
- cash: 22,140,000
- bank: 0
- reward: 1,660,000
- return: 0
- raw debt: 85
- normalized debt: 0 theo tolerance ±1,000
- AR trước correction: 23,800,085

Trước fix:
- closeout/allocation phản ánh debt 0;
- canonical AR vẫn 23,800,085;
- deviation = 23,800,085.

## Security / integrity
- Không hard-code B0041181 trong production source.
- Không sửa Debt New.
- Không sửa dữ liệu production.
- Không cho client quyết định canonical AR balance.
- Authorization route giữ nguyên.
- Không phát hiện secret/credential trong changed scope bằng heuristic scan.
