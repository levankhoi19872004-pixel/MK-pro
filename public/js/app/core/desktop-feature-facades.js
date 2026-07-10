'use strict';

(function setupDesktopFeatureFacades() {
  var loader = window.MKFeatureModuleLoader;
  if (!loader) throw new Error('MKFeatureModuleLoader is required before desktop feature facades');

  function isRealFunction(name) {
    return typeof window[name] === 'function' && window[name].__mkproFeatureFacade !== true;
  }

  function registerFeature(name, script, readyName) {
    loader.register(name, {
      scripts: [script],
      retries: 1,
      timeoutMs: 15000,
      readyCheck: function readyCheck() { return isRealFunction(readyName); }
    });
  }

  registerFeature('masterOrders', '/js/app/06-master-delivery.js?v=phase69-unmerged-refresh-v1&patch=phase73-excel-interaction-v1', 'loadMasterOrderModule');
  registerFeature('masterReturnOrders', '/js/app/debt/07d-master-return-orders.js?v=phase82-master-return-popup-v1', 'openMasterReturnOrderModal');
  registerFeature('deliveryTodayNew', '/js/app/new/91-delivery-today-new.js?v=phase199-bulk-manual-save-replay-v1', 'loadDeliveryTodayNew');
  registerFeature('debtNew', '/js/app/new/92-debt-new.js?v=phase91-new-modules-v1', 'loadDebtNew');
  registerFeature('reports', '/js/app/admin/08a-reports.js?v=phase76-report-directory-popup-v1', 'loadReports');
  registerFeature('promotionPrograms', '/js/app/admin/08e-promotion-programs.js?v=phase35-admin-split-v1', 'loadPromotionPrograms');

  async function loadFeature(name, options) {
    return loader.load(name, options || {});
  }

  async function callFeature(name, globalName, thisArg, args) {
    await loadFeature(name);
    var fn = window[globalName];
    if (typeof fn === 'function' && fn.__mkproFeatureFacade !== true) {
      return fn.apply(thisArg || window, args || []);
    }
    throw new Error('Desktop feature did not expose ' + globalName);
  }

  function defineFacade(name, featureName) {
    if (isRealFunction(name)) return;
    var facade = function desktopFeatureFacade() {
      return callFeature(featureName, name, this, Array.prototype.slice.call(arguments));
    };
    facade.__mkproFeatureFacade = true;
    facade.__mkproFeatureName = featureName;
    window[name] = facade;
  }

  function defineNoop(name, fn) {
    if (typeof window[name] === 'function') return;
    window[name] = fn;
  }

  function defaultDeliveryDate(baseDate) {
    var match = String(baseDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() + (date.getUTCDay() === 6 ? 2 : 1));
    return date.toISOString().slice(0, 10);
  }

  defineNoop('loadDeliveryTodayOrders', function loadDeliveryTodayOrdersFacade() {
    return window.DeliveryWebView && window.DeliveryWebView.load ? window.DeliveryWebView.load() : null;
  });
  defineNoop('loadDeliveryToday', window.loadDeliveryTodayOrders);
  defineNoop('submitDeliveryEdit', function submitDeliveryEditFacade(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (typeof alert === 'function') alert('Man giao hang da chuyen sang loi chung. Vui long dung giao dien Don giao hom nay moi.');
  });
  defineNoop('clearDeliveryEditPanel', function clearDeliveryEditPanelFacade() {});
  defineNoop('recalcDeliveryEditDebt', function recalcDeliveryEditDebtFacade() {});
  defineNoop('masterOrderDefaultDeliveryDate', defaultDeliveryDate);

  [
    'loadMasterOrderModule',
    'loadMasterOrders',
    'loadUnmergedChildOrders',
    'reloadUnmergedChildOrdersNow',
    'scheduleUnmergedChildOrdersReload',
    'openMasterOrderModal',
    'closeMasterOrderModal',
    'resetMasterOrderModal',
    'submitMasterOrder',
    'toggleSelectAllMasterOrders',
    'printSelectedMasterOrders',
    'editMasterOrderFromList',
    'cancelMasterOrderFromList'
  ].forEach(function bindMasterOrder(name) { defineFacade(name, 'masterOrders'); });

  [
    'openMasterReturnOrderModal',
    'closeMasterReturnOrderModal',
    'resetMasterReturnOrderModal',
    'loadUnmergedReturnOrders',
    'loadMasterReturnOrders',
    'toggleSelectAllMasterReturnOrders',
    'printSelectedMasterReturnOrders',
    'receiveSelectedMasterReturnOrders',
    'cancelMasterReturnOrder',
    'viewMasterReturnOrder',
    'receiveMasterReturnOrder',
    'printMasterReturnOrder'
  ].forEach(function bindMasterReturn(name) { defineFacade(name, 'masterReturnOrders'); });

  defineFacade('loadDeliveryTodayNew', 'deliveryTodayNew');
  defineFacade('openDeliveryTodayAdjustmentFromNotification', 'deliveryTodayNew');
  defineFacade('loadDebtNew', 'debtNew');

  [
    'loadReports',
    'setReportDefaults',
    'openReport',
    'openReportCenterModal',
    'closeReportCenterModal'
  ].forEach(function bindReports(name) { defineFacade(name, 'reports'); });

  [
    'loadPromotionPrograms',
    'loadPromotionProgramsByType',
    'reloadPromotionRules',
    'openPromotionWorkspace',
    'closePromotionWorkspace',
    'viewPromotionProgramByType',
    'selectPromotionProgramByType',
    'cancelPromotionProgramByType'
  ].forEach(function bindPromotionPrograms(name) { defineFacade(name, 'promotionPrograms'); });

  window.addEventListener('mkpro:delivery-open-adjustment', function lazyDeliveryAdjustment(event) {
    if (isRealFunction('openDeliveryTodayAdjustmentFromNotification')) return;
    if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    callFeature('deliveryTodayNew', 'openDeliveryTodayAdjustmentFromNotification', window, [event ? event.detail : {}])
      .catch(function onError(error) { console.warn('[DESKTOP_FEATURE_DELIVERY_ADJUSTMENT_ERROR]', error); });
  }, true);

  window.MKDesktopFeatures = {
    load: loadFeature,
    isReady: function isReady(name) { return loader.isReady(name); },
    isFacade: function isFacade(fn) { return !!(fn && fn.__mkproFeatureFacade === true); }
  };
}());
