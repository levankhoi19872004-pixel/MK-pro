'use strict';

const SalesReportService = require('./SalesReportService');
const InventoryReportService = require('./InventoryReportService');
const DebtReportService = require('./DebtReportService');
const FinanceReportService = require('./FinanceReportService');
const DeliveryReportService = require('./DeliveryReportService');
const ReturnReportService = require('./ReturnReportService');
const RewardReportService = require('./RewardReportService');
const DashboardReportService = require('./DashboardReportService');
const HomeDashboardService = require('../dashboard/HomeDashboardService');
const InformationReportService = require('./InformationReportService');
const arLedgerReadService = require('../arLedgerRead.service');
const { getReportSourceContract } = require('./ReportSourceRegistry');
const { paginate, text, toNumber } = require('./ReportDomainUtils');

const REPORT_CATEGORIES = Object.freeze([
  { code: 'executive', title: 'Điều hành', description: 'KPI, xu hướng và cảnh báo cần xử lý.' },
  { code: 'sales', title: 'Bán hàng', description: 'Doanh số, khách hàng, sản phẩm và hiệu suất NVBH.' },
  { code: 'inventory', title: 'Tồn kho', description: 'Tồn hiện tại, nhập - xuất - tồn và thẻ kho.' },
  { code: 'debt', title: 'Công nợ', description: 'Số dư, phát sinh và sổ chi tiết AR Ledger.' },
  { code: 'delivery', title: 'Giao hàng', description: 'Chuyến giao, nhân viên giao hàng và tiền đã thu.' },
  { code: 'finance', title: 'Quỹ', description: 'Sổ quỹ tiền mặt, ngân hàng và số dư theo tài khoản.' },
  { code: 'returns', title: 'Trả hàng', description: 'Phiếu trả, nhập lại kho và giảm công nợ.' },
  { code: 'control', title: 'Kiểm soát', description: 'Ngoại lệ số liệu và cảnh báo chất lượng dữ liệu.' },
  { code: 'information', title: 'Báo cáo thông tin', description: 'Tra cứu master-data sản phẩm, khách hàng và nhân viên.' }
]);

const BUSINESS_ROLES = Object.freeze(['admin', 'manager', 'accountant']);
const SALES_ROLES = BUSINESS_ROLES;
const STOCK_ROLES = Object.freeze(['admin', 'manager', 'accountant', 'warehouse']);
const STOCK_VIEW_ROLES = Object.freeze(['admin', 'manager', 'accountant', 'warehouse', 'sales']);

