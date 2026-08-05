'use strict';

const resolver = require('../src/services/delivery/DeliveryPaymentStateReadService');
const fixture = require('../test/fixtures/canonical-delivery-financial/b0040961-equivalent');

const FIELDS = ['receivableAmount','cashAmount','bankAmount','rewardAmount','offsetAmount','totalCollectedAmount','returnAmount','debtRaw','debtAmount','paymentVersion','paymentStateSource','returnStateSource'];
function chain(rows) { return { select(){return this;}, sort(){return this;}, session(){return this;}, async lean(){return rows;} }; }
function model(rows) { return { find(){return chain(rows);} }; }
function pick(value) { return Object.fromEntries(FIELDS.map((field) => [field, value[field]])); }
async function verifyFixture() {
  const order = { ...fixture.order, tenantId: 'TENANT-A' };
  const result = await resolver.resolvePaymentStatesForOrders([order], {
    models: {
      DeliveryCloseoutVersion: model([{ ...fixture.closeoutVersion, tenantId: 'TENANT-A' }]),
      OrderPaymentAllocation: model([{ ...fixture.allocation, tenantId: 'TENANT-A' }]),
      ReturnOrder: model([{ id: 'RO-B0040961', orderId: order.id || order._id, orderCode: order.orderCode || order.code, tenantId: 'TENANT-A', status: 'waiting_receive', returnAmount: 1931784 }])
    },
    includeReturnState: true
  });
  const state = result.states[0];
  return { status: 'PASS_FIXTURE_ONLY', orderCode: order.orderCode || order.code, fields: pick(state), productionHttpSmoke: 'NOT_RUN_ENV_UNAVAILABLE' };
}
if (require.main === module) verifyFixture().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { FIELDS, verifyFixture };
