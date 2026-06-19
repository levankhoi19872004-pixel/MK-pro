'use strict';

const mongoose = require('mongoose');

const ImportErrorSchema = new mongoose.Schema({
  row: Number,
  field: String,
  message: String,
  rawValue: mongoose.Schema.Types.Mixed
}, { _id: false });

const ImportSessionSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  sessionId: { type: String, trim: true },

  type: {
    type: String,
    required: true,
    enum: [
      'salesOrders',
      'products',
      'customers',
      'users',
      'openingStock',
      'importOrders',
      'openingDebt',
      'debtCollections',
      'cashbook',
      'promotionProductRules',
      'promotionGroupItems',
      'promotionGroupRules'
    ]
  },

  fileName: { type: String, default: '', trim: true },
  fileNames: { type: [String], default: [] },
  importMode: { type: String, enum: ['create', 'update'], default: 'create' },

  status: {
    type: String,
    enum: ['uploaded', 'queued', 'parsing', 'preview_ready', 'importing', 'done', 'failed'],
    default: 'uploaded'
  },

  queuedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },

  progress: {
    percent: { type: Number, default: 0 },
    step: { type: String, default: '' }
  },

  totalRows: { type: Number, default: 0 },
  validRows: { type: Number, default: 0 },
  errorRows: { type: Number, default: 0 },

  importErrors: { type: [ImportErrorSchema], default: [] },

  // Chỉ lưu sample nhỏ để UI preview nhanh.
  // Không lưu toàn bộ rows vào import_sessions.
  previewRows: { type: [mongoose.Schema.Types.Mixed], default: [] },

  rowStorage: {
    type: String,
    enum: ['collection'],
    default: 'collection'
  },

  storedRows: {
    type: Number,
    default: 0
  },

  result: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdBy: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  errorMessage: { type: String, default: '' }
}, { versionKey: false });

ImportSessionSchema.index({ id: 1 }, { unique: true, sparse: true, name: 'uniq_importSessions_id' });
ImportSessionSchema.index({ sessionId: 1 }, { unique: true, sparse: true, name: 'uniq_importSessions_sessionId' });
ImportSessionSchema.index({ status: 1, createdAt: -1 }, { name: 'idx_importSessions_status_createdAt' });
ImportSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: Number(process.env.IMPORT_SESSION_TTL_SECONDS || 86400), name: 'ttl_importSessions_createdAt' });

ImportSessionSchema.pre('save', function updateTimestamp(next) {
  this.updatedAt = new Date();
  if (!this.sessionId) this.sessionId = this.id;
  next();
});

module.exports = mongoose.models.ImportSession || mongoose.model('ImportSession', ImportSessionSchema, 'import_sessions');
