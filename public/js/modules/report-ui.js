/* Báo cáo chuyên nghiệp: doanh số ngày, nhập-xuất-tồn, công nợ, quỹ, hàng thiếu. */
(function(){
  window.KHO_REPORT_UI = {
    money(v){ return Number(v || 0).toLocaleString('vi-VN'); },
    today(){ return new Date().toISOString().slice(0,10); },
    renderKpi(title, value, sub){ return `<div class="kpi-card"><div class="kpi-title">${title}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub || ''}</div></div>`; }
  };
})();
