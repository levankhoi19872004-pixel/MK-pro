'use strict';
// V46 canonical delivery: old web delivery logic removed.
// Web UI now delegates to public/js/delivery/delivery-core.js + delivery-web-view.js.
window.loadDeliveryTodayOrders = function () { return window.DeliveryWebView && window.DeliveryWebView.load ? window.DeliveryWebView.load() : null; };
window.loadDeliveryToday = window.loadDeliveryTodayOrders;
window.submitDeliveryEdit = function (event) { if (event && event.preventDefault) event.preventDefault(); alert('Màn giao hàng đã chuyển sang lõi chung. Vui lòng dùng giao diện Đơn đi giao hôm nay mới.'); };
window.clearDeliveryEditPanel = function () {};
window.recalcDeliveryEditDebt = function () {};
window.renderDeliveryEditPanel = function () {};
window.selectDeliveryOrder = function (key) { return window.DeliveryWebView && window.DeliveryWebView.select ? window.DeliveryWebView.select(key) : null; };
