# PHASE A1 — Delivery Adjustment Audit & RED Test

## 1. Executive summary

**Severity: P1 — Financial data integrity / command-intent leakage.**

The bug is reproducible from the real frontend calculation and the real domain validator without changing production code:

```text
Payment-only edit: cash 1,932,000 -> 0
+ unchanged return quantities
+ mismatch between list-row returnedAmount and popup line recomputation
=> frontend emits returnAdjustmentAmount = +1,931,784
=> debt delta = 0 - (-1,932,000) - 1,931,784 = +216
=> POST_CLOSEOUT_RETURN_CANNOT_INCREASE_DEBT (409)
```

The strongest confirmed root cause is not MongoDB itself. It is a contract violation across UI and backend:

1. The UI derives return mutation from two different read sources instead of user intent.
2. The UI sends return fields on every unlocked save, including payment-only saves.
3. The backend accepts `returnAdjustmentAmount` as an authoritative total.
4. The open-order path invokes a validator whose error contract is post-closeout-specific.

The exact production reason why the popup line total diverges from the list row for `B0040961` cannot be proven from source ZIP and screenshots alone. A production API payload or Mongo snapshot is needed to distinguish duplicate return rows, historical price mismatch, stale `orderPaymentAllocations`, stale closeout version, or another data-specific cause. The code defect remains valid regardless of which mismatch produced it.

---

## 2. Project overview

| Item | Audit result |
|---|---|
| Architecture | Node.js / Express monolith with browser JavaScript frontend |
| Database | MongoDB via Mongoose/flex models |
| Backend entry | `server.js` -> `src/app` |
| API route mount | `src/routes/index.js:39,55` mounts `newOperationsRoutes` at `/api/new` |
| Frontend feature loader | `public/js/app/core/desktop-feature-facades.js:22` loads `public/js/app/new/91-delivery-today-new.js` |
| Test framework | Node built-in `node:test`; project runner `node scripts/run-tests.js` |
| Node requirement | `>=20.20 <23` |
| Project size | 2,278 files; 1,559 JavaScript files; 623 `*.test.js`; ~208,176 JavaScript lines |

### Primary modules in this flow

- `public/js/app/new/91-delivery-today-new.js`
- `src/routes/newOperationsRoutes.js`
- `src/services/delivery/DeliveryAdjustmentCommitService.js`
- `src/services/deliveryCloseoutCorrection.service.js`
- `src/domain/accounting/correctionDebtDelta.js`
- `src/services/v2/deliveryTodayNew.service.js`
- `src/services/delivery/DeliveryPaymentStateReadService.js`

### Mongo collections relevant to the command

| Model | Collection | Role in this flow |
|---|---|---|
| `SalesOrder` | `orders` | Order and pre-closeout payment snapshot; updated by open-order adjustment |
| `ReturnOrder` | `returnOrders` | Canonical item-level return quantities used by popup; may be changed by return adjustment |
| `OrderPaymentAllocation` | `orderPaymentAllocations` | Preferred current payment/return/debt read source when allocation version is current |
| `DeliveryCloseoutCorrection` | `deliveryCloseoutCorrections` | Correction record and embedded audit trail |
| `DeliveryCloseoutVersion` | `deliveryCloseoutVersions` | Immutable/effective post-closeout version |
| `ArLedger` | `arLedgers` | AR adjustment posting on confirmed correction path; not written in pre-closeout branch |
| `FundLedger` | `fundLedgers` | Not directly written by `createOpenOrderAdjustment`; must remain unaffected by payment-state correction contract |
| `AuditEvent` | `auditEvents` | Domain event/audit output after successful correction |
| `AuditLog` | `audit_logs` | Generic audit collection present in project; not the direct write shown in this call chain |

---

## 3. Full call chain

### 3.1 Frontend save command

1. The popup save button binds to `submitAdjustmentPopup(row)` at `public/js/app/new/91-delivery-today-new.js:2060`.
2. `submitAdjustmentPopup()` computes totals through `totalsFromPopup(row)` at lines `2084-2090`.
3. `totalsFromPopup()`:
   - reads current return edit rows through `currentReturnEditItems()`;
   - reads list-row return total from `row.returnedAmount`;
   - recomputes return total from `newReturnQty * unitPrice`;
   - calculates `returnDelta = returnAfter - oldReturn`.
   Relevant lines: `1748-1754`.
