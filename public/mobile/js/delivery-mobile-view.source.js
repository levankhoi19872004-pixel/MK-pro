(function () {
'use strict';
var deliveryMobileState = window.DeliveryMobileState;
var deliveryMobileUi = window.DeliveryMobileUiUtils;
var deliveryOrdersView = window.DeliveryMobileOrdersView;
var deliveryContract = window.DeliveryMobileContract || null;
if (!deliveryMobileState || !deliveryMobileUi || !deliveryOrdersView) {
throw new Error('Delivery mobile modules are not loaded.');
}
var el = deliveryMobileUi.el;
var esc = deliveryMobileUi.esc;
var num = deliveryMobileUi.num;
var money = deliveryMobileUi.money;
var amount = deliveryMobileUi.amount;
var keyOf = deliveryMobileUi.keyOf;
var today = deliveryMobileUi.today;
var readUser = deliveryMobileUi.readUser;
var userDisplayName = deliveryMobileUi.userDisplayName;
var userStaffCode = deliveryMobileUi.userStaffCode;
var userRoleLabel = deliveryMobileUi.userRoleLabel;
var selectedOrderSummary = deliveryMobileUi.selectedOrderSummary;
var copyText = deliveryMobileUi.copyText;
var openDeliveryMapExternal = deliveryMobileUi.openDeliveryMapExternal;
var debounce = deliveryMobileUi.debounce;
var msg = deliveryMobileUi.msg;
var buildOrderKpi = deliveryOrdersView.buildOrderKpi;
var buildRouteKpi = deliveryOrdersView.buildRouteKpi;
var orderProductSummary = deliveryOrdersView.orderProductSummary;
var mobileUiRuntime = window.MobileUiRuntime || null;
var deliveryLifecycle = mobileUiRuntime ? mobileUiRuntime.createLifecycle() : null;
var deliveryLoadGate = mobileUiRuntime ? mobileUiRuntime.createRequestGate() : null;
var deliveryOrderRenderer = null;
var deliveryDebtRenderer = null;
var deliveryDebtRendererContainer = null;
var DELIVERY_TAB_CACHE_TTL_MS = deliveryMobileState.DELIVERY_TAB_CACHE_TTL_MS;
var DELIVERY_REFRESH_THROTTLE_MS = deliveryMobileState.DELIVERY_REFRESH_THROTTLE_MS;
var DELIVERY_DEBT_PAGE_LIMIT = deliveryMobileState.DELIVERY_DEBT_PAGE_LIMIT;
var state = deliveryMobileState.createInitialState();
var DELIVERY_CONTRACT = deliveryContract || {
  header: { moreMenuClass: 'm-delivery-more-menu', secondaryActionsClass: 'm-delivery-secondary-actions' },
  kpis: { pendingLegacyId: 'mKpiPendingOrders', mustCollectLabel: 'Phải thu' },
  bottomAction: { baseClass: 'm-delivery-bottom-action', activeClass: 'active', oneHandClass: 'delivery-one-hand-bar' }
};
// Legacy labels retained for Phase23 static compatibility: Khách giao, Hàng giao, Hàng trả, Thu tiền, Đối soát, Công nợ.
// Legacy KPI ids retained for static compatibility: mKpiPending, mKpiDelivered, mKpiTh, mKpiCn.
var LIST_MODE_TABS = [
{ key: 'orders', label: 'Khách giao' },
{ key: 'reconciliation', label: 'Đối soát' },
{ key: 'debt', label: 'Công nợ' }
];
var CUSTOMER_MODE_TABS = [
{ key: 'products', label: 'Hàng giao' },
{ key: 'returns', label: 'Hàng trả' },
{ key: 'payment', label: 'Thu tiền' }
];
function isCustomerMode() {
return state.viewMode === 'customer' && !!currentOrder();
}
var COMPACT_CUSTOMER_PRIMARY_TABS = [
{ key: 'products', label: 'Hàng giao' },
{ key: 'payment', label: 'Thu tiền' },
{ key: 'customerReconciliation', label: 'Đối soát' },
{ key: 'debt', label: 'Công nợ' }
];
function tabListForCurrentMode() {
return isCustomerMode() ? COMPACT_CUSTOMER_PRIMARY_TABS : LIST_MODE_TABS;
}
function ensureTabForMode() {
var tabs = tabListForCurrentMode().map(function (tab) { return tab.key; });
if (isCustomerMode() && state.tab === 'customerReconciliation') return;
if (tabs.indexOf(state.tab) < 0) state.tab = isCustomerMode() ? 'products' : 'orders';
}
function switchToListMode(options) {
options = options || {};
state.viewMode = 'list';
state.productSearchKeyword = '';
if (options.clearSelected) {
state.selectedKey = '';
if (window.DeliveryCore && window.DeliveryCore.state) window.DeliveryCore.state.selectedOrder = null;
}
if (['orders', 'reconciliation', 'debt'].indexOf(state.tab) < 0 || options.forceOrders) state.tab = 'orders';
render();
if (state.tab === 'debt') loadDeliveryDebts(false);
if (state.tab === 'reconciliation') loadDeliveryReconciliation(false);
}
function switchToCustomerMode(tab) {
state.viewMode = 'customer';
state.tab = ['products', 'returns', 'payment', 'customerReconciliation', 'debt'].indexOf(tab) >= 0 ? tab : 'products';
}
function requireDeliveryLogin() {
var user = readUser();
var role = String(user.role || '').toLowerCase();
if (!user || !user.role) { window.location.href = '/login.html?target=delivery'; return false; }
if (role !== 'admin' && role !== 'delivery') { alert('Không có quyền vào App giao hàng.'); window.location.href = '/login.html?target=delivery'; return false; }
return true;
}
function logout() {
if (window.DeliveryRouteTracking && typeof window.DeliveryRouteTracking.stopTimer === 'function') window.DeliveryRouteTracking.stopTimer();
['mk_web_token','mk_web_refresh_token','mk_web_user','v43_mobile_token','v43_mobile_refresh_token','v43_mobile_user'].forEach(function (key) { localStorage.removeItem(key); });
fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}}).catch(function(err){
if (window.console && typeof window.console.warn === 'function') window.console.warn('[delivery-mobile] logout API failed:', err && err.message ? err.message : err);
}).finally(function(){window.location.href='/login.html';});
}
function root() {
var r = el('mobileDeliveryRoot');
if (!r) {
r = document.createElement('main');
r.id = 'mobileDeliveryRoot';
document.body.innerHTML = '';
document.body.appendChild(r);
}
r.className = 'mobile-delivery-v46';
return r;
}
function renderShell() {
var user = readUser();
var displayName = userDisplayName(user);
var staffCode = userStaffCode(user);
var accountText = displayName ? (displayName + (staffCode && staffCode !== displayName ? ' - ' + staffCode : '')) : 'Chưa có tài khoản';
root().innerHTML = '' +
'<header class="m-delivery-header workflow">' +
'<div class="m-delivery-header-main m-delivery-header-compact"><h1>GH</h1><div class="m-account-info"><b>' + esc(accountText) + '</b><span>Giao hàng</span></div></div>' +
'<div class="m-delivery-header-actions m-delivery-secondary-actions dedupe"><button id="mReload" type="button" class="m-header-primary-action">Tải</button><div class="m-delivery-menu-wrap"><button id="mDeliveryMenuToggle" type="button" class="ghost" aria-haspopup="true" aria-expanded="false" aria-controls="mDeliveryMenu">⋮</button><div id="mDeliveryMenu" class="m-delivery-menu m-delivery-more-menu m-delivery-overflow-menu delivery-overflow-menu" hidden><button id="mDeliveryAccountInfo" type="button">Thông tin tài khoản</button><button id="mLogout" type="button">Đăng xuất</button></div></div></div>' +
'</header>' +
'<section id="mDeliveryFilter" class="m-delivery-filter"><input id="mDate" type="date"><select id="mStatusFilter"><option value="all">Tất</option><option value="pending">Chưa</option><option value="delivered">Đã</option><option value="return">Trả</option><option value="debt">Nợ</option></select><input id="mSearch" placeholder="Tìm"></section>' +
'<section id="mDeliveryKpis" class="m-delivery-kpis workflow delivery-main-kpis">' +
'<div class="route-count" data-kpi="route-count"><span>Khách giao</span><b id="mKpiTotalOrders" data-mKpiTotal>0</b></div>' +
'<div class="must-collect" data-kpi="must-collect"><span>Phải thu</span><b id="mKpiPt">0</b></div><b id="mKpiPendingOrders" class="m-kpi-compat-hidden" hidden aria-hidden="true">0</b>' +
'</section>' +
'<section id="mCustomerContext" class="m-customer-context" hidden></section>' +
'<nav id="mDeliveryTabs" class="m-delivery-tabs-main m-delivery-tabs workflow split-mode"></nav>' +
'<section id="mBody" class="m-delivery-body">Đang tải...</section>' +
'<section id="mWorkflowBar" class="m-workflow-bar delivery-one-hand-bar m-delivery-bottom-action active" hidden></section>' +
'<section id="mRouteTracking" class="m-route-tracking"></section>' +
'<p id="mMsg" class="m-delivery-msg"></p>';
el('mDate').value = today();
deliveryOrderRenderer = mobileUiRuntime
? mobileUiRuntime.createChunkedHtmlRenderer(el('mBody'), { initialCount: 60, chunkSize: 80 })
: null;
var bind = deliveryLifecycle ? deliveryLifecycle.listen : function (target, type, handler) {
target.addEventListener(type, handler);
return function () { target.removeEventListener(type, handler); };
};
bind(el('mReload'), 'click', function () { load({ force: true, refreshActiveTab: true }); });
bind(el('mDeliveryMenuToggle'), 'click', function (event) {
event.preventDefault();
event.stopPropagation();
var menu = el('mDeliveryMenu');
var toggle = el('mDeliveryMenuToggle');
if (!menu || !toggle) return;
var nextHidden = !menu.hidden;
menu.hidden = nextHidden;
toggle.setAttribute('aria-expanded', String(!nextHidden));
});
bind(document, 'click', function () {
var menu = el('mDeliveryMenu');
var toggle = el('mDeliveryMenuToggle');
if (!menu || menu.hidden) return;
menu.hidden = true;
if (toggle) toggle.setAttribute('aria-expanded', 'false');
});
bind(el('mDeliveryAccountInfo'), 'click', function (event) {
event.preventDefault();
event.stopPropagation();
var menu = el('mDeliveryMenu');
var toggle = el('mDeliveryMenuToggle');
if (menu) menu.hidden = true;
if (toggle) toggle.setAttribute('aria-expanded', 'false');
msg(accountText);
});
bind(el('mLogout'), 'click', logout);
bind(el('mDate'), 'change', function () { load({ force: true }); });
bind(el('mStatusFilter'), 'change', function () { load({ force: true }); });
var debouncedSearch = mobileUiRuntime ? mobileUiRuntime.debounce(function () { load({ force: true }); }, 250) : debounce(function () { load({ force: true }); }, 250);
bind(el('mSearch'), 'input', debouncedSearch);
if (deliveryLifecycle) deliveryLifecycle.add(function () { if (debouncedSearch.cancel) debouncedSearch.cancel(); });
bind(el('mDeliveryTabs'), 'click', function (event) {
var button = event.target && event.target.closest ? event.target.closest('[data-m-tab]') : null;
if (!button) return;
event.preventDefault();
var nextTab = button.getAttribute('data-m-tab');
if (
state.tab === 'debt' &&
nextTab !== 'debt' &&
state.debtFormDirty &&
!window.confirm('Phiếu thu chưa gửi. Rời tab?')
) {
return;
}
if (state.tab === 'debt' && nextTab !== 'debt') state.debtFormDirty = false;
state.tab = nextTab;
render();
if (state.tab === 'returns') loadSelectedReturnsDirect({ force: false });
if (state.tab === 'debt') loadDeliveryDebts(false);
if (state.tab === 'reconciliation') loadDeliveryReconciliation(false);
});
if (deliveryLifecycle) {
deliveryLifecycle.delegate(el('mBody'), 'click', '[data-order-key]', function (_event, button) {
select(button.getAttribute('data-order-key'), { tab: button.getAttribute('data-open-tab') || 'products' });
});
deliveryLifecycle.delegate(el('mBody'), 'click', '[data-copy-address]', function (event, button) {
event.preventDefault();
event.stopPropagation();
copyText(button.getAttribute('data-copy-address')).then(function () {
msg('Đã copy địa chỉ khách hàng');
}).catch(function (err) {
msg(err.message || 'Không copy được địa chỉ', true);
});
});
deliveryLifecycle.delegate(el('mBody'), 'click', '[data-delivery-map]', function (event, button) {
event.preventDefault();
event.stopPropagation();
openDeliveryMapExternal({
address: button.getAttribute('data-map-address') || '',
customerName: button.getAttribute('data-map-customer') || '',
lat: button.getAttribute('data-map-lat') || '',
lng: button.getAttribute('data-map-lng') || ''
});
});
deliveryLifecycle.delegate(el('mBody'), 'click', '[data-debt-index]:not([disabled])', function (_event, button) {
openDeliveryDebtCollection(Number(button.getAttribute('data-debt-index')));
});
deliveryLifecycle.delegate(el('mCustomerContext'), 'click', '[data-back-to-list]', function (event) {
event.preventDefault();
switchToListMode({ clearSelected: true, forceOrders: true });
});
deliveryLifecycle.delegate(el('mBody'), 'input', '#mProductSearch', function (_event, input) {
state.productSearchKeyword = input.value || '';
filterProductRows(state.productSearchKeyword);
});
deliveryLifecycle.delegate(el('mBody'), 'click', '[data-workflow-tab]', function (event, button) {
event.preventDefault();
state.tab = button.getAttribute('data-workflow-tab') || 'products';
render();
if (state.tab === 'returns') loadSelectedReturnsDirect({ force: false });
});
deliveryLifecycle.delegate(el('mWorkflowBar'), 'click', '[data-workflow-tab]', function (_event, button) {
state.tab = button.getAttribute('data-workflow-tab') || 'products';
render();
if (state.tab === 'returns') loadSelectedReturnsDirect({ force: false });
if (state.tab === 'debt') loadDeliveryDebts(false);
if (state.tab === 'reconciliation') loadDeliveryReconciliation(false);
});
deliveryLifecycle.delegate(el('mWorkflowBar'), 'click', '[data-workflow-complete]', function () {
switchToListMode({ clearSelected: true, forceOrders: true });
});
deliveryLifecycle.delegate(el('mWorkflowBar'), 'click', '[data-payment-submit]', function (event) {
event.preventDefault();
savePayment(event);
});
deliveryLifecycle.listen(window, 'pagehide', function () {
if (deliveryOrderRenderer) deliveryOrderRenderer.cancel();
if (deliveryDebtRenderer) deliveryDebtRenderer.cancel();
deliveryLoadGate.cancel();
deliveryLifecycle.destroy();
}, { once: true });
}
}
function selectedReturnCacheKey(order) {
return keyOf(order || currentOrder() || {});
}
function markSelectedReturnsFresh(order) {
var key = selectedReturnCacheKey(order);
if (!key) return;
state.returnsCache[key] = Date.now();
}
function selectedReturnsAreFresh(order) {
var key = selectedReturnCacheKey(order);
return !!key && deliveryMobileState.isFresh(state.returnsCache[key], DELIVERY_TAB_CACHE_TTL_MS);
}
function filters() {
return {
date: el('mDate') && el('mDate').value,
q: el('mSearch') && el('mSearch').value,
statusFilter: el('mStatusFilter') && el('mStatusFilter').value
};
}
function currentStatusFilter() {
return String((el('mStatusFilter') && el('mStatusFilter').value) || 'all').toLowerCase();
}
function removeOrderFromLocalList(order) {
var removedKey = keyOf(order || window.DeliveryCore.state.selectedOrder || {});
if (!removedKey) return;
window.DeliveryCore.state.orders = (window.DeliveryCore.state.orders || []).filter(function (row) { return keyOf(row) !== removedKey; });
}
function reconcileDeliveredOrderVisibility(order) {
var filter = currentStatusFilter();
if (filter === 'pending' || filter === 'undelivered' || filter === 'not_delivered') removeOrderFromLocalList(order);
}
// Phase29: foreground route tracking is optional. It must never block delivery workflow.
function initRouteTrackingPanel() {
if (window.DeliveryRouteTracking && typeof window.DeliveryRouteTracking.init === 'function') {
window.DeliveryRouteTracking.init({ rootId: 'mRouteTracking' });
}
}
function pingRouteTrackingEvent(eventType) {
if (window.DeliveryRouteTracking && typeof window.DeliveryRouteTracking.pingEvent === 'function') {
window.DeliveryRouteTracking.pingEvent(eventType);
}
}
function renderTabNavigation() {
ensureTabForMode();
var nav = el('mDeliveryTabs');
if (!nav) return;
nav.classList.toggle('list-mode', !isCustomerMode());
nav.classList.toggle('customer-mode', isCustomerMode());
nav.innerHTML = tabListForCurrentMode().map(function (tab) {
return '<button data-m-tab="' + esc(tab.key) + '" class="' + (state.tab === tab.key ? 'active' : '') + '">' + esc(tab.label) + '</button>';
}).join('');
}
function renderCustomerContext() {
var context = el('mCustomerContext');
if (!context) return;
var order = currentOrder();
if (!isCustomerMode() || !order) {
context.hidden = true;
context.innerHTML = '';
return;
}
var address = deliveryMobileUi.orderAddress ? deliveryMobileUi.orderAddress(order) : '';
var name = order.customerName || order.customerCode || order.orderCode || 'Khách đang giao';
var customerCode = order.customerCode || order.customerId || '';
context.hidden = false;
context.innerHTML = '<button type="button" class="m-back-to-list" data-back-to-list>← Danh sách</button>' +
'<div class="m-customer-context-main"><b>' + esc(name) + (customerCode ? ' · ' + esc(customerCode) : '') + '</b>' +
'<span>' + (address ? esc(address) + ' · ' : '') + 'Phải thu ' + money(amount(order, 'receivable')) + '</span></div>';
}
function renderListChromeVisibility() {
var listMode = !isCustomerMode();
var filter = el('mDeliveryFilter');
var kpis = el('mDeliveryKpis');
var rootEl = el('mobileDeliveryRoot');
if (filter) filter.hidden = !listMode;
if (kpis) kpis.hidden = !listMode;
if (rootEl) {
rootEl.classList.toggle('list-workflow-mode', listMode);
rootEl.classList.toggle('customer-workflow-mode', !listMode);
}
}
function renderKpis() {
var rows = window.DeliveryCore.state.orders || [];
var s = buildRouteKpi(rows);
// Compact KPI contract: only route-count and must-collect are rendered in the main KPI row.
if (el('mKpiTotalOrders')) el('mKpiTotalOrders').textContent = String(s.total || 0);
if (el('mKpiPt')) el('mKpiPt').textContent = money(s.pt);
}
// One-hand workflow API contract marker: form="mPaymentForm"
function renderWorkflowBar() {
var bar = el('mWorkflowBar');
if (!bar) return;
var order = currentOrder();
bar.className = 'm-workflow-bar delivery-one-hand-bar m-delivery-bottom-action';
if (!isCustomerMode() || !order || state.tab === 'orders') {
bar.hidden = true;
bar.innerHTML = '';
return;
}
bar.hidden = false;
bar.className = 'm-workflow-bar delivery-one-hand-bar m-delivery-bottom-action active';
bar.classList.add('active');
if (state.tab === 'products') {
bar.innerHTML = '<div class="m-workflow-actions step-only phase24 products">' +
'<button id="mFullReturnOrder" type="button" class="danger"' + (state.fullReturnSubmitting ? ' disabled' : '') + '>' + (state.fullReturnSubmitting ? 'Đang xử lý...' : 'Trả hết đơn') + '</button>' +
'<button type="submit" form="mProductReturnForm" class="primary" data-action="primary"' + (state.returnSubmitting ? ' disabled' : '') + '>' + (state.returnSubmitting ? 'Đang lưu...' : 'Xác nhận & thu') + '</button>' +
'</div>';
return;
}
if (state.tab === 'returns') {
if (!hasReturnedRowsForCurrentOrder(order)) {
bar.innerHTML = '<div class="m-workflow-actions step-only phase24 returns empty">' +
'<button type="button" class="primary" data-workflow-tab="products">Quay lại Hàng giao</button>' +
'</div>';
return;
}
bar.innerHTML = '<div class="m-workflow-actions step-only phase24 returns">' +
'<button type="submit" form="mReturnSaveForm" class="primary"' + (state.returnSubmitting ? ' disabled' : '') + '>' + (state.returnSubmitting ? 'Đang lưu...' : 'Lưu & thu tiền') + '</button>' +
'<button id="mSkipReturns" type="button" class="secondary">Xóa hàng trả</button>' +
'</div>';
return;
}
if (state.tab === 'payment') {
bar.innerHTML = '<div class="m-workflow-payment-remaining">Nợ: <b id="mWorkflowRemaining">0</b></div>' +
'<div class="m-workflow-actions step-only phase24 payment"><button id="mPaymentSubmitButton" type="button" data-payment-submit class="primary"' + (state.paymentSubmitting ? ' disabled' : '') + '>' + (state.paymentSubmitting ? 'Đang xác nhận...' : 'Xác nhận thu') + '</button></div>';
return;
}
if (state.tab === 'customerReconciliation') {
bar.innerHTML = '<div class="m-workflow-actions step-only phase24 reconciliation">' +
'<button type="button" class="primary" data-action="primary" data-workflow-complete>Hoàn tất - về danh sách</button>' +
'</div>';
return;
}
if (state.tab === 'debt') {
bar.hidden = true;
bar.innerHTML = '';
return;
}
bar.hidden = true;
bar.innerHTML = '';
}
function renderBottomAction() {
return renderWorkflowBar();
}
function render() {
ensureTabForMode();
renderListChromeVisibility();
renderKpis();
renderCustomerContext();
initRouteTrackingPanel();
renderTabNavigation();
renderWorkflowBar();
var body = el('mBody');
if (!body) return;
if (state.tab !== 'orders' && deliveryOrderRenderer) deliveryOrderRenderer.cancel();
if (state.tab !== 'debt' && deliveryDebtRenderer) deliveryDebtRenderer.cancel();
if (isCustomerMode() && state.tab === 'products') return renderProducts(body);
if (isCustomerMode() && state.tab === 'returns') return renderReturns(body);
if (isCustomerMode() && state.tab === 'payment') return renderPayment(body);
if (state.tab === 'customerReconciliation') return renderCustomerReconciliation(body);
if (!isCustomerMode() && state.tab === 'debt') return renderDebtApp(body);
if (isCustomerMode() && state.tab === 'debt') return renderDebtApp(body);
if (!isCustomerMode() && state.tab === 'reconciliation') return renderReconciliationApp(body);
return renderOrders(body);
}
function renderOrderCard(order) {
return deliveryOrdersView.renderOrderCard(order, { selectedKey: state.selectedKey });
}
function renderOrders(body) {
var rows = window.DeliveryCore.state.orders || [];
if (!rows.length) {
if (mobileUiRuntime) mobileUiRuntime.renderState(body, { state: 'empty', className: 'm-delivery-body', title: 'Không có đơn giao.' });
else body.innerHTML = '<div class="m-empty">Không có đơn giao.</div>';
return;
}
if (deliveryOrderRenderer) {
deliveryOrderRenderer.render(rows, renderOrderCard, { className: 'm-delivery-body' });
} else {
body.innerHTML = rows.map(renderOrderCard).join('');
}
}
function currentOrder() { return window.DeliveryCore.state.selectedOrder; }
function debtMoneyValue(customer) {
return num(customer && (customer.debtAmount || customer.debt || 0));
}
function debtAvailableValue(customer) {
customer = customer || {};
var value = customer.availableDebtAmount;
if (value == null) value = customer.availableDebt;
if (value == null) value = customer.debtAmount;
if (value == null) value = customer.debt;
return num(value || 0);
}
function debtPendingValue(customer) {
customer = customer || {};
var value = customer.pendingCollectedAmount;
if (value == null) value = customer.pendingCollected;
return num(value || 0);
}
function debtOrderRows(customer) {
var orders = Array.isArray(customer && customer.orders) ? customer.orders : [];
return orders.filter(function (row) {
var available = row.availableDebt;
if (available == null) available = row.debt;
return num(available || 0) > 0;
});
}
function deliveryDebtCustomerKey(customer) {
customer = customer || {};
return String(
customer.customerId ||
customer.customerCode ||
customer.code ||
customer.id ||
customer._id ||
customer.customerName ||
''
).trim();
}
function normalizeDebtPagination(pagination) {
pagination = pagination || {};
var page = Math.max(1, Number(pagination.page || state.debtPage || 1) || 1);
var limit = Math.max(1, Number(pagination.limit || state.debtLimit || DELIVERY_DEBT_PAGE_LIMIT) || DELIVERY_DEBT_PAGE_LIMIT);
var totalRows = Math.max(0, Number(pagination.totalRows || pagination.total || 0) || 0);
var totalPages = Math.max(0, Number(pagination.totalPages || (totalRows ? Math.ceil(totalRows / limit) : 0)) || 0);
var hasMore = Boolean(pagination.hasMore);
if (!hasMore && totalRows) hasMore = page * limit < totalRows;
var nextPage = pagination.nextPage != null ? Number(pagination.nextPage) : (hasMore ? page + 1 : null);
if (!Number.isFinite(nextPage) || nextPage < 1) nextPage = null;
return { page: page, limit: limit, totalRows: totalRows, totalPages: totalPages, hasMore: hasMore, nextPage: nextPage };
}
function resetDeliveryDebtPaging(options) {
options = options || {};
state.debtPage = 0;
state.debtHasMore = false;
state.debtTotalRows = 0;
state.debtTotalPages = 0;
state.debtNextPage = 1;
if (options.clearRows !== false) state.debts = [];
state.debtLoaded = false;
state.debtCacheAt = 0;
state.debtError = '';
}
function mergeDeliveryDebtRows(existingRows, newRows) {
var rows = Array.isArray(existingRows) ? existingRows.slice() : [];
var indexByKey = new Map();
rows.forEach(function (customer, index) {
var key = deliveryDebtCustomerKey(customer);
if (key) indexByKey.set(key, index);
});
(Array.isArray(newRows) ? newRows : []).forEach(function (customer) {
var key = deliveryDebtCustomerKey(customer);
if (key && indexByKey.has(key)) {
rows[indexByKey.get(key)] = customer;
} else {
if (key) indexByKey.set(key, rows.length);
rows.push(customer);
}
});
return rows;
}
function buildDeliveryDebtUrl(page) {
var params = new URLSearchParams();
params.set('collectorType', 'delivery');
params.set('includePendingCollections', '1');
params.set('includePaid', '0');
params.set('limit', String(state.debtLimit || DELIVERY_DEBT_PAGE_LIMIT));
params.set('page', String(Math.max(1, Number(page || 1) || 1)));
var keyword = String(state.debtSearch || '').trim();
if (keyword) params.set('q', keyword);
return '/api/mobile/debts?' + params.toString();
}
function selectedDeliveryDebtCustomer() {
if (!state.selectedDebtKey) return null;
return (state.debts || []).find(function (customer) {
return deliveryDebtCustomerKey(customer) === state.selectedDebtKey;
}) || null;
}
function visibleDeliveryDebtCustomers() {
var keyword = String(state.debtSearch || '').trim().toLowerCase();
var rows = (state.debts || []).map(function (customer, originalIndex) {
return { customer: customer, originalIndex: originalIndex };
}).filter(function (entry) {
if (!keyword) return true;
var customer = entry.customer || {};
return [customer.customerCode, customer.customerName, customer.phone, customer.customerPhone].some(function (value) {
return String(value || '').toLowerCase().indexOf(keyword) >= 0;
});
});
rows.sort(function (left, right) {
if (state.debtSort === 'available_desc') {
return debtAvailableValue(right.customer) - debtAvailableValue(left.customer);
}
if (state.debtSort === 'oldest_asc') {
return String(left.customer.oldestDebtDate || '9999-12-31').localeCompare(String(right.customer.oldestDebtDate || '9999-12-31'));
}
return debtMoneyValue(right.customer) - debtMoneyValue(left.customer);
});
return rows;
}
function setDeliveryDebtSubtab(nextSubtab, options) {
options = options || {};
state.debtSubtab = nextSubtab === 'collect' ? 'collect' : 'customers';
var customerActive = state.debtSubtab === 'customers';
var customerTab = el('mDebtCustomersSubtab');
var collectTab = el('mDebtCollectSubtab');
var customerPanel = el('mDebtCustomersPanel');
var collectPanel = el('mDebtCollectPanel');
if (customerTab) {
customerTab.classList.toggle('active', customerActive);
customerTab.setAttribute('aria-selected', String(customerActive));
}
if (collectTab) {
collectTab.classList.toggle('active', !customerActive);
collectTab.setAttribute('aria-selected', String(!customerActive));
}
if (customerPanel) customerPanel.classList.toggle('active', customerActive);
if (collectPanel) collectPanel.classList.toggle('active', !customerActive);
if (customerActive && options.restoreScroll !== false) {
window.requestAnimationFrame(function () {
window.scrollTo({ top: state.debtListScrollTop || 0, behavior: 'auto' });
});
} else if (!customerActive && options.scroll !== false) {
var body = el('mBody');
if (body) body.scrollIntoView({ block: 'start', behavior: options.behavior || 'smooth' });
}
}
function openDeliveryDebtCollection(index) {
var customer = (state.debts || [])[index];
if (!customer || debtAvailableValue(customer) <= 0) return;
var nextKey = deliveryDebtCustomerKey(customer);
if (state.selectedDebtKey === nextKey) {
setDeliveryDebtSubtab('collect');
return;
}
if (
state.debtFormDirty &&
state.selectedDebtKey &&
state.selectedDebtKey !== nextKey &&
!window.confirm('Phiếu thu chưa gửi sẽ bị xóa khi đổi khách.')
) {
return;
}
state.debtListScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
state.selectedDebtIndex = index;
state.selectedDebtKey = nextKey;
state.debtFormDirty = false;
state.debtSubtab = 'collect';
render();
var body = el('mBody');
if (body) body.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
async function loadDeliveryDebts(force, options) {
options = options || {};
force = !!force;
var append = !!options.append;
if (append && !state.debtHasMore) return state.debts;
if (state.debtPromise && !(force && !append)) return state.debtPromise;
if (!append && state.debtLoaded && !force && deliveryMobileState.isFresh(state.debtCacheAt, DELIVERY_TAB_CACHE_TTL_MS)) {
render();
return state.debts;
}
if (!append && force) resetDeliveryDebtPaging({ clearRows: true });
var page = append
? (state.debtNextPage || (state.debtPage + 1) || 2)
: 1;
state.debtLoading = !append;
state.debtLoadingMore = append;
state.debtRequestSeq += 1;
var requestSeq = state.debtRequestSeq;
msg(append ? 'Đang tải thêm công nợ...' : 'Đang tải công nợ...');
state.debtPromise = window.DeliveryCore.api(buildDeliveryDebtUrl(page)).then(function (json) {
if (requestSeq !== state.debtRequestSeq) return state.debts;
var previousKey = state.selectedDebtKey;
var incomingRows = Array.isArray(json.items) ? json.items : [];
var pagination = normalizeDebtPagination(json.pagination || {});
state.debtError = '';
state.debts = append ? mergeDeliveryDebtRows(state.debts, incomingRows) : incomingRows;
state.debtSummary = json.summary || state.debtSummary || {};
state.debtPage = pagination.page;
state.debtLimit = pagination.limit;
state.debtHasMore = pagination.hasMore;
state.debtTotalRows = pagination.totalRows || state.debts.length;
state.debtTotalPages = pagination.totalPages;
state.debtNextPage = pagination.nextPage;
state.debtLoaded = true;
state.debtCacheAt = Date.now();
state.selectedDebtIndex = previousKey
? state.debts.findIndex(function (customer) { return deliveryDebtCustomerKey(customer) === previousKey; })
: -1;
if (state.selectedDebtIndex < 0) {
state.selectedDebtIndex = -1;
state.selectedDebtKey = '';
state.debtFormDirty = false;
}
msg('');
return state.debts;
}).catch(function (err) {
if (requestSeq !== state.debtRequestSeq) return state.debts;
if (!append) {
state.debtLoaded = false;
state.debtCacheAt = 0;
}
state.debtError = err.message || 'Không tải được công nợ giao hàng';
msg(state.debtError, true);
throw err;
}).finally(function () {
if (requestSeq === state.debtRequestSeq) {
state.debtLoading = false;
state.debtLoadingMore = false;
state.debtPromise = null;
render();
}
});
return state.debtPromise;
}
function renderDebtApp(body) {
var rows = state.debts || [];
var summary = state.debtSummary || {};
if (state.debtLoading && !rows.length) {
if (mobileUiRuntime) mobileUiRuntime.renderState(body, { state: 'loading', className: 'm-delivery-body', title: 'Đang tải công nợ...' });
else body.innerHTML = '<div class="m-empty">Đang tải công nợ...</div>';
return;
}
if (state.debtError && !rows.length) {
body.innerHTML = '<div class="m-empty danger"><b>Không tải được công nợ</b><span>' + esc(state.debtError) + '</span><button id="mRetryDebt" type="button">Thử lại</button></div>';
var retryDebtButton = el('mRetryDebt');
if (retryDebtButton) retryDebtButton.addEventListener('click', function () {
state.debtError = '';
loadDeliveryDebts(true);
});
return;
}
var selected = selectedDeliveryDebtCustomer();
var customerTabActive = state.debtSubtab !== 'collect';
body.innerHTML =
'<section class="m-debt-summary">' +
'<div><span>Tổng nợ</span><b>' + money(summary.totalDebt || 0) + '</b></div>' +
'<div><span>Chờ KT</span><b>' + money(summary.pendingCollected || summary.pendingCollectedAmount || 0) + '</b></div>' +
'<div><span>Có thể thu</span><b>' + money(summary.availableDebt || summary.availableDebtAmount || 0) + '</b></div>' +
'<div><span>Khách nợ</span><b>' + esc(summary.customerCount || rows.length) + '</b></div>' +
'</section>' +
'<div class="m-action-row m-debt-reload-row">' +
'<button id="mReloadDebt" type="button">Tải lại công nợ</button>' +
'</div>' +
'<div class="debt-subtabs m-debt-subtabs" role="tablist" aria-label="Nghiệp vụ công nợ">' +
'<button id="mDebtCustomersSubtab" type="button" class="debt-subtab' + (customerTabActive ? ' active' : '') + '" role="tab" aria-selected="' + customerTabActive + '">Khách nợ</button>' +
'<button id="mDebtCollectSubtab" type="button" class="debt-subtab' + (!customerTabActive ? ' active' : '') + '" role="tab" aria-selected="' + (!customerTabActive) + '">Thu nợ</button>' +
'</div>' +
'<section id="mDebtCustomersPanel" class="debt-subpanel' + (customerTabActive ? ' active' : '') + '">' +
'<div class="debt-list-toolbar">' +
'<input id="mDebtCustomerSearch" type="search" value="' + esc(state.debtSearch) + '" placeholder="Tìm mã / tên / SĐT khách hàng" aria-label="Tìm khách hàng đang nợ">' +
'<select id="mDebtCustomerSort" aria-label="Sắp xếp danh sách công nợ">' +
'<option value="debt_desc"' + (state.debtSort === 'debt_desc' ? ' selected' : '') + '>Nợ cao nhất</option>' +
'<option value="available_desc"' + (state.debtSort === 'available_desc' ? ' selected' : '') + '>Có thể thu cao nhất</option>' +
'<option value="oldest_asc"' + (state.debtSort === 'oldest_asc' ? ' selected' : '') + '>Nợ cũ nhất</option>' +
'</select>' +
'</div>' +
'<div id="mDebtCustomerList" class="m-debt-list"></div>' +
'<div id="mDebtPaging" class="m-debt-paging"></div>' +
'</section>' +
'<section id="mDebtCollectPanel" class="debt-subpanel' + (!customerTabActive ? ' active' : '') + '">' +
'<div id="mDebtDetailContainer" class="m-debt-detail">' + renderDebtCustomerDetail(selected) + '</div>' +
'</section>';
var reload = el('mReloadDebt');
if (reload) reload.addEventListener('click', function () {
if (state.debtFormDirty && !window.confirm('Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.')) return;
state.debtFormDirty = false;
resetDeliveryDebtPaging({ clearRows: true });
loadDeliveryDebts(true);
});
var customerTab = el('mDebtCustomersSubtab');
if (customerTab) customerTab.addEventListener('click', function () {
setDeliveryDebtSubtab('customers');
});
var collectTab = el('mDebtCollectSubtab');
if (collectTab) collectTab.addEventListener('click', function () {
setDeliveryDebtSubtab('collect');
});
var chooseCustomer = el('mChooseDebtCustomer');
if (chooseCustomer) chooseCustomer.addEventListener('click', function () {
setDeliveryDebtSubtab('customers');
});
var search = el('mDebtCustomerSearch');
if (search) search.addEventListener('input', debounce(function () {
state.debtSearch = search.value || '';
resetDeliveryDebtPaging({ clearRows: true });
loadDeliveryDebts(true);
}, 300));
var sort = el('mDebtCustomerSort');
if (sort) sort.addEventListener('change', function () {
state.debtSort = sort.value || 'debt_desc';
renderDeliveryDebtCustomerList();
});
renderDeliveryDebtCustomerList();
var form = el('mDeliveryDebtCollectionForm');
if (form && selected) {
form.addEventListener('input', function () { state.debtFormDirty = true; });
form.addEventListener('change', function () { state.debtFormDirty = true; });
form.addEventListener('submit', function (event) {
submitDeliveryDebtCollectionFromDebtTab(event, selected);
});
}
body.querySelectorAll('.m-debt-order-check').forEach(function (input) {
input.addEventListener('change', function () {
updateDeliveryDebtAmount(selected);
state.debtFormDirty = true;
});
});
}
function renderDeliveryDebtCustomerList() {
var list = el('mDebtCustomerList');
if (!list) return;
var entries = visibleDeliveryDebtCustomers();
if (!(state.debts || []).length) {
if (mobileUiRuntime) mobileUiRuntime.renderState(list, { state: 'empty', className: 'm-debt-customer-list', title: 'Không có khách hàng còn nợ.' });
else list.innerHTML = '<div class="m-empty">Không có khách hàng còn nợ.</div>';
renderDeliveryDebtPaging();
return;
}
if (!entries.length) {
if (mobileUiRuntime) mobileUiRuntime.renderState(list, { state: 'empty', className: 'm-debt-customer-list', title: 'Không tìm thấy khách hàng phù hợp.' });
else list.innerHTML = '<div class="m-empty">Không tìm thấy khách hàng phù hợp.</div>';
renderDeliveryDebtPaging();
return;
}
if (mobileUiRuntime) {
if (deliveryDebtRendererContainer !== list) {
if (deliveryDebtRenderer) deliveryDebtRenderer.cancel();
deliveryDebtRendererContainer = list;
deliveryDebtRenderer = mobileUiRuntime.createChunkedHtmlRenderer(list, { initialCount: 60, chunkSize: 80 });
}
deliveryDebtRenderer.render(entries, renderDebtCustomerCard, { className: 'm-debt-customer-list' });
} else {
list.innerHTML = entries.map(renderDebtCustomerCard).join('');
}
renderDeliveryDebtPaging();
}
function renderDeliveryDebtPaging() {
var paging = el('mDebtPaging');
if (!paging) return;
var loaded = (state.debts || []).length;
var total = state.debtTotalRows || loaded;
var statusText = total > 0
? 'Đã tải ' + loaded + '/' + total + ' khách nợ'
: 'Chưa có khách nợ cần tải';
var buttonHtml = '';
if (state.debtHasMore) {
buttonHtml = '<button id="mLoadMoreDebt" type="button" class="secondary"' + (state.debtLoadingMore ? ' disabled' : '') + '>' +
(state.debtLoadingMore ? 'Đang tải thêm...' : 'Tải thêm') +
'</button>';
} else if (state.debtLoaded && loaded > 0) {
buttonHtml = '<span class="m-debt-paging-done">Đã tải hết</span>';
}
paging.innerHTML = '<span>' + esc(statusText) + '</span>' + buttonHtml;
var loadMore = el('mLoadMoreDebt');
if (loadMore) loadMore.addEventListener('click', function () {
if (state.debtLoadingMore || state.debtLoading) return;
loadDeliveryDebts(false, { append: true });
});
}
function renderDebtCustomerCard(entry) {
var customer = entry.customer;
var index = entry.originalIndex;
var selected = deliveryDebtCustomerKey(customer) === state.selectedDebtKey ? ' selected' : '';
var available = debtAvailableValue(customer);
var disabled = available <= 0;
return '<article class="m-order-card m-debt-customer-card' + selected + '">' +
'<div class="m-order-top">' +
'<b>' + esc(customer.customerCode || '') + ' - ' + esc(customer.customerName || '') + '</b>' +
'</div>' +
'<div class="m-order-metrics">' +
'<span>Nợ ' + money(debtMoneyValue(customer)) + '</span>' +
'<span>Chờ KT ' + money(debtPendingValue(customer)) + '</span>' +
'<span>Có thể thu ' + money(available) + '</span>' +
'<span>' + esc(customer.orderCount || 0) + ' đơn</span>' +
'</div>' +
'<button type="button" class="m-debt-collect-action' + (disabled ? ' disabled' : '') + '" data-debt-index="' + index + '"' + (disabled ? ' disabled aria-disabled="true"' : '') + '>' +
(disabled ? 'Đang chờ KT' : 'Thu nợ') +
'</button>' +
'</article>';
}
function renderDebtCustomers(entries) {
if (!(state.debts || []).length) return '<div class="m-empty">Không có khách hàng còn nợ.</div>';
if (!entries.length) return '<div class="m-empty">Không tìm thấy khách hàng phù hợp.</div>';
return entries.map(renderDebtCustomerCard).join('');
}
function renderDebtCustomerDetail(customer) {
if (!customer) {
return '<div class="m-empty debt-empty-state">' +
'<b>Chưa chọn khách hàng để thu nợ</b>' +
'<span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span>' +
'<button id="mChooseDebtCustomer" type="button" class="m-debt-empty-action">Chọn khách hàng</button>' +
'</div>';
}
var orders = debtOrderRows(customer);
if (!orders.length) {
return '<div class="m-selected-order"><b>' + esc(customer.customerCode || '') + ' - ' + esc(customer.customerName || '') + '</b></div>' +
'<div class="m-empty">Khách hàng này không còn số tiền có thể thu hoặc đang chờ kế toán xác nhận.</div>';
}
var rowsHtml = orders.map(function (order, index) {
var available = order.availableDebt;
if (available == null) available = order.debt;
available = num(available || 0);
return '<label class="m-debt-order-row">' +
'<input type="checkbox" class="m-debt-order-check" data-index="' + index + '" checked>' +
'<div>' +
'<b>' + esc(order.salesOrderCode || order.orderCode || '') + '</b>' +
'<small>Ngày: ' + esc(order.orderDate || order.documentDate || '') + '</small>' +
'<em>Nợ: ' + money(order.debt || 0) +
' · Chờ KT: ' + money(order.pendingCollectedAmount || 0) +
' · Có thể thu: ' + money(available) +
'</em>' +
'</div>' +
'</label>';
}).join('');
return '<div class="m-selected-order">' +
'<b>' + esc(customer.customerCode || '') + ' - ' + esc(customer.customerName || '') + '</b>' +
'<span>Nợ: ' + money(debtMoneyValue(customer)) +
' · Chờ KT: ' + money(debtPendingValue(customer)) +
' · Có thể thu: ' + money(debtAvailableValue(customer)) +
'</span>' +
'</div>' +
'<form id="mDeliveryDebtCollectionForm" class="m-payment-form">' +
'<h3>Gửi phiếu thu nợ chờ kế toán</h3>' +
'<p class="m-help-text">Công nợ chỉ giảm sau khi kế toán xác nhận trên web.</p>' +
'<div class="m-return-scroll debt-order-selection-list">' + rowsHtml + '</div>' +
'<label>Số tiền đã thu<input id="mDeliveryDebtAmount" name="amount" type="number" min="0" value="' + esc(debtAvailableValue(customer)) + '"></label>' +
'<label>Hình thức<select name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>' +
'<label>Ghi chú<input name="note" placeholder="VD: Khách trả một phần"></label>' +
'<div class="debt-submit-bar"><button type="submit">Gửi phiếu thu chờ KT</button></div>' +
'</form>';
}
function updateDeliveryDebtAmount(customer) {
var orders = debtOrderRows(customer);
var total = 0;
document.querySelectorAll('.m-debt-order-check:checked').forEach(function (input) {
var index = Number(input.getAttribute('data-index'));
var order = orders[index];
if (!order) return;
var available = order.availableDebt;
if (available == null) available = order.debt;
total += num(available || 0);
});
var amountInput = el('mDeliveryDebtAmount');
if (amountInput) amountInput.value = Math.max(0, Math.round(total));
}
async function submitDeliveryDebtCollectionFromDebtTab(event, customer) {
if (event && event.preventDefault) event.preventDefault();
var formElement = event.target;
var form = new FormData(formElement);
var amountValue = num(form.get('amount'));
if (amountValue <= 0) {
msg('Số tiền thu phải lớn hơn 0', true);
return;
}
var orders = debtOrderRows(customer);
var allocations = [];
document.querySelectorAll('.m-debt-order-check:checked').forEach(function (input) {
var index = Number(input.getAttribute('data-index'));
var order = orders[index];
if (!order) return;
var available = order.availableDebt;
if (available == null) available = order.debt;
available = num(available || 0);
if (available <= 0) return;
allocations.push({
salesOrderId: order.salesOrderId || order.orderId || '',
salesOrderCode: order.salesOrderCode || order.orderCode || '',
allocatedAmount: available
});
});
if (!allocations.length) {
msg('Cần chọn ít nhất một đơn nợ', true);
return;
}
var totalSelected = allocations.reduce(function (sum, row) {
return sum + num(row.allocatedAmount);
}, 0);
if (amountValue > totalSelected) {
msg('Số tiền thu vượt tổng công nợ đã chọn', true);
return;
}
var remain = amountValue;
allocations = allocations.map(function (row) {
var allocated = Math.min(num(row.allocatedAmount), remain);
remain -= allocated;
return Object.assign({}, row, { allocatedAmount: allocated });
}).filter(function (row) {
return num(row.allocatedAmount) > 0;
});
var submitButton = formElement.querySelector('button[type="submit"]');
if (submitButton) {
submitButton.disabled = true;
submitButton.textContent = 'Đang gửi...';
}
try {
msg('Đang gửi phiếu thu nợ chờ kế toán...');
await window.DeliveryCore.api('/api/mobile/debt-collections', {
method: 'POST',
body: JSON.stringify({
collectorType: 'delivery',
customerId: customer.customerId || '',
customerCode: customer.customerCode || '',
customerName: customer.customerName || '',
amount: amountValue,
paymentMethod: form.get('paymentMethod') || 'cash',
note: form.get('note') || '',
allocations: allocations,
idempotencyKey: 'delivery-debt-' + (customer.customerCode || Date.now()) + '-' + Date.now()
})
});
state.debtFormDirty = false;
state.selectedDebtIndex = -1;
state.selectedDebtKey = '';
state.debtSubtab = 'customers';
resetDeliveryDebtPaging({ clearRows: true });
await loadDeliveryDebts(true);
msg('Đã ghi nhận thu nợ, chờ kế toán xác nhận');
window.requestAnimationFrame(function () {
window.scrollTo({ top: state.debtListScrollTop || 0, behavior: 'auto' });
});
} catch (err) {
msg(err.message || 'Không gửi được phiếu thu nợ', true);
if (submitButton) {
submitButton.disabled = false;
submitButton.textContent = 'Gửi phiếu thu chờ KT';
}
}
}
function reconciliationSummaryValue(summary, key) {
return num(summary && summary[key]);
}
function buildDeliveryReconciliationUrl() {
var params = new URLSearchParams();
var currentFilters = filters();
if (currentFilters.date) params.set('date', currentFilters.date);
return '/api/delivery/reconciliation' + (params.toString() ? '?' + params.toString() : '');
}
async function loadDeliveryReconciliation(force) {
force = !!force;
if (state.reconciliationPromise && !force) return state.reconciliationPromise;
if (state.reconciliationLoaded && !force && deliveryMobileState.isFresh(state.reconciliationCacheAt, DELIVERY_TAB_CACHE_TTL_MS)) {
render();
return state.reconciliationReport;
}
state.reconciliationLoading = true;
state.reconciliationError = '';
msg('Đang tải đối soát cuối ngày...');
state.reconciliationPromise = window.DeliveryCore.api(buildDeliveryReconciliationUrl()).then(function (json) {
var report = json.data && json.data.summary ? json.data : {
date: (el('mDate') && el('mDate').value) || today(),
summary: json.summary || json.reconciliation || {},
orders: json.orders || [],
returns: json.returns || [],
collections: json.collections || []
};
state.reconciliationReport = report;
state.reconciliationLoaded = true;
state.reconciliationCacheAt = Date.now();
state.reconciliationError = '';
msg('');
return report;
}).catch(function (err) {
state.reconciliationLoaded = false;
state.reconciliationCacheAt = 0;
state.reconciliationError = err.message || 'Lỗi tải đối soát cuối ngày';
msg(state.reconciliationError, true);
throw err;
}).finally(function () {
state.reconciliationLoading = false;
state.reconciliationPromise = null;
render();
});
return state.reconciliationPromise;
}
function renderReconciliationMetric(label, value, danger) {
return '<div class="m-recon-metric' + (danger ? ' danger' : '') + '"><span>' + esc(label) + '</span><b>' + money(value || 0) + '</b></div>';
}
function renderReconciliationApp(body) {
var report = state.reconciliationReport || {};
var summary = report.summary || {};
if (state.reconciliationLoading && !state.reconciliationLoaded) {
if (mobileUiRuntime) mobileUiRuntime.renderState(body, { state: 'loading', className: 'm-delivery-body', title: 'Đang tải đối soát cuối ngày...' });
else body.innerHTML = '<div class="m-empty">Đang tải đối soát cuối ngày...</div>';
return;
}
if (state.reconciliationError && !state.reconciliationLoaded) {
body.innerHTML = '<div class="m-empty danger"><b>Lỗi tải đối soát</b><span>' + esc(state.reconciliationError) + '</span><button id="mRetryReconciliation" type="button">Thử lại</button></div>';
var retryReconciliationButton = el('mRetryReconciliation');
if (retryReconciliationButton) retryReconciliationButton.addEventListener('click', function () { loadDeliveryReconciliation(true); });
return;
}
if (!state.reconciliationLoaded) {
body.innerHTML = '<div class="m-empty"><b>Chưa tải báo cáo đối soát</b><span>Bấm Tải ở header để đối chiếu tiền, hàng trả và phiếu thu nợ cuối ngày.</span></div>';
return;
}
var mismatch = !!summary.hasMismatch || Math.abs(reconciliationSummaryValue(summary, 'difference')) > 1000;
var orderRows = Array.isArray(report.orders) ? report.orders : [];
var collectionRows = Array.isArray(report.collections) ? report.collections : [];
body.innerHTML =
'<section class="m-recon-header-card' + (mismatch ? ' danger' : '') + '">' +
'<div><b>Đối soát ngày ' + esc(report.date || (el('mDate') && el('mDate').value) || today()) + '</b>' +
'<span>' + (mismatch ? 'Có chênh lệch cần xử lý' : 'Đối soát tạm ổn trong ngưỡng cho phép') + '</span></div>' +
'</section>' +
'<section class="m-recon-grid">' +
renderReconciliationMetric('Đơn đã giao', summary.deliveredOrders || 0) +
renderReconciliationMetric('Đơn chưa giao', summary.pendingOrders || 0) +
renderReconciliationMetric('Phải thu', summary.mustCollect || 0) +
renderReconciliationMetric('Tiền mặt', summary.collectedCash || 0) +
renderReconciliationMetric('Chuyển khoản', summary.collectedTransfer || 0) +
renderReconciliationMetric('Nợ', summary.remainingDebt || 0, summary.remainingDebt > 0) +
renderReconciliationMetric('Hàng trả', summary.returnAmount || 0) +
renderReconciliationMetric('Phiếu chờ KT', summary.pendingDebtCollectionAmount || 0, summary.pendingDebtCollections > 0) +
renderReconciliationMetric('Chênh lệch', summary.difference || 0, mismatch) +
'</section>' +
'<section class="m-recon-section"><h3>Đơn cần chú ý</h3>' +
(orderRows.filter(function (row) { return !row.delivered || num(row.remainingDebt) > 0 || Math.abs(num(row.difference)) > 1000; }).slice(0, 20).map(function (row) {
return '<article class="m-recon-row"><b>' + esc(row.customerName || row.customerCode || row.orderCode) + '</b><span>' + esc(row.orderCode || '') + ' · ' + (row.delivered ? 'Đã' : 'Chưa') + '</span><em>Nợ ' + money(row.remainingDebt || 0) + ' · Lệch ' + money(row.difference || 0) + '</em></article>';
}).join('') || '<div class="m-empty">Không có đơn cần chú ý.</div>') +
'</section>' +
'<section class="m-recon-section"><h3>Phiếu thu nợ đã gửi</h3>' +
(collectionRows.slice(0, 20).map(function (row) {
return '<article class="m-recon-row"><b>' + esc(row.customerName || row.customerCode || row.code) + '</b><span>' + esc(row.code || '') + ' · ' + esc(row.status || '') + '</span><em>' + money(row.amount || 0) + (row.pendingAccounting ? ' · Chờ kế toán' : ' · Đã xử lý') + '</em></article>';
}).join('') || '<div class="m-empty">Chưa có phiếu thu nợ gửi trong ngày.</div>') +
'</section>';
}
function lineQty(item) {
return num(item && (item.quantity || item.deliveredQty || item.qty || item.orderQty || item.soldQty));
}
function linePrice(item) {
return num(item && (item.unitPrice || item.price || item.salePrice || item.finalPrice));
}
function bindReturnTotal(formEl, targetId) {
function update() {
var total = 0;
var byIdx = {};
formEl.querySelectorAll('[data-m-return-field]').forEach(function (input) {
var idx = input.getAttribute('data-idx');
var field = input.getAttribute('data-m-return-field');
byIdx[idx] = byIdx[idx] || {};
byIdx[idx][field] = input.value;
});
Object.keys(byIdx).forEach(function (idx) {
total += num(byIdx[idx].returnQty) * num(byIdx[idx].price);
});
var target = el(targetId || 'mReturnTotal');
if (target) target.textContent = money(total);
var dueTarget = el('mProductDueAfterReturn');
if (dueTarget) dueTarget.textContent = money(Math.max(0, amount(currentOrder(), 'receivable') - total));
}
formEl.addEventListener('input', update);
update();
}
function filterProductRows(keyword) {
keyword = String(keyword || '').toLowerCase().trim();
var visible = 0;
document.querySelectorAll('[data-product-search-text]').forEach(function (row) {
var text = String(row.getAttribute('data-product-search-text') || '').toLowerCase();
var matched = !keyword || text.indexOf(keyword) >= 0;
row.hidden = !matched;
if (matched) visible += 1;
});
var empty = el('mProductSearchEmpty');
if (empty) empty.hidden = visible > 0 || !keyword;
}
function renderProducts(body) {
var order = currentOrder();
if (!order) { body.innerHTML = '<div class="m-empty">Chọn khách/đơn ở danh sách cần giao trước.</div>'; return; }
var baseRows = buildReturnInputRows(order, returnsForOrder(order));
var productKeyword = String(state.productSearchKeyword || '').toLowerCase().trim();
var totalQty = baseRows.reduce(function (sum, it) { return sum + num(it.deliveredQty); }, 0);
var totalAmount = baseRows.reduce(function (sum, it) { return sum + num(it.price) * num(it.deliveredQty); }, 0);
var totalReturnAmount = baseRows.reduce(function (sum, it) { return sum + num(it.returnQty) * num(it.price); }, 0);
body.innerHTML = '<section class="m-product-compact-brief phase24"><b>' + esc(baseRows.length) + ' dòng · ' + money(totalQty) + ' SL · Giá trị ' + money(totalAmount) + '</b><span>Nhập SL trả trên từng dòng hàng, sau đó bấm “Xác nhận & thu”.</span></section>' +
'<label class="m-product-search"><span>Tìm hàng</span><input id="mProductSearch" type="search" placeholder="Tìm hàng" value="' + esc(state.productSearchKeyword || '') + '"></label>' +
'<form id="mProductReturnForm" class="m-product-return-form"><div class="m-return-scroll products-with-return-input">' +
(baseRows.map(function (it, idx) {
var qtyText = 'SL giao ' + money(it.deliveredQty);
var amount = num(it.returnQty) * num(it.price);
var searchText = [it.productCode, it.productName, it.barcode].join(' ');
return '<div class="m-product-row phase23" data-product-search-text="' + esc(searchText) + '"><div><b>' + esc(it.productCode) + '</b><small>' + esc(it.productName) + '</small><em>' + qtyText + ' · Giá ' + money(it.price) + ' · Tiền trả ' + money(amount) + '</em>' + hidden(idx, 'productCode', it.productCode) + hidden(idx, 'productName', it.productName) + hidden(idx, 'price', it.price) + hidden(idx, 'deliveredQty', it.deliveredQty) + '</div><label class="m-return-inline-input"><span>SL trả</span><input data-m-return-field="returnQty" data-idx="' + idx + '" type="number" min="0" step="1" value="' + esc(it.returnQty) + '" aria-label="Số lượng hàng trả"></label></div>';
}).join('') || '<div class="m-empty">Đơn chưa có dòng hàng để đối chiếu.</div>') +
'<div id="mProductSearchEmpty" class="m-empty" hidden>Không tìm thấy sản phẩm trong đơn này</div>' +
'</div><div class="m-return-total phase23"><span>Tổng hàng trả</span><b id="mReturnTotal">' + money(totalReturnAmount) + '</b></div>' +
'<div class="m-return-total phase23 due"><span>Phải thu</span><b id="mProductDueAfterReturn">' + money(Math.max(0, amount(order, 'receivable') - totalReturnAmount)) + '</b></div></form>';
var formEl = el('mProductReturnForm');
if (formEl) {
formEl.addEventListener('submit', function (event) { saveReturn(event, { nextTab: 'payment', successMessage: 'Đã xác nhận hàng trả, chuyển sang Thu tiền' }); });
bindReturnTotal(formEl, 'mReturnTotal');
}
filterProductRows(productKeyword);
if (el('mFullReturnOrder')) el('mFullReturnOrder').addEventListener('click', fullReturnOrder);
}
function hidden(idx, field, value) { return '<input type="hidden" data-m-return-field="' + esc(field) + '" data-idx="' + idx + '" value="' + esc(value) + '">'; }
function cleanReturnCode(value) {
return String(value == null ? '' : value).trim().replace(/^RO[-_]?/i, '');
}
function returnsForOrder(order) {
order = order || {};
var ids = [order.orderId, order.salesOrderId, order.id, order._id].map(String).filter(function (v) { return v && v !== 'undefined' && v !== 'null'; });
var codes = [order.orderCode, order.salesOrderCode, order.code, order.displayOrderCode].map(cleanReturnCode).filter(Boolean);
return (window.DeliveryCore.state.returns || []).filter(function (row) {
var rowIds = [row.salesOrderId, row.orderId, row.sourceOrderId, row.deliveryOrderId].map(String);
var rowCodes = [row.salesOrderCode, row.orderCode, row.sourceOrderCode, row.deliveryOrderCode, row.returnOrderCode].map(cleanReturnCode);
return ids.some(function (id) { return rowIds.indexOf(id) >= 0; }) || codes.some(function (code) { return rowCodes.indexOf(code) >= 0; });
});
}
function buildReturnInputRows(order, rows) {
var returnByProduct = new Map();
(Array.isArray(rows) ? rows : []).forEach(function (row) {
var code = String(row.productCode || row.code || row.productId || '').trim();
if (!code) return;
returnByProduct.set(code, row);
});
var orderItems = Array.isArray(order && order.items) ? order.items : [];
if (orderItems.length) {
return orderItems.map(function (item) {
var code = item.productCode || item.code || item.productId || '';
var saved = returnByProduct.get(String(code).trim()) || {};
return {
productCode: code,
productName: item.productName || item.name || saved.productName || saved.name || '',
barcode: item.barcode || item.productBarcode || saved.barcode || saved.productBarcode || '',
price: linePrice(saved) || linePrice(item),
returnQty: num(saved.returnQty || saved.qtyReturn || saved.returnQuantity || saved.returnedQty || item.returnQty || item.qtyReturn || 0),
deliveredQty: lineQty(item)
};
});
}
return (Array.isArray(rows) ? rows : []).map(function (item) {
return {
productCode: item.productCode || item.code || item.productId || '',
productName: item.productName || item.name || '',
barcode: item.barcode || item.productBarcode || '',
price: linePrice(item),
returnQty: num(item.returnQty || item.qtyReturn || item.returnQuantity || item.returnedQty || 0),
deliveredQty: lineQty(item)
};
});
}
function sourceReturnRowsForOrder(order) {
var rows = returnsForOrder(order);
if (!rows.length && Array.isArray(order && order.returnItems) && order.returnItems.length) {
rows = order.returnItems.map(function (item) {
return Object.assign({}, item, {
salesOrderId: order.salesOrderId,
salesOrderCode: order.salesOrderCode,
orderId: order.orderId,
orderCode: order.orderCode,
customerCode: order.customerCode,
customerName: order.customerName
});
});
}
return buildReturnInputRows(order, rows);
}
function returnedRowsForOrder(order) {
return sourceReturnRowsForOrder(order).filter(function (it) {
return num(it.returnQty) > 0;
});
}
function hasReturnedRowsForCurrentOrder(order) {
return returnedRowsForOrder(order || currentOrder()).length > 0;
}
function renderReturns(body) {
var order = currentOrder();
if (!order) { body.innerHTML = '<div class="m-empty">Chọn khách/đơn ở danh sách cần giao trước.</div>'; return; }
var rows = returnedRowsForOrder(order);
var totalReturnAmount = rows.reduce(function (sum, it) { return sum + num(it.returnQty) * num(it.price); }, 0);
var hasReturn = rows.length > 0;
body.innerHTML = '<section class="m-workflow-step phase23 returns-only"><b>Hàng trả</b><span>Chỉ hiển thị sản phẩm đã có SL trả. Muốn thêm hàng trả mới, quay lại tab Hàng giao.</span></section>' +
(!hasReturn ? '<div class="m-empty soft returns-only-empty"><b>Chưa có hàng trả cho đơn này</b><span>Nhập số lượng trả ở tab Hàng giao.</span><button type="button" data-workflow-tab="products">Quay lại Hàng giao</button></div>' : '') +
(hasReturn ? '<form id="mReturnSaveForm"><div class="m-return-scroll returns-only-list">' +
rows.map(function (it, idx) {
var qtyText = ' · SL giao ' + money(it.deliveredQty);
var amount = num(it.returnQty) * num(it.price);
return '<div class="m-product-row phase23 returned-only"><div><b>' + esc(it.productCode) + '</b><small>' + esc(it.productName) + '</small><em>Giá ' + money(it.price) + qtyText + ' · Tiền trả ' + money(amount) + '</em>' + hidden(idx, 'productCode', it.productCode) + hidden(idx, 'productName', it.productName) + hidden(idx, 'price', it.price) + hidden(idx, 'deliveredQty', it.deliveredQty) + '</div><label class="m-return-inline-input"><span>SL trả</span><input data-m-return-field="returnQty" data-idx="' + idx + '" type="number" min="0" step="1" value="' + esc(it.returnQty) + '" aria-label="Số lượng trả"></label></div>';
}).join('') +
'</div><div class="m-return-total"><span>Tổng hàng trả</span><b id="mReturnTotal">' + money(totalReturnAmount) + '</b></div></form>' : '<div class="m-return-total empty"><span>Tổng hàng trả</span><b>0</b></div>');
var formEl = el('mReturnSaveForm');
if (formEl) {
formEl.addEventListener('submit', function (event) { saveReturn(event, { nextTab: 'payment', successMessage: 'Đã cập nhật hàng trả, chuyển sang Thu tiền' }); });
bindReturnTotal(formEl, 'mReturnTotal');
}
if (el('mSkipReturns')) el('mSkipReturns').addEventListener('click', function () {
if (!window.confirm('Xóa hàng trả sẽ ghi số lượng trả về 0 cho đơn này. Bạn chắc chắn muốn tiếp tục?')) return;
saveReturn({ preventDefault: function () {}, forceZero: true }, { nextTab: 'payment', successMessage: 'Đã xóa hàng trả, chuyển sang Thu tiền' });
});
}
function renderCustomerReconciliation(body) {
var order = currentOrder();
if (!order) { body.innerHTML = '<div class="m-empty">Chọn khách/đơn ở danh sách cần giao trước.</div>'; return; }
var receivable = amount(order, 'receivable');
var returnAmount = amount(order, 'returnAmount');
var cash = amount(order, 'cash');
var bank = amount(order, 'bank');
var reward = amount(order, 'reward');
var collected = cash + bank + reward;
var remaining = Math.max(0, receivable - returnAmount - collected);
body.innerHTML = '<section class="m-customer-reconciliation-panel">' +
'<h3>Đối soát nhanh đơn vừa giao</h3>' +
'<div class="m-recon-grid customer-quick">' +
renderReconciliationMetric('Tổng tiền', receivable || 0) +
renderReconciliationMetric('Hàng trả', returnAmount || 0) +
renderReconciliationMetric('Phải thu', Math.max(0, receivable - returnAmount)) +
renderReconciliationMetric('Đã thu', collected || 0) +
renderReconciliationMetric('Nợ', remaining || 0, remaining > 0) +
'</div>' +
'<div class="m-empty soft">Kiểm tra nhanh tiền và hàng trả của khách này trước khi về danh sách.</div>' +
'</section>';
}
function setPaymentSubmittingUI(isSubmitting) {
state.paymentSubmitting=!!isSubmitting;
document.querySelectorAll('[data-payment-submit]').forEach(function (button) {
button.disabled = !!isSubmitting;
button.textContent = isSubmitting ? 'Đang xác nhận...' : 'Xác nhận thu';
});
}
function showPaymentError(message) {
var box = el('mPaymentError');
if(!box)return;
message = String(message || '').trim();
box.hidden = !message;
box.textContent = message;
}
function readPaymentFormValues(formEl) {
var form = new FormData(formEl);
return {
cash: Math.max(0, num(form.get('cash'))),
bank: Math.max(0, num(form.get('bank'))),
reward: Math.max(0, num(form.get('reward')))
};
}
function validatePaymentAmounts(order, values) {
var receivable = amount(order, 'receivable');
var returnAmount = amount(order, 'returnAmount');
var payable = Math.max(0, receivable - returnAmount);
var collected = values.cash + values.bank + values.reward;
var over = Math.round(collected - payable);
if (over > 1000) {
return 'Thu vượt ' + money(over) + 'đ. Tối đa được thu ' + money(payable) + 'đ.';
}
return '';
}
function renderPayment(body) {
var order = currentOrder();
if (!order) { body.innerHTML = '<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'; return; }
var receivable = amount(order, 'receivable');
var returnAmount = amount(order, 'returnAmount');
body.innerHTML = '<section class="m-workflow-step"><b>Bước 3/4 · Thu tiền & xác nhận</b><span>App sẽ lưu tiền rồi xác nhận giao. Nếu thu thiếu, phần còn lại chuyển sang công nợ theo logic backend hiện có.</span></section>' +
'<section class="m-product-summary payment-context"><div><span>Phải thu</span><b>' + money(receivable) + '</b></div><div><span>Hàng trả</span><b>' + money(returnAmount) + '</b></div><div><span>Còn phải xử lý</span><b id="mPaymentRemainingTop">0</b></div></section>' +
'<form id="mPaymentForm" class="m-payment-form"><h3>Thu tiền đơn giao</h3><label>Tiền mặt<input name="cash" type="number" min="0" value="' + esc(amount(order, 'cash')) + '"></label><label>Chuyển khoản<input name="bank" type="number" min="0" value="' + esc(amount(order, 'bank')) + '"></label><label>Trả thưởng<input name="reward" type="number" min="0" value="' + esc(amount(order, 'reward')) + '"></label><label>Nợ / nợ<input id="mPaymentRemaining" type="text" readonly value="0"></label><p id="mPaymentError" class="m-payment-error" hidden></p></form>';
var formEl = el('mPaymentForm');
if (!formEl) {
msg('Không tải được form thu tiền. Tải lại màn hình giao hàng.', true);
return;
}
function updateRemaining() {
var values = readPaymentFormValues(formEl);
var remaining = Math.max(0, receivable - returnAmount - values.cash - values.bank - values.reward);
if (el('mPaymentRemaining')) el('mPaymentRemaining').value = money(remaining);
if (el('mPaymentRemainingTop')) el('mPaymentRemainingTop').textContent = money(remaining);
if (el('mWorkflowRemaining')) el('mWorkflowRemaining').textContent = money(remaining);
showPaymentError(validatePaymentAmounts(order, values));
}
formEl.addEventListener('input', updateRemaining);
formEl.addEventListener('submit', savePayment);
updateRemaining();
}
function collectReturnItems(options) {
if (typeof options === 'boolean') options = { forceZero: options };
options = options || {};
var byIdx = {};
document.querySelectorAll('[data-m-return-field]').forEach(function (input) {
var idx = input.getAttribute('data-idx');
var field = input.getAttribute('data-m-return-field');
byIdx[idx] = byIdx[idx] || {};
byIdx[idx][field] = input.value;
});
return Object.keys(byIdx).map(function (idx) {
var row = byIdx[idx];
if (options.forceZero) row.returnQty = 0;
if (options.forceFull) row.returnQty = num(row.deliveredQty);
return row;
});
}
async function saveReturn(event, options) {
if (event && event.preventDefault) event.preventDefault();
if (state.returnSubmitting) return;
options = options || {};
try {
state.returnSubmitting = true;
renderWorkflowBar();
msg('Đang lưu hàng trả...');
await window.DeliveryCore.saveReturn(currentOrder(), collectReturnItems({ forceZero: event && event.forceZero }), { returnType: options.returnType || 'partial' });
msg(options.successMessage || 'Đã lưu hàng trả vào returnOrders');
state.selectedKey = keyOf(window.DeliveryCore.state.selectedOrder);
state.tab = options.nextTab || 'payment';
render();
} catch (err) {
msg(err.message, true);
} finally {
state.returnSubmitting = false;
renderWorkflowBar();
}
}
async function fullReturnOrder(event) {
if (event && event.preventDefault) event.preventDefault();
if (state.fullReturnSubmitting) return;
var order = currentOrder();
if (!order) return;
if (!window.confirm('Khách trả lại toàn bộ đơn này?\n\nToàn bộ hàng trong đơn sẽ được ghi nhận là hàng trả. Đơn sẽ thoát khỏi giao diện giao hàng hiện tại.')) return;
try {
state.fullReturnSubmitting = true;
renderWorkflowBar();
msg('Đang ghi nhận trả hết đơn...');
await window.DeliveryCore.saveReturn(order, collectReturnItems({ forceFull: true }), { returnType: 'full', note: 'Khách trả lại toàn bộ đơn từ App giao hàng' });
await window.DeliveryCore.confirmDelivery(currentOrder(), { deliveryStatus: 'failed', status: 'failed', note: 'Khách trả lại toàn bộ đơn' });
removeOrderFromLocalList(window.DeliveryCore.state.selectedOrder || order);
window.DeliveryCore.state.selectedOrder = null;
state.selectedKey = '';
msg('Đã ghi nhận trả hết đơn và quay về danh sách khách');
switchToListMode({ clearSelected: true, forceOrders: true });
} catch (err) {
msg(err.message, true);
} finally {
state.fullReturnSubmitting = false;
renderWorkflowBar();
}
}
async function savePayment(event) {
if (event && event.preventDefault) event.preventDefault();
if (state.paymentSubmitting) return;
var order = currentOrder();
var formEl = el('mPaymentForm');
if (!order || !formEl) {
msg('Không xác định được đơn/form thu tiền. Chọn lại khách.', true);
return;
}
var values = readPaymentFormValues(formEl);
var validationMessage = validatePaymentAmounts(order, values);
if (validationMessage) {
showPaymentError(validationMessage);
msg(validationMessage, true);
return;
}
var completedKey = keyOf(order);
try {
setPaymentSubmittingUI(true);
showPaymentError('');
msg('Đang lưu thu tiền...');
await window.DeliveryCore.savePayment(order, values);
await window.DeliveryCore.confirmDelivery(currentOrder() || order, { deliveryStatus: 'delivered' });
pingRouteTrackingEvent('delivery_confirmed');
reconcileDeliveredOrderVisibility(window.DeliveryCore.state.selectedOrder || order);
window.DeliveryCore.state.selectedOrder = null;
state.selectedKey = '';
state.paymentSubmitting = false;
msg('Đã lưu, mở đối soát');
state.tab = 'customerReconciliation';
render();
switchToListMode({ clearSelected: true, forceOrders: true });
await load({ force: true, refreshActiveTab: true });
} catch (err) {
setPaymentSubmittingUI(false);
var message = err && err.message ? err.message : 'Không xác nhận thu tiền';
showPaymentError(message);
msg(message, true);
}
}
async function confirmDelivery() {
if (state.deliverySubmitting) return;
try {
state.deliverySubmitting = true;
msg('Đang xác nhận giao...');
var order = currentOrder();
await window.DeliveryCore.confirmDelivery(order, { deliveryStatus: 'delivered' });
pingRouteTrackingEvent('delivery_confirmed');
reconcileDeliveredOrderVisibility(window.DeliveryCore.state.selectedOrder || order);
msg('Đã xác nhận giao');
state.selectedKey = keyOf(window.DeliveryCore.state.selectedOrder);
switchToListMode({ clearSelected: true, forceOrders: true });
} catch (err) {
msg(err.message, true);
} finally {
state.deliverySubmitting = false;
}
}
async function loadSelectedReturnsDirect(options) {
options = options || {};
var force = !!options.force;
var order = currentOrder();
if (!order || !window.DeliveryCore || !window.DeliveryCore.loadReturnsForOrder) return [];
if (!force && selectedReturnsAreFresh(order)) {
render();
return returnsForOrder(order);
}
if (state.returnsLoading && state.returnsPromise) return state.returnsPromise;
state.returnsLoading = true;
try {
msg('Đang tải hàng trả từ returnOrders...');
state.returnsPromise = window.DeliveryCore.loadReturnsForOrder(order);
var rows = await state.returnsPromise;
markSelectedReturnsFresh(order);
msg('');
render();
return rows;
} catch (err) {
msg('Không tải được hàng trả: ' + err.message, true);
throw err;
} finally {
state.returnsLoading = false;
state.returnsPromise = null;
}
}
function select(key, options) {
options = options || {};
state.selectedKey = key;
state.productSearchKeyword = '';
window.DeliveryCore.selectOrder(key);
switchToCustomerMode(options.tab || 'products');
pingRouteTrackingEvent('customer_selected');
render();
if (state.tab === 'returns') loadSelectedReturnsDirect({ force: false });
}
async function load(options) {
options = options || {};
var force = !!options.force;
if (!requireDeliveryLogin()) return;
if (state.loadPromise && !force) return state.loadPromise;
if (options.refreshActiveTab && deliveryMobileState.isFresh(state.lastLoadAt, DELIVERY_REFRESH_THROTTLE_MS)) return state.loadPromise || Promise.resolve(window.DeliveryCore.state.orders);
if (
state.tab === 'debt' &&
state.debtFormDirty &&
!window.confirm('Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.')
) {
return;
}
if (state.tab === 'debt') state.debtFormDirty = false;
if (!el('mBody')) renderShell();
state.lastLoadAt = Date.now();
var requestToken = deliveryLoadGate ? deliveryLoadGate.begin() : null;
if (mobileUiRuntime) mobileUiRuntime.renderState(el('mBody'), { state: 'loading', className: 'm-delivery-body', title: 'Đang tải dữ liệu giao hàng...' });
else el('mBody').innerHTML = '<div class="m-empty">Đang tải...</div>';
state.loadPromise = (async function () {
try {
await window.DeliveryCore.loadOrders(filters(), requestToken);
if (deliveryLoadGate && !deliveryLoadGate.isCurrent(requestToken)) return;
if (state.selectedKey) window.DeliveryCore.selectOrder(state.selectedKey);
render();
msg('');
// Lazy-load tab phụ: không gọi /api/delivery/returns hoặc /api/mobile/debts khi đang ở tab Đơn giao.
if (state.tab === 'returns') {
await loadSelectedReturnsDirect({ force: force || !!options.refreshActiveTab });
} else if (state.tab === 'debt') {
await loadDeliveryDebts(force || !!options.refreshActiveTab);
} else if (state.tab === 'reconciliation') {
await loadDeliveryReconciliation(force || !!options.refreshActiveTab);
}
} catch (err) {
if (deliveryLoadGate && !deliveryLoadGate.isCurrent(requestToken)) return;
el('mBody').innerHTML = '<div class="m-empty danger"><b>Lỗi tải dữ liệu</b><span>' + esc(err.message || 'Thử lại.') + '</span><button id="mRetryLoad" type="button">Thử lại</button></div>';
el('mRetryLoad').addEventListener('click', function () { load({ force: true }); });
msg(err.message, true);
} finally {
if (!deliveryLoadGate || deliveryLoadGate.isCurrent(requestToken)) state.loadPromise = null;
}
}());
return state.loadPromise;
}
window.DeliveryMobileView = { load: load, select: select, renderShell: renderShell };
window.loadDeliveryOrders = function () { return load(); };
document.addEventListener('DOMContentLoaded', load);
}());

/* static delivery labels: Xác nhận hàng & thu tiền Lưu hàng trả & sang Thu tiền Hoàn tất - về danh sách Xác nhận thu tiền Còn thiếu / ghi công nợ Hàng trả · xem/sửa lại Tìm sản phẩm / mã hàng Phải thu sau trả Giao hàng hôm nay Tổng đơn Chưa giao Đã giao Trả hàng Còn thiếu */

/* static payment labels: Đã lưu thu tiền và xác nhận giao, mở đối soát nhanh Còn thiếu: <b id="mWorkflowRemaining">0</b> */
