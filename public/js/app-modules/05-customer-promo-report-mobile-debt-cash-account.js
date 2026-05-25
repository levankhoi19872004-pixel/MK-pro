// 05-customer-promo-report-mobile-debt-cash-account.js
// Khách hàng, khuyến mại, báo cáo, app bán hàng/giao hàng, công nợ, quỹ, tài khoản.
// File này là một phần của bundle public/js/app.js. Sau khi sửa, chạy: npm run build:app

  function renderCustomers(){
    const codeQ = norm($('customerSearchCode')?.value || '');
    const nameQ = norm($('customerSearchName')?.value || '');
    const phoneQ = norm($('customerSearchPhone')?.value || '');
    const addressQ = norm($('customerSearchAddress')?.value || '');
    const rows = db.customers.filter(c =>
      (!codeQ || norm(c.code).includes(codeQ)) &&
      (!nameQ || norm(c.name).includes(nameQ)) &&
      (!phoneQ || norm(c.phone).includes(phoneQ)) &&
      (!addressQ || norm(c.address).includes(addressQ))
    );
    $('customers').innerHTML = `<div class="card"><h3>Khách hàng</h3>
      <div class="form">${smartInput('cCode','Mã KH','customerCodeSuggest',suggestionValues('customerCode'))}${smartInput('cName','Tên KH','customerNameSuggest',suggestionValues('customerName'))}<input id="cPhone" placeholder="SĐT"><input id="cAddress" placeholder="Địa chỉ"><input id="cTax" placeholder="MST"><input id="cGroup" placeholder="Nhóm KH"></div>
      ${renderConfiguredFilters('customers')}
      <div class="toolbar action-row">${importToolbar('customers')}<button class="btn green" id="saveCustomerBtn">Lưu khách hàng</button>${bulkToolbar('customer-check',null,'bulkDeleteCustomers')}</div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Mã</th><th>Tên</th><th>SĐT</th><th>Địa chỉ</th><th>Nhóm</th><th>Thao tác</th></tr></thead><tbody>
      ${rows.map(c => `<tr><td><input type="checkbox" class="customer-check" value="${esc(c.code)}"></td><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td><td>${esc(c.group)}</td><td><button class="btn small" onclick="App.editCustomer('${esc(c.code)}')">Sửa</button><button class="btn small red" onclick="App.deleteCustomer('${esc(c.code)}')">Xoá</button></td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Chưa có khách hàng theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    bindConfiguredFilterEvents('customers', renderCustomers, 200);
    $('saveCustomerBtn').onclick = () => {
      const c = { code:$('cCode').value.trim(), name:$('cName').value.trim(), phone:$('cPhone').value.trim(), address:$('cAddress').value.trim(), tax:$('cTax').value.trim(), group:$('cGroup').value.trim() };
      if (!c.code || !c.name) return toast('Thiếu mã hoặc tên KH');
      const old = db.customers.find(x => x.code === c.code);
      old ? Object.assign(old,c) : db.customers.push(c);
      save('Đã lưu khách hàng');
    };
  }

  function renderPromotions(){
    const codeQ = norm($('promoSearchCode')?.value || '');
    const skuQ = norm($('promoSearchSku')?.value || '');
    const typeQ = norm($('promoSearchType')?.value || '');
    const dateQ = $('promoSearchDate')?.value || '';
    const rows = db.promotions.map((p,i)=>({...p,__i:i})).filter(p => (!codeQ || searchMatch({code:p.code,name:p.name}, codeQ)) && (!skuQ || searchMatch({sku:p.sku,name:p.name}, skuQ)) && (!typeQ || norm(p.type).includes(typeQ)) && (!dateQ || ((!p.from || p.from <= dateQ) && (!p.to || p.to >= dateQ))));
    $('promotions').innerHTML = `<div class="card"><h3>Khuyến mại</h3>
      <p class="muted">Khuyến mại dùng để tính giá/chiết khấu cho đơn từ NVBH và hiển thị thưởng trưng bày cho giao hàng.</p>
      ${renderConfiguredFilters('promotions')}
      <div class="toolbar action-row">${importToolbar('promotions')}${bulkToolbar('promo-check',null,'bulkDeletePromotions')}</div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Mã CTKM</th><th>Tên</th><th>SKU</th><th>Loại</th><th>Giá trị/CK</th><th>Thưởng trưng bày</th><th>Coupon</th><th>Ontop</th><th>Hiệu lực</th><th>Thao tác</th></tr></thead><tbody>
      ${rows.map(p => `<tr><td><input type="checkbox" class="promo-check" value="${p.__i}"></td><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td>${esc(p.sku)}</td><td>${esc(p.type)}</td><td class="right">${money(p.value)}</td><td class="right">${money(p.displayReward)}</td><td>${esc(p.coupon)}</td><td>${esc(p.ontop)}</td><td>${esc(p.from)} → ${esc(p.to)}</td><td><button class="btn small" onclick="App.editPromotion(${p.__i})">Sửa</button><button class="btn small red" onclick="App.deletePromotion(${p.__i})">Xoá</button></td></tr>`).join('') || '<tr><td colspan="11" class="center muted">Chưa có khuyến mại theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    bindConfiguredFilterEvents('promotions', renderPromotions, 250);
  }

  function renderReports(){
    const d = $('reportDate')?.value || today();
    const dayOrders = db.orders.filter(o => sameDay(o.date, d));
    const cash = dayOrders.reduce((a,o)=>a+num(o.cashPaid),0);
    const bank = dayOrders.reduce((a,o)=>a+num(o.bankPaid),0);
    const ret = dayOrders.reduce((a,o)=>a+num(o.returnAmount),0);
    const debt = dayOrders.reduce((a,o)=>a+num(o.debt),0);
    const receipts = db.receipts.filter(r => sameDay(r.date, d));
    $('reports').innerHTML = `<div class="card"><h3>Báo cáo</h3>${dateFilter('report')}
      <div class="grid"><div class="stat"><b>${dayOrders.length}</b><br>Đơn hàng</div><div class="stat"><b>${money(cash)}</b><br>Tiền mặt</div><div class="stat"><b>${money(bank)}</b><br>Chuyển khoản</div><div class="stat"><b>${money(ret)}</b><br>Hàng trả về</div><div class="stat"><b>${money(debt)}</b><br>Công nợ</div><div class="stat"><b>${receipts.length}</b><br>Phiếu nhập</div></div>
      <h4>Báo cáo theo nhân viên bán hàng</h4>${staffReport(dayOrders,'staffCode','staffName')}
      <h4>Báo cáo theo nhân viên giao hàng</h4>${staffReport(dayOrders,'deliveryStaffCode','deliveryStaffName')}
      <h4>Báo cáo hàng thiếu do import đơn hàng</h4>${shortageReport(d)}</div>`;
    $('reportDate').onchange = renderReports;
  }
  function shortageReport(day){
    const rows = (db.stockShortages || []).filter(x => sameDay(x.date, day)).slice().reverse();
    const total = rows.reduce((a,x)=>a+num(x.shortageQty),0);
    return `<p class="muted">Tổng lượng bị loại trong ngày: <b>${total}</b> lẻ. Phần này chưa được import vào đơn, dùng để kế toán/kho theo dõi và xử lý.</p>
      <div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Nguồn</th><th>Mã đơn</th><th>SKU</th><th>Tên hàng</th><th>Khách</th><th>Cần</th><th>Đã import</th><th>Thiếu</th><th>Tồn khả dụng lúc import</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${esc(String(x.date||'').slice(0,19).replace('T',' '))}</td><td>${esc(x.source)}</td><td>${esc(x.orderId)}</td><td>${esc(x.sku)}</td><td>${esc(x.name)}</td><td>${esc(x.customerName || x.customerCode)}</td><td class="right">${num(x.requestedQty)}</td><td class="right">${num(x.importedQty)}</td><td class="right"><b>${num(x.shortageQty)}</b></td><td class="right">${num(x.availableAtImport)}</td></tr>`).join('') || '<tr><td colspan="10" class="center muted">Không có hàng thiếu do import trong ngày</td></tr>'}
      </tbody></table></div>`;
  }

  function staffReport(rows, codeKey, nameKey){
    const map = {};
    rows.forEach(o => {
      const k = o[codeKey] || o[nameKey] || 'Chưa gán';
      map[k] = map[k] || { code:k, name:o[nameKey]||'', orders:0, total:0, debt:0, cash:0, bank:0 };
      map[k].orders++; map[k].total += num(o.total); map[k].debt += num(o.debt); map[k].cash += num(o.cashPaid); map[k].bank += num(o.bankPaid);
    });
    const rs = Object.values(map);
    return `<div class="table-wrap"><table><thead><tr><th>Mã/Tên</th><th>Số đơn</th><th>Tổng</th><th>Tiền mặt</th><th>Chuyển khoản</th><th>Công nợ</th></tr></thead><tbody>${rs.map(r=>`<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="right">${r.orders}</td><td class="right">${money(r.total)}</td><td class="right">${money(r.cash)}</td><td class="right">${money(r.bank)}</td><td class="right">${money(r.debt)}</td></tr>`).join('') || '<tr><td colspan="6" class="center muted">Không có dữ liệu</td></tr>'}</tbody></table></div>`;
  }

  function renderSalesApp(){
    const allowed = db.stocks.map(s => ({ s, p: product(s.sku), open: openSellableQty(s.sku) })).filter(x => x.open > 0 && x.p);
    $('salesApp').innerHTML = `<div class="mobile-shell sales-ui"><div class="mobile-top"><h3>App bán hàng</h3><button class="btn btn-icon red" title="Thoát" onclick="API.logout();location.reload()">⎋</button></div>
      <p class="muted">Ưu tiên gõ nhanh: Tab/→ để lấy gợi ý mờ, Enter để xác nhận ô tìm.</p>
      <div class="form sales-form">${smartInput('salesCustomerCode','Mã KH','salesCustomerCodeSuggest',suggestionValues('customerCode'))}${smartInput('salesCustomerName','Tên KH','salesCustomerNameSuggest',suggestionValues('customerName'))}${smartInput('salesStaffCode','Mã NV bán hàng','salesStaffSuggest',suggestionValues('salesStaff'))}</div>
      ${allowed.map(({s,p,open}) => `<div class="mobile-card sales-product-card"><div class="product-head"><b>${esc(s.sku)}</b><span>${esc(p.warehouse)}</span></div><div class="product-name">${esc(p.name)}</div><div class="product-meta"><span>Tồn: <b>${qtyView(open,p.pack)}</b></span><span>Giá: <b>${money(p.saleRef)}</b></span></div><div class="qty-row"><label>Thùng<input id="saleCase_${esc(s.sku)}" type="number" inputmode="numeric" placeholder="0"></label><label>Lẻ<input id="saleLoose_${esc(s.sku)}" type="number" inputmode="numeric" placeholder="0"></label><button class="btn green send-btn" title="Gửi đơn" onclick="App.salesCreateOrder('${esc(s.sku)}')">Gửi</button></div></div>`).join('') || '<p class="muted">Chưa có hàng mở bán</p>'}
      <h4>Đơn đã chấm chưa gộp đơn tổng</h4>${salesOrderCards()}
      <h4>Công nợ khách hàng</h4>${debtTable(db.orders.filter(o => o.debt > 0 && (!API.user?.code || o.staffCode === API.user.code)))}</div>`;
    if ($('salesStaffCode') && !$('salesStaffCode').value) $('salesStaffCode').value = API.user?.code || '';
  }


  function salesOrderCards(){
    const userCode = API.user?.code || '';
    const rows = db.orders.filter(o => !o.masterId && (o.source === 'NVBH' || o.source === 'APP') && (!userCode || !o.staffCode || o.staffCode === userCode)).slice().reverse().slice(0, 50);
    return rows.map(o => `<div class="mobile-card"><b>${esc(o.id)}</b> · ${esc(o.date)}<br>${esc(o.customerName || o.customerCode)}<br>Tổng: ${money(o.total)} · Còn nợ: <b>${money(o.debt)}</b><br>Trạng thái: ${esc(o.workflowStatus || 'Chờ giao')}</div>`).join('') || '<p class="muted">Chưa có đơn con chưa gộp</p>';
  }

  function deliveryCollectCard(o, label){
    return `<div class="mobile-card"><b>${esc(o.id)}</b> · ${esc(label || o.date)}<br>${esc(o.customerName||o.customerCode)}<br>
      Tổng: ${money(o.total)} · Đã ghi nhận: ${money(orderPaid(o))} · Còn nợ: <b>${money(o.debt)}</b><br>
      Thưởng TB: ${money(o.displayReward)} · Trạng thái: ${esc(o.workflowStatus)}
      <div class="form"><input id="cash_${esc(o.id)}" type="number" inputmode="numeric" placeholder="Tiền mặt thu được"><input id="bank_${esc(o.id)}" type="number" inputmode="numeric" placeholder="Chuyển khoản"><input id="ret_${esc(o.id)}" type="number" inputmode="numeric" placeholder="Hàng trả về"><input id="reward_${esc(o.id)}" type="number" inputmode="numeric" placeholder="Tiền trả thưởng trưng bày"></div>
      <button class="btn green" onclick="App.driverCollect('${esc(o.id)}')">Xác nhận giao / thu</button></div>`;
  }
  function renderDeliveryApp(){
    const userCode = API.user?.code || '';
    const pendingOrders = db.orders.filter(o => !o.delivered && (!userCode || !o.deliveryStaffCode || o.deliveryStaffCode === userCode));
    const debtOrders = db.orders.filter(o => o.debt > 0 && o.delivered && (!userCode || !o.deliveryStaffCode || o.deliveryStaffCode === userCode));
    const scopeOrders = db.orders.filter(o => !userCode || !o.deliveryStaffCode || o.deliveryStaffCode === userCode);
    const cash = scopeOrders.reduce((a,o)=>a+num(o.cashPaid),0), bank = scopeOrders.reduce((a,o)=>a+num(o.bankPaid),0), ret = scopeOrders.reduce((a,o)=>a+num(o.returnAmount),0), debt = scopeOrders.reduce((a,o)=>a+num(o.debt),0);
    $('deliveryApp').innerHTML = `<div class="mobile-shell"><h3>App giao hàng</h3><button class="btn red" onclick="API.logout();location.reload()">Thoát</button>
      <div class="scroll-tabs"><button class="btn">Đơn nay giao</button><button class="btn">Đơn nợ</button><button class="btn">Báo cáo</button></div>
      <div class="grid"><div class="stat"><b>${money(cash)}</b><br>Tiền mặt</div><div class="stat"><b>${money(bank)}</b><br>Chuyển khoản</div><div class="stat"><b>${money(ret)}</b><br>Hàng trả về</div><div class="stat"><b>${money(debt)}</b><br>Công nợ</div></div>
      <h4>Đơn nay giao</h4>${pendingOrders.slice(0,50).map(o=>deliveryCollectCard(o, 'Ngày ghi đơn: ' + o.date)).join('') || '<p class="muted">Chưa có đơn giao</p>'}
      <h4>Đơn nợ đã giao</h4>${debtOrders.map(o => deliveryCollectCard(o, 'Ngày ghi đơn: ' + o.date)).join('') || '<p class="muted">Không có đơn nợ đã giao</p>'}</div>`;
  }

  function renderDebts(){
    const from = $('debtFrom')?.value || '';
    const to = $('debtTo')?.value || '';
    const orderQ = norm($('debtSearchOrder')?.value || '');
    const customerQ = norm($('debtSearchCustomer')?.value || '');
    const salesQ = norm($('debtSearchSales')?.value || '');
    const deliveryQ = norm($('debtSearchDelivery')?.value || '');
    const inSearch = x => (!orderQ || norm(x.id || x.orderId || '').includes(orderQ)) && (!customerQ || searchMatch({customerCode:x.customerCode, customerName:x.customerName}, customerQ)) && (!salesQ || searchMatch({staffCode:x.staffCode, staffName:x.staffName}, salesQ)) && (!deliveryQ || searchMatch({deliveryStaffCode:x.deliveryStaffCode, deliveryStaffName:x.deliveryStaffName}, deliveryQ));
    const ledger = (Array.isArray(db.debtLedger) ? db.debtLedger : []).filter(x => inDateRange(x.date, from, to) && inSearch(x));
    const rows = db.orders.filter(o => num(o.debt) > 0 && inDateRange(o.date, from, to) && inSearch({id:o.id,date:o.date,deliveryStaffCode:o.deliveryStaffCode,deliveryStaffName:o.deliveryStaffName,staffCode:o.staffCode,staffName:o.staffName,customerCode:o.customerCode,customerName:o.customerName,total:o.total,paid:orderPaid(o),debt:o.debt,status:o.paymentStatus}));
    const beforeRows = db.orders.filter(o => String(o.date || '').slice(0,10) < from && inSearch(o));
    const openingDebt = beforeRows.reduce((a,o)=>a+num(o.debt),0);
    const inc = ledger.filter(x => x.direction === 'INCREASE').reduce((a,x)=>a+num(x.amount),0) || rows.reduce((a,o)=>a+num(o.total),0);
    const dec = ledger.filter(x => x.direction !== 'INCREASE').reduce((a,x)=>a+num(x.amount),0) || rows.reduce((a,o)=>a+orderPaid(o),0);
    const totalDebt = rows.reduce((a,o)=>a+num(o.debt),0);
    $('debts').innerHTML = `<div class="card"><h3>Công nợ đối soát chi tiết</h3>
      ${renderConfiguredFilters('debts')}
      <div class="grid"><div class="stat"><b>${money(openingDebt)}</b><br>Số dư trước kỳ</div><div class="stat"><b>${money(inc)}</b><br>Phát sinh trong kỳ</div><div class="stat"><b>${money(dec)}</b><br>Đã thu/cấn trừ</div><div class="stat"><b>${money(totalDebt)}</b><br>Còn nợ theo lọc</div><div class="stat"><b>${rows.length}</b><br>Đơn còn nợ</div></div>
      <p class="muted">Mặc định hiển thị ngày hiện tại. Khi cần xem nhiều ngày, chỉnh từ ngày/đến ngày để tránh lag.</p>
      <h4>Đơn còn nợ theo bộ lọc</h4>${debtTable(rows)}
      <h4>Sổ cái theo bộ lọc</h4>${ledgerTable(ledger)}</div>`;
    bindConfiguredFilterEvents('debts', renderDebts, 350);
  }

  function ledgerTable(rows){
    return `<div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Loại</th><th>Đơn</th><th>Ngày ghi đơn</th><th>NV giao hàng</th><th>NV bán hàng</th><th>Mã KH</th><th>Tên KH</th><th>Chiều</th><th>Số tiền</th><th>Ghi chú</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${esc(String(x.date||'').slice(0,19).replace('T',' '))}</td><td>${esc(x.type)}</td><td>${esc(x.orderId)}</td><td>${esc(x.orderDate || '')}</td><td>${esc(x.deliveryStaffName || x.deliveryStaffCode || '')}</td><td>${esc(x.staffName || x.staffCode || '')}</td><td>${esc(x.customerCode || '')}</td><td>${esc(x.customerName || '')}</td><td>${esc(x.direction)}</td><td class="right">${money(x.amount)}</td><td>${esc(x.note)}</td></tr>`).join('') || '<tr><td colspan="11" class="center muted">Chưa có dòng sổ cái theo bộ lọc</td></tr>'}
    </tbody></table></div>`;
  }
  function debtTable(rows){
    return `${bulkToolbar('debt-check',null,'bulkDeleteDebts')}<div class="table-wrap"><table><thead><tr><th></th><th>Đơn</th><th>Ngày ghi đơn</th><th>Nhân viên giao hàng</th><th>Nhân viên bán hàng</th><th>Mã khách hàng</th><th>Tên khách hàng</th><th>Tổng</th><th>Đã thu/hàng trả</th><th>Còn nợ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    ${rows.map(o => `<tr><td><input type="checkbox" class="debt-check" value="${esc(o.id)}"></td><td>${esc(o.id)}</td><td>${esc(o.date)}</td><td>${esc(o.deliveryStaffName || o.deliveryStaffCode || '')}</td><td>${esc(o.staffName || o.staffCode || '')}</td><td>${esc(o.customerCode || '')}</td><td>${esc(o.customerName || '')}</td><td class="right">${money(o.total)}</td><td class="right">${money(orderPaid(o))}</td><td class="right"><b>${money(o.debt)}</b></td><td>${esc(o.paymentStatus)}</td><td><button class="btn small" onclick="App.editOrder('${esc(o.id)}')">Sửa</button><button class="btn small green" onclick="App.settleDebt('${esc(o.id)}')">Tất toán</button></td></tr>`).join('') || '<tr><td colspan="12" class="center muted">Không có công nợ theo bộ lọc</td></tr>'}
    </tbody></table></div>`;
  }

  function renderCashFund(){
    const d = $('fundDate')?.value || '';
    const typeQ = norm($('fundSearchType')?.value || '');
    const noteQ = norm($('fundSearchNote')?.value || '');
    const userQ = norm($('fundSearchUser')?.value || '');
    const rows = db.cashFund.filter(x => (!d || sameDay(x.date, d)) && (!typeQ || norm(x.type).includes(typeQ)) && (!noteQ || norm(x.note).includes(noteQ)) && (!userQ || norm(x.user).includes(userQ))).slice().reverse();
    const beforeRows = d ? db.cashFund.filter(x => String(x.date || '').slice(0,10) < d) : [];
    const calcBalance = arr => arr.reduce((a,x)=> a + (x.type === 'thu' || x.type === 'chuyen_khoan' ? num(x.amount) : -num(x.amount)), 0);
    const tonDau = calcBalance(beforeRows);
    const thu = rows.filter(x => x.type === 'thu').reduce((a,x)=>a+num(x.amount),0);
    const ck = rows.filter(x => x.type === 'chuyen_khoan').reduce((a,x)=>a+num(x.amount),0);
    const chi = rows.filter(x => x.type === 'chi').reduce((a,x)=>a+num(x.amount),0);
    const nop = rows.filter(x => x.type === 'nop_ngan_hang').reduce((a,x)=>a+num(x.amount),0);
    const tonCuoi = tonDau + thu + ck - chi - nop;
    const auditRows = (db.auditLogs || []).filter(x => (!d || sameDay(x.date, d)) && (!typeQ || norm(x.action).includes(typeQ)) && (!noteQ || searchMatch(x, noteQ)) && (!userQ || norm(x.user).includes(userQ))).slice().reverse().slice(0,80);
    $('cashFund').innerHTML = `<div class="card"><h3>Quỹ tiền</h3>
      ${renderConfiguredFilters('cashFund')}
      <p class="muted">Báo cáo quỹ theo ngày: tồn đầu ngày → thu → chi → nộp công ty/ngân hàng → tồn cuối ngày.</p>
      <div class="grid"><div class="stat"><b>${money(tonDau)}</b><br>Tồn đầu ngày</div><div class="stat"><b>${money(thu)}</b><br>Thu tiền mặt</div><div class="stat"><b>${money(ck)}</b><br>Chuyển khoản</div><div class="stat"><b>${money(chi)}</b><br>Chi trong ngày</div><div class="stat"><b>${money(nop)}</b><br>Nộp công ty/NH</div><div class="stat"><b>${money(tonCuoi)}</b><br>Tồn cuối ngày</div></div>
      <div class="form"><select id="fundType"><option value="thu">Thu</option><option value="chi">Chi</option><option value="nop_ngan_hang">Nộp công ty/NH</option><option value="chuyen_khoan">Chuyển khoản</option></select><input id="fundAmount" type="number" placeholder="Số tiền"><input id="fundNote" placeholder="Nội dung"></div>
      <div class="toolbar action-row"><button class="btn green" id="saveFundBtn">Ghi quỹ</button>${bulkToolbar('fund-check',null,'bulkDeleteFunds')}</div>
      <h4>Sổ quỹ chi tiết</h4><div class="table-wrap"><table><thead><tr><th></th><th>Ngày</th><th>Loại</th><th>Số tiền</th><th>Nội dung</th><th>Thao tác</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td><input type="checkbox" class="fund-check" value="${esc(x.id)}"></td><td>${esc(String(x.date).slice(0,19).replace('T',' '))}</td><td>${esc(x.type)}</td><td class="right">${money(x.amount)}</td><td>${esc(x.note)}</td><td><button class="btn small" onclick="App.editFund('${esc(x.id)}')">Sửa</button><button class="btn small red" onclick="App.deleteFund('${esc(x.id)}')">Xoá</button></td></tr>`).join('') || '<tr><td colspan="6" class="center muted">Chưa có giao dịch quỹ theo bộ lọc</td></tr>'}
      </tbody></table></div>
      <h4>Audit log trong ngày</h4><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người sửa</th><th>Vai trò</th><th>Hành động</th><th>Chi tiết</th><th>Trước</th><th>Sau</th></tr></thead><tbody>
      ${auditRows.map(a => `<tr><td>${esc(String(a.date).slice(0,19).replace('T',' '))}</td><td>${esc(a.user)}</td><td>${esc(a.role||'')}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td><td class="small-text">${esc(String(a.before||'').slice(0,160))}</td><td class="small-text">${esc(String(a.after||'').slice(0,160))}</td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Chưa có lịch sử thao tác theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    $('fundDate').onchange = renderCashFund;
    bindConfiguredFilterEvents('cashFund', renderCashFund, 250);
    $('saveFundBtn').onclick = () => {
      if (!requireCan('fund:create','Không có quyền ghi quỹ tiền')) return;
      const amount = num($('fundAmount').value);
      if (amount <= 0) return toast('Nhập số tiền');
      const row = { id:'Q'+Date.now(), date:nowIso(), type:$('fundType').value, amount, note:$('fundNote').value };
      db.cashFund.push(row);
      audit('CREATE_FUND', row.id, '', snapshot(row));
      save('Đã ghi quỹ tiền');
    };
  }

  function renderAccounts(){
    const userQ = norm($('accountSearchUser')?.value || '');
    const nameQ = norm($('accountSearchName')?.value || '');
    const codeQ = norm($('accountSearchCode')?.value || '');
    const roleQ = norm($('accountSearchRole')?.value || '');
    if (!isAdmin()) {
      $('accounts').innerHTML = `<div class="card"><h3>Tài khoản</h3><p class="muted">Chỉ admin được quản lý tài khoản và phân quyền.</p></div>`;
      return;
    }
    const accountRows = db.users.filter(u => (!userQ || norm(u.username).includes(userQ)) && (!nameQ || norm(u.name).includes(nameQ)) && (!codeQ || norm(u.code).includes(codeQ)) && (!roleQ || norm(roleLabel(u.role)).includes(roleQ) || norm(u.role).includes(roleQ)));
    $('accounts').innerHTML = `<div class="card"><h3>Tài khoản</h3>
      <p class="muted">Admin full quyền tuyệt đối. Các vai trò khác được phân quyền theo nhóm quyền chuẩn DMS.</p>
      ${renderConfiguredFilters('accounts')}
      <div class="toolbar action-row">${importToolbar('accounts')}</div>
      <div class="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Tên</th><th>Mã</th><th>Vai trò</th><th>Nhóm quyền</th><th>Thao tác</th></tr></thead><tbody>
      ${accountRows.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.name)}</td><td>${esc(u.code)}</td><td><span class="pill">${esc(roleLabel(u.role))}</span></td><td class="small-text">${isAdmin(u) ? 'Full quyền' : esc((ROLE_DEFINITIONS[u.role]?.permissions || []).join(', '))}</td><td><button class="btn small" onclick="App.editUser('${esc(u.username)}')">Chỉnh sửa</button><button class="btn small red" onclick="App.deleteUser('${esc(u.username)}')">Xoá</button></td></tr>`).join('') || '<tr><td colspan="6" class="center muted">Chưa có tài khoản theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    bindConfiguredFilterEvents('accounts', renderAccounts, 250);
  }

  async function editUser(username){
    if (!canAdminOverride('Chỉ admin được chỉnh sửa tài khoản')) return;
    const u = db.users.find(x => String(x.username).toLowerCase() === String(username).toLowerCase());
    if (!u) return toast('Không tìm thấy tài khoản');
    const name = prompt('Tên nhân viên:', u.name || '');
    if (name === null) return;
    const code = prompt('Mã nhân viên:', u.code || u.username || '');
    if (code === null) return;
    const roleRaw = prompt('Chọn vai trò:\n1 = Bán hàng\n2 = Giao hàng\n3 = Kế toán\n4 = Thủ quỹ\n5 = Quản lý\n6 = Admin full quyền', u.role === 'delivery' ? '2' : u.role === 'accountant' ? '3' : u.role === 'cashier' ? '4' : u.role === 'manager' ? '5' : u.role === 'admin' ? '6' : '1');
    if (roleRaw === null) return;
    const roleMap = { '1':'sales', '2':'delivery', '3':'accountant', '4':'cashier', '5':'manager', '6':'admin', 'ban hang':'sales', 'bán hàng':'sales', 'sales':'sales', 'giao hang':'delivery', 'giao hàng':'delivery', 'delivery':'delivery', 'ke toan':'accountant', 'kế toán':'accountant', 'accountant':'accountant', 'thu quy':'cashier', 'thủ quỹ':'cashier', 'cashier':'cashier', 'quan ly':'manager', 'quản lý':'manager', 'manager':'manager', 'admin':'admin', 'quan tri':'admin', 'quản trị':'admin' };
    const role = roleMap[norm(roleRaw)] || roleMap[String(roleRaw).trim()] || null;
    if (!role) return toast('Vai trò không hợp lệ');
    const before = snapshot(u);
    Object.assign(u, { name:String(name).trim(), code:String(code).trim(), role, permissions: ROLE_DEFINITIONS[role]?.permissions || [] });
    try { await API.upsertUser({ ...u, permissions: ROLE_DEFINITIONS[role]?.permissions || [] }); } catch(e) { console.warn('Không đồng bộ được user đăng nhập', e); }
    audit('UPDATE_USER', username, before, snapshot(u));
    await save('Đã chỉnh sửa tài khoản và phân quyền');
  }

  async function deleteUser(username){
    if (!canAdminOverride('Chỉ admin được xoá tài khoản')) return;
    if (String(username).toLowerCase() === 'admin') return toast('Không xoá tài khoản admin mặc định');
    const i = db.users.findIndex(x => String(x.username).toLowerCase() === String(username).toLowerCase());
    if (i < 0) return toast('Không tìm thấy tài khoản');
    if (!confirm(`Xoá tài khoản ${username}?`)) return;
    const before = db.users[i];
    db.users.splice(i, 1);
    try { await API.deleteUser(username); } catch(e) { console.warn('Không xoá được user đăng nhập trên API', e); }
    audit('DELETE_USER', username, snapshot(before), '');
    await save('Đã xoá tài khoản');
  }

