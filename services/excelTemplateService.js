const { createWorkbook, appendAoaSheet, writeWorkbook } = require('../src/utils/excelWriter.util');

const TEMPLATE_DEFINITIONS = {
  products: {
    title: 'Mẫu import sản phẩm',
    fileName: 'mau-import-san-pham.xlsx',
    columns: ['code', 'name', 'unit', 'baseUnit', 'conversionRate', 'packing', 'barcode', 'category', 'costPrice', 'salePrice', 'pickingZone', 'minStock', 'maxStock'],
    headers: ['Mã sản phẩm', 'Tên sản phẩm', 'Đơn vị bán', 'Đơn vị gốc', 'Quy đổi', 'Quy cách', 'Barcode', 'Nhóm hàng', 'Giá nhập', 'Giá bán', 'Khu bốc hàng', 'Tồn tối thiểu', 'Tồn tối đa'],
    sample: [
      ['SP001', 'OMO Bột giặt 5.5kg', 'Thùng', 'Túi', 6, '1 thùng = 6 túi', '893000000001', 'Giặt tẩy', 145000, 169000, 'HC', 10, 200],
      ['SP002', 'Comfort Đậm Đặc 3.8L', 'Thùng', 'Chai', 4, '1 thùng = 4 chai', '893000000002', 'Nước xả', 115000, 139000, 'PC', 10, 150]
    ],
    notes: ['Bắt buộc khi thêm mới: code, name. Khi dùng Cập nhật an toàn chỉ bắt buộc Mã sản phẩm.', 'Quy đổi là số đơn vị gốc trong 1 đơn vị bán, ví dụ 1 thùng = 12 chai thì nhập 12.', 'Khu bốc hàng chỉ nhận HC hoặc PC, dùng để tách phiếu bốc hàng đơn tổng; không ảnh hưởng tồn kho MAIN.', 'Chế độ Cập nhật an toàn: ô trống/cột thiếu giữ nguyên dữ liệu Mongo; chỉ giá trị khác dữ liệu cũ mới được cập nhật.', 'Chế độ Import thông thường không chấp nhận mã sản phẩm đã tồn tại.']
  },
  customers: {
    title: 'Mẫu import khách hàng',
    fileName: 'mau-import-khach-hang.xlsx',
    columns: ['code', 'name', 'businessName', 'phone', 'address', 'taxCode', 'taxInvoiceAddress', 'area', 'staffCode', 'staffName'],
    headers: ['Mã khách hàng', 'Tên khách hàng', 'Tên hộ kinh doanh', 'SĐT', 'Địa chỉ giao hàng', 'Mã số thuế', 'Địa chỉ hóa đơn thuế', 'Khu vực', 'Mã NVBH', 'Tên NVBH tham khảo'],
    sample: [
      ['KH001', 'Tạp hóa Minh Anh', 'HỘ KINH DOANH MINH ANH', '0987654321', 'Số 1 Minh Khai', '1001234567', 'Số 1 Minh Khai, phường Minh Khai, tỉnh Hưng Yên', 'Tuyến 1', 'NVBH01', 'Nguyễn Văn A'],
      ['KH002', 'Siêu thị mini An Bình', 'HỘ KINH DOANH AN BÌNH', '0912345678', 'Số 2 Bạch Mai', '1007654321-001', 'Số 2 Bạch Mai, phường Bạch Mai, Hà Nội', 'Tuyến 2', 'NVBH02', 'Trần Văn B']
    ],
    notes: ['Bắt buộc khi thêm mới: code, name. Khi dùng Cập nhật an toàn chỉ bắt buộc Mã khách hàng.', 'Chế độ Cập nhật an toàn: ô trống/cột thiếu giữ nguyên dữ liệu Mongo; chỉ giá trị khác dữ liệu cũ mới được cập nhật.', 'Tên hộ kinh doanh là tên đăng ký pháp lý dùng khi xuất hóa đơn VAT; để trống sẽ dùng Tên khách hàng.', 'Mã số thuế nên định dạng Text trong Excel để không mất số 0 đầu.', 'Địa chỉ hóa đơn thuế được ưu tiên khi xuất hóa đơn VAT; nếu để trống hệ thống mới dùng địa chỉ giao hàng.', 'Cột Mã NVBH là dữ liệu chính để gán nhân viên phụ trách; Tên NVBH chỉ để tham khảo.']
  },

  users: {
    title: 'Mẫu import thông tin tài khoản',
    fileName: 'mau-import-thong-tin-tai-khoan.xlsx',
    columns: ['username', 'password', 'fullName', 'staffCode', 'role', 'phone', 'email', 'area', 'route', 'isActive'],
    headers: ['Tên đăng nhập', 'Mật khẩu', 'Họ tên', 'Mã nhân viên', 'Vai trò', 'SĐT', 'Email', 'Khu vực', 'Tuyến', 'Trạng thái'],
    sample: [
      ['nvbh01', '123456', 'Nguyễn Văn Bán', 'NVBH01', 'sales', '0912345678', 'nvbh01@example.com', 'Kiến Xương', 'Tuyến 1', 'Hoạt động'],
      ['nvgh01', '123456', 'Trần Văn Giao', 'NVGH01', 'delivery', '0987654321', 'nvgh01@example.com', 'Thái Bình', 'Tuyến giao 1', 'Hoạt động']
    ],
    notes: [
      'Bắt buộc: Tên đăng nhập, Họ tên, Mã nhân viên, Vai trò.',
      'Vai trò hợp lệ: admin, manager, accountant, sales, delivery, warehouse.',
      'Chế độ Cập nhật an toàn chỉ yêu cầu Tên đăng nhập; ô trống/cột thiếu giữ nguyên dữ liệu cũ.',
      'Nếu nhập mật khẩu mới thì hệ thống thay mật khẩu; để trống thì giữ mật khẩu hiện tại.',
      'Chế độ Import thông thường giữ hành vi hiện tại: tạo mới hoặc cập nhật đầy đủ theo dòng Excel.',
      'Không nhập passwordHash/token/secret vào file Excel.'
    ]
  },
  openingStock: {
    title: 'Mẫu import tồn kho ban đầu',
    fileName: 'mau-import-ton-kho-ban-dau.xlsx',
    columns: ['date', 'productCode', 'productName', 'cartons', 'units'],
    headers: ['Ngày', 'Mã sản phẩm', 'Tên sản phẩm', 'SL thùng', 'SL lẻ'],
    sample: [
      ['26/05/2026', 'SP001', 'OMO Bột giặt 5.5kg', 2, 0],
      ['26/05/2026', 'SP002', 'Comfort Đậm Đặc 3.8L', 0, 2532]
    ],
    notes: [
      'Mẫu tồn kho ban đầu dùng SL thùng và SL lẻ; không dùng cột Số lượng để tránh nhầm dữ liệu.',
      'SL thùng sẽ được quy đổi theo Quy đổi/conversionRate của sản phẩm trong danh mục; SL lẻ được hiểu là số đơn vị lẻ.',
      'Ví dụ: sản phẩm có Quy đổi = 12, SL thùng = 2, SL lẻ = 5 thì hệ thống hiểu là 29 lẻ.',
      'Nếu nhập toàn bộ là lẻ như 2532 thì để SL thùng = 0 và nhập 2532 vào SL lẻ.',
      'Tên sản phẩm chỉ để đối chiếu; hệ thống lấy thông tin chính theo Mã sản phẩm.',
      'Mã sản phẩm phải tồn tại trong danh mục sản phẩm.',
      'Import tồn kho ban đầu sẽ đặt lại số lượng tồn theo file, chỉ dùng khi khởi tạo hoặc chốt tồn đầu kỳ.'
    ]
  },
  importOrders: {
    title: 'Mẫu import phiếu nhập kho',
    fileName: 'mau-import-phieu-nhap-kho.xlsx',
    columns: ['documentCode', 'date', 'supplier', 'productCode', 'productName', 'cartons', 'units', 'pickingZone', 'note'],
    headers: ['Mã phiếu', 'Ngày', 'Nhà cung cấp', 'Mã sản phẩm', 'Tên sản phẩm', 'SL thùng', 'SL lẻ', 'Khu bốc hàng', 'Ghi chú'],
    sample: [
      ['PN-EXCEL-001', '26/05/2026', 'Unilever', 'SP001', 'OMO Bột giặt 5.5kg', 2, 0, 'HC', 'Nhập 2 thùng'],
      ['PN-EXCEL-001', '26/05/2026', 'Unilever', 'SP002', 'Comfort Đậm Đặc 3.8L', 0, 2532, 'PC', 'Nhập 2532 lẻ']
    ],
    notes: [
      'Các dòng có cùng mã phiếu/ngày/nhà cung cấp sẽ được gộp thành một phiếu nhập.',
      'Mẫu phiếu nhập dùng SL thùng và SL lẻ; không dùng cột Số lượng để tránh nhầm dữ liệu.',
      'SL thùng sẽ được quy đổi theo Quy đổi/conversionRate của sản phẩm trong danh mục; SL lẻ được hiểu là số đơn vị lẻ.',
      'Ví dụ: sản phẩm có Quy đổi = 12, SL thùng = 2, SL lẻ = 5 thì hệ thống hiểu là 29 lẻ.',
      'Nếu nhập toàn bộ là lẻ như 2532 thì để SL thùng = 0 và nhập 2532 vào SL lẻ.',
      'Nếu SL thùng = 0 và SL lẻ = 0, dòng đó được hiểu là không nhập sản phẩm này và sẽ bị bỏ qua.',
      'Giá nhập tự lấy từ trường giá nhập đã lưu trong danh mục sản phẩm.',
      'Định dạng ngày chuẩn: DD/MM/YYYY (ví dụ 26/05/2026).'
    ]
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
    columns: ['date', 'documentCode', 'staffCode', 'staffName', 'customerCode', 'customerName', 'productCode', 'productName', 'packingQty', 'isPromo', 'cartons', 'units', 'salePrice', 'amount', 'warehouseCode'],
    headers: ['Ngày', 'Số Đơn', 'Mã Nv', 'Tên NV', 'Mã Khách', 'Tên Khách', 'Mã hàng', 'Tên hàng', 'QC', 'Là KM', 'SL thùng', 'SL lẻ', 'Đơn giá sau KM/Ck', 'Thành tiền', 'Mã Kho'],
    sample: [
      ['03.06.2026', 'B0036696', '33948', 'Đỗ Thị Mừng TP - 0962033288', '4501252', 'Chị Kim Anh', '64330134', 'SUNLIGHT NRC Thiên Nhiên Lô Hội 750g/15 Chai', 15, '', 3, 0, 28093, 1264169, 'KHOCHINH'],
      ['03.06.2026', 'B0036696', '33948', 'Đỗ Thị Mừng TP - 0962033288', '4501252', 'Chị Kim Anh', '64330146', 'SUNLIGHT NRC Chanh 750g/15 Chai', 15, '', 3, 0, 28093, 1264169, 'KHOCHINH'],
      ['03.06.2026', 'B0036696', '33948', 'Đỗ Thị Mừng TP - 0962033288', '4501252', 'Chị Kim Anh', '64330148', 'SUNLIGHT NRC Túi 3.6kg/4 Túi', 4, '', 3, 3, 93425, 1401375, 'KHOCHINH']
    ],
    notes: [
      'Mẫu S3 dùng đúng các cột bôi vàng: Ngày, Số Đơn, Mã Nv, Mã Khách, Tên Khách, Mã hàng, Tên hàng, SL thùng, SL lẻ, Đơn giá sau KM/Ck, Thành tiền.',
      'Các dòng cùng Số Đơn + Ngày + Mã Khách sẽ được gộp thành một đơn con.',
      'SL thùng/SL lẻ được quy đổi theo QC của dòng hoặc Quy đổi/conversionRate trong danh mục sản phẩm.',
      'Nếu nhập toàn bộ là lẻ như 2532 thì để SL thùng = 0 và nhập 2532 vào SL lẻ.',
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

  promotionQuantityGroupDiscounts: {
    title: 'Mẫu import CK theo số lượng nhóm SP',
    fileName: 'mau-import-ck-theo-so-luong-nhom-sp.xlsx',
    columns: ['programCode', 'programName', 'startDate', 'endDate', 'productGroupCode', 'productGroupName', 'productCode', 'productName', 'minQty', 'qtyUnit', 'discountPercent', 'isActive', 'note'],
    headers: ['Mã chương trình KM', 'Tên chương trình KM', 'Từ ngày', 'Đến ngày', 'Mã nhóm SP', 'Tên nhóm SP', 'Mã sản phẩm', 'Tên sản phẩm', 'Số lượng tối thiểu', 'Đơn vị tính', '% chiết khấu', 'Trạng thái', 'Ghi chú'],
    sample: [
      ['QTY-NXV-001', 'NXV COMFORT/SURF đủ 12 dây giảm 17%', '01/07/2026', '31/07/2026', 'NXV_COMFORT_SURF', 'NXV COMFORT/SURF', 'SP001', 'Comfort dây 10 gói', 12, 'dây', 17, 'Hoạt động', 'Cộng gộp toàn bộ SP trong nhóm'],
      ['QTY-NXV-001', 'NXV COMFORT/SURF đủ 12 dây giảm 17%', '01/07/2026', '31/07/2026', 'NXV_COMFORT_SURF', 'NXV COMFORT/SURF', 'SP002', 'Surf dây 10 gói', 12, 'dây', 17, 'Hoạt động', 'Cùng mã chương trình sẽ gom chung rule']
    ],
    notes: ['Cùng Mã chương trình KM sẽ gom nhiều dòng sản phẩm thành một rule.', 'Hệ thống cộng tổng số lượng các sản phẩm trong nhóm; đủ Số lượng tối thiểu thì giảm % trên các dòng sản phẩm thuộc nhóm.', 'Không hardcode tên nhóm; Mã nhóm SP chỉ dùng để quản trị và đối soát.', 'Mã sản phẩm phải tồn tại trong danh mục để hạn chế sai sót.']
  },
  promotionCustomerOrderValueDiscounts: {
    title: 'Mẫu import CK thêm theo doanh số khách hàng',
    fileName: 'mau-import-ck-them-theo-doanh-so-khach-hang.xlsx',
    columns: ['programCode', 'programName', 'startDate', 'endDate', 'customerCode', 'customerName', 'minOrderAmount', 'discountPercent', 'baseAmountMode', 'isActive', 'note'],
    headers: ['Mã chương trình KM', 'Tên chương trình KM', 'Từ ngày', 'Đến ngày', 'Mã khách hàng', 'Tên khách hàng', 'Doanh số đơn tối thiểu', '% chiết khấu thêm', 'Cách tính nền', 'Trạng thái', 'Ghi chú'],
    sample: [
      ['CUST-DS-001', 'KH danh sách đạt DS đơn giảm thêm 3%', '01/07/2026', '31/07/2026', 'B0038442', 'Hoa Sơn', 2000000, 3, 'after_line_promotions', 'Hoạt động', 'Tính sau CK dòng hàng'],
      ['CUST-DS-001', 'KH danh sách đạt DS đơn giảm thêm 3%', '01/07/2026', '31/07/2026', 'B0038423', 'Khách hàng mẫu', 2000000, 3, 'after_line_promotions', 'Hoạt động', 'Cùng mã chương trình sẽ gom danh sách KH']
    ],
    notes: ['Chỉ khách hàng trong danh sách mới được hưởng chiết khấu thêm.', 'Cùng Mã chương trình KM sẽ gom nhiều dòng khách hàng thành một rule.', 'Cách tính nền mặc định after_line_promotions nghĩa là tính sau các chiết khấu dòng hàng.', 'Mã khách hàng phải tồn tại trong danh mục khách hàng.']
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
  return { rows, widths };
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

async function buildImportTemplate(type) {
  const definition = TEMPLATE_DEFINITIONS[type];
  if (!definition) {
    const error = new Error('Loại mẫu import không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const workbook = createWorkbook();
  const guideSheet = buildGuideSheet(definition);
  appendAoaSheet(workbook, 'HuongDan', guideSheet.rows, { widths: guideSheet.widths });
  const sampleSheet = sheetFromRows([definition.headers, ...definition.sample], definition.headers.map((h) => Math.max(14, String(h).length + 6)));
  appendAoaSheet(workbook, 'DuLieuMau', sampleSheet.rows, { widths: sampleSheet.widths, autoFilter: true });
  const importSheet = sheetFromRows([definition.headers], definition.headers.map((h) => Math.max(14, String(h).length + 6)));
  appendAoaSheet(workbook, 'Import', importSheet.rows, { widths: importSheet.widths, autoFilter: true });

  const buffer = writeWorkbook(workbook);
  return { buffer, fileName: definition.fileName };
}

function getTemplateTypes() {
  return Object.keys(TEMPLATE_DEFINITIONS).map((type) => ({ type, title: TEMPLATE_DEFINITIONS[type].title, fileName: TEMPLATE_DEFINITIONS[type].fileName }));
}

module.exports = { buildImportTemplate, getTemplateTypes, TEMPLATE_DEFINITIONS };
