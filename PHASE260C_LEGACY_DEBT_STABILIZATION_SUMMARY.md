# Phase260C Legacy Debt Stabilization Summary

## Scope
Phase260C was implemented in three separated checkpoints: R1 stop-the-bleeding, R2 controlled audit/repair, and R3 projection stabilization. The AR source of truth remains arLedgers. No AR Debt V2 collection, Fund, Inventory, MongoDB schema, package dependency, or cutover change was introduced.

## R1
Post-closeout correction debt posting now uses event delta only: receivableDelta - cashDelta - bankDelta - rewardDelta - returnDelta. A return increase cannot create a debit debt adjustment. Existing idempotency now rejects replay with a different debit/credit payload.

## R2
Read-only audit, repair-plan, and guarded dry-run/apply scripts were added under scripts/phase260c. Apply mode requires --apply, PHASE260C_REPAIR_ENABLE=YES, and --confirm-token=PHASE260C_APPLY. The local DB audit could not execute because MongoDB Atlas rejected the current IP whitelist; evidence records AUDIT_NOT_EXECUTED and no mutation was attempted.

## R3
Legacy debt readers now expose rawBalance, debtAmount, creditBalance, and displayStatus from debit-credit projection. Customer totals keep open debt and credit balance separate, preventing automatic cross-order offset. The debt-new frontend reads backend DTO fields instead of rebuilding debt math.

## B0039602 Expected Result
B0039602 projects to rawBalance -92,211, debtAmount 0, creditBalance 92,211. If customer 4501189 also has B0039125 debt 2,078,626, customer display debt remains 2,078,626 and creditBalance remains 92,211.
