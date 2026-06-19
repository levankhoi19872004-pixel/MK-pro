'use strict';

const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema({
  userId: { type: String, default: '' },
  username: { type: String, default: '' },
  name: { type: String, default: '' }
}, { _id: false });

const salesTargetSchema = new mongoose.Schema({
  period: {
    type: String,
    required: true,
    match: /^\d{4}-(0[1-9]|1[0-2])$/,
    trim: true
  },
  salesStaffCode: {
    type: String,
    required: true,
    trim: true
  },
  salesStaffName: {
    type: String,
    default: '',
    trim: true
  },
  targetAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  note: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  createdBy: { type: actorSchema, default: () => ({}) },
  updatedBy: { type: actorSchema, default: () => ({}) }
}, {
  collection: 'salesTargets',
  timestamps: true,
  versionKey: false
});

module.exports = mongoose.models.SalesTarget || mongoose.model('SalesTarget', salesTargetSchema);
