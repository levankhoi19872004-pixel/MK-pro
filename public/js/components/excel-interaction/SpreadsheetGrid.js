(function initSpreadsheetGrid(global){
  'use strict';

  function normalizeClipboard(text){
    return String(text||'')
      .replace(/\r\n/g,'\n')
      .replace(/\r/g,'\n')
      .split('\n')
      .map(line=>line.split('\t'))
      .filter((row,index,rows)=>row.some(value=>String(value).trim()!=='')||index<rows.length-1);
  }

  function cellText(cell){return String(cell?.textContent||'').replace(/\u00a0/g,' ').trim();}

  class SpreadsheetGrid{
    constructor(options={}){
      this.container=typeof options.container==='string'?document.querySelector(options.container):options.container;
      if(!this.container)throw new Error('Không tìm thấy vùng SpreadsheetGrid');
      this.columns=Array.isArray(options.columns)?options.columns:[];
      this.minRows=Math.max(1,Number(options.minRows||20));
      this.maxRows=Math.max(this.minRows,Number(options.maxRows||5000));
      this.onChange=typeof options.onChange==='function'?options.onChange:()=>{};
      this.activeCell=null;
      this.render(this.minRows);
    }

    render(rowCount=this.minRows){
      const count=Math.min(Math.max(rowCount,this.minRows),this.maxRows);
      this.container.classList.add('spreadsheet-grid-shell');
      this.container.innerHTML=`<table class="spreadsheet-grid" role="grid">
        <thead><tr><th class="sheet-row-number">#</th>${this.columns.map(column=>`<th title="${this.escape(column.key||column.label||'')}">${this.escape(column.label||column.key||'')}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({length:count},(_,rowIndex)=>this.rowHtml(rowIndex)).join('')}</tbody>
      </table>`;
      this.table=this.container.querySelector('table');
      this.body=this.container.querySelector('tbody');
      this.bind();
    }

    rowHtml(rowIndex){
      return `<tr data-row-index="${rowIndex}"><th class="sheet-row-number">${rowIndex+1}</th>${this.columns.map((column,columnIndex)=>`<td contenteditable="true" spellcheck="false" data-row-index="${rowIndex}" data-column-index="${columnIndex}" data-key="${this.escape(column.key||'')}" inputmode="${['number','integer','money'].includes(column.type)?'decimal':'text'}"></td>`).join('')}</tr>`;
    }

    escape(value){return String(value??'').replace(/[&<>"']/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));}

    bind(){
      this.table.addEventListener('focusin',event=>{
        const cell=event.target.closest('td[contenteditable]');
        if(cell)this.setActive(cell);
      });
      this.table.addEventListener('click',event=>{
        const cell=event.target.closest('td[contenteditable]');
        if(cell)this.setActive(cell);
      });
      this.table.addEventListener('input',event=>{
        if(event.target.matches('td[contenteditable]'))this.onChange(this.getRows());
      });
      this.table.addEventListener('paste',event=>{
        const cell=event.target.closest('td[contenteditable]');
        if(!cell)return;
        const text=event.clipboardData?.getData('text/plain');
        if(text===undefined)return;
        event.preventDefault();
        this.pasteAt(cell,text);
      });
      this.table.addEventListener('keydown',event=>this.handleKeydown(event));
    }

    setActive(cell){
      this.table.querySelectorAll('.sheet-active-cell').forEach(el=>el.classList.remove('sheet-active-cell'));
      this.activeCell=cell;
      cell.classList.add('sheet-active-cell');
    }

    handleKeydown(event){
      const cell=event.target.closest('td[contenteditable]');
      if(!cell)return;
      const row=Number(cell.dataset.rowIndex);
      const col=Number(cell.dataset.columnIndex);
      let next=null;
      if(event.key==='Tab'){
        event.preventDefault();
        const delta=event.shiftKey?-1:1;
        let nextCol=col+delta;
        let nextRow=row;
        if(nextCol>=this.columns.length){nextCol=0;nextRow+=1;}
        if(nextCol<0){nextCol=this.columns.length-1;nextRow=Math.max(0,nextRow-1);}
        this.ensureRows(nextRow+1);
        next=this.cell(nextRow,nextCol);
      }else if(event.key==='Enter'){
        event.preventDefault();
        this.ensureRows(row+2);
        next=this.cell(row+1,col);
      }else if(event.key==='ArrowDown'&&event.ctrlKey){
        event.preventDefault();
        this.ensureRows(row+2);
        next=this.cell(row+1,col);
      }else if(event.key==='ArrowUp'&&event.ctrlKey){
        event.preventDefault();next=this.cell(Math.max(0,row-1),col);
      }
      if(next){next.focus();this.setActive(next);}
    }

    cell(row,column){return this.body.querySelector(`td[data-row-index="${row}"][data-column-index="${column}"]`);}

    ensureRows(required){
      const current=this.body.querySelectorAll('tr').length;
      const target=Math.min(Math.max(required,current),this.maxRows);
      if(target<=current)return;
      this.body.insertAdjacentHTML('beforeend',Array.from({length:target-current},(_,offset)=>this.rowHtml(current+offset)).join(''));
    }

    pasteAt(startCell,text){
      const matrix=normalizeClipboard(text);
      const startRow=Number(startCell.dataset.rowIndex);
      const startCol=Number(startCell.dataset.columnIndex);
      this.ensureRows(startRow+matrix.length);
      matrix.forEach((values,rowOffset)=>values.forEach((value,colOffset)=>{
        const col=startCol+colOffset;
        if(col>=this.columns.length)return;
        const target=this.cell(startRow+rowOffset,col);
        if(target)target.textContent=String(value??'');
      }));
      const lastRow=Math.min(startRow+Math.max(matrix.length-1,0),this.body.querySelectorAll('tr').length-1);
      const lastCol=Math.min(startCol+Math.max((matrix[0]||[]).length-1,0),this.columns.length-1);
      const next=this.cell(lastRow,lastCol);
      if(next){next.focus();this.setActive(next);}
      this.onChange(this.getRows());
    }

    setRows(rows=[]){
      const list=Array.isArray(rows)?rows:[];
      this.ensureRows(Math.max(this.minRows,list.length));
      this.clear(false);
      list.forEach((row,rowIndex)=>this.columns.forEach((column,columnIndex)=>{
        const target=this.cell(rowIndex,columnIndex);
        if(target)target.textContent=row?.[column.key]??'';
      }));
      this.onChange(this.getRows());
    }

    getRows(){
      const rows=[];
      this.body.querySelectorAll('tr').forEach((tr,rowIndex)=>{
        const row={__rowNo:rowIndex+1};
        let hasValue=false;
        this.columns.forEach((column,columnIndex)=>{
          const value=cellText(this.cell(rowIndex,columnIndex));
          row[column.key]=value;
          if(value!=='')hasValue=true;
        });
        if(hasValue)rows.push(row);
      });
      return rows;
    }

    clear(notify=true){
      this.body.querySelectorAll('td[contenteditable]').forEach(cell=>{
        cell.textContent='';
        cell.classList.remove('sheet-error','sheet-warning','sheet-active-cell');
        cell.removeAttribute('title');
      });
      if(notify)this.onChange([]);
    }

    addRows(count=10){this.ensureRows(this.body.querySelectorAll('tr').length+Math.max(1,Number(count||10)));}

    focus(){const first=this.cell(0,0);if(first){first.focus();this.setActive(first);}}

    markCell(rowIndex,key,{error='',warning=''}={}){
      const columnIndex=this.columns.findIndex(column=>column.key===key);
      if(columnIndex<0)return;
      const target=this.cell(rowIndex,columnIndex);
      if(!target)return;
      target.classList.toggle('sheet-error',Boolean(error));
      target.classList.toggle('sheet-warning',Boolean(warning)&&!error);
      target.title=error||warning||'';
    }
  }

  global.ExcelInteraction=Object.assign(global.ExcelInteraction||{}, {
    SpreadsheetGrid,
    parseClipboardTable:normalizeClipboard
  });
})(window);
