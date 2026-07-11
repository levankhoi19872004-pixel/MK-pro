# PHASE242B Delivery Closeout Exact Query Attribution Report

## A. Executive Summary

Phase242B connects delivery closeout query attribution to runtime using the existing API Monitor Mongoose observer. No closeout query was optimized. No writer order, transaction boundary, schema, index, SSoT, route response, or frontend behavior was changed.

`PHASE242C_ALLOWED = false`

Reason: `WAITING_FOR_PRODUCTION_CLOSEOUT_EVIDENCE`

## B. Phase242A Gap Review

Before Phase242B:

- Audit module runtime connected: no.
- Stage context available: no.
- Query observer available: yes, through API Monitor.
- Exact stage attribution available: no.
- Phase242A machine-readable baseline used `38.13` and `62.31`, which under-represented the Vietnamese display values.

## C. Runtime Integration Before/After

After Phase242B:

- `src/routes/newOperationsRoutes.js` starts a closeout audit request only for `POST /api/new/delivery-today/closeout`.
- `src/observability/closeoutQueryAudit.js` stores request-scoped audit state in the existing request context.
- `src/middlewares/apiMonitor.middleware.js` emits sanitized query events to registered observers.
- `src/routes/systemRoutes.js` exposes protected read/export/clear endpoints.

## D. Canonical Query Observer Integration

Phase242B reuses API Monitor. It does not create a second Mongoose patch.

The canonical observation point remains:

- `mongoose.Query.prototype.exec`
- `mongoose.Aggregate.prototype.exec`

Phase242B adds observer registration around that existing observation point:

- `registerMongoQueryObserver`
- `registerApiMetricObserver`

Observer failure is swallowed and cannot alter query result, timing, order, or response behavior.

## E. Audit Context Architecture

The closeout audit context is attached to the existing request context. It stores:

- request ID,
- audit ID,
- route,
- release ID,
- environment,
- stage and stage path,
- order sequence,
- transaction attempt,
- bounded raw event samples,
- aggregate query counters,
- workload cardinality.

It does not store request body, raw Mongo filters, tokens, cookies, Mongo URI, customer data, or raw order codes.

## F. Stage Taxonomy

Instrumented stages include:

- `request.preflight.orders`
- `request.preflight.scopeValidation`
- `request.preflight.returnOrders`
- `request.preflight.returnGuard`
- `transaction.begin`
- `transaction.critical.orders`
- `transaction.critical.returnOrders`
- `transaction.critical.validation`
- `order.computeCloseout`
- `order.salesOrder.patch`
- `order.allocation.build`
- `order.allocation.upsert`
- `order.ar.buildRows`
- `order.ar.idempotency`
- `order.ar.post`
- `order.fund.cash.post`
- `order.fund.bank.post`
- `order.allocation.updatePostedRefs`
- `order.debt.initialBalance`
- `order.debt.initialIdempotency`
- `order.debt.safetyBalance`
- `order.debt.prePostIdempotency`
- `order.debt.adjustmentPost`
- `order.debt.afterBalance`
- `order.audit.accountingConfirm`
- `order.audit.closeoutConfirmed`
- `postCommit.readModelSync`

`fundService` is a generated bundle, so internal fund idempotency/code stages are attributed at the safe boundary `order.fund.cash.post` / `order.fund.bank.post` rather than editing generated internals.

## G. Transaction Attempt Attribution

`CloseoutTransactionRunner` wraps the Mongo transaction callback with `withTransactionAttempt`. If Mongo retries the callback, the next invocation increments:

- `transactionAttemptCount`
- `transactionRetryCount`

Query groups retain `transactionAttempt`, so retry queries are not mislabeled as duplicate reads.

## H. Query Event Schema

Captured query event shape:

- model,
- collection,
- operation,
- durationMs,
- rows,
- hasSession,
- sanitized queryShape,
- timestamp,
- stage,
- stagePath,
- orderSequence,
- orderCount,
- transactionAttempt.

## I. Aggregation And Memory Bounds

Aggregation key:

`stage + model + operation + hasSession + transactionAttempt`

History bounds:

- `CLOSEOUT_QUERY_AUDIT_HISTORY_LIMIT`, default `20`, min `1`, max `100`.
- `CLOSEOUT_QUERY_AUDIT_MAX_EVENTS`, default `300`, min `0`, max `2000`.

If raw events are truncated, aggregate totals continue and `rawEventsTruncated=true`.

## J. Privacy And Redaction

Export removes or masks:

