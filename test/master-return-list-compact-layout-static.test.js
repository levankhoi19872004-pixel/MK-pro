'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('master return list keeps header and rows packed at the top of the scroll area', () => {
  const root = path.resolve(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'public/css/70-master-return-orders.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

  assert.match(css, /#masterReturnOrdersTab \.master-return-fixed-list\{[\s\S]*align-content:start!important;/);
  assert.match(css, /#masterReturnOrdersTab \.master-return-fixed-list\{[\s\S]*grid-auto-rows:max-content!important;/);
  assert.match(css, /height:min\(620px,calc\(100vh - 300px\)\)!important;/);
  assert.match(css, /min-height:260px!important;/);
  assert.match(html, /\/css\/70-master-return-orders\.css\?v=phase37-master-return-list-v1/);
});