const REPORT_DEFINITIONS = Object.freeze([
  {
    code: 'sales-kpi', category: 'executive', title: 'KPI nhân viên bán hàng',
    description: 'Chỉ tiêu, doanh số ròng, hàng trả, công nợ và tỷ lệ hoàn thành theo tháng.',
    roles: SALES_ROLES, dateMode: 'month', exportType: 'salesman-report',
    columns: [
      ['salesStaffCode', 'Mã NVBH'], ['salesStaffName', 'Nhân viên bán hàng'],
      ['targetAmount', 'Chỉ tiêu', 'money'], ['salesAmount', 'Doanh số xác nhận', 'money'],
      ['pendingSalesAmount', 'Chờ xác nhận', 'money'], ['returnAmount', 'Hàng trả', 'money'],
      ['netSalesAmount', 'Doanh số ròng', 'money'], ['achievementRate', 'Hoàn thành', 'percent'],
      ['debtAmount', 'Công nợ', 'money'], ['todaySalesAmount', 'Hôm nay', 'money'], ['status', 'Trạng thái', 'status']
    ],
    chart: { labelKey: 'salesStaffName', valueKey: 'netSalesAmount', valueType: 'money' }
  },
  {
    code: 'sales-by-day', category: 'sales', title: 'Doanh số theo ngày',
    description: 'Theo dõi xu hướng đơn hàng, doanh số, khuyến mại, thu tiền và công nợ phát sinh.',
    roles: SALES_ROLES, dateMode: 'range', exportType: 'sales-report',
    columns: [
      ['date', 'Ngày', 'date'], ['orderCount', 'Số đơn', 'number'], ['customerCount', 'Khách mua', 'number'],
      ['beforePromoAmount', 'Trước khuyến mại', 'money'], ['actualAmount', 'Doanh số thực', 'money'],
      ['promotionValue', 'Giá trị KM', 'money'], ['receiptAmount', 'Đã thu', 'money'],
      ['returnAmount', 'Hàng trả', 'money'], ['netSalesAmount', 'Doanh số ròng', 'money'], ['debtAmount', 'Công nợ', 'money']
    ],
    chart: { labelKey: 'date', valueKey: 'netSalesAmount', valueType: 'money' }
  },
  {
    code: 'sales-by-staff', category: 'sales', title: 'Doanh số theo NVBH',
    description: 'Tổng hợp số đơn, khách mua, doanh số, khuyến mại, thu tiền và công nợ theo NVBH.',
    roles: SALES_ROLES, dateMode: 'range', exportType: 'salesman-report',
    columns: [
      ['salesmanCode', 'Mã NVBH'], ['salesmanName', 'Nhân viên bán hàng'], ['orderCount', 'Số đơn', 'number'],
      ['customerCount', 'Khách mua', 'number'], ['beforePromoAmount', 'Trước KM', 'money'],
      ['actualAmount', 'Doanh số thực', 'money'], ['promotionValue', 'Giá trị KM', 'money'],
      ['receiptAmount', 'Đã thu', 'money'], ['returnAmount', 'Hàng trả', 'money'],
      ['netSalesAmount', 'Doanh số ròng', 'money'], ['debtAmount', 'Công nợ', 'money']
    ],
    chart: { labelKey: 'salesmanName', valueKey: 'netSalesAmount', valueType: 'money' }
  },
  {
    code: 'sales-by-customer', category: 'sales', title: 'Doanh số theo khách hàng',
    description: 'Đóng góp doanh số, tần suất mua, khuyến mại, thu tiền và công nợ từng khách hàng.',
    roles: SALES_ROLES, dateMode: 'range', exportType: 'customer-sales-report',
    columns: [
      ['customerCode', 'Mã KH'], ['customerName', 'Khách hàng'], ['salesStaffName', 'NVBH'],
      ['orderCount', 'Số đơn', 'number'], ['beforePromoAmount', 'Trước KM', 'money'],
      ['actualAmount', 'Doanh số thực', 'money'], ['promotionValue', 'Giá trị KM', 'money'],
      ['returnAmount', 'Hàng trả', 'money'], ['netSalesAmount', 'Doanh số ròng', 'money'],
      ['receiptAmount', 'Đã thu', 'money'], ['debtAmount', 'Công nợ', 'money'], ['averageOrderValue', 'TB/đơn', 'money']
    ],
    chart: { labelKey: 'customerName', valueKey: 'netSalesAmount', valueType: 'money' }
  },
  {
    code: 'sales-by-product', category: 'sales', title: 'Doanh số theo sản phẩm',
    description: 'Sản lượng, doanh số trước/sau khuyến mại và giá bán bình quân theo sản phẩm.',
    roles: SALES_ROLES, dateMode: 'range', exportType: 'product-sales-report',
    columns: [
      ['productCode', 'Mã SP'], ['productName', 'Sản phẩm'], ['brand', 'Nhãn hàng'], ['category', 'Nhóm hàng'],
      ['unit', 'ĐVT'], ['orderCount', 'Số đơn', 'number'], ['customerCount', 'Khách mua', 'number'],
      ['quantity', 'Số lượng', 'number'], ['beforePromoAmount', 'Trước KM', 'money'],
      ['actualAmount', 'Doanh số thực', 'money'], ['promotionDiscountAmount', 'Chiết khấu', 'money'],
      ['averageUnitPrice', 'Giá bán TB', 'money']
    ],
    chart: { labelKey: 'productName', valueKey: 'actualAmount', valueType: 'money' }
  },
  {
    code: 'sales-detail', category: 'sales', title: 'Chi tiết đơn bán đã xác nhận',
    description: 'Danh sách chứng từ đã xác nhận kế toán, có thể truy vết theo khách hàng và nhân viên.',
    roles: SALES_ROLES, dateMode: 'range', exportType: 'sales-report',
    columns: [
      ['date', 'Ngày', 'date'], ['code', 'Mã đơn'], ['source', 'Nguồn'], ['customerCode', 'Mã KH'],
      ['customerName', 'Khách hàng'], ['salesStaffName', 'NVBH'], ['deliveryStaffName', 'NVGH'],
      ['saleQuantity', 'SL bán', 'number'], ['beforePromoAmount', 'Trước KM', 'money'],
      ['actualAmount', 'Doanh số thực', 'money'], ['promotionValue', 'Giá trị KM', 'money'],
      ['receiptAmount', 'Đã thu', 'money'], ['returnAmount', 'Hàng trả', 'money'], ['debtAmount', 'Công nợ', 'money']
    ]
  },
  {
    code: 'inventory-current', category: 'inventory', title: 'Tồn kho hiện tại',
    description: 'Tồn vật lý canonical từ inventories; không phụ thuộc bộ lọc ngày.',
    roles: STOCK_VIEW_ROLES, dateMode: 'none', exportType: 'stock-report',
    columns: [
      ['productCode', 'Mã SP'], ['productName', 'Sản phẩm'], ['warehouseCode', 'Kho'], ['unit', 'ĐVT'],
      ['onHand', 'Tồn thực tế', 'number'], ['reservedQty', 'Đã giữ', 'number'], ['availableQty', 'Có thể bán', 'number']
    ],
    chart: { labelKey: 'productName', valueKey: 'availableQty', valueType: 'number' }
  },
  {
    code: 'inventory-movement', category: 'inventory', title: 'Nhập - xuất - tồn',
    description: 'Số dư đầu kỳ, nhập, trả, bán, điều chỉnh và tồn cuối kỳ theo sản phẩm.',
    roles: STOCK_ROLES, dateMode: 'range', exportType: 'inventory-movement-report',
    columns: [
      ['productCode', 'Mã SP'], ['productName', 'Sản phẩm'], ['unit', 'ĐVT'],
      ['openingQty', 'Tồn đầu', 'number'], ['importQty', 'Nhập hàng', 'number'], ['returnQty', 'Hàng trả', 'number'],
      ['otherInQty', 'Nhập khác', 'number'], ['saleQty', 'Xuất bán', 'number'], ['otherOutQty', 'Xuất khác', 'number'],
      ['adjustmentQty', 'Điều chỉnh', 'number'], ['endingQty', 'Tồn cuối', 'number'],
      ['reconciliationDifference', 'Lệch ledger', 'number']
    ]
  },
  {
    code: 'stock-card', category: 'inventory', title: 'Thẻ kho chi tiết',
    description: 'Truy vết từng biến động nhập/xuất và số dư chạy theo sản phẩm.',
    roles: STOCK_ROLES, dateMode: 'range', exportType: 'stock-card-report',
    columns: [
      ['date', 'Ngày', 'date'], ['productCode', 'Mã SP'], ['productName', 'Sản phẩm'],
      ['type', 'Loại'], ['refCode', 'Chứng từ'], ['openingQty', 'Đầu', 'number'],
      ['inQty', 'Nhập', 'number'], ['outQty', 'Xuất', 'number'], ['balanceQty', 'Cuối', 'number'], ['note', 'Ghi chú']
    ]
  },
  {
    code: 'debt-current', category: 'debt', title: 'Công nợ hiện tại',
    description: 'Số dư công nợ hiện tại/as-of từ arLedgers canonical, không bị cắt bởi dateFrom.',
    roles: BUSINESS_ROLES, dateMode: 'none', exportType: '',
    columns: [
      ['customerCode', 'Mã KH'], ['customerName', 'Khách hàng'], ['salesStaffName', 'NVBH'],
      ['deliveryStaffName', 'NVGH'], ['debit', 'Tổng phát sinh nợ', 'money'],
      ['credit', 'Tổng phát sinh có', 'money'], ['remainingDebt', 'Công nợ hiện tại', 'money'],
      ['orderCount', 'Đơn còn nợ', 'number'], ['ledgerCount', 'Số bút toán', 'number'], ['lastDebtDate', 'Ngày phát sinh cuối', 'date']
    ],
    chart: { labelKey: 'customerName', valueKey: 'remainingDebt', valueType: 'money' }
  },

  {
    code: 'debt-period', category: 'debt', title: 'Công nợ khách hàng theo kỳ',
    description: 'Đầu kỳ, phát sinh bán, thu tiền, trả hàng, điều chỉnh và cuối kỳ từ arLedgers.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: 'debt-report',
    columns: [
      ['customerCode', 'Mã KH'], ['customerName', 'Khách hàng'], ['salesStaffName', 'NVBH'],
      ['deliveryStaffName', 'NVGH'], ['openingBalance', 'Nợ đầu kỳ', 'money'],
      ['debitInPeriod', 'Phát sinh nợ', 'money'], ['receiptInPeriod', 'Đã thu', 'money'],
      ['returnInPeriod', 'Giảm do trả', 'money'], ['adjustmentInPeriod', 'Điều chỉnh', 'money'],
      ['closingBalance', 'Nợ cuối kỳ', 'money'], ['transactionCount', 'Số phát sinh', 'number']
    ],
    chart: { labelKey: 'customerName', valueKey: 'closingBalance', valueType: 'money' }
  },
  {
    code: 'debt-ledger', category: 'debt', title: 'Sổ công nợ chi tiết',
    description: 'Từng bút toán AR Ledger với số dư đầu, phát sinh nợ/có và số dư cuối.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: 'ar-ledger-detail',
    columns: [
      ['date', 'Ngày', 'date'], ['customerCode', 'Mã KH'], ['customerName', 'Khách hàng'],
      ['documentCode', 'Chứng từ'], ['type', 'Loại'], ['description', 'Diễn giải'],
      ['openingBalance', 'Đầu', 'money'], ['debit', 'Nợ', 'money'], ['credit', 'Có', 'money'], ['closingBalance', 'Cuối', 'money']
    ]
  },
  {
    code: 'rewards-by-customer', category: 'debt', title: 'Khách hàng đã trả thưởng',
    description: 'Lọc các nhà đã được trả thưởng/cấn trừ công nợ trong kỳ từ bút toán AR-BONUS.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: '',
    columns: [
      ['customerCode', 'Mã KH'], ['customerName', 'Khách hàng'],
      ['salesStaffName', 'NVBH'], ['deliveryStaffName', 'NVGH'],
      ['rewardCount', 'Lần trả thưởng', 'number'], ['orderCount', 'Số đơn', 'number'],
      ['totalRewardAmount', 'Tổng trả thưởng', 'money'], ['averageRewardAmount', 'Bình quân/lần', 'money'],
      ['firstRewardDate', 'Trả lần đầu', 'date'], ['lastRewardDate', 'Trả gần nhất', 'date'],
      ['latestOrderCode', 'Đơn gần nhất']
    ],
    chart: { labelKey: 'customerName', valueKey: 'totalRewardAmount', valueType: 'money' }
  },
  {
    code: 'delivery-by-staff', category: 'delivery', title: 'Hiệu suất nhân viên giao hàng',
    description: 'Chuyến giao, số đơn, doanh số giao, xác nhận kế toán và tiền đã thu theo NVGH.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: 'deliveryman-report',
    columns: [
      ['deliveryStaffCode', 'Mã NVGH'], ['deliveryStaffName', 'Nhân viên giao hàng'],
      ['tripCount', 'Số chuyến', 'number'], ['orderCount', 'Đơn đã giao', 'number'],
      ['totalAmount', 'Giá trị giao', 'money'], ['accountingConfirmedAmount', 'Đã xác nhận', 'money'],
      ['collectedAmount', 'Đã thu', 'money'], ['collectionRate', 'Tỷ lệ thu', 'percent']
    ],
    chart: { labelKey: 'deliveryStaffName', valueKey: 'totalAmount', valueType: 'money' }
  },
  {
    code: 'delivery-trips', category: 'delivery', title: 'Chi tiết chuyến giao',
    description: 'Danh sách đơn tổng, số đơn con, giá trị giao, tiền đã thu và cảnh báo snapshot.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: 'delivery-report',
    columns: [
      ['deliveryDate', 'Ngày giao', 'date'], ['code', 'Mã đơn tổng'], ['deliveryStaffName', 'NVGH'],
      ['assignedOrderCount', 'Đơn phân công', 'number'], ['orderCount', 'Đơn đã giao', 'number'],
      ['totalAmount', 'Giá trị giao', 'money'], ['accountingConfirmedAmount', 'Đã xác nhận', 'money'],
      ['collectedAmount', 'Đã thu', 'money'], ['status', 'Trạng thái', 'status'], ['qualityStatus', 'Dữ liệu', 'status']
    ]
  },
  {
    code: 'finance-ledger', category: 'finance', title: 'Sổ quỹ chi tiết',
    description: 'Bút toán thu/chi tiền mặt và ngân hàng với số dư chạy theo tài khoản.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: 'fund-report',
    columns: [
      ['date', 'Ngày', 'date'], ['code', 'Chứng từ'], ['type', 'Loại'], ['fundType', 'Quỹ'],
      ['account', 'Tài khoản'], ['counterparty', 'Đối tượng'], ['openingBalance', 'Đầu', 'money'],
      ['inAmount', 'Thu', 'money'], ['outAmount', 'Chi', 'money'], ['endingBalance', 'Cuối', 'money'], ['note', 'Ghi chú']
    ]
  },
  {
    code: 'finance-accounts', category: 'finance', title: 'Số dư quỹ theo tài khoản',
    description: 'Đầu kỳ, tổng thu, tổng chi và cuối kỳ của tiền mặt/ngân hàng.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: 'fund-report',
    columns: [
      ['fundType', 'Loại quỹ'], ['account', 'Tài khoản'], ['openingBalance', 'Đầu kỳ', 'money'],
      ['inAmount', 'Tổng thu', 'money'], ['outAmount', 'Tổng chi', 'money'],
      ['endingBalance', 'Cuối kỳ', 'money'], ['transactionCount', 'Số giao dịch', 'number']
    ],
    chart: { labelKey: 'account', valueKey: 'endingBalance', valueType: 'money' }
  },
  {
    code: 'returns-detail', category: 'returns', title: 'Chi tiết trả hàng',
    description: 'Phiếu trả đã xác nhận, giá trị chứng từ, giá trị giảm công nợ và trạng thái nhập kho.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: 'return-report',
    columns: [
      ['date', 'Ngày', 'date'], ['code', 'Mã trả'], ['salesOrderCode', 'Đơn gốc'],
      ['customerCode', 'Mã KH'], ['customerName', 'Khách hàng'], ['salesStaffName', 'NVBH'],
      ['deliveryStaffName', 'NVGH'], ['amount', 'Giá trị trả', 'money'], ['arAmount', 'Giảm công nợ', 'money'],
      ['warehouseReceiveStatus', 'Nhập kho', 'status'], ['returnState', 'Trạng thái trả', 'status'], ['accountingStatus', 'Kế toán', 'status']
    ]
  },

  {
    code: 'info-products', category: 'information', title: 'Thông tin sản phẩm',
    description: 'Danh mục sản phẩm, quy cách, đơn vị tính, giá bán, giá vốn và trạng thái hoạt động.',
    roles: BUSINESS_ROLES, dateMode: 'none', exportType: '',
    filters: [
      { key: 'code', label: 'Mã sản phẩm', placeholder: 'VD: 62674330' },
      { key: 'name', label: 'Tên sản phẩm', placeholder: 'Nhập tên sản phẩm' },
      { key: 'category', label: 'Nhóm hàng', placeholder: 'Nhóm hàng' },
      { key: 'status', label: 'Trạng thái', type: 'select', options: [['', 'Tất cả'], ['active', 'Hoạt động'], ['inactive', 'Ngừng hoạt động']] }
    ],
    columns: [
      ['productCode', 'Mã SP'], ['productName', 'Sản phẩm'], ['category', 'Nhóm hàng'], ['brand', 'Nhãn hàng'],
      ['packing', 'Quy cách', 'number'], ['unit', 'ĐVT'], ['salePrice', 'Giá bán', 'money'], ['costPrice', 'Giá vốn', 'money'],
      ['status', 'Trạng thái', 'status'], ['createdAt', 'Ngày tạo', 'date'], ['updatedAt', 'Cập nhật cuối', 'date']
    ]
  },
  {
    code: 'info-customers', category: 'information', title: 'Thông tin khách hàng',
    description: 'Danh mục khách hàng, tuyến/khu vực, NVBH phụ trách và thông tin đối chiếu nhanh.',
    roles: BUSINESS_ROLES, dateMode: 'none', exportType: '',
    filters: [
      { key: 'code', label: 'Mã khách', placeholder: 'Mã khách hàng' },
      { key: 'name', label: 'Tên khách', placeholder: 'Tên khách hàng' },
      { key: 'phone', label: 'SĐT', placeholder: 'Số điện thoại' },
      { key: 'route', label: 'Tuyến', placeholder: 'Tuyến bán hàng' },
      { key: 'area', label: 'Khu vực', placeholder: 'Khu vực' },
      { key: 'salesStaff', label: 'NVBH', placeholder: 'Mã hoặc tên NVBH' }
    ],
    columns: [
      ['customerCode', 'Mã KH'], ['customerName', 'Khách hàng'], ['address', 'Địa chỉ'], ['phone', 'SĐT'],
      ['route', 'Tuyến'], ['area', 'Khu vực'], ['salesStaffCode', 'Mã NVBH'], ['salesStaffName', 'NVBH'],
      ['customerType', 'Loại KH'], ['status', 'Trạng thái', 'status'], ['currentDebt', 'Công nợ hiện tại', 'money'],
      ['monthlySalesAmount', 'Doanh số tháng', 'money'], ['lastOrderDate', 'Mua gần nhất', 'date'], ['createdAt', 'Ngày tạo', 'date']
    ]
  },
  {
    code: 'info-staffs', category: 'information', title: 'Thông tin nhân viên',
    description: 'Danh mục nhân viên, bộ phận, chức vụ, tài khoản, vai trò và trạng thái hoạt động.',
    roles: BUSINESS_ROLES, dateMode: 'none', exportType: '',
    filters: [
      { key: 'code', label: 'Mã nhân viên', placeholder: 'Mã NV' },
      { key: 'name', label: 'Họ tên', placeholder: 'Tên nhân viên' },
      { key: 'phone', label: 'SĐT', placeholder: 'Số điện thoại' },
      { key: 'department', label: 'Bộ phận', placeholder: 'Bộ phận' },
      { key: 'position', label: 'Chức vụ', placeholder: 'Chức vụ' },
      { key: 'role', label: 'Vai trò', placeholder: 'Vai trò' }
    ],
    columns: [
      ['staffCode', 'Mã NV'], ['staffName', 'Họ tên'], ['department', 'Bộ phận'], ['position', 'Chức vụ'],
      ['phone', 'SĐT'], ['username', 'Username'], ['role', 'Vai trò'], ['branch', 'Chi nhánh'],
      ['status', 'Trạng thái', 'status'], ['createdAt', 'Ngày tạo', 'date'], ['lastLoginAt', 'Đăng nhập cuối', 'date']
    ]
  },
  {
    code: 'data-quality', category: 'control', title: 'Ngoại lệ và chất lượng dữ liệu',
    description: 'Tập trung các lỗi tồn âm, lệch ledger, đơn thiếu giá, chuyến giao thiếu đơn con và trả hàng chưa có AR.',
    roles: BUSINESS_ROLES, dateMode: 'range', exportType: '',
    columns: [
      ['severity', 'Mức độ', 'severity'], ['domain', 'Nghiệp vụ'], ['date', 'Ngày', 'date'],
      ['code', 'Mã chứng từ/SP'], ['name', 'Đối tượng'], ['issue', 'Ngoại lệ'],
      ['difference', 'Chênh lệch', 'number'], ['amount', 'Giá trị', 'money']
    ]
  }
].map((definition) => Object.freeze({
  ...definition,
  columns: Object.freeze(definition.columns.map(([key, label, type = 'text']) => Object.freeze({ key, label, type })))
})));

