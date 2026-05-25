// Cấu hình tập trung cho toàn bộ mẫu in ấn.
// Muốn sửa mẫu đơn, mẫu đơn tổng, phiếu nhập, báo cáo in: sửa tại file này.
// app.js chỉ gọi template theo key, không chứa bố cục in chi tiết nữa.
(function(){
  const PRINT_STYLE = {
    fontFamily: 'Segoe UI, Arial, sans-serif',
    paper: 'A4',
    companyName: 'Công Ty TNHH MTV Minh Khai',
    distributorCode: '3293',
    address: 'Cầu Cánh Sẻ, Quang Bình TỈNH THÁI BÌNH',
    phone: '0396198753'
  };

  function h(ctx, v){ return ctx.esc(v); }
  function m(ctx, v){ return ctx.money(v); }
  function n(ctx, v){ return ctx.num(v); }

  const templates = {
    receipt: {
      name: 'Mẫu phiếu nhập kho',
      render(payload, ctx){
        const r = payload.receipt || {};
        const items = r.items || [];
        return `<section class="print-doc print-receipt">
          <div class="print-doc-head">
            <div><h2>PHIẾU NHẬP KHO</h2><p>Mã phiếu: <b>${h(ctx, r.id)}</b></p></div>
            <div class="print-doc-meta">Ngày: ${h(ctx, r.date)}<br>Nhà cung cấp: ${h(ctx, r.supplier)}<br>Trạng thái: ${ctx.receiptPosted(r) ? 'Đã ghi sổ' : 'Nháp'}</div>
          </div>
          <table><thead><tr><th>SKU</th><th>Tên sản phẩm</th><th>SL lẻ</th><th>Thùng/lẻ</th><th>Giá nhập</th><th>Thành tiền</th></tr></thead><tbody>
            ${items.map(it => `<tr><td>${h(ctx, it.sku)}</td><td>${h(ctx, it.name || ctx.product(it.sku)?.name || '')}</td><td class="right">${n(ctx, it.qty)}</td><td class="right">${ctx.qtyView(it.qty, it.pack || ctx.product(it.sku)?.pack || 1)}</td><td class="right">${m(ctx, it.cost)}</td><td class="right">${m(ctx, n(ctx,it.qty)*n(ctx,it.cost))}</td></tr>`).join('')}
          </tbody></table>
          <div class="print-total">Tổng số lượng: ${ctx.receiptQty(r)} · Tổng tiền: ${m(ctx, ctx.receiptTotal(r))}</div>
        </section>`;
      }
    },

    receiptBulk: {
      name: 'Mẫu in gộp đơn nhập',
      render(payload, ctx){
        const receipts = payload.receipts || [];
        const lines = payload.lines || [];
        const totalQty = lines.reduce((a,x)=>a+n(ctx,x.qty),0);
        const totalValue = lines.reduce((a,x)=>a+n(ctx,x.qty)*n(ctx,x.cost),0);
        return `<section class="print-doc print-receipt-bulk">
          <div class="print-doc-head">
            <div><h2>PHIẾU IN GỘP ĐƠN NHẬP</h2><p>Danh sách phiếu: ${h(ctx, receipts.map(r=>r.id).join(', '))}</p></div>
            <div class="print-doc-meta">Ngày in: ${h(ctx, new Date().toLocaleString('vi-VN'))}<br>Số phiếu gộp: ${receipts.length}<br>Tổng SL: ${totalQty}<br>Tổng tiền: ${m(ctx,totalValue)}</div>
          </div>
          <table><thead><tr><th>STT</th><th>Mã phiếu</th><th>Ngày</th><th>SKU</th><th>Tên sản phẩm</th><th>SL lẻ</th><th>Thùng/lẻ</th><th>Giá nhập</th><th>Thành tiền</th></tr></thead><tbody>
            ${lines.map((it,i)=>`<tr><td>${i+1}</td><td>${h(ctx,it.receiptId)}</td><td>${h(ctx,it.date)}</td><td>${h(ctx,it.sku)}</td><td>${h(ctx,it.name || ctx.product(it.sku)?.name || '')}</td><td class="right">${n(ctx,it.qty)}</td><td class="right">${ctx.qtyView(it.qty, it.pack || ctx.product(it.sku)?.pack || 1)}</td><td class="right">${m(ctx,it.cost)}</td><td class="right">${m(ctx,n(ctx,it.qty)*n(ctx,it.cost))}</td></tr>`).join('')}
          </tbody></table>
          <div class="print-total">Tổng cộng: ${totalQty} sản phẩm lẻ · ${m(ctx,totalValue)}</div>
        </section>`;
      }
    },

    singleOrder: {
      name: 'Mẫu đơn bán lẻ / phiếu giao nhận',
      render(payload, ctx){
        const o = payload.order || {};
        const lines = ctx.invoiceLines(o);
        const totalQty = lines.reduce((a,x)=>a+x.qty,0);
        const gross = lines.reduce((a,x)=>a+Math.round(x.qty*x.afterTaxBeforeKm),0);
        const totalAmount = n(ctx,o.total) || lines.reduce((a,x)=>a+x.amount,0);
        const offset = n(ctx,o.displayReward || o.displayRewardPaid || o.displayRewardAmount || 0);
        const promoValue = Math.max(0, gross - totalAmount + offset);
        const payable = Math.max(0, totalAmount - offset);
        const promoRows = ctx.promoRowsForOrder(o);
        return `<section class="mk-invoice">
          <div class="mk-topline"><div>Số hóa đơn: ${h(ctx,o.invoiceNo || o.invoiceId || '')}<br>Số đơn hàng: ${h(ctx,o.id)}<br>NVBH: ${h(ctx,[o.staffCode,o.staffName].filter(Boolean).join(' - '))}<br>Khách hàng - Điện thoại: ${h(ctx,[o.customerCode,o.customerName,o.customerPhone].filter(Boolean).join(' - '))}<br>Địa chỉ giao hàng: ${h(ctx,o.customerAddress || ctx.customerAddress(o.customerCode))}<br>Điều khoản thanh toán: ${h(ctx,o.paymentTerm || (n(ctx,o.debt)>0?'đáo hạn trong 7 ngày':'Thanh toán ngay'))}</div>
          <div class="mk-title"><b>PHIẾU GIAO NHẬN VÀ THANH TOÁN</b><br><span>Loại hóa đơn: ${h(ctx,ctx.invoiceSourceLabel(o))}</span></div>
          <div>Thời gian đặt hàng: ${h(ctx,ctx.invoiceDateTime(o))}<br>Nhà phân phối: ${PRINT_STYLE.distributorCode} - ${PRINT_STYLE.companyName}<br>Địa chỉ: ${PRINT_STYLE.address}<br>Điện thoại: ${PRINT_STYLE.phone}<br><b>(Liên 1)</b></div></div>
          <table class="mk-main-table"><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên sản phẩm</th><th>Số lượng<br>(CS/SU)</th><th>Số lượng<br>(lẻ)</th><th>Đơn Giá<br>(Trước Thuế/KM)</th><th>Đơn Giá<br>(Sau Thuế, Trước KM)</th><th>Đơn giá<br>(Sau Thuế/KM&CK)</th><th>Thuế<br>GTGT</th><th>Thành tiền<br>(Sau Thuế/KM&CK)</th></tr><tr class="mk-sub"><th>A</th><th>1</th><th></th><th>2</th><th></th><th>3</th><th>4</th><th>5</th><th>6</th><th>7=(5*2)</th></tr></thead><tbody>
          ${lines.map(x => `<tr><td class="center">${x.idx}</td><td>${h(ctx,x.sku)}</td><td>${h(ctx,x.name)}</td><td class="center">${ctx.qtyView(x.qty,x.pack)}</td><td class="right">${x.qty}</td><td class="right">${m(ctx,x.beforeTax)}</td><td class="right">${m(ctx,x.afterTaxBeforeKm)}</td><td class="right">${m(ctx,x.afterTaxKm)}</td><td class="right">${m(ctx,x.lineVat)}</td><td class="right">${m(ctx,x.amount)}</td></tr>`).join('')}
          <tr><td colspan="4" class="center"><b>Tổng cộng (A)</b></td><td class="right"><b>${totalQty}</b></td><td colspan="4"></td><td class="right"><b>${m(ctx,totalAmount)}</b></td></tr></tbody></table>
          <div class="mk-summary"><div><b>Số tiền viết bằng chữ:</b> ${h(ctx,ctx.amountToWords(payable))}</div><div><b>Số tiền phải thanh toán (A7-D-E-H)</b> <b>${m(ctx,payable)}</b><br>Tổng tiền sau thuế chưa trừ KM (G): ${m(ctx,gross)}<br>Tổng trị giá khuyến mãi bằng hàng và tiền (B+C): ${m(ctx,promoValue)}<br>Cấn trừ tiền (D+E+H): ${m(ctx,offset)}<br>Tỉ lệ KM & CK của đơn hàng: ${gross?((promoValue/gross)*100).toFixed(2).replace('.',','): '0,00'}%</div></div>
          <div class="mk-sign"><div>Người lập biểu<br><span>(Ký, ghi rõ họ tên)</span></div><div>Người bán hàng<br><span>(Ký, ghi rõ họ tên)</span></div><div>Nhân viên giao hàng<br><span>(Ký, ghi rõ họ tên)</span></div><div>Người nhận hàng<br><span>(Ký, ghi rõ họ tên)</span></div></div>
          <h4>CHI TIẾT KHUYẾN MÃI: (B+C)</h4><table class="mk-promo"><thead><tr><th>Mã CTKM Tiền</th><th>Khuyến mãi bằng tiền</th><th>Giá trị hàng hóa mua</th><th>% chiết khấu</th><th>Tiền CK trước thuế</th><th>Tiền CK sau thuế</th></tr></thead><tbody>${promoRows.map(x=>`<tr><td>${h(ctx,x.code||'')}</td><td>${h(ctx,x.name||x.note||'')}</td><td class="right">${m(ctx,x.base||x.value||0)}</td><td class="right">${n(ctx,x.percent||x.discount||0).toLocaleString('vi-VN')}</td><td class="right">${m(ctx,x.ckBefore||0)}</td><td class="right">${m(ctx,x.ckAfter||0)}</td></tr>`).join('') || '<tr><td colspan="6" class="center">Không có khuyến mại</td></tr>'}</tbody></table>
          <h4>CHI TIẾT CẤN TRỪ NỢ: (D+E)</h4><table class="mk-promo"><thead><tr><th>Mã CT Trưng bày</th><th>Nội dung Chương trình trưng bày</th><th>Tháng trưng bày</th><th>Chi trả trưng bày (hàng hóa)</th><th>Số lượng (Thùng/lẻ)</th><th>Chi trả trưng bày (cấn trừ nợ)</th></tr></thead><tbody>${offset?`<tr><td>${h(ctx,o.displayRewardCode||'')}</td><td>${h(ctx,o.displayRewardNote||'Tiền trả thưởng trưng bày')}</td><td>${h(ctx,o.displayRewardMonth||'')}</td><td></td><td></td><td class="right">${m(ctx,offset)}</td></tr><tr><td colspan="5" class="right"><b>Tổng giá trị nhận được từ CT trưng bày (D)</b></td><td class="right"><b>${m(ctx,offset)}</b></td></tr>`:'<tr><td colspan="6" class="center">Không có cấn trừ/trả thưởng trưng bày</td></tr>'}</tbody></table>
        </section>`;
      }
    },

    masterOrder: {
      name: 'Mẫu đơn tổng / phiếu bố hàng',
      render(payload, ctx){
        const orders = payload.orders || [];
        const master = payload.master || {};
        const title = payload.title || '';
        const summary = ctx.masterWarehouseSummary(orders);
        const totalQty = summary.reduce((a,w)=>a+n(ctx,w.qty),0);
        const totalValue = orders.reduce((a,o)=>a+n(ctx,o.total),0);
        return `<section class="print-doc print-master-order">
          <div class="print-doc-head">
            <div><h2>PHIẾU BỐ HÀNG ĐƠN TỔNG</h2><p>Mã/nhóm đơn: <b>${h(ctx,title)}</b></p></div>
            <div class="print-doc-meta">Ngày in: ${h(ctx,new Date().toLocaleString('vi-VN'))}<br>Ngày giờ xuất: ${h(ctx,String(master.exportTime || '').slice(0,19).replace('T',' '))}<br>NV giao hàng: ${h(ctx,master.deliveryStaffName || master.deliveryStaffCode || '')}<br>Số đơn: ${orders.length}<br>Tổng SL: ${totalQty}<br>Tổng tiền: ${m(ctx,totalValue)}</div>
          </div>
          ${summary.map(w => `<div class="warehouse-block"><h3>Kho: ${h(ctx,w.warehouse)}</h3><table><thead><tr><th>SKU</th><th>Tên sản phẩm</th><th>SL lẻ</th><th>Thùng/lẻ</th></tr></thead><tbody>${Object.values(w.items).map(it => `<tr><td>${h(ctx,it.sku)}</td><td>${h(ctx,it.name)}</td><td class="right">${it.qty}</td><td class="right">${ctx.qtyView(it.qty,it.pack)}</td></tr>`).join('')}</tbody></table></div>`).join('')}
        </section>`;
      }
    },

    debtReport: { name: 'Mẫu báo cáo công nợ', render(){ return '<section class="print-doc"><h2>BÁO CÁO CÔNG NỢ</h2><p>Mẫu đã sẵn sàng cấu hình.</p></section>'; } },
    cashFundReport: { name: 'Mẫu báo cáo quỹ', render(){ return '<section class="print-doc"><h2>BÁO CÁO QUỸ TIỀN</h2><p>Mẫu đã sẵn sàng cấu hình.</p></section>'; } },
    vnptExport: { name: 'Mẫu xuất hóa đơn VNPT TT78', columns:['Mã đơn','Ngày','Mã KH','Tên KH','Mã hàng','Tên hàng','Đơn vị tính','Số lượng','Đơn giá','Thành tiền','Ghi chú'] }
  };

  window.KHO_PRINT_STYLE = PRINT_STYLE;
  window.KHO_PRINT_TEMPLATES = {
    templates,
    render(key, payload, ctx){
      const tpl = templates[key];
      if (!tpl || typeof tpl.render !== 'function') return `<section class="print-doc"><h2>Chưa có mẫu in: ${key}</h2></section>`;
      return tpl.render(payload || {}, ctx || {});
    }
  };
})();
