# Phase258B - Delivery Fund Double Posting Retirement Report

## Executive summary

Phase258B retires the duplicate fund posting path from `ORDER_PAYMENT_ALLOCATION` and makes delivery remittance the only balance-affecting owner for delivery cash/bank entering fund balance.

Canonical policy after this phase:

- `orderPaymentAllocations` remain allocation/accounting and AR evidence.
- `ORDER_PAYMENT_ALLOCATION` fund ledger rows do not affect fund balance.
- Confirmed `DELIVERY_CASH_SUBMISSION` rows are the realized fund movement for delivery remittance.
- Historical `ORDER_PAYMENT_ALLOCATION` fund rows are not deleted or mutated; they are excluded by canonical read policy.

## Production pattern

The production duplicate pattern is one economic delivery remittance represented by two technical fund writers:

| Technical source | Meaning | Old balance effect | Phase258B balance effect |
| --- | --- | ---: | ---: |
| `ORDER_PAYMENT_ALLOCATION` | Closeout allocation/accounting evidence | Included | Excluded |
| `DELIVERY_CASH_SUBMISSION` | Confirmed delivery cash/bank remittance | Included | Included |

Evidence fixture:

- `ORDER_PAYMENT_ALLOCATION` cash: 33,101,000
- `DELIVERY_CASH_SUBMISSION` cash: 33,101,000
- Old raw/canonical inflow: 66,202,000
- Phase258B canonical inflow: 33,101,000

## Root cause

There were two writers for the same delivery cash/bank economic event.

Call graph A - closeout allocation:

```text
AccountingCloseoutService
  -> OrderPaymentAllocationService.postAllocation()
    -> postFundLedgersFromAllocation()
      -> fundService.postFundLedger()
        -> fundLedgers sourceType/refType/referenceType = ORDER_PAYMENT_ALLOCATION
        -> idempotencyKey = FUND:OPA:<allocationKey>:<fundType>
```

Call graph B - delivery remittance:

```text
fundService.confirmDeliveryCashSubmission()
  -> postDeliveryRemittanceLine()
    -> fundLedgerRepository.upsert()
      -> fundLedgers sourceType/referenceType/refType = DELIVERY_CASH_SUBMISSION
```

`FundBalanceReadService`, fund dashboard, and fund summary previously treated both rows as canonical fund movements, so the same cash/bank inflow was counted twice. The issue was not a MongoDB schema problem and not an AR problem; it was a writer ownership and canonical read-policy conflict.

## Production-grade fix - Phuong an A

### 1. Retire future OPA fund posting

`OrderPaymentAllocationService.postAllocation()` no longer posts `FundLedger` rows. It still creates `OrderPaymentAllocation` and AR ledgers, then returns:

- `fundLedgers: []`
- `fundPostingPolicy: 'deferred_to_delivery_remittance'`
- `fundPostingDeferred: true` when cash/bank amount exists

`postFundLedgersFromAllocation()` is kept only as a compatibility export but is fail-closed by default with code `ORDER_PAYMENT_ALLOCATION_FUND_POSTING_RETIRED`. A legacy caller must explicitly pass `allowLegacyOrderPaymentAllocationFundPosting === true`.

### 2. Make delivery remittance the fund owner

Confirmed delivery remittance remains the only normal writer of delivery cash/bank fund movement through `DELIVERY_CASH_SUBMISSION`.

No `FUND:OPA:*` idempotency keys are produced by closeout context loading after this phase.

### 3. Exclude historical OPA fund rows from canonical balance

`FundLedgerBalancePolicy` defines `ORDER_PAYMENT_ALLOCATION` as non-balance across `sourceType`, `refType`, and `referenceType`.

The policy is applied to:

- `FundBalanceReadService`
- fund dashboard paths that use canonical balance filtering
- fund summary normalization and voucher pipelines
- source notes/contracts exposed to UI consumers

### 4. Retire backfill repair of missing OPA fund ledgers

`scripts/backfill-order-payment-allocations.js` no longer treats missing OPA fund ledger rows as a repair target. The old repair flag `--fix-missing-fund-ledgers` now fails closed with `ORDER_PAYMENT_ALLOCATION_FUND_POSTING_RETIRED`.

### 5. Update closeout persistence semantics

Closeout persistence now records that immediate fund posting is not required:

- `fundRequired: false`
- `fundImmediatePostingRequired: false`
- `fundPostingPolicy: 'deferred_to_delivery_remittance'`
- `fundPostingOwner: 'DELIVERY_CASH_SUBMISSION'`
- `fundSatisfied: true`
- `fundPosted: false`

This prevents closeout from failing only because no immediate fund ledger was written.

## Phase191 conflict resolution

Older closeout behavior expected allocation-time fund posting to prove fund satisfaction. Phase258B resolves that conflict by splitting responsibilities:

