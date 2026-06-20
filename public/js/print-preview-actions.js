(function initPrintPreviewActions() {
  'use strict';

  function exportCurrentPrintToExcel() {
    const pages = Array.from(document.querySelectorAll('.print-page, .dms-print-page, .dmsx-page'));
    const html = pages.length ? pages.map((page) => page.outerHTML).join('') : document.body.innerHTML;
    const fullHtml = '<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px}.excel-only-column{display:table-cell!important}</style></head><body>' + html + '</body></html>';
    const blob = new Blob(['\ufeff' + fullHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safe = (document.title || 'ban-in').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'ban-in';
    link.download = safe + '.xls';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-print-action]');
    if (!action) return;
    const type = action.dataset.printAction;
    if (type === 'close') window.close();
    if (type === 'print') window.print();
    if (type === 'excel') exportCurrentPrintToExcel();
  });
})();
