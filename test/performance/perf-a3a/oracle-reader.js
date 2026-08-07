'use strict';

const reader = require('../../../src/services/delivery/deliveryTodayCanonicalOrderReader');

function active(row = {}) {
  return row.deleted !== true && row.isDeleted !== true && !['hard_deleted', 'deleted'].includes(String(row.deleteMode || ''));
}

function oracleOrders(fixture, query = {}) {
  const dateFilter = reader.normalizeDeliveryDateInput(query.date || query.deliveryDate);
  const indexes = reader.buildMasterBindingIndexes(fixture.masterOrders || []);
  const rows = (fixture.orders || [])
    .filter(active)
    .map((raw) => {
      const normalized = reader.normalizeCanonicalOrder(raw, dateFilter);
      const binding = reader.resolveMasterBindingForOrder(normalized, indexes);
      return reader.enrichOrderWithMasterMetadata(normalized, binding);
    })
    .filter((row) => !dateFilter.selectedDateKey || row.dateFilterMatched)
    .filter((row) => reader.deliveryMatches(row, query));
  return reader.dedupeOrders(rows).sort(reader.stableOrderCompare);
}

module.exports = { oracleOrders };
