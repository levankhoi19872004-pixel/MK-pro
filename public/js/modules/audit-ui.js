/* Lịch sử thao tác: ai tạo/sửa/hủy/ghi sổ chứng từ, trước và sau thay đổi. */
(function(){
  window.KHO_AUDIT_UI = {
    filter(rows, q){ q = q || {}; return (rows || []).filter(x => (!q.module || x.module === q.module) && (!q.refId || x.refId === q.refId) && (!q.fromDate || String(x.time).slice(0,10) >= q.fromDate) && (!q.toDate || String(x.time).slice(0,10) <= q.toDate)); },
    rowHtml(x){ return `<tr><td>${x.time || ''}</td><td>${x.userName || x.userCode || ''}</td><td>${x.module || ''}</td><td>${x.action || ''}</td><td>${x.refId || ''}</td><td>${x.note || ''}</td></tr>`; }
  };
})();