- Authorization,
- Cookie,
- bearer token,
- Mongo URI,
- email,
- long number,
- business order-like keys such as `B...`, `SO...`, `HU...`.

Raw filters and request bodies are never stored.

## K. Admin API/RBAC

Added protected endpoints:

- `GET /api/system/closeout-query-audit`: admin, manager.
- `GET /api/system/closeout-query-audit/:auditId`: admin, manager.
- `GET /api/system/closeout-query-audit/:auditId/export`: admin, manager.
- `POST /api/system/closeout-query-audit/clear`: admin only.

No endpoint runs closeout, replays closeout, benchmarks closeout, or accepts production order codes for testing.

## L. Evidence Export

Export supports JSON and Markdown. Markdown contains:

- request workload,
- query by model,
- query by stage,
- query by operation,
- transaction attempts,
- multipliers,
- top query groups.

## M. API Monitor Cross-check

API Monitor emits the final request metric to the audit session before response JSON is sent. The audit compares:

- API Monitor `dbQueries`,
- closeout audit `totalMongoQueries`.

If they differ, status becomes `PARTIAL_ATTRIBUTION`, and export includes attribution coverage and unattributed query count.

## N. Baseline Unit Normalization

Phase242A machine-readable baseline was fixed:

- `avgTotalMs = 38130`
- `maxTotalMs = 62310`

The source display remains:

- `38.130 ms`
- `62.310 ms`

Normalization note: Vietnamese thousands separator normalized to integer milliseconds.

## O. Controlled Fixture Result

Status: `BLOCKED_NO_SAFE_CLOSEOUT_FIXTURE`

No production-equivalent, accounting-safe Mongo closeout fixture was available in the workspace. Phase242B uses mock observer tests for instrumentation correctness and does not create fake production evidence.

## P. Audit Overhead

Disabled mode:

- no closeout audit session,
- no aggregation,
- no evidence write,
- no Mongo query added.

Enabled mode:

- one in-memory aggregate update per observed query,
- bounded raw event retention,
- no request/response/Mongoose document retention,
- no Mongo writes.

No production overhead claim is made without production measurement.

## Q. Files Changed

- `.env.example`
- `.env.production.example`
- `src/config/app.config.js`
- `src/middlewares/apiMonitor.middleware.js`
- `src/observability/closeoutQueryAudit.js`
- `src/routes/newOperationsRoutes.js`
- `src/routes/systemRoutes.js`
- `src/controllers/systemController.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `src/services/accounting/OrderPaymentAllocationService.js`
- `src/services/accounting/OrderPaymentDebtReconcileService.js`
- `src/services/accounting/closeout/CloseoutCriticalReader.js`
- `src/services/accounting/closeout/CloseoutTransactionRunner.js`
- `reports/performance/phase242a-closeout-query-graph.json`
- `reports/performance/phase242a-closeout-query-graph.md`
- `PHASE242A_DELIVERY_CLOSEOUT_QUERY_GRAPH_AUDIT_REPORT.md`
- `test/phase242b-closeout-exact-query-attribution.test.js`
- `PHASE242B_CLOSEOUT_QUERY_AUDIT_PRODUCTION_RUNBOOK.md`

## R. Files Explicitly Not Changed

- Mongo schemas.
- Mongo index definitions.
- Frontend business bundles.
- Closeout route response contract.
- Fund generated bundle internals.
- Inventory, AR, Fund, Return SSoT ownership.

## S. Tests And Commands

Required gates are listed in the final handoff after execution.

## T. Known Limitations

- No production runtime closeout evidence exists in this workspace.
- No safe local Mongo fixture was available for real writer replay.
- Fund internal idempotency/code sub-steps are attributed at the safe fund post boundary.
- In-memory history resets on process restart.

## U. Production Measurement Runbook

See `PHASE242B_CLOSEOUT_QUERY_AUDIT_PRODUCTION_RUNBOOK.md`.

## V. Exact Evidence Required Before Phase242C

Before optimizing:

- collect 5 to 10 production closeout exports, or
- add a controlled fixture with high attribution coverage.

Each export must include:

- selected/pending/critical order counts,
- total query count,
- model/stage/operation summaries,
- transaction attempt count,
- API Monitor coverage,
- multipliers.

## W. Rollback Plan

Fast rollback:

1. Set `CLOSEOUT_QUERY_AUDIT_ENABLED=false`.
2. Restart/redeploy if env reload is required.

Code rollback:

1. Remove observer registrations and closeout stage wrappers.
2. Remove system audit endpoints.
3. Keep Phase242A reports if historical audit artifacts are still needed.

No data migration or index rollback is required.
