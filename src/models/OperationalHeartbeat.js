'use strict';

const mongoose = require('mongoose');

const OperationalHeartbeatSchema = new mongoose.Schema({
  instanceId: { type: String, required: true, trim: true },
  service: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  status: { type: String, required: true, enum: ['starting', 'ready', 'busy', 'stopping', 'stopped', 'failed'] },
  version: { type: String, default: 'unknown' },
  releaseId: { type: String, default: 'unmanifested' },
  hostname: { type: String, default: '' },
  pid: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  lastHeartbeatAt: { type: Date, default: Date.now },
  lastJobAt: { type: Date, default: null },
  lastSuccessAt: { type: Date, default: null },
  lastFailureAt: { type: Date, default: null },
  currentJobs: { type: Number, default: 0 },
  completedJobs: { type: Number, default: 0 },
  failedJobs: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  expireAt: { type: Date, default: null }
}, { versionKey: false, minimize: false });

module.exports = mongoose.models.OperationalHeartbeat
  || mongoose.model('OperationalHeartbeat', OperationalHeartbeatSchema, 'operational_heartbeats');
