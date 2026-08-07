'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function simulateLegacySerial(durations = []) {
  let elapsed = 0;
  const timeline = [];
  for (let index = 0; index < durations.length; index += 1) {
    const duration = Number(durations[index] || 0);
    const startedAt = elapsed;
    elapsed += duration;
    timeline.push({ index, startedAt, finishedAt: elapsed });
  }
  return { elapsed, timeline, maxConcurrency: durations.length ? 1 : 0 };
}

test('GREEN production orchestration no longer contains the legacy serial loop', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../src/services/delivery/DeliveryAdjustmentBulkCommitService.js'), 'utf8');
  assert.doesNotMatch(source, /for\s*\(let\s+inputPosition[\s\S]*?await\s+withOptionalMongoTransaction/);
  assert.match(source, /runBoundedByIdentity/);
  assert.match(source, /effectiveConcurrency/);
});

test('RED independent transactions are executed one after another', () => {
  const result = simulateLegacySerial([5, 3, 4]);
  assert.equal(result.maxConcurrency, 1);
  assert.deepEqual(result.timeline, [
    { index: 0, startedAt: 0, finishedAt: 5 },
    { index: 1, startedAt: 5, finishedAt: 8 },
    { index: 2, startedAt: 8, finishedAt: 12 }
  ]);
});

test('RED one slow task stretches the full serial batch', () => {
  const result = simulateLegacySerial([1, 100, 1, 1]);
  assert.equal(result.elapsed, 103);
  assert.equal(result.timeline[2].startedAt, 101);
  assert.equal(result.timeline[3].startedAt, 102);
});
