'use strict';

const notificationService = require('../services/events/notificationService');

async function summary(req, res) {
  try {
    const result = await notificationService.summary(req.user || {}, req.query || {});
    return res.json({ ok: true, source: 'notification-center', ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không tải được thông báo', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function list(req, res) {
  try {
    const result = await notificationService.list(req.user || {}, req.query || {});
    return res.json({ ok: true, source: 'notification-center', ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không tải được danh sách thông báo', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function detail(req, res) {
  try {
    const result = await notificationService.detail(req.user || {}, req.params.id || '');
    if (!result) return res.status(404).json({ ok: false, message: 'Không tìm thấy thông báo' });
    return res.json({ ok: true, source: 'notification-center', ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không tải được chi tiết thông báo', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function markRead(req, res) {
  try {
    const notification = await notificationService.markRead(req.user || {}, req.params.id || '');
    if (!notification) return res.status(404).json({ ok: false, message: 'Không tìm thấy thông báo của bạn' });
    return res.json({ ok: true, source: 'notification-center', notification });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không đánh dấu đã đọc được', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function markAllRead(req, res) {
  try {
    const result = await notificationService.markAllRead(req.user || {}, req.body || req.query || {});
    return res.json({ ok: true, source: 'notification-center', ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không đánh dấu tất cả đã đọc được', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

module.exports = { summary, list, detail, markRead, markAllRead };