function roleOf(user = {}) {
  return String(user.role || '').trim().toLowerCase();
}

function definitionByCode(code) {
  return REPORT_DEFINITIONS.find((definition) => definition.code === String(code || '').trim());
}

function publicDefinition(definition) {
  return {
    code: definition.code,
    category: definition.category,
    title: definition.title,
    description: definition.description,
    dateMode: definition.dateMode,
    exportMode: 'report-center',
    canonicalExportCode: definition.code,
    sourceContract: getReportSourceContract(definition.code),
    filters: definition.filters || [],
    columns: definition.columns,
    chart: definition.chart || null
  };
}

function visibleDefinitions(user = {}) {
  const role = roleOf(user);
  return REPORT_DEFINITIONS.filter((definition) => definition.roles.includes(role));
}

function catalog(user = {}) {
  const includeInformation = user.includeInformationReports === true || user.includeInformationReports === '1';
  const definitions = visibleDefinitions(user).filter((definition) => includeInformation || definition.category !== 'information');
  const allowedCategories = new Set(definitions.map((definition) => definition.category));
  return {
    categories: REPORT_CATEGORIES.filter((category) => allowedCategories.has(category.code)),
    reports: definitions.map(publicDefinition)
  };
}

function assertAccess(code, user = {}) {
  const definition = definitionByCode(code);
  if (!definition) {
    const error = new Error('Không tìm thấy mẫu báo cáo');
    error.status = 404;
    error.code = 'REPORT_NOT_FOUND';
    throw error;
  }
  if (!definition.roles.includes(roleOf(user))) {
    const error = new Error('Bạn không có quyền xem báo cáo này');
    error.status = 403;
    error.code = 'REPORT_FORBIDDEN';
    throw error;
  }
  return definition;
}

