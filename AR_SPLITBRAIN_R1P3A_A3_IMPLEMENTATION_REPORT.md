# R1P3A A3 — Implementation Report

## Modified functional file

- `scripts/audit-closeout-ar-splitbrain.js`
  - before SHA256: `d5cf13560ca4f7e8ff01c057caaa0d217ab49777f76929834c37db71678d59f1`
  - after SHA256: `28dc8413a1814ce067bfb499e5f9314a2eb51484b2c58cf4b26b5ff046076d07`

## Runtime production files changed

**0**.

## Implementation

The historical audit now derives and carries separately:

- `deliveryCanonicalReturnAmount`: exact amount selected by the production Delivery return resolver.
- `postingCanonicalReturnAmount`: exact amount selected by `returnArPostingService.returnOrderAmountAnalysis()`.
- `effectiveArReturnAmount`: actual effective canonical AR-RETURN financial effect.
- `returnAmountSourceFields`: original source money fields for audit evidence.
- `sourceFieldMismatch`: structural flag when Delivery and posting canonical amounts diverge.

New issue handling:

- `RETURN_SOURCE_AMOUNT_FIELD_MISMATCH` — Delivery-selected and posting-selected amounts differ.
- `RETURN_AR_AMOUNT_MISMATCH` — effective AR-RETURN differs from Delivery canonical amount.
- `RETURN_AR_POSTING_AMOUNT_MISMATCH` — effective AR-RETURN differs from AR posting-selected amount.
- `RETURN_AR_ALIGNED` is emitted only when all three amounts align and no source-field mismatch exists.

Pending-return timeline restoration now uses the Delivery canonical amount because that is the amount already included in the delivery snapshot.

## Zero-tolerance isolation

Structural source mismatch is added as a blocking return issue before debt deviation normalization. Therefore a 500 difference remains `data_corruption` even though `deviationNormalized=0` under ±1000 Debt Zero Tolerance.

## Safety

- no runtime return priority changed;
- no AR writer changed;
- no ledger/history mutation;
- no automatic repair path;
- audit remains read-only / dry-run.
