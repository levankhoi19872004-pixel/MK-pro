# R1.1 Core Contract Re-audit

## Verdict
PASS — R1 event-delta financial algorithm remains valid and was not redesigned.

## Baseline
- Input: `MK-pro-closeout-ar-splitbrain-r1-event-delta-fixed(2).zip`
- SHA256: `ce88fdc0176c45333bc5bac81441febb9bac1eb6d3871b83e92a684e414a4bb6`
- Architecture: Node/Express + MongoDB/Mongoose; accounting AR ledger remains Debt New SSoT.

## Verified R1 invariants
- `deliveryCloseoutCorrection.service.js` uses `CloseoutCorrectionArEventDeltaPostingService` inside the existing transaction/session.
- Correction-owned AR delta remains `receivableDelta - cashDelta - bankDelta - rewardDelta`.
- `returnDelta` remains outside the generic correction AR event; ownership stays `returnOrders -> returnArPostingService -> AR-RETURN`.
- Runtime correction paths have 0 calls to `OrderPaymentDebtReconcileService.reconcileOrderDebt()`.
- Runtime correction paths have 0 active writers for `AR-DEBT-ADJUSTMENT`; one literal in `deliveryCloseoutCorrection.service.js` is a comment only.
- Canonical correction event remains `AR-ADJUSTMENT` + `sourceType=DELIVERY_CLOSEOUT_CORRECTION`.
- Transaction owner remains `deliveryCloseoutCorrection.createCorrection()` with the same session crossing correction/version/allocation/event post/read-after-write.

## Remaining non-correction legacy callers
- `AccountingCloseoutService.js`: 2 runtime closeout calls to `reconcileOrderDebt()`.
- `scripts/backfill-order-payment-allocations.js`: offline/backfill caller.
- `ArDebtAdjustmentPostingService.js`: retired/dead-path caller.
These were intentionally not migrated because R1.1 scope requires no expansion without separate RED evidence.
