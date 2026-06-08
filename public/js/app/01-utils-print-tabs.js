
const v45PrintCommon = window.V45Common || {};
const calculateCartonUnit = v45PrintCommon.calculateCartonUnit;
const today = v45PrintCommon.todayValue;
const toDateOnly = v45PrintCommon.toDateOnly;
function money(value){return Number(value||0).toLocaleString('vi-VN')}
function normalizePackingRate(source = {}){
  const rate = Number(
    source.conversionRate ??
    source.unitsPerCase ??
    source.packingQty ??
    source.packQty ??
    source.packageQty ??
    source.packingRate ??
    1
  );
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}
function formatQtyTL(qty, rate){
  const total = Number(qty || 0);
  const packingRate = normalizePackingRate({ conversionRate: rate });
  const carton = Math.floor(total / packingRate);
  const loose = total % packingRate;
  return `${carton}/${loose}`;
}
function displayQtyTL(qty, item = {}){
  return formatQtyTL(qty, normalizePackingRate(item));
}

function splitCaseLoose(quantity, rate){
  const total = Math.max(0, Number(quantity || 0));
  const packingRate = normalizePackingRate({ conversionRate: rate });
  return {
    caseQty: Math.floor(total / packingRate),
    looseQty: total % packingRate
  };
}
window.normalizePackingRate = window.normalizePackingRate || normalizePackingRate;
window.formatQtyTL = window.formatQtyTL || formatQtyTL;
window.displayQtyTL = window.displayQtyTL || displayQtyTL;
window.splitCaseLoose = window.splitCaseLoose || splitCaseLoose;
function productPackingText(p){
  if(!p)return '';
  if(p.packing)return p.packing;
  if(p.baseUnit&&Number(p.conversionRate||0)>1)return `1 ${p.unit||''} = ${p.conversionRate} ${p.baseUnit}`;
  return '';
}
function productLineMeta(p){
  const conversionRate = normalizePackingRate(p);
  return {
    unit:p.unit||'',
    baseUnit:p.baseUnit||'',
    conversionRate,
    packingQty:conversionRate,
    unitsPerCase:conversionRate,
    packing:productPackingText({...p, conversionRate}),
    units:Array.isArray(p.units)?p.units:[],
    warehouseCode:p.warehouseCode||p.defaultWarehouse||'KHO_HC',
    warehouseName:p.warehouseName||((p.warehouseCode||p.defaultWarehouse)==='KHO_PC'?'KHO PC':'KHO HC')
  };
}
function getProductKey(p){return String(p?.code||p?.id||'')}
function extractProductCodeFromInput(value){
  const text=String(value||'').trim();
  if(!text)return '';
  // Hỗ trợ các label gợi ý kiểu:
  // 65437062 | SUNSILK... / 65437062 - SUNSILK... / 65437062 SUNSILK...
  const m=text.match(/^([A-Za-z0-9._-]+)/);
  return m ? m[1].trim() : text;
}
function normalizeProductLookup(value){
  return String(value||'').trim().toLowerCase();
}
function findProductByKey(key){
  const raw=String(key||'').trim();
  const value=normalizeProductLookup(raw);
  const leadingCode=normalizeProductLookup(extractProductCodeFromInput(raw));
  if(!value && !leadingCode)return null;
  const pools=[];
  if(window.UnifiedProductSearch && typeof window.UnifiedProductSearch.getCatalog==='function') pools.push(window.UnifiedProductSearch.getCatalog());
  if(Array.isArray(salesProductsCache))pools.push(salesProductsCache);
  if(Array.isArray(productsCache))pools.push(productsCache);
  const seen=new Set();
  for(const pool of pools){
    if(!Array.isArray(pool))continue;
    for(const x of pool){
      if(!x)continue;
      const identity=String(x.id||x._id||x.code||x.productCode||'');
      if(identity && seen.has(identity))continue;
      if(identity)seen.add(identity);
      const keys=[x.code,x.id,x._id,x.productCode,x.sku,x.barcode].map(normalizeProductLookup).filter(Boolean);
      if(keys.includes(value) || keys.includes(leadingCode))return x;
    }
  }
  return null;
}
function formatCaseLooseStock(quantity, conversionRate){
  if(typeof calculateCartonUnit === 'function') return calculateCartonUnit(quantity, conversionRate).display;
  return formatQtyTL(quantity, conversionRate);
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
    button.addEventListener('click',()=>{
      document.querySelectorAll('.tab-button').forEach(btn=>btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab=>tab.classList.remove('active'));
      button.classList.add('active');
      const tab=document.getElementById(button.dataset.tab);
      if(tab) tab.classList.add('active');

      if(button.dataset.tab==='importDataTab' && typeof resetImportPreviewMessage==='function') resetImportPreviewMessage();
      if(typeof window.V45LoadTabDataOnce==='function'){
        window.V45LoadTabDataOnce(button.dataset.tab).catch?.(console.warn);
      }
    });
  });
}

async function checkServer(){
  if(!serverStatus) return;
  serverStatus.textContent='Đang kiểm tra server...';
  serverStatus.className='status';
  try{
    const fetcher=window.fetchWithTimeout||fetch;
    const res=await fetcher('/api/health',{},5000);
    const json=await res.json();
    if(json.ok){serverStatus.textContent='Server đang chạy';serverStatus.className='status ok'}else throw new Error();
  }catch{
    serverStatus.textContent='Server lỗi / phản hồi chậm';serverStatus.className='status error'
  }
}

