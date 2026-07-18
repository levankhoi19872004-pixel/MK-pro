# Phase260D R1 Business Event Identity Contract

Generated: 2026-07-17T10:11:08.579Z

## Contract

Business event identity is immutable source identity, never amount/date/customer-name matching. Phase260D accepts order identity for opening obligations, receipt/allocation/payment identity for payment reductions, return order identity for returns, correction/source identity for correction deltas, and original ledger identity for controlled reversals.

## Explicitly Excluded

- Amount equality is not a duplicate key.
- createdAt/updatedAt dates are not duplicate keys.
- customerName/customer display text is not a duplicate key.

## Missing Evidence

Rows without immutable identity are classified as `MISSING_BUSINESS_EVENT_IDENTITY` and are not automatically repaired.

## Projection Versus Repair

`PROJECTION_SHADOW` means the row is excluded only by read projection ownership; it must not be mutated. `ACTUAL_DUPLICATE_FINANCIAL_EFFECT` means multiple active ledgers claim the same immutable business event and require manual review plus guarded append-only reversal if approved.
