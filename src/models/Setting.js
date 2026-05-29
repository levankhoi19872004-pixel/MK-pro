const flexModel = require('./_flexModel');
module.exports = flexModel('Setting', 'settings', { key: String, value: Object, counters: Object, updatedAt: String });
