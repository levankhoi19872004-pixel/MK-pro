function money(value){return Number(value||0).toLocaleString('vi-VN')}
function productPackingText(p){
  if(!p)return '';
  if(p.packing)return p.packing;
  if(p.baseUnit&&Number(p.conversionRate||0)>1)return `1 ${p.unit||''} = ${p.conversionRate} ${p.baseUnit}`;
  return '';
}
function productLineMeta(p){
  return {unit:p.unit||'',baseUnit:p.baseUnit||'',conversionRate:Number(p.conversionRate||1),packing:productPackingText(p),units:Array.isArray(p.units)?p.units:[]};
}
function getProductKey(p){return String(p?.code||p?.id||'')}
function findProductByKey(key){
  const value=String(key||'');
  const pools=[];
  if(window.UnifiedProductSearch && typeof window.UnifiedProductSearch.getCatalog==='function') pools.push(window.UnifiedProductSearch.getCatalog());
  if(Array.isArray(salesProductsCache))pools.push(salesProductsCache);
  if(Array.isArray(productsCache))pools.push(productsCache);
  for(const pool of pools){
    const found=pool.find(x=>String(x.code||'')===value||String(x.id||'')===value||String(x._id||'')===value||String(x.productCode||'')===value||String(x.sku||'')===value);
    if(found)return found;
  }
  return null;
}
function calculateCartonUnit(quantity, packing){
  const qty=Math.max(0,Number(quantity||0));
  const rate=Math.max(1,Number(packing||1));
  const cartons=Math.floor(qty/rate);
  const units=qty%rate;
  return {cartons,units,packing:rate,display:`${cartons}/${units}`};
}
function formatCaseLooseStock(quantity, conversionRate){
  return calculateCartonUnit(quantity, conversionRate).display;
}
window.calculateCartonUnit=window.calculateCartonUnit||calculateCartonUnit;
function productAvailableQty(p){
  // Tồn mở bán ưu tiên lấy từ inventory/snapshot. Không dùng hàm này để ẩn sản phẩm khỏi gợi ý.
  const direct = Number(p?.availableQty ?? p?.availableStock ?? p?.available ?? p?.stockQuantity ?? p?.quantity ?? 0);
  if(Number.isFinite(direct) && direct > 0) return direct;
  const cases = Number(p?.stockCase ?? p?.caseQty ?? p?.cases ?? p?.thung ?? 0);
  const loose = Number(p?.stockLoose ?? p?.looseQty ?? p?.loose ?? p?.le ?? 0);
  const rate = Math.max(1, Number(p?.conversionRate || p?.pack || 1));
  const converted = (Number.isFinite(cases) ? cases : 0) * rate + (Number.isFinite(loose) ? loose : 0);
  return Math.max(0, converted);
}
function productHasStock(p){
  return productAvailableQty(p) > 0;
}
function productStockDisplay(p){
  const qty = productAvailableQty(p);
  if(qty > 0) return formatCaseLooseStock(qty, Number(p?.conversionRate||1));
  const rawDisplay = String(p?.stockDisplay ?? '').trim().replace(/^Tồn\s*:?\s*/i,'').replace(/^Hết tồn\s*·\s*Tồn\s*:?\s*/i,'');
  if(/^\d+\s*\/\s*\d+$/.test(rawDisplay)) return rawDisplay.replace(/\s+/g,'');
  const cases = Number((rawDisplay.match(/(\d+)\s*thùng/i)||[])[1]||0);
  const loose = Number((rawDisplay.match(/(\d+)\s*lẻ/i)||[])[1]||0);
  return `${cases}/${loose}`;
}
function productStockStatusText(p){
  return productHasStock(p) ? `Tồn: ${productStockDisplay(p)}` : `Hết tồn · Tồn: ${productStockDisplay(p)}`;
}

function today(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function toDateOnly(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  let m=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m=raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/);
  if(m){let d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]); if(y<100)y+=y>=70?1900:2000; if(mo>=1&&mo<=12&&d>=1&&d<=31)return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  return raw.slice(0,10);
}
function isDateInRange(value,fromDate,toDate){
  const d=toDateOnly(value); const f=toDateOnly(fromDate); const t=toDateOnly(toDate);
  if(!d)return false; if(f&&d<f)return false; if(t&&d>t)return false; return true;
}
function formatDateVN(value){
  const d=toDateOnly(value);
  const m=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (value||'');
}



