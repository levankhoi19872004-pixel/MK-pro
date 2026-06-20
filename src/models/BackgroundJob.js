'use strict';

const mongoose = require('mongoose');

const BackgroundJobSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  tenantId: { type: String, required: true, trim: true },
  type: {
    type: String,
    required: true,
    enum: ['import_preview', 'import_commit', 'export_excel', 'reconciliation']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'dead_letter', 'cancel_requested', 'cancelled'],
    default: 'pending'
  },
  idempotencyKey: { type: String, default: '', trim: true },
  requestId: { type: String, default: '', trim: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  result: { type: mongoose.Schema.Types.Mixed, default: {} },
  progress: {
    percent: { type: Number, default: 0 },
    step: { type: String, default: 'queued' },
    message: { type: String, default: '' }
  },
  attemptCount: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  timeoutMs: { type: Number, default: 300000 },
  availableAt: { type: Date, default: Date.now },
  leaseOwner: { type: String, default: '' },
  leaseExpiresAt: { type: Date, default: null },
  lastHeartbeatAt: { type: Date, default: null },
  cancelRequestedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  lastError: {
    code: { type: String, default: '' },
    message: { type: String, default: '' },
    stack: { type: String, default: '' },
    retryable: { type: Boolean, default: false },
    details: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  artifact: {
    fileId: { type: String, default: '' },
    fileName: { type: String, default: '' },
    contentType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null }
  },
  createdBy: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expireAt: { type: Date, default: null }
}, { versionKey: false, minimize: false });

BackgroundJobSchema.pre('save', function touch(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.BackgroundJob || mongoose.model('BackgroundJob', BackgroundJobSchema, 'background_jobs');
