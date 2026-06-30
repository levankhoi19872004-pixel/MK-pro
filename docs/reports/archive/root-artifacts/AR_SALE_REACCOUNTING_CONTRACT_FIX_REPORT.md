# AR-SALE Re-accounting Contract Fix Report

## 1. Root Cause

P0 source path identified in `src/services/master-order/deliveryAccountingCore.impl.js`:

- `postDeliveryArLedgerRowsAfterReAccounting()` used `makeArBaseRow()` and inserted via `paymentRepository.upsert()`.
- `makeBatchArRow()` also allowed `type: 'ar_sale'` rows to be created without the canonical AR-SALE contract.
- The legacy base row defaulted to blank fields when `extra` did not supply them:
  - `category: ''`
  - `ledgerType: ''`
  - `entryType: ''`
  - no guaranteed `active: true`
  - no guaranteed `reversed: false`

This exactly matches the production sample for `B0038353`, where the new AR-SALE after re-accounting had empty `category`, `ledgerType`, and `entryType`.

## 2. Affected Flow

Affected path:

```text
Mở khóa kế toán / requiresReAccounting
→ reverseActiveArLedgersForOrder()
→ postDeliveryArLedgerRowsAfterReAccounting()
→ paymentRepository.upsert()
→ dirty AR-SALE normal ledger
→ arDebtReadModel excludes or misreads canonical state
```

Also hardened the batch delivery accounting path:

```text
batchPostDeliveryArLedgers()
→ makeBatchArRow(type: 'ar_sale')
→ ArPostingService.postBatch()
```

## 3. Files Changed

| File | Change | Reason |
|---|---|---|
| `src/domain/ar/arLedgerContract.js` | `buildArSaleLedger()` now accepts optional explicit `context.idempotencyKey` | Needed deterministic re-accounting keys while still using canonical builder. |
| `src/domain/ar/arLedgerValidator.js` | AR-SALE idempotency validator accepts `AR-SALE:salesOrder:<sourceId>[:ACC-*]` | Supports re-accounting batch idempotency without accepting missing contract fields. |
| `src/domain/ar/arSaleReaccountingFactory.js` | New canonical factory for delivery re-accounting AR-SALE | Keeps service file under source-size budget and centralizes canonical build + validation. |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Re-accounting and batch AR-SALE paths now use canonical factory and `assertValidArLedgerContract()` | Prevents new dirty AR-SALE rows. Reversal rows also get `reversedLedgerId`, `idempotencyKey`, `active`, `reversed`, and source identity. |
| `scripts/audit-dirty-ar-sale-contract.js` | New dry-run/report-only production audit script | Lists dirty AR rows without modifying DB. |
| `test/ar-sale-reaccounting-contract.test.js` | New regression test | Covers B0038353-style dirty AR-SALE and canonical re-accounting AR-SALE. |

## 4. Contract Before / After

### Before

```js
{
  type: 'ar_sale',
  category: '',
  ledgerType: '',
  entryType: '',
  debit: 389550,
  credit: 0,
  direction: 'debit',
  accountingConfirmed: true,
  accountingStatus: 'confirmed'
}
```

### After

```js
{
  account: 'AR',
  category: 'AR-SALE',
  ledgerType: 'AR-SALE',
  entryType: 'normal',
  type: 'ar_sale',
  sourceType: 'salesOrder',
  sourceId: 'SO178255038025639',
  sourceCode: 'B0038353',
  debit: 389550,
  credit: 0,
  amount: 389550,
  direction: 'debit',
  amountField: 'debit',
  accountingConfirmed: true,
  accountingStatus: 'confirmed',
  active: true,
  reversed: false,
  accountingBatchId: 'ACC-SO178255038025639-1782806002885',
  idempotencyKey: 'AR-SALE:salesOrder:SO178255038025639:ACC-SO178255038025639-1782806002885'
}
```

## 5. Regression Tests

Added:

```text
test/ar-sale-reaccounting-contract.test.js
```

Test coverage:

1. Canonical AR-SALE builder creates re-accounting AR-SALE accepted by debt read model.
2. Dirty B0038353-style AR-SALE with empty contract fields is rejected.
3. `postDeliveryArLedgerRowsAfterReAccounting()` no longer uses `makeArBaseRow()` for AR-SALE.
4. `makeBatchArRow(type: 'ar_sale')` uses the canonical builder and ACC-suffixed code.

## 6. Command Results

### Passed

```text
npm run check:syntax
SYNTAX_OK 1121 JavaScript files
```

```text
node --test test/ar-sale-reaccounting-contract.test.js
pass 4, fail 0
```

```text
node --test test/ar-sale-canonical-contract.test.js
pass 3, fail 0
```

```text
node --test test/ar-sale-idempotency.test.js
pass 2, fail 0
```

```text
node --test test/no-direct-ledger-write.test.js test/delivery-accounting-reconfirm-debt-scoped-static.test.js test/ar-return-reaccounting-posts-return.test.js test/ar-debt-api-standard.test.js test/debt-api-canonical-read-model.test.js test/no-legacy-ar-debt-read.test.js test/render-startup-port-binding.test.js
pass 16, fail 0, skip 1
```

```text
node scripts/check-source-size-budget.js
[source-size-budget] OK
```

```text
node scripts/audit-global-software-rules.js --strict
P0 0, P1 0, P2 0, P3 legacy 5

node scripts/audit-ar-access-violations.js --strict
P0 0, P1 0, P2 0, P3 legacy 5

node scripts/audit-inventory-access-violations.js --strict
P0 0

node scripts/audit-fund-access-violations.js --strict
P0 0

node scripts/audit-frontend-business-calculation.js --strict
P0 0
```

### Could not fully run in this sandbox

```text
npm test
```

Blocked before test execution by missing local dependency:

```text
Cannot find module 'terser'
```

Direct `node scripts/run-tests.js` also cannot be treated as full gate here because the sandbox has no installed production dependencies:

```text
Cannot find module 'mongoose'
Cannot find module 'dotenv'
```

DB scripts could not run here for the same reason and because no `MONGO_URI` is available in the sandbox:

```text
node scripts/audit-ar-ledger-contract.js --dry-run --markdown
node scripts/rebuild-ar-debt-read-model.js --dry-run --all
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --all
```

## 7. Production DB Impact

This fix prevents new dirty AR-SALE rows from the re-accounting paths. It does not repair existing production records.

Production DB still needs dry-run audit before GO:

```bash
node scripts/audit-dirty-ar-sale-contract.js
node scripts/audit-ar-ledger-contract.js --dry-run --markdown
node scripts/rebuild-ar-debt-read-model.js --dry-run --all
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --all
```

For known case `B0038353`, the existing dirty AR-SALE row should not be manually edited from the UI. Create an explicit repair plan after audit, then apply only after backup and approval.

## 8. Final Decision

**CONDITIONAL-GO for source code fix only.**

Conditions before production use:

1. Run `npm install`/Render build so `terser`, `mongoose`, `dotenv`, and all dependencies are installed.
2. Run full `npm test` in the real project environment.
3. Run DB dry-run audit against production `MONGO_URI`.
4. Confirm dirty AR-SALE count and affected orders.
5. Create/approve a separate data repair plan for existing dirty production rows.
6. Rebuild/reconcile AR debt read model after approved repair.

**NO-GO for production data until existing dirty AR ledger rows are audited and repaired/reconciled.**
