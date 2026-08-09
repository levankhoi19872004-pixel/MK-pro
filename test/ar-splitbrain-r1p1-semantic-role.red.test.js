'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { semanticRoleForLedger, SEMANTIC_ROLES } = require('../src/domain/ar/debtLedgerSemanticRegistry');

test('RED R1P1: AR-ADJUSTMENT + DELIVERY_CLOSEOUT_CORRECTION is CORRECTION_DELTA', () => {
  assert.equal(semanticRoleForLedger({
    category: 'AR-ADJUSTMENT',
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION'
  }), SEMANTIC_ROLES.CORRECTION_DELTA);
});

test('contract: manual/admin AR-ADJUSTMENT remains MANUAL_ADJUSTMENT', () => {
  assert.equal(semanticRoleForLedger({
    category: 'AR-ADJUSTMENT',
    sourceType: 'ADMIN_CORRECTION'
  }), SEMANTIC_ROLES.MANUAL_ADJUSTMENT);
});