function normalizeOrderSourceClient(order){
  const raw=[
    order?.orderSource,
    order?.source,
    order?.sourceType,
    order?.orderSourceName,
    order?.importSource,
    order?.importType,
    order?.origin,
    order?.note
  ].filter(Boolean).join(' ').toUpperCase();
  return /(^|[^A-Z])DMS([^A-Z]|$)|DMS_IMPORT|IMPORT EXCEL DMS|EXCEL DMS|FILE DMS|UNILEVER DMS/.test(raw) ? 'DMS' : 'NVBH';
}
function getOrderSourceText(order){
  return normalizeOrderSourceClient(order)==='DMS'?'Từ DMS':'Từ NVBH';
}
function getOrderSourceClass(order){
  return normalizeOrderSourceClient(order)==='DMS'?'source-dms':'source-nvbh';
}
function orderSourceLabel(source, row){
  const order={...(row||{}), orderSource: source ?? row?.orderSource};
  const cls=getOrderSourceClass(order);
  const text=getOrderSourceText(order);
  return `<span class="badge ${cls}">${text}</span>`;
}
window.normalizeOrderSourceClient=normalizeOrderSourceClient;
window.getOrderSourceText=getOrderSourceText;
window.getOrderSourceClass=getOrderSourceClass;
window.orderSourceLabel=orderSourceLabel;
function showMessage(el,text,isError=false){if(!el)return;el.textContent=text;el.classList.toggle('error',isError)}

function exportErpRows(filename, headers, rows){
  const safeRows=[headers, ...(rows||[])];
  const csv=safeRows.map(row=>(row||[]).map(value=>{
    const text=String(value ?? '').replace(/"/g,'""');
    return `"${text}"`;
  }).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename||'erp-export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
window.exportErpRows=exportErpRows;


async function printDocument(type, documentData){
  try{
    const res=await fetch('/api/print/render',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        type,
        document:documentData,
        options:{companyName:'NHÀ PHÂN PHỐI MINH KHAI'}
      })
    });
    const html=await res.text();
    if(!res.ok)throw new Error(html||'Không tạo được mẫu in');
    const printWindow=window.open('','_blank');
    if(!printWindow)throw new Error('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup.');
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }catch(err){alert(err.message||'Không in được chứng từ')}
}
window.printDocument=printDocument;


function setupTabs(){
  document.querySelectorAll('.tab-button').forEach(button=>{
    button.addEventListener('click',async()=>{
      document.querySelectorAll('.tab-button').forEach(btn=>btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab=>tab.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(button.dataset.tab).classList.add('active');

      if(button.dataset.tab==='customersTab') await loadCustomers();
      if(button.dataset.tab==='stockTab') await loadStock();
      if(button.dataset.tab==='salesTab'){ await loadUsers(); await loadSalesOrders(); }
      if(button.dataset.tab==='masterOrdersTab'){ await loadUsers(); await loadMasterOrderModule(); }
      if(button.dataset.tab==='returnOrdersTab') await loadReturnOrders();
      if(button.dataset.tab==='deliveryTodayTab'){ await loadUsers(); await loadDeliveryToday(); }
      if(button.dataset.tab==='debtTab'){await loadUsers();await loadDebts();await loadReceipts();await loadCashbook();renderCollectionCustomerSelect()}
      if(button.dataset.tab==='reportsTab') await loadReports();
      if(button.dataset.tab==='importDataTab'){resetImportPreviewMessage();}
      if(button.dataset.tab==='systemTab' && typeof loadSystemStatus==='function') await loadSystemStatus();
      if(button.dataset.tab==='importTab'){await loadProducts();renderImportProductSelect();await loadImportOrders()}
      if(button.dataset.tab==='salesTab'){await loadProducts();await loadCustomers();await loadUsers();renderSalesProductSelect();renderSalesCustomerSelect();renderSalesStaffSelect()}
    });
  });
}

async function checkServer(){
  try{
    const res=await fetch('/api/health');const json=await res.json();
    if(json.ok){serverStatus.textContent='Server đang chạy';serverStatus.className='status ok'}else throw new Error();
  }catch{serverStatus.textContent='Server lỗi';serverStatus.className='status error'}
}

