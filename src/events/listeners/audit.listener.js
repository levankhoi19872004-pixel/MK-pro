'use strict';

const eventBus = require('../eventBus');
const eventLogService = require('../../services/eventLogService');

function register(eventTypes = require('../eventTypes')) {
  Object.values(eventTypes).forEach((eventType) => {
    eventBus.on(eventType, async (payload = {}, context = {}) => eventLogService.recordEvent({
      eventType,
      aggregateType: payload.aggregateType || payload.sourceType || 'BUSINESS_EVENT',
      aggregateId: payload.id || payload._id || payload.sourceId || payload.order?.id || payload.returnOrder?.id || payload.receipt?.id,
      aggregateCode: payload.code || payload.sourceCode || payload.order?.code || payload.returnOrder?.code || payload.receipt?.code,
      source: 'event_bus',
      sourceType: payload.sourceType || eventType,
      sourceId: payload.sourceId || payload.id || payload._id,
      sourceCode: payload.sourceCode || payload.code,
      payload,
      createdBy: context.createdBy || context.userId || payload.createdBy
    }, context));
  });
}

module.exports = { register };
