# R1.4a A6 — Safety Matrix

Executable coverage includes:
- correct two-event plan => revalidation PASS;
- old R1.4 plan with v3 fromVersion=1 => hash-valid but DB revalidation FAIL;
- predecessor/version/state/evidence mismatch => stale/fail closed;
- canonical sequence mismatch / reversed order => reject;
- event appears after plan generation => abort;
- partial already-applied plan => abort;
- all already applied => idempotent no-op;
- ambiguous predecessor => `AMBIGUOUS_LINEAGE`, no plan;
- whole-plan sequence success;
- second-event failure => transaction rollback boundary;
- full retry => no duplicate effect;
- current UI no-op remains non-repairing;
- confirmed receipt and AR-RETURN contracts preserved through existing regression suite.

Core R1.4a group: **11/11 PASS**.
Full split-brain family: **100/100 PASS**.