4. Even when no return quantity changed, the unlocked branch always attaches:
   - `correctedReturnItems`
   - `returnAdjustmentItems`
   - `returnAdjustment.items`
   - `returnAdjustmentAmount`
   Relevant lines: `2138-2145`.
5. The request is sent to the endpoint produced by `correctionEndpoint(row)`:
   `POST /api/new/delivery-today/closeouts/:id/corrections`.
   Relevant lines: `1572-1574`, `2147-2151`.
6. A non-2xx response is converted to the popup error through `readJsonResponse()` and `setModalError()` at lines `2152-2156`.

### 3.2 Route and application service

1. `src/routes/newOperationsRoutes.js:230-255` accepts the POST request.
2. Route access is protected by `requireAuth` and `writeRoles`, where write roles are `admin`, `manager`, and `accountant` (`newOperationsRoutes.js:16`).
3. The route wraps the body as `passthroughInput` and adds `originalCloseoutId` from the URL (`232-239`).
4. `DeliveryAdjustmentCommitService.commitOneAdjustment()` detects `passthroughInput` and calls `deliveryCloseoutCorrectionService.createCorrection()` without rebuilding the payload (`DeliveryAdjustmentCommitService.js:355-368`).

### 3.3 Correction service branch selection

1. `createCorrection()` loads the order.
2. `isCloseoutConfirmed(order)` checks closeout/accounting statuses and historical versions (`deliveryCloseoutCorrection.service.js:94-100`).
3. For an unconfirmed order, it dispatches to `createOpenOrderAdjustment()` (`1480-1487`).

### 3.4 Open-order calculation and failure

Inside `createOpenOrderAdjustment()`:

1. Current state is read by `openOrderPaymentState(order)` (`1295-1300`).
2. Return item aliases are normalized (`1300-1302`).
3. If the client supplied `returnAdjustmentAmount`, the service prefers that explicit total over the server-computed line sum (`1303-1305`).
4. Payment final state is computed from `paymentCorrection` / corrected cash lines (`1306-1311`).
5. Delta input includes the client-derived return total (`1312-1317`).
6. The general debt amount is recomputed (`1318-1325`).
7. `assertCorrectionDebtDeltaPolicy()` is called even though this is the pre-closeout branch (`1326-1328`).
8. `src/domain/accounting/correctionDebtDelta.js:41-45` throws when `returnDelta > 0 && debtDelta > 0` with:
   - code: `POST_CLOSEOUT_RETURN_CANNOT_INCREASE_DEBT`
   - HTTP status: `409`
   - message shown in the screenshot.
9. Because the exception occurs before persistence, no correction/order/return write is executed for this failed request.

### 3.5 Writes if validation passes

For the open-order branch:

- `applyReturnOrderAdjustment()` is called with the raw client return rows (`1435-1441`).
- `deliveryCloseoutCorrections` is upserted (`1443-1447`).
- `orders` is updated with cash, bank, reward, debt, and embedded closeout state (`1449-1464`).
- The branch explicitly reports `pre_closeout_no_ledger`; it does not post an AR adjustment ledger (`1466-1476`).

For a confirmed closeout branch:

- material return items can update `returnOrders` (`1644-1652`);
- correction and version are upserted (`1654-1663`);
- `orderPaymentAllocations` is updated (`1665-1670`);
- the AR adjustment posting service is invoked (`1672-1735`);
- an audit domain event is emitted after success (`1769+`).

---

## 4. Hypothesis verification

| Hypothesis | Verdict | Evidence |
|---|---|---|
| 1. Payment-only UI save still sends return data | **Confirmed** | Unlocked branch always attaches return payload at UI lines `2138-2145`; runtime RED harness captures it |
| 2. UI computes return delta as `returnAfter - row.returnedAmount` | **Confirmed** | UI lines `1748-1754` |
| 3. Backend trusts client `returnAdjustmentAmount` | **Confirmed** | Open and confirmed branches prefer explicit input at service lines `1303-1305` and `1529-1531` |
| 4. Post-closeout-named policy runs for an unconfirmed order | **Confirmed with qualification** | Open branch calls the same policy at `1326-1328`; it only throws when the false return delta makes the condition true |
| 5. False positive return delta plus cash reduction triggers the shown error | **Confirmed** | Runtime test creates `cashDelta=-1,932,000`, `returnDelta=+1,931,784`, computes `debtDelta=+216`, then real validator throws the exact code |

### Important qualification

The source proves a **class of failure** whenever popup line recomputation differs from the list row. It does not reveal the exact production document values behind the mismatch. The production mismatch should be inspected later with captured responses from:

