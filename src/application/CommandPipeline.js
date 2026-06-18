'use strict';

const IdempotencyRequest = require('../models/IdempotencyRequest');
const AuditService = require('../services/AuditService');
const OutboxService = require('../services/outbox/OutboxService');
const { withOptionalMongoTransaction } = require('../utils/transaction.util');
const { tenantIdOf } = require('../utils/tenant.util');
const dateUtil = require('../utils/date.util');
const { makeId } = require('../utils/common.util');

function ensureFunction(value, name) {
  if (value !== undefined && typeof value !== 'function') throw new Error(`${name} phải là function`);
}

async function execute(command = {}, options = {}) {
  ensureFunction(command.validate, 'validate');
  ensureFunction(command.authorize, 'authorize');
  ensureFunction(command.handle, 'handle');

  const tenantId = tenantIdOf({ tenantId: command.tenantId });
  const actor = command.actor || {};
  const input = command.input || {};
  const name = String(command.name || 'UnnamedCommand').trim();
  const idempotencyKey = String(command.idempotencyKey || input.idempotencyKey || '').trim();

  if (command.validate) await command.validate(input, { tenantId, actor });
  if (command.authorize) await command.authorize(actor, input, { tenantId });

  return withOptionalMongoTransaction(options, async (session) => {
    if (idempotencyKey) {
      const existed = await IdempotencyRequest.findOne({
        tenantId,
        key: idempotencyKey,
        commandName: name,
        status: 'completed'
      }).session(session).lean();
      if (existed) return existed.response;
    }

    const context = { tenantId, actor, session, commandName: name, idempotencyKey };
    const result = await command.handle(input, context);

    if (command.audit !== false) {
      const auditInput = typeof command.audit === 'function'
        ? await command.audit(result, input, context)
        : {
            action: name,
            refType: command.aggregateType || name,
            refId: result?.id || result?.code || input?.id || '',
            refCode: result?.code || input?.code || '',
            after: result
          };
      if (auditInput) await AuditService.record({ ...auditInput, tenantId, actor }, { session });
    }

    const events = typeof command.events === 'function'
      ? await command.events(result, input, context)
      : (Array.isArray(command.events) ? command.events : []);
    for (const event of events || []) {
      await OutboxService.enqueue({ ...event, tenantId }, { session });
    }

    if (idempotencyKey) {
      const now = dateUtil.nowIso();
      await IdempotencyRequest.findOneAndUpdate({
        tenantId,
        key: idempotencyKey,
        commandName: name
      }, {
        $set: {
          tenantId,
          key: idempotencyKey,
          commandName: name,
          status: 'completed',
          response: result,
          completedAt: now,
          updatedAt: now
        },
        $setOnInsert: {
          id: makeId('IDEM'),
          createdAt: now
        }
      }, { upsert: true, new: true, session });
    }

    return result;
  });
}

module.exports = { execute };