function normalizeSearch(value) {
  return text(value).toLowerCase();
}

function matchesSearch(row = {}, query = {}, keys = []) {
  const needle = normalizeSearch(query.q || query.search || query.keyword);
  if (!needle) return true;
  const values = keys.length ? keys.map((key) => row[key]) : Object.values(row);
  return values.some((value) => normalizeSearch(value).includes(needle));
}

function pageResult(rows = [], query = {}, defaults = {}) {
  return paginate(rows, query, { defaultLimit: defaults.defaultLimit || 50, maxLimit: defaults.maxLimit || 200 });
}

function sumRows(rows = [], fields = []) {
  return rows.reduce((summary, row) => {
    for (const field of fields) summary[field] = toNumber(summary[field]) + toNumber(row[field]);
    return summary;
  }, {});
}

function reportResult(definition, rows, summary, query, extra = {}) {
  // Chỉ service nội bộ được truyền boolean true. Query string "true" từ HTTP
  // không thể kích hoạt nhánh này, tránh trả hàng chục nghìn dòng ra trình duyệt.
  if (query && query.__exportAll === true) {
    const maxRows = Math.min(Math.max(Number(query.__exportMaxRows || 50000), 1), 50000);
    const allRows = (Array.isArray(rows) ? rows : []).slice(0, maxRows);
    return {
      definition: publicDefinition(definition),
      sourceContract: getReportSourceContract(definition.code),
      rows: allRows,
      items: allRows,
      meta: {
        page: 1,
        limit: allRows.length,
        total: Array.isArray(rows) ? rows.length : 0,
        totalPages: 1,
        hasMore: Array.isArray(rows) && rows.length > allRows.length,
        exportAll: true
      },
      summary: summary || {},
      ...extra
    };
  }

  const paged = pageResult(rows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    definition: publicDefinition(definition),
    sourceContract: getReportSourceContract(definition.code),
    rows: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary: summary || {},
    ...extra
  };
}

