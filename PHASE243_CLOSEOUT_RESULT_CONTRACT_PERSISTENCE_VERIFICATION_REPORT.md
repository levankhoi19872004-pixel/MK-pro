# PHASE243 Closeout Result Contract And Persistence Verification Report

## Scope

Phase243 fixes the false-success path in Delivery Today closeout where the UI could show an order as closed although backend did not persist accounting confirmation or AR ledgers.

Affected flow:
- UI: `public/js/app/new/91-delivery-today-new.js`
- API route: `POST /api/new/delivery-today/closeout`
- Backend command: `AccountingCloseoutService.confirmDeliveryAccounting`
- Canonical closeout finalizer: `CloseoutFinalizer`
- Delivery Today list contract: `deliveryTodayNew.service`

## Root Cause

The production symptom was: frontend showed "closed" after closeout, but MongoDB did not contain the expected `arLedgers`; after reload, the order returned to "not closed".

Root causes:
- `confirmOneOrder` could return a skipped result such as `delivery_not_completed` without running closeout writers.
- `CloseoutFinalizer` classified `confirmed=0, skipped>0` as `idempotent` with `ok=true`.
- `newOperationsRoutes` wrapped most service results as `ok=true`.
- `patchCloseoutRowsFromResult` used `submittedRows` as fallback evidence when per-order backend results were absent.
- Frontend closeout eligibility had a final `return true`, while backend eligibility was stricter.

## Production-Grade Fix

Backend result contract is now explicit per order:
- `outcome: confirmed`
- `outcome: already_confirmed`
- `outcome: rejected`
- `outcome: failed`

Each row carries:
- `reasonCode`
- `accountingConfirmed`
- `persistence`

All rejected orders now produce:
- `ok=false`
- `status=rejected`
- `httpStatus=409`
- `code=DELIVERY_CLOSEOUT_REJECTED`

No confirmed order is counted unless backend returns `outcome=confirmed`.

Already-confirmed orders are counted separately as `alreadyConfirmedOrders` and only become `idempotent` when every selected order is already confirmed.

## Persistence Verification

Successful rows now include persistence evidence from the writer path:
- `salesOrderUpdated`
- `allocationWritten`
- `arPosted`
- `fundPosted`
- `verifiedFromWriterResult`

If the sales order patch succeeds but payment allocation is missing, the command throws `PERSISTENCE_VERIFICATION_FAILED`.

No extra Mongo query was added for the hot path; the verification is based on writer results already returned inside the transaction flow.

## Frontend Contract Fix

The frontend only patches rows as closed when backend returns a per-order result with:
- `outcome === 'confirmed'` or `outcome === 'already_confirmed'`
- `accountingConfirmed === true`

Removed unsafe evidence:
- `submittedRows` is no longer used as success fallback.

After a successful closeout response, the UI reloads the canonical backend list with `load({ silent: true })`.

## Eligibility Alignment

Created shared helper:
- `src/services/accounting/closeout/CloseoutEligibility.js`

Used by:
- backend closeout command
- Delivery Today list summarizer

Eligibility now rejects:
- inactive/cancelled/deleted orders
- already accounting-confirmed orders
- orders whose delivery status is not one of `delivered`, `success`, `completed`, `done`

Delivery Today rows now expose:
- `closeoutEligibility`
- `closeoutEligibilityCode`

## Files Changed

- `src/services/accounting/closeout/CloseoutEligibility.js`
- `src/services/accounting/closeout/CloseoutFinalizer.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `src/routes/newOperationsRoutes.js`
- `src/services/v2/deliveryTodayNew.service.js`
- `public/js/app/new/91-delivery-today-new.js`
- `test/phase243-closeout-result-contract.test.js`
- `test/action-request-budget-static.test.js`
- `test/delivery-today-new-view-selection-closeout-eligibility.test.js`
- `test/popup-modal-message-scope-static.test.js`

## Test Evidence

Commands run:

```bash
node --test test/phase243-closeout-result-contract.test.js
node --test test/action-request-budget-static.test.js test/delivery-today-new-view-selection-closeout-eligibility.test.js test/phase242c-closeout-canonical-context-cutover.test.js
node --test test/popup-modal-message-scope-static.test.js
npm test
```

Result:
- All targeted Phase243 tests passed.
- Full repository test suite passed.

## Risk Assessment

Low-to-medium risk.

Intentional behavior changes:
- A selected order that backend rejects no longer appears closed in the UI.
- All rejected closeout attempts now return non-success API responses.
- Frontend reloads canonical backend state after closeout.
- Rows without backend eligibility evidence are not closeout-eligible by default.

Operational risk:
- Some orders previously selectable because of frontend fallback may now be disabled until their delivery status is canonical completed.

## Production Verification Targets

For order `B0039299` or any equivalent failing case:
- If delivery is not completed, closeout API must return `ok=false`, `status=rejected`, `reasonCode=DELIVERY_NOT_COMPLETED`.
- UI must not show "closed".
- Reload must keep the row not closed.
- No `arLedgers` should be expected for rejected orders.

For a valid completed order:
- API must return a row with `outcome=confirmed`, `accountingConfirmed=true`.
- Mongo sales order must be accounting-confirmed.
- AR/fund ledger persistence must match the closeout allocation.
- Reload must keep the row closed.
