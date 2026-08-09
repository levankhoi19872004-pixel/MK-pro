# R1P3A A4 — GREEN Evidence

## Mandatory RED -> GREEN

`node --test test/ar-splitbrain-r1p3a-return-amount-divergence.test.js`

- PASS: 1/1
- Delivery canonical amount: 2000
- Posting canonical amount: 1500
- Effective AR-RETURN: 1500
- `sourceFieldMismatch=true`
- issue contains `RETURN_SOURCE_AMOUNT_FIELD_MISMATCH`
- classification is not `no_mismatch`

## Return amount regression matrix

`node --test test/ar-splitbrain-r1p3a-return-amount-divergence.test.js test/ar-splitbrain-r1p3a-return-amount-matrix.test.js`

- PASS: **10/10**
- Cases A-I covered, including explicit zero, null alternative, divergence inside ±1000, AR matching Delivery only, and AR matching posting only.

## R1.3 return lifecycle preservation

R1.3 RED/lifecycle tests + R1.3a tests: **11/11 PASS**.

## Full split-brain family

`node --test test/ar-splitbrain*.test.js`

- **69/69 PASS**

## Broader financial/return matrix

- 180 assertions PASS.
- 2 test files BLOCKED_ENV because `mongoose` is unavailable.
- 0 assertion failures in test files that started.
