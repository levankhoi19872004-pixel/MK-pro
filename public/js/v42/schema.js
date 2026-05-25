window.KHO_SCHEMA = {
  menus: [
    ['dashboard','Tổng quan hôm nay','Doanh số, tiền thu, công nợ, cảnh báo trong ngày'],
    ['sales','Bán hàng / Xuất đơn','Tạo đơn, trừ tồn, ghi công nợ, in phiếu'],
    ['receive','Nhập kho','Nhập tay/import, cộng tồn, ghi phiếu nhập'],
    ['warehouse','Kho hàng','Tồn thực tế, tồn mở bán, DMS, điều chỉnh kho'],
    ['products','Sản phẩm','Mã hàng, đơn vị tính, kho quản lý, mapping VNPT/DMS'],
    ['customers','Khách hàng','Thông tin khách, công nợ, lịch sử mua'],
    ['staff','Nhân viên','Bán hàng, giao hàng, kế toán, thủ kho, tài khoản'],
    ['debt','Công nợ','Đầu kỳ, phát sinh, thu tiền, điều chỉnh'],
    ['cash','Quỹ tiền','Phiếu thu/chi, nhân viên nộp tiền, đối soát'],
    ['reports','Báo cáo','Doanh số, nhập xuất tồn, công nợ, quỹ, hàng thiếu'],
    ['importExport','Import / Xuất file','Import Excel, xuất VNPT TT78, export báo cáo'],
    ['system','Hệ thống','Phân quyền, sao lưu, nhật ký thao tác, cấu hình']
  ],
  columns: {
    products:['code','name','unit','warehouse','price','dmsCode','vnptCode'],
    customers:['code','name','address','phone','staffName','debtLimit'],
    staff:['code','name','phone','role','username'],
    stocks:['productCode','productName','warehouse','actualQty','openQty','dmsQty'],
    receipts:['code','date','supplier','warehouse','totalQty','status'],
    orders:['code','date','customerName','staffName','totalAmount','status'],
    debts:['customerCode','customerName','opening','increase','decrease','balance'],
    cashFund:['date','type','amount','source','staffName','note'],
    stockJournal:['date','type','productCode','productName','warehouse','qty','actualAfter','note'],
    documents:['date','type','code','status','refId'],
    auditLogs:['date','at','user','action','detail']
  }
};
