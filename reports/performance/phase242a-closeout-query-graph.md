# Phase242A Closeout Query Graph

Status: **PARTIAL_QUERY_GRAPH**  
Mode: **audit-only**  
Route: `POST /api/new/delivery-today/closeout`

## Evidence Boundary

The production baseline was provided by the Phase241 runtime evidence attached by the user: closeout averaged about `157` Mongo queries/request, with total time displayed as `38.130 ms` average and `62.310 ms` max in Vietnamese numeric format. Machine-readable artifacts normalize that display to integer milliseconds: `38130` average and `62310` max. Phase242A did not replay production closeout writes because no production-equivalent, accounting-safe fixture was available in the workspace.

Because of that, this artifact maps the static query graph and accounting safety boundaries, but does not claim exact per-stage decomposition of all `157` observed queries.

## Static Call Graph

1. `src/routes/index.js` mounts `newOperationsRoutes` at `/api/new`.
2. `src/routes/newOperationsRoutes.js` handles `POST /delivery-today/closeout`.
3. The route requires `requireAuth` and `closeoutRoles = requireRole(['admin', 'accountant'])`.
4. The route normalizes selected order ids/codes and calls `AccountingCloseoutService.confirmDeliveryAccounting`.
5. `confirmDeliveryAccounting` applies the in-flight duplicate submit guard.
6. `confirmDeliveryAccountingInternal` loads selected orders, validates scope, loads returnOrders for pending orders, and enters `CloseoutTransactionRunner.runCloseoutTransaction`.
7. `CloseoutTransactionRunner` re-reads critical SalesOrder and ReturnOrder rows inside the Mongo transaction.
8. `confirmOneOrder` builds closeout from SSoT, patches `salesOrders`, posts `orderPaymentAllocations`, posts AR/Fund ledgers, reconciles debt, and writes audit logs.
9. `CloseoutPostCommitHandler.enqueueReadModelSync` queues read-model sync after transaction commit.

## Query Groups

| Group | Stage | Model | Operation | Safety |
| --- | --- | --- | --- | --- |
| QG01 | preflightLoadOrders | `salesOrders` | `find` | selection validation |
| QG02 | preflightLoadReturnOrders | `returnOrders` | `find`, optional fallback `find` | return lifecycle/inventory guard |
| QG03 | transactionCriticalRead | `salesOrders` | `find` | fresh-read before writer |
| QG04 | transactionCriticalRead | `returnOrders` | `find`, optional fallback `find` | fresh-read before writer |
| QG05 | perOrderCloseout | `salesOrders` | `updateOne`, rare fallback `find` | writer |
| QG06 | allocationPosting | `orderPaymentAllocations` | `findOneAndUpdate` | writer |
| QG07 | allocationPosting | `arLedgers` | idempotency `find`, `findOneAndUpdate` per AR row | writer-adjacent |
| QG08 | fundPosting | `fundLedgers` | idempotency `find`, possible code lookup, upsert | writer-adjacent |
| QG09 | debtReconcile | `arLedgers` | raw/canonical reads, idempotency reads, optional post, after-read | accounting safety |
| QG10 | postCommit | `readModelSyncJobs` | `updateOne` | post-commit queue |

## Findings

- Exact per-model split of the observed `157` queries is not proven in Phase242A because no safe controlled write fixture was run.
- Static N+1 candidates exist around AR idempotency read/post per generated ledger row and fund ledger idempotency per cash/bank row.
- The apparent duplicate order/return read is classified as a fresh-read-before-write boundary, not a removable duplicate.
- Debt reconcile intentionally reads AR balance before apply, re-reads in the same session before post, checks idempotency again, and after-reads after optional post.
- Any optimization of writer-adjacent query groups needs a dedicated Phase242B accounting proof.

## Phase242A Safety

No route, business behavior, writer ordering, transaction boundary, SSoT, Mongo schema/index, frontend behavior, timeout, queue, Redis, or worker logic was changed. The new audit helper is disabled by default and is not wired into the closeout hot path in this phase.
