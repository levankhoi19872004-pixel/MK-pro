# AR-RETURN deliveryAccountingCore service redirect report

## Scope

Prompt 2 removes PHASE52 ensure/repair/fallback AR-RETURN writers from `deliveryAccountingCore` and routes confirmed ReturnOrder AR posting through `src/services/accounting/returnArPostingService.js` only.

## Old PHASE52 risk points removed

| Function / area | Old behavior | Wrote or repaired AR? | Amount source risk | Action |
|---|---|---:|---|---|
| `hasPostedArReturn` | Looked up active AR-RETURN ledgers inside delivery accounting core | No direct write | Could make core decide accounting idempotency outside service | Removed |
| `fallbackReturnAmountFromAccountingOrder` | Selected return amount from SalesOrder/MasterOrder fields | No direct write alone | Could choose `salesOrder.returnAmount` instead of ReturnOrder source-of-truth | Removed |
| `ensureArReturnForConfirmedReturnOrder` | Enriched a ReturnOrder and called posting wrapper from core | Yes, indirectly | Core injected/normalized amount and debt fields | Removed |
| `ensureArReturnsForAccountingOrder` | Loaded ReturnOrders and ensured AR for each order | Yes, indirectly | Could run as hidden repair during accounting confirmation | Removed |
| `repairMissingArReturnIfNeeded` | Repaired missing AR-RETURN on already-confirmed accounting flow | Yes, indirectly | Could create AR from fallback fields when source ReturnOrder was absent | Removed |
| `postDeliveryCollectionsAfterAccountingConfirmed` old branch | Called `postingEngine.postReturnOrderAR` from core | Yes | Used core-side `amount/debtReduction` selection | Redirected to `returnArPostingService.postReturnOrderToAR` |
| `deliveryAccountingCommand` already-confirmed branch | Called `repairMissingArReturnIfNeeded` | Yes, indirectly | Hidden hotfix path | Removed; now logs skip only |

## New behavior

- `deliveryAccountingCore` may confirm delivery/accounting state and mark ReturnOrders confirmed.
- It may call `returnArPostingService.postReturnOrderToAR` only when real ReturnOrder rows exist.
- It does not build AR-RETURN ledger payloads directly.
- It does not call `ArLedger.create()` for AR-RETURN.
- It does not call `postingEngine.postReturnOrderAR()` for AR-RETURN.
- It does not synthesize AR-RETURN from `salesOrder.returnAmount` when ReturnOrder is missing.
- Missing ReturnOrder source cases are emitted as warning/debug and surfaced by `scripts/reconcile-return-ar.js`.

## Reconcile additions

`scripts/reconcile-return-ar.js` now reports:

- `salesOrderReturnAmountWithoutReturnOrder`
- `arReturnNotFromReturnOrder`
- `returnOrderAmountFieldMismatch`
- `arReturnAmountDifferentFromReturnOrderFields`

Existing checks remain for missing AR, duplicates, orphan AR, invalid ReturnOrder with AR, amount mismatch, customer mismatch, and idempotency audit.

## Validation

Commands run:

```bash
node scripts/check-js-syntax.js
```

Result:

```text
SYNTAX_OK 1016 JavaScript files
```

```bash
node --test \
  test/prompt2-delivery-accounting-ar-return-writer-static.test.js \
  test/prompt2-delivery-accounting-ar-return-service-call.test.js \
  test/phase52-ar-return-ensure-static.test.js \
  test/ar-return-debt-scoped-static.test.js \
  test/ar-return-accounting-lineage-static.test.js \
  test/ar-return-reaccounting-idempotency-static.test.js \
  test/ar-return-idempotency-service.test.js \
  test/ar-return-idempotency-audit.test.js \
  test/ar-return-idempotency-db-guard-static.test.js
```

Result:

```text
tests 24
pass 24
fail 0
```

Note: `npm run check:source-bundles` was attempted but the sandbox lacks the optional `terser` package, so that bundle check could not run here. This is an environment dependency issue, not a JavaScript syntax/test failure.

## Final assertion

`deliveryAccountingCore` is no longer a direct writer or fallback writer of AR-RETURN. AR-RETURN writes are centralized through `returnArPostingService`.
