'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reviewService = require('../src/services/import/ImportShortageReviewService');

function reviewFixture() {
  return {
    sessionId: 'IMP-257A',
    items: [{ orderKey: 'SO-STALE', documentCode: 'SO-STALE', productCode: 'SP-A', missingQuantity: 4 }],
    summary: { selectedOrderCount: 1, shortageOrderCount: 1, itemCount: 1, totalMissingQuantity: 4 },
    fingerprint: 'fresh-review-fingerprint',
    selectedScopeFingerprint: 'fresh-scope-fingerprint'
  };
}

test('Phase257A commit guard rejects stale confirmed shortage review fingerprints', () => {
  const review = reviewFixture();
  const session = {
    shortageReview: {
      status: reviewService.REVIEW_STATUS.CONFIRMED,
      mode: reviewService.REVIEW_MODES.EXCLUDE_SHORTAGE_QUANTITY,
      fingerprint: 'old-review-fingerprint',
      selectedScopeFingerprint: 'old-scope-fingerprint'
    }
  };

  const guard = reviewService.validateConfirmedReview(
    session,
    review,
    reviewService.REVIEW_MODES.EXCLUDE_SHORTAGE_QUANTITY
  );

  assert.equal(guard.ok, false);
  assert.equal(guard.result.status, 409);
  assert.equal(guard.result.code, 'IMPORT_SHORTAGE_REVIEW_STALE');
  assert.equal(guard.result.fingerprint, review.fingerprint);
  assert.equal(guard.result.selectedScopeFingerprint, review.selectedScopeFingerprint);
});

test('Phase257A commit guard requires an explicit mode before any import writer can run', () => {
  const review = reviewFixture();
  const session = { shortageReview: { status: reviewService.REVIEW_STATUS.NOT_REQUIRED } };

  const guard = reviewService.validateConfirmedReview(session, review, '');

  assert.equal(guard.ok, false);
  assert.equal(guard.result.status, 409);
  assert.equal(guard.result.code, 'IMPORT_SHORTAGE_REVIEW_INVALID_MODE');
});
