(function () {
  'use strict';

  // Delivery GPS/route tracking is intentionally disabled for the current mobile delivery app.
  // Keep the public API as no-op methods so existing workflow hooks remain safe.
  function noop() {}

  window.DeliveryRouteTracking = {
    init: noop,
    pingEvent: noop,
    stopTimer: noop,
    current: noop
  };
}());
