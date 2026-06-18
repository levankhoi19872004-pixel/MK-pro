'use strict';

const assert = require('node:assert/strict');

const modules = [
  '../src/application/CommandPipeline',
  '../src/services/outbox/OutboxService',
  '../src/services/purchase/PurchaseService',
  '../src/services/warehouse/WarehouseService',
  '../src/services/analytics/ProjectionService',
  '../src/services/mobile/MobileSyncService',
  '../src/services/field/FieldOperationService',
  '../src/services/delivery/DeliveryPlanningService',
  '../src/services/integrations/IntegrationService',
  '../src/services/platform/PlatformService'
];

for (const path of modules) {
  const loaded = require(path);
  assert.ok(loaded && typeof loaded === 'object', `${path} không load được`);
}

const { snapshot } = require('../src/config/featureFlags');
const flags = snapshot();
assert.equal(typeof flags.enterpriseCore, 'boolean');
console.log(`ENTERPRISE_SMOKE_OK modules=${modules.length} flags=${Object.keys(flags).length}`);
