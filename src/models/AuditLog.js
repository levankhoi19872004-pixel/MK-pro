const flexModel = require('./_flexModel');
module.exports = flexModel('AuditLog', 'audit_logs', {
  id: String,
  tenantId: String,
  action: String,
  refType: String,
  refId: String,
  refCode: String,
  before: Object,
  after: Object,
  note: String,
  userName: String,
  createdAt: String
});
