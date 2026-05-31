const XLSX = require('xlsx');

const TEMPLATE_DEFINITIONS = {
  products: {
    title: 'Mẫu import sản phẩm',
    fileName: 'mau-import-san-pham.xlsx',
    columns: ['code', 'name', 'unit', 'baseUnit', 'conversionRate', 'packing', 'barcode', 'category', 'costPrice', 'salePrice', 'warehouseCode', 'minStock', 'maxStock'],
    headers: ['Mã sản phẩm', 'Tên sản phẩm', 'Đơn vị bán', 'Đơn vị gốc', 'Quy đổi', 'Quy cách', 'Barcode', 'Nhóm hàng', 'Giá nhập', 'Giá bán', 'Kho mặc định', 'Tồn tối thiểu', 'Tồn tối đa'],
    sample: [
      ['SP001', 'OMO Bột giặt 5.5kg', 'Thùng', 'Túi', 6, '1 thùng = 6 túi', '893000000001', 'Giặt tẩy', 145000, 169000, 'KHO_HC', 10, 200],
      ['SP002', 'Comfort Đậm Đặc 3.8L', 'Thùng', 'Chai', 4, '1 thùng = 4 chai', '893000000002', 'Nước xả', 115000, 139000, 'KHO_PC', 10, 150]
    ],
    notes: ['Bắt buộc: code, name.', 'Quy đổi là số đơn vị gốc trong 1 đơn vị bán, ví dụ 1 thùng = 12 chai thì nhập 12.', 'Mã sản phẩm không được trùng với danh mục hiện có.']
  },
  customers: {
    title: 'Mẫu import khách hàng',
    fileName: 'mau-import-khach-hang.xlsx',
    columns: ['code', 'name', 'phone', 'address', 'area', 'staffName'],
    headers: ['Mã khách hàng', 'Tên khách hàng', 'SĐT', 'Địa chỉ', 'Khu vực', 'Nhân viên phụ trách'],
    sample: [
      ['KH001', 'Tạp hóa Minh Anh', '0987654321', 'Số 1 Minh Khai', 'Tuyến 1', 'Nguyễn Văn A'],
      ['KH002', 'Siêu thị mini An Bình', '0912345678', 'Số 2 Bạch Mai', 'Tuyến 2', 'Trần Văn B']
    ],
    notes: ['Bắt buộc: code, name.', 'Có thể nhập SĐT hoặc địa chỉ để hỗ trợ tìm kiếm khách hàng.']
  },
  openingStock: {
    title: 'Mẫu import tồn kho ban đầu',
    fileName: 'mau-import-ton-kho-ban-dau.xlsx',
    columns: ['productCode', 'quantity'],
    headers: ['Mã sản phẩm', 'Số lượng'],
    sample: [
      ['SP001', 100],
      ['SP002', 80]
    ],
    notes: [
      'Mẫu tồn kho ban đầu chỉ cần Mã sản phẩm và Số lượng.',
      'Tên sản phẩm, đơn vị tính, giá bán và kho mặc định sẽ tự lấy từ danh mục sản phẩm.',
      'Mã sản phẩm phải tồn tại trong danh mục sản phẩm.',
      'Import tồn kho ban đầu sẽ đặt lại số lượng tồn theo file, chỉ dùng khi khởi tạo hoặc chốt tồn đầu kỳ.'
    ]
  },
  importOrders: {
    title: 'Mẫu import phiếu nhập kho',
    fileName: 'mau-import-phieu-nhap-kho.xlsx',
    columns: ['documentCode', 'date', 'supplier', 'productCode', 'quantity', 'costPrice', 'note'],
    headers: ['Mã phiếu', 'Ngày', 'Nhà cung cấp', 'Mã sản phẩm', 'Số lượng', 'Giá nhập', 'Ghi chú'],
    sample: [
      ['PN-EXCEL-001', '2026-05-26', 'Unilever', 'SP001', 50, 145000, 'Nhập theo hóa đơn'],
      ['PN-EXCEL-001', '2026-05-26', 'Unilever', 'SP002', 30, 115000, 'Cùng phiếu nhập']
    ],
    notes: ['Các dòng có cùng mã phiếu/ngày/nhà cung cấp sẽ được gộp thành một phiếu nhập.', 'Mã sản phẩm phải tồn tại trong danh mục.']
  },
  salesOrders: {
    title: 'Mẫu import đơn con DMS Unilever',
    fileName: 'mau-import-don-con-dms-unilever.xlsx',
    columns: ['routeCode', 'documentCode', 'date', 'productCode', 'productName', 'packingQty', 'cartons', 'units', 'promoCartons', 'promoUnits', 'staffCode', 'staffName', 'customerCode', 'invoiceCountInDay', 'skuCountInDay', 'listPriceBeforeVat', 'gsvAmount', 'nivAmount', 'customerName', 'actualAmount', 'invoiceType', 'vatAmount', 'orderSource'],
    headers: ['Tuyến bán hàng', 'Số hóa đơn', 'Ngày lập hoá đơn', 'Mã hàng hóa', 'Mô tả mặt hàng', 'Đóng gói', 'Số lượng thùng', 'Số lượng SU', 'Số lượng khuyến mãi theo thùng/ Số thùng', 'Số lượng khuyến mãi theo SU/ Số SU khuyến mãi', 'Mã nhân viên', 'Tên NVTT', 'Mã cửa hàng', 'Số hóa đơn trong 1 ngày', 'Số SKU trong 1 ngày', 'Đơn giá', 'GSV bán ra', 'NIV bán ra', 'Tên cửa hàng', 'Doanh số mỗi ngày', 'Loại hóa đơn', 'Thuế', 'Nguồn đơn'],
    sample: [
      ['W1SPW', 'HU90202209', '2026-05-26', '64340182', 'LIFEBUOY XA PHONG SUA DUONG AM 72X125G', 72, 0, 5, 0, 0, '33949', 'Đỗ Thị Anh - 0979107225', '4501808', 0, 0, 14818, 74090, 63347, 'Chị Thuận', 68415, 'ZID1', 5068, 'DMS'],
      ['W1SPW', 'HU90202209', '2026-05-26', '65251427', 'CLEAR DG MAT LANH BAC HA 24X350G', 24, 0, 2, 0, 0, '33949', 'Đỗ Thị Anh - 0979107225', '4501808', 0, 1, 83333, 166666, 166666, 'Chị Thuận', 179999, 'ZID1', 13333, 'DMS']
    ],
    notes: [
      'Đây là mẫu import ĐƠN CON DMS Unilever; đơn import sẽ luôn được nhận diện là Từ DMS để đi xuyên suốt Lịch sử đơn bán, Gộp đơn tổng, App giao hàng và báo cáo.',
      'Số lượng bán quy đổi = (Số lượng thùng × quy cách trong Mongo của sản phẩm) + Số lượng SU. Cột Đóng gói trong file DMS chỉ dùng dự phòng/đối chiếu, không parse từ tên sản phẩm.',
      'Đơn giá cột P là giá niêm yết trước VAT; giá niêm yết sau VAT = P × 1.08.',
      'Doanh số mỗi ngày cột T là giá trị bán thực tế khách phải trả sau thuế và sau khuyến mại; V45 dùng cột T để tính tổng đơn, công nợ, app giao hàng và AR Ledger.',
      'Số lượng khuyến mãi I/J được trừ tồn kho nhưng không cộng doanh thu/công nợ.',
      'Các dòng cùng Số hóa đơn + Ngày lập hóa đơn + Mã cửa hàng được gộp thành một đơn con. Cột Nguồn đơn có thể để trống; hệ thống vẫn tự gán DMS.'
    ]
  },
  openingDebt: {
    title: 'Mẫu import công nợ ban đầu',
    fileName: 'mau-import-cong-no-ban-dau.xlsx',
    columns: ['date', 'customerCode', 'amount', 'note'],
    headers: ['Ngày', 'Mã khách hàng', 'Số tiền công nợ đầu', 'Ghi chú'],
    sample: [
      ['2026-05-26', 'KH001', 1500000, 'Nợ đầu kỳ'],
      ['2026-05-26', 'KH002', 750000, 'Nợ đầu kỳ']
    ],
    notes: ['Mã khách hàng phải tồn tại trong danh mục.', 'Số tiền công nợ không được âm.']
  },
  debtCollections: {
    title: 'Mẫu import thu công nợ',
    fileName: 'mau-import-thu-cong-no.xlsx',
    columns: ['date', 'customerCode', 'amount', 'staffName', 'note'],
    headers: ['Ngày', 'Mã khách hàng', 'Số tiền thu', 'Người thu', 'Ghi chú'],
    sample: [
      ['2026-05-26', 'KH001', 500000, 'Nguyễn Văn A', 'Thu tiền giao hàng'],
      ['2026-05-26', 'KH002', 300000, 'Trần Văn B', 'Thu công nợ']
    ],
    notes: ['Import thu công nợ sẽ đồng thời ghi vào công nợ và quỹ tiền.', 'Số tiền thu phải lớn hơn 0.']
  },
  cashbook: {
    title: 'Mẫu import quỹ tiền',
    fileName: 'mau-import-quy-tien.xlsx',
    columns: ['date', 'type', 'source', 'staffName', 'amount', 'note'],
    headers: ['Ngày', 'Loại thu/chi', 'Nguồn/Nhóm tiền', 'Người nộp/nhận', 'Số tiền', 'Ghi chú'],
    sample: [
      ['2026-05-26', 'thu', 'Nhân viên giao hàng nộp tiền', 'Nguyễn Văn A', 1000000, 'Nộp tiền cuối ngày'],
      ['2026-05-26', 'chi', 'Chi phí vận hành', 'Trần Văn B', 200000, 'Chi xăng xe']
    ],
    notes: ['Cột loại thu/chi nhập: thu hoặc chi.', 'Số tiền phải lớn hơn 0.']
  }
};

