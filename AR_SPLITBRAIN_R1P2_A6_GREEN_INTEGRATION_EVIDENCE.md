# R1.2 GREEN Integration Evidence

Core correctness suite command covered R1/R1.1/R1.2 split-brain tests plus delivery adjustment isolation, allocation zero-state, and reward double-count regressions.

Result: **118 tests PASS / 0 FAIL**.

R1.2-specific GREEN coverage includes:
- stable ledger dedupe;
- DCOC correction identity vs return identity;
- Debt New B0041181 list + suggestion zero consistency;
- zero-tolerance boundaries;
- confirmed AR-RETURN timeline classification;
- existing confirmed receipt preservation;
- retry/idempotency;
- transaction rollback/read-after-write invariant;
- payment/return ownership isolation.

A broader file-by-file targeted run found 38 PASS files, 12 BLOCKED_ENV files due missing packages, and one static FAIL that was independently reproduced unchanged on the R1.1 input baseline.
