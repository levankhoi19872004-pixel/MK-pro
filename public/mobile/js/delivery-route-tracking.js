(function () {
  'use strict';

  var state = { active: false, loading: false, error: '', session: null, pointCount: 0, timerId: null };
  var cfg = { rootId: 'mRouteTracking', getDate: function () { return ''; }, getOrder: function () { return null; }, msg: function () {} };

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function el(id) { return document.getElementById(id); }
  function root() { return el(cfg.rootId); }
  function api(path, options) { return window.DeliveryCore.api(path, options || {}); }

  function position() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation || !navigator.geolocation.getCurrentPosition) return reject(new Error('Thiết bị chưa cấp quyền hoặc không hỗ trợ GPS'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 });
    });
  }

  function payload(pos, extra) {
    var c = pos && pos.coords ? pos.coords : {};
    return Object.assign({ date: cfg.getDate(), lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, speed: c.speed, heading: c.heading, altitude: c.altitude, clientTs: pos && pos.timestamp ? new Date(pos.timestamp).toISOString() : new Date().toISOString() }, extra || {});
  }

  function stopTimer() { if (state.timerId) clearInterval(state.timerId); state.timerId = null; }
  function startTimer() { stopTimer(); state.timerId = setInterval(function () { ping({ silent: true }); }, 60000); }

  function render() {
    var node = root();
    if (!node) return;
    if (state.loading) { node.innerHTML = '<div class="m-route-tracking-card loading"><span>Tuyến giao: Đang xử lý GPS...</span></div>'; return; }
    if (state.active) {
      var session = state.session || {};
      node.innerHTML = '<div class="m-route-tracking-card active"><span>Đang ghi nhận tuyến giao hàng · ' + esc(session.pointCount || state.pointCount || 0) + ' điểm' + (session.lastSeenAt ? ' · Cập nhật ' + esc(String(session.lastSeenAt).slice(11, 16)) : '') + '</span><button type="button" data-route-tracking="stop">Kết thúc</button></div>';
      return;
    }
    node.innerHTML = '<div class="m-route-tracking-card idle"><span>Tuyến giao: Chưa bắt đầu</span><button type="button" data-route-tracking="start">Bắt đầu giao</button>' + (state.error ? '<button type="button" class="secondary" data-route-tracking="retry">Thử GPS</button>' : '') + '</div>' + (state.error ? '<small class="m-route-tracking-error">' + esc(state.error) + '</small>' : '');
  }

  async function current() {
    try {
      var json = await api('/api/mobile/delivery/location/session/current?date=' + encodeURIComponent(cfg.getDate()));
      var data = json.data || {};
      state.session = data.session || null;
      state.active = !!data.active;
      if (state.active) startTimer(); else stopTimer();
    } catch (err) { state.error = err.message || 'Không tải được trạng thái tuyến giao'; }
    render();
  }

  async function start() {
    state.loading = true; state.error = ''; render();
    try {
      var pos = await position();
      var json = await api('/api/mobile/delivery/location/session/start', { method: 'POST', body: JSON.stringify(payload(pos)) });
      state.session = json.data && json.data.session; state.active = true; startTimer(); cfg.msg('Đang ghi nhận tuyến giao hàng');
    } catch (err) { state.error = err.message || 'Không lấy được vị trí. Kiểm tra quyền vị trí/GPS.'; cfg.msg(state.error, true); }
    state.loading = false; render();
  }

  async function ping(options) {
    options = options || {};
    if (!state.active && !options.force) return;
    try {
      var pos = await position();
      var order = cfg.getOrder() || {};
      var json = await api('/api/mobile/delivery/location/ping', { method: 'POST', body: JSON.stringify(payload(pos, { sessionId: state.session && state.session.sessionId, orderCode: order.orderCode || order.salesOrderCode || order.code || '', customerCode: order.customerCode || '', customerName: order.customerName || '', eventType: options.eventType || 'periodic' })) });
      state.session = (json.data && json.data.session) || state.session; state.active = !!state.session && String(state.session.status || 'active') === 'active'; state.error = '';
    } catch (err) { state.error = err.message || 'Không ghi nhận được vị trí GPS'; if (!options.silent) cfg.msg(state.error, true); }
    render();
  }

  async function stop() {
    state.loading = true; render();
    try {
      var pos = null;
      try { pos = await position(); } catch (_) { pos = null; }
      var json = await api('/api/mobile/delivery/location/session/stop', { method: 'POST', body: JSON.stringify(pos ? payload(pos, { sessionId: state.session && state.session.sessionId }) : { sessionId: state.session && state.session.sessionId, date: cfg.getDate() }) });
      state.session = json.data && json.data.session; state.active = false; stopTimer(); cfg.msg('Đã kết thúc ghi nhận tuyến giao hàng');
    } catch (err) { state.error = err.message || 'Không kết thúc được tuyến giao hàng'; cfg.msg(state.error, true); }
    state.loading = false; render();
  }

  function init(options) {
    cfg = Object.assign(cfg, options || {});
    var node = root();
    if (!node || node.dataset.routeTrackingBound === '1') return;
    node.dataset.routeTrackingBound = '1';
    node.addEventListener('click', function (event) {
      var action = event.target && event.target.getAttribute ? event.target.getAttribute('data-route-tracking') : '';
      if (!action) return;
      event.preventDefault();
      if (action === 'start') start();
      if (action === 'stop') stop();
      if (action === 'retry') ping({ force: true });
    });
    render(); current();
  }

  window.DeliveryRouteTracking = { init: init, pingEvent: function (eventType) { return ping({ eventType: eventType, silent: true }); }, stopTimer: stopTimer, current: current };
}());
