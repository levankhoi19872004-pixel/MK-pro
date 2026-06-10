'use strict';

const eventBus = require('./eventBus');
const eventTypes = require('./eventTypes');

let registered = false;

function registerDefaultListeners() {
  if (registered) return eventBus;
  require('./listeners/ar.listener').register();
  require('./listeners/inventory.listener').register();
  require('./listeners/fund.listener').register();
  require('./listeners/audit.listener').register(eventTypes);
  require('./listeners/notification.listener').register();
  registered = true;
  return eventBus;
}

module.exports = { eventBus, eventTypes, registerDefaultListeners };
