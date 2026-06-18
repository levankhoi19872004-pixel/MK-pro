/* GENERATED FILE — edit public/js/delivery/delivery-web-view.source/part-01.jsfrag, public/js/delivery/delivery-web-view.source/part-02.jsfrag, public/js/delivery/delivery-web-view.source/part-03.jsfrag and run npm run build:source-bundles. */
!function(){"use strict";function byId(id){return document.getElementById(id)}function esc(value){return String(null==value?"":value).replace(/[&<>"']/g,function(ch){return{
"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]})}function num(value){return window.DeliveryCore?window.DeliveryCore.toNumber(value):Number(value||0)}
function money(value){return window.DeliveryCore?window.DeliveryCore.money(value):String(Math.round(Number(value||0)))}function normalizeDebtAmount(value){
if(window.DeliveryCore&&"function"==typeof window.DeliveryCore.normalizeDebtAmount)return window.DeliveryCore.normalizeDebtAmount(value);var n=Math.round(num(value))
;return Math.abs(n)<=1e3?0:n}function baseAmount(order,key){return num(order&&order.amounts&&order.amounts[key])}function returnAmountFromReturnOrders(order){
var map,rows=returnsForOrder(order);return rows.length?rows.reduce(function(sum,row){return sum+num(row.amount||row.returnAmount||num(row.returnQty)*num(row.price))
},0):function(order){if(!window.DeliveryCore||!window.DeliveryCore.state)return!1;var map=window.DeliveryCore.state.returnsLoadedByOrder||{}
;return("function"==typeof window.DeliveryCore.returnLoadKeysForOrder?window.DeliveryCore.returnLoadKeysForOrder(order||{}):[(order=order||{}).orderId,order.orderCode,order.salesOrderId,order.salesOrderCode,order.id,order.code].map(String).filter(Boolean)).some(function(key){
return map[key]})
}(order)||window.DeliveryCore&&window.DeliveryCore.state&&window.DeliveryCore.state.returnsLoaded&&(map=window.DeliveryCore&&window.DeliveryCore.state&&window.DeliveryCore.state.returnsLoadedByOrder||{},
!(Object.keys(map).length>0))?0:baseAmount(order,"returnAmount")}function amount(order,key){if("returnAmount"===key)return returnAmountFromReturnOrders(order);if("debt"===key){
var receivable=baseAmount(order,"receivable"),paid=baseAmount(order,"cash")+baseAmount(order,"bank")+baseAmount(order,"reward")+returnAmountFromReturnOrders(order)
;return normalizeDebtAmount(Math.max(0,receivable-paid))}
return"processed"===key?baseAmount(order,"cash")+baseAmount(order,"bank")+baseAmount(order,"reward")+returnAmountFromReturnOrders(order):baseAmount(order,key)}
function orderKey(order){return window.DeliveryCore.orderKey(order)}var state={selectedKey:"",activeTab:"products",accountingSelectedKeys:{},selectedSalesStaffKeys:{},
salesBranchScope:"",salesBranchRowCount:0};function renderShell(){var root=function(){var root=byId("deliveryTodayRoot");if(root)return root;var tab=byId("deliveryTodayTab")
;return tab?(tab.innerHTML='<section id="deliveryTodayRoot" class="delivery-v46-shell"></section>',byId("deliveryTodayRoot")):null}();if(root){
root.innerHTML='<section class="delivery-v46-header card"><div><h2>Đơn giao hôm nay</h2><p class="muted">Luồng chuẩn: <b>Giao hàng → Thu tiền → Hoàn tất</b>. Web và app dùng chung <b>DeliveryCore</b>, hàng trả một nguồn <b>returnOrders</b>.</p></div><div class="delivery-v46-filters"><label>Ngày giao<input id="deliveryCoreDate" type="date"></label><label class="delivery-v46-filter-suggest">NVGH<input id="deliveryCoreDeliveryStaff" autocomplete="off" placeholder="Mã/tên NVGH"><div id="deliveryCoreDeliveryStaffSuggestions" class="delivery-v46-suggest-box"></div></label><label class="delivery-v46-filter-suggest">NVBH<input id="deliveryCoreSalesStaff" autocomplete="off" placeholder="Mã/tên NVBH"><div id="deliveryCoreSalesStaffSuggestions" class="delivery-v46-suggest-box"></div></label><label>Trạng thái<select id="deliveryCoreStatus"><option value="all">Tất cả</option><option value="delivered">Đã giao</option><option value="pending">Chưa giao</option><option value="return">Trả hàng</option><option value="debt">Công nợ</option></select></label><label>Tìm kiếm<input id="deliveryCoreSearch" placeholder="Mã đơn / khách hàng"></label><button id="deliveryCoreReload" type="button">Tải đơn</button></div></section><section id="deliverySalesBranchBox" class="delivery-v46-sales-branch empty"></section><section class="delivery-v46-kpis"><div class="delivery-v46-kpi kpi-pt"><span>Phải thu</span><b id="deliveryKpiReceivable">0</b></div><div class="delivery-v46-kpi kpi-tm"><span>Tiền mặt</span><b id="deliveryKpiCash">0</b></div><div class="delivery-v46-kpi kpi-ck"><span>Chuyển khoản</span><b id="deliveryKpiBank">0</b></div><div class="delivery-v46-kpi kpi-th"><span>Trả thưởng</span><b id="deliveryKpiReward">0</b></div><div class="delivery-v46-kpi kpi-ht"><span>Hàng trả</span><b id="deliveryKpiReturn">0</b></div><div class="delivery-v46-kpi kpi-cn"><span>Còn nợ</span><b id="deliveryKpiDebt">0</b></div></section><main class="delivery-v46-layout"><section class="card delivery-v46-list-panel"><div class="delivery-v46-panel-title delivery-v46-panel-title-with-actions"><h3>Danh sách đơn</h3><div class="delivery-v46-list-actions"><button id="deliverySelectAllAccounting" type="button" class="secondary">Chọn tất cả</button><button id="deliveryBulkAccountingButton" type="button" class="primary">Xác nhận kế toán đã chọn</button><span id="deliveryCoreCount">0 đơn</span></div></div><div class="mk-delivery-list-head mk-delivery-list-grid"><span class="mk-delivery-check-head"></span><span>Đơn / Khách hàng</span><span>PT</span><span>TM</span><span>CK</span><span>TH</span><span>HT</span><span>CN</span></div><div id="deliveryCoreList" class="delivery-v46-list"><div class="empty-state">Chưa tải đơn.</div></div></section><aside class="card delivery-v46-detail-panel"><div id="deliveryCoreDetail" class="delivery-v46-detail-empty">Chọn đơn bên trái để xem chi tiết.</div></aside></main><p id="deliveryCoreMessage" class="message"></p>',
byId("deliveryCoreDate").value=function(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"
}).formatToParts(new Date),values=Object.fromEntries(parts.map(part=>[part.type,part.value]));return`${values.year}-${values.month}-${values.day}`}(),
byId("deliveryCoreReload").addEventListener("click",load),
byId("deliverySelectAllAccounting")&&byId("deliverySelectAllAccounting").addEventListener("click",toggleSelectAllAccounting),
byId("deliveryBulkAccountingButton")&&byId("deliveryBulkAccountingButton").addEventListener("click",confirmSelectedAccounting),
["deliveryCoreDate","deliveryCoreStatus"].forEach(function(id){var input=byId(id);input&&input.addEventListener("change",debounce(load,300))})
;var searchInput=byId("deliveryCoreSearch");searchInput&&searchInput.addEventListener("input",debounce(load,300)),function(){
if("function"==typeof window.bindConfiguredAutocomplete){var configs=window.SEARCH_FIELD_CONFIGS||[],deliveryStaffConfig=configs.find(function(config){
return"deliveryCoreDeliveryStaff"===config.key}),salesStaffConfig=configs.find(function(config){return"deliveryCoreSalesStaff"===config.key})
;deliveryStaffConfig&&window.bindConfiguredAutocomplete(deliveryStaffConfig),salesStaffConfig&&window.bindConfiguredAutocomplete(salesStaffConfig)}}(),renderSalesBranchFilter()}}
function debounce(fn,wait){var timer=null;return function(){clearTimeout(timer);var args=arguments;timer=setTimeout(function(){fn.apply(null,args)},wait)}}function filters(){
return{date:byId("deliveryCoreDate")&&byId("deliveryCoreDate").value,deliveryStaffCode:byId("deliveryCoreDeliveryStaff")&&byId("deliveryCoreDeliveryStaff").value,
salesStaffCode:byId("deliveryCoreSalesStaff")&&byId("deliveryCoreSalesStaff").value,statusFilter:byId("deliveryCoreStatus")&&byId("deliveryCoreStatus").value,
q:byId("deliveryCoreSearch")&&byId("deliveryCoreSearch").value,staffCheck:"0"}}function cleanKey(value){return String(null==value?"":value).trim()}function normKey(value){
return cleanKey(value).toLowerCase()}function salesStaffKey(order){
return cleanKey((order=order||{}).salesStaffCode||order.salesPersonCode||order.salesmanCode||order.nvbhCode||order.maNVBH||order.salesStaffName||order.salesPersonName||order.salesmanName||order.nvbhName||order.maNVBHName||"NO_SALES_STAFF")
}function salesStaffName(order){return cleanKey((order=order||{}).salesStaffName||order.salesPersonName||order.salesmanName||order.nvbhName||order.maNVBHName||"Chưa gán NVBH")}
function branchSelectedCount(rows){return(rows||[]).filter(function(row){return state.selectedSalesStaffKeys&&state.selectedSalesStaffKeys[row.key]}).length}
function renderSalesBranchFilter(){var box=byId("deliverySalesBranchBox");if(box){var f=filters(),rows=function(){
var rows=window.DeliveryCore&&window.DeliveryCore.state&&window.DeliveryCore.state.orders||[],map={};return rows.forEach(function(order){
var code=salesStaffKey(order),key=normKey(code||"NO_SALES_STAFF");key||(key="no_sales_staff"),map[key]||(map[key]={key:key,code:"NO_SALES_STAFF"===code?"":code,
name:salesStaffName(order),count:0,receivable:0,cash:0,bank:0,reward:0,returnAmount:0,debt:0}),map[key].count+=1,map[key].receivable+=amount(order,"receivable"),
map[key].cash+=amount(order,"cash"),map[key].bank+=amount(order,"bank"),map[key].reward+=amount(order,"reward"),map[key].returnAmount+=amount(order,"returnAmount"),
map[key].debt+=normalizeDebtAmount(amount(order,"debt"))}),Object.keys(map).map(function(key){return map[key]}).sort(function(a,b){
return String(a.name||a.code||"").localeCompare(String(b.name||b.code||""),"vi")})}();if(function(rows){
var f,scope=[cleanKey((f=filters()).date),normKey(f.deliveryStaffCode),normKey(f.salesStaffCode)].join("|"),keys=(rows||[]).map(function(row){return row.key})
;state.salesBranchRowCount=keys.length;var selected=state.selectedSalesStaffKeys||{};if(scope!==state.salesBranchScope)return selected={},keys.forEach(function(key){
selected[key]=!0}),state.selectedSalesStaffKeys=selected,void(state.salesBranchScope=scope);var keep={};keys.forEach(function(key){selected[key]&&(keep[key]=!0)}),
state.selectedSalesStaffKeys=keep}(rows),!cleanKey(f.deliveryStaffCode))return box.className="delivery-v46-sales-branch empty",
void(box.innerHTML="<span>Chọn NVGH để hiện danh sách NVBH theo nhánh trong ngày.</span>");if(!rows.length)return box.className="delivery-v46-sales-branch empty",
void(box.innerHTML="<span>NVGH này chưa có NVBH/đơn giao trong ngày đã chọn.</span>");var selected=branchSelectedCount(rows);box.className="delivery-v46-sales-branch",
box.innerHTML='<div class="delivery-v46-sales-branch-head"><b>NVBH thuộc NVGH '+esc(cleanKey(f.deliveryStaffCode))+"</b><span>"+esc(function(rows){
var selected=branchSelectedCount(rows=rows||[])
;return rows.length?selected===rows.length?"Đang xem tất cả "+rows.length+" NVBH":"Đang xem "+selected+"/"+rows.length+" NVBH":"Chưa có NVBH dưới NVGH đã chọn"
}(rows))+'</span><button type="button" id="deliverySalesBranchToggleAll" class="secondary">'+(selected===rows.length?"Bỏ chọn tất cả":"Chọn tất cả")+'</button></div><div class="delivery-v46-sales-branch-list">'+rows.map(function(row){
var checked=state.selectedSalesStaffKeys&&state.selectedSalesStaffKeys[row.key],label=[row.code,row.name].filter(Boolean).join(" - ")||"Chưa gán NVBH"
;return'<label class="delivery-v46-sales-branch-item '+(checked?"checked":"")+'"><input type="checkbox" data-sales-branch-key="'+esc(row.key)+'" '+(checked?"checked":"")+'><span class="delivery-v46-sales-branch-name"><b>'+esc(label)+"</b><em>"+esc(row.count)+' đơn</em></span><span class="delivery-v46-sales-branch-money"><i>PT <b>'+esc(money(row.receivable))+"</b></i><i>TM <b>"+esc(money(row.cash))+"</b></i><i>CK <b>"+esc(money(row.bank))+"</b></i><i>TH <b>"+esc(money(row.reward))+"</b></i><i>HT <b>"+esc(money(row.returnAmount))+"</b></i><i>CN <b>"+esc(money(row.debt))+"</b></i></span></label>"
}).join("")+"</div>";var toggleAll=byId("deliverySalesBranchToggleAll");toggleAll&&toggleAll.addEventListener("click",function(){
var allSelected=branchSelectedCount(rows)===rows.length;rows.forEach(function(row){state.selectedSalesStaffKeys[row.key]=!allSelected}),keepSelectionVisible(),
renderSalesBranchFilter(),renderList(),renderDetail(window.DeliveryCore&&window.DeliveryCore.state?window.DeliveryCore.state.selectedOrder:null)}),
box.querySelectorAll("[data-sales-branch-key]").forEach(function(input){input.addEventListener("change",function(){var key=input.getAttribute("data-sales-branch-key")
;state.selectedSalesStaffKeys[key]=input.checked,branchSelectedCount(rows)||(state.selectedSalesStaffKeys[key]=!0),keepSelectionVisible(),renderSalesBranchFilter(),renderList(),
renderDetail(window.DeliveryCore&&window.DeliveryCore.state?window.DeliveryCore.state.selectedOrder:null)})})}}function keepSelectionVisible(){
if(window.DeliveryCore&&window.DeliveryCore.state){var visible=getVisibleOrders();if(!visible.length)return state.selectedKey="",void(window.DeliveryCore.state.selectedOrder=null)
;visible.some(function(order){return orderKey(order)===state.selectedKey})||(state.selectedKey=orderKey(visible[0]),window.DeliveryCore.selectOrder(state.selectedKey))}}
function isDelivered(order){
var st=order&&order.status&&"object"==typeof order.status?order.status:{},value=String(st.deliveryStatus||order.deliveryStatus||order.status||"").toLowerCase()
;return["delivered","success","done","completed"].indexOf(value)>=0}function isAccountingReopenPending(order){
var st=(order=order||{}).status&&"object"==typeof order.status?order.status:{},value=String(order.accountingStatus||st.accountingStatus||"").toLowerCase()
;return Boolean(order.accountingNeedsReconfirm||order.needReAccounting||order.reAccountingRequired||order.adminAdjustmentOpen)||["reopened","needs_reconfirm","needs_repost"].indexOf(value)>=0
}function isAccountingConfirmed(order){if(isAccountingReopenPending(order=order||{}))return!1
;var st=order.status&&"object"==typeof order.status?order.status:{},value=String(order.accountingStatus||st.accountingStatus||"").toLowerCase()
;return Boolean(order.accountingConfirmed)||["confirmed","locked","posted","done"].indexOf(value)>=0}function isAccountingSelectable(order){
return!(!order||!accountingKey(order)||!isDelivered(order)||!isAccountingReopenPending(order)&&isAccountingConfirmed(order))}function accountingKey(order){return order=order||{},
String(order.orderId||order.id||order.code||order.orderCode||order.salesOrderId||order.salesOrderCode||"").trim()}function getVisibleOrders(){
var rows=window.DeliveryCore&&window.DeliveryCore.state&&window.DeliveryCore.state.orders||[],f=filters(),q=String(f.q||"").trim().toLowerCase(),statusFilter=String(f.statusFilter||"all").trim().toLowerCase()
;return rows.filter(function(order){return!!function(order){if(Number(state.salesBranchRowCount||0)<=1)return!0;var key=normKey(salesStaffKey(order))
;return Boolean((state.selectedSalesStaffKeys||{})[key])}(order)&&!(q&&function(order){
return[(order=order||{}).orderCode,order.salesOrderCode,order.code,order.id,order.customerCode,order.customerName,order.salesStaffCode,order.salesStaffName,order.salesmanCode,order.salesmanName,order.deliveryStaffCode,order.deliveryStaffName].join(" ").toLowerCase()
}(order).indexOf(q)<0)&&("delivered"===statusFilter?isDelivered(order):"pending"===statusFilter?!isDelivered(order):"return"===statusFilter?amount(order,"returnAmount")>0:"debt"!==statusFilter||normalizeDebtAmount(amount(order,"debt"))>0)
})}function message(text,isError){var node=byId("deliveryCoreMessage");node&&(node.textContent=text||"",node.className="message "+(isError?"danger-text":""))}
function refreshAfterReturnRowsLoaded(order){renderSalesBranchFilter(),renderList(),
renderDetail(order||(window.DeliveryCore&&window.DeliveryCore.state?window.DeliveryCore.state.selectedOrder:null))}function paymentValueCell(order,key,className){
var value=amount(order,key),extraClass=className||"";return"debt"===key&&(extraClass+=(value=normalizeDebtAmount(value))>0?" debt-open":" debt-done"),
'<span class="mk-delivery-money '+esc(extraClass)+'" title="'+esc(money(value))+'">'+esc(money(value))+"</span>"}function renderList(){!function(){
var rows=getVisibleOrders(),sum=rows.reduce(function(acc,order){return acc.receivable+=amount(order,"receivable"),acc.cash+=amount(order,"cash"),acc.bank+=amount(order,"bank"),
acc.reward+=amount(order,"reward"),acc.returnAmount+=amount(order,"returnAmount"),acc.debt+=normalizeDebtAmount(amount(order,"debt")),acc},{receivable:0,cash:0,bank:0,reward:0,
returnAmount:0,debt:0});byId("deliveryKpiReceivable")&&(byId("deliveryKpiReceivable").textContent=money(sum.receivable)),
byId("deliveryKpiCash")&&(byId("deliveryKpiCash").textContent=money(sum.cash)),byId("deliveryKpiBank")&&(byId("deliveryKpiBank").textContent=money(sum.bank)),
byId("deliveryKpiReward")&&(byId("deliveryKpiReward").textContent=money(sum.reward)),byId("deliveryKpiReturn")&&(byId("deliveryKpiReturn").textContent=money(sum.returnAmount)),
byId("deliveryKpiDebt")&&(byId("deliveryKpiDebt").textContent=money(sum.debt)),byId("deliveryCoreCount")&&(byId("deliveryCoreCount").textContent=rows.length+" đơn")}()
;var list=byId("deliveryCoreList");if(list){var rows=getVisibleOrders();!function(rows){var keep={};(rows||[]).forEach(function(order){var key=accountingKey(order)
;key&&state.accountingSelectedKeys[key]&&isAccountingSelectable(order)&&(keep[key]=!0)}),state.accountingSelectedKeys=keep}(rows),keepSelectionVisible(),rows=getVisibleOrders(),
function(){var ids=Object.keys(state.accountingSelectedKeys||{}).filter(function(key){return state.accountingSelectedKeys[key]
}),bulk=byId("deliveryBulkAccountingButton"),all=byId("deliverySelectAllAccounting")
;if(bulk&&(bulk.textContent=ids.length?"Xác nhận kế toán đã chọn ("+ids.length+")":"Xác nhận kế toán đã chọn"),all){
var eligible=getVisibleOrders().filter(isAccountingSelectable),selectedCount=eligible.filter(function(order){return state.accountingSelectedKeys[accountingKey(order)]}).length
;all.textContent=eligible.length&&selectedCount===eligible.length?"Bỏ chọn tất cả":"Chọn tất cả"}}(),rows.length?(list.innerHTML=rows.map(function(order){
var key=orderKey(order),selected=key===state.selectedKey?" selected":"",accKey=accountingKey(order),accountingSelected=accKey&&state.accountingSelectedKeys[accKey],accountingLocked=isAccountingConfirmed(order),accountingNeedsReconfirm=isAccountingReopenPending(order),orderCode=(isAccountingSelectable(order),
normalizeDebtAmount(amount(order,"debt")),
order.orderCode||order.salesOrderCode||order.code||order.id||""),customerLabel=(order.customerName||"")+(order.customerCode?" · "+order.customerCode:"")
;return order.salesStaffName||order.salesStaffCode,order.deliveryStaffName||order.deliveryStaffCode,
'<button type="button" class="mk-delivery-order-row mk-delivery-list-grid'+selected+'" data-key="'+esc(key)+'"><span class="mk-delivery-check mk-delivery-accounting-check" data-accounting-key="'+esc(accKey)+'" title="Chọn để xác nhận kế toán">'+(accountingLocked||accountingSelected?"✓":accountingNeedsReconfirm?"!":"")+'</span><span class="mk-delivery-order-main"><strong>'+esc(orderCode)+"</strong><span>"+esc(customerLabel||"Chưa có khách hàng")+"</span><em>"+esc("")+"</em>"+function(order){
return order&&order.staffAssignment,""
}(order)+"</span>"+paymentValueCell(order,"receivable","cell-pt")+paymentValueCell(order,"cash","cell-tm")+paymentValueCell(order,"bank","cell-ck")+paymentValueCell(order,"reward","cell-th")+paymentValueCell(order,"returnAmount","cell-ht")+paymentValueCell(order,"debt","cell-cn")+"</button>"
}).join(""),list.querySelectorAll("[data-accounting-key]").forEach(function(node){node.addEventListener("click",function(event){event.preventDefault(),event.stopPropagation()
;var accKey=node.getAttribute("data-accounting-key");if(accKey){var order=(window.DeliveryCore.state.orders||[]).find(function(row){return accountingKey(row)===accKey})
;!order||isAccountingSelectable(order)?(state.accountingSelectedKeys[accKey]?delete state.accountingSelectedKeys[accKey]:state.accountingSelectedKeys[accKey]=!0,
renderList()):message(isDelivered(order)?"Đơn này đã xác nhận kế toán, không cần chọn lại":"Đơn chưa giao, chưa thể xác nhận kế toán")}})}),
list.querySelectorAll("[data-key]").forEach(function(button){button.addEventListener("click",function(){select(button.getAttribute("data-key"))})
})):list.innerHTML='<div class="empty-state">Không có đơn giao theo bộ lọc.</div>'}}function renderDetail(order){var detail=byId("deliveryCoreDetail");if(detail)if(order){
"summary"===state.activeTab&&(state.activeTab="payment");var items=Array.isArray(order.items)?order.items:[]
;detail.innerHTML='<div class="delivery-v46-detail-head"><div><h3>'+esc(order.orderCode)+"</h3><p>"+esc(order.customerName)+" · "+esc(order.customerCode)+"</p></div>"+function(order){
var delivered=isDelivered(order),posted=isAccountingConfirmed(order),needReconfirm=isAccountingReopenPending(order),html='<div class="delivery-v46-detail-actions">'
;return delivered?needReconfirm?(html+='<button id="deliveryAccountingButton" type="button" class="primary">Xác nhận kế toán lại</button>',
html+='<span class="delivery-accounting-status warn">Chờ xác nhận lại</span>'):posted?(html+='<button type="button" class="secondary muted-locked" disabled>Đã xác nhận kế toán</button>',
html+='<button id="deliveryAccountingUnlockButton" type="button" class="danger">Mở khóa kế toán</button>'):html+='<button id="deliveryAccountingButton" type="button" class="primary">Xác nhận kế toán</button>':html+='<button id="deliveryConfirmButton" type="button" class="success">Xác nhận giao</button>',
html+"</div>"}(order)+"</div>"+function(order){var check=order&&order.staffAssignment;if(!check)return"";function line(item){
return'<div class="delivery-v46-staff-check-line '+((item=item||{}).ok?"ok":"warn")+'"><b>'+esc(item.label||"")+"</b><span>Đơn: "+esc([item.assignedCode,item.assignedName].filter(Boolean).join(" - ")||"thiếu")+"</span><span>Hệ thống: "+esc([item.systemCode,item.systemName].filter(Boolean).join(" - ")||"không tìm thấy")+"</span><em>"+esc(item.message||"")+"</em></div>"
}return'<div class="delivery-v46-staff-check-box"><h4>Kiểm tra nhân viên theo Hệ thống</h4>'+line(check.sales)+line(check.delivery)+"</div>"
}(order)+'<div class="delivery-v46-tabs"><button type="button" data-delivery-detail-tab="products" class="'+("products"===state.activeTab?"active":"")+'">Sản phẩm giao</button><button type="button" data-delivery-detail-tab="returns" class="'+("returns"===state.activeTab?"active":"")+'">Hàng trả</button><button type="button" data-delivery-detail-tab="payment" class="'+("payment"===state.activeTab?"active":"")+'">Thu tiền & Tổng kết</button></div><div class="delivery-v46-tab-body">'+("returns"===state.activeTab?function(order){
var rows=returnsForOrder(order)
;return rows.length?'<form id="deliveryReturnUpdateForm"><div class="delivery-v46-return-list-title"><b>Hàng trả đã lưu trong returnOrders</b><span>Tổng: '+money(rows.reduce(function(sum,row){
return sum+num(row.amount)
},0))+'</span></div><div class="delivery-v46-return-table delivery-v46-return-table-compact"><div class="delivery-v46-return-head"><span>Đơn / Khách</span><span>Sản phẩm</span><span>SL trả</span><span>Thành tiền</span></div>'+rows.map(function(row,idx){
var orderLabel=row.salesOrderCode||row.orderCode||row.returnOrderCode||"",customerLabel=row.customerName||row.customerCode||"",lineAmount=num(row.amount||row.returnAmount||num(row.returnQty)*num(row.price))
;return'<div class="delivery-v46-return-row"><span class="delivery-v46-return-order"><b>'+esc(orderLabel)+"</b><small>"+esc(customerLabel)+'</small></span><span class="delivery-v46-return-product"><b>'+esc(row.productCode)+"</b><small>"+esc(row.productName)+"</small>"+hidden(idx,"productCode",row.productCode)+hidden(idx,"productName",row.productName)+hidden(idx,"price",row.price)+'</span><span class="delivery-v46-return-qty"><input data-return-field="returnQty" data-idx="'+idx+'" type="number" min="0" step="1" value="'+esc(row.returnQty)+'"></span><span class="delivery-v46-return-amount"><b>'+money(lineAmount)+"</b><small>Giá "+money(row.price)+"</small></span></div>"
}).join("")+'</div><div class="delivery-v46-actions"><button type="submit">Cập nhật hàng trả</button><button type="button" id="deliveryBackProductsButton" class="secondary">Sửa từ sản phẩm giao</button></div></form>':'<div class="empty-state">Đơn này chưa có phiếu trả trong returnOrders. Nhập SL trả ở tab Sản phẩm giao rồi bấm Lưu hàng trả.</div>'
}(order):"payment"===state.activeTab?function(order){
var r=order&&order.reconciliation||{},debtForStatus=normalizeDebtAmount(amount(order,"debt")),cls=!1===r.balanced||debtForStatus>0?" danger-text":" success-text",msg=r.message||(debtForStatus>0?"Còn công nợ":"Đã thu đủ"),returnAmount=returnAmountFromReturnOrders(order),accountingLocked=isAccountingConfirmed(order)&&!isAccountingReopenPending(order),disabledAttr=accountingLocked?" disabled":""
;return'<div class="delivery-v46-payment-summary-tab"><form id="deliveryPaymentForm" class="delivery-v46-payment-form"><h4>Thu tiền</h4>'+(accountingLocked?'<div class="delivery-v46-locked-note danger-text">Đơn đã xác nhận kế toán. Muốn sửa tiền cần mở khóa admin trước.</div>':"")+'<label>Tiền mặt<input name="cash" type="number" min="0" value="'+esc(baseAmount(order,"cash"))+'"'+disabledAttr+'></label><label>Chuyển khoản<input name="bank" type="number" min="0" value="'+esc(baseAmount(order,"bank"))+'"'+disabledAttr+'></label><label>Trả thưởng<input name="reward" type="number" min="0" value="'+esc(baseAmount(order,"reward"))+'"'+disabledAttr+'></label><button type="submit"'+disabledAttr+'>Lưu thu tiền</button></form><section class="delivery-v46-summary-box"><h4>Tổng kết đơn</h4><div class="delivery-v46-reconcile'+cls+'"><b>'+esc(msg)+'</b></div><div class="delivery-v46-summary-grid"><div><span>Phải thu</span><b>'+money(baseAmount(order,"receivable"))+"</b></div><div><span>Tiền mặt</span><b>"+money(baseAmount(order,"cash"))+"</b></div><div><span>Chuyển khoản</span><b>"+money(baseAmount(order,"bank"))+"</b></div><div><span>Trả thưởng</span><b>"+money(baseAmount(order,"reward"))+'</b></div><div class="returnorders-source"><span>Hàng trả</span><b>'+money(returnAmount)+"</b><small>Nguồn: returnOrders</small></div><div><span>Còn nợ</span><b>"+money(normalizeDebtAmount(amount(order,"debt")))+"</b></div></div></section></div>"
}(order):function(items){
return'<form id="deliveryReturnForm"><div class="delivery-v46-return-scroll"><div class="delivery-v46-product-head"><span>Sản phẩm</span><span>SL giao</span><span>Giá</span><span>SL trả</span></div>'+items.map(function(item,idx){
var code=item.productCode||item.code||item.productId||"",name=item.productName||item.name||"",qty=num(item.quantity||item.deliveredQty||item.qty||item.orderQty||item.soldQty),price=num(item.price||item.salePrice||item.unitPrice||item.finalPrice),returnQty=num(item.returnQty||item.qtyReturn||item.returnQuantity||item.returnedQty)
;return'<div class="delivery-v46-product-row"><div><b>'+esc(code)+"</b><small>"+esc(name)+"</small>"+hidden(idx,"productCode",code)+hidden(idx,"productName",name)+hidden(idx,"price",price)+"</div><span>"+money(qty)+"</span><span>"+money(price)+'</span><input data-return-field="returnQty" data-idx="'+idx+'" type="number" min="0" step="1" value="'+esc(returnQty)+'"></div>'
}).join("")+'</div><div class="delivery-v46-actions"><button type="submit">Lưu hàng trả</button><button type="button" id="deliveryClearReturnButton" class="secondary">Xóa hàng trả</button></div></form>'
}(items))+"</div>",detail.querySelectorAll("[data-delivery-detail-tab]").forEach(function(button){button.addEventListener("click",function(){
state.activeTab=button.getAttribute("data-delivery-detail-tab"),renderDetail(order)})}),
byId("deliveryReturnForm")&&byId("deliveryReturnForm").addEventListener("submit",saveReturn),
byId("deliveryReturnUpdateForm")&&byId("deliveryReturnUpdateForm").addEventListener("submit",saveReturn),
byId("deliveryBackProductsButton")&&byId("deliveryBackProductsButton").addEventListener("click",function(){state.activeTab="products",renderDetail(order)}),
byId("deliveryPaymentForm")&&byId("deliveryPaymentForm").addEventListener("submit",savePayment),
byId("deliveryClearReturnButton")&&byId("deliveryClearReturnButton").addEventListener("click",function(){saveReturn({preventDefault:function(){},forceZero:!0})}),
byId("deliveryConfirmButton")&&byId("deliveryConfirmButton").addEventListener("click",confirmDelivery),
byId("deliveryAccountingButton")&&byId("deliveryAccountingButton").addEventListener("click",function(){!async function(order){if(order&&window.DeliveryCore){
var key=accountingKey(order);if(key)if(isAccountingSelectable(order)){if(confirm(isAccountingReopenPending(order)?"Xác nhận kế toán lại đơn này?":"Xác nhận kế toán đơn này?"))try{
message("Đang xác nhận kế toán...");var json=await window.DeliveryCore.confirmAccounting([key],filters());delete state.accountingSelectedKeys[key],
message(json.message||"Đã xác nhận kế toán"),await load()}catch(err){message(err.message||"Không xác nhận kế toán được",!0)}
}else message(isDelivered(order)?"Đơn này đã xác nhận kế toán":"Đơn chưa giao, chưa thể xác nhận kế toán");else message("Không xác định được mã đơn để xác nhận kế toán",!0)}
}(order)}),byId("deliveryAccountingUnlockButton")&&byId("deliveryAccountingUnlockButton").addEventListener("click",function(){!async function(order){if(order&&window.DeliveryCore){
var key=accountingKey(order);if(key)if(isDelivered(order)&&isAccountingConfirmed(order)&&!isAccountingReopenPending(order)){var reason=prompt("Nhập lý do mở khóa kế toán:")
;if(reason&&reason.trim()){if(confirm("Mở khóa kế toán đơn này? Sau khi sửa tiền cần xác nhận kế toán lại."))try{message("Đang mở khóa kế toán..."),
message((await window.DeliveryCore.adminUnlockAccounting(key,reason.trim())).message||"Đã mở khóa kế toán"),await load()}catch(err){
message(err.message||"Không mở khóa kế toán được",!0)}}else message("Cần nhập lý do mở khóa kế toán",!0)
}else message("Chỉ mở khóa được đơn đã giao và đã xác nhận kế toán",!0);else message("Không xác định được mã đơn để mở khóa kế toán",!0)}}(order)})
}else detail.innerHTML='<div class="delivery-v46-detail-empty">Chọn đơn bên trái để xem chi tiết.</div>'}function hidden(idx,field,value){
return'<input type="hidden" data-return-field="'+esc(field)+'" data-idx="'+idx+'" value="'+esc(value)+'">'}function cleanReturnCode(value){
return String(null==value?"":value).trim().replace(/^RO[-_]?/i,"")}function returnsForOrder(order){
var ids=[(order=order||{}).orderId,order.salesOrderId,order.id,order._id].map(String).filter(function(v){return v&&"undefined"!==v&&"null"!==v
}),codes=[order.orderCode,order.salesOrderCode,order.code,order.displayOrderCode].map(cleanReturnCode).filter(Boolean)
;return(window.DeliveryCore.state.returns||[]).filter(function(row){
var rowIds=[row.salesOrderId,row.orderId,row.sourceOrderId,row.deliveryOrderId].map(String),rowCodes=[row.salesOrderCode,row.orderCode,row.sourceOrderCode,row.deliveryOrderCode,row.returnOrderCode].map(cleanReturnCode)
;return ids.some(function(id){return rowIds.indexOf(id)>=0})||codes.some(function(code){return rowCodes.indexOf(code)>=0})})}async function saveReturn(event){
event&&event.preventDefault&&event.preventDefault();var forceZero=event&&event.forceZero||event&&event.submitter&&"deliveryClearReturnButton"===event.submitter.id;try{
message("Đang lưu hàng trả...");var json=await window.DeliveryCore.saveReturn(window.DeliveryCore.state.selectedOrder,function(forceZero){var byIdx={}
;return document.querySelectorAll("[data-return-field]").forEach(function(input){var idx=input.getAttribute("data-idx"),field=input.getAttribute("data-return-field")
;byIdx[idx]=byIdx[idx]||{},byIdx[idx][field]="returnQty"===field&&forceZero?0:input.value}),Object.keys(byIdx).map(function(idx){return byIdx[idx]})}(forceZero))
;message(json.message||"Đã lưu hàng trả vào returnOrders"),state.selectedKey=orderKey(window.DeliveryCore.state.selectedOrder),state.activeTab=forceZero?"products":"returns",
refreshAfterReturnRowsLoaded(window.DeliveryCore.state.selectedOrder)}catch(err){message(err.message,!0)}}async function savePayment(event){
event&&event.preventDefault&&event.preventDefault();var selectedOrder=window.DeliveryCore&&window.DeliveryCore.state?window.DeliveryCore.state.selectedOrder:null
;if(!isAccountingConfirmed(selectedOrder)||isAccountingReopenPending(selectedOrder)){var form=new FormData(event.target);try{message("Đang lưu thu tiền..."),
message((await window.DeliveryCore.savePayment(window.DeliveryCore.state.selectedOrder,{cash:form.get("cash"),bank:form.get("bank"),reward:form.get("reward")
})).message||"Đã lưu thu tiền"),state.selectedKey=orderKey(window.DeliveryCore.state.selectedOrder),renderList(),renderDetail(window.DeliveryCore.state.selectedOrder)}catch(err){
message(err.message,!0)}}else message("Đơn đã xác nhận kế toán, cần mở khóa admin trước khi sửa tiền",!0)}async function confirmDelivery(){try{message("Đang xác nhận giao..."),
message((await window.DeliveryCore.confirmDelivery(window.DeliveryCore.state.selectedOrder,{deliveryStatus:"delivered"})).message||"Đã xác nhận giao"),
state.selectedKey=orderKey(window.DeliveryCore.state.selectedOrder),renderList(),renderDetail(window.DeliveryCore.state.selectedOrder)}catch(err){message(err.message,!0)}}
function toggleSelectAllAccounting(){var rows=getVisibleOrders().filter(isAccountingSelectable),allSelected=rows.length&&rows.every(function(order){
return state.accountingSelectedKeys[accountingKey(order)]});rows.forEach(function(order){var key=accountingKey(order)
;allSelected?delete state.accountingSelectedKeys[key]:state.accountingSelectedKeys[key]=!0}),renderList()}async function confirmSelectedAccounting(){
var ids=getVisibleOrders().filter(function(order){var key=accountingKey(order);return key&&state.accountingSelectedKeys[key]&&isAccountingSelectable(order)}).map(accountingKey)
;if(ids.length){if(confirm("Xác nhận kế toán "+ids.length+" đơn đã chọn?"))try{message("Đang xác nhận kế toán "+ids.length+" đơn...")
;var json=await window.DeliveryCore.confirmAccounting(ids,filters());state.accountingSelectedKeys={},message(json.message||"Đã xác nhận kế toán các đơn đã chọn"),await load()
}catch(err){message(err.message||"Không xác nhận kế toán được các đơn đã chọn",!0)}}else message("Vui lòng chọn ít nhất 1 đơn hợp lệ để xác nhận kế toán",!0)}
async function select(key){state.selectedKey=key;var order=window.DeliveryCore.selectOrder(key);if(renderList(),renderDetail(order),
order&&window.DeliveryCore&&"function"==typeof window.DeliveryCore.loadReturnsForOrder)try{await window.DeliveryCore.loadReturnsForOrder(order),refreshAfterReturnRowsLoaded(order)
}catch(e){console.error("loadReturnsForOrder failed",e)}}async function load(){if(window.DeliveryCore){byId("deliveryCoreList")||renderShell();var list=byId("deliveryCoreList")
;list&&(list.innerHTML='<div class="empty-state">Đang tải...</div>');try{var f=filters()
;if(!(f.q||f.salesStaffCode||f.deliveryStaffCode||f.status))return void(list&&(list.innerHTML='<div class="empty-state">Vui lòng nhập mã đơn, khách hàng, NVGH/NVBH hoặc chọn bộ lọc để tải dữ liệu.</div>'))
;await window.DeliveryCore.loadOrders(f),renderSalesBranchFilter(),window.DeliveryCore.state.returns=[],window.DeliveryCore.state.returnsLoaded=!1,
window.DeliveryCore.state.returnsLoadedByOrder={};var visibleRows=getVisibleOrders();!state.selectedKey&&visibleRows[0]&&(state.selectedKey=orderKey(visibleRows[0])),
state.selectedKey&&window.DeliveryCore.selectOrder(state.selectedKey),keepSelectionVisible(),renderList(),renderDetail(window.DeliveryCore.state.selectedOrder),message(""),
window.DeliveryCore.state.selectedOrder&&"function"==typeof window.DeliveryCore.loadReturnsForOrder&&window.DeliveryCore.loadReturnsForOrder(window.DeliveryCore.state.selectedOrder).then(function(){
refreshAfterReturnRowsLoaded(window.DeliveryCore.state.selectedOrder)}).catch(function(err){console.error("load selected returnOrders failed",err)})}catch(err){
list&&(list.innerHTML='<div class="empty-state danger-text">'+esc(err.message)+"</div>"),message(err.message,!0)}}}window.DeliveryWebView={load:load,select:select,
renderShell:renderShell},window.loadDeliveryTodayOrders=function(){return load()},window.loadDeliveryToday=function(){return load()},window.submitDeliveryEdit=function(event){
return saveReturn(event)},window.clearDeliveryEditPanel=function(){renderDetail(null)},window.recalcDeliveryEditDebt=function(){},window.renderDeliveryEditPanel=function(){
renderDetail(window.DeliveryCore&&window.DeliveryCore.state.selectedOrder)},window.selectDeliveryOrder=function(key){return select(key)},
document.addEventListener("DOMContentLoaded",function(){renderShell(),byId("deliveryTodayTab")&&byId("deliveryTodayTab").classList.contains("active")&&load()})}();