function aggregateSalesByDay(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = row.date || 'UNKNOWN';
    if (!map.has(key)) {
      map.set(key, {
        date: key,
        orderCount: 0,
        customerCodes: new Set(),
        beforePromoAmount: 0,
        actualAmount: 0,
        promotionValue: 0,
        receiptAmount: 0,
        returnAmount: 0,
        debtAmount: 0
      });
    }
    const target = map.get(key);
    target.orderCount += 1;
    if (row.customerCode || row.customerName) target.customerCodes.add(row.customerCode || row.customerName);
    target.beforePromoAmount += toNumber(row.beforePromoAmount);
    target.actualAmount += toNumber(row.actualAmount);
    target.promotionValue += toNumber(row.promotionValue);
    target.receiptAmount += toNumber(row.receiptAmount);
    target.returnAmount += toNumber(row.returnAmount);
    target.debtAmount += toNumber(row.debtAmount);
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    customerCount: row.customerCodes.size,
    customerCodes: undefined,
    netSalesAmount: row.actualAmount - row.returnAmount
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateSalesByCustomer(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = row.customerCode || row.customerName || 'UNKNOWN';
    if (!map.has(key)) {
      map.set(key, {
        customerCode: row.customerCode,
        customerName: row.customerName,
        salesStaffCode: row.salesStaffCode,
        salesStaffName: row.salesStaffName,
        orderCount: 0,
        beforePromoAmount: 0,
        actualAmount: 0,
        promotionValue: 0,
        returnAmount: 0,
        receiptAmount: 0,
        debtAmount: 0
      });
    }
    const target = map.get(key);
    target.orderCount += 1;
    target.beforePromoAmount += toNumber(row.beforePromoAmount);
    target.actualAmount += toNumber(row.actualAmount);
    target.promotionValue += toNumber(row.promotionValue);
    target.returnAmount += toNumber(row.returnAmount);
    target.receiptAmount += toNumber(row.receiptAmount);
    target.debtAmount += toNumber(row.debtAmount);
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    netSalesAmount: row.actualAmount - row.returnAmount,
    averageOrderValue: row.orderCount > 0 ? row.actualAmount / row.orderCount : 0
  })).sort((a, b) => b.netSalesAmount - a.netSalesAmount || text(a.customerName).localeCompare(text(b.customerName), 'vi'));
}

