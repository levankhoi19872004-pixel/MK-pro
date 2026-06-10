'use strict';

const EventEmitter = require('events');

class InternalEventBus extends EventEmitter {
  async emitAsync(eventType, payload = {}, context = {}) {
    const listeners = this.listeners(eventType);
    const results = [];
    for (const listener of listeners) {
      results.push(await listener(payload, context));
    }
    return results;
  }
}

const eventBus = new InternalEventBus();
eventBus.setMaxListeners(Number(process.env.INTERNAL_EVENT_BUS_MAX_LISTENERS || 50));

module.exports = eventBus;
