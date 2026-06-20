/* GENERATED FILE - DO NOT EDIT.
 * Canonical source: public/mobile/js/delivery-mobile-view.source.js
 * Build: npm run build:source-bundles
 */
!function(){"use strict";function el(id){return document.getElementById(id)}function esc(v){return String(null==v?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;",
"<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}function num(v){return window.DeliveryCore?window.DeliveryCore.toNumber(v):Number(v||0)}function money(v){
return window.DeliveryCore?window.DeliveryCore.money(v):String(Math.round(Number(v||0)))}function amount(o,k){return num(o&&o.amounts&&o.amounts[k])}function keyOf(o){
return window.DeliveryCore.orderKey(o)}var state={selectedKey:"",tab:"orders",debts:[],debtSummary:{},selectedDebtIndex:-1,selectedDebtKey:"",debtSubtab:"customers",debtSearch:"",
debtSort:"debt_desc",debtFormDirty:!1,debtListScrollTop:0,debtLoaded:!1,debtLoading:!1};function readUser(){try{
return JSON.parse(localStorage.getItem("v43_mobile_user")||localStorage.getItem("mk_web_user")||"{}")}catch(err){return{}}}function logout(){
["mk_web_token","mk_web_refresh_token","mk_web_user","v43_mobile_token","v43_mobile_refresh_token","v43_mobile_user"].forEach(function(key){localStorage.removeItem(key)}),
fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"X-Requested-With":"XMLHttpRequest"}}).catch(function(){}).finally(function(){
window.location.href="/login.html"})}function renderShell(){var r,user=readUser(),displayName=function(user){
return String(user&&(user.fullName||user.name||user.username||user.staffCode||user.code)||"").trim()}(user),staffCode=function(user){
return String(user&&(user.staffCode||user.code)||"").trim()
}(user),accountText=displayName?displayName+(staffCode&&staffCode!==displayName?" - "+staffCode:""):"Chưa xác định tài khoản";(r=el("mobileDeliveryRoot"),
r||((r=document.createElement("main")).id="mobileDeliveryRoot",document.body.innerHTML="",document.body.appendChild(r)),r.className="mobile-delivery-v46",
r).innerHTML='<header class="m-delivery-header"><div><h1>App giao hàng</h1><p>Đồng bộ 100% với Đơn giao hôm nay</p><div class="m-account-info"><b>'+esc(accountText)+"</b><span>"+esc(function(user){
var role=String(user&&user.role||"").toLowerCase()
;return user&&user.roleLabel?String(user.roleLabel):"delivery"===role?"Nhân viên giao hàng":"admin"===role?"Admin":role||"Tài khoản"
}(user))+'</span></div></div><div style="display:flex;gap:8px;align-items:center"><button id="mReload" type="button">Tải</button><button id="mLogout" type="button">Thoát</button></div></header><section class="m-delivery-filter"><input id="mDate" type="date"><select id="mStatusFilter"><option value="all">Tất cả</option><option value="delivered">Đã giao</option><option value="pending">Chưa giao</option><option value="return">Trả hàng</option><option value="debt">Công nợ</option></select><input id="mSearch" placeholder="Tìm khách/mã đơn"></section><section class="m-delivery-kpis"><div><span>PT</span><b id="mKpiPt">0</b></div><div><span>TM</span><b id="mKpiTm">0</b></div><div><span>CK</span><b id="mKpiCk">0</b></div><div><span>TH</span><b id="mKpiTh">0</b></div><div><span>HT</span><b id="mKpiHt">0</b></div><div><span>CN</span><b id="mKpiCn">0</b></div></section><nav class="m-delivery-tabs"><button data-m-tab="orders" class="active">Đơn giao</button><button data-m-tab="products">Sản phẩm giao</button><button data-m-tab="returns">Hàng trả</button><button data-m-tab="payment">Thu tiền</button><button data-m-tab="debt">Công nợ</button></nav><section id="mBody" class="m-delivery-body">Đang tải...</section><p id="mMsg" class="m-delivery-msg"></p>',
el("mDate").value=function(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"
}).formatToParts(new Date),values=Object.fromEntries(parts.map(part=>[part.type,part.value]));return`${values.year}-${values.month}-${values.day}`}(),
el("mReload").addEventListener("click",load),el("mLogout").addEventListener("click",logout),el("mDate").addEventListener("change",load),
el("mStatusFilter").addEventListener("change",load),el("mSearch").addEventListener("input",debounce(load,250)),document.querySelectorAll("[data-m-tab]").forEach(function(button){
button.addEventListener("click",function(){var nextTab=button.getAttribute("data-m-tab")
;"debt"===state.tab&&"debt"!==nextTab&&state.debtFormDirty&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Rời Công nợ sẽ xóa dữ liệu đang nhập.")||("debt"===state.tab&&"debt"!==nextTab&&(state.debtFormDirty=!1),
state.tab=nextTab,render(),"returns"===state.tab&&loadSelectedReturnsDirect(),"debt"===state.tab&&loadDeliveryDebts())})})}function debounce(fn,wait){var timer=null
;return function(){clearTimeout(timer),timer=setTimeout(fn,wait)}}function msg(text,danger){var node=el("mMsg");node&&(node.textContent=text||"",
node.className="m-delivery-msg "+(danger?"danger":""))}function filters(){return{date:el("mDate")&&el("mDate").value,q:el("mSearch")&&el("mSearch").value,
statusFilter:el("mStatusFilter")&&el("mStatusFilter").value}}function render(){var order,rows,selected,s;rows=window.DeliveryCore.state.orders||[],selected=currentOrder(),
s=currentOrder()&&["products","returns","payment"].indexOf(state.tab)>=0?{pt:amount(order=selected,"receivable"),tm:amount(order,"cash"),ck:amount(order,"bank"),
th:amount(order,"returnAmount"),ht:amount(order,"reward"),cn:amount(order,"debt")}:function(rows){return(rows||[]).reduce(function(a,o){return a.pt+=amount(o,"receivable"),
a.tm+=amount(o,"cash"),a.ck+=amount(o,"bank"),a.th+=amount(o,"returnAmount"),a.ht+=amount(o,"reward"),a.cn+=amount(o,"debt"),a},{pt:0,tm:0,ck:0,th:0,ht:0,cn:0})}(rows),
el("mKpiPt")&&(el("mKpiPt").textContent=money(s.pt)),el("mKpiTm")&&(el("mKpiTm").textContent=money(s.tm)),el("mKpiCk")&&(el("mKpiCk").textContent=money(s.ck)),
el("mKpiTh")&&(el("mKpiTh").textContent=money(s.th)),el("mKpiHt")&&(el("mKpiHt").textContent=money(s.ht)),el("mKpiCn")&&(el("mKpiCn").textContent=money(s.cn)),
document.querySelectorAll("[data-m-tab]").forEach(function(button){button.classList.toggle("active",button.getAttribute("data-m-tab")===state.tab)});var body=el("mBody")
;if(body)return"products"===state.tab?function(body){var order=currentOrder();if(order){var items=Array.isArray(order.items)?order.items:[]
;body.innerHTML='<div class="m-selected-order"><b>'+esc(order.orderCode)+"</b><span>"+esc(order.customerName)+'</span></div><form id="mReturnForm"><div class="m-return-scroll">'+items.map(function(it,idx){
var code=it.productCode||it.code||it.productId||"",name=it.productName||it.name||"",price=num(it.unitPrice||it.price||it.salePrice||it.finalPrice),qty=num(it.quantity||it.deliveredQty||it.qty||it.orderQty||it.soldQty),rqty=num(it.returnQty||it.qtyReturn||it.returnQuantity||it.returnedQty)
;return'<div class="m-product-row"><div><b>'+esc(code)+"</b><small>"+esc(name)+"</small><em>SL giao "+money(qty)+" · Giá cố định "+money(price)+"</em>"+hidden(idx,"productCode",code)+hidden(idx,"productName",name)+hidden(idx,"price",price)+'</div><input data-m-return-field="returnQty" data-idx="'+idx+'" type="number" min="0" step="1" value="'+esc(rqty)+'"></div>'
}).join("")+'</div><div class="m-action-row"><button type="submit">Lưu hàng trả</button><button id="mClearReturn" type="button" class="secondary">Bỏ qua hàng trả</button></div></form>',
el("mReturnForm").addEventListener("submit",saveReturn),el("mClearReturn").addEventListener("click",function(){saveReturn({preventDefault:function(){},forceZero:!0})})
}else body.innerHTML='<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'}(body):"returns"===state.tab?function(body){var order=currentOrder();if(order){
var rows=function(order){var ids=[(order=order||{}).orderId,order.salesOrderId,order.id,order._id].map(String).filter(function(v){return v&&"undefined"!==v&&"null"!==v
}),codes=[order.orderCode,order.salesOrderCode,order.code,order.displayOrderCode].map(cleanReturnCode).filter(Boolean)
;return(window.DeliveryCore.state.returns||[]).filter(function(row){
var rowIds=[row.salesOrderId,row.orderId,row.sourceOrderId,row.deliveryOrderId].map(String),rowCodes=[row.salesOrderCode,row.orderCode,row.sourceOrderCode,row.deliveryOrderCode,row.returnOrderCode].map(cleanReturnCode)
;return ids.some(function(id){return rowIds.indexOf(id)>=0})||codes.some(function(code){return rowCodes.indexOf(code)>=0})})}(order)
;return!rows.length&&Array.isArray(order.returnItems)&&order.returnItems.length&&(rows=order.returnItems.map(function(item){return Object.assign({},item,{
salesOrderId:order.salesOrderId,salesOrderCode:order.salesOrderCode,orderId:order.orderId,orderCode:order.orderCode,customerCode:order.customerCode,customerName:order.customerName
})
})),!rows.length&&amount(order,"returnAmount")>0?(body.innerHTML='<div class="m-selected-order"><b>'+esc(order.orderCode)+"</b><span>"+esc(order.customerName)+'</span></div><div class="m-empty">Đơn có tiền hàng trả '+money(amount(order,"returnAmount"))+' nhưng app chưa lấy được dòng sản phẩm. Bấm Tải lại hàng trả để gọi trực tiếp returnOrders.</div><div class="m-action-row"><button id="mReloadReturns" type="button">Tải lại hàng trả</button></div>',
void el("mReloadReturns").addEventListener("click",loadSelectedReturnsDirect)):rows.length?(body.innerHTML='<div class="m-selected-order"><b>'+esc(order.orderCode)+"</b><span>"+esc(order.customerName)+'</span></div><form id="mReturnSaveForm"><div class="m-return-scroll">'+rows.map(function(it,idx){
var amount=num(it.returnQty)*num(it.price)
;return'<div class="m-product-row"><div><b>'+esc(it.productCode)+"</b><small>"+esc(it.productName)+"</small><em>Giá cố định "+money(it.price)+" · Thành tiền "+money(amount)+"</em>"+hidden(idx,"productCode",it.productCode)+hidden(idx,"productName",it.productName)+hidden(idx,"price",it.price)+'</div><input data-m-return-field="returnQty" data-idx="'+idx+'" type="number" min="0" step="1" value="'+esc(it.returnQty)+'"></div>'
}).join("")+'</div><div class="m-action-row"><button type="submit">Cập nhật hàng trả</button><button id="mBackProducts" type="button" class="secondary">Sửa từ sản phẩm giao</button></div></form>',
el("mReturnSaveForm").addEventListener("submit",saveReturn),void el("mBackProducts").addEventListener("click",function(){state.tab="products",render()
})):(body.innerHTML='<div class="m-selected-order"><b>'+esc(order.orderCode)+"</b><span>"+esc(order.customerName)+'</span></div><div class="m-empty">Chưa có hàng trả trong returnOrders. Nhập SL trả ở tab Sản phẩm giao rồi bấm Lưu hàng trả hoặc bấm Bỏ qua hàng trả để sang Thu tiền.</div><div class="m-action-row"><button id="mGoProducts" type="button">Quay lại sản phẩm</button><button id="mSkipReturns" type="button" class="secondary">Bỏ qua hàng trả</button></div>',
el("mGoProducts").addEventListener("click",function(){state.tab="products",render()}),void el("mSkipReturns").addEventListener("click",function(){state.tab="payment",render()}))}
body.innerHTML='<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'}(body):"payment"===state.tab?function(body){var order=currentOrder()
;order?(body.innerHTML='<div class="m-selected-order"><b>'+esc(order.orderCode)+"</b><span>"+esc(order.customerName)+'</span></div><form id="mPaymentForm" class="m-payment-form"><h3>Thu tiền đơn giao</h3><label>Tiền mặt<input name="cash" type="number" min="0" value="'+esc(amount(order,"cash"))+'"></label><label>Chuyển khoản<input name="bank" type="number" min="0" value="'+esc(amount(order,"bank"))+'"></label><label>Trả thưởng<input name="reward" type="number" min="0" value="'+esc(amount(order,"reward"))+'"></label><button type="submit">Lưu thu tiền</button></form>',
el("mPaymentForm").addEventListener("submit",savePayment)):body.innerHTML='<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'}(body):"debt"===state.tab?function(body){
var rows=state.debts||[],summary=state.debtSummary||{};if(!state.debtLoading||rows.length){var selected=state.selectedDebtKey&&(state.debts||[]).find(function(customer){
return deliveryDebtCustomerKey(customer)===state.selectedDebtKey})||null,customerTabActive="collect"!==state.debtSubtab
;body.innerHTML='<section class="m-debt-summary"><div><span>Tổng nợ</span><b>'+money(summary.totalDebt||0)+"</b></div><div><span>Chờ KT</span><b>"+money(summary.pendingCollected||summary.pendingCollectedAmount||0)+"</b></div><div><span>Có thể thu</span><b>"+money(summary.availableDebt||summary.availableDebtAmount||0)+"</b></div><div><span>Khách nợ</span><b>"+esc(summary.customerCount||rows.length)+'</b></div></section><div class="m-action-row m-debt-reload-row"><button id="mReloadDebt" type="button">Tải lại công nợ</button></div><div class="debt-subtabs m-debt-subtabs" role="tablist" aria-label="Nghiệp vụ công nợ"><button id="mDebtCustomersSubtab" type="button" class="debt-subtab'+(customerTabActive?" active":"")+'" role="tab" aria-selected="'+customerTabActive+'">Khách nợ</button><button id="mDebtCollectSubtab" type="button" class="debt-subtab'+(customerTabActive?"":" active")+'" role="tab" aria-selected="'+!customerTabActive+'">Thu nợ</button></div><section id="mDebtCustomersPanel" class="debt-subpanel'+(customerTabActive?" active":"")+'"><div class="debt-list-toolbar"><input id="mDebtCustomerSearch" type="search" value="'+esc(state.debtSearch)+'" placeholder="Tìm mã / tên / SĐT khách hàng" aria-label="Tìm khách hàng đang nợ"><select id="mDebtCustomerSort" aria-label="Sắp xếp danh sách công nợ"><option value="debt_desc"'+("debt_desc"===state.debtSort?" selected":"")+'>Nợ cao nhất</option><option value="available_desc"'+("available_desc"===state.debtSort?" selected":"")+'>Có thể thu cao nhất</option><option value="oldest_asc"'+("oldest_asc"===state.debtSort?" selected":"")+'>Nợ cũ nhất</option></select></div><div id="mDebtCustomerList" class="m-debt-list">'+renderDebtCustomers(visibleDeliveryDebtCustomers())+'</div></section><section id="mDebtCollectPanel" class="debt-subpanel'+(customerTabActive?"":" active")+'"><div id="mDebtDetailContainer" class="m-debt-detail">'+function(customer){
if(!customer)return'<div class="m-empty debt-empty-state"><b>Chưa chọn khách hàng để thu nợ</b><span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span><button id="mChooseDebtCustomer" type="button" class="m-debt-empty-action">Chọn khách hàng</button></div>'
;var orders=debtOrderRows(customer)
;if(!orders.length)return'<div class="m-selected-order"><b>'+esc(customer.customerCode||"")+" - "+esc(customer.customerName||"")+'</b></div><div class="m-empty">Khách hàng này không còn số tiền có thể thu hoặc đang chờ kế toán xác nhận.</div>'
;var rowsHtml=orders.map(function(order,index){var available=order.availableDebt;return null==available&&(available=order.debt),available=num(available||0),
'<label class="m-debt-order-row"><input type="checkbox" class="m-debt-order-check" data-index="'+index+'" checked><div><b>'+esc(order.salesOrderCode||order.orderCode||"")+"</b><small>Ngày: "+esc(order.orderDate||order.documentDate||"")+"</small><em>Nợ: "+money(order.debt||0)+" · Chờ KT: "+money(order.pendingCollectedAmount||0)+" · Có thể thu: "+money(available)+"</em></div></label>"
}).join("")
;return'<div class="m-selected-order"><b>'+esc(customer.customerCode||"")+" - "+esc(customer.customerName||"")+"</b><span>Nợ: "+money(debtMoneyValue(customer))+" · Chờ KT: "+money(debtPendingValue(customer))+" · Có thể thu: "+money(debtAvailableValue(customer))+'</span></div><form id="mDeliveryDebtCollectionForm" class="m-payment-form"><h3>Gửi phiếu thu nợ chờ kế toán</h3><p class="m-help-text">Công nợ chỉ giảm sau khi kế toán xác nhận trên web.</p><div class="m-return-scroll debt-order-selection-list">'+rowsHtml+'</div><label>Số tiền đã thu<input id="mDeliveryDebtAmount" name="amount" type="number" min="0" value="'+esc(debtAvailableValue(customer))+'"></label><label>Hình thức<select name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label><label>Ghi chú<input name="note" placeholder="VD: Khách trả một phần"></label><div class="debt-submit-bar"><button type="submit">Gửi phiếu thu chờ KT</button></div></form>'
}(selected)+"</div></section>";var reload=el("mReloadDebt");reload&&reload.addEventListener("click",function(){
state.debtFormDirty&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")||(state.debtFormDirty=!1,state.debtLoaded=!1,loadDeliveryDebts(!0))})
;var customerTab=el("mDebtCustomersSubtab");customerTab&&customerTab.addEventListener("click",function(){setDeliveryDebtSubtab("customers")})
;var collectTab=el("mDebtCollectSubtab");collectTab&&collectTab.addEventListener("click",function(){setDeliveryDebtSubtab("collect")});var chooseCustomer=el("mChooseDebtCustomer")
;chooseCustomer&&chooseCustomer.addEventListener("click",function(){setDeliveryDebtSubtab("customers")});var search=el("mDebtCustomerSearch")
;search&&search.addEventListener("input",debounce(function(){state.debtSearch=search.value||"",renderDeliveryDebtCustomerList()},120));var sort=el("mDebtCustomerSort")
;sort&&sort.addEventListener("change",function(){state.debtSort=sort.value||"debt_desc",renderDeliveryDebtCustomerList()}),bindDeliveryDebtCustomerActions(body)
;var form=el("mDeliveryDebtCollectionForm");form&&selected&&(form.addEventListener("input",function(){state.debtFormDirty=!0}),form.addEventListener("change",function(){
state.debtFormDirty=!0}),form.addEventListener("submit",function(event){!async function(event,customer){event&&event.preventDefault&&event.preventDefault()
;var formElement=event.target,form=new FormData(formElement),amountValue=num(form.get("amount"));if(amountValue<=0)msg("Số tiền thu phải lớn hơn 0",!0);else{
var orders=debtOrderRows(customer),allocations=[];if(document.querySelectorAll(".m-debt-order-check:checked").forEach(function(input){
var index=Number(input.getAttribute("data-index")),order=orders[index];if(order){var available=order.availableDebt;null==available&&(available=order.debt),
(available=num(available||0))<=0||allocations.push({salesOrderId:order.salesOrderId||order.orderId||"",salesOrderCode:order.salesOrderCode||order.orderCode||"",
allocatedAmount:available})}}),allocations.length)if(amountValue>allocations.reduce(function(sum,row){return sum+num(row.allocatedAmount)
},0))msg("Số tiền thu vượt tổng công nợ đã chọn",!0);else{var remain=amountValue;allocations=allocations.map(function(row){var allocated=Math.min(num(row.allocatedAmount),remain)
;return remain-=allocated,Object.assign({},row,{allocatedAmount:allocated})}).filter(function(row){return num(row.allocatedAmount)>0})
;var submitButton=formElement.querySelector('button[type="submit"]');submitButton&&(submitButton.disabled=!0,submitButton.textContent="Đang gửi...");try{
msg("Đang gửi phiếu thu nợ chờ kế toán..."),await window.DeliveryCore.api("/api/mobile/debt-collections",{method:"POST",body:JSON.stringify({collectorType:"delivery",
customerId:customer.customerId||"",customerCode:customer.customerCode||"",customerName:customer.customerName||"",amount:amountValue,paymentMethod:form.get("paymentMethod")||"cash",
note:form.get("note")||"",allocations:allocations,idempotencyKey:"delivery-debt-"+(customer.customerCode||Date.now())+"-"+Date.now()})}),state.debtFormDirty=!1,
state.selectedDebtIndex=-1,state.selectedDebtKey="",state.debtSubtab="customers",state.debtLoaded=!1,await loadDeliveryDebts(!0),msg("Đã ghi nhận thu nợ, chờ kế toán xác nhận"),
window.requestAnimationFrame(function(){window.scrollTo({top:state.debtListScrollTop||0,behavior:"auto"})})}catch(err){msg(err.message||"Không gửi được phiếu thu nợ",!0),
submitButton&&(submitButton.disabled=!1,submitButton.textContent="Gửi phiếu thu chờ KT")}}else msg("Cần chọn ít nhất một đơn nợ",!0)}}(event,selected)})),
body.querySelectorAll(".m-debt-order-check").forEach(function(input){input.addEventListener("change",function(){!function(customer){var orders=debtOrderRows(customer),total=0
;document.querySelectorAll(".m-debt-order-check:checked").forEach(function(input){var index=Number(input.getAttribute("data-index")),order=orders[index];if(order){
var available=order.availableDebt;null==available&&(available=order.debt),total+=num(available||0)}});var amountInput=el("mDeliveryDebtAmount")
;amountInput&&(amountInput.value=Math.max(0,Math.round(total)))}(selected),state.debtFormDirty=!0})})}else body.innerHTML='<div class="m-empty">Đang tải công nợ...</div>'
}(body):function(body){var rows=window.DeliveryCore.state.orders||[];rows.length?(body.innerHTML=rows.map(function(order){
var key=keyOf(order),selected=key===state.selectedKey?" selected":"",delivered=function(order){return["delivered","success","done","completed"].indexOf(function(order){
var st=order&&order.status&&"object"==typeof order.status?order.status.deliveryStatus:"";return String(st||order&&(order.deliveryStatus||order.status)||"pending").toLowerCase()
}(order))>=0}(order),dotClass=delivered?"delivered":"pending",dotTitle=delivered?"Đã giao":"Chưa giao"
;return'<button type="button" class="m-order-card'+selected+'" data-order-key="'+esc(key)+'"><div class="m-order-top"><b>'+esc(order.orderCode)+'</b><span class="m-order-customer"><span class="m-customer-name">'+esc(order.customerName||order.customerCode)+'</span><i class="delivery-status-dot '+dotClass+'" title="'+esc(dotTitle)+'"></i></span></div><div class="m-order-metrics"><span>PT '+money(amount(order,"receivable"))+"</span><span>TM "+money(amount(order,"cash"))+"</span><span>CK "+money(amount(order,"bank"))+"</span><span>TH "+money(amount(order,"returnAmount"))+"</span><span>HT "+money(amount(order,"reward"))+"</span><span>CN "+(amount(order,"debt")>0?money(amount(order,"debt")):"Đủ")+"</span></div></button>"
}).join(""),body.querySelectorAll("[data-order-key]").forEach(function(button){button.addEventListener("click",function(){select(button.getAttribute("data-order-key"))})
})):body.innerHTML='<div class="m-empty">Không có đơn giao.</div>'}(body)}function currentOrder(){return window.DeliveryCore.state.selectedOrder}function debtMoneyValue(customer){
return num(customer&&(customer.debtAmount||customer.debt||0))}function debtAvailableValue(customer){var value=(customer=customer||{}).availableDebtAmount
;return null==value&&(value=customer.availableDebt),null==value&&(value=customer.debtAmount),null==value&&(value=customer.debt),num(value||0)}function debtPendingValue(customer){
var value=(customer=customer||{}).pendingCollectedAmount;return null==value&&(value=customer.pendingCollected),num(value||0)}function debtOrderRows(customer){
return(Array.isArray(customer&&customer.orders)?customer.orders:[]).filter(function(row){var available=row.availableDebt;return null==available&&(available=row.debt),
num(available||0)>0})}function deliveryDebtCustomerKey(customer){return customer=customer||{},
String(customer.customerId||customer.customerCode||customer.code||customer.id||customer._id||customer.customerName||"").trim()}function visibleDeliveryDebtCustomers(){
var keyword=String(state.debtSearch||"").trim().toLowerCase(),rows=(state.debts||[]).map(function(customer,originalIndex){return{customer:customer,originalIndex:originalIndex}
}).filter(function(entry){if(!keyword)return!0;var customer=entry.customer||{}
;return[customer.customerCode,customer.customerName,customer.phone,customer.customerPhone].some(function(value){return String(value||"").toLowerCase().indexOf(keyword)>=0})})
;return rows.sort(function(left,right){
return"available_desc"===state.debtSort?debtAvailableValue(right.customer)-debtAvailableValue(left.customer):"oldest_asc"===state.debtSort?String(left.customer.oldestDebtDate||"9999-12-31").localeCompare(String(right.customer.oldestDebtDate||"9999-12-31")):debtMoneyValue(right.customer)-debtMoneyValue(left.customer)
}),rows}function setDeliveryDebtSubtab(nextSubtab,options){options=options||{},state.debtSubtab="collect"===nextSubtab?"collect":"customers"
;var customerActive="customers"===state.debtSubtab,customerTab=el("mDebtCustomersSubtab"),collectTab=el("mDebtCollectSubtab"),customerPanel=el("mDebtCustomersPanel"),collectPanel=el("mDebtCollectPanel")
;if(customerTab&&(customerTab.classList.toggle("active",customerActive),customerTab.setAttribute("aria-selected",String(customerActive))),
collectTab&&(collectTab.classList.toggle("active",!customerActive),collectTab.setAttribute("aria-selected",String(!customerActive))),
customerPanel&&customerPanel.classList.toggle("active",customerActive),collectPanel&&collectPanel.classList.toggle("active",!customerActive),
customerActive&&!1!==options.restoreScroll)window.requestAnimationFrame(function(){window.scrollTo({top:state.debtListScrollTop||0,behavior:"auto"})
});else if(!customerActive&&!1!==options.scroll){var body=el("mBody");body&&body.scrollIntoView({block:"start",behavior:options.behavior||"smooth"})}}
async function loadDeliveryDebts(force){if(!state.debtLoading)if(!state.debtLoaded||force){state.debtLoading=!0,msg("Đang tải công nợ...");try{
var previousKey=state.selectedDebtKey,json=await window.DeliveryCore.api("/api/mobile/debts?collectorType=delivery&includePendingCollections=1&includePaid=0&limit=100")
;state.debts=Array.isArray(json.items)?json.items:[],state.debtSummary=json.summary||{},state.debtLoaded=!0,
state.selectedDebtIndex=previousKey?state.debts.findIndex(function(customer){return deliveryDebtCustomerKey(customer)===previousKey}):-1,
state.selectedDebtIndex<0&&(state.selectedDebtIndex=-1,state.selectedDebtKey="",state.debtFormDirty=!1),msg("")}catch(err){state.debtLoaded=!1,
msg(err.message||"Không tải được công nợ giao hàng",!0)}finally{state.debtLoading=!1,render()}}else render()}function bindDeliveryDebtCustomerActions(container){
container&&container.querySelectorAll("[data-debt-index]:not([disabled])").forEach(function(button){button.addEventListener("click",function(){!function(index){
var customer=(state.debts||[])[index];if(customer&&!(debtAvailableValue(customer)<=0)){var nextKey=deliveryDebtCustomerKey(customer);if(state.selectedDebtKey!==nextKey){
if(!state.debtFormDirty||!state.selectedDebtKey||state.selectedDebtKey===nextKey||window.confirm("Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.")){
state.debtListScrollTop=window.scrollY||document.documentElement.scrollTop||0,state.selectedDebtIndex=index,state.selectedDebtKey=nextKey,state.debtFormDirty=!1,
state.debtSubtab="collect",render();var body=el("mBody");body&&body.scrollIntoView({block:"start",behavior:"smooth"})}}else setDeliveryDebtSubtab("collect")}
}(Number(button.getAttribute("data-debt-index")))})})}function renderDeliveryDebtCustomerList(){var list=el("mDebtCustomerList")
;list&&(list.innerHTML=renderDebtCustomers(visibleDeliveryDebtCustomers()),bindDeliveryDebtCustomerActions(list))}function renderDebtCustomers(entries){
return(state.debts||[]).length?entries.length?entries.map(function(entry){
var customer=entry.customer,index=entry.originalIndex,selected=deliveryDebtCustomerKey(customer)===state.selectedDebtKey?" selected":"",available=debtAvailableValue(customer),disabled=available<=0
;return'<article class="m-order-card m-debt-customer-card'+selected+'"><div class="m-order-top"><b>'+esc(customer.customerCode||"")+" - "+esc(customer.customerName||"")+'</b></div><div class="m-order-metrics"><span>Nợ '+money(debtMoneyValue(customer))+"</span><span>Chờ KT "+money(debtPendingValue(customer))+"</span><span>Có thể thu "+money(available)+"</span><span>"+esc(customer.orderCount||0)+' đơn</span></div><button type="button" class="m-debt-collect-action'+(disabled?" disabled":"")+'" data-debt-index="'+index+'"'+(disabled?' disabled aria-disabled="true"':"")+">"+(disabled?"Đang chờ KT":"Thu nợ")+"</button></article>"
}).join(""):'<div class="m-empty">Không tìm thấy khách hàng phù hợp.</div>':'<div class="m-empty">Không có khách hàng còn nợ.</div>'}function hidden(idx,field,value){
return'<input type="hidden" data-m-return-field="'+esc(field)+'" data-idx="'+idx+'" value="'+esc(value)+'">'}function cleanReturnCode(value){
return String(null==value?"":value).trim().replace(/^RO[-_]?/i,"")}async function saveReturn(event){event&&event.preventDefault&&event.preventDefault();try{
msg("Đang lưu hàng trả..."),await window.DeliveryCore.saveReturn(currentOrder(),(forceZero=event&&event.forceZero,byIdx={},
document.querySelectorAll("[data-m-return-field]").forEach(function(input){var idx=input.getAttribute("data-idx"),field=input.getAttribute("data-m-return-field")
;byIdx[idx]=byIdx[idx]||{},byIdx[idx][field]=forceZero&&"returnQty"===field?0:input.value}),Object.keys(byIdx).map(function(idx){return byIdx[idx]}))),
msg("Đã lưu hàng trả vào returnOrders"),state.selectedKey=keyOf(window.DeliveryCore.state.selectedOrder),state.tab="payment",render()}catch(err){msg(err.message,!0)}
var forceZero,byIdx}async function savePayment(event){event&&event.preventDefault&&event.preventDefault();var form=new FormData(event.target);try{msg("Đang lưu thu tiền..."),
await window.DeliveryCore.savePayment(currentOrder(),{cash:form.get("cash"),bank:form.get("bank"),reward:form.get("reward")}),
await window.DeliveryCore.confirmDelivery(currentOrder(),{deliveryStatus:"delivered"}),msg("Đã lưu thu tiền và xác nhận giao"),
state.selectedKey=keyOf(window.DeliveryCore.state.selectedOrder),state.tab="orders",render()}catch(err){msg(err.message,!0)}}async function loadSelectedReturnsDirect(){
var order=currentOrder();if(order&&window.DeliveryCore&&window.DeliveryCore.loadReturnsForOrder)try{msg("Đang tải hàng trả trực tiếp từ returnOrders..."),
await window.DeliveryCore.loadReturnsForOrder(order),msg(""),render()}catch(err){msg("Không tải trực tiếp được hàng trả: "+err.message,!0)}}function select(key){
state.selectedKey=key,window.DeliveryCore.selectOrder(key),state.tab="products",render(),loadSelectedReturnsDirect()}async function load(){var user,role;if(user=readUser(),
role=String(user.role||"").toLowerCase(),(user&&user.role?"admin"===role||"delivery"===role||(alert("Tài khoản không có quyền vào App giao hàng."),
window.location.href="/login.html?target=delivery",0):(window.location.href="/login.html?target=delivery",
0))&&("debt"!==state.tab||!state.debtFormDirty||window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập."))){"debt"===state.tab&&(state.debtFormDirty=!1),
el("mBody")||renderShell(),el("mBody").innerHTML='<div class="m-empty">Đang tải...</div>';try{await window.DeliveryCore.loadOrders(filters()),
await window.DeliveryCore.loadReturns(filters()),!state.selectedKey&&window.DeliveryCore.state.orders[0]&&(state.selectedKey=keyOf(window.DeliveryCore.state.orders[0])),
state.selectedKey&&window.DeliveryCore.selectOrder(state.selectedKey),"returns"===state.tab?await loadSelectedReturnsDirect():"debt"===state.tab?(state.debtLoaded=!1,
await loadDeliveryDebts(!0)):(render(),msg(""))}catch(err){el("mBody").innerHTML='<div class="m-empty danger">'+esc(err.message)+"</div>",msg(err.message,!0)}}}
window.DeliveryMobileView={load:load,select:select,renderShell:renderShell},window.loadDeliveryOrders=function(){return load()},document.addEventListener("DOMContentLoaded",load)
}();
//# sourceMappingURL=delivery-mobile-view.js.map
