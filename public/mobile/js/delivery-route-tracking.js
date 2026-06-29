(function () {
  'use strict';

  var stopTimer = null;
  var activeSessionId = '';
  var rootEl = null;

  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) { return res.json().catch(function () { return {}; }); });
  }

  function setStatus(text) {
    if (rootEl) rootEl.innerHTML = '<small>' + String(text || '') + '</small>';
  }

  function currentPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation || !navigator.geolocation.getCurrentPosition) {
        reject(new Error('Thiết bị không hỗ trợ GPS'));
        return;
      }
      navigator.geolocation.getCurrentPosition(function (pos) {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      }, reject, { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 });
    });
  }

  async function start() {
    var point = await currentPosition();
    var result = await api('/api/mobile/delivery/location/session/start', point);
    activeSessionId = result.sessionId || result.data?.sessionId || activeSessionId;
    setStatus('Đang theo dõi tuyến giao');
    if (stopTimer) clearInterval(stopTimer);
    stopTimer = setInterval(function () { ping({ silent: true }); }, 60000);
    return result;
  }

  async function ping(options) {
    options = options || {};
    if (!activeSessionId && options.silent) return null;
    try {
      var point = await currentPosition();
      return await api('/api/mobile/delivery/location/ping', { sessionId: activeSessionId, ...point });
    } catch (err) {
      if (!options.silent) setStatus(err.message || 'Không lấy được vị trí');
      return null;
    }
  }

  async function stop() {
    if (stopTimer) clearInterval(stopTimer);
    stopTimer = null;
    var sessionId = activeSessionId;
    activeSessionId = '';
    setStatus('Đã dừng theo dõi tuyến');
    if (!sessionId) return null;
    return api('/api/mobile/delivery/location/session/stop', { sessionId: sessionId });
  }

  function pingEvent(eventType) {
    void eventType;
    return ping({ silent: true });
  }

  function init(options) {
    options = options || {};
    rootEl = document.getElementById(options.rootId || 'mRouteTracking');
    if (!rootEl) return;
    rootEl.innerHTML = '<button type="button" data-route-start>Bắt đầu theo dõi tuyến</button><button type="button" data-route-stop>Dừng</button>';
    rootEl.addEventListener('click', function (event) {
      if (event.target && event.target.matches('[data-route-start]')) start().catch(function (err) { setStatus(err.message); });
      if (event.target && event.target.matches('[data-route-stop]')) stop().catch(function (err) { setStatus(err.message); });
    });
  }

  window.DeliveryRouteTracking = {
    init: init,
    start: start,
    ping: ping,
    pingEvent: pingEvent,
    stop: stop,
    stopTimer: stopTimer,
    current: currentPosition
  };
}());
