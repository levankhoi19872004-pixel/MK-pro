# R1.4a A1 — Historical Lineage Contract Audit

## Root cause
`deliveryCloseoutCorrection.service.js` increments the runtime closeout version from the current previous version, but `DeliveryCloseoutCorrection.originalCloseoutVersion` intentionally records the **original closeout version**, not the immediate predecessor. R1.4 incorrectly reused that source-origin field as forensic `fromVersion`.

For B0041181, v3 therefore legitimately carries source original version 1 while its previous financial state equals the immutable v2 state. The forensic predecessor must be v2.

## Predecessor resolution implemented
1. Explicit predecessor ID when source actually provides one and state matches.
2. Explicit predecessor version when source actually provides one and state matches.
3. Immutable `DeliveryCloseoutVersion` rows matching exact previous financial state.
4. Canonical immediate sequence tie-break only where the source contract supports it.
5. Incomplete-state sequence fallback only when the previous state lacks enough fields.
6. Otherwise fail closed `AMBIGUOUS_LINEAGE` / no plan.

When an embedded `salesOrders.deliveryCloseout` snapshot and `DeliveryCloseoutVersion` describe the same version number, the immutable version ledger has priority. Multiple immutable rows with equal authority remain ambiguous and cannot be planned.

## Metadata separation
- `sourceOriginalVersion`: source/audit provenance only.
- `fromVersion`: actual financial predecessor used to reconstruct the event.
- `predecessorVersionId`: immutable predecessor identity.
- `toVersion` / `correctedVersionId`: corrected immutable version.
- `lineageResolutionMethod`, `lineageEvidenceRefs`, `lineageHash`: deterministic revalidation evidence.

## B0041181 expected lineage
`v1 -> v2 (-23,800,085) -> v3 (+85) -> v4 (NO_EFFECT)`.
