# R1.4a Operator Runbook — B0041181

## Critical rule
**DO NOT APPLY the old R1.4 REAL plan with hash `41db128858fc09f17cce83416eac547aa0bea9f0c12dc24efd3145f83501f6a7`.** Its v3 predecessor metadata is stale (`fromVersion=1` instead of actual v2).

R1.4a must generate a new plan from the live immutable DB evidence.

## 1. READ-ONLY audit
```bat
node scripts/audit-historical-missing-correction-events.js --order-code B0041181 --json
```
Expected evidence if DB has not changed: v2 missing delta -23,800,085; v3 missing delta +85; v4 NO_EFFECT.

## 2. Generate NEW real plan
```bat
node scripts/plan-historical-correction-repair.js --order-code B0041181 --output .\AR_SPLITBRAIN_R1P4A_B0041181_REAL_REPAIR_PLAN.json
```
Review that v2 is `fromVersion=1,toVersion=2` and v3 is `fromVersion=2,toVersion=3`; sequence AR should be 23,800,085 -> 0 -> 85.

## 3. READ-ONLY DB revalidation (no --apply)
```bat
node scripts/apply-historical-correction-repair.js --plan .\AR_SPLITBRAIN_R1P4A_B0041181_REAL_REPAIR_PLAN.json --order-code B0041181
```
This command must re-read DB evidence. Required safe result before any future decision:
- `mutation=false`
- `planHashValid=true`
- `dbRevalidated=true`
- `lineageRevalidated=true`
- `eventMissingRevalidated=true`
- `safeToApply=true`
- both items `REVALIDATED_SAFE_TO_APPLY`

If any of those are false, STOP.

## Offline hash-only check
```bat
node scripts/apply-historical-correction-repair.js --plan .\PLAN.json --offline-verify
```
This intentionally returns `safeToApply=false`; it is never apply approval.

## Future guarded apply template — DO NOT RUN until reviewed
```bat
node scripts/apply-historical-correction-repair.js ^
  --plan .\AR_SPLITBRAIN_R1P4A_B0041181_REAL_REPAIR_PLAN.json ^
  --order-code B0041181 ^
  --plan-hash <NEW_REVIEWED_PLAN_HASH> ^
  --actor <OPERATOR_ID> ^
  --apply
```
R1.4a was built/tested without executing this production apply.