function aggregateSalesByProduct(rows = []) {
  const map = new Map();
  for (const order of rows) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const key = item.productCode || item.productName || 'UNKNOWN';
      if (!map.has(key)) {
        map.set(key, {
          productCode: item.productCode,
          productName: item.productName,
          brand: item.brand || '',
          category: item.category || '',
          unit: item.unit || '',
          orderCodes: new Set(),
          customerCodes: new Set(),
          quantity: 0,
          beforePromoAmount: 0,
          actualAmount: 0,
          promotionDiscountAmount: 0
        });
      }
      const target = map.get(key);
      target.orderCodes.add(order.code || order.id);
      if (order.customerCode || order.customerName) target.customerCodes.add(order.customerCode || order.customerName);
      target.quantity += toNumber(item.quantity);
      target.beforePromoAmount += toNumber(item.catalogAmount);
      target.actualAmount += toNumber(item.actualAmount);
      target.promotionDiscountAmount += Math.max(0, toNumber(item.catalogAmount) - toNumber(item.actualAmount));
    }
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    orderCount: row.orderCodes.size,
    customerCount: row.customerCodes.size,
    averageUnitPrice: row.quantity > 0 ? row.actualAmount / row.quantity : 0,
    orderCodes: undefined,
    customerCodes: undefined
  })).sort((a, b) => b.actualAmount - a.actualAmount || text(a.productName).localeCompare(text(b.productName), 'vi'));
}

function normalizeSalesStaffRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    netSalesAmount: toNumber(row.actualAmount) - toNumber(row.returnAmount)
  }));
}

function normalizeDeliveryStaffRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    collectionRate: toNumber(row.totalAmount) > 0 ? (toNumber(row.collectedAmount) / toNumber(row.totalAmount)) * 100 : 0
  }));
}

function normalizeDeliveryTripRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    qualityStatus: row.dataQuality?.missingChildren
      ? 'Thiếu đơn con'
      : (toNumber(row.dataQuality?.snapshotOrderCountDifference) !== 0 || toNumber(row.dataQuality?.snapshotAmountDifference) !== 0
        ? 'Lệch snapshot'
        : 'Khớp')
  }));
}

function dataQualityRows({ sales, inventory, delivery, returns }) {
  const rows = [];
  if (toNumber(sales.summary?.missingArLedgerCount) > 0) {
    rows.push({
      severity: 'critical',
      domain: 'Bán hàng',
      date: sales.dateTo || '',
      code: 'AR-SALE',
      name: 'AR Ledger',
      issue: 'Đơn xác nhận kế toán thiếu AR-SALE',
      difference: sales.summary.missingArLedgerCount,
      amount: sales.summary.missingArDebitAmount
    });
  }
  for (const order of sales.sales || []) {
    const quality = order.dataQuality || {};
    if (toNumber(quality.missingValueCount) > 0) {
      rows.push({ severity: 'major', domain: 'Bán hàng', date: order.date, code: order.code, name: order.customerName, issue: 'Dòng hàng thiếu giá trị/snapshot giá', difference: quality.missingValueCount, amount: order.actualAmount });
    }
    if (toNumber(quality.currentCatalogFallbackCount) > 0) {
      rows.push({ severity: 'warning', domain: 'Bán hàng', date: order.date, code: order.code, name: order.customerName, issue: 'Đang fallback giá danh mục hiện tại', difference: quality.currentCatalogFallbackCount, amount: order.actualAmount });
    }
    if (Math.abs(toNumber(quality.orderLineMismatchAmount)) >= 1) {
      rows.push({ severity: 'major', domain: 'Bán hàng', date: order.date, code: order.code, name: order.customerName, issue: 'Tổng đơn lệch tổng dòng', difference: quality.orderLineMismatchAmount, amount: order.actualAmount });
    }
  }
  for (const stock of inventory.stock || []) {
    if (toNumber(stock.endingQty) < 0) {
      rows.push({ severity: 'critical', domain: 'Tồn kho', date: inventory.dateTo || '', code: stock.productCode, name: stock.productName, issue: 'Tồn kho cuối kỳ âm', difference: stock.endingQty, amount: 0 });
    }
    if (Math.abs(toNumber(stock.reconciliationDifference)) > 0.000001) {
      rows.push({ severity: 'major', domain: 'Tồn kho', date: inventory.dateTo || '', code: stock.productCode, name: stock.productName, issue: 'Lệch inventories và stockTransactions', difference: stock.reconciliationDifference, amount: 0 });
    }
  }
  for (const trip of delivery.delivery || []) {
    if (trip.dataQuality?.missingChildren) {
      rows.push({ severity: 'critical', domain: 'Giao hàng', date: trip.deliveryDate, code: trip.code, name: trip.deliveryStaffName, issue: 'Đơn tổng không tìm thấy đơn con', difference: trip.assignedOrderCount, amount: trip.snapshotTotalAmount });
    } else if (toNumber(trip.dataQuality?.snapshotOrderCountDifference) !== 0 || Math.abs(toNumber(trip.dataQuality?.snapshotAmountDifference)) >= 1) {
      rows.push({ severity: 'major', domain: 'Giao hàng', date: trip.deliveryDate, code: trip.code, name: trip.deliveryStaffName, issue: 'Snapshot đơn tổng lệch dữ liệu đơn con', difference: trip.dataQuality.snapshotAmountDifference, amount: trip.totalAmount });
    }
  }
  for (const item of returns.returns || []) {
    if (toNumber(item.amount) > 0 && toNumber(item.arAmount) <= 0) {
      rows.push({ severity: 'major', domain: 'Trả hàng', date: item.date, code: item.code, name: item.customerName, issue: 'Phiếu trả chưa có AR-RETURN đối ứng', difference: 0, amount: item.amount });
    }
  }
  const rank = { critical: 0, major: 1, warning: 2 };
  return rows.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || text(b.date).localeCompare(text(a.date)));
}

function summaryForRows(rows = [], fields = []) {
  return {
    rowCount: rows.length,
    ...sumRows(rows, fields)
  };
}

