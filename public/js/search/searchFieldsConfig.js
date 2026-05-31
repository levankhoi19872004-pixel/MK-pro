/*
 * Search Fields Config - khai báo toàn bộ trường gợi ý ở một nơi.
 * Muốn thêm trường mới: thêm 1 object vào SEARCH_FIELD_CONFIGS, không viết hàm gợi ý riêng.
 */
(function(){
  'use strict';

  window.SEARCH_FIELD_CONFIGS = [
    // Danh sách sản phẩm/khách hàng KHÔNG dùng popup autocomplete.
    // Hai ô này lọc trực tiếp bảng qua /api/products và /api/customers.
    {
      key: 'importProduct',
      type: 'product',
      inputId: 'importProductSearch',
      boxId: 'importProductSuggestions',
      source: 'unifiedProducts',
      searchKeys: ['code','name','barcode','category','brand','sku','productCode','packing','unit','baseUnit'],
      onlyActive: true,
      limit: 50,
      fill: [
        { targetId: 'importProductSelect', value: 'idOrCode' },
        { targetId: 'importProductSearch', value: 'label' }
      ],
      afterSelect: 'setImportCostPrice',
      emptyText: 'Không tìm thấy sản phẩm'
    },
    {
      key: 'salesCustomer',
      type: 'customer',
      inputId: 'salesCustomerSearch',
      boxId: 'salesCustomerSuggestions',
      source: 'customers',
      searchKeys: ['code','name','phone','address','area','route','staffName'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'salesCustomerSelect', value: 'id' },
        { targetId: 'salesCustomerSearch', value: 'label' }
      ],
      emptyText: 'Không tìm thấy khách hàng'
    },
    {
      key: 'salesStaff',
      type: 'staff',
      inputId: 'salesStaffSearch',
      boxId: 'salesStaffSuggestions',
      source: 'users',
      roles: ['sales','admin'],
      searchKeys: ['code','username','name','fullName','phone','roleLabel','role'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'salesStaffSelect', value: 'codeOrUsernameOrId' },
        { targetId: 'salesStaffName', value: 'nameOrFullNameOrUsername' },
        { targetId: 'salesStaffSearch', value: 'label' }
      ],
      emptyText: 'Không tìm thấy nhân viên bán hàng'
    },
    {
      key: 'salesProduct',
      type: 'product',
      inputId: 'salesProductSearch',
      boxId: 'salesProductSuggestions',
      source: 'unifiedProducts',
      searchKeys: ['code','name','barcode','category','brand','sku','productCode','packing','unit','baseUnit'],
      onlyActive: true,
      limit: 50,
      fill: [
        { targetId: 'salesProductSelect', value: 'idOrCode' },
        { targetId: 'salesProductSearch', value: 'label' }
      ],
      afterSelect: 'setSalesPrice',
      emptyText: 'Không tìm thấy sản phẩm phù hợp. Kiểm tra /api/products hoặc dữ liệu sản phẩm.'
    },
    {
      key: 'debtCustomerFilter',
      type: 'debtCustomer',
      inputId: 'debtSearchInput',
      boxId: 'debtSearchSuggestions',
      source: 'debts',
      searchKeys: ['customerCode','customerName','phone','address'],
      limit: 20,
      fill: [
        { targetId: 'debtSearchInput', value: 'customerIdOrCode' }
      ],
      afterSelect: 'loadDebts',
      emptyText: 'Không tìm thấy khách đang nợ'
    },
    {
      key: 'debtSalesmanFilter',
      type: 'staff',
      inputId: 'debtSalesmanFilter',
      boxId: 'debtSalesmanFilterSuggestions',
      source: 'users',
      roles: ['sales','admin'],
      searchKeys: ['code','username','name','fullName','phone','roleLabel','role'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'debtSalesmanFilter', value: 'codeOrUsernameOrId' }
      ],
      afterSelect: 'loadDebts',
      emptyText: 'Không tìm thấy nhân viên bán hàng'
    },
    {
      key: 'debtDeliveryFilter',
      type: 'staff',
      inputId: 'debtDeliveryFilter',
      boxId: 'debtDeliveryFilterSuggestions',
      source: 'users',
      roles: ['delivery','admin'],
      searchKeys: ['code','username','name','fullName','phone','roleLabel','role'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'debtDeliveryFilter', value: 'codeOrUsernameOrId' }
      ],
      afterSelect: 'loadDebts',
      emptyText: 'Không tìm thấy nhân viên giao hàng'
    },
    {
      key: 'collectionCustomer',
      type: 'debtCustomer',
      inputId: 'collectionCustomerSearch',
      boxId: 'collectionCustomerSuggestions',
      source: 'debts',
      searchKeys: ['customerCode','customerName','phone','address'],
      limit: 20,
      fill: [
        { targetId: 'collectionCustomerSelect', value: 'customerIdOrCode' },
        { targetId: 'collectionCustomerSearch', value: 'label' }
      ],
      afterSelect: 'setCollectionAmount',
      emptyText: 'Không tìm thấy khách đang nợ'
    },
    {
      key: 'deliveryStaffByCode',
      type: 'staff',
      inputSelector: '#masterOrderForm [name="deliveryStaffCode"]',
      source: 'users',
      roles: ['delivery','admin'],
      searchKeys: ['code','username','name','fullName','phone','roleLabel','role'],
      onlyActive: true,
      limit: 10,
      fill: [
        { targetSelector: '#masterOrderForm [name="deliveryStaffCode"]', value: 'codeOrUsernameOrId' },
        { targetSelector: '#masterOrderForm [name="deliveryStaffName"]', value: 'nameOrFullNameOrUsername' }
      ],
      emptyText: 'Không tìm thấy nhân viên giao hàng'
    },
    {
      key: 'deliveryStaffByName',
      type: 'staff',
      inputSelector: '#masterOrderForm [name="deliveryStaffName"]',
      source: 'users',
      roles: ['delivery','admin'],
      searchKeys: ['code','username','name','fullName','phone','roleLabel','role'],
      onlyActive: true,
      limit: 10,
      fill: [
        { targetSelector: '#masterOrderForm [name="deliveryStaffCode"]', value: 'codeOrUsernameOrId' },
        { targetSelector: '#masterOrderForm [name="deliveryStaffName"]', value: 'nameOrFullNameOrUsername' }
      ],
      emptyText: 'Không tìm thấy nhân viên giao hàng'
    }
    ,{
      key: 'unmergedSalesStaffFilter',
      type: 'staff',
      inputId: 'unmergedSalesStaffFilter',
      boxId: 'unmergedSalesStaffSuggestions',
      source: 'users',
      roles: ['sales','admin'],
      searchKeys: ['code','username','name','fullName','phone','roleLabel','role'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'unmergedSalesStaffFilter', value: 'codeOrUsernameOrId' }
      ],
      afterSelect: 'loadUnmergedChildOrders',
      emptyText: 'Không tìm thấy nhân viên bán hàng'
    }
    ,{
      key: 'deliveryStaffFilter',
      type: 'staff',
      inputId: 'deliveryStaffFilter',
      boxId: 'deliveryStaffFilterSuggestions',
      source: 'users',
      roles: ['delivery','admin'],
      searchKeys: ['code','username','name','fullName','phone','roleLabel','role'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'deliveryStaffFilter', value: 'codeOrUsernameOrId' }
      ],
      afterSelect: 'loadDeliveryToday',
      emptyText: 'Không tìm thấy nhân viên giao hàng'
    }
  ];
})();
