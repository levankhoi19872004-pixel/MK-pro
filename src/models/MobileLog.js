const flexModel = require('./_flexModel');
module.exports = flexModel('MobileLog', 'mobile_logs', { id: String, userId: String, action: String, detail: Object, createdAt: String });
