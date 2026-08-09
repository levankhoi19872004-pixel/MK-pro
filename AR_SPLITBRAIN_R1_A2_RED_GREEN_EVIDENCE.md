# AR Split-brain R1 — RED/GREEN Evidence

Generated: 2026-08-09T05:26:36.066861+00:00

## RED trước production fix

Command:

`node --test test/ar-splitbrain-r1-final-state-reconcile-receipt.red.test.js`

Result: **FAIL as expected**.

- canonical AR before correction = 6.000.000
- correction delta = -2.000.000
- expected event-delta AR after = 4.000.000
- actual A final-state reconcile = **8.000.000**
- assertion: expected 4.000.000, actual 8.000.000

Evidence log: `/mnt/data/R1_RED_BEFORE.log` (không đóng gói log vào release ZIP).

## GREEN core accounting

Command:

`node --test test/ar-splitbrain-r1-event-delta-posting.test.js test/ar-splitbrain-r1-correction-e2e.test.js test/ar-splitbrain-r1-category-provenance.test.js test/ar-splitbrain-historical-audit.test.js`

Result: **14/14 PASS**.

Main tests dùng **actual** `CloseoutCorrectionArEventDeltaPostingService`, **actual** `arPosting.service`, **actual** `arLedgerRead.service`; chỉ thay model persistence bằng in-memory model boundary để không phụ thuộc Mongo/Mongoose package.

Covered:

- confirmed receipt preserved;
- B0041181 raw 85 -> Debt New normalized 0;
- return-only không sinh correction AR event;
- combined payment+return chỉ post payment/reward/receivable-owned delta;
- debit correction khi giảm payment đã ghi;
- direct writer idempotent retry;
- changed payload cùng idempotency identity fail closed;
- actual AR posting failure rollback correction/version/allocation;
- provenance gate AR-ADJUSTMENT;
- historical event audit không dùng snapshot reconciliation.

## GREEN targeted regression

Final targeted command: 17 test files liên quan correction, payment/return isolation, bulk adjustment, reward parity và B004 regression.

Result: **101/101 PASS**, exit 0.

## Dependency-blocked contract tests

4 tests không load được vì `mongoose` không tồn tại trong environment. `npm ci` không thể cài dependency do internal registry trả HTTP 404 cho `zip-stream@4.1.1`. Chúng được ghi **BLOCKED_BY_ENVIRONMENT**, không đổi thành PASS/FAIL correctness.
