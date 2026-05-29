const flexModel = require('./_flexModel');
module.exports = flexModel('ImportLog', 'import_logs', { id: String, type: String, fileName: String, summary: Object, createdAt: String });
