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
function findProductByKey(key){const value=String(key||'');return productsCache.find(x=>String(x.code||'')===value||String(x.id||'')===value)}
function formatCaseLooseStock(quantity, conversionRate){
  const qty=Math.max(0,Number(quantity||0));
  const rate=Math.max(1,Number(conversionRate||1));
  return `${Math.floor(qty/rate)}/${qty%rate}`;
}
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
  const rawDisplay = String(p?.stockDisplay ?? '').trim();
  if(rawDisplay && rawDisplay !== '0/0') return rawDisplay;
  const qty = productAvailableQty(p);
  if(qty <= 0) return '0 lẻ';
  return formatCaseLooseStock(qty, Number(p?.conversionRate||1));
}
function productStockStatusText(p){
  return productHasStock(p) ? `Tồn: ${productStockDisplay(p)}` : `Hết tồn · Tồn: ${productStockDisplay(p)}`;
}
function today(){return new Date().toISOString().slice(0,10)}
function showMessage(el,text,isError=false){if(!el)return;el.textContent=text;el.classList.toggle('error',isError)}

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
      if(button.dataset.tab==='salesTab') await loadSalesOrders();
      if(button.dataset.tab==='masterOrdersTab') await loadMasterOrderModule();
      if(button.dataset.tab==='deliveryTodayTab') await loadDeliveryToday();
      if(button.dataset.tab==='debtTab'){await loadDebts();await loadReceipts();await loadCashbook();renderCollectionCustomerSelect()}
      if(button.dataset.tab==='reportsTab') await loadReports();
      if(button.dataset.tab==='importDataTab'){resetImportPreviewMessage();}
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

