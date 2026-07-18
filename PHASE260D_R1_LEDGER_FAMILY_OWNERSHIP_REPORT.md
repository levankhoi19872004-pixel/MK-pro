# Phase260D R1 Ledger Family Ownership Report

Generated: 2026-07-17T10:11:08.579Z

## Root Cause

Phase260C stabilized correction debt deltas, but mixed ledger families could still be read together as if every row owned the same financial effect. Examples are legacy `AR-SALE` plus canonical `AR-DEBT-OPEN`, legacy receipt rows plus `AR-DEBT-PAYMENT`, and return effects represented by both `AR-RETURN` and correction adjustment rows. Without an ownership resolver, readers can double count even when writers are individually idempotent.

## Production-Grade Option A Implemented

A shared semantic registry, immutable business-event identity builder, and deterministic ownership resolver now sit before debt projection. Canonical debt rows own opening/payment effects when paired with legacy rows. Dedicated return rows own return effects when paired with correction return rows. Only selected owners are projected into Debt New/mobile totals.

## Lower-Effort Option B Rejected

A per-reader category filter would reduce obvious duplicate totals but would not distinguish projection shadows from true duplicate financial effects and would drift across backend/mobile/report readers.
