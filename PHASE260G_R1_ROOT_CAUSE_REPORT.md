# Phase260G R1 Root Cause Report

Generated: 2026-07-18T08:10:16.968Z
Baseline: MK-pro-phase260f-r4-legacy-adjustment-canonical-backfill-fixed.zip
Baseline SHA256: 6e0204bf67c0fbb16ae69bd800687d42cb604fa24af1a66ac192c439194f319f
Git commit: b8636e566d87e76cc8f1b5ebd419cb76cf252451

## Root Cause
Before Phase260G, payment reduction identity did not include financialComponent. B0039294 AR-RECEIPT-CASH and AR-REWARD-ALLOWANCE shared the same payment identity, so family priority selected reward/allowance and shadowed the cash receipt.

## Evidence
AR-RECEIPT-CASH credit 1817372 was shadowed by AR-REWARD-ALLOWANCE credit 185000 under reason CANONICAL_DEBT_PAYMENT_SHADOWS_LEGACY_AR_RECEIPT. After the fix, CASH and REWARD_ALLOWANCE identities differ and both are selected.
