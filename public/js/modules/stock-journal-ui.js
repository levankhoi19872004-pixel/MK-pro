/* Nhật ký kho: truy vết mọi tăng/giảm tồn theo sản phẩm, kho, chứng từ. */
(function(){
  window.KHO_STOCK_JOURNAL_UI = {
    filter(rows, query){
      const q = query || {};
      return (rows || []).filter(x => (!q.sku || String(x.sku) === String(q.sku)) && (!q.warehouseCode || String(x.warehouseCode) === String(q.warehouseCode)) && (!q.fromDate || String(x.date) >= q.fromDate) && (!q.toDate || String(x.date) <= q.toDate));
    },
    rowHtml(x){
      return `<tr><td>${x.date || ''}</td><td>${x.type || ''}</td><td>${x.refId || ''}</td><td>${x.sku || ''}</td><td>${x.productName || ''}</td><td>${x.inQty || 0}</td><td>${x.outQty || 0}</td><td>${x.afterQty || 0}</td></tr>`;
    }
  };
})();
