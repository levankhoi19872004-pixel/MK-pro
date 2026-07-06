'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

test('notification backend architecture has domain event, audit event, notification service and routes', () => {
  assert.match(read('src/services/events/domainEventBus.js'), /emitDomainEvent/);
  assert.match(read('src/services/events/auditEventService.js'), /AuditEvent/);
  assert.match(read('src/services/events/notificationService.js'), /createForAuditEvent/);
  assert.match(read('src/routes/notificationRoutes.js'), /\/summary/);
  assert.match(read('src/routes/index.js'), /\/api\/notifications/);
});

test('notification models and managed indexes are registered', () => {
  assert.match(read('src/models/index.js'), /auditEvents: require\('\.\/AuditEvent'\)/);
  assert.match(read('src/models/index.js'), /notifications: require\('\.\/Notification'\)/);
  assert.match(read('src/services/mongoIndexService.js'), /idx_audit_events_type_time/);
  assert.match(read('src/services/mongoIndexService.js'), /idx_notifications_recipient_read_time/);
});

test('recipient resolver uses rules and avoids duplicate recipient paths', () => {
  const resolver = read('src/services/events/notificationRecipientResolver.js');
  assert.match(resolver, /getRule/);
  assert.match(resolver, /new Map\(\)/);
  assert.match(resolver, /isActive: \{ \$ne: false \}/);
  assert.match(resolver, /related/);
});

test('formatter supports P0 messages and action urls', () => {
  const formatter = read('src/services/events/notificationFormatter.js');
  assert.match(formatter, /AR_RECEIPT_CONFIRMED/);
  assert.match(formatter, /DELIVERY_CLOSEOUT_ADJUSTED/);
  assert.match(formatter, /IMPORT_COMPLETED_WITH_ERRORS/);
  assert.match(formatter, /USER_ROLE_CHANGED/);
  assert.match(formatter, /actionUrl/);
});

test('core P0 business points emit domain events through the bus', () => {
  assert.match(read('src/services/DebtCollectionService.js'), /AR_RECEIPT_CONFIRMED/);
  assert.match(read('src/services/deliveryCloseoutCorrection.service.js'), /DELIVERY_CLOSEOUT_ADJUSTED/);
  assert.match(read('src/services/import/ImportWebDirectCommitService.js'), /IMPORT_COMPLETED_WITH_ERRORS/);
  assert.match(read('src/services/import/ImportWebDirectCommitService.js'), /IMPORT_FAILED/);
  assert.match(read('src/services/userService.js'), /USER_ROLE_CHANGED/);
  assert.match(read('src/services/userService.js'), /USER_DISABLED/);
  assert.match(read('src/controllers/orderController.js'), /ORDER_AMOUNT_CHANGED/);
  assert.match(read('src/controllers/orderController.js'), /ORDER_DELETED/);
});

test('frontend has notification bell, dropdown, center, filters and read actions', () => {
  const ui = read('public/js/app/notification-center.js');
  assert.match(ui, /notificationBellButton/);
  assert.match(ui, /notificationDropdown/);
  assert.match(ui, /notificationCenterTab/);
  assert.match(ui, /\/api\/notifications\/summary/);
  assert.match(ui, /\/api\/notifications\/read-all/);
  assert.match(ui, /notificationModuleFilter/);
  assert.match(ui, /notificationSeverityFilter/);
  assert.match(read('public/fragments/index/07-index-body.html'), /notification-center\.js/);
});
