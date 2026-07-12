'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public/js/app/new/91-delivery-today-new.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/services/v2/deliveryTodayNew.service.js'), 'utf8');
const correctionService = fs.readFileSync(path.join(root, 'src/services/deliveryCloseoutCorrection.service.js'), 'utf8');

function bodyOf(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} exists`);
  const end = nextFunctionName ? source.indexOf(`function ${nextFunctionName}`, start + 1) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
}

test('Delivery Today checkbox is view selection, not closeout permission', () => {
  const viewBody = bodyOf(ui, 'isViewSelectableOrder', 'isCloseoutEligibleOrder');
  assert.match(viewBody, /deriveCloseoutUiState\(row\)\.viewSelectable/);
  assert.match(ui, /row\.viewSelectable !== false/);
  assert.doesNotMatch(viewBody, /isConfirmed\(row\)/);
  assert.doesNotMatch(viewBody, /accountingConfirmed/);
  assert.doesNotMatch(viewBody, /accountingStatus/);
  assert.doesNotMatch(viewBody, /closeoutEligible/);
  assert.doesNotMatch(viewBody, /canCloseout/);

  const renderBody = bodyOf(ui, 'renderOrderRow', 'updateOrderSelectionToolbar');
  assert.match(renderBody, /var viewSelectable = closeoutState\.viewSelectable/);
  assert.match(renderBody, /var closeoutState = deriveCloseoutUiState\(row\)/);
  assert.match(renderBody, /var closeoutEligible = closeoutState\.closeoutEligible/);
  assert.match(renderBody, /var disabled = viewSelectable \? '' : ' disabled'/);
  assert.doesNotMatch(renderBody, /var disabled = selectable \? '' : ' disabled'/);
});

test('closeout action only sends closeout-eligible selected orders', () => {
  const closeoutRowsBody = bodyOf(ui, 'selectedCloseoutRows', 'closeoutSummary');
  assert.match(closeoutRowsBody, /getCloseoutSelectionSummary\(\)\.eligibleRows/);

  const buttonBody = bodyOf(ui, 'updateCloseoutButton', 'closeCloseoutModal');
  assert.match(buttonBody, /getCloseoutSelectionSummary\(\)/);
  assert.match(buttonBody, /eligibleSelectedOrders === 0/);

  const submitBody = bodyOf(ui, 'submitCloseout', 'rowKey');
  assert.match(submitBody, /var selectionSummary = getCloseoutSelectionSummary\(\)/);
  assert.match(submitBody, /var rows = selectionSummary\.eligibleRows/);
  assert.match(submitBody, /Không có đơn đủ điều kiện chốt sổ/);
  assert.match(submitBody, /orderIds: orderIds/);
});

test('toolbar separates total selected closeout-eligible and closed counters', () => {
  const toolbarBody = bodyOf(ui, 'updateOrderSelectionToolbar', 'renderRows');
  assert.match(toolbarBody, /var summary = getCloseoutSelectionSummary\(visible\)/);
  assert.match(toolbarBody, /summary\.eligibleSelectedOrders/);
  assert.match(toolbarBody, /summary\.closedSelectedOrders/);
  assert.match(toolbarBody, /Tổng đơn:/);
  assert.match(toolbarBody, /Đang chọn:/);
  assert.match(toolbarBody, /Có thể chốt:/);
  assert.match(toolbarBody, /Đã chốt:/);
});

test('delivery today API contract separates viewSelectable and closeoutEligible', () => {
  assert.match(service, /viewSelectable/);
  assert.match(service, /closeoutEligible/);
  assert.match(service, /adjustmentAllowed/);
  assert.match(service, /closeoutLocked/);
  assert.match(service, /canCloseout/);
  assert.match(service, /canAdjust/);
  assert.match(service, /evaluateCloseoutEligibility\(order,\s*\{\s*confirmedCloseout\s*\}\)/);
  assert.match(service, /const closeoutEligible = closeoutEligibility\.eligible === true/);
  assert.match(service, /closeoutEligibilityCode/);
});

test('adjustment popup can submit before closeout through open-order adjustment path', () => {
  const submitBody = bodyOf(ui, 'submitAdjustmentPopup', 'renderCachedVersions');
  assert.doesNotMatch(submitBody, /if \(!isConfirmed\(row\)\)/);
  assert.doesNotMatch(submitBody, /Đơn chưa xác nhận kế toán/);
  assert.match(ui, /Đơn chưa chốt sổ\. Admin\/kế toán có thể cập nhật trạng thái thu tiền hiện tại trước khi chốt/);

  assert.match(correctionService, /async function createOpenOrderAdjustment/);
  assert.match(correctionService, /if \(!isCloseoutConfirmed\(order\)\)/);
  assert.match(correctionService, /DELIVERY_OPEN_ADJUSTMENT/);
  assert.match(correctionService, /pre_closeout_no_ledger/);
  assert.match(correctionService, /Đã cập nhật điều chỉnh trước chốt sổ; chưa sinh AR ledger/);
});
