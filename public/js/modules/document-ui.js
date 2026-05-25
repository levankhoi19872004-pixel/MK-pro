/* Quản lý chứng từ chuẩn: phiếu nhập, phiếu xuất, điều chỉnh, phiếu thu, phiếu chi, trả hàng. */
(function(){
  window.KHO_DOC_UI = {
    types: {
      RECEIVE: 'PHIEU_NHAP_KHO', ISSUE: 'PHIEU_XUAT_KHO', ADJUST: 'PHIEU_DIEU_CHINH_KHO',
      RECEIPT: 'PHIEU_THU', PAYMENT: 'PHIEU_CHI', RETURN: 'PHIEU_TRA_HANG'
    },
    normalize(doc){
      return { id: doc.id || doc.code || '', type: doc.type || '', date: doc.date || new Date().toISOString().slice(0,10), status: doc.status || 'DRAFT', items: Array.isArray(doc.items) ? doc.items : [], total: Number(doc.total || 0), note: doc.note || '' };
    },
    renderStatus(status){
      const text = status === 'POSTED' ? 'Đã ghi sổ' : status === 'CANCELLED' ? 'Đã huỷ' : 'Nháp';
      return `<span class="badge badge-${status || 'DRAFT'}">${text}</span>`;
    }
  };
})();
