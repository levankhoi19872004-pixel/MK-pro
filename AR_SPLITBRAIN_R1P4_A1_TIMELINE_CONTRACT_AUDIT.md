# A1 — Historical Correction Timeline Contract Audit

## Immutable evidence available in source schema
`DeliveryCloseoutCorrection` stores previous/new cash, bank, reward, return and debt values, correction identity, original/new closeout version, timestamps and idempotency metadata. `DeliveryCloseoutVersion` stores closeout version, correction identity and previous/current financial components. These fields are sufficient to reconstruct a transition when the actual historical rows are present and internally consistent.

## Canonical event contract
The R1 correction event is `AR-ADJUSTMENT` with `sourceType=DELIVERY_CLOSEOUT_CORRECTION`. The order is carried by source/order identity; the correction is carried by ref/correction identity. The canonical idempotency identity is shaped as:

`AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:<order>:<correction>:v<version>`

## Reconstruction order
1. Prefer explicit `previous*` and `new*` values on the correction record.
2. Cross-check the immutable `DeliveryCloseoutVersion` row for the same correction/version.
3. Only use a predecessor version when lineage/version ordering proves it is the predecessor.
4. Do not infer a historical predecessor from the current embedded closeout merely because it exists.
5. Conflicting correction/version immutable values classify `DATA_CONFLICT`.
6. Missing deterministic predecessor classifies `AMBIGUOUS_TIMELINE`.

## Business-event delta
`correctionOwnedDebtDelta = receivableDelta - cashDelta - bankDelta - rewardDelta`.
Return is observed for evidence but excluded from the generic correction event because return ownership remains `returnOrders → AR-RETURN`.

Debt Zero Tolerance is never applied to the historical event amount.

## Actual B0041181 limitation
The uploaded bundle contains source and a production-shaped hypothesis but not the actual Mongo correction/version rows for B0041181. Therefore the engine can prove how to reconstruct safely, but the actual B0041181 item must remain ineligible for real apply until the read-only DB dry-run reconstructs the same transition from immutable records.
