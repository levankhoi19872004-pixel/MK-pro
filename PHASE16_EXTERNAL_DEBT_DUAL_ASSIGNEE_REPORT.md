# Phase 16 — External Debt Dual Assignee + Shared Pending Lock

## Business rule

- One external debt order only.
- Required assignees: one sales staff and one delivery staff.
- One original AR row: `ar_external_debt`.
- Sales and delivery apps read the same debt through `DebtReadService`.
- Pending collections are shared across both collectors.
- Accounting confirmation is the only step that posts `ar_receipt` and fund ledger rows.

## Main files

- `src/models/ExternalDebtOrder.js`
- `src/models/DebtCollectionLock.js`
- `src/services/ExternalDebtOrderService.js`
- `src/services/DebtReadService.js`
- `src/services/DebtCollectionService.js`
- `src/domain/posting/ArPostingService.js`
- `src/controllers/externalDebtOrderController.js`
- `src/routes/externalDebtOrderRoutes.js`
- `public/index.html`
- `public/js/app/07-debt-cashbook.js`

## Safety boundaries

- Staff names are resolved from `users`; frontend staff names are ignored.
- External AR writes go through `ArPostingService`.
- External debt creation is restricted to admin/accountant roles.
- Debt submission rechecks official debt and all pending allocations inside a Mongo transaction.
- Per-order lock documents serialize simultaneous sales/delivery submissions.
- Idempotency keys prevent duplicate external debts and duplicate pending collections.

## Validation executed

- `node --check`: PASS for all modified JavaScript files.
- Static regression suite: 156 PASS, 0 FAIL.
- Focused Phase 16 suite: 28 PASS, 0 FAIL.
- OpenAPI generate/check: PASS.
- Full `npm test`: 203 PASS, 9 SKIP, 12 FAIL because the supplied ZIP has no installed `mongoose` dependency.