function sheetFromRows(rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  return sheet;
}

function buildGuideSheet(definition) {
  const rows = [
    [definition.title],
    [],
    ['Cách sử dụng'],
    ['1. Nhập dữ liệu thật vào sheet Import.'],
    ['2. Giữ nguyên tên cột ở dòng đầu tiên, không xóa hoặc đổi tên cột.'],
    ['3. Ngày nên nhập theo định dạng YYYY-MM-DD, ví dụ 2026-05-26.'],
    ['4. Sau khi nhập xong, quay lại phần mềm, chọn đúng loại import và tải file lên để xem trước.'],
    [],
    ['Lưu ý nghiệp vụ'],
    ...definition.notes.map((note) => [note]),
    [],
    ['Danh sách cột'],
    ...definition.columns.map((col, index) => [col, definition.headers[index]])
  ];
  return sheetFromRows(rows, [28, 42, 22, 22]);
}

function buildImportTemplate(type) {
  const definition = TEMPLATE_DEFINITIONS[type];
  if (!definition) {
    const error = new Error('Loại mẫu import không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildGuideSheet(definition), 'HuongDan');
  XLSX.utils.book_append_sheet(workbook, sheetFromRows([definition.headers, ...definition.sample], definition.headers.map((h) => Math.max(14, String(h).length + 6))), 'DuLieuMau');
  XLSX.utils.book_append_sheet(workbook, sheetFromRows([definition.headers], definition.headers.map((h) => Math.max(14, String(h).length + 6))), 'Import');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, fileName: definition.fileName };
}

function getTemplateTypes() {
  return Object.keys(TEMPLATE_DEFINITIONS).map((type) => ({ type, title: TEMPLATE_DEFINITIONS[type].title, fileName: TEMPLATE_DEFINITIONS[type].fileName }));
}

module.exports = { buildImportTemplate, getTemplateTypes, TEMPLATE_DEFINITIONS };
