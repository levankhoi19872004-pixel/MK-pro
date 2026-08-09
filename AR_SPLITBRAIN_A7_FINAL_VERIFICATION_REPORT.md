# AR_SPLITBRAIN_A7_FINAL_VERIFICATION_REPORT

## 1. Kết luận
**PARTIAL — core fix correctness PASS, release-wide verification BLOCKED bởi môi trường dependency.**

Không tuyên bố READY vì `npm ci` không cài được dependency từ registry nội bộ, khiến full suite có nhiều module-load failure. Tuy nhiên các gate correctness trực tiếp của lỗi B0041181 và regressions liên quan đã executable PASS.

## 2. Root cause đã chứng minh
Correction write-path dùng retired AR facade. Facade return `AR_DEBT_ADJUSTMENT_POSTING_RETIRED` trước nhánh reconcile, nên closeout version/allocation commit nhưng AR canonical không đổi.

## 3. Before / After
BEFORE:
`correction -> version -> allocation -> retired postAdjustment(no-op) -> commit`

AFTER:
`correction -> version -> allocation -> canonical reconcile -> read-after-write invariant -> commit`

Error ở reconcile hoặc invariant => rollback transaction.

## 4. Production source sửa
Chỉ:
- `src/services/deliveryCloseoutCorrection.service.js`
  - before SHA256 `18f77aa78e5bbe269bd64260ce9e040d316fa9e65411b2d56367eb6c98fb57a7`
  - after SHA256 `3b8f0e34b4ce6841ac68e7e6b31010c45a3103db25e34eb3dbed1dc759ff2138`

## 5. RED -> GREEN
- BEFORE fix: B0041181 test exit 1, actual AR `23,800,085`, expected `0`.
- AFTER fix: cùng scenario GREEN.
- Final targeted aggregate: **90 PASS / 0 FAIL**.
- Syntax: **1700 JS files PASS**.

## 6. Transaction / idempotency
PASS bằng executable harness:
- retry cùng business event không duplicate effect;
- reconcile throw rollback correction/version/allocation;
- post-write AR mismatch rollback;
- cùng test session được truyền xuyên reconcile/readback.

## 7. Retired service caller audit
Sau fix không còn production caller tới retired `ArDebtAdjustmentPostingService` ngoài chính module định nghĩa. Dead reconcile branch trong retired module được ghi nhận nhưng không xóa để tránh mở scope legacy governance.

## 8. Historical dry-run
Script:
`scripts/audit-closeout-ar-splitbrain.js`

Default là read-only/dry-run; không parse `--apply` hay `--fix` thành mutation mode.
Fixture B0041181 được phát hiện:
- expectedDebt: 0
- rawDebt: 85
- arDebt: 23,800,085
- deviation: 23,800,085
- proposedAction: `REVIEW_CANONICAL_RECONCILE_REPAIR_PLAN`

Không kết nối/modify production DB.

## 9. Regression / environment limitations
`npm ci --ignore-scripts --no-audit --no-fund` BLOCKED:
registry nội bộ trả 404 cho `zip-stream@4.1.1`.

Do đó:
- dependency-based integration tests cần Mongoose/Express/etc không thể chạy;
- full `node scripts/run-tests.js` exit 1 và không được coi là release PASS.

Ba failures được chạy trên cả baseline và working tree, đều fail giống nhau:
- `test/delivery-today-closeout-idempotent-fast-skip.test.js`
- `test/debt-new-manual-debt-ui-static.test.js`
- `test/delivery-today-new-view-selection-closeout-eligibility.test.js`

Không sửa chúng vì ngoài scope và không phát sinh từ patch.

## 10. Accounting semantic finding
Canonical `OrderPaymentDebtReconcileService` hiện vẫn post category `AR-DEBT-ADJUSTMENT`, dù retired facade đã vô hiệu và một số read-model code gắn nhãn category này là legacy. Patch không thay ledger semantics vì source không chứng minh alternate canonical event contract. Nếu yêu cầu kiến trúc là **tuyệt đối không sinh category AR-DEBT-ADJUSTMENT**, cần phase riêng để migrate contract + read model + historical data safely.

## 11. Production data
`production_data_modified=false`.
