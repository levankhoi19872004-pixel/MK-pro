'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSourceNote } = require('../src/services/source-contracts/SourceNoteBuilder');

test('buildSourceNote returns normalized source note fields', () => {
  const note = buildSourceNote('debt-current', { filters: { q: 'ABC', token: 'secret' }, user: { username: 'ketoan' } });
  assert.equal(note.code, 'debt-current');
  assert.equal(note.module, 'debt');
  assert.deepEqual(note.primaryCollections, ['arLedgers']);
  assert.equal(note.debtSource, 'arLedgers');
  assert.equal(note.sourceStatus, 'OK');
  assert.equal(note.generatedBy, 'ketoan');
  assert.equal(note.filters.q, 'ABC');
  assert.equal(note.filters.token, undefined);
  assert.match(note.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('missing contract throws SOURCE_CONTRACT_MISSING and warnings force WARNING', () => {
  assert.throws(() => buildSourceNote('missing-contract'), /Thiếu source contract/);
  try { buildSourceNote('missing-contract'); } catch (error) { assert.equal(error.code, 'SOURCE_CONTRACT_MISSING'); }
  const note = buildSourceNote('inventory-current', { sourceWarnings: ['negative stock'] });
  assert.equal(note.sourceStatus, 'WARNING');
  assert.ok(note.sourceWarnings.includes('negative stock'));
  assert.ok(note.sourceWarnings.some((value) => /warning/i.test(value) || /OK/.test(value)));
});
