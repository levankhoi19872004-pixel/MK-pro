'use strict';

const DeliveryRouteSession = require('../models/DeliveryRouteSession');
const DeliveryLocationPoint = require('../models/DeliveryLocationPoint');
const dateUtil = require('../utils/date.util');
const { makeId, toNumber } = require('../utils/common.util');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function trackingEnabled() {
  return String(process.env.DELIVERY_ROUTE_TRACKING_ENABLED || 'true').toLowerCase() !== 'false';
}

function minDistanceM() {
  return Math.max(0, toNumber(process.env.DELIVERY_ROUTE_TRACKING_MIN_DISTANCE_M || 50));
}

function maxAccuracyM() {
  return Math.max(1, toNumber(process.env.DELIVERY_ROUTE_TRACKING_MAX_ACCURACY_M || 200));
}

function actorCode(user = {}) {
  return text(user.deliveryStaffCode || user.staffCode || user.code || user.employeeCode || user.id);
}

function actorName(user = {}) {
  return text(user.deliveryStaffName || user.fullName || user.name || user.username || actorCode(user));
}

function actorId(user = {}) {
  return text(user.id || user._id || user.userId || user.username || actorCode(user));
}

function isDelivery(user = {}) {
  return lower(user.role) === 'delivery';
}

function isAdminLike(user = {}) {
  return ['admin', 'manager', 'accountant'].includes(lower(user.role));
}

function assertTrackingEnabled() {
  if (trackingEnabled()) return;
  const err = new Error('Tính năng theo dõi tuyến giao hàng chưa được bật');
  err.status = 403;
  err.code = 'DELIVERY_ROUTE_TRACKING_DISABLED';
  throw err;
}

function assertDeliveryActor(user = {}) {
  const code = actorCode(user);
  if (!code) {
    const err = new Error('Không xác định được mã NVGH để ghi nhận tuyến');
    err.status = 403;
    err.code = 'DELIVERY_ROUTE_NO_STAFF_CODE';
    throw err;
  }
  return { code, name: actorName(user), userId: actorId(user) };
}

