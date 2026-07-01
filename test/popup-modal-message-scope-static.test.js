'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function functionSlice(source, functionName) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`);
  const matchStart = source.match(pattern);
  assert.ok(matchStart, `Missing function ${functionName}`);
  const start = matchStart.index;
  const rest = source.slice(start + 20);
  const match = rest.match(/\n  (?:async )?function /);
  const next = match ? start + 20 + match.index : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

test('Popup/modal inventory report documents major modal surfaces and risks', () => {
  const report = read('docs/reports/PHASE113_MODAL_MESSAGE_SCOPE_AUDIT_REPORT.md');
  assert.match(report, /Công nợ \(New\)/);
  assert.match(report, /Đơn giao hôm nay \(New\)/);
  assert.match(report, /Sản phẩm/);
  assert.match(report, /Khách hàng/);
  assert.match(report, /Bán hàng/);
  assert.match(report, /Import/);
  assert.match(report, /Quỹ tiền/);
  assert.match(report, /Thao tác ở đâu, thông báo ở đó/);
});

test('Debt New popup uses scoped popup messages, not main messages, for modal actions', () => {
  const source = read('public/js/app/new/92-debt-new.js');
  assert.match(source, /mainNotice/);
  assert.match(source, /popupNotice/);
  assert.match(source, /popupError/);
  assert.match(source, /function setPopupNotice/);
  assert.match(source, /function setPopupError/);
  assert.match(source, /debtNewModalMessage/);
  assert.match(source, /debt-new-modal-message/);
  assert.match(source, /clearPopupNotice\(\)/);
  assert.match(source, /popupCollections/);

  const submitCollection = functionSlice(source, 'submitCollection');
  assert.match(submitCollection, /setPopupNotice/);
  assert.match(submitCollection, /setPopupError/);
  assert.doesNotMatch(submitCollection, /setMessage\(/);
  assert.match(submitCollection, /loadCollections\(\{ scope: 'popup', silent: true \}\)/);
  assert.match(submitCollection, /loadCollections\(\{ scope: 'main', silent: true \}\)/);

  const confirmCollection = functionSlice(source, 'confirmCollection');
  assert.match(confirmCollection, /setPopupNotice/);
  assert.match(confirmCollection, /setPopupError/);
  assert.doesNotMatch(confirmCollection, /setMessage\(/);

  const rejectCollection = functionSlice(source, 'rejectCollection');
  assert.match(rejectCollection, /setPopupNotice/);
  assert.match(rejectCollection, /setPopupError/);
  assert.doesNotMatch(rejectCollection, /setMessage\(/);
});

test('Delivery Today New correction and closeout modals use scoped modal messages', () => {
  const source = read('public/js/app/new/91-delivery-today-new.js');
  assert.match(source, /modalNotice: \{ closeout: null, adjustment: null \}/);
  assert.match(source, /function setModalNotice/);
  assert.match(source, /function setModalError/);
  assert.match(source, /modalNoticeHtml\('closeout'\)/);
  assert.match(source, /modalNoticeHtml\('adjustment'\)/);
  assert.match(source, /deliveryTodayNewCloseoutModalMessage/);
  assert.match(source, /deliveryTodayNewAdjustmentModalMessage/);
  assert.match(source, /delivery-new-modal-message/);

  const submitCloseout = functionSlice(source, 'submitCloseout');
  assert.match(submitCloseout, /setModalNotice\('closeout'/);
  assert.match(submitCloseout, /setModalError\('closeout'/);
  assert.doesNotMatch(submitCloseout, /setMessage\(/);
  assert.match(submitCloseout, /load\(\{ silent: true \}\)/);

  const submitAdjustment = functionSlice(source, 'submitAdjustmentPopup');
  assert.match(submitAdjustment, /setModalNotice\('adjustment'/);
  assert.match(submitAdjustment, /setModalError\('adjustment'/);
  assert.doesNotMatch(submitAdjustment, /setMessage\(/);
  assert.match(submitAdjustment, /load\(\{ silent: true \}\)/);
});

test('Scoped modal loading does not force main-screen message during silent refresh', () => {
  const debtSource = read('public/js/app/new/92-debt-new.js');
  const loadCollections = functionSlice(debtSource, 'loadCollections');
  assert.match(loadCollections, /var scope = options\.scope \|\| 'main'/);
  assert.match(loadCollections, /var silent = Boolean\(options\.silent\)/);
  assert.match(loadCollections, /if \(scope === 'popup'\)/);
  assert.match(loadCollections, /if \(!silent\) setMainError/);

  const deliverySource = read('public/js/app/new/91-delivery-today-new.js');
  const load = functionSlice(deliverySource, 'load');
  assert.match(load, /var silent = Boolean\(options\.silent\)/);
  assert.match(load, /if \(!silent\) setMessage/);
});
