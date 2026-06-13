# PHASE 29 — Mobile customer monthly sales fix

## Root cause

The sales app renders `monthRevenue/monthSales`, but the active modular endpoint
`GET /api/mobile/customers -> /api/mobile/catalog/customers` returned raw customer documents.
The `customers` collection does not persist monthly revenue, so every card fell back to `0`.
The older legacy route had metric enrichment but is not mounted in the production mobile namespace.

## Changes

- Added `src/services/customerMonthlySales.service.js` as the single read service for customer monthly sales.
- Enriched the modular mobile customer catalog response with:
  - `monthRevenue`
  - `monthSales`
  - `customerMonthRevenue`
  - `monthOrderCount`
  - `salesMonth`
- Monthly revenue uses the actual after-promotion order total when available.
- Supports both `YYYY-MM-DD` and Vietnamese `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY` dates.
- Excludes cancelled, voided, reversed, duplicate-cancelled and deleted orders.
- Added unit and static integration tests.

## Scope

Only the mobile customer catalog read path and a new isolated metric service were changed.
No order write, inventory, AR ledger, fund ledger, import or delivery logic was modified.
