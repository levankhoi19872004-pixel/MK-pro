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
      ['PN-EXCEL-001', '26/05/2026', 'Unilever', 'SP001', 50, 145000, 'Nhập theo hóa đơn'],
      ['PN-EXCEL-001', '26/05/2026', 'Unilever', 'SP002', 30, 115000, 'Cùng phiếu nhập']
    ],
    notes: ['Các dòng có cùng mã phiếu/ngày/nhà cung cấp sẽ được gộp thành một phiếu nhập.', 'Mã sản phẩm sẽ tự tạo nếu chưa tồn tại trong danh mục.', 'Định dạng ngày chuẩn: DD/MM/YYYY (ví dụ 26/05/2026).']
  },
  salesOrders: {
    title: 'Mẫu import đơn con DMS Unilever',
    fileName: 'mau-import-don-con-dms-unilever.xlsx',
    columns: ['routeCode', 'documentCode', 'date', 'productCode', 'productName', 'packingQty', 'cartons', 'units', 'promoCartons', 'promoUnits', 'staffCode', 'staffName', 'customerCode', 'invoiceCountInDay', 'skuCountInDay', 'listPriceBeforeVat', 'gsvAmount', 'nivAmount', 'customerName', 'actualAmount', 'invoiceType', 'vatAmount', 'orderSource'],
    headers: ['Tuyến bán hàng', 'Số hóa đơn', 'Ngày lập hoá đơn', 'Mã hàng hóa', 'Mô tả mặt hàng', 'Đóng gói', 'Số lượng thùng', 'Số lượng SU', 'Số lượng khuyến mãi theo thùng/ Số thùng', 'Số lượng khuyến mãi theo SU/ Số SU khuyến mãi', 'Mã nhân viên', 'Tên NVTT', 'Mã cửa hàng', 'Số hóa đơn trong 1 ngày', 'Số SKU trong 1 ngày', 'Đơn giá', 'GSV bán ra', 'NIV bán ra', 'Tên cửa hàng', 'Doanh số mỗi ngày', 'Loại hóa đơn', 'Thuế', 'Nguồn đơn'],
    sample: [
      ['W1SPW', 'HU90202209', '26/05/2026', '64340182', 'LIFEBUOY XA PHONG SUA DUONG AM 72X125G', 72, 0, 5, 0, 0, '33949', 'Đỗ Thị Anh - 0979107225', '4501808', 0, 0, 14818, 74090, 63347, 'Chị Thuận', 68415, 'ZID1', 5068, 'DMS'],
      ['W1SPW', 'HU90202209', '26/05/2026', '65251427', 'CLEAR DG MAT LANH BAC HA 24X350G', 24, 0, 2, 0, 0, '33949', 'Đỗ Thị Anh - 0979107225', '4501808', 0, 1, 83333, 166666, 166666, 'Chị Thuận', 179999, 'ZID1', 13333, 'DMS']
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


  salesOrdersS3: {
    title: 'Mẫu import đơn S3 rút gọn',
    fileName: 'mau-import-don-s3-rut-gon.xlsx',
    columns: ['date', 'documentCode', 'staffCode', 'staffName', 'customerCode', 'customerName', 'productCode', 'productName', 'packingQty', 'isPromo', 'quantity', 'salePrice', 'amount', 'warehouseCode'],
    headers: ['Ngày', 'Số Đơn', 'Mã Nv', 'Tên NV', 'Mã Khách', 'Tên Khách', 'Mã hàng', 'Tên hàng', 'QC', 'Là KM', 'Số lượng', 'Đơn giá sau KM/Ck', 'Thành tiền', 'Mã Kho'],
    sample: [
      ['03.06.2026', 'B0036696', '33948', 'Đỗ Thị Mừng TP - 0962033288', '4501252', 'Chị Kim Anh', '64330134', 'SUNLIGHT NRC Thiên Nhiên Lô Hội 750g/15 Chai', 15, '', 45, 28093, 1264169, 'KHOCHINH'],
      ['03.06.2026', 'B0036696', '33948', 'Đỗ Thị Mừng TP - 0962033288', '4501252', 'Chị Kim Anh', '64330146', 'SUNLIGHT NRC Chanh 750g/15 Chai', 15, '', 45, 28093, 1264169, 'KHOCHINH'],
      ['03.06.2026', 'B0036696', '33948', 'Đỗ Thị Mừng TP - 0962033288', '4501252', 'Chị Kim Anh', '64330148', 'SUNLIGHT NRC Túi 3.6kg/4 Túi', 4, '', 15, 93425, 1401375, 'KHOCHINH']
    ],
    notes: [
      'Mẫu S3 dùng đúng các cột bôi vàng: Ngày, Số Đơn, Mã Nv, Mã Khách, Tên Khách, Mã hàng, Tên hàng, Số lượng, Đơn giá sau KM/Ck, Thành tiền.',
      'Các dòng cùng Số Đơn + Ngày + Mã Khách sẽ được gộp thành một đơn con.',
      'Mã Nv là mã NVBH bắt buộc; hệ thống tra trong Users/Tài khoản. Nếu mã sai hoặc không tồn tại thì đơn bị báo lỗi.',
      'Mã Khách và Mã hàng là khóa chính để tra danh mục; tên khách/tên hàng chỉ dùng để đối chiếu.',
      'Ngày chấp nhận dạng DD.MM.YYYY, DD/MM/YYYY hoặc YYYY-MM-DD.',
      'Đơn giá sau KM/Ck là giá bán cuối cùng của dòng; Thành tiền dùng để kiểm tra/tính tổng dòng.',
      'Nếu cột Là KM có giá trị 1/Y/KM/Có thì dòng đó được hiểu là hàng khuyến mại, trừ tồn nhưng không tính doanh thu.'
    ]
  },

  promotionProductRules: {
    title: 'Mẫu import CK sản phẩm',
    fileName: 'mau-import-ck-san-pham.xlsx',
    columns: ['programCode', 'programName', 'productCode', 'productName', 'discountPercent'],
    headers: ['Mã chương trình', 'Nội dung chương trình', 'Mã sản phẩm', 'Tên sản phẩm', 'Chiết khấu'],
    sample: [
      ['KM-SP-001', 'CK trực tiếp OMO tháng 6', 'SP001', 'OMO Bột giặt 5.5kg', 5],
      ['KM-SP-001', 'CK trực tiếp OMO tháng 6', 'SP002', 'Comfort Đậm Đặc 3.8L', 3]
    ],
    notes: ['Dùng cho Tab 1: lấy bất kỳ sản phẩm nào trong danh sách thì được chiết khấu %.', 'Mã sản phẩm phải tồn tại trong danh mục sản phẩm.', 'Khi tính khuyến mại, giá trị làm căn cứ luôn lấy theo Giá bán trong danh mục sản phẩm.']
  },
  promotionGroupItems: {
    title: 'Mẫu import nhóm sản phẩm KM',
    fileName: 'mau-import-nhom-san-pham-km.xlsx',
    columns: ['programCode', 'productCode'],
    headers: ['Mã chương trình KM', 'Mã sản phẩm'],
    sample: [
      ['KM-NHOM-001', 'SP001'],
      ['KM-NHOM-001', 'SP002']
    ],
    notes: ['Dùng cho Tab 2: chỉ cần 2 cột để gán sản phẩm vào nhóm.', 'Các sản phẩm cùng Mã chương trình KM sẽ tự động được hiểu là một nhóm sản phẩm.', 'Mã sản phẩm phải tồn tại trong danh mục sản phẩm.']
  },
  promotionGroupRules: {
    title: 'Mẫu import điều kiện nhóm KM',
    fileName: 'mau-import-dieu-kien-nhom-km.xlsx',
    columns: ['programCode', 'programName', 'minAmount', 'discountPercent'],
    headers: ['Mã nhóm sản phẩm', 'Nội dung chương trình KM', 'Mức doanh số cần lấy', 'Chiết khấu'],
    sample: [
      ['KM-NHOM-001', 'Nhóm giặt tẩy tháng 6', 5000000, 2],
      ['KM-NHOM-001', 'Nhóm giặt tẩy tháng 6', 10000000, 4]
    ],
    notes: ['Dùng cho Tab 3: một mã nhóm có nhiều mức doanh số thì nhập nhiều dòng.', 'Doanh số nhóm được tính bằng số lượng bán × Giá bán trong danh mục sản phẩm.', 'Khi đạt nhiều mức, hệ thống lấy mức doanh số cao nhất đã đạt.']
  },
  openingDebt: {
    title: 'Mẫu import công nợ ban đầu',
    fileName: 'mau-import-cong-no-ban-dau.xlsx',
    columns: ['date', 'customerCode', 'amount', 'note'],
    headers: ['Ngày', 'Mã khách hàng', 'Số tiền công nợ đầu', 'Ghi chú'],
    sample: [
      ['26/05/2026', 'KH001', 1500000, 'Nợ đầu kỳ'],
      ['26/05/2026', 'KH002', 750000, 'Nợ đầu kỳ']
    ],
    notes: ['Mã khách hàng phải tồn tại trong danh mục.', 'Số tiền công nợ không được âm.']
  },
  debtCollections: {
    title: 'Mẫu import thu công nợ',
    fileName: 'mau-import-thu-cong-no.xlsx',
    columns: ['date', 'customerCode', 'amount', 'staffName', 'note'],
    headers: ['Ngày', 'Mã khách hàng', 'Số tiền thu', 'Người thu', 'Ghi chú'],
    sample: [
      ['26/05/2026', 'KH001', 500000, 'Nguyễn Văn A', 'Thu tiền giao hàng'],
      ['26/05/2026', 'KH002', 300000, 'Trần Văn B', 'Thu công nợ']
    ],
    notes: ['Import thu công nợ sẽ đồng thời ghi vào công nợ và quỹ tiền.', 'Số tiền thu phải lớn hơn 0.']
  },
  cashbook: {
    title: 'Mẫu import quỹ tiền',
    fileName: 'mau-import-quy-tien.xlsx',
    columns: ['date', 'type', 'source', 'staffName', 'amount', 'note'],
    headers: ['Ngày', 'Loại thu/chi', 'Nguồn/Nhóm tiền', 'Người nộp/nhận', 'Số tiền', 'Ghi chú'],
    sample: [
      ['26/05/2026', 'thu', 'Nhân viên giao hàng nộp tiền', 'Nguyễn Văn A', 1000000, 'Nộp tiền cuối ngày'],
      ['26/05/2026', 'chi', 'Chi phí vận hành', 'Trần Văn B', 200000, 'Chi xăng xe']
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
    ['3. Ngày nên nhập theo định dạng DD/MM/YYYY, ví dụ 26/05/2026.'],
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
