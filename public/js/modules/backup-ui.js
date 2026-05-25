/* Sao lưu/phục hồi dữ liệu: xuất snapshot JSON, phục hồi khi cần. */
(function(){
  window.KHO_BACKUP_UI = {
    downloadJson(filename, data){
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename || 'kho-backup.json'; a.click(); URL.revokeObjectURL(a.href);
    }
  };
})();
