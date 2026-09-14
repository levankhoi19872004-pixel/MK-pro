# Mobile Debt Query Optimization — 2026-09-13

## Production evidence

The production trace for `GET /api/mobile/debts` showed that reducing Mongo command count alone was not enough:

- total request: about 12.7s
- Mongo time: about 10.8s
- physical Mongo commands: 5
- slowest command: `ArLedger.find`, about 4.3s, 1603 rows
- response: about 199KB / 66 rows

The previous mobile override used a 7000-key alias batch. That created very large `$in` arrays across the exact-scope order alias `$or` and made a single command expensive.

## Change

The mobile endpoint now uses:

- `scopeKeyBatchSize = 1000`
- `scopeBatchConcurrency = 4`
- exact-scope AR reads do not request a Mongo sort
- sessions force concurrency back to 1
- a managed wildcard index only over debt-order alias fields (`idx_ar_debt_order_alias_wildcard`)

The global/default AR read behavior remains `scopeKeyBatchSize = 400` and concurrency `1`.

The wildcard index projection is generated from the same `DEBT_ORDER_LOOKUP_FIELDS` constant used to build the `$or` lookup, preventing index/query field drift.

## Why command-count budget was removed

Production proved that `5` commands can still take more than 12 seconds. The QA gate therefore protects query shape rather than a misleading low command count:

- no alias batch above 1000 keys
- no more than 4 exact-scope batch reads in flight
- the full 18-field compatibility lookup semantics remain unchanged
- no Mongo sort is added to exact-scope batch reads

## Deployment note

The first deployment may spend additional time in the existing `mongodb-indexes` startup step while Mongo builds `idx_ar_debt_order_alias_wildcard`. HTTP is already bound before that startup step in the current startup architecture.

After deployment, compare `API_PERF` for `/api/mobile/debts` against the previous trace. The target is to bring the endpoint below the 15-second UI timeout, ideally below 3 seconds warm.
