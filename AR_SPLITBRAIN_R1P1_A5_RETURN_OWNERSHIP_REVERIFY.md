# R1.1 Return Ownership Re-verification

## Contract
- Return SSoT: `returnOrders`.
- Return AR owner: `returnArPostingService` -> `AR-RETURN`.
- Generic closeout correction event excludes `returnDelta` from `AR-ADJUSTMENT` amount.

## Evidence
Core financial matrix and R1 event-delta tests confirm:
- return-only correction does not create generic correction AR debt effect,
- payment + return correction posts only correction-owned payment/receivable delta,
- no duplicate `AR-RETURN` is introduced by R1.1,
- event writer retains `returnDeltaExcluded=true` and explicit return owner metadata.

## Verdict
PASS — return double-count count = 0 in executable R1/R1.1 fixtures.
