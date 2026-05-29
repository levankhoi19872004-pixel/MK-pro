/*
 * Search Fields Config - khai báo toàn bộ trường gợi ý ở một nơi.
 * Muốn thêm trường mới: thêm 1 object vào SEARCH_FIELD_CONFIGS, không viết hàm gợi ý riêng.
 */
(function(){
  'use strict';

  window.SEARCH_FIELD_CONFIGS = [
    {
      key: 'productListSearch',
      type: 'product',
      inputId: 'searchInput',
      source: 'products',
      searchKeys: ['code','name','barcode','category','packing','unit','baseUnit'],
      onlyActive: true,
      limit: 10,
      fill: [{ targetId: 'searchInput', value: 'code' }],
      afterSelect: 'reloadProducts',
      emptyText: 'Không tìm thấy sản phẩm'
    },
    {
      key: 'customerListSearch',
      type: 'customer',
      inputId: 'customerSearchInput',
      source: 'customers',
      searchKeys: ['code','name','phone','address','area','route','staffName'],
      onlyActive: true,
      limit: 10,
      fill: [{ targetId: 'customerSearchInput', value: 'code' }],
      afterSelect: 'reloadCustomers',
      emptyText: 'Không tìm thấy khách hàng'
    },
    {
      key: 'importProduct',
      type: 'product',
      inputId: 'importProductSearch',
      boxId: 'importProductSuggestions',
      source: 'products',
      searchKeys: ['code','name','barcode','category','packing','unit','baseUnit'],
      onlyActive: true,
      limit: 20,
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
      source: 'products',
      searchKeys: ['code','name','barcode','category','packing','unit','baseUnit'],
      onlyActive: true,
      onlyInStock: true,
      limit: 20,
      fill: [
        { targetId: 'salesProductSelect', value: 'idOrCode' },
        { targetId: 'salesProductSearch', value: 'label' }
      ],
      afterSelect: 'setSalesPrice',
      emptyText: 'Không tìm thấy sản phẩm'
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
  ];
})();
