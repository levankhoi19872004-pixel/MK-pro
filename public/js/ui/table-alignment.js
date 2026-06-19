(function initGlobalTableAlignment(){
  'use strict';

  const EXCLUDED_TABLE_SELECTOR = [
    '.spreadsheet-grid',
    '.product-table',
    '.print-table',
    '.invoice-table',
    '.promotion-table',
    '.dms-invoice-table',
    '.dms-detail-table',
    '[data-table-align="off"]'
  ].join(',');

  const RIGHT_PATTERNS = [
    /^(sl|so luong|so dong|thung|le|quy cach|thu|chi|don|san pham|khach no|qua han|da giao|dang giao|chua giao|giao loi|hang tra|dms|thuc te|db queries)$/,
    /\b(tong sl|sl yeu cau|sl thieu|sl giao|sl tra)\b/,
    /\b(gia|tien|gia tri|doanh so|cong no|con no|no goc|da thu|tra hang|tra thuong)\b/,
    /^(ton|chenh|han muc|da ban|con ban|du dau|du cuoi|phat sinh|thuc nop|thuc nhan|bao cao tm|bao cao tk|tien mat|tai khoan)\b/,
    /^tong\b/,
    /\b(ck%|phan tram|ty le|hoan thanh|tien do)\b/,
    /^(lan goi|rows|row|ms|tb total|tb mongo|tb js|tb query|max total|max mongo|max rows|tb rows|cham)$/
  ];

  const CENTER_PATTERNS = [
    /^(|#|stt|chon)$/,
    /\b(ngay|thoi gian|thoi han|cap nhat)\b/,
    /\b(trang thai|status|tt|nguon|hinh thuc|loai|quyen|doi soat)\b/,
    /\b(thao tac|xem|sua|xoa|huy|phan bo)\b/,
    /\b(dvt|don vi tinh)\b/
  ];

  function normalize(value){
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9%#]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function hasCheckbox(cell){
    return Boolean(cell && cell.querySelector('input[type="checkbox"]'));
  }

  function explicitAlignment(cell){
    if(!cell) return '';
    const configured = String(cell.dataset.align || '').trim().toLowerCase();
    if(['left','center','right'].includes(configured)) return configured;
    if(cell.classList.contains('price') || cell.classList.contains('money-cell') || cell.classList.contains('report-number-cell')) return 'right';
    if(cell.classList.contains('row-actions') || cell.classList.contains('button-row') || cell.classList.contains('center')) return 'center';
    return '';
  }

  function classifyColumn(headerCell, columnIndex, table){
    const explicit = explicitAlignment(headerCell);
    if(explicit) return explicit;
    if(hasCheckbox(headerCell)) return 'center';

    const label = normalize(headerCell?.textContent);
    if(!label && (columnIndex === 0 || columnIndex === table.tHead?.rows?.[0]?.cells?.length - 1)) return 'center';
    if(CENTER_PATTERNS.some((pattern) => pattern.test(label))) return 'center';
    if(RIGHT_PATTERNS.some((pattern) => pattern.test(label))) return 'right';
    return 'left';
  }

  function directCells(row){
    return Array.from(row?.children || []).filter((node) => node.matches?.('th,td'));
  }

  function markCell(cell, alignment){
    cell.classList.remove('ui-col--left','ui-col--center','ui-col--right','ui-col--empty');
    cell.classList.add(`ui-col--${alignment}`);
  }

  function alignBodyRow(row, alignments, columnCount){
    const cells = directCells(row);
    if(!cells.length) return;

    if(cells.length === 1 && Number(cells[0].colSpan || 1) >= columnCount){
      cells[0].classList.add('ui-col--empty');
      cells[0].classList.remove('ui-col--left','ui-col--right');
      cells[0].classList.add('ui-col--center');
      return;
    }

    let logicalColumn = 0;
    cells.forEach((cell) => {
      const span = Math.max(1, Number(cell.colSpan || 1));
      const ownAlignment = explicitAlignment(cell);
      const alignment = ownAlignment || alignments[logicalColumn] || 'left';
      markCell(cell, alignment);
      logicalColumn += span;
    });
  }

  function alignTable(table){
    if(!(table instanceof HTMLTableElement)) return;
    if(table.matches(EXCLUDED_TABLE_SELECTOR)) return;
    if(table.closest('.report-compat-hidden,[hidden][aria-hidden="true"]')) return;

    const headerRows = Array.from(table.tHead?.rows || []);
    if(!headerRows.length) return;
    const headerRow = headerRows[headerRows.length - 1];
    const headerCells = directCells(headerRow);
    if(!headerCells.length) return;

    const alignments = headerCells.map((cell,index) => classifyColumn(cell,index,table));
    table.classList.add('ui-data-table');
    headerCells.forEach((cell,index) => markCell(cell,alignments[index]));
    Array.from(table.tBodies || []).forEach((body) => {
      Array.from(body.rows || []).forEach((row) => alignBodyRow(row,alignments,headerCells.length));
    });
    table.dataset.uiAligned = '1';
  }

  function alignWithin(root){
    if(root instanceof HTMLTableElement) alignTable(root);
    root.querySelectorAll?.('table').forEach(alignTable);
  }

  let scheduled = false;
  const pendingRoots = new Set();
  function schedule(root){
    pendingRoots.add(root?.nodeType === 1 ? root : document);
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      roots.forEach(alignWithin);
    });
  }

  function start(){
    alignWithin(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if(mutation.type !== 'childList') return;
        const targetTable = mutation.target.closest?.('table');
        schedule(targetTable || mutation.target);
      });
    });
    observer.observe(document.body,{subtree:true,childList:true});
    window.V45TableAlignment = Object.freeze({alignTable,alignWithin});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
