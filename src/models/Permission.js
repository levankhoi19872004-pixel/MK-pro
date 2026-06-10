const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  roleCode: { type: String, required: true, trim: true, index: true },
  module: { type: String, required: true, trim: true, index: true },
  view: { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
  approve: { type: Boolean, default: false },
  export: { type: Boolean, default: false }
}, { timestamps: true, strict: false, versionKey: false });

permissionSchema.index({ roleCode: 1, module: 1 }, { unique: true });

module.exports = mongoose.models.Permission || mongoose.model('Permission', permissionSchema, 'permissions');
