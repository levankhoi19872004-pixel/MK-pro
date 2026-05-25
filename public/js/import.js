window.__KHO_IMPORT_ENGINE_PRO_V5__ = true;
window.Importer = (() => {
  let pending = null;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const norm = v => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
  function pick(row, keys){
    row = row || {};
    for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    const map = {};
    Object.keys(row).forEach(k => map[norm(k)] = row[k]);
    for (const k of keys) {
      const nk = norm(k);
      if (map[nk] !== undefined && map[nk] !== null && map[nk] !== '') return map[nk];
    }
    return '';
  }
  function num(v){
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).trim().replace(/[₫đĐ\s]/g,'');
    if (!s) return 0;
    const hasComma = s.includes(','), hasDot = s.includes('.');
    if (hasComma && hasDot) {
      const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
      s = c > d ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
    } else if (hasComma) {
      const parts = s.split(',');
      s = parts.length > 2 || /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g,'') : s.replace(',','.');
    } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g,'');
    }
    const n = Number(s.replace(/[^0-9.\-]/g,''));
    return isFinite(n) ? n : 0;
  }
  function date(v){
    if (v === null || v === undefined || v === '') return new Date().toISOString().slice(0,10);
    if (typeof v === 'number' && v > 25000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(d)) return d.toISOString().slice(0,10);
    }
    const s = String(v).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
      const p = s.split(/[ T]/)[0].split('-');
      return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
    }
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
    const d = new Date(s);
    return isNaN(d) ? new Date().toISOString().slice(0,10) : d.toISOString().slice(0,10);
  }
  function parseQty(row, pack){
    pack = num(pack) || 1;
    const raw = pick(row, ['SL','Số lượng','So luong','Số lượng đặt','Số lượng bán','Số lượng giao','Số lượng nhập','SL nhập','SL bán','SL giao','Quantity','Qty','Tổng SL','Tong SL']);
    if (raw !== '' && raw !== null && raw !== undefined) {
      const s = String(raw).trim();
      if (s.includes('/')) {
        const [box, each] = s.split('/');
        return num(box) * pack + num(each);
      }
      return num(raw);
    }
    return num(pick(row, ['Thùng','Thung','Case','CS','Số thùng','Số lượng thùng','So luong thung'])) * pack + num(pick(row, ['Lẻ','Le','Each','SU','Cái','Số lẻ','Số lượng SU','So luong SU']));
  }

  // Mẫu đơn hàng DMS chuẩn theo file: file mẫu 1.xlsx
  // A: Tuyến bán hàng | B: Số hóa đơn | C: Ngày lập hóa đơn | D: Mã hàng hóa
  // E: Mô tả mặt hàng | F: Đóng gói | G/H: SL thùng/SU | I/J: SL khuyến mãi | K/L: NVTT
  // M: Mã cửa hàng | P: Đơn giá | Q/R: GSV/NIV | S: Họ | T: Doanh số mỗi ngày | U/V: Loại HĐ/Thuế
  function isDmsOrderTemplateRow(row){
    const keys = Object.keys(row || {}).map(norm);
    const must = ['sohoadon','ngaylaphoadon','mahanghoa','motamathang','donggoi','soluongsu','manhanvien','macuahang','dongia'];
    return must.filter(k => keys.includes(k)).length >= 6;
  }
  function parseDmsTemplateQty(row, pack){
    pack = num(pack) || 1;
    const paidBox = num(pick(row, ['Số lượng thùng','So luong thung']));
    const paidSu = num(pick(row, ['Số lượng SU','So luong SU']));
    const freeBox = num(pick(row, ['Số lượng khuyến mãi theo thùng/ Số thùng','Số lượng khuyến mãi theo thùng','So luong khuyen mai theo thung']));
    const freeSu = num(pick(row, ['Số lượng khuyến mãi theo SU/ Số SU khuyế','Số lượng khuyến mãi theo SU','So luong khuyen mai theo SU']));
    return (paidBox + freeBox) * pack + paidSu + freeSu;
  }
  function readFile(file){
    return new Promise((resolve, reject) => {
      if (!window.XLSX) return reject(new Error('Thiếu thư viện XLSX'));
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const isCsv = String(file.name).toLowerCase().endsWith('.csv');
          const wb = isCsv ? XLSX.read(ev.target.result, { type:'string' }) : XLSX.read(new Uint8Array(ev.target.result), { type:'array', cellDates:true, raw:false });
          const sheetName = wb.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval:'', raw:false });
          resolve({ rows, sheetName, fileName:file.name });
        } catch(err) { reject(err); }
      };
      reader.onerror = reject;
      if (String(file.name).toLowerCase().endsWith('.csv')) reader.readAsText(file, 'UTF-8'); else reader.readAsArrayBuffer(file);
    });
  }

  const parsers = {

    productGroups(rows){
      return rows.map((r,i) => {
        const code = String(pick(r,['Mã nhóm','Mã nhóm sản phẩm','Group Code','Code']) || '').trim();
        const name = String(pick(r,['Tên nhóm','Tên nhóm sản phẩm','Group Name','Name']) || '').trim();
        return { row:i+2, valid:!!(code || name), error:!(code || name)?'Thiếu mã nhóm hoặc tên nhóm':'', code, name, note:String(pick(r,['Ghi chú','Note']) || '').trim() };
      });
    },
    products(rows){
      return rows.map((r,i) => {
        const sku = String(pick(r,['SKU','Mã SP','Mã sản phẩm','Mã hàng','Mã hàng DMS','Ma hang','Ma san pham','Item Code','Product Code','Code']) || '').trim();
        const name = String(pick(r,['Tên sản phẩm','Tên hàng','Tên','Name']) || '').trim();
        return { row:i+2, valid:!!sku && !!name, error:!sku?'Thiếu SKU':(!name?'Thiếu tên sản phẩm':''),
          sku, name,
          brand:String(pick(r,['Nhãn hàng','Brand']) || '').trim(),
          category:String(pick(r,['Ngành hàng','Category']) || '').trim(),
          unit:String(pick(r,['Đơn vị tính','ĐVT','Unit']) || 'cái').trim() || 'cái',
          pack:num(pick(r,['Quy cách','Pack'])) || 1,
          costRef:Math.round(num(pick(r,['Giá nhập tham chiếu','Giá nhập','Giá vốn','Cost']))),
          saleRef:Math.round(num(pick(r,['Giá bán tham chiếu','Giá bán','Giá bán lẻ','Sale','Price','Đơn giá']))),
          warehouse:String(pick(r,['Kho quản lý','Kho hàng','Kho','Warehouse']) || 'Kho chính').trim() || 'Kho chính',
          status:'active',
          note:String(pick(r,['Ghi chú','Note']) || '').trim()
        };
      });
    },
    receive(rows){
      const fileId = 'PN' + String(Date.now()).slice(-8);
      return rows.map((r,i) => {
        const sku = String(pick(r,['SKU','Mã SP','Mã sản phẩm','Mã hàng','Mã hàng DMS','Ma hang','Ma san pham','Item Code','Product Code','Code']) || '').trim();
        const pack = num(pick(r,['Quy cách','Pack'])) || 1;
        const qty = parseQty(r, pack);
        return { row:i+2, valid:!!sku && qty > 0, error:!sku?'Thiếu SKU':(qty<=0?'Số lượng <= 0':''),
          receiptId:String(pick(r,['Mã phiếu','Mã đơn','Số phiếu','Phiếu nhập']) || fileId).trim() || fileId,
          date:date(pick(r,['Ngày nhập','Ngày','Date'])),
          supplier:String(pick(r,['Nhà cung cấp','NCC','Supplier']) || 'Unilever').trim() || 'Unilever',
          sku, name:String(pick(r,['Tên sản phẩm','Tên hàng','Tên','Name']) || sku).trim(),
          pack, qty, cost:Math.round(num(pick(r,['Giá nhập','Giá','Cost','Đơn giá']))),
          note:String(pick(r,['Ghi chú','Note']) || '').trim()
        };
      });
    },
    orders(rows){
      const fileId = 'DH' + String(Date.now()).slice(-8);
      return rows.map((r,i) => {
        const isDmsTemplate = isDmsOrderTemplateRow(r);
        const sku = String(pick(r, isDmsTemplate ? ['Mã hàng hóa','Ma hang hoa'] : ['SKU','Mã SP','Mã sản phẩm','Mã hàng','Mã hàng DMS','Ma hang','Ma san pham','Item Code','Product Code','Code']) || '').trim();
        const pack = num(pick(r, isDmsTemplate ? ['Đóng gói','Dong goi'] : ['Quy cách','Pack','Đóng gói'])) || 1;
        const qty = isDmsTemplate ? parseDmsTemplateQty(r, pack) : parseQty(r, pack);
        const orderId = String(pick(r, isDmsTemplate ? ['Số hóa đơn','So hoa don'] : ['Mã đơn','Số đơn','Mã ĐH','Ma DH','Số chứng từ','Số CT','Order ID','Order No','Document No']) || fileId).trim() || fileId;
        const sale = Math.round(num(pick(r, isDmsTemplate ? ['Đơn giá','Don gia'] : ['Giá bán','Đơn giá','Giá bán sau CK','Giá bán DMS','Price','Unit Price','Cột P','Cot P','P'])));
        const gsv = Math.round(num(pick(r, ['GSV bán ra','GSV ban ra'])));
        const niv = Math.round(num(pick(r, ['NIV bán ra','NIV ban ra'])));
        const tax = Math.round(num(pick(r, ['Thuế','Thue'])));
        return { row:i+2, valid:!!orderId && !!sku && qty > 0, error:!orderId?'Thiếu số hóa đơn/mã đơn':(!sku?'Thiếu mã hàng hóa/SKU':(qty<=0?'Số lượng <= 0':'')),
          orderId,
          date:date(pick(r, isDmsTemplate ? ['Ngày lập hoá đơn','Ngày lập hóa đơn','Ngay lap hoa don'] : ['Ngày bán','Ngày','Date'])),
          route:String(pick(r,['Tuyến bán hàng','Tuyen ban hang']) || '').trim(),
          customerCode:String(pick(r, isDmsTemplate ? ['Mã cửa hàng','Ma cua hang'] : ['Mã KH','Mã khách hàng','Mã điểm bán','Mã NPP/KH','Customer Code','Customer ID','Outlet Code']) || '').trim(),
          customerName:String(pick(r, isDmsTemplate ? ['Họ','Họ','Ho','Tên cửa hàng'] : ['Khách hàng','Tên KH','Tên khách hàng','Tên điểm bán','Tên cửa hàng','Customer','Outlet Name']) || '').trim(),
          staffCode:String(pick(r, isDmsTemplate ? ['Mã nhân viên','Mã nhân viên','Ma nhan vien'] : ['Mã NV','Mã nhân viên','Mã NVBH','Sales Code','Staff Code']) || '').trim(),
          staffName:String(pick(r, isDmsTemplate ? ['Tên NVTT','Ten NVTT'] : ['Nhân viên','Tên NV','NVBH','Tên NVBH','Salesman','Staff']) || '').trim(),
          deliveryStaffCode:String(pick(r,['Mã NVGH','Mã giao hàng','Mã ship','Delivery Code']) || '').trim(),
          deliveryStaffName:String(pick(r,['NV giao hàng','Nhân viên giao hàng','Delivery Staff']) || '').trim(),
          sku, name:String(pick(r, isDmsTemplate ? ['Mô tả mặt hàng','Mo ta mat hang'] : ['Tên sản phẩm','Tên hàng','Name']) || sku).trim(),
          pack, qty, sale, gsv, niv, tax,
          invoiceType:String(pick(r,['Loại hóa đơn','Loai hoa don']) || '').trim(),
          dailyInvoiceNo:num(pick(r,['Số hóa đơn trong 1 ngày','So hoa don trong 1 ngay'])),
          dailySkuNo:num(pick(r,['Số SKU trong 1 ngày','So SKU trong 1 ngay'])),
          dailySales:Math.round(num(pick(r,['Doanh số mỗi ngày','Doanh so moi ngay']))),
          discount:num(pick(r,['Chiết khấu','CK','Discount'])),
          cashPaid:num(pick(r,['Tiền mặt','Cash'])),
          bankPaid:num(pick(r,['Chuyển khoản','Bank'])),
          returnAmount:num(pick(r,['Hàng trả về','Tiền hàng trả về','Return Amount'])),
          source:isDmsTemplate ? 'DMS' : '',
          note:String(pick(r,['Ghi chú','Note']) || (isDmsTemplate ? 'Đơn từ DMS' : '')).trim()
        };
      });
    },
    dmsOrders(rows){ return parsers.orders(rows).map(r => ({ ...r, source:'DMS', note:r.note || 'Đơn từ DMS' })); },
    dmsAuto(rows){
      const first = rows.find(r => r && Object.keys(r).length) || {};
      const keys = Object.keys(first).map(norm);
      const looksLikeStock = keys.includes('tonkhocuoikysu') || keys.includes('toncuoicssu') || keys.includes('sohieuhanghoa') || keys.includes('quicachdonggoi');
      return looksLikeStock ? parsers.dmsStocks(rows) : parsers.dmsOrders(rows);
    },
    dmsStocks(rows){
      return rows.map((r,i) => {
        const sku = String(pick(r,['SKU','Mã SP','Mã sản phẩm','Mã hàng','Mã hàng DMS','Số hiệu hàng hóa','So hieu hang hoa','Mã Basepack','Ma Basepack','Ma hang','Ma san pham','Item Code','Product Code','Code']) || '').trim();
        const pack = num(pick(r,['Quy cách','Qui cách đóng gói','Qui cach dong goi','Quy cach dong goi','Pack'])) || 1;
        const qtyText = pick(r,['Tồn cuối (CS/SU)','Ton cuoi (CS/SU)','Tồn Đầu (CS/SU)','Ton dau (CS/SU)']);
        const qty = pick(r,['Tồn kho cuối kỳ (SU)','Ton kho cuoi ky (SU)','Tồn kho đầu kỳ (SU)','Ton kho dau ky (SU)']) !== ''
          ? num(pick(r,['Tồn kho cuối kỳ (SU)','Ton kho cuoi ky (SU)','Tồn kho đầu kỳ (SU)','Ton kho dau ky (SU)']))
          : (qtyText ? parseQty({ SL: qtyText }, pack) : parseQty(r, pack));
        return { row:i+2, valid:!!sku, error:sku?'':'Thiếu SKU',
          sku, name:String(pick(r,['Tên sản phẩm','Tên hàng','Tên','Name','Mô tả mặt hàng','Mo ta mat hang','Mô tả Basepack','Mo ta Basepack']) || sku).trim(),
          pack, qty, date:date(pick(r,['Ngày','Ngày DMS','Date']))
        };
      });
    },
    customers(rows){
      return rows.map((r,i) => {
        const code = String(pick(r,['Mã KH','Mã khách hàng','Code','Customer Code']) || '').trim();
        const name = String(pick(r,['Tên khách hàng','Khách hàng','Tên','Name']) || '').trim();
        return { row:i+2, valid:!!code && !!name, error:!code?'Thiếu mã KH':(!name?'Thiếu tên KH':''),
          code, name,
          phone:String(pick(r,['SĐT','Điện thoại','Phone']) || '').trim(),
          address:String(pick(r,['Địa chỉ','Address']) || '').trim(),
          tax:String(pick(r,['MST','Mã số thuế','Tax']) || '').trim(),
          group:String(pick(r,['Nhóm KH','Group']) || '').trim(),
          note:String(pick(r,['Ghi chú','Note']) || '').trim()
        };
      });
    },
    accounts(rows){
      return rows.map((r,i) => {
        const username = String(pick(r,['Tài khoản','Username','User']) || '').trim().toLowerCase();
        const roleRaw = String(pick(r,['Vai trò','Role']) || 'sales').trim().toLowerCase();
        const role = ['admin','sales','delivery','cashier','accountant','manager'].includes(roleRaw) ? roleRaw : 'sales';
        return { row:i+2, valid:!!username, error:username?'':'Thiếu tài khoản',
          username, password:String(pick(r,['Mật khẩu','Password']) || '123456').trim() || '123456',
          name:String(pick(r,['Tên','Họ tên','Name']) || username).trim(),
          code:String(pick(r,['Mã','Mã NV','Code']) || '').trim(),
          role
        };
      });
    },
    promotions(rows){
      return rows.map((r,i) => {
        const code = String(pick(r,['Mã KM','Mã CTKM','Code']) || '').trim();
        return { row:i+2, valid:!!code, error:code?'':'Thiếu mã KM',
          code, name:String(pick(r,['Tên CTKM','Tên KM','Name']) || '').trim(),
          sku:String(pick(r,['SKU','Mã SP','Mã sản phẩm']) || '').trim(),
          type:String(pick(r,['Loại','Type']) || 'discount').trim(),
          condition:String(pick(r,['Điều kiện','Condition']) || '').trim(),
          value:num(pick(r,['Giá trị','Chiết khấu','Value'])),
          displayReward:num(pick(r,['Thưởng trưng bày','Trưng bày','Display Reward'])),
          coupon:String(pick(r,['Coupon']) || '').trim(),
          ontop:String(pick(r,['Ontop','On top']) || '').trim(),
          from:date(pick(r,['Từ ngày','From'])),
          to:date(pick(r,['Đến ngày','To'])),
          note:String(pick(r,['Ghi chú','Note']) || '').trim()
        };
      });
    }
  };

  const columns = {
    productGroups:[['row','Dòng'],['code','Mã nhóm'],['name','Tên nhóm'],['note','Ghi chú']],
    products:[['row','Dòng'],['sku','SKU'],['name','Tên sản phẩm'],['unit','ĐVT'],['pack','Quy cách'],['saleRef','Giá bán'],['warehouse','Kho']],
    receive:[['row','Dòng'],['receiptId','Mã phiếu'],['date','Ngày'],['supplier','NCC'],['sku','SKU'],['name','Tên'],['qty','SL'],['cost','Giá nhập']],
    orders:[['row','Dòng'],['orderId','Mã đơn'],['date','Ngày'],['customerCode','Mã KH'],['customerName','Khách'],['sku','SKU'],['qty','SL'],['sale','Giá bán']],
    dmsOrders:[['row','Dòng'],['orderId','Mã DMS'],['date','Ngày'],['customerCode','Mã KH'],['customerName','Khách'],['sku','SKU'],['qty','SL'],['sale','Giá bán']],
    dmsAuto:[['row','Dòng'],['date','Ngày'],['sku','SKU'],['name','Tên'],['pack','Quy cách'],['qty','Tồn DMS']],
    dmsStocks:[['row','Dòng'],['date','Ngày'],['sku','SKU'],['name','Tên'],['qty','Tồn DMS']],
    customers:[['row','Dòng'],['code','Mã KH'],['name','Tên KH'],['phone','SĐT'],['address','Địa chỉ'],['group','Nhóm']],
    accounts:[['row','Dòng'],['username','Tài khoản'],['password','Mật khẩu'],['name','Tên'],['code','Mã'],['role','Vai trò']],
    promotions:[['row','Dòng'],['code','Mã CTKM'],['name','Tên'],['sku','SKU'],['value','CK/Giá trị'],['displayReward','Thưởng TB'],['coupon','Coupon'],['ontop','Ontop']]
  };

  const templates = {
    productGroups:[['Mã nhóm','Tên nhóm','Ghi chú'],['GIAT_TAY','Giặt tẩy','Nhóm bột giặt/nước giặt']],
    products:[['SKU','Tên sản phẩm','Nhãn hàng','Ngành hàng','Đơn vị tính','Quy cách','Giá nhập tham chiếu','Giá bán tham chiếu','Kho quản lý','Ghi chú'],['SKU001','OMO 3kg','OMO','Giặt tẩy','gói',6,100000,120000,'Kho bột giặt','']],
    receive:[['Mã phiếu','Ngày nhập','Nhà cung cấp','SKU','Tên sản phẩm','Quy cách','SL','Giá nhập','Ghi chú'],['PN001','2026-05-24','Unilever','SKU001','OMO 3kg',6,120,100000,'']],
    orders:[['Tuyến bán hàng','Số hóa đơn','Ngày lập hoá đơn','Mã hàng hóa','Mô tả mặt hàng','Đóng gói','Số lượng thùng','Số lượng SU','Số lượng khuyến mãi theo thùng/ Số thùng','Số lượng khuyến mãi theo SU/ Số SU khuyế','Mã nhân viên','Tên NVTT','Mã cửa hàng','Số hóa đơn trong 1 ngày','Số SKU trong 1 ngày','Đơn giá','GSV bán ra','NIV bán ra','Họ','Doanh số mỗi ngày','Loại hóa đơn','Thuế'],['W1SPW','HU90198129','2026-05-24','64330136','SUNLIGHT NRC THIEN NHIEN LO HOI 3X3.5KG',3,0,1,0,0,'33949','Đỗ Thị Anh - 0979107225','4501802',1,1,107646,107646,95805,'Chị Duyên',103469,'ZID1',7664]],
    dmsAuto:[['Mã Division','Mô tả Division','Mã Sub-Division','Mô tả Sub-Division','Điểm Phân cấp','Mô tả Category','Mã Market','Mô tả Market','Mã Brand','Mô tả Brand','Mã Sector','Mô tả Sector','Mã Product Group','Mô tả Product Group','Mã Sub-brand','Mô tả Sub-brand','Mã Basepack','Mô tả Basepack','Loại kho','Lô','Số hiệu hàng hóa','Mô tả mặt hàng','Qui cách đóng gói','Lượng Bán Ra Trung Bình 1 Tuần (Giá trị)','Số lượng bán TB 13 tuần','Số TuầnTồn Theo Lượng Bán Ra','Giá bán mới nhất (SU)','Giá mua mới nhất (SU)','Giá bình quân gia quyền (MAP)','Tồn Đầu (CS/SU)','Tồn kho đầu kỳ (SU)','Tồn Đầu (Giá MAP)','Tồn Đầu (Giá Bán)','Số lượng nhập PO (CS/SU)','Số lượng nhập PO (SU)','Doanh số nhập PO (giá bán)','Doanh số nhập PO (giá MAP)','Số lượng nhập do chuyển kho (CS/SU)','Số lượng nhập do chuyển kho (SU)','Doanh số nhập do chuyển kho (giá bán)','Doanh số nhập do chuyển kho (MAP)','Số lượng xuất bán (CS/SU)','Số lượng xuất bán (SU)','Doanh số xuất bán (giá bán)','Doanh số xuất bán (giá MAP)','Số lượng xuất do chuyển kho (CS/SU)','Số lượng xuất do chuyển kho (SU)','Doanh số xuất do chuyển kho (giá bán)','Doanh số xuất do chuyển kho (giá MAP)','Tồn cuối (CS/SU)','Tồn kho cuối kỳ (SU)','Tồn Cuối (Giá MAP)','Tồn Cuối (Giá Bán)','Trạng thái'],['','','','','','','','','','','','','','','','','','','SALE','VALUATED','65677259','KNORR HN ORG NAM HUONG 8(800G+DUONG300G)',8,0,0,0,70833,0,66264,'1/2',10,662640,708330,'0/0',0,0,0,'0/0',0,0,0,'0/0',0,0,0,'0/0',0,0,0,'1/2',10,662640,708330,'Active']],
    dmsOrders:[['Tuyến bán hàng','Số hóa đơn','Ngày lập hoá đơn','Mã hàng hóa','Mô tả mặt hàng','Đóng gói','Số lượng thùng','Số lượng SU','Số lượng khuyến mãi theo thùng/ Số thùng','Số lượng khuyến mãi theo SU/ Số SU khuyế','Mã nhân viên','Tên NVTT','Mã cửa hàng','Số hóa đơn trong 1 ngày','Số SKU trong 1 ngày','Đơn giá','GSV bán ra','NIV bán ra','Họ','Doanh số mỗi ngày','Loại hóa đơn','Thuế'],['W1SPW','HU90198129','2026-05-24','64330136','SUNLIGHT NRC THIEN NHIEN LO HOI 3X3.5KG',3,0,1,0,0,'33949','Đỗ Thị Anh - 0979107225','4501802',1,1,107646,107646,95805,'Chị Duyên',103469,'ZID1',7664]],
    dmsStocks:[['Ngày DMS','SKU','Tên sản phẩm','SL'],['2026-05-24','SKU001','OMO 3kg',50]],
    customers:[['Mã KH','Tên khách hàng','SĐT','Địa chỉ','MST','Nhóm KH','Ghi chú'],['KH001','Khách A','0900000000','Thái Bình','','Tạp hóa','']],
    accounts:[['Tài khoản','Mật khẩu','Tên','Mã','Vai trò'],['nv001','123456','Nhân viên bán hàng','NV001','sales'],['gh001','123456','Nhân viên giao hàng','GH001','delivery']],
    promotions:[['Mã CTKM','Tên CTKM','SKU','Loại','Điều kiện','Chiết khấu','Thưởng trưng bày','Coupon','Ontop','Từ ngày','Đến ngày','Ghi chú'],['KM001','Giảm 5% OMO','SKU001','discount','Mua từ 1 thùng',5,10000,'','','2026-05-01','2026-05-31','']]
  };

  function show(type, rows, onConfirm, meta){
    pending = { type, rows, onConfirm, meta };
    const valid = rows.filter(r => r.valid).length;
    const invalid = rows.length - valid;
    const totalQty = rows.reduce((a,r) => a + num(r.qty), 0);
    const totalValue = rows.reduce((a,r) => a + num(r.qty) * num(r.cost || r.sale), 0);
    $('importTitle').textContent = `Xem trước import ${type}`;
    $('importNote').textContent = `File: ${meta.fileName} · Sheet: ${meta.sheetName}. Chỉ khi bấm xác nhận, dữ liệu mới được ghi vào phần mềm.`;
    $('importStats').innerHTML = `<div class="stat"><b>${rows.length}</b><br>Tổng dòng</div><div class="stat"><b>${valid}</b><br>Hợp lệ</div><div class="stat"><b>${invalid}</b><br>Lỗi</div><div class="stat"><b>${totalQty}</b><br>Tổng SL</div><div class="stat"><b>${totalValue.toLocaleString('vi-VN')}</b><br>Tổng giá trị</div>`;
    const errs = rows.filter(r => !r.valid).slice(0,10).map(r => `Dòng ${r.row}: ${r.error}`).join('<br>');
    $('importWarnings').classList.toggle('hidden', !errs);
    $('importWarnings').innerHTML = errs ? `<b>Cảnh báo:</b><br>${errs}` : '';
    const cols = columns[type] || columns.products;
    $('importHead').innerHTML = '<tr><th class="center"><input id="importCheckAll" type="checkbox" checked></th>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '<th>Lỗi</th></tr>';
    $('importBody').innerHTML = rows.map((r,i) => `<tr class="${r.valid?'ok-row':'error-row'}"><td class="center"><input class="import-row-check" data-i="${i}" type="checkbox" ${r.valid?'checked':'disabled'}></td>${cols.map(c => `<td><input class="import-edit-cell" data-i="${i}" data-k="${esc(c[0])}" value="${esc(r[c[0]])}" ${c[0] === 'row' ? 'readonly' : ''}></td>`).join('')}<td>${esc(r.error || '')}</td></tr>`).join('') || '<tr><td colspan="20" class="center">File không có dữ liệu</td></tr>';
    $('importCheckAll')?.addEventListener('change', e => document.querySelectorAll('.import-row-check:not(:disabled)').forEach(x => x.checked = e.target.checked));
    $('importModal').classList.remove('hidden');
  }
  async function open(type, onConfirm){
    const input = $('globalImportFile');
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const meta = await readFile(file);
        const parsed = (parsers[type] || parsers.products)(meta.rows);
        if (type === 'dmsAuto') meta.detectedType = parsed.some(r => r.orderId) ? 'dmsOrders' : 'dmsStocks';
        show(type, parsed, onConfirm, meta);
      } catch(err) {
        alert('Không đọc được file Excel: ' + (err.message || err));
      }
    };
    input.click();
  }
  function selectedRows(){
    document.querySelectorAll('.import-edit-cell').forEach(inp => {
      const row = pending.rows[Number(inp.dataset.i)];
      if (row && inp.dataset.k !== 'row') row[inp.dataset.k] = inp.value;
    });
    return [...document.querySelectorAll('.import-row-check:checked')].map(x => pending.rows[Number(x.dataset.i)]);
  }
  function downloadTemplate(type){
    const data = templates[type] || templates.products;
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mau import');
    XLSX.writeFile(wb, `mau_import_${type}.xlsx`);
  }
  document.addEventListener('click', e => {
    if (e.target.id === 'importClose') $('importModal').classList.add('hidden');
    if (e.target.id === 'importSelectAll') document.querySelectorAll('.import-row-check:not(:disabled)').forEach(x => x.checked = true);
    if (e.target.id === 'importUnselectAll') document.querySelectorAll('.import-row-check').forEach(x => x.checked = false);
    if (e.target.id === 'importConfirm' && pending) {
      const rows = selectedRows();
      const result = pending.onConfirm(rows);
      if (result && typeof result.then === 'function') result.catch(err => alert(err.message || err));
      $('importModal').classList.add('hidden');
    }
  });
  return { open, downloadTemplate, pick, num, date, parseQty };
})();