- Closeout proves allocation and AR evidence.
- Delivery remittance proves realized fund movement.
- Fund balance reads only realized fund movements.

This keeps AR/debt correctness intact while removing fund double counting.

## Read-only audit

Added `scripts/audit-delivery-fund-double-posting.js`.

The script is read-only and rejects `--apply`. It reports raw `ORDER_PAYMENT_ALLOCATION` fund inflow, `DELIVERY_CASH_SUBMISSION` inflow, canonical inflow, duplicate candidates, affected dates, and affected delivery staff.

Generated audit artifact:

- `PHASE258B_ORDER_PAYMENT_ALLOCATION_FUND_DUPLICATE_AUDIT.json`

## Balance policy evidence

Generated evidence artifact:

- `PHASE258B_DELIVERY_FUND_BALANCE_POLICY_EVIDENCE.json`

Evidence confirms:

- before canonical inflow counted both writers: 66,202,000
- after canonical inflow counts delivery remittance only: 33,101,000
- closeout creates allocation and AR evidence
- closeout does not create fund ledger
- remittance creates fund ledger
- fund ledger, dashboard, and summary agree on 33,101,000

## Whole-system producer audit

| Area | Result |
| --- | --- |
| `OrderPaymentAllocationService.postAllocation()` | OPA fund writer retired |
| `postFundLedgersFromAllocation()` | fail-closed compatibility export |
| `CloseoutContextLoader` | stops precomputing `FUND:OPA:*` keys |
| `AccountingCloseoutService` | defers fund posting to remittance |
| `backfill-order-payment-allocations` | missing OPA fund repair retired |
| `fundService.confirmDeliveryCashSubmission` | remains fund writer |
| `FundBalanceReadService` | excludes historical OPA fund rows |
| `FundSummaryDomain/QueryBuilder` | excludes historical OPA fund rows |
| `SourceContractRegistry/SourceNoteBuilder` | exposes canonical policy |

## Query budget

The canonical exclusion is applied through a `$nor` source-type filter on `sourceType`, `refType`, and `referenceType`. It does not introduce joins or collection fan-out. Fixture and query-builder tests cover the filter shape and the normalized result.

## Files changed

- `src/services/accounting/FundLedgerBalancePolicy.js`
- `src/services/accounting/FundBalanceReadService.js`
- `src/services/accounting/OrderPaymentAllocationService.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `src/services/accounting/closeout/CloseoutContextLoader.js`
- `src/services/fund-summary/FundSummaryDomain.js`
- `src/services/fund-summary/FundSummaryQueryBuilder.js`
- `src/services/source-contracts/SourceContractRegistry.js`
- `src/services/source-contracts/SourceNoteBuilder.js`
- `scripts/backfill-order-payment-allocations.js`
- `scripts/audit-delivery-fund-double-posting.js`
- Phase258B tests under `test/`
- Updated Phase228 canonical fund balance test expectation for OPA non-balance policy

## Intentionally not changed

- No MongoDB schema change.
- No production data update, delete, or reversal.
- No bulk reversing historical OPA fund rows.
- No package dependency change.
- No AR ledger retirement.
- No Debt New behavior change.
- No `DeliveryPaymentStateReadService` Phase258A behavior change.
- No delivery remittance fund posting retirement.

## Verification

Commands passed:

- `node --test test/phase258b-delivery-fund-double-posting-retirement.test.js test/phase258b-fund-balance-source-policy.test.js test/phase258b-order-payment-allocation-no-fund-post.test.js test/phase258b-delivery-remittance-single-fund-post.test.js test/phase258b-fund-summary-no-double-count.test.js`
- `node --test test/phase258a-fund-remittance-canonical-payment-state.test.js test/phase230-delivery-remittance-lines-accounting-date.test.js test/fund-delivery-cash-preview-static.test.js test/fund-delivery-cash-update-refresh-behavior.test.js test/phase232-fund-dashboard-canonical-correctness.test.js test/fund-summary.test.js`
- `node --test test/phase228-canonical-fund-balance-read-service.test.js`
- `npm run check:syntax`
- `npm run check:source-bundles`
- `npm run docs:check`
- `npm run test:release-governance`

## Production verification checklist

After deploy, verify:

- New closeout creates `OrderPaymentAllocation` and AR evidence but no `FUND:OPA:*` fund ledger.
- Delivery remittance confirmation creates `DELIVERY_CASH_SUBMISSION` fund ledger.
- Fund ledger dashboard, fund balance dashboard, and fund summary match on the same date/staff filter.
- Historical OPA fund rows remain present in raw data but do not affect canonical fund balance.

## Rollback note

Rollback should be code-only. Do not delete, reverse, or mutate historical `fundLedgers` rows as part of rollback. If the old OPA writer must be re-enabled for emergency compatibility, use the explicit legacy flag path and monitor for double posting risk.
