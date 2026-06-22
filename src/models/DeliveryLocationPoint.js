'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DeliveryLocationPoint', 'deliveryLocationPoints', {
  id: String,
  sessionId: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  userId: String,
  date: String,
  lat: Number,
  lng: Number,
  accuracy: Number,
  speed: Number,
  heading: Number,
  altitude: Number,
  capturedAt: String,
  clientTs: String,
  source: String,
  orderCode: String,
  customerCode: String,
  customerName: String,
  eventType: String,
  createdAt: String
});
