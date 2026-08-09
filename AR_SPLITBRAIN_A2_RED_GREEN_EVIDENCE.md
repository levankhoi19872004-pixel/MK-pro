# AR_SPLITBRAIN_A2_RED_GREEN_EVIDENCE

## RED trước production fix
Command:
```bash
node --test test/ar-splitbrain-b0041181-regression.test.js
```

Kết quả BEFORE fix:
- exit code: **1**
- pass: 0
- fail: 1
- assertion:
  - expected canonical AR: `0`
  - actual canonical AR: `23,800,085`
  - message: `BEFORE fix this must fail: canonical AR remains 23,800,085`

Đây là executable service-flow harness, không phải static source inspection. Harness đi qua `deliveryCloseoutCorrection.service.createCorrection()` với transaction/session stub và các repository/model boundary stub có state để kiểm tra commit/rollback.

## GREEN sau production fix
Cùng command, cùng fixture:
- exit code: **0**
- initial GREEN run: 1/1 PASS.
- final regression version của file có 4 executable subtests:
  1. B0041181 reconcile AR 23,800,085 -> 0.
  2. retry cùng business event không duplicate canonical reconcile effect.
  3. AR reconcile throw rollback correction/version/allocation.
  4. read-after-write AR mismatch chặn success và rollback.

## Final targeted aggregate
Result: **90 PASS / 0 FAIL**, exit 0.

## Financial matrix
- cash-only: PASS
- reward-only: PASS
- bank-only: PASS
- return amount: PASS
- cash + reward B0041181: PASS
- raw debt 0: PASS
- raw debt ±1/±999/±1000: normalized 0
- raw debt ±1001: outside tolerance
- null/undefined/NaN guard: PASS
- negative payment guard: covered by existing Phase106/A2 regression
- explicit zero authoritative: PASS via existing allocation tests
- reward double-count regressions: PASS
