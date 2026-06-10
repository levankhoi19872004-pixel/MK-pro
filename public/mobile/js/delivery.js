'use strict';
// V46 canonical delivery: old mobile delivery logic removed.
// Mobile UI now delegates to delivery-core.js + delivery-mobile-view.js.
window.loadDeliveryOrders = function () { return window.DeliveryMobileView && window.DeliveryMobileView.load ? window.DeliveryMobileView.load() : null; };
