# R1P3A A0 — Baseline and Scope Integrity

- Input ZIP: `MK-pro-closeout-ar-splitbrain-r1p3-final-hardening-fixed.zip`
- Input SHA256: `56eaf3beb76b81d440055412af786f2d960f3f15b293db0612503f8cc38ee65d`
- Baseline files: 2478
- Baseline JavaScript files: 1716
- Package manager: npm / package-lock present
- Primary test runner: `npm test` -> `node scripts/run-tests.js`
- Syntax gate: `npm run check:syntax`
- Source-size gate: `npm run check:source-size`
- Source-bundle gate: `npm run check:source-bundles`
- Forbidden baseline files detected: 0 (`node_modules`, `.env`, credentials, DB dumps, temp logs)
- Production data modified: false

## Scope lock evidence

All locked runtime financial files remain byte-identical to the R1.3 input ZIP:

- `src/services/accounting/CloseoutCorrectionArEventDeltaPostingService.js` — `f9af35ddb553c35e21125405053d93b8600f93d12cc7b98f631ae1ca8234e0d8` — unchanged=true
- `src/services/deliveryCloseoutCorrection.service.js` — `a7fad5c31b92ac715009c2a3687e878eec130e3639a3f6f913ee4a429e3e3a30` — unchanged=true
- `src/services/v2/debtNew.service.js` — `265697fda0596f2e9a8281b17a8a01b2c80416e440b006c30db53d72a69bc0bb` — unchanged=true
- `src/domain/ar/debtBusinessEventIdentity.js` — `5e1d2cc57e90ac0d6b7efe25815567cfd440bb4a4a4097564e1a48c55abbbb6a` — unchanged=true
- `src/services/accounting/returnArPostingService.js` — `f7cb88c183b3a520d3e75273ba712d54cd0c31c3279550143467c31b85ec63f0` — unchanged=true
- `src/services/delivery/financial/deliveryReturnStateReader.js` — `99485de35bc3a229181105aa35c752dc106ed73a3ce0c52328446a4a17d2c423` — unchanged=true

The only functional implementation change in R1.3a is the read-only historical audit script. No runtime amount priority, AR writer, Debt New, correction event-delta, return writer, or transaction orchestration file was modified.
