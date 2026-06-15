'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const SalesOrder = require('../src/models/SalesOrder');

test('mongoose strictQuery does not strip sales-order staff filters', () => {
  const previous = mongoose.get('strictQuery');
  mongoose.set('strictQuery', true);

  try {
    const query = SalesOrder.find({
      orderDate: { $gte: '2026-06-15', $lte: '2026-06-15' },
      $and: [{
        $or: [
          { salesStaffCode: '35093' },
          { salesPersonCode: { $in: ['35093', 35093] } },
          { salesmanCode: { $in: ['35093', 35093] } },
          { nvbhCode: { $in: ['35093', 35093] } },
          { maNVBH: { $in: ['35093', 35093] } },
          { 'salesStaff.code': { $in: ['35093', 35093] } }
        ]
      }]
    });

    query.cast(SalesOrder);
    const filter = query.getFilter();
    const serialized = JSON.stringify(filter);

    assert.match(serialized, /salesStaffCode/);
    assert.match(serialized, /salesPersonCode/);
    assert.match(serialized, /salesmanCode/);
    assert.match(serialized, /nvbhCode/);
    assert.match(serialized, /maNVBH/);
    assert.match(serialized, /salesStaff\.code/);
  } finally {
    mongoose.set('strictQuery', previous);
  }
});
