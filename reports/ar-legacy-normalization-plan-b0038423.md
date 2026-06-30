# PHASE81 AR Legacy Contract Normalization Plan

- GeneratedAt: 2026-06-30T04:02:34.389Z
- Mode: phase81-plan-only
- ReadOnly: true
- RowsAudited: 6
- ActionCount: 6
- SafeToAutoApplyCount: 0
- ManualReviewCount: 6

## Source counts
- salesOrders: 1
- returnOrders: 1
- debtCollections: 0
- fundLedgers: 0

## Actions by type
- MANUAL_REVIEW_REQUIRED: 6

## Actions by confidence
- low: 6

## Auto-apply candidates sample
- Không có action high-confidence an toàn để apply tự động.

## Manual review sample
- MANUAL_REVIEW_REQUIRED | AR-SALE-SO1782550380164673 | confidence=low | reason=ACC/REV mismatch, B0038423/B0038424, or complex reversal chain requires manual accounting review.
- MANUAL_REVIEW_REQUIRED | AR-BONUS-SO1782550380164673 | confidence=low | reason=ACC/REV mismatch, B0038423/B0038424, or complex reversal chain requires manual accounting review.
- MANUAL_REVIEW_REQUIRED | AR-SALE-REVERSAL-B0038423-REV-SO1782550380164673-1782778730341 | confidence=low | reason=ACC/REV mismatch, B0038423/B0038424, or complex reversal chain requires manual accounting review.
- MANUAL_REVIEW_REQUIRED | AR-SALE-SO1782550380164673-ACC-SO1782550380164673-1782778730341 | confidence=low | reason=ACC/REV mismatch, B0038423/B0038424, or complex reversal chain requires manual accounting review.
- MANUAL_REVIEW_REQUIRED | AR-SALE-REVERSAL-B0038423-REV-SO1782550380164673-1782778836570 | confidence=low | reason=ACC/REV mismatch, B0038423/B0038424, or complex reversal chain requires manual accounting review.
- MANUAL_REVIEW_REQUIRED | AR-SALE-SO1782550380164673-ACC-SO1782550380164673-1782778836570 | confidence=low | reason=ACC/REV mismatch, B0038423/B0038424, or complex reversal chain requires manual accounting review.

Only confidence=high and non-manual actions may be auto-applied. No ledger is deleted. Every action includes rollbackPatch.
