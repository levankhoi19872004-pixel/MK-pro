# A7 — B0041181 GREEN Evidence (production-shaped fixture)

Fixture immutable timeline:
1. v1/original: receivable 23,800,085; cash 0; bank 0; reward 0; return 0.
2. v2/historical correction: cash 22,140,000; reward 1,660,000; raw debt 85.
3. v3/current no-op correction: same cash/reward as v2.

Planner chooses v1→v2, not v2→v3.

Reconstructed missing event:
`0 - 22,140,000 - 0 - 1,660,000 = -23,800,000`.

Executor using actual canonical event writer on isolated persistence:
- AR before: 23,800,085
- canonical repair ledger: credit 23,800,000
- raw AR after: 85
- Debt New normalized debt: 0
- order remainingDebt: 0
- suggestion debt: 0
- retry: no additional financial effect

This proves the repair algorithm and B004 shape. It does **not** certify that the real B004 production records contain the same immutable predecessor; that must be proven by the read-only operator dry-run.