async function run(code, query = {}, user = {}) {
  const definition = assertAccess(code, user);
  const baseQuery = { ...query, q: query.q || query.search || query.keyword || '' };

  switch (definition.code) {
    case 'sales-kpi': {
      const month = String(query.month || query.dateFrom || '').slice(0, 7);
      const dashboard = await HomeDashboardService.getHomeDashboard({ month, force: String(query.force || '') === '1' });
      const rows = (dashboard.salesByStaff || []).filter((row) => matchesSearch(row, baseQuery, ['salesStaffCode', 'salesStaffName', 'status']));
      return reportResult(definition, rows, dashboard.summary || summaryForRows(rows, ['targetAmount', 'salesAmount', 'returnAmount', 'netSalesAmount', 'debtAmount']), query, { period: dashboard.period, dataQuality: dashboard.dataQuality });
    }
    case 'sales-by-day':
    case 'sales-by-staff':
    case 'sales-by-customer':
    case 'sales-by-product':
    case 'sales-detail': {
      const sales = await SalesReportService.salesReport({ ...baseQuery, full: '1', export: '1' });
      let rows = sales.sales || [];
      let summary = sales.summary || {};
      if (definition.code === 'sales-by-day') rows = aggregateSalesByDay(rows);
      if (definition.code === 'sales-by-staff') rows = normalizeSalesStaffRows(sales.bySalesman || []);
      if (definition.code === 'sales-by-customer') rows = aggregateSalesByCustomer(rows);
      if (definition.code === 'sales-by-product') rows = aggregateSalesByProduct(rows);
      rows = rows.filter((row) => matchesSearch(row, baseQuery));
      if (definition.code !== 'sales-detail') {
        summary = summaryForRows(rows, ['orderCount', 'customerCount', 'quantity', 'beforePromoAmount', 'actualAmount', 'promotionValue', 'promotionDiscountAmount', 'receiptAmount', 'returnAmount', 'netSalesAmount', 'debtAmount']);
      }
      return reportResult(definition, rows, summary, query, { dateFrom: sales.dateFrom, dateTo: sales.dateTo, source: sales.source });
    }
    case 'inventory-current': {
      const stock = await InventoryReportService.currentStockReport({ ...baseQuery, full: '1', export: '1' });
      return reportResult(definition, stock.stock || [], stock.summary || {}, query, { source: stock.source, negativeStockCount: stock.negativeStockCount });
    }
    case 'inventory-movement': {
      const movement = await InventoryReportService.inventoryMovementReport({ ...baseQuery, full: '1', export: '1' });
      return reportResult(definition, movement.stock || [], movement.summary || {}, query, { dateFrom: movement.dateFrom, dateTo: movement.dateTo, source: movement.source });
    }
    case 'stock-card': {
      const card = await InventoryReportService.stockCardReport({ ...baseQuery, full: '1', export: '1' });
      return reportResult(definition, card.transactions || [], card.summary || {}, query, { dateFrom: card.dateFrom, dateTo: card.dateTo, source: card.source });
    }
    case 'debt-current': {
      const rows = await arLedgerReadService.aggregateDebtByCustomer({ status: 'all', dateTo: baseQuery.dateTo });
      const filteredRows = rows.filter((row) => matchesSearch(row, baseQuery, ['customerCode', 'customerName', 'salesStaffName', 'deliveryStaffName']));
      return reportResult(definition, filteredRows, summaryForRows(filteredRows, ['debit', 'credit', 'remainingDebt', 'orderCount', 'ledgerCount']), query, { dateTo: baseQuery.dateTo || '', source: 'arLedgers_current' });
    }
    case 'debt-period': {
      const debt = await DebtReportService.periodDebtReport({ ...baseQuery, full: '1', export: '1' });
      return reportResult(definition, debt.debts || [], debt.summary || {}, query, { dateFrom: debt.dateFrom, dateTo: debt.dateTo, source: debt.source });
    }
    case 'debt-ledger': {
      const debt = await DebtReportService.arLedgerDetailReport({ ...baseQuery, full: '1', export: '1' });
      return reportResult(definition, debt.ledger || [], debt.summary || {}, query, { dateFrom: debt.dateFrom, dateTo: debt.dateTo, source: debt.source });
    }
    case 'rewards-by-customer': {
      const rewards = await RewardReportService.rewardByCustomerReport({ ...baseQuery, full: '1', export: '1' });
      return reportResult(definition, rewards.rewards || [], rewards.summary || {}, query, { dateFrom: rewards.dateFrom, dateTo: rewards.dateTo, source: rewards.source });
    }
    case 'delivery-by-staff': {
      const delivery = await DeliveryReportService.deliveryByStaffReport({ ...baseQuery, full: '1', export: '1' });
      const rows = normalizeDeliveryStaffRows(delivery.byStaff || delivery.delivery || []);
      return reportResult(definition, rows, delivery.summary || summaryForRows(rows, ['tripCount', 'orderCount', 'totalAmount', 'accountingConfirmedAmount', 'collectedAmount', 'unmasteredOrderCount']), query, { dateFrom: delivery.dateFrom, dateTo: delivery.dateTo, source: delivery.source });
    }
    case 'delivery-trips': {
      const delivery = await DeliveryReportService.deliveryTripsReport({ ...baseQuery, full: '1', export: '1' });
      const rows = normalizeDeliveryTripRows(delivery.delivery || []);
      return reportResult(definition, rows, delivery.summary, query, { dateFrom: delivery.dateFrom, dateTo: delivery.dateTo, source: delivery.source });
    }
    case 'finance-ledger':
    case 'finance-accounts': {
      const finance = await FinanceReportService.financeReport({ ...baseQuery, full: '1', export: '1' });
      const rows = definition.code === 'finance-accounts' ? finance.accounts || [] : finance.fundLedger || [];
      return reportResult(definition, rows, finance.summary || {}, query, { dateFrom: finance.dateFrom, dateTo: finance.dateTo, source: finance.source });
    }
    case 'returns-detail': {
      const returns = await ReturnReportService.returnReport({ ...baseQuery, full: '1', export: '1' });
      return reportResult(definition, returns.returns || [], returns.summary || {}, query, { dateFrom: returns.dateFrom, dateTo: returns.dateTo, source: returns.source });
    }
    case 'info-products': {
      const info = await InformationReportService.productInformationReport(baseQuery);
      const rows = (info.products || []).filter((row) => matchesSearch(row, baseQuery));
      return reportResult(definition, rows, info.summary || summaryForRows(rows, []), query, { source: info.source });
    }
    case 'info-customers': {
      const info = await InformationReportService.customerInformationReport(baseQuery);
      const rows = (info.customers || []).filter((row) => matchesSearch(row, baseQuery));
      return reportResult(definition, rows, summaryForRows(rows, ['currentDebt', 'monthlySalesAmount']), query, { source: info.source });
    }
    case 'info-staffs': {
      const info = await InformationReportService.staffInformationReport(baseQuery);
      const rows = (info.staffs || []).filter((row) => matchesSearch(row, baseQuery));
      return reportResult(definition, rows, info.summary || summaryForRows(rows, []), query, { source: info.source });
    }
    case 'data-quality': {
      const [sales, inventory, delivery, returns] = await Promise.all([
        SalesReportService.salesReport({ ...baseQuery, full: '1', export: '1' }),
        InventoryReportService.inventoryMovementReport({ ...baseQuery, full: '1', export: '1' }),
        DeliveryReportService.deliveryTripsReport({ ...baseQuery, full: '1', export: '1' }),
        ReturnReportService.returnReport({ ...baseQuery, full: '1', export: '1' })
      ]);
      const rows = dataQualityRows({ sales, inventory, delivery, returns }).filter((row) => matchesSearch(row, baseQuery));
      const summary = {
        issueCount: rows.length,
        criticalCount: rows.filter((row) => row.severity === 'critical').length,
        majorCount: rows.filter((row) => row.severity === 'major').length,
        warningCount: rows.filter((row) => row.severity === 'warning').length,
        affectedAmount: rows.reduce((sum, row) => sum + Math.abs(toNumber(row.amount)), 0)
      };
      return reportResult(definition, rows, summary, query, { dateFrom: sales.dateFrom, dateTo: sales.dateTo, source: 'report_domain_quality_checks' });
    }
    default: {
      const error = new Error('Mẫu báo cáo chưa được triển khai');
      error.status = 501;
      error.code = 'REPORT_NOT_IMPLEMENTED';
      throw error;
    }
  }
}