function asDateOnly(value) {
  return dateUtil.toDateOnly(value || dateUtil.todayVN(), dateUtil.todayVN());
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePoint(body = {}) {
  const lat = numberOrNull(body.lat ?? body.latitude);
  const lng = numberOrNull(body.lng ?? body.longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const err = new Error('Tọa độ GPS không hợp lệ');
    err.status = 400;
    err.code = 'DELIVERY_ROUTE_INVALID_COORDINATES';
    throw err;
  }
  return {
    lat,
    lng,
    accuracy: numberOrNull(body.accuracy),
    speed: numberOrNull(body.speed),
    heading: numberOrNull(body.heading),
    altitude: numberOrNull(body.altitude),
    clientTs: text(body.clientTs || body.timestamp || ''),
    orderCode: text(body.orderCode || body.salesOrderCode || ''),
    customerCode: text(body.customerCode || ''),
    customerName: text(body.customerName || '')
  };
}

function requirePoint(body = {}) {
  const point = parsePoint(body);
  if (!point) {
    const err = new Error('Thiếu lat/lng để ghi nhận vị trí');
    err.status = 400;
    err.code = 'DELIVERY_ROUTE_MISSING_LAT_LNG';
    throw err;
  }
  return point;
}

function haversineKm(a = {}, b = {}) {
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function distanceM(a, b) {
  return haversineKm(a, b) * 1000;
}

function cleanDoc(doc) {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (raw._id && !raw.id) raw.id = String(raw._id);
  delete raw._id;
  delete raw.__v;
  return raw;
}

async function findActiveSession(staffCode, date) {
  return DeliveryRouteSession.findOne({ deliveryStaffCode: staffCode, date, status: 'active' }).sort({ startedAt: -1 }).lean();
}

async function countPoints(sessionId) {
  return DeliveryLocationPoint.countDocuments({ sessionId });
}

async function lastPoint(sessionId) {
  return DeliveryLocationPoint.findOne({ sessionId }).sort({ capturedAt: -1 }).lean();
}

async function createPoint(session, actor, point, eventType) {
  if (!point) return null;
  const capturedAt = nowIso();
  const doc = await DeliveryLocationPoint.create({
    id: makeId('DLP'),
    sessionId: session.sessionId,
    deliveryStaffCode: actor.code,
    deliveryStaffName: actor.name,
    userId: actor.userId,
    date: session.date,
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy,
    speed: point.speed,
    heading: point.heading,
    altitude: point.altitude,
    capturedAt,
    clientTs: point.clientTs || capturedAt,
    source: 'mobile_delivery_app',
    orderCode: point.orderCode || '',
    customerCode: point.customerCode || '',
    customerName: point.customerName || '',
    eventType: eventType || 'periodic',
    createdAt: capturedAt
  });
  return cleanDoc(doc);
}

async function updateSessionAfterPoint(session, pointDoc) {
  if (!pointDoc) return cleanDoc(session);
  const previous = session.lastLat != null && session.lastLng != null ? { lat: session.lastLat, lng: session.lastLng } : null;
  const deltaKm = previous ? haversineKm(previous, pointDoc) : 0;
  const pointCount = Number(session.pointCount || 0) + 1;
  const distanceKm = Math.max(0, Number(session.distanceKm || 0) + deltaKm);
  const update = {
    pointCount,
    distanceKm,
    lastLat: pointDoc.lat,
    lastLng: pointDoc.lng,
    lastSeenAt: pointDoc.capturedAt,
    updatedAt: nowIso()
  };
  if (session.startLat == null || session.startLng == null) {
    update.startLat = pointDoc.lat;
    update.startLng = pointDoc.lng;
  }
  const updated = await DeliveryRouteSession.findOneAndUpdate({ sessionId: session.sessionId }, { $set: update }, { new: true }).lean();
  return updated || { ...session, ...update };
}

async function startMobileSession({ body = {}, mobileUser = {} } = {}) {
  assertTrackingEnabled();
  const actor = assertDeliveryActor(mobileUser);
  const date = asDateOnly(body.date);
  const existing = await findActiveSession(actor.code, date);
  if (existing) {
    const point = parsePoint(body);
    let pointDoc = null;
    if (point) pointDoc = await createPoint(existing, actor, point, 'start');
    const session = pointDoc ? await updateSessionAfterPoint(existing, pointDoc) : existing;
    return { ok: true, success: true, message: 'Đã có phiên tuyến giao hàng đang chạy', data: { session: cleanDoc(session), reused: true, point: pointDoc } };
  }
  const startedAt = nowIso();
  const sessionId = makeId('DRS');
  const session = await DeliveryRouteSession.create({
    id: sessionId,
    sessionId,
    code: sessionId,
    deliveryStaffCode: actor.code,
    deliveryStaffName: actor.name,
    userId: actor.userId,
    date,
    status: 'active',
    startedAt,
    pointCount: 0,
    distanceKm: 0,
    createdAt: startedAt,
    updatedAt: startedAt
  });
  const cleanSession = cleanDoc(session);
  const point = parsePoint(body);
  let pointDoc = null;
  let updatedSession = cleanSession;
  if (point) {
    pointDoc = await createPoint(cleanSession, actor, point, 'start');
    updatedSession = await updateSessionAfterPoint(cleanSession, pointDoc);
  }
  return { ok: true, success: true, message: 'Đã bắt đầu ghi nhận tuyến giao hàng', data: { session: cleanDoc(updatedSession), point: pointDoc } };
}

async function pingMobileLocation({ body = {}, mobileUser = {} } = {}) {
  assertTrackingEnabled();
  const actor = assertDeliveryActor(mobileUser);
  const date = asDateOnly(body.date);
  const point = requirePoint(body);
  let session = null;
  const sessionId = text(body.sessionId);
  if (sessionId) session = await DeliveryRouteSession.findOne({ sessionId, deliveryStaffCode: actor.code, status: 'active' }).lean();
  if (!session) session = await findActiveSession(actor.code, date);
  if (!session) {
    const err = new Error('Chưa bắt đầu phiên tuyến giao hàng');
    err.status = 409;
    err.code = 'DELIVERY_ROUTE_NO_ACTIVE_SESSION';
    throw err;
  }

  const last = await lastPoint(session.sessionId);
  const accuracy = point.accuracy == null ? null : Number(point.accuracy);
  if (last && accuracy != null && accuracy > maxAccuracyM()) {
    return { ok: true, success: true, message: 'Bỏ qua điểm GPS do sai số quá lớn', data: { skipped: true, reason: 'accuracy', session: cleanDoc(session) } };
  }
  if (last && distanceM(last, point) < minDistanceM()) {
    return { ok: true, success: true, message: 'Bỏ qua điểm GPS do chưa di chuyển đủ xa', data: { skipped: true, reason: 'distance', session: cleanDoc(session) } };
  }
  const pointDoc = await createPoint(session, actor, point, text(body.eventType) || 'periodic');
  const updated = await updateSessionAfterPoint(session, pointDoc);
  return { ok: true, success: true, message: 'Đã ghi nhận vị trí giao hàng', data: { session: cleanDoc(updated), point: pointDoc, skipped: false } };
}

async function stopMobileSession({ body = {}, mobileUser = {} } = {}) {
  assertTrackingEnabled();
  const actor = assertDeliveryActor(mobileUser);
  const date = asDateOnly(body.date);
  let session = null;
  const sessionId = text(body.sessionId);
  if (sessionId) session = await DeliveryRouteSession.findOne({ sessionId, deliveryStaffCode: actor.code, status: 'active' }).lean();
  if (!session) session = await findActiveSession(actor.code, date);
  if (!session) {
    const err = new Error('Không có phiên tuyến giao hàng đang chạy');
    err.status = 404;
    err.code = 'DELIVERY_ROUTE_NO_ACTIVE_SESSION';
    throw err;
  }
  const point = parsePoint(body);
  let pointDoc = null;
  let updated = session;
  if (point) {
    pointDoc = await createPoint(session, actor, point, 'stop');
    updated = await updateSessionAfterPoint(session, pointDoc);
  }
  const endedAt = nowIso();
  const finalSession = await DeliveryRouteSession.findOneAndUpdate({ sessionId: session.sessionId, deliveryStaffCode: actor.code }, {
    $set: {
      status: 'ended',
      endedAt,
      endLat: pointDoc ? pointDoc.lat : updated.lastLat,
      endLng: pointDoc ? pointDoc.lng : updated.lastLng,
      updatedAt: endedAt
    }
  }, { new: true }).lean();
  return { ok: true, success: true, message: 'Đã kết thúc ghi nhận tuyến giao hàng', data: { session: cleanDoc(finalSession), point: pointDoc } };
}

async function currentMobileSession({ query = {}, mobileUser = {} } = {}) {
  assertTrackingEnabled();
  const actor = assertDeliveryActor(mobileUser);
  const date = asDateOnly(query.date);
  const session = await findActiveSession(actor.code, date);
  return { ok: true, success: true, message: session ? 'Đang có phiên tuyến giao hàng' : 'Chưa bắt đầu tuyến giao hàng', data: { session: cleanDoc(session), active: !!session } };
}

function adminFilterFrom(query = {}, user = {}) {
  const role = lower(user.role);
  const date = asDateOnly(query.date);
  const filter = { date };
  if (role === 'delivery') filter.deliveryStaffCode = actorCode(user);
  else if (text(query.deliveryStaffCode)) filter.deliveryStaffCode = text(query.deliveryStaffCode);
  return filter;
}

async function listRoutesAdmin({ query = {}, user = {} } = {}) {
  if (!isAdminLike(user) && !isDelivery(user)) {
    const err = new Error('Bạn không có quyền xem tuyến giao hàng');
    err.status = 403;
    throw err;
  }
  const filter = adminFilterFrom(query, user);
  const sessions = await DeliveryRouteSession.find(filter).sort({ deliveryStaffCode: 1, startedAt: -1 }).limit(200).lean();
  return { ok: true, success: true, message: 'Đã tải danh sách tuyến giao hàng', data: { date: filter.date, sessions: sessions.map(cleanDoc), total: sessions.length } };
}

async function getRouteAdmin({ params = {}, user = {} } = {}) {
  if (!isAdminLike(user) && !isDelivery(user)) {
    const err = new Error('Bạn không có quyền xem tuyến giao hàng');
    err.status = 403;
    throw err;
  }
  const sessionId = text(params.sessionId || params.id);
  const filter = { sessionId };
  if (isDelivery(user)) filter.deliveryStaffCode = actorCode(user);
  const session = await DeliveryRouteSession.findOne(filter).lean();
  if (!session) {
    const err = new Error('Không tìm thấy tuyến giao hàng');
    err.status = 404;
    throw err;
  }
  const points = await DeliveryLocationPoint.find({ sessionId }).sort({ capturedAt: 1 }).limit(2000).lean();
  return { ok: true, success: true, message: 'Đã tải chi tiết tuyến giao hàng', data: { session: cleanDoc(session), points: points.map(cleanDoc), totalPoints: points.length } };
}

async function liveRoutesAdmin({ query = {}, user = {} } = {}) {
  if (!isAdminLike(user) && !isDelivery(user)) {
    const err = new Error('Bạn không có quyền xem tuyến giao hàng');
    err.status = 403;
    throw err;
  }
  const filter = adminFilterFrom(query, user);
  filter.status = 'active';
  const sessions = await DeliveryRouteSession.find(filter).sort({ deliveryStaffCode: 1 }).limit(100).lean();
  return { ok: true, success: true, message: 'Đã tải tuyến giao hàng đang chạy', data: { date: filter.date, sessions: sessions.map(cleanDoc), total: sessions.length } };
}

async function recordEventIfPossible({ mobileUser = {}, body = {}, eventType = 'periodic' } = {}) {
  try {
    const point = parsePoint(body || {});
    if (!point) return { skipped: true, reason: 'missing_point' };
    const ping = await pingMobileLocation({ body: { ...body, eventType }, mobileUser });
    return ping.data || { skipped: false };
  } catch (err) {
    return { skipped: true, reason: err.code || err.message || 'gps_error' };
  }
}

module.exports = {
  startMobileSession,
  pingMobileLocation,
  stopMobileSession,
  currentMobileSession,
  listRoutesAdmin,
  getRouteAdmin,
  liveRoutesAdmin,
  recordEventIfPossible,
  _private: { parsePoint, haversineKm, minDistanceM, maxAccuracyM, actorCode }
};
