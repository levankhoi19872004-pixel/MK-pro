/* GENERATED FILE - DO NOT EDIT.
 * Canonical source: public/mobile/js/delivery-mobile-view.source.js
 * Build: npm run build:source-bundles
 */
!function(){"use strict";var deliveryMobileState=window.DeliveryMobileState,deliveryMobileUi=window.DeliveryMobileUiUtils,deliveryOrdersView=window.DeliveryMobileOrdersView
;if(!deliveryMobileState||!deliveryMobileUi||!deliveryOrdersView)throw new Error("Delivery mobile modules are not loaded.")
;var el=deliveryMobileUi.el,esc=deliveryMobileUi.esc,num=deliveryMobileUi.num,money=deliveryMobileUi.money,amount=deliveryMobileUi.amount,keyOf=deliveryMobileUi.keyOf,today=deliveryMobileUi.today,readUser=deliveryMobileUi.readUser,userDisplayName=deliveryMobileUi.userDisplayName,userStaffCode=deliveryMobileUi.userStaffCode,userRoleLabel=deliveryMobileUi.userRoleLabel,selectedOrderSummary=deliveryMobileUi.selectedOrderSummary,phoneHref=deliveryMobileUi.phoneHref,copyText=(deliveryMobileUi.mapHref,
deliveryMobileUi.copyText),debounce=deliveryMobileUi.debounce,msg=deliveryMobileUi.msg,buildRouteKpi=(deliveryOrdersView.buildOrderKpi,
deliveryOrdersView.buildRouteKpi),mobileUiRuntime=window.MobileUiRuntime||null,deliveryLifecycle=mobileUiRuntime?mobileUiRuntime.createLifecycle():null,deliveryLoadGate=mobileUiRuntime?mobileUiRuntime.createRequestGate():null,deliveryOrderRenderer=null,deliveryDebtRenderer=null,deliveryDebtRendererContainer=null,DELIVERY_TAB_CACHE_TTL_MS=deliveryMobileState.DELIVERY_TAB_CACHE_TTL_MS,DELIVERY_REFRESH_THROTTLE_MS=deliveryMobileState.DELIVERY_REFRESH_THROTTLE_MS,DELIVERY_DEBT_PAGE_LIMIT=deliveryMobileState.DELIVERY_DEBT_PAGE_LIMIT,state=deliveryMobileState.createInitialState()
;function logout(){["mk_web_token","mk_web_refresh_token","mk_web_user","v43_mobile_token","v43_mobile_refresh_token","v43_mobile_user"].forEach(function(key){
localStorage.removeItem(key)}),fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"X-Requested-With":"XMLHttpRequest"}
}).catch(function(){}).finally(function(){window.location.href="/login.html"})}function renderShell(){
var r,user=readUser(),displayName=userDisplayName(user),staffCode=userStaffCode(user),accountText=displayName?displayName+(staffCode&&staffCode!==displayName?" - "+staffCode:""):"Chưa xác định tài khoản"
;(r=el("mobileDeliveryRoot"),r||((r=document.createElement("main")).id="mobileDeliveryRoot",document.body.innerHTML="",document.body.appendChild(r)),
r.className="mobile-delivery-v46",
r).innerHTML='<header class="m-delivery-header m-delivery-header-compact"><div class="m-delivery-title-block"><h1>Giao hàng hôm nay</h1><div class="m-account-info"><b>NVGH: '+esc(accountText)+"</b><span>"+esc(userRoleLabel(user))+'</span></div></div><div class="m-delivery-header-actions"><button id="mReload" type="button">Tải</button><details class="m-delivery-more"><summary aria-label="Mở menu phụ">⋮</summary><div class="m-delivery-more-menu"><button type="button" data-m-menu-tab="products">Sản phẩm đơn</button><button type="button" data-m-menu-tab="reconciliation">Đối soát ngày</button><button id="mLogout" type="button">Đăng xuất</button></div></details></div></header><section class="m-delivery-filter m-delivery-filter-compact"><input id="mDate" type="date"><select id="mStatusFilter"><option value="all">Tất cả</option><option value="pending" selected>Chưa giao</option><option value="delivered">Đã giao</option><option value="return">Trả hàng</option><option value="debt">Công nợ</option></select><input id="mSearch" type="search" placeholder="Tìm khách / mã đơn / SĐT"></section><section class="m-delivery-kpis m-delivery-kpis-compact" aria-label="Tóm tắt tuyến giao hàng"><div><span title="Tổng số đơn trong tuyến">Tổng đơn</span><b id="mKpiTotalOrders">0</b></div><div><span title="Số đơn chưa giao">Chưa giao</span><b id="mKpiPendingOrders">0</b></div><div><span title="Số đơn đã giao">Đã giao</span><b id="mKpiDeliveredOrders">0</b></div><div><span title="Tổng tiền còn phải thu">Phải thu</span><b id="mKpiPt">0</b></div></section><nav class="m-delivery-tabs m-delivery-tabs-main" aria-label="Chức năng chính app giao hàng"><button data-m-tab="orders" class="active">Đơn giao</button><button data-m-tab="payment">Thu tiền</button><button data-m-tab="returns">Hàng trả</button><button data-m-tab="debt">Công nợ</button></nav><section id="mBody" class="m-delivery-body">Đang tải...</section><section id="mBottomAction" class="m-delivery-bottom-action" aria-live="polite"></section><p id="mMsg" class="m-delivery-msg"></p>',
el("mDate").value=today(),deliveryOrderRenderer=mobileUiRuntime?mobileUiRuntime.createChunkedHtmlRenderer(el("mBody"),{initialCount:60,chunkSize:80}):null
;var bind=deliveryLifecycle?deliveryLifecycle.listen:function(target,type,handler){return target.addEventListener(type,handler),function(){target.removeEventListener(type,handler)}
};bind(el("mReload"),"click",function(){load({force:!0,refreshActiveTab:!0})}),bind(el("mLogout"),"click",logout),bind(el("mDate"),"change",function(){load({force:!0})}),
bind(el("mStatusFilter"),"change",function(){load({force:!0})});var debouncedSearch=mobileUiRuntime?mobileUiRuntime.debounce(function(){load({force:!0})},250):debounce(function(){
load({force:!0})},250);bind(el("mSearch"),"input",debouncedSearch),deliveryLifecycle&&deliveryLifecycle.add(function(){debouncedSearch.cancel&&debouncedSearch.cancel()}),
document.querySelectorAll("[data-m-tab]").forEach(function(button){bind(button,"click",function(){switchTab(button.getAttribute("data-m-tab"))})}),
document.querySelectorAll("[data-m-menu-tab]").forEach(function(button){bind(button,"click",function(){var menu=button.closest("details");menu&&(menu.open=!1),
switchTab(button.getAttribute("data-m-menu-tab"))})}),deliveryLifecycle&&(deliveryLifecycle.delegate(el("mBody"),"click","[data-order-key]",function(_event,button){
select(button.getAttribute("data-order-key"))}),deliveryLifecycle.delegate(el("mBody"),"click","[data-copy-address]",function(event,button){event.preventDefault(),
event.stopPropagation(),copyText(button.getAttribute("data-copy-address")).then(function(){msg("Đã copy địa chỉ khách hàng")}).catch(function(err){
msg(err.message||"Không copy được địa chỉ",!0)})}),deliveryLifecycle.delegate(el("mBody"),"click","[data-order-pay]",function(event,button){event.preventDefault(),
event.stopPropagation(),goToOrderAction(button.getAttribute("data-order-pay"),"payment")}),
deliveryLifecycle.delegate(el("mBody"),"click","[data-order-confirm]",function(event,button){event.preventDefault(),event.stopPropagation(),
goToOrderAction(button.getAttribute("data-order-confirm"),"confirm")}),deliveryLifecycle.delegate(el("mBody"),"click","[data-debt-index]:not([disabled])",function(_event,button){
!function(index){var customer=(state.debts||[])[index];if(customer&&!(debtAvailableValue(customer)<=0)){var nextKey=deliveryDebtCustomerKey(customer)
;if(state.selectedDebtKey!==nextKey){
if(!state.debtFormDirty||!state.selectedDebtKey||state.selectedDebtKey===nextKey||window.confirm("Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.")){
state.debtListScrollTop=window.scrollY||document.documentElement.scrollTop||0,state.selectedDebtIndex=index,state.selectedDebtKey=nextKey,state.debtFormDirty=!1,
state.debtSubtab="collect",render();var body=el("mBody");body&&body.scrollIntoView({block:"start",behavior:"smooth"})}}else setDeliveryDebtSubtab("collect")}
}(Number(button.getAttribute("data-debt-index")))}),deliveryLifecycle.listen(window,"pagehide",function(){deliveryOrderRenderer&&deliveryOrderRenderer.cancel(),
deliveryDebtRenderer&&deliveryDebtRenderer.cancel(),deliveryLoadGate.cancel(),deliveryLifecycle.destroy()},{once:!0}))}function switchTab(nextTab){
nextTab&&("debt"===state.tab&&"debt"!==nextTab&&state.debtFormDirty&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Rời Công nợ sẽ xóa dữ liệu đang nhập.")||("debt"===state.tab&&"debt"!==nextTab&&(state.debtFormDirty=!1),
state.tab=nextTab,render(),"returns"===state.tab&&loadSelectedReturnsDirect({force:!1}),"debt"===state.tab&&loadDeliveryDebts(!1),
"reconciliation"===state.tab&&loadDeliveryReconciliation(!1)))}function goToOrderAction(orderKey,action){orderKey&&(state.selectedKey=orderKey,
window.DeliveryCore.selectOrder(orderKey)),"payment"!==action?"returns"!==action?"products"!==action?"confirm"===action&&async function(){try{msg("Đang xác nhận giao..."),
await window.DeliveryCore.confirmDelivery(currentOrder(),{deliveryStatus:"delivered"}),msg("Đã xác nhận giao"),state.selectedKey=keyOf(window.DeliveryCore.state.selectedOrder),
state.tab="orders",render()}catch(err){msg(err.message,!0)}}():switchTab("products"):switchTab("returns"):switchTab("payment")}function selectedReturnCacheKey(order){
return keyOf(order||currentOrder()||{})}function filters(){return{date:el("mDate")&&el("mDate").value,q:el("mSearch")&&el("mSearch").value,
statusFilter:el("mStatusFilter")&&el("mStatusFilter").value}}function render(){var rows,s;rows=window.DeliveryCore.state.orders||[],s=buildRouteKpi(rows),
el("mKpiTotalOrders")&&(el("mKpiTotalOrders").textContent=String(s.totalOrders||0)),el("mKpiPendingOrders")&&(el("mKpiPendingOrders").textContent=String(s.pendingOrders||0)),
el("mKpiDeliveredOrders")&&(el("mKpiDeliveredOrders").textContent=String(s.deliveredOrders||0)),el("mKpiPt")&&(el("mKpiPt").textContent=money(s.pt)),
document.querySelectorAll("[data-m-tab]").forEach(function(button){button.classList.toggle("active",button.getAttribute("data-m-tab")===state.tab)}),function(){
var node=el("mBottomAction");if(node){var order=currentOrder();if(!order||"orders"!==state.tab)return node.innerHTML="",void(node.className="m-delivery-bottom-action")
;var key=keyOf(order),phone=deliveryMobileUi.orderPhone(order),call=phoneHref(phone);node.className="m-delivery-bottom-action active",
node.innerHTML="<div><b>"+esc(order.customerName||order.customerCode||"Khách hàng")+"</b><span>"+money(amount(order,"receivable"))+"</span></div>"+(call?'<a href="'+esc(call)+'">Gọi</a>':'<button type="button" disabled>Gọi</button>')+'<button type="button" data-bottom-pay="'+esc(key)+'">Thu tiền</button><button type="button" data-bottom-return="'+esc(key)+'">Trả hàng</button>'
;var pay=node.querySelector("[data-bottom-pay]"),ret=node.querySelector("[data-bottom-return]");pay&&pay.addEventListener("click",function(){goToOrderAction(key,"payment")}),
ret&&ret.addEventListener("click",function(){goToOrderAction(key,"returns")})}}();var body=el("mBody")
;if(body)return"orders"!==state.tab&&deliveryOrderRenderer&&deliveryOrderRenderer.cancel(),"debt"!==state.tab&&deliveryDebtRenderer&&deliveryDebtRenderer.cancel(),
"products"===state.tab?function(body){var order=currentOrder();if(order){var items=Array.isArray(order.items)?order.items:[]
;body.innerHTML=selectedOrderSummary(order)+'<form id="mReturnForm"><div class="m-return-scroll">'+items.map(function(it,idx){
var code=it.productCode||it.code||it.productId||"",name=it.productName||it.name||"",price=num(it.unitPrice||it.price||it.salePrice||it.finalPrice),qty=num(it.quantity||it.deliveredQty||it.qty||it.orderQty||it.soldQty),rqty=num(it.returnQty||it.qtyReturn||it.returnQuantity||it.returnedQty)
;return'<div class="m-product-row"><div><b>'+esc(code)+"</b><small>"+esc(name)+"</small><em>SL giao "+money(qty)+" · Giá cố định "+money(price)+"</em>"+hidden(idx,"productCode",code)+hidden(idx,"productName",name)+hidden(idx,"price",price)+'</div><input data-m-return-field="returnQty" data-idx="'+idx+'" type="number" min="0" step="1" value="'+esc(rqty)+'"></div>'
}).join("")+'</div><div class="m-action-row"><button type="submit">Lưu hàng trả</button><button id="mClearReturn" type="button" class="secondary">Bỏ qua hàng trả</button></div></form>',
el("mReturnForm").addEventListener("submit",saveReturn),el("mClearReturn").addEventListener("click",function(){
window.confirm("Bỏ qua hàng trả sẽ ghi số lượng trả về 0 cho đơn này. Bạn chắc chắn muốn tiếp tục?")&&saveReturn({preventDefault:function(){},forceZero:!0})})
}else body.innerHTML='<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'}(body):"returns"===state.tab?function(body){var order=currentOrder();if(order){
var rows=returnsForOrder(order);return!rows.length&&Array.isArray(order.returnItems)&&order.returnItems.length&&(rows=order.returnItems.map(function(item){
return Object.assign({},item,{salesOrderId:order.salesOrderId,salesOrderCode:order.salesOrderCode,orderId:order.orderId,orderCode:order.orderCode,customerCode:order.customerCode,
customerName:order.customerName})
})),!rows.length&&amount(order,"returnAmount")>0?(body.innerHTML=selectedOrderSummary(order)+'<div class="m-empty">Đơn có tiền hàng trả '+money(amount(order,"returnAmount"))+' nhưng app chưa lấy được dòng sản phẩm. Bấm Tải lại hàng trả để gọi trực tiếp returnOrders.</div><div class="m-action-row"><button id="mReloadReturns" type="button">Tải lại hàng trả</button></div>',
void el("mReloadReturns").addEventListener("click",loadSelectedReturnsDirect)):rows.length?(body.innerHTML=selectedOrderSummary(order)+'<form id="mReturnSaveForm"><div class="m-return-scroll">'+rows.map(function(it,idx){
var amount=num(it.returnQty)*num(it.price)
;return'<div class="m-product-row"><div><b>'+esc(it.productCode)+"</b><small>"+esc(it.productName)+"</small><em>Giá cố định "+money(it.price)+" · Thành tiền "+money(amount)+"</em>"+hidden(idx,"productCode",it.productCode)+hidden(idx,"productName",it.productName)+hidden(idx,"price",it.price)+'</div><input data-m-return-field="returnQty" data-idx="'+idx+'" type="number" min="0" step="1" value="'+esc(it.returnQty)+'"></div>'
}).join("")+'</div><div class="m-action-row"><button type="submit">Cập nhật hàng trả</button><button id="mBackProducts" type="button" class="secondary">Sửa từ sản phẩm đơn</button></div></form>',
el("mReturnSaveForm").addEventListener("submit",saveReturn),void el("mBackProducts").addEventListener("click",function(){switchTab("products")
})):(body.innerHTML=selectedOrderSummary(order)+'<div class="m-empty">Chưa có hàng trả trong returnOrders. Nhập SL trả ở mục Sản phẩm đơn rồi bấm Lưu hàng trả hoặc bấm Bỏ qua hàng trả để sang Thu tiền.</div><div class="m-action-row"><button id="mGoProducts" type="button">Mở sản phẩm đơn</button><button id="mSkipReturns" type="button" class="secondary">Bỏ qua hàng trả</button></div>',
el("mGoProducts").addEventListener("click",function(){switchTab("products")}),void el("mSkipReturns").addEventListener("click",function(){state.tab="payment",render()}))}
body.innerHTML='<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'}(body):"payment"===state.tab?function(body){var order=currentOrder()
;order?(body.innerHTML=selectedOrderSummary(order)+'<form id="mPaymentForm" class="m-payment-form"><h3>Thu tiền đơn giao</h3><label>Tiền mặt<input name="cash" type="number" min="0" value="'+esc(amount(order,"cash"))+'"></label><label>Chuyển khoản<input name="bank" type="number" min="0" value="'+esc(amount(order,"bank"))+'"></label><label>Trả thưởng<input name="reward" type="number" min="0" value="'+esc(amount(order,"reward"))+'"></label><button type="submit" class="m-confirm">Lưu thu tiền & xác nhận giao</button></form>',
el("mPaymentForm").addEventListener("submit",savePayment)):body.innerHTML='<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'}(body):"debt"===state.tab?function(body){
var rows=state.debts||[],summary=state.debtSummary||{};if(!state.debtLoading||rows.length){
if(state.debtError&&!rows.length)return body.innerHTML='<div class="m-empty danger"><b>Không tải được công nợ</b><span>'+esc(state.debtError)+'</span><button id="mRetryDebt" type="button">Thử lại</button></div>',
void el("mRetryDebt").addEventListener("click",function(){state.debtError="",loadDeliveryDebts(!0)});var selected=state.selectedDebtKey&&(state.debts||[]).find(function(customer){
return deliveryDebtCustomerKey(customer)===state.selectedDebtKey})||null,customerTabActive="collect"!==state.debtSubtab
;body.innerHTML='<section class="m-debt-summary"><div><span>Tổng nợ</span><b>'+money(summary.totalDebt||0)+"</b></div><div><span>Chờ KT</span><b>"+money(summary.pendingCollected||summary.pendingCollectedAmount||0)+"</b></div><div><span>Có thể thu</span><b>"+money(summary.availableDebt||summary.availableDebtAmount||0)+"</b></div><div><span>Khách nợ</span><b>"+esc(summary.customerCount||rows.length)+'</b></div></section><div class="m-action-row m-debt-reload-row"><button id="mReloadDebt" type="button">Tải lại công nợ</button></div><div class="debt-subtabs m-debt-subtabs" role="tablist" aria-label="Nghiệp vụ công nợ"><button id="mDebtCustomersSubtab" type="button" class="debt-subtab'+(customerTabActive?" active":"")+'" role="tab" aria-selected="'+customerTabActive+'">Khách nợ</button><button id="mDebtCollectSubtab" type="button" class="debt-subtab'+(customerTabActive?"":" active")+'" role="tab" aria-selected="'+!customerTabActive+'">Thu nợ</button></div><section id="mDebtCustomersPanel" class="debt-subpanel'+(customerTabActive?" active":"")+'"><div class="debt-list-toolbar"><input id="mDebtCustomerSearch" type="search" value="'+esc(state.debtSearch)+'" placeholder="Tìm mã / tên / SĐT khách hàng" aria-label="Tìm khách hàng đang nợ"><select id="mDebtCustomerSort" aria-label="Sắp xếp danh sách công nợ"><option value="debt_desc"'+("debt_desc"===state.debtSort?" selected":"")+'>Nợ cao nhất</option><option value="available_desc"'+("available_desc"===state.debtSort?" selected":"")+'>Có thể thu cao nhất</option><option value="oldest_asc"'+("oldest_asc"===state.debtSort?" selected":"")+'>Nợ cũ nhất</option></select></div><div id="mDebtCustomerList" class="m-debt-list"></div><div id="mDebtPaging" class="m-debt-paging"></div></section><section id="mDebtCollectPanel" class="debt-subpanel'+(customerTabActive?"":" active")+'"><div id="mDebtDetailContainer" class="m-debt-detail">'+function(customer){
if(!customer)return'<div class="m-empty debt-empty-state"><b>Chưa chọn khách hàng để thu nợ</b><span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span><button id="mChooseDebtCustomer" type="button" class="m-debt-empty-action">Chọn khách hàng</button></div>'
;var orders=debtOrderRows(customer)
;if(!orders.length)return'<div class="m-selected-order"><b>'+esc(customer.customerCode||"")+" - "+esc(customer.customerName||"")+'</b></div><div class="m-empty">Khách hàng này không còn số tiền có thể thu hoặc đang chờ kế toán xác nhận.</div>'
;var rowsHtml=orders.map(function(order,index){var available=order.availableDebt;return null==available&&(available=order.debt),available=num(available||0),
'<label class="m-debt-order-row"><input type="checkbox" class="m-debt-order-check" data-index="'+index+'" checked><div><b>'+esc(order.salesOrderCode||order.orderCode||"")+"</b><small>Ngày: "+esc(order.orderDate||order.documentDate||"")+"</small><em>Nợ: "+money(order.debt||0)+" · Chờ KT: "+money(order.pendingCollectedAmount||0)+" · Có thể thu: "+money(available)+"</em></div></label>"
}).join("")
;return'<div class="m-selected-order"><b>'+esc(customer.customerCode||"")+" - "+esc(customer.customerName||"")+"</b><span>Nợ: "+money(debtMoneyValue(customer))+" · Chờ KT: "+money(debtPendingValue(customer))+" · Có thể thu: "+money(debtAvailableValue(customer))+'</span></div><form id="mDeliveryDebtCollectionForm" class="m-payment-form"><h3>Gửi phiếu thu nợ chờ kế toán</h3><p class="m-help-text">Công nợ chỉ giảm sau khi kế toán xác nhận trên web.</p><div class="m-return-scroll debt-order-selection-list">'+rowsHtml+'</div><label>Số tiền đã thu<input id="mDeliveryDebtAmount" name="amount" type="number" min="0" value="'+esc(debtAvailableValue(customer))+'"></label><label>Hình thức<select name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label><label>Ghi chú<input name="note" placeholder="VD: Khách trả một phần"></label><div class="debt-submit-bar"><button type="submit">Gửi phiếu thu chờ KT</button></div></form>'
}(selected)+"</div></section>";var reload=el("mReloadDebt");reload&&reload.addEventListener("click",function(){
state.debtFormDirty&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")||(state.debtFormDirty=!1,resetDeliveryDebtPaging({clearRows:!0}),
loadDeliveryDebts(!0))});var customerTab=el("mDebtCustomersSubtab");customerTab&&customerTab.addEventListener("click",function(){setDeliveryDebtSubtab("customers")})
;var collectTab=el("mDebtCollectSubtab");collectTab&&collectTab.addEventListener("click",function(){setDeliveryDebtSubtab("collect")});var chooseCustomer=el("mChooseDebtCustomer")
;chooseCustomer&&chooseCustomer.addEventListener("click",function(){setDeliveryDebtSubtab("customers")});var search=el("mDebtCustomerSearch")
;search&&search.addEventListener("input",debounce(function(){state.debtSearch=search.value||"",resetDeliveryDebtPaging({clearRows:!0}),loadDeliveryDebts(!0)},300))
;var sort=el("mDebtCustomerSort");sort&&sort.addEventListener("change",function(){state.debtSort=sort.value||"debt_desc",renderDeliveryDebtCustomerList()}),
renderDeliveryDebtCustomerList();var form=el("mDeliveryDebtCollectionForm");form&&selected&&(form.addEventListener("input",function(){state.debtFormDirty=!0}),
form.addEventListener("change",function(){state.debtFormDirty=!0}),form.addEventListener("submit",function(event){!async function(event,customer){
event&&event.preventDefault&&event.preventDefault();var formElement=event.target,form=new FormData(formElement),amountValue=num(form.get("amount"))
;if(amountValue<=0)msg("Số tiền thu phải lớn hơn 0",!0);else{var orders=debtOrderRows(customer),allocations=[]
;if(document.querySelectorAll(".m-debt-order-check:checked").forEach(function(input){var index=Number(input.getAttribute("data-index")),order=orders[index];if(order){
var available=order.availableDebt;null==available&&(available=order.debt),(available=num(available||0))<=0||allocations.push({salesOrderId:order.salesOrderId||order.orderId||"",
salesOrderCode:order.salesOrderCode||order.orderCode||"",allocatedAmount:available})}}),allocations.length)if(amountValue>allocations.reduce(function(sum,row){
return sum+num(row.allocatedAmount)},0))msg("Số tiền thu vượt tổng công nợ đã chọn",!0);else{var remain=amountValue;allocations=allocations.map(function(row){
var allocated=Math.min(num(row.allocatedAmount),remain);return remain-=allocated,Object.assign({},row,{allocatedAmount:allocated})}).filter(function(row){
return num(row.allocatedAmount)>0});var submitButton=formElement.querySelector('button[type="submit"]');submitButton&&(submitButton.disabled=!0,
submitButton.textContent="Đang gửi...");try{msg("Đang gửi phiếu thu nợ chờ kế toán..."),await window.DeliveryCore.api("/api/mobile/debt-collections",{method:"POST",
body:JSON.stringify({collectorType:"delivery",customerId:customer.customerId||"",customerCode:customer.customerCode||"",customerName:customer.customerName||"",amount:amountValue,
paymentMethod:form.get("paymentMethod")||"cash",note:form.get("note")||"",allocations:allocations,idempotencyKey:"delivery-debt-"+(customer.customerCode||Date.now())+"-"+Date.now()
})}),state.debtFormDirty=!1,state.selectedDebtIndex=-1,state.selectedDebtKey="",state.debtSubtab="customers",resetDeliveryDebtPaging({clearRows:!0}),await loadDeliveryDebts(!0),
msg("Đã ghi nhận thu nợ, chờ kế toán xác nhận"),window.requestAnimationFrame(function(){window.scrollTo({top:state.debtListScrollTop||0,behavior:"auto"})})}catch(err){
msg(err.message||"Không gửi được phiếu thu nợ",!0),submitButton&&(submitButton.disabled=!1,submitButton.textContent="Gửi phiếu thu chờ KT")}
}else msg("Cần chọn ít nhất một đơn nợ",!0)}}(event,selected)})),body.querySelectorAll(".m-debt-order-check").forEach(function(input){input.addEventListener("change",function(){
!function(customer){var orders=debtOrderRows(customer),total=0;document.querySelectorAll(".m-debt-order-check:checked").forEach(function(input){
var index=Number(input.getAttribute("data-index")),order=orders[index];if(order){var available=order.availableDebt;null==available&&(available=order.debt),total+=num(available||0)}
});var amountInput=el("mDeliveryDebtAmount");amountInput&&(amountInput.value=Math.max(0,Math.round(total)))}(selected),state.debtFormDirty=!0})})
}else mobileUiRuntime?mobileUiRuntime.renderState(body,{state:"loading",className:"m-delivery-body",title:"Đang tải công nợ..."
}):body.innerHTML='<div class="m-empty">Đang tải công nợ...</div>'}(body):"reconciliation"===state.tab?function(body){
var report=state.reconciliationReport||{},summary=report.summary||{};if(!state.reconciliationLoading||state.reconciliationLoaded){
if(state.reconciliationError&&!state.reconciliationLoaded)return body.innerHTML='<div class="m-empty danger"><b>Không tải được đối soát</b><span>'+esc(state.reconciliationError)+'</span><button id="mRetryReconciliation" type="button">Thử lại</button></div>',
void el("mRetryReconciliation").addEventListener("click",function(){loadDeliveryReconciliation(!0)})
;if(!state.reconciliationLoaded)return body.innerHTML='<div class="m-empty"><b>Chưa tải báo cáo đối soát</b><span>Bấm tải để đối chiếu tiền, hàng trả và phiếu thu nợ cuối ngày.</span><button id="mLoadReconciliation" type="button">Tải đối soát</button></div>',
void el("mLoadReconciliation").addEventListener("click",function(){loadDeliveryReconciliation(!0)});var mismatch=!!summary.hasMismatch||Math.abs(function(summary){
return num(summary&&summary.difference)
}(summary))>1e3,orderRows=Array.isArray(report.orders)?report.orders:[],collectionRows=Array.isArray(report.collections)?report.collections:[]
;body.innerHTML='<section class="m-recon-header-card'+(mismatch?" danger":"")+'"><div><b>Đối soát ngày '+esc(report.date||el("mDate")&&el("mDate").value||today())+"</b><span>"+(mismatch?"Có chênh lệch cần xử lý":"Đối soát tạm ổn trong ngưỡng cho phép")+'</span></div><button id="mReloadReconciliation" type="button">Tải lại</button></section><section class="m-recon-grid">'+renderReconciliationMetric("Đơn đã giao",summary.deliveredOrders||0)+renderReconciliationMetric("Đơn chưa giao",summary.pendingOrders||0)+renderReconciliationMetric("Phải thu sau trả",summary.mustCollect||0)+renderReconciliationMetric("Tiền mặt",summary.collectedCash||0)+renderReconciliationMetric("Chuyển khoản",summary.collectedTransfer||0)+renderReconciliationMetric("Còn thiếu",summary.remainingDebt||0,summary.remainingDebt>0)+renderReconciliationMetric("Hàng trả",summary.returnAmount||0)+renderReconciliationMetric("Phiếu chờ KT",summary.pendingDebtCollectionAmount||0,summary.pendingDebtCollections>0)+renderReconciliationMetric("Chênh lệch",summary.difference||0,mismatch)+'</section><section class="m-recon-section"><h3>Đơn cần chú ý</h3>'+(orderRows.filter(function(row){
return!row.delivered||num(row.remainingDebt)>0||Math.abs(num(row.difference))>1e3}).slice(0,20).map(function(row){
return'<article class="m-recon-row"><b>'+esc(row.customerName||row.customerCode||row.orderCode)+"</b><span>"+esc(row.orderCode||"")+" · "+(row.delivered?"Đã giao":"Chưa giao")+"</span><em>Còn thiếu "+money(row.remainingDebt||0)+" · Lệch "+money(row.difference||0)+"</em></article>"
}).join("")||'<div class="m-empty">Không có đơn cần chú ý.</div>')+'</section><section class="m-recon-section"><h3>Phiếu thu nợ đã gửi</h3>'+(collectionRows.slice(0,20).map(function(row){
return'<article class="m-recon-row"><b>'+esc(row.customerName||row.customerCode||row.code)+"</b><span>"+esc(row.code||"")+" · "+esc(row.status||"")+"</span><em>"+money(row.amount||0)+(row.pendingAccounting?" · Chờ kế toán":" · Đã xử lý")+"</em></article>"
}).join("")||'<div class="m-empty">Chưa có phiếu thu nợ gửi trong ngày.</div>')+"</section>",el("mReloadReconciliation").addEventListener("click",function(){
loadDeliveryReconciliation(!0)})}else mobileUiRuntime?mobileUiRuntime.renderState(body,{state:"loading",className:"m-delivery-body",title:"Đang tải đối soát cuối ngày..."
}):body.innerHTML='<div class="m-empty">Đang tải đối soát cuối ngày...</div>'}(body):function(body){var rows=window.DeliveryCore.state.orders||[]
;rows.length?deliveryOrderRenderer?deliveryOrderRenderer.render(rows,renderOrderCard,{className:"m-delivery-body"
}):body.innerHTML=rows.map(renderOrderCard).join(""):mobileUiRuntime?mobileUiRuntime.renderState(body,{state:"empty",className:"m-delivery-body",title:"Không có đơn giao."
}):body.innerHTML='<div class="m-empty">Không có đơn giao.</div>'}(body)}function renderOrderCard(order){return deliveryOrdersView.renderOrderCard(order,{
selectedKey:state.selectedKey})}function currentOrder(){return window.DeliveryCore.state.selectedOrder}function debtMoneyValue(customer){
return num(customer&&(customer.debtAmount||customer.debt||0))}function debtAvailableValue(customer){var value=(customer=customer||{}).availableDebtAmount
;return null==value&&(value=customer.availableDebt),null==value&&(value=customer.debtAmount),null==value&&(value=customer.debt),num(value||0)}function debtPendingValue(customer){
var value=(customer=customer||{}).pendingCollectedAmount;return null==value&&(value=customer.pendingCollected),num(value||0)}function debtOrderRows(customer){
return(Array.isArray(customer&&customer.orders)?customer.orders:[]).filter(function(row){var available=row.availableDebt;return null==available&&(available=row.debt),
num(available||0)>0})}function deliveryDebtCustomerKey(customer){return customer=customer||{},
String(customer.customerId||customer.customerCode||customer.code||customer.id||customer._id||customer.customerName||"").trim()}function resetDeliveryDebtPaging(options){
options=options||{},state.debtPage=0,state.debtHasMore=!1,state.debtTotalRows=0,state.debtTotalPages=0,state.debtNextPage=1,!1!==options.clearRows&&(state.debts=[]),
state.debtLoaded=!1,state.debtCacheAt=0,state.debtError=""}function setDeliveryDebtSubtab(nextSubtab,options){options=options||{},
state.debtSubtab="collect"===nextSubtab?"collect":"customers"
;var customerActive="customers"===state.debtSubtab,customerTab=el("mDebtCustomersSubtab"),collectTab=el("mDebtCollectSubtab"),customerPanel=el("mDebtCustomersPanel"),collectPanel=el("mDebtCollectPanel")
;if(customerTab&&(customerTab.classList.toggle("active",customerActive),customerTab.setAttribute("aria-selected",String(customerActive))),
collectTab&&(collectTab.classList.toggle("active",!customerActive),collectTab.setAttribute("aria-selected",String(!customerActive))),
customerPanel&&customerPanel.classList.toggle("active",customerActive),collectPanel&&collectPanel.classList.toggle("active",!customerActive),
customerActive&&!1!==options.restoreScroll)window.requestAnimationFrame(function(){window.scrollTo({top:state.debtListScrollTop||0,behavior:"auto"})
});else if(!customerActive&&!1!==options.scroll){var body=el("mBody");body&&body.scrollIntoView({block:"start",behavior:options.behavior||"smooth"})}}
async function loadDeliveryDebts(force,options){force=!!force;var append=!!(options=options||{}).append;if(append&&!state.debtHasMore)return state.debts
;if(state.debtPromise&&(!force||append))return state.debtPromise
;if(!append&&state.debtLoaded&&!force&&deliveryMobileState.isFresh(state.debtCacheAt,DELIVERY_TAB_CACHE_TTL_MS))return render(),state.debts
;!append&&force&&resetDeliveryDebtPaging({clearRows:!0});var page=append?state.debtNextPage||state.debtPage+1||2:1;state.debtLoading=!append,state.debtLoadingMore=append,
state.debtRequestSeq+=1;var requestSeq=state.debtRequestSeq;return msg(append?"Đang tải thêm công nợ...":"Đang tải công nợ..."),
state.debtPromise=window.DeliveryCore.api(function(page){var params=new URLSearchParams;params.set("collectorType","delivery"),params.set("includePendingCollections","1"),
params.set("includePaid","0"),params.set("limit",String(state.debtLimit||DELIVERY_DEBT_PAGE_LIMIT)),params.set("page",String(Math.max(1,Number(page||1)||1)))
;var keyword=String(state.debtSearch||"").trim();return keyword&&params.set("q",keyword),"/api/mobile/debts?"+params.toString()}(page)).then(function(json){
if(requestSeq!==state.debtRequestSeq)return state.debts
;var existingRows,newRows,rows,indexByKey,previousKey=state.selectedDebtKey,incomingRows=Array.isArray(json.items)?json.items:[],pagination=function(pagination){
pagination=pagination||{}
;var page=Math.max(1,Number(pagination.page||state.debtPage||1)||1),limit=Math.max(1,Number(pagination.limit||state.debtLimit||DELIVERY_DEBT_PAGE_LIMIT)||DELIVERY_DEBT_PAGE_LIMIT),totalRows=Math.max(0,Number(pagination.totalRows||pagination.total||0)||0),totalPages=Math.max(0,Number(pagination.totalPages||(totalRows?Math.ceil(totalRows/limit):0))||0),hasMore=Boolean(pagination.hasMore)
;!hasMore&&totalRows&&(hasMore=page*limit<totalRows);var nextPage=null!=pagination.nextPage?Number(pagination.nextPage):hasMore?page+1:null
;return(!Number.isFinite(nextPage)||nextPage<1)&&(nextPage=null),{page:page,limit:limit,totalRows:totalRows,totalPages:totalPages,hasMore:hasMore,nextPage:nextPage}
}(json.pagination||{});return state.debtError="",state.debts=append?(existingRows=state.debts,newRows=incomingRows,rows=Array.isArray(existingRows)?existingRows.slice():[],
indexByKey=new Map,rows.forEach(function(customer,index){var key=deliveryDebtCustomerKey(customer);key&&indexByKey.set(key,index)}),
(Array.isArray(newRows)?newRows:[]).forEach(function(customer){var key=deliveryDebtCustomerKey(customer)
;key&&indexByKey.has(key)?rows[indexByKey.get(key)]=customer:(key&&indexByKey.set(key,rows.length),rows.push(customer))}),rows):incomingRows,
state.debtSummary=json.summary||state.debtSummary||{},state.debtPage=pagination.page,state.debtLimit=pagination.limit,state.debtHasMore=pagination.hasMore,
state.debtTotalRows=pagination.totalRows||state.debts.length,state.debtTotalPages=pagination.totalPages,state.debtNextPage=pagination.nextPage,state.debtLoaded=!0,
state.debtCacheAt=Date.now(),state.selectedDebtIndex=previousKey?state.debts.findIndex(function(customer){return deliveryDebtCustomerKey(customer)===previousKey}):-1,
state.selectedDebtIndex<0&&(state.selectedDebtIndex=-1,state.selectedDebtKey="",state.debtFormDirty=!1),msg(""),state.debts}).catch(function(err){
if(requestSeq!==state.debtRequestSeq)return state.debts;throw append||(state.debtLoaded=!1,state.debtCacheAt=0),state.debtError=err.message||"Không tải được công nợ giao hàng",
msg(state.debtError,!0),err}).finally(function(){requestSeq===state.debtRequestSeq&&(state.debtLoading=!1,state.debtLoadingMore=!1,state.debtPromise=null,render())}),
state.debtPromise}function renderDeliveryDebtCustomerList(){var list=el("mDebtCustomerList");if(list){
var keyword,rows,entries=(keyword=String(state.debtSearch||"").trim().toLowerCase(),(rows=(state.debts||[]).map(function(customer,originalIndex){return{customer:customer,
originalIndex:originalIndex}}).filter(function(entry){if(!keyword)return!0;var customer=entry.customer||{}
;return[customer.customerCode,customer.customerName,customer.phone,customer.customerPhone].some(function(value){return String(value||"").toLowerCase().indexOf(keyword)>=0})
})).sort(function(left,right){
return"available_desc"===state.debtSort?debtAvailableValue(right.customer)-debtAvailableValue(left.customer):"oldest_asc"===state.debtSort?String(left.customer.oldestDebtDate||"9999-12-31").localeCompare(String(right.customer.oldestDebtDate||"9999-12-31")):debtMoneyValue(right.customer)-debtMoneyValue(left.customer)
}),rows);if(!(state.debts||[]).length)return mobileUiRuntime?mobileUiRuntime.renderState(list,{state:"empty",className:"m-debt-customer-list",title:"Không có khách hàng còn nợ."
}):list.innerHTML='<div class="m-empty">Không có khách hàng còn nợ.</div>',void renderDeliveryDebtPaging()
;if(!entries.length)return mobileUiRuntime?mobileUiRuntime.renderState(list,{state:"empty",className:"m-debt-customer-list",title:"Không tìm thấy khách hàng phù hợp."
}):list.innerHTML='<div class="m-empty">Không tìm thấy khách hàng phù hợp.</div>',void renderDeliveryDebtPaging()
;mobileUiRuntime?(deliveryDebtRendererContainer!==list&&(deliveryDebtRenderer&&deliveryDebtRenderer.cancel(),deliveryDebtRendererContainer=list,
deliveryDebtRenderer=mobileUiRuntime.createChunkedHtmlRenderer(list,{initialCount:60,chunkSize:80})),deliveryDebtRenderer.render(entries,renderDebtCustomerCard,{
className:"m-debt-customer-list"})):list.innerHTML=entries.map(renderDebtCustomerCard).join(""),renderDeliveryDebtPaging()}}function renderDeliveryDebtPaging(){
var paging=el("mDebtPaging");if(paging){
var loaded=(state.debts||[]).length,total=state.debtTotalRows||loaded,statusText=total>0?"Đã tải "+loaded+"/"+total+" khách nợ":"Chưa có khách nợ cần tải",buttonHtml=""
;state.debtHasMore?buttonHtml='<button id="mLoadMoreDebt" type="button" class="secondary"'+(state.debtLoadingMore?" disabled":"")+">"+(state.debtLoadingMore?"Đang tải thêm...":"Tải thêm")+"</button>":state.debtLoaded&&loaded>0&&(buttonHtml='<span class="m-debt-paging-done">Đã tải hết</span>'),
paging.innerHTML="<span>"+esc(statusText)+"</span>"+buttonHtml;var loadMore=el("mLoadMoreDebt");loadMore&&loadMore.addEventListener("click",function(){
state.debtLoadingMore||state.debtLoading||loadDeliveryDebts(!1,{append:!0})})}}function renderDebtCustomerCard(entry){
var customer=entry.customer,index=entry.originalIndex,selected=deliveryDebtCustomerKey(customer)===state.selectedDebtKey?" selected":"",available=debtAvailableValue(customer),disabled=available<=0
;return'<article class="m-order-card m-debt-customer-card'+selected+'"><div class="m-order-top"><b>'+esc(customer.customerCode||"")+" - "+esc(customer.customerName||"")+'</b></div><div class="m-order-metrics"><span>Nợ '+money(debtMoneyValue(customer))+"</span><span>Chờ KT "+money(debtPendingValue(customer))+"</span><span>Có thể thu "+money(available)+"</span><span>"+esc(customer.orderCount||0)+' đơn</span></div><button type="button" class="m-debt-collect-action'+(disabled?" disabled":"")+'" data-debt-index="'+index+'"'+(disabled?' disabled aria-disabled="true"':"")+">"+(disabled?"Đang chờ KT":"Thu nợ")+"</button></article>"
}async function loadDeliveryReconciliation(force){
return force=!!force,state.reconciliationPromise&&!force?state.reconciliationPromise:state.reconciliationLoaded&&!force&&deliveryMobileState.isFresh(state.reconciliationCacheAt,DELIVERY_TAB_CACHE_TTL_MS)?(render(),
state.reconciliationReport):(state.reconciliationLoading=!0,state.reconciliationError="",msg("Đang tải đối soát cuối ngày..."),
state.reconciliationPromise=window.DeliveryCore.api((params=new URLSearchParams,currentFilters=filters(),currentFilters.date&&params.set("date",currentFilters.date),
"/api/delivery/reconciliation"+(params.toString()?"?"+params.toString():""))).then(function(json){var report=json.data&&json.data.summary?json.data:{
date:el("mDate")&&el("mDate").value||today(),summary:json.summary||json.reconciliation||{},orders:json.orders||[],returns:json.returns||[],collections:json.collections||[]}
;return state.reconciliationReport=report,state.reconciliationLoaded=!0,state.reconciliationCacheAt=Date.now(),state.reconciliationError="",msg(""),report}).catch(function(err){
throw state.reconciliationLoaded=!1,state.reconciliationCacheAt=0,state.reconciliationError=err.message||"Không tải được đối soát cuối ngày",msg(state.reconciliationError,!0),err
}).finally(function(){state.reconciliationLoading=!1,state.reconciliationPromise=null,render()}),state.reconciliationPromise);var params,currentFilters}
function renderReconciliationMetric(label,value,danger){return'<div class="m-recon-metric'+(danger?" danger":"")+'"><span>'+esc(label)+"</span><b>"+money(value||0)+"</b></div>"}
function hidden(idx,field,value){return'<input type="hidden" data-m-return-field="'+esc(field)+'" data-idx="'+idx+'" value="'+esc(value)+'">'}function cleanReturnCode(value){
return String(null==value?"":value).trim().replace(/^RO[-_]?/i,"")}function returnsForOrder(order){
var ids=[(order=order||{}).orderId,order.salesOrderId,order.id,order._id].map(String).filter(function(v){return v&&"undefined"!==v&&"null"!==v
}),codes=[order.orderCode,order.salesOrderCode,order.code,order.displayOrderCode].map(cleanReturnCode).filter(Boolean)
;return(window.DeliveryCore.state.returns||[]).filter(function(row){
var rowIds=[row.salesOrderId,row.orderId,row.sourceOrderId,row.deliveryOrderId].map(String),rowCodes=[row.salesOrderCode,row.orderCode,row.sourceOrderCode,row.deliveryOrderCode,row.returnOrderCode].map(cleanReturnCode)
;return ids.some(function(id){return rowIds.indexOf(id)>=0})||codes.some(function(code){return rowCodes.indexOf(code)>=0})})}async function saveReturn(event){
event&&event.preventDefault&&event.preventDefault();try{msg("Đang lưu hàng trả..."),await window.DeliveryCore.saveReturn(currentOrder(),(forceZero=event&&event.forceZero,byIdx={},
document.querySelectorAll("[data-m-return-field]").forEach(function(input){var idx=input.getAttribute("data-idx"),field=input.getAttribute("data-m-return-field")
;byIdx[idx]=byIdx[idx]||{},byIdx[idx][field]=forceZero&&"returnQty"===field?0:input.value}),Object.keys(byIdx).map(function(idx){return byIdx[idx]}))),
msg("Đã lưu hàng trả vào returnOrders"),state.selectedKey=keyOf(window.DeliveryCore.state.selectedOrder),state.tab="payment",render()}catch(err){msg(err.message,!0)}
var forceZero,byIdx}async function savePayment(event){event&&event.preventDefault&&event.preventDefault();var form=new FormData(event.target);try{msg("Đang lưu thu tiền..."),
await window.DeliveryCore.savePayment(currentOrder(),{cash:form.get("cash"),bank:form.get("bank"),reward:form.get("reward")}),
await window.DeliveryCore.confirmDelivery(currentOrder(),{deliveryStatus:"delivered"}),msg("Đã lưu thu tiền và xác nhận giao"),
state.selectedKey=keyOf(window.DeliveryCore.state.selectedOrder),state.tab="orders",render()}catch(err){msg(err.message,!0)}}async function loadSelectedReturnsDirect(options){
var force=!!(options=options||{}).force,order=currentOrder();if(!order||!window.DeliveryCore||!window.DeliveryCore.loadReturnsForOrder)return[];if(!force&&function(order){
var key=selectedReturnCacheKey(order);return!!key&&deliveryMobileState.isFresh(state.returnsCache[key],DELIVERY_TAB_CACHE_TTL_MS)}(order))return render(),returnsForOrder(order)
;if(state.returnsLoading&&state.returnsPromise)return state.returnsPromise;state.returnsLoading=!0;try{msg("Đang tải hàng trả từ returnOrders..."),
state.returnsPromise=window.DeliveryCore.loadReturnsForOrder(order);var rows=await state.returnsPromise;return function(order){var key=selectedReturnCacheKey(order)
;key&&(state.returnsCache[key]=Date.now())}(order),msg(""),render(),rows}catch(err){throw msg("Không tải được hàng trả: "+err.message,!0),err}finally{state.returnsLoading=!1,
state.returnsPromise=null}}function select(key){state.selectedKey=key,window.DeliveryCore.selectOrder(key),render()}async function load(options){
var force=!!(options=options||{}).force;if(user=readUser(),role=String(user.role||"").toLowerCase(),
user&&user.role?"admin"===role||"delivery"===role||(alert("Tài khoản không có quyền vào App giao hàng."),window.location.href="/login.html?target=delivery",
0):(window.location.href="/login.html?target=delivery",0)){var user,role;if(state.loadPromise&&!force)return state.loadPromise
;if(options.refreshActiveTab&&deliveryMobileState.isFresh(state.lastLoadAt,DELIVERY_REFRESH_THROTTLE_MS))return state.loadPromise||Promise.resolve(window.DeliveryCore.state.orders)
;if("debt"!==state.tab||!state.debtFormDirty||window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")){"debt"===state.tab&&(state.debtFormDirty=!1),
el("mBody")||renderShell(),state.lastLoadAt=Date.now();var requestToken=deliveryLoadGate?deliveryLoadGate.begin():null
;return mobileUiRuntime?mobileUiRuntime.renderState(el("mBody"),{state:"loading",className:"m-delivery-body",title:"Đang tải dữ liệu giao hàng..."
}):el("mBody").innerHTML='<div class="m-empty">Đang tải...</div>',state.loadPromise=async function(){try{if(await window.DeliveryCore.loadOrders(filters(),requestToken),
deliveryLoadGate&&!deliveryLoadGate.isCurrent(requestToken))return
;!state.selectedKey&&window.DeliveryCore.state.orders[0]&&(state.selectedKey=keyOf(window.DeliveryCore.state.orders[0])),
state.selectedKey&&window.DeliveryCore.selectOrder(state.selectedKey),render(),msg(""),"returns"===state.tab?await loadSelectedReturnsDirect({
force:force||!!options.refreshActiveTab
}):"debt"===state.tab?await loadDeliveryDebts(force||!!options.refreshActiveTab):"reconciliation"===state.tab&&await loadDeliveryReconciliation(force||!!options.refreshActiveTab)
}catch(err){if(deliveryLoadGate&&!deliveryLoadGate.isCurrent(requestToken))return
;el("mBody").innerHTML='<div class="m-empty danger"><b>Không tải được dữ liệu giao hàng</b><span>'+esc(err.message||"Vui lòng thử lại.")+'</span><button id="mRetryLoad" type="button">Thử lại</button></div>',
el("mRetryLoad").addEventListener("click",function(){load({force:!0})}),msg(err.message,!0)}finally{
deliveryLoadGate&&!deliveryLoadGate.isCurrent(requestToken)||(state.loadPromise=null)}}(),state.loadPromise}}}window.DeliveryMobileView={load:load,select:select,
renderShell:renderShell},window.loadDeliveryOrders=function(){return load()},document.addEventListener("DOMContentLoaded",load)}();
//# sourceMappingURL=delivery-mobile-view.js.map
