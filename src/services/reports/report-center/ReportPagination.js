'use strict';

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePagination(query = {}, options = {}) {
  const defaultLimit = Math.max(1, Math.trunc(number(options.defaultLimit, 50)));
  const maxLimit = Math.max(defaultLimit, Math.trunc(number(options.maxLimit, 200)));
  const page = Math.max(1, Math.trunc(number(query.page, 1)));
  const limit = Math.min(Math.max(1, Math.trunc(number(query.limit, defaultLimit))), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildPageMeta(totalRows = 0, pagination = {}) {
  const total = Math.max(0, Math.trunc(number(totalRows, 0)));
  const page = Math.max(1, Math.trunc(number(pagination.page, 1)));
  const limit = Math.max(1, Math.trunc(number(pagination.limit, total || 1)));
  const skip = Math.max(0, Math.trunc(number(pagination.skip, (page - 1) * limit)));
  return {
    page,
    limit,
    total,
    totalPages: total ? Math.ceil(total / limit) : 0,
    hasMore: skip + limit < total
  };
}

module.exports = {
  parsePagination,
  buildPageMeta
};