async function overview(query = {}, user = {}) {
  const role = roleOf(user);
  if (![...new Set([...BUSINESS_ROLES, 'warehouse', 'sales'])].includes(role)) {
    const error = new Error('Bạn không có quyền xem trung tâm báo cáo');
    error.status = 403;
    error.code = 'REPORT_CENTER_FORBIDDEN';
    throw error;
  }
  const dashboard = await DashboardReportService.dashboardReport(query);
  const data = dashboard.dashboard || {};
  const actualSales = toNumber(data.sales?.totalAmount);
  const returnAmount = toNumber(data.returns?.totalReturnAmount);
  const debtAmount = toNumber(data.debts?.totalDebt);
  const stockSummary = data.stock || {};
  const finance = data.finance || {};
  const delivery = data.delivery || {};
  const allowedReportCodes = new Set(visibleDefinitions(user).map((definition) => definition.code));
  const cards = [
      { code: 'actualSales', label: 'Doanh số xác nhận', value: actualSales, type: 'money', reportCode: 'sales-detail' },
      { code: 'netSales', label: 'Doanh số ròng', value: actualSales - returnAmount, type: 'money', reportCode: 'sales-by-day' },
      { code: 'collected', label: 'Tiền đã thu', value: toNumber(data.sales?.receiptAmount), type: 'money', reportCode: 'finance-ledger' },
      { code: 'debt', label: 'Công nợ hiện tại', value: debtAmount, type: 'money', reportCode: 'debt-current' },
      { code: 'cash', label: 'Tồn quỹ tiền mặt', value: toNumber(finance.cashBalance), type: 'money', reportCode: 'finance-accounts' },
      { code: 'stock', label: 'Mặt hàng có tồn', value: toNumber(stockSummary.productCount || stockSummary.totalProducts || stockSummary.totalRows), type: 'number', reportCode: 'inventory-current' },
      { code: 'delivery', label: 'Đơn đã giao', value: toNumber(delivery.orderCount), type: 'number', reportCode: 'delivery-trips' },
      { code: 'returns', label: 'Hàng trả', value: returnAmount, type: 'money', reportCode: 'returns-detail' }
    ].filter((card) => allowedReportCodes.has(card.reportCode));
  const alerts = [
      { code: 'negativeStock', label: 'Mặt hàng tồn âm', value: toNumber(stockSummary.negativeStockCount), severity: toNumber(stockSummary.negativeStockCount) > 0 ? 'critical' : 'ok', reportCode: 'data-quality' },
      { code: 'inventoryMismatch', label: 'Mặt hàng lệch ledger', value: toNumber(stockSummary.reconciliationMismatchCount), severity: toNumber(stockSummary.reconciliationMismatchCount) > 0 ? 'major' : 'ok', reportCode: 'data-quality' },
      { code: 'deliveryMismatch', label: 'Chuyến giao lệch snapshot', value: toNumber(delivery.snapshotMismatchCount), severity: toNumber(delivery.snapshotMismatchCount) > 0 ? 'major' : 'ok', reportCode: 'data-quality' },
      { code: 'missingChildren', label: 'Chuyến thiếu đơn con', value: toNumber(delivery.missingChildTripCount), severity: toNumber(delivery.missingChildTripCount) > 0 ? 'critical' : 'ok', reportCode: 'data-quality' }
    ].filter((alert) => allowedReportCodes.has(alert.reportCode));
  return {
    dateFrom: dashboard.dateFrom,
    dateTo: dashboard.dateTo,
    cards,
    alerts,
    source: dashboard.source
  };
}

module.exports = {
  REPORT_CATEGORIES,
  REPORT_DEFINITIONS,
  catalog,
  visibleDefinitions,
  assertAccess,
  aggregateSalesByDay,
  aggregateSalesByCustomer,
  aggregateSalesByProduct,
  dataQualityRows,
  run,
  overview
};
