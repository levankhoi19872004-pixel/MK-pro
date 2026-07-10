'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Excel export for rewards-by-customer uses ReportCenterService and canonical RewardReportService result', () => {
  const center = read('src/services/reports/ReportCenterService.js');
  const rewardCase = center.slice(center.indexOf("case 'rewards-by-customer'"), center.indexOf("case 'delivery-by-staff'"));
  assert.match(rewardCase, /getRewardReportService\(\)\.rewardByCustomerReport/);
  assert.match(rewardCase, /sourceInfo:\s*rewards\.sourceInfo/);
  assert.match(rewardCase, /rewardSourcePriority/);
  assert.doesNotMatch(rewardCase, /orders_delivery_closeout_reward/);

  const legacyMap = read('src/services/reports/ReportLegacyExportMap.js');
  assert.doesNotMatch(legacyMap, /orders_delivery_closeout_reward/);
});

test('Reward report service does not filter Mongo orders only by legacy deliveryCloseout reward fields', () => {
  const service = read('src/services/reports/RewardReportService.js');
  const filterBody = service.slice(service.indexOf('function rewardOrderFilter'), service.indexOf('async function loadRewardOrderRows'));
  assert.doesNotMatch(filterBody, /REWARD_AMOUNT_FIELDS\.map/);
  assert.match(service, /OrderPaymentAllocation/);
  assert.match(service, /DeliveryCloseoutVersion/);
  assert.match(service, /reward_final_state_current/);
});
