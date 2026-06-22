'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DeliveryRouteSession', 'deliveryRouteSessions', {
  id: String,
  sessionId: String,
  code: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  userId: String,
  date: String,
  status: String, // active | ended
  startedAt: String,
  endedAt: String,
  startLat: Number,
  startLng: Number,
  endLat: Number,
  endLng: Number,
  pointCount: Number,
  distanceKm: Number,
  lastLat: Number,
  lastLng: Number,
  lastSeenAt: String,
  createdAt: String,
  updatedAt: String
});
