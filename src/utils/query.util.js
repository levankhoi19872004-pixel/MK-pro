'use strict';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getPagination(query = {}) {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, DEFAULT_LIMIT), MAX_LIMIT);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function wantsPagination(query = {}) {
  return query.page !== undefined || query.limit !== undefined || query.paginate === '1';
}

function buildPageMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1
  };
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, getPagination, wantsPagination, buildPageMeta, escapeRegex };
