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
      searchKeys: ['code','name','phone','address','area','route'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'salesCustomerSelect', value: 'id' },
        { targetId: 'salesCustomerSearch', value: 'label' }
      ],
      emptyText: 'Không tìm thấy khách hàng'
    },
    {
      key: 'customerSalesStaff',
      type: 'staff',
      inputId: 'customerStaffSearch',
      boxId: 'customerStaffSuggestions',
      source: 'users',
      roles: ['sales','admin'],
      searchKeys: ['salesStaffCode','salesmanCode','deliveryStaffCode','staffCode','code','employeeCode','salesStaffName','salesmanName','deliveryStaffName','name','fullName','phone','roleLabel','role','position','department'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'customerStaffCode', value: 'businessStaffCode' },
        { targetId: 'customerStaffName', value: 'businessStaffName' },
        { targetId: 'customerStaffSearch', value: 'label' }
      ],
      emptyText: 'Không tìm thấy nhân viên bán hàng'
    },
    {
      key: 'salesStaff',
      type: 'staff',
      inputId: 'salesStaffSearch',
      boxId: 'salesStaffSuggestions',
      source: 'users',
      roles: ['sales','admin'],
      searchKeys: ['salesStaffCode','salesmanCode','deliveryStaffCode','staffCode','code','employeeCode','salesStaffName','salesmanName','deliveryStaffName','name','fullName','phone','roleLabel','role','position','department'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'salesStaffSelect', value: 'businessStaffCode' },
        { targetId: 'salesStaffName', value: 'businessStaffName' },
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
      key: 'deliveryStaffByCode',
      type: 'staff',
      inputSelector: '#masterOrderForm [name="deliveryStaffCode"]',
      source: 'users',
      roles: ['delivery','admin'],
      searchKeys: ['salesStaffCode','salesmanCode','deliveryStaffCode','staffCode','code','employeeCode','salesStaffName','salesmanName','deliveryStaffName','name','fullName','phone','roleLabel','role','position','department'],
      onlyActive: true,
      limit: 10,
      fill: [
        { targetSelector: '#masterOrderForm [name="deliveryStaffCode"]', value: 'businessStaffCode' },
        { targetSelector: '#masterOrderForm [name="deliveryStaffName"]', value: 'businessStaffName' }
      ],
      emptyText: 'Không tìm thấy nhân viên giao hàng'
    },
    {
      key: 'deliveryStaffByName',
      type: 'staff',
      inputSelector: '#masterOrderForm [name="deliveryStaffName"]',
      source: 'users',
      roles: ['delivery','admin'],
      searchKeys: ['salesStaffCode','salesmanCode','deliveryStaffCode','staffCode','code','employeeCode','salesStaffName','salesmanName','deliveryStaffName','name','fullName','phone','roleLabel','role','position','department'],
      onlyActive: true,
      limit: 10,
      fill: [
        { targetSelector: '#masterOrderForm [name="deliveryStaffCode"]', value: 'businessStaffCode' },
        { targetSelector: '#masterOrderForm [name="deliveryStaffName"]', value: 'businessStaffName' }
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
      searchKeys: ['salesStaffCode','salesmanCode','deliveryStaffCode','staffCode','code','employeeCode','salesStaffName','salesmanName','deliveryStaffName','name','fullName','phone','roleLabel','role','position','department'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'unmergedSalesStaffFilter', value: 'businessStaffCode' }
      ],
      afterSelect: 'loadUnmergedChildOrders',
      emptyText: 'Không tìm thấy nhân viên bán hàng'
    }

    ,{
      key: 'salesOrderStaffFilter',
      type: 'staff',
      inputId: 'salesOrderStaffFilter',
      boxId: 'salesOrderStaffFilterSuggestions',
      source: 'users',
      roles: ['sales','admin'],
      searchKeys: ['salesStaffCode','salesmanCode','deliveryStaffCode','staffCode','code','employeeCode','salesStaffName','salesmanName','deliveryStaffName','name','fullName','phone','roleLabel','role','position','department'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'salesOrderStaffFilter', value: 'label' }
      ],
      afterSelect: 'loadSalesOrders',
      emptyText: 'Không tìm thấy nhân viên bán hàng'
    }
    ,{
      key: 'masterReturnDeliveryStaff',
      type: 'staff',
      inputId: 'masterReturnDeliveryStaff',
      boxId: 'masterReturnDeliveryStaffSuggestions',
      source: 'users',
      roles: ['delivery','admin'],
      searchKeys: ['salesStaffCode','salesmanCode','deliveryStaffCode','staffCode','code','employeeCode','salesStaffName','salesmanName','deliveryStaffName','name','fullName','phone','roleLabel','role','position','department'],
      onlyActive: true,
      limit: 20,
      fill: [
        { targetId: 'masterReturnDeliveryStaff', value: 'businessStaffCode' },
        { targetId: 'masterReturnDeliveryStaffName', value: 'businessStaffName' }
      ],
      afterSelect: 'loadUnmergedReturnOrders',
      emptyText: 'Không tìm thấy nhân viên giao hàng'
    }

  ];
})();
