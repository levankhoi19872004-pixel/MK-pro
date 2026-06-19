'use strict';

const mongoose = require('mongoose');

const Mixed = mongoose.Schema.Types.Mixed;

const ImportSessionRowSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    trim: true
  },

  type: {
    type: String,
    default: '',
    trim: true
  },

  rowNo: {
    type: Number,
    default: 0
  },

  rowKey: {
    type: String,
    default: '',
    trim: true
  },

  documentCode: {
    type: String,
    default: '',
    trim: true
  },

  sourceFile: {
    type: String,
    default: '',
    trim: true
  },

  valid: {
    type: Boolean,
    default: true
  },

  canImport: {
    type: Boolean,
    default: true
  },

  status: {
    type: String,
    enum: ['valid', 'invalid'],
    default: 'valid'
  },

  normalizedRow: {
    type: Mixed,
    default: {}
  },

  // Bản rút gọn dành riêng cho API preview. Commit vẫn dùng normalizedRow đầy đủ.
  previewRow: {
    type: Mixed,
    default: undefined
  },

  rawRow: {
    type: Mixed,
    default: {}
  },

  rowErrors: {
    type: [Mixed],
    default: []
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { versionKey: false });

ImportSessionRowSchema.index(
  { sessionId: 1, rowNo: 1 },
  { name: 'idx_importSessionRows_session_rowNo' }
);

ImportSessionRowSchema.index(
  { sessionId: 1, documentCode: 1 },
  { name: 'idx_importSessionRows_session_documentCode' }
);

ImportSessionRowSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: Number(process.env.IMPORT_SESSION_TTL_SECONDS || 86400),
    name: 'ttl_importSessionRows_createdAt'
  }
);

ImportSessionRowSchema.pre('save', function updateTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.ImportSessionRow ||
  mongoose.model('ImportSessionRow', ImportSessionRowSchema, 'import_session_rows');
