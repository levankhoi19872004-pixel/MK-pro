# AR Split-brain R1.4 — A0 Baseline

- Input: `MK-pro-closeout-ar-splitbrain-r1p3a-micro-hardening-fixed(2).zip`
- SHA256: `46de34202187671eb3dea8adce071a5f7ccbb5f893f5e48ab5bc56d1cd68e813`
- Baseline files: 2,492
- Baseline JavaScript files: 1,718
- Workspace created from a clean extraction.
- No production DB credential was requested or used.
- No production mutation was executed.
- R1.3a runtime financial core started unchanged.

## Baseline source-size debt
The input baseline already fails the same seven source-size budget files later seen in R1.4. This is pre-existing release debt, not an R1.4 regression.

## Package commands
- `npm test` → `node scripts/run-tests.js`
- `npm run check:syntax`
- `npm run check:source-size`
- `npm run check:source-bundles`

## Scope
R1.4 adds a separate forensic repair path. The normal post-closeout correction endpoint remains event-delta and does not auto-repair historical AR.
