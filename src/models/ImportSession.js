const mongoose = require('mongoose');

const importSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, trim: true },
  type: { type: String, default: '', trim: true },
  fileNames: { type: [String], default: [] },
  rows: { type: Array, default: [] },
  rawRows: { type: Array, default: [] },
  summary: { type: Object, default: {} },
  status: { type: String, default: 'preview', trim: true },
  createdBy: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { strict: false, versionKey: false });

importSessionSchema.index({ sessionId: 1 }, { unique: true, sparse: true });
importSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: Number(process.env.IMPORT_SESSION_TTL_SECONDS || 3600) });

module.exports = mongoose.models.ImportSession || mongoose.model('ImportSession', importSessionSchema, 'import_sessions');