- `GET /api/new/delivery-today/orders`
- `GET /api/new/delivery-today/closeouts/B0040961/adjustment-return-rows`
- the actual POST body.

---

## 5. Canonical-state audit

### 5.1 List row (`GET /delivery-today/orders`)

`src/services/v2/deliveryTodayNew.service.js:638-680` uses `DeliveryPaymentStateReadService.resolvePaymentStateForOrder()`.

The payment read precedence is:

1. current `orderPaymentAllocations` record (`DeliveryPaymentStateReadService.js:239-258`);
2. latest `deliveryCloseoutVersions` record (`261-283`);
3. `orders.deliveryCloseout` or top-level order fields (`286-306`).

The displayed return total follows:

1. posted allocation `returnAmount`;
2. latest version `returnedAmount/returnAmount`;
3. sum of active `returnOrders.amount` as legacy fallback.

Relevant lines: `deliveryTodayNew.service.js:649-658`.

### 5.2 Popup return rows

`buildDeliveryAdjustmentReturnRows()` reads:

- delivered items and prices from `orders.items`;
- current quantities from active `returnOrders.items`;
- line return amount as `currentReturnQty * order-item unitPrice` for matched rows.

Relevant lines: `deliveryCloseoutCorrection.service.js:860-923`.

### 5.3 Backend pre-closeout state

`openOrderPaymentState()` reads `orders.deliveryCloseout` first, then top-level order fields for cash/bank/reward/return (`deliveryCloseoutCorrection.service.js:197-216`). It does **not** use the same `DeliveryPaymentStateReadService` precedence as the list row.

### 5.4 Canonical inconsistency conclusion

The list, popup, and write service do not share a single read contract:

| Surface | Payment/return source |
|---|---|
| List row | current OPA -> latest version -> order/legacy returns |
| Popup lines | `orders.items` + `returnOrders.items` |
| Pre-closeout backend | `orders.deliveryCloseout` -> order top-level |
| Client delta | popup line total minus list-row total |

This is the central design flaw. A read-source mismatch is incorrectly converted into a mutation command.

---

## 6. Quality, security, and performance findings

### P1 — Financial command-intent leakage

A payment-only interaction can carry return mutation fields. This violates least-authority and creates risk of cross-domain writes.

### P1 — Client-supplied financial aggregate trusted

`returnAdjustmentAmount` can override the server line sum. A manipulated or stale browser payload can influence debt validation and version data.

### P1 — Inconsistent source of truth

List row, popup, and backend calculate current state from different precedence chains. The UI then treats disagreement as user intent.

### P2 — Misleading error contract

An unconfirmed order can receive `POST_CLOSEOUT_*` error codes and wording, contradicting the popup state.

### P2 — Open-order return write breadth

The pre-closeout service passes all raw return rows to `applyReturnOrderAdjustment()`, even when no line is materially changed. The lifecycle service currently detects no quantity delta, but the command boundary remains unnecessarily broad.

### P2 — Audit/idempotency weakness in open branch

The open-order correction ID defaults to `Date.now()` plus a hash, and the upsert key is correction ID rather than a stable request key. Repeated identical requests may create separate correction records unless the caller supplies an idempotency key.

### Performance note

Sending full return rows on every payment edit increases request size and forces return reconciliation work. This is not the primary incident cause but is avoidable overhead.

---

## 7. RED test added

Added file:

```text
test/phase-a1-delivery-adjustment-payment-return-isolation.red.test.js
```

The test uses only Node built-ins and executes the real frontend functions in a VM harness. It does not merely inspect source text.

### Covered behavior

1. Captures the actual request object emitted by `submitAdjustmentPopup()`.
2. Proves all return quantities are unchanged (`adjustmentQty = 0`).
3. Proves the UI still sends:
   - `returnAdjustmentAmount = 1,931,784`
   - full `returnAdjustmentItems`
   - empty `correctedReturnItems`.
4. Uses the real `calculateCorrectionDebtDelta()` and `assertCorrectionDebtDeltaPolicy()` to reproduce the exact 409 code.
5. Contains a desired-contract assertion that must remain RED until production code is fixed.

### Test command

```bash
node --test test/phase-a1-delivery-adjustment-payment-return-isolation.red.test.js
```

### Result

- Exit code: `1`
- Tests: `3`
- Pass: `2`
- Fail: `1`
- RED failure:

