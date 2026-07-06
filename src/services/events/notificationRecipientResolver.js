'use strict';

const User = require('../../models/User');
const { getRule } = require('./notificationRuleService');
const { isMongooseReady } = require('./auditEventService');

function text(value = '') {
  return String(value ?? '').trim();
}

function userId(user = {}) {
  return text(user._id || user.id || user.userId || user.username || user.staffCode || user.code);
}

function clientUser(user = {}) {
  return {
    userId: userId(user),
    role: text(user.role),
    code: text(user.staffCode || user.code || user.username),
    name: text(user.fullName || user.name || user.username || user.staffCode || user.code)
  };
}

function addRecipient(map, user = {}) {
  const recipient = clientUser(user);
  if (!recipient.userId) return;
  map.set(recipient.userId, recipient);
}

function identityQuery(value = '') {
  const code = text(value);
  if (!code) return null;
  const or = [
    { id: code },
    { userId: code },
    { staffCode: code },
    { code },
    { username: code }
  ];
  if (/^[a-fA-F0-9]{24}$/.test(code)) or.unshift({ _id: code });
  return { $or: or };
}

async function findUsersByRole(roles = []) {
  if (!isMongooseReady()) return [];
  const safeRoles = [...new Set((roles || []).map((role) => text(role).toLowerCase()).filter(Boolean))];
  if (!safeRoles.length) return [];
  return User.find({ role: { $in: safeRoles }, isActive: { $ne: false } })
    .select('_id id username code staffCode fullName name role isActive')
    .lean()
    .catch(() => []);
}

async function findUsersByIdentities(values = []) {
  if (!isMongooseReady()) return [];
  const safeValues = [...new Set((values || []).map(text).filter(Boolean))];
  if (!safeValues.length) return [];
  const ors = [];
  for (const value of safeValues) {
    const query = identityQuery(value);
    if (query?.$or) ors.push(...query.$or);
  }
  if (!ors.length) return [];
  return User.find({ $or: ors, isActive: { $ne: false } })
    .select('_id id username code staffCode fullName name role isActive')
    .lean()
    .catch(() => []);
}

function metadataValue(event = {}, key = '') {
  return text(event.metadata?.[key] || event[key]);
}

async function resolveRecipients(event = {}) {
  const rule = getRule(event.eventType);
  const map = new Map();
  const roleRecipients = [];
  const identityRecipients = [];
  for (const recipientRule of rule.recipients || []) {
    if (recipientRule.role) roleRecipients.push(recipientRule.role);
    if (recipientRule.userId) identityRecipients.push(recipientRule.userId);
    if (recipientRule.actor) {
      identityRecipients.push(event.actorUserId, event.actorCode, event.actorName);
    }
    if (recipientRule.related) {
      identityRecipients.push(metadataValue(event, recipientRule.related));
    }
  }
  const [roleUsers, identityUsers] = await Promise.all([
    findUsersByRole(roleRecipients),
    findUsersByIdentities(identityRecipients)
  ]);
  roleUsers.forEach((user) => addRecipient(map, user));
  identityUsers.forEach((user) => addRecipient(map, user));
  if (rule.excludeActor) {
    [event.actorUserId, event.actorCode].map(text).filter(Boolean).forEach((id) => map.delete(id));
  }
  return [...map.values()];
}

module.exports = {
  resolveRecipients,
  _private: { findUsersByRole, findUsersByIdentities, clientUser, identityQuery }
};
