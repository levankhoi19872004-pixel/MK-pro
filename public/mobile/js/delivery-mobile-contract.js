(function () {
  'use strict';

  var DELIVERY_UI_CONTRACT = {
    header: {
      rootClass: 'm-delivery-header',
      compactClass: 'm-delivery-header-compact',
      moreMenuClass: 'm-delivery-more-menu',
      secondaryActionsClass: 'm-delivery-secondary-actions'
    },
    kpis: {
      routeCountId: 'mKpiTotalOrders',
      mustCollectId: 'mKpiPt',
      pendingLegacyId: 'mKpiPendingOrders',
      mustCollectLabel: 'Phải thu'
    },
    tabs: {
      listMode: ['orders', 'reconciliation', 'debt'],
      customerMode: ['products', 'payment', 'customerReconciliation', 'debt']
    },
    orderCard: {
      mustCollectLabel: 'Phải thu',
      metricClass: 'm-order-must-collect',
      metricName: 'must-collect'
    },
    bottomAction: {
      baseClass: 'm-delivery-bottom-action',
      activeClass: 'active',
      oneHandClass: 'delivery-one-hand-bar'
    }
  };

  window.DeliveryMobileContract = DELIVERY_UI_CONTRACT;
})();