```text
PAYMENT_ONLY must omit returnAdjustmentAmount
actual: 1931784
expected: undefined
```

The failure is intentional and proves the current production behavior violates the proposed contract.

### Environment limitation

`npm ci --ignore-scripts --no-audit --no-fund` was attempted but the isolated package registry did not contain `zip-stream@4.1.1`. Therefore the full dependency-based suite was not run. The new RED test and real domain policy run successfully using Node built-ins only.

---

## 8. Proposed production-grade command contract

### Command types

```text
PAYMENT_ONLY
RETURN_ONLY
COMBINED
POST_CLOSEOUT_CORRECTION
```

### PAYMENT_ONLY request

```json
{
  "changeType": "PAYMENT_ONLY",
  "paymentCorrection": {
    "correctedCashAmount": 0,
    "correctedBankAmount": 0,
    "correctedRewardAmount": 0
  },
  "expectedVersion": "<canonical version>",
  "idempotencyKey": "<stable request key>",
  "reason": "...",
  "note": "..."
}
```

Rules:

- Must not contain return fields.
- Backend sets `returnDelta = 0`.
- No `returnOrders` read/write is needed to authorize the payment command.
- No direct `AR-RECEIPT` or fund ledger posting.
- Backend loads current payment state from one canonical service, not from UI current values.

### RETURN_ONLY request

- Contains changed return line identities and desired quantities.
- Backend loads canonical current return quantities and prices.
- Backend computes line and total delta.
- Client aggregate is diagnostic only; mismatch must be rejected.
- Payment fields are absent and remain unchanged.

### COMBINED request

- Allowed only if explicitly approved by domain requirements.
- Each component is validated independently.
- Must be atomic and idempotent.

### POST_CLOSEOUT_CORRECTION

- Requires confirmed canonical closeout state.
- Uses immutable correction/version semantics.
- Post-closeout-only policy codes must never be emitted by pre-closeout commands.

---

## 9. Recommended implementation options

### Option A — Recommended, production-grade

Introduce an explicit command-intent contract and central canonical state loader shared by list, popup, and write path.

**Benefits**

- Eliminates cross-domain mutation.
- Prevents forged/stale client totals.
- Clear authorization and audit semantics.
- Strong long-term maintainability.

**Trade-offs**

- Backend schema/validation, frontend payload builder, and tests must change together.
- Legacy client compatibility needs an explicit migration policy.

**Effort:** Hard  
**Risk:** Medium, controlled by red-green regression gates.

### Option B — Balanced effort

Keep the endpoint but:

- UI only sends return fields when a real user-edited quantity differs from its loaded baseline;
- backend ignores/rejects return fields for inferred payment-only operations;
- backend computes return totals from material changed lines;
- pre-closeout branch uses pre-closeout error codes.

**Benefits**

- Fixes the incident with a smaller diff.
- Lower deployment risk.

**Trade-offs**

- Endpoint remains multi-purpose.
- Canonical-source inconsistency is reduced but not fully removed.

**Effort:** Medium  
**Risk:** Low–Medium.

---

## 10. Files expected in Phase A2 / A3

### Phase A2 — Backend/domain

Expected production files:

- `src/services/deliveryCloseoutCorrection.service.js`
- `src/services/delivery/DeliveryAdjustmentCommitService.js`
- `src/domain/accounting/correctionDebtDelta.js` or a new command policy module
- `src/routes/newOperationsRoutes.js` and request validation module if added
- `src/services/delivery/DeliveryPaymentStateReadService.js` if made the shared canonical loader
- focused backend tests and fixtures

### Phase A3 — Frontend

Expected production files:

- `public/js/app/new/91-delivery-today-new.js`
- frontend payload/dirty-state helper if extracted
- runtime frontend tests

### Phase A1 modified files

Only the following were added/modified:

- `test/phase-a1-delivery-adjustment-payment-return-isolation.red.test.js`
- `PHASE_A1_DELIVERY_ADJUSTMENT_AUDIT.md`
- `PHASE_A1_RED_TEST_EVIDENCE.json`

No production code was changed.

---

## 11. Phase A1 exit criteria

| Criterion | Status |
|---|---|
| Full call chain documented | PASS |
| Each hypothesis verified or qualified | PASS |
| Behavioral RED test added | PASS |
| RED test run and failed for expected reason | PASS |
| Proposed command contract documented | PASS |
| A2/A3 expected file scope listed | PASS |
| Production code unchanged | PASS |

**Phase A1 stops here. No production fix has been applied.**
