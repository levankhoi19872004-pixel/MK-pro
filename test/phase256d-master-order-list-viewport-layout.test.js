'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const masterOrderCss = fs.readFileSync(path.join(root, 'public/css/30-master-orders.css'), 'utf8');
const indexShell = fs.readFileSync(path.join(root, 'public/index.shell.html'), 'utf8');
const masterDeliveryJs = fs.readFileSync(path.join(root, 'public/js/app/06-master-delivery.js'), 'utf8');

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = masterOrderCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  assert.ok(match, `${selector} rule must exist`);
  return match[1];
}

function ruleMatching(pattern, label) {
  const match = masterOrderCss.match(pattern);
  assert.ok(match, `${label} rule must exist`);
  return match[1];
}

test('master order list-only card uses viewport height and removes legacy fixed caps', () => {
  const cardRule = ruleFor('#masterOrdersTab .master-order-list-only-grid .master-list-only-card');

  assert.match(cardRule, /display\s*:\s*flex\s*!important/);
  assert.match(cardRule, /flex-direction\s*:\s*column\s*!important/);
  assert.match(cardRule, /height\s*:\s*calc\(100vh\s*-\s*128px\)\s*!important/);
  assert.match(cardRule, /height\s*:\s*calc\(100dvh\s*-\s*128px\)\s*!important/);
  assert.match(cardRule, /max-height\s*:\s*none\s*!important/);
  assert.doesNotMatch(cardRule, /max-height\s*:\s*520px/);
  assert.match(masterOrderCss, /@media\(max-height:720px\)/);
  assert.match(masterOrderCss, /@media\(max-width:768px\)/);
});

test('master order list is the only vertical scroll owner in list-only mode', () => {
  const gridRule = ruleMatching(
    /#masterOrdersTab \.master-order-list-only-grid\s*\{([\s\S]*?min-height\s*:\s*0\s*!important;[\s\S]*?)\}/m,
    'Phase256D list-only grid'
  );
  const toolbarRule = ruleMatching(
    /#masterOrdersTab \.master-order-list-only-grid \.master-list-only-card \.ui-list-toolbar,\s*#masterOrdersTab \.master-order-list-only-grid \.master-list-only-card \.master-order-list-head\s*\{([\s\S]*?)\}/m,
    'toolbar and list head'
  );
  const listRule = ruleFor('#masterOrdersTab .master-order-list-only-grid .master-list-only-card #masterOrderList');

  assert.match(gridRule, /min-height\s*:\s*0\s*!important/);
  assert.match(toolbarRule, /flex\s*:\s*0\s+0\s+auto\s*!important/);
  assert.match(listRule, /flex\s*:\s*1\s+1\s+auto\s*!important/);
  assert.match(listRule, /height\s*:\s*auto\s*!important/);
  assert.match(listRule, /min-height\s*:\s*0\s*!important/);
  assert.match(listRule, /max-height\s*:\s*none\s*!important/);
  assert.match(listRule, /overflow-y\s*:\s*auto\s*!important/);
  assert.match(listRule, /overflow-x\s*:\s*hidden\s*!important/);
  assert.doesNotMatch(listRule, /height\s*:\s*420px/);
  assert.doesNotMatch(listRule, /max-height\s*:\s*4(?:20|30)px/);
});

test('phase 256d does not touch popup scope or business JavaScript sizing', () => {
  const phaseBlock = masterOrderCss.match(/PHASE256D_MASTER_ORDER_LIST_VIEWPORT_START([\s\S]*?)PHASE256D_MASTER_ORDER_LIST_VIEWPORT_END/);
  assert.ok(phaseBlock, 'Phase256D CSS block must be marked');
  assert.doesNotMatch(phaseBlock[1], /#masterOrderModal/);
  assert.doesNotMatch(masterDeliveryJs, /masterOrderList\.style\.(?:height|maxHeight|minHeight)/);
  assert.doesNotMatch(masterDeliveryJs, /getBoundingClientRect\(\).*masterOrderList|masterOrderList.*getBoundingClientRect\(\)/s);
});

test('master order CSS cache marker is updated for phase 256d', () => {
  assert.match(indexShell, /\/css\/30-master-orders\.css\?v=phase256d-master-order-list-viewport-v1/);
});
