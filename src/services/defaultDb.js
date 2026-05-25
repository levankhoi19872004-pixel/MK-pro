function emptyDb(){
  return {
    // Master data: chỉ lưu thông tin sản phẩm, không lưu tồn kho trực tiếp
    products: [],
    // Stock ledger hiện tại: tồn kho tách riêng khỏi danh mục sản phẩm
    stocks: [],
    receipts: [], orders: [], customers: [], staff: [], deliveryStaff: [],
    users: [], masterOrders: [], debts: [], debtLedger: [], payments: [], returns: [], cashFund: [], auditLogs: [],
    promotions: [], dmsOrders: [], dmsStocks: [], dmsAllocations: [], stockShortages: [],
    documents: [], stockJournal: [], stockAdjustments: [], transfers: [], cashVouchers: []
  };
}
module.exports = { emptyDb };
