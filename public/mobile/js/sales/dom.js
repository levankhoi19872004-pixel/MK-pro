export function collectMobileSalesDom(root = document) {
  const byId = (id) => root.getElementById(id);
  return {
    tabs: root.querySelectorAll('.tab-btn'),
    panels: root.querySelectorAll('.tab-panel'),
    customerSearch: byId('customerSearch'), customerList: byId('customerList'), customerLoadMoreBtn: byId('customerLoadMoreBtn'),
    productSearch: byId('productSearch'), productGroupFilter: byId('productGroupFilter'), productSuggestions: byId('productSuggestions'),
    selectedCustomerBox: byId('selectedCustomer'), selectedProductBox: byId('selectedProduct'), caseQtyInput: byId('caseQtyInput'), looseQtyInput: byId('looseQtyInput'),
    paidAmountInput: byId('paidAmountInput'), cartList: byId('cartList'), cartCustomerContext: byId('cartCustomerContext'), cartCount: byId('cartCount'), cartTotal: byId('cartTotal'), cartGrossTotal: byId('cartGrossTotal'), cartDiscountTotal: byId('cartDiscountTotal'),
    orderDraftBar: byId('orderDraftBar'), orderDraftLineCount: byId('orderDraftLineCount'), orderDraftTotal: byId('orderDraftTotal'), openCartBtn: byId('openCartBtn'), backToOrderBtn: byId('backToOrderBtn'),
    todayOrders: byId('todayOrders'), orderLoadMoreBtn: byId('orderLoadMoreBtn'), orderSearch: byId('orderSearch'), orderDateFilter: byId('orderDateFilter'), orderStatusFilter: byId('orderStatusFilter'), orderFilterResultCount: byId('orderFilterResultCount'),
    message: byId('salesMessage'), orderFormTitle: byId('orderFormTitle'), submitOrderBtn: byId('submitOrderBtn'), cartTabBadge: byId('cartTabBadge'), syncNavBadge: byId('syncNavBadge'), networkStatus: byId('networkStatus'), mobileGlobalStatus: byId('mobileGlobalStatus'),
    debtList: byId('debtList'), debtLoadMoreBtn: byId('debtLoadMoreBtn'), debtLedgerList: byId('debtLedgerList'), debtTotalAmount: byId('debtTotalAmount'), debtCustomerCount: byId('debtCustomerCount'), debtPendingAmount: byId('debtPendingAmount'), debtTabMessage: byId('debtTabMessage'),
    debtCustomersSubtab: byId('debtCustomersSubtab'), debtCollectSubtab: byId('debtCollectSubtab'), debtCustomersPanel: byId('debtCustomersPanel'), debtCollectPanel: byId('debtCollectPanel'), debtCustomerSearch: byId('debtCustomerSearch'), debtCustomerSort: byId('debtCustomerSort')
  };
}
