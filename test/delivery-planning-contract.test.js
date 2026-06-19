'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStops } = require('../src/services/delivery/DeliveryPlanningService');

test('delivery planning prioritizes priority then area and resequences stops', () => {
  const stops = buildStops([
    { code: 'MO2', priority: 1, areaCode: 'B', customerName: 'B' },
    { code: 'MO1', priority: 2, areaCode: 'C', customerName: 'C' },
    { code: 'MO3', priority: 1, areaCode: 'A', customerName: 'A' }
  ]);
  assert.deepEqual(stops.map((row) => row.orderCode), ['MO1', 'MO3', 'MO2']);
  assert.deepEqual(stops.map((row) => row.sequence), [1, 2, 3]);
});
