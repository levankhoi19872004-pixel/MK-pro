# A2 — RED Production-shaped B0041181 Reproduction

The RED starts from the current reported state, not from a fresh correction:
- latest closeout already has cash 22,140,000 and reward 1,660,000;
- canonical AR still has the 23,800,085 opening/debit and no corresponding correction credit;
- current user save uses the same values, therefore current event delta is 0.

Using the actual `CloseoutCorrectionArEventDeltaPostingService`, the no-op correctly returns `ZERO_CORRECTION_OWNED_DEBT_DELTA` and leaves AR unchanged. The initial RED then failed because the historical timeline reconstruction service did not yet exist (`MODULE_NOT_FOUND`).

After implementation, the same reproduction finds the earlier v1→v2 financial transition and reconstructs exactly:
- cashDelta = +22,140,000
- rewardDelta = +1,660,000
- correctionOwnedDebtDelta = -23,800,000

The current v2→v3 no-op is separately classified `NO_EFFECT` and is never selected as repair evidence.

Evidence logs:
- `/mnt/data/AR_SPLITBRAIN_R1P4_RED_BEFORE.log`
- `/mnt/data/AR_SPLITBRAIN_R1P4_GREEN_REPRO.log`
