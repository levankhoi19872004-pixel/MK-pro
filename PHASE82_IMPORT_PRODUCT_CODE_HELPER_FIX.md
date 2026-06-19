# PHASE 82 — IMPORT PRODUCT CODE HELPER FIX

## Root cause

`getProductCodeFromRow` already exists and is exported by:

- `src/services/import/core/importValue.util.js`

However, two consumers called it without importing it:

- `src/services/import/core/importPersistence.util.js`
- `src/services/import/core/importRow.util.js`

This caused `ReferenceError: getProductCodeFromRow is not defined` during import preview, before rows could be counted.

## Fix

Both consumers now destructure `getProductCodeFromRow` from `importValue.util.js`.

A regression test invokes both affected helper paths with the `Mã hàng` alias:

- `preloadProductsByCode()`
- `getStockMapByProductCode()`

## Scope

No changes to quantity calculation, promotion rules, prices, stock posting, customer creation, import commit, database schema, or API contracts.

## Verification

- JavaScript syntax: 820/820 files passed.
- Test suite: 695/695 tests passed.
- New regression test: passed.
