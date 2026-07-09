'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectFrontendFetches, collectRouteDeclarations, routeCovered } = require('../scripts/audit-flow-usage');

test('Report Center catalog frontend fetch is covered by backend route audit', () => {
  const fetches = collectFrontendFetches().filter((item) => item.endpoint === '/api/reports/catalog');
  assert.ok(fetches.some((item) => item.file === 'public/js/app/admin/08a-reports.js'));
  const routes = collectRouteDeclarations();
  assert.equal(routeCovered('/api/reports/catalog', routes, ['GET /api/reports/*']), true);
});
