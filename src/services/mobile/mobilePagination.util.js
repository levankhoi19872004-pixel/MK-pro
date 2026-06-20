'use strict';

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMobilePagination(query = {}, options = {}) {
  const defaultLimit = Math.max(1, positiveInt(options.defaultLimit, 40));
  const maxLimit = Math.max(defaultLimit, positiveInt(options.maxLimit, 100));
  const page = positiveInt(query.page, 1);
  const limit = Math.min(positiveInt(query.limit, defaultLimit), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildPagination({ page = 1, limit = 40, totalRows = 0 } = {}) {
  const safeTotal = Math.max(0, Number(totalRows) || 0);
  const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / limit) : 0;
  return {
    page,
    limit,
    totalRows: safeTotal,
    totalPages,
    hasMore: page * limit < safeTotal
  };
}

module.exports = { parseMobilePagination, buildPagination };
