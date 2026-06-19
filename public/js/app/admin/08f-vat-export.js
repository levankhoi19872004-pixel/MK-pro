'use strict';

// Xuất hóa đơn VAT TT78: Sheet1 sau đối trừ hàng trả.
(function initVatInvoiceTT78Export(){
  const button=document.getElementById('exportVatInvoiceTT78Button');
  const summary=document.getElementById('vatInvoiceExportSummary');
  if(!button)return;
  button.addEventListener('click',()=>{
    if(summary)summary.textContent='Đang tạo file Excel TT78...';
    exportReportExcel('vatInvoiceTT78');
    setTimeout(()=>{if(summary)summary.textContent='Đã gửi yêu cầu xuất Excel TT78. Kiểm tra file tải về của trình duyệt.';},800);
  });
})();
