const flexModel = require('./_flexModel');

// Lightweight event log: phục vụ audit/rebuild. Ledger vẫn là nguồn sự thật;
// eventLogs ghi lại sự kiện nghiệp vụ đã phát sinh để trace/đối soát.
const EventLog = flexModel('EventLog', 'eventLogs', {
  id: String,
  eventType: String,
  aggregateType: String,
  aggregateId: String,
  aggregateCode: String,
  idempotencyKey: String,
  source: String,
  sourceType: String,
  sourceId: String,
  sourceCode: String,
  refType: String,
  refId: String,
  refCode: String,
  status: String,
  payload: Object,
  metadata: Object,
  createdBy: String,
  createdAt: String,
  updatedAt: String
});

EventLog.schema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true, name: 'uniq_event_log_idempotency_key' }
);

module.exports = EventLog;
