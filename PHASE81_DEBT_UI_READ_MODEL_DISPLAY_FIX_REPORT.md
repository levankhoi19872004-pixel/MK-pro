# PHASE81 Debt UI Read Model Display Fix Report

## Problem

After Phase81 legacy AR normalization and read-model rebuild, backend reconcile passed:

- canonical arLedgers -> arDebtOrders/arDebtCustomers: OK
- arDebtOrders: 699
- arDebtCustomers: 435

However, the debt screen still displayed customers under `Khách còn nợ` with amount `0`, and selecting a customer showed `Khách này không còn đơn nợ`.

## Root cause

The canonical read model stores debt amounts as:

- `remainingDebt`
- `rawDebt`

But the legacy debt UI was still rendering and filtering several places from `d.debt` / `o.debt` only:

- customer card amount
- selected customer detail amount
- payable-order filter
- order allocation detail
- collection customer enable/disable logic

Therefore the backend could return correct `remainingDebt`, while the UI rendered `0` because `debt` was undefined.

## Fix

### Backend compatibility aliases

Updated `src/services/arDebtReadModel.service.js` to expose stable display aliases for canonical read-model rows:

- Customer rows:
  - `debt`
  - `totalDebt`
  - `totalDebtDisplay`
  - `remainingDebtDisplay`
  - `salesmanCode/salesmanName`
  - `deliveryCode/deliveryName`

- Order rows:
  - `debt`
  - `remainingDebtDisplay`
  - `orderId`
  - `orderCode`
  - `documentDate`
  - `dueDate`
  - staff aliases

This does not change the read model source of truth. It only exposes UI-compatible aliases from canonical `remainingDebt`.

### Frontend rendering fix

Updated `public/js/app/debt/07a-debt-core.js` so the UI uses `debtAmountForStatus(row)` instead of raw `d.debt` / `o.debt` in critical rendering and allocation paths.

Fixed areas:

- customer card amount
- selected customer detail amount
- customer picker enabled state
- collection customer search match
- payable order list filter
- payable order remaining debt display
- allocation amount validation
- warnings/report fallback grouping

## Safety boundaries

No changes to:

- AR ledger validator
- AR normalization rules
- production data repair scripts
- inventory
- fund ledger
- import
- posting logic
- mobile delivery logic

No fallback to dirty ledger was added.
No debt computation from `salesOrders` was added.

## Tests

Added:

- `test/phase81-debt-ui-read-model-display-fix.test.js`

Targeted tests run:

```text
node --test test/phase81-debt-ui-read-model-display-fix.test.js test/debt-ui-status-filter-static.test.js test/debt-api-canonical-read-model.test.js test/ar-debt-api-standard.test.js
```

Result:

```text
10/10 pass
```

Syntax checked modified files:

```text
node --check src/services/arDebtReadModel.service.js
node --check public/js/app/debt/07a-debt-core.js
```

Result: OK.

## Deployment note

After deploying this ZIP, restart Render/web service and hard refresh the browser.
The existing rebuilt collections do not need to be rebuilt again solely for this UI display fix.
