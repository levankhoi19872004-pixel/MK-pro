# A3 — Historical Reconstruction Implementation

Added read-only `HistoricalCorrectionTimelineService`.

For every correction transition it emits order/customer/correction identity, from/to version, previous and corrected financial state, receivable/cash/bank/reward component deltas, observed return delta, correction-owned debt delta, canonical event identity, evidence references/hash and a classification.

Safety behavior:
- `RECONSTRUCTED`: deterministic non-zero correction-owned transition.
- `NO_EFFECT`: exact zero correction-owned delta.
- `RETURN_OWNED_EXTERNALLY`: only return changes; no generic correction AR repair.
- `AMBIGUOUS_TIMELINE`: predecessor/current transition cannot be proven.
- `DATA_CONFLICT`: immutable correction/version evidence disagrees.

The service never reads current AR to derive event amount and never writes DB.
