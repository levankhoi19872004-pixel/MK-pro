# R1.4a A5 — Multi-event Sequence Evidence

The two historical business events remain distinct. They are never merged into a synthetic -23,800,000 event.

| Seq | from | to | event delta | AR before | AR after |
|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 2 | -23800085 | 23800085 | 0 |
| 2 | 2 | 3 | 85 | 0 | 85 |

Net historical effect (summary only): `-23800000`.
Final raw AR: `85`.
Final Debt New normalized: `0`.

`executePlan()` wraps the complete sequence in one transaction dependency. If item 2 fails its posting/read-after-write invariant, item 1 is rolled back by the transaction boundary in the executable safety test. A full retry after success produces no duplicate financial effect.
