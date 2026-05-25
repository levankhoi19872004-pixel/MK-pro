// Cấu hình tập trung cho toàn bộ trường tìm kiếm / gợi ý.
// Muốn thêm, bớt, đổi nhãn, đổi placeholder, đổi nguồn gợi ý: sửa file này.
// Không cần sửa sâu trong app.js.
(function(){
  window.KHO_SEARCH_BEHAVIOR = {
    debounceMs: 220,
    minChars: 1,
    maxSuggestions: 8,
    navigateMode: 'onSelectOrEnter',
    autoFillLinkedFields: true
  };

  window.KHO_RELATED_PAGE_LABELS = {
    customers: 'Khách hàng',
    products: 'Sản phẩm',
    accounts: 'Tài khoản / nhân viên',
    receive: 'Nhập kho',
    orders: 'Đơn hàng',
    masterOrders: 'Đơn tổng',
    promotions: 'Khuyến mại',
    debts: 'Công nợ',
    cashFund: 'Quỹ tiền'
  };

  window.KHO_RELATED_PAGE_BY_SUGGEST = {
    customer: 'customers',
    customerCode: 'customers',
    customerName: 'customers',
    customerPhone: 'customers',
    customerAddress: 'customers',

    product: 'products',
    productSku: 'products',
    productName: 'products',
    productWarehouse: 'products',
    productBrandCategory: 'products',
    productBrand: 'products',
    productCategory: 'products',

    salesStaff: 'accounts',
    deliveryStaff: 'accounts',
    allStaff: 'accounts',
    accountUser: 'accounts',
    accountName: 'accounts',
    accountCode: 'accounts',
    accountRole: 'accounts',

    receiptId: 'receive',
    supplier: 'receive',
    orderIds: 'orders',
    allOrderIds: 'orders',
    promoCodeName: 'promotions',
    promoType: 'promotions',
    fundType: 'cashFund',
    fundNote: 'cashFund',
    fundUser: 'cashFund'
  };

  window.KHO_SEARCH_FIELD_CONFIG = {
    products: [
      { id:'productSearchSku', label:'SKU', placeholder:'Tìm theo SKU', suggest:'productSku' },
      { id:'productSearchName', label:'Tên sản phẩm', placeholder:'Tìm theo tên sản phẩm', suggest:'productName' },
      { id:'productSearchWarehouse', label:'Kho quản lý', placeholder:'Tìm theo kho', suggest:'productWarehouse' },
      { id:'productSearchBrand', label:'Nhãn / ngành', placeholder:'Tìm theo nhãn/ngành', suggest:'productBrandCategory' }
    ],
    stock: [
      { id:'stockSearchSku', label:'SKU', placeholder:'Tìm SKU', suggest:'productSku' },
      { id:'stockSearchName', label:'Tên sản phẩm', placeholder:'Tìm tên sản phẩm', suggest:'productName' },
      { id:'stockSearchWarehouse', label:'Kho quản lý', placeholder:'Tìm kho', suggest:'productWarehouse' }
    ],
    receive: [
      { id:'receiveFrom', to:'receiveTo', type:'dateRange', label:'Từ ngày / Đến ngày', prefix:'receive' },
      { id:'receiveSearchId', label:'Mã phiếu', placeholder:'Tìm mã phiếu', suggest:'receiptId' },
      { id:'receiveSearchSupplier', label:'Nhà cung cấp', placeholder:'Tìm NCC', suggest:'supplier' },
      { id:'receiveSearchSku', label:'SKU / sản phẩm', placeholder:'Tìm SKU / sản phẩm', suggest:'product' },
      { id:'receiveSearchStatus', label:'Trạng thái', placeholder:'Nháp / Đã ghi sổ', values:['Nháp','Đã ghi sổ'] }
    ],
    orders: [
      { id:'ordersFrom', to:'ordersTo', type:'dateRange', label:'Từ ngày / Đến ngày', prefix:'orders' },
      { id:'ordersStaffSearch', label:'Mã NV / Nhân viên', placeholder:'Mã NV/Nhân Viên', suggest:'allStaff' },
      { id:'ordersCustomerSearch', label:'Mã KH / Khách hàng', placeholder:'Mã KH/Khách Hàng', suggest:'customer' }
    ],
    masterOrders: [
      { id:'masterFrom', to:'masterTo', type:'dateRange', label:'Từ ngày / Đến ngày', prefix:'master' },
      { id:'masterSearchOrder', label:'Mã đơn / Đơn tổng', placeholder:'Tìm mã đơn', suggest:'allOrderIds' },
      { id:'masterSearchCustomer', label:'Mã KH / Khách hàng', placeholder:'Tìm khách hàng', suggest:'customer' },
      { id:'masterSearchDelivery', label:'Mã NV giao / Người giao', placeholder:'Tìm NV giao hàng', suggest:'deliveryStaff' }
    ],
    customers: [
      { id:'customerSearchCode', label:'Mã KH', placeholder:'Tìm mã KH', suggest:'customerCode' },
      { id:'customerSearchName', label:'Tên khách hàng', placeholder:'Tìm tên KH', suggest:'customerName' },
      { id:'customerSearchPhone', label:'Số điện thoại', placeholder:'Tìm SĐT', suggest:'customerPhone' },
      { id:'customerSearchAddress', label:'Địa chỉ', placeholder:'Tìm địa chỉ', suggest:'customerAddress' }
    ],
    promotions: [
      { id:'promoSearchCode', label:'Mã CTKM / tên CTKM', placeholder:'Tìm CTKM', suggest:'promoCodeName' },
      { id:'promoSearchSku', label:'SKU / sản phẩm', placeholder:'Tìm SKU / sản phẩm', suggest:'product' },
      { id:'promoSearchType', label:'Loại khuyến mại', placeholder:'Tìm loại', suggest:'promoType' },
      { id:'promoSearchDate', label:'Ngày hiệu lực', type:'date' }
    ],
    debts: [
      { id:'debtFrom', to:'debtTo', type:'dateRange', label:'Từ ngày / Đến ngày', prefix:'debt' },
      { id:'debtSearchOrder', label:'Mã đơn', placeholder:'Tìm mã đơn', suggest:'orderIds' },
      { id:'debtSearchCustomer', label:'Mã KH / Khách hàng', placeholder:'Tìm khách hàng', suggest:'customer' },
      { id:'debtSearchSales', label:'Mã NV bán / Nhân viên bán', placeholder:'Tìm NV bán', suggest:'salesStaff' },
      { id:'debtSearchDelivery', label:'Mã NV giao / Nhân viên giao', placeholder:'Tìm NV giao', suggest:'deliveryStaff' }
    ],
    cashFund: [
      { id:'fundDate', label:'Ngày', type:'date', defaultToday:true },
      { id:'fundSearchType', label:'Loại giao dịch', placeholder:'Thu / chi / nộp / chuyển khoản', suggest:'fundType' },
      { id:'fundSearchNote', label:'Nội dung', placeholder:'Tìm nội dung', suggest:'fundNote' },
      { id:'fundSearchUser', label:'Người thao tác', placeholder:'Tìm người thao tác', suggest:'fundUser' }
    ],
    accounts: [
      { id:'accountSearchUser', label:'Tài khoản', placeholder:'Tìm tài khoản', suggest:'accountUser' },
      { id:'accountSearchName', label:'Tên nhân viên', placeholder:'Tìm tên', suggest:'accountName' },
      { id:'accountSearchCode', label:'Mã nhân viên', placeholder:'Tìm mã', suggest:'accountCode' },
      { id:'accountSearchRole', label:'Vai trò', placeholder:'Tìm vai trò', suggest:'accountRole' }
    ]
  };
})();
