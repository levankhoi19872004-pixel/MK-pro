# AR SPLIT-BRAIN R1.4a — A0 Baseline and Scope Integrity

Generated: 2026-08-12T00:59:49.894489+00:00

## Input
- ZIP: `MK-pro-closeout-ar-splitbrain-r1p4-historical-repair-fixed.zip`
- SHA256: `eb1fe5c299e7c8cb68b8214a8bf0b7d6e9b242afa637810a1f8c30af4452478c`
- Extracted baseline file count: 2521
- Working Node: v22.16.0
- Working npm: 10.9.2

## Production evidence input
- Old REAL plan file SHA256: `70dbb89debb1343e68052e4797f07b50777f1a49ae86421a1ce6ce09e21dddea`
- Old internal planHash: `41db128858fc09f17cce83416eac547aa0bea9f0c12dc24efd3145f83501f6a7`
- Order: B0041181 / customer 4499499
- Old plan proposedRepairCount: 2
- Old v2: from=1, to=2, delta=-23,800,085
- Old v3: **from=1 (incorrect forensic predecessor metadata), to=3, delta=+85**

## Scope freeze
The runtime correction/event-delta/return/Debt New files listed below are byte-identical to R1.4 input:
- `src/services/accounting/CloseoutCorrectionArEventDeltaPostingService.js` — f9af35ddb553c35e21125405053d93b8600f93d12cc7b98f631ae1ca8234e0d8 — UNCHANGED
- `src/services/deliveryCloseoutCorrection.service.js` — a7fad5c31b92ac715009c2a3687e878eec130e3639a3f6f913ee4a429e3e3a30 — UNCHANGED
- `src/services/v2/debtNew.service.js` — 265697fda0596f2e9a8281b17a8a01b2c80416e440b006c30db53d72a69bc0bb — UNCHANGED
- `src/domain/ar/debtBusinessEventIdentity.js` — 5e1d2cc57e90ac0d6b7efe25815567cfd440bb4a4a4097564e1a48c55abbbb6a — UNCHANGED
- `src/services/accounting/returnArPostingService.js` — 0f0e8e8f17453c736f47f76c4d9ec07ac84f850477cb6e84aeecb9876595be0a — UNCHANGED
- `src/services/delivery/DeliveryAdjustmentCommitService.js` — 2601d727b14856872af9a14216947da5b10343133cd262fa4e6092bd467606ea — UNCHANGED
- `src/services/delivery/DeliveryAdjustmentBatchContextService.js` — ab29d9a5bae676ecfadcec33727fa699221fa6aeee3eec813b969f2dfc7d1eb5 — UNCHANGED

No production DB write was executed in this task. No `--apply` command was run against production.
