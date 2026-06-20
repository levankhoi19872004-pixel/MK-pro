/* GENERATED FILE — edit public/mobile/js/sales.source/part-01.jsfrag, public/mobile/js/sales.source/part-01c.jsfrag, public/mobile/js/sales.source/part-01b.jsfrag, public/mobile/js/sales.source/part-02.jsfrag, public/mobile/js/sales.source/part-02b.jsfrag, public/mobile/js/sales.source/part-03.jsfrag, public/mobile/js/sales.source/part-03b.jsfrag and run npm run build:source-bundles. */
const e=window.V45Common||{},t=e.todayValue,n=e.calculateCartonUnit;import{mobileApi as r,getUser as o}from"./api.js"
;import{queueOperation as a,isNetworkError as i,listOperations as c}from"./offline-sync.js"
;import{bindLogout as s,debounce as d,escapeHtml as u,formatDisplayDate as l,formatShortDate as m,money as g,requireLogin as h,requireRole as p,setButtonBusy as b,setMessage as y}from"./ui.js"

;import{buildCartItemsHtml as f,buildOrderCardsHtml as v,calculateCartTotals as C,createMobileSalesNavigation as S,createStatusAnnouncer as N,renderMobileListState as P}from"./sales-ux.js?v=phase84-mobile-ux-v1"
;h(),p(["sales"]),s(document.getElementById("logoutBtn"));const E=o();document.getElementById("staffInfo").textContent=`${E.name||E.username||"Nhân viên"} · ${E.role||"sales"}`
;let k=null,w=null,A=[],B="",I=[],L=[],$=[],x=!1,D=!1,M=0,T="customers",O="",Q=!1,R=0,q=0,_=[],H=1,K=!1,U=!1,F="",G=1,j=!1,V={},z=1,W=!1,X=!1,J=!1,Y={},Z=!1,ee="customersTab",te=0,ne=""

;const re=document.querySelectorAll(".tab-btn"),oe=document.querySelectorAll(".tab-panel"),ae=document.getElementById("customerSearch"),ie=document.getElementById("customerList"),ce=document.getElementById("customerLoadMoreBtn"),se=document.getElementById("productSearch"),de=document.getElementById("productGroupFilter")
;let ue=!1
;const le=document.getElementById("productSuggestions"),me=document.getElementById("selectedCustomer"),ge=document.getElementById("selectedProduct"),he=document.getElementById("caseQtyInput"),pe=document.getElementById("looseQtyInput"),be=document.getElementById("paidAmountInput"),ye=document.getElementById("cartList"),fe=document.getElementById("cartCustomerContext"),ve=document.getElementById("cartCount"),Ce=document.getElementById("cartTotal"),Se=document.getElementById("cartGrossTotal"),Ne=document.getElementById("cartDiscountTotal"),Pe=document.getElementById("orderDraftBar"),Ee=document.getElementById("orderDraftLineCount"),ke=document.getElementById("orderDraftTotal"),we=document.getElementById("openCartBtn"),Ae=document.getElementById("backToOrderBtn"),Be=document.getElementById("todayOrders"),Ie=document.getElementById("orderLoadMoreBtn"),Le=document.getElementById("orderSearch"),$e=document.getElementById("orderDateFilter"),xe=document.getElementById("orderStatusFilter"),De=document.getElementById("orderFilterResultCount"),Me=document.getElementById("salesMessage"),Te=document.getElementById("orderFormTitle"),Oe=document.getElementById("submitOrderBtn"),Qe=document.getElementById("cartTabBadge"),Re=document.getElementById("syncNavBadge"),qe=document.getElementById("networkStatus"),_e=document.getElementById("mobileGlobalStatus"),He=document.getElementById("debtList"),Ke=document.getElementById("debtLoadMoreBtn"),Ue=document.getElementById("debtLedgerList"),Fe=document.getElementById("debtTotalAmount"),Ge=document.getElementById("debtCustomerCount"),je=document.getElementById("debtPendingAmount"),Ve=document.getElementById("debtTabMessage"),ze=document.getElementById("debtCustomersSubtab"),We=document.getElementById("debtCollectSubtab"),Xe=document.getElementById("debtCustomersPanel"),Je=document.getElementById("debtCollectPanel"),Ye=document.getElementById("debtCustomerSearch"),Ze=document.getElementById("debtCustomerSort")
;function et(e={}){return Number(e.debtAmount??e.currentDebt??e.debt??e.arDebt??0)}function tt(e={}){return Number(e.availableDebtAmount??e.availableDebt??e.debtAmount??e.debt??0)}
function nt(e={}){return Number(e.pendingCollectedAmount??e.pendingCollected??0)}function rt(e={}){return Number(e.monthRevenue??e.monthSales??e.salesAmount??0)}function ot(e=""){
return String(e||"").trim().toLowerCase()}function at(){return String(E.salesStaffCode||E.salesmanCode||E.nvbhCode||E.maNVBH||E.staffCode||E.code||"").trim()}function it(e,t=""){
const n=String(e??"").trim();return n&&"undefined"!==n&&"null"!==n?n:t}function ct(e={}){return it(e.code||e.customerCode||e.customerId||e.id||"")}function st(e={}){
return it(e.name||e.customerName||e.fullName||"")}function dt(e={}){return it(e.phone||e.customerPhone||e.mobile||e.tel||e.telephone||e.contactPhone||e.sdt||"","Chưa có SĐT")}
function ut(e={}){return it(e.address||e.customerAddress||e.fullAddress||e.diaChi||e.routeAddress||"","Chưa có địa chỉ")}function lt(e={}){
const t=ct(e),n=st(e),r=it(e.id||e._id||e.customerId||""),o=it(e.phone||e.customerPhone||e.mobile||e.tel||e.telephone||e.contactPhone||e.sdt||""),a=it(e.address||e.customerAddress||e.fullAddress||e.diaChi||e.routeAddress||"")
;return{...e,id:r,customerId:it(e.customerId||r||t),code:t,customerCode:t,name:n,customerName:n,phone:o,customerPhone:o,address:a,customerAddress:a}}function mt(e={}){
const t=[["id",e.id],["id",e._id],["id",e.customerId],["code",e.code],["code",e.customerCode]]
;return Array.from(new Set(t.map(([e,t])=>[e,String(t||"").trim().toLowerCase()]).filter(([,e])=>Boolean(e)).map(([e,t])=>`${e}:${t}`)))}function gt(e={}){
const t=String(e.name||e.customerName||"").trim().toLowerCase();return t?`name:${t}`:""}function ht(e=$){const t=new Map,n=new Map,r=new Set
;return(Array.isArray(e)?e:[]).forEach(e=>{const o=mt(e);if(o.forEach(n=>t.set(n,e)),o.length)return;const a=gt(e);a&&(n.has(a)?(n.delete(a),r.add(a)):r.has(a)||n.set(a,e))}),
n.forEach((e,n)=>t.set(n,e)),t}function pt(e={},t=ht()){const n=mt(e);let r=n.map(e=>t.get(e)).find(Boolean);return r||n.length||(r=t.get(gt(e))),r?{...e,
debtAmount:Number(r.debtAmount||0),orderCount:Number(r.orderCount||0),oldestDebtDate:r.oldestDebtDate||e.oldestDebtDate||""}:{...e,debtAmount:et(e)}}const bt=S({tabs:re,panels:oe,
panelIds:["customersTab","orderTab","cartTab","debtTab","reportTab"],initialPanel:"customersTab",fallbackPanel:"customersTab",hashByPanel:{customersTab:"#khach-hang",
orderTab:"#ban-hang",cartTab:"#gio-hang",debtTab:"#cong-no",reportTab:"#don-hang"},onActivate(e){ee=e,"debtTab"===e&&Xt(),"reportTab"===e&&on(),"orderTab"!==e&&"cartTab"!==e||Vt()}
});function yt(e,t={}){ee=bt.switchPanel(e,t)}const ft=N(_e);function vt(){if(!qe)return;const e=!1!==navigator.onLine;qe.textContent=e?"Đang online":"Đang offline",
qe.classList.toggle("offline",!e),qe.classList.toggle("online",e)}function Ct(e,t={}){P(e,t,u)}function St(){return String(xe?.value||"all")}function Nt(e={}){const t=St()
;return"pending_sync"===t?!0===e.pendingSync:"editable"===t?!0!==e.pendingSync&&!0===e.canEdit:"locked"!==t||!0!==e.pendingSync&&!0!==e.canEdit}function Pt(e={}){
const t=String(Le?.value||"").trim().toLowerCase();return!t||[e.code,e.customerCode,e.customerName].some(e=>String(e||"").toLowerCase().includes(t))}
const Et="mkpro_mobile_sales_draft_v1";function kt(){return`${Et}:${at()||E.id||E.username||"sales"}`}function wt(){return Boolean(A.length||B||Number(be?.value||0)>0)}
function At(){try{if(!wt())return void localStorage.removeItem(kt());localStorage.setItem(kt(),JSON.stringify({selectedCustomer:k,cart:A,editingOrderId:B,paidAmount:be?.value||"",
savedAt:(new Date).toISOString()}))}catch(e){}}function Bt(){try{localStorage.removeItem(kt())}catch(e){}}function It(){
if(!k)return me.textContent="Chưa chọn khách hàng. Hãy sang tab Khách hàng để chọn.",me.classList.add("muted"),void(fe&&(fe.textContent="Chưa chọn khách hàng cho đơn này.",
fe.classList.add("muted")))
;const e=ct(k),t=st(k),n=`<strong>${u(e||"")}${e&&t?" - ":""}${u(t||"")}</strong><br /><span>SĐT: ${u(dt(k))}</span><br /><span>ĐC: ${u(ut(k))}</span><br /><span>Nợ: ${g(et(k))} · DS tháng: ${g(rt(k))}</span>`
;me.innerHTML=n,me.classList.remove("muted"),fe&&(fe.innerHTML=`<span>Đơn đang lập cho</span><br />${n}`,fe.classList.remove("muted"))}function Lt(e={}){
const t=e.payload||{},n=t.customer||{},r=(Array.isArray(t.items)?t.items:[]).reduce((e,t)=>e+Number(t.amount||Number(t.quantity||t.qty||0)*Number(t.salePrice||t.unitPrice||t.price||0)),0),o=Number(t.paidAmount||0)
;return{id:e.operationId,code:`OFFLINE-${String(e.operationId||"").slice(-8).toUpperCase()}`,date:String(e.clientCreatedAt||"").slice(0,10),customerName:st(n)||t.customerName||"",
customerCode:ct(n)||t.customerCode||"",totalAmount:r,paidAmount:o,debtAmount:Math.max(0,r-o),status:e.status||"pending",deliveryStatus:"pending_sync",pendingSync:!0,
syncError:e.lastError||"",canEdit:!1,editLockReason:"conflict"===e.status?"Cần xử lý xung đột đồng bộ":"Đang chờ đồng bộ lên máy chủ"}}async function $t(){try{const e=await c({
statuses:["pending","failed","conflict"],limit:100});_=e.filter(e=>"sales_order_create"===e.type).map(Lt),Re&&(Re.textContent=String(_.length),Re.hidden=0===_.length),rn(L)
}catch(e){_=[],Re&&(Re.hidden=!0)}}async function xt(e="",t={}){const n=!0===t.append;if(U)return;if(n&&!K)return;const o=++q,a=n?H+1:1;U=!0,F=e,b(ce,!0,"Đang tải...");try{
n||Ct(ie,{state:"loading",baseClass:"customer-list",title:e?"Đang tìm khách hàng...":"Đang tải khách hàng phụ trách..."});const t=await async function(e="",t={}){
return r.getCustomers(e,{page:t.page||1,limit:t.limit||40,requestKey:"mobile-customers",cancelPrevious:!1!==t.cancelPrevious})}(e,{page:a,cancelPrevious:!n});if(o!==q)return
;const i=t.items||t.customers||[];H=Number(t.pagination?.page||a),K=Boolean(t.pagination?.hasMore),I=n?function(e=[],t=[]){const n=new Map;return[...e,...t].forEach(e=>{
const t=mt(e)[0]||`ROW:${n.size}`;n.set(t,{...n.get(t)||{},...e})}),[...n.values()]}(I,i):i,Dt(I),ce&&(ce.hidden=!K)}catch(e){if(o!==q||"REQUEST_ABORTED"===e?.code)return
;n?y(Me,e.message||"Không tải thêm được khách hàng","error"):Ct(ie,{state:"error",baseClass:"customer-list",title:"Không tải được khách hàng",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"customers"})}finally{o===q&&(U=!1),b(ce,!1)}}function Dt(e){
const t=ht(),n=(Array.isArray(e)?e:[]).map(e=>pt(e,t)).sort((e,t)=>et(t)-et(e));I=n,n.length?(ie.className="customer-list",ie.innerHTML=n.map((e,t)=>{
const n=ct(e),r=st(e),o=et(e),a=dt(e),i=ut(e);return`\n      <button class="customer-card ${function(e={}){const t=et(e)
;return t>1e7?"debt-high":t>=3e6?"debt-mid":t>0?"debt-low":"debt-zero"
}(e)}" data-customer-index="${t}">\n        <strong>${u(n||"")}${n&&r?" - ":""}${u(r||"")}</strong>\n        <span class="customer-contact">SĐT: ${u(a)}</span>\n        <span class="customer-contact">ĐC: ${u(i)}</span>\n        <div class="customer-metrics">\n          <em class="metric-debt">Nợ: ${g(o)}</em>\n          <em>DS tháng: ${g(rt(e))}</em>\n        </div>\n      </button>\n    `
}).join(""),ie.querySelectorAll("[data-customer-index]").forEach(e=>{e.addEventListener("click",()=>function(e){const t=lt(pt(e)),n=mt(k||{})[0]||"",r=mt(t)[0]||""
;if(Boolean(k&&(n||r)&&n!==r)&&(A.length||B)){if(!window.confirm("Giỏ hiện tại đang thuộc khách hàng khác. Đổi khách sẽ xóa toàn bộ giỏ đang nhập. Bạn có chắc không?"))return;A=[],
B="",be.value="",Yt()}k=t,It(),At(),y(Me,"Đã chọn khách hàng. Hãy thêm sản phẩm vào giỏ.","success"),yt("orderTab"),Vt(),setTimeout(()=>se.focus(),200)
}(I[Number(e.dataset.customerIndex)]))})):Ct(ie,{state:"empty",baseClass:"customer-list",title:"Không có khách hàng phù hợp",
detail:ae.value.trim()?"Hãy thử từ khóa ngắn hơn hoặc kiểm tra mã khách.":"Danh sách khách hàng phụ trách đang trống."})}function Mt(e={}){
const t=Number(e.conversionRate??e.unitsPerCase??e.packingQty??e.packQty??e.pack??e.packageQty??1);return Number.isFinite(t)&&t>0?t:1}function Tt(e={},t={}){const n=Mt(t)
;return e.conversionRate=n,e.packingQty=n,e.unitsPerCase=n,e}function Ot(e,t){return n(e,t).display}function Qt(e={}){const t=Mt(e);return Ot(Number(e.quantity||e.qty||0),t)}
function Rt(e={}){return{productId:e.productId||e.id||e.productCode,productCode:e.productCode||e.code,productName:e.productName||e.name,quantity:Number(e.quantity||0),
conversionRate:Mt(e),grossPrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
salePrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
price:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0)}}async function qt(e={}){if(!A.length)return;const n=!!e.silent;try{
const e=await r.calculatePromotions({date:t(),saleDate:t(),items:A.map(Rt)
}),n=Array.isArray(e?.result?.lines)?e.result.lines:[],o=new Map(n.map(e=>[String(e.productCode||e.code||"").trim(),e]));A=A.map(e=>{
const t=String(e.productCode||e.code||"").trim(),n=o.get(t)||{},r=Number(e.quantity||0),a=Number(n.catalogSalePrice||e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),i=Math.round(r*a),c=Number(n.directDiscountAmount||0),s=Number(n.groupDiscountAmount||0),d=Math.min(i,Math.max(0,c+s)),u=Math.max(0,i-d),l=r>0?Math.round(u/r):a,m=Array.isArray(n.promotionRows)?n.promotionRows:[],g=m[0]||n.directPromotionRule||{}
;return Tt({...e,originalPrice:a,grossPrice:a,catalogSalePrice:a,grossAmount:i,directDiscountPercent:Number(n.directDiscountPercent||0),
groupDiscountPercent:Number(n.groupDiscountPercent||0),discountPercent:i>0?d/i*100:0,directDiscountAmount:c,groupDiscountAmount:s,discountAmount:d,promotionAmount:d,
totalDiscountAmount:d,finalPrice:l,unitPrice:l,salePrice:l,price:l,amount:u,netAmount:u,saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,
lockedPrice:!0,lockedPromotion:!0,promotionCalculated:!0,promotionCode:n.promotionCode||g.promotionCode||g.code||g.programCode||"",
promotionName:n.promotionName||g.description||g.programName||g.name||"",promotionRows:m},e)})}catch(e){n||y(Me,e.message||"Không tính được khuyến mại cho giỏ hàng","error"),
A=A.map(e=>{const t=Number(e.quantity||0),n=Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0);return{...e,originalPrice:n,grossPrice:n,
catalogSalePrice:n,unitPrice:n,salePrice:n,price:n,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(t*n),saleMethod:"promotion",saleMode:"promotion",
pricingMode:"promotion",priceLocked:!0}})}}function _t(e={}){
const t=Number(e._availableQty??e.availableQty??e.availableStock??e.stockQuantity??e.stock??0),n=e.code||e.productCode||e.sku||"",r=e.name||e.productName||"",o=String(e.groupName||e.productGroupName||e.productGroup||e.group||e.categoryName||e.category||"").trim(),a=e.internalSaleQuota&&"object"==typeof e.internalSaleQuota?e.internalSaleQuota:{},i=Math.max(0,Number(e.maxOrderQty??a.currentlyAllowedQty??a.remainingQty??0))
;return{...e,id:e.id||e._id||n,code:n,name:r,groupName:o,category:e.category||o,salePrice:Number(e.salePrice||e.price||0),availableQty:t,stockQuantity:t,conversionRate:Mt(e),
packingQty:Mt(e),unitsPerCase:Mt(e),stockDisplay:Ot(t,Mt(e)),maxOrderQty:i,internalSaleQuota:{...a,remainingQty:Math.max(0,Number(a.remainingQty||0)),currentlyAllowedQty:i}}}
function Ht(e=""){return String(e||"").trim()}function Kt(e=""){
return String(e||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Ut(){return Ht(de?.value||"")}
function Ft(){w=null,se&&(se.dataset.id="",se.dataset.code="",se.dataset.name="",se.dataset.type=""),ge.textContent="Chưa chọn sản phẩm",ge.classList.add("muted")}function Gt(e){
const t=_t(e);w=t,se.dataset.id=t.id||"",se.dataset.code=t.code||"",se.dataset.name=t.name||"",se.dataset.type="product",
se.value=t.label||[t.code,t.name].filter(Boolean).join(" - ")
;const n=Number(t.finalPrice||t.unitPrice||t.salePrice||t.price||0),r=Number(t.originalPrice||t.grossPrice||t.catalogSalePrice||t.salePrice||t.price||0),o=r>n?`Giá KM<strong>${g(n)}</strong>`:`Giá bán<strong>${g(n)}</strong>`,a=r>n?`<span>Giá gốc<strong>${g(r)}</strong></span>`:""
;ge.innerHTML=`\n    <div class="mobile-selected-product-name">${u(t.code||"")} - ${u(t.name||"")}</div>\n    <div class="mobile-selected-product-meta">\n      <span>Tồn thực tế<strong>${u(t.stockDisplay||Ot(t.availableQty,t.conversionRate))}</strong></span>\n      <span class="mobile-app-quota-meta">Được bán App<strong>${u(Ot(t.maxOrderQty,t.conversionRate))}</strong></span>\n      <span>${o}</span>\n      ${a}\n    </div>\n    <div class="mobile-selected-product-quota-note">Hạn mức theo file DMS: ${u(t.internalSaleQuota?.snapshotDate||"chưa cập nhật")}</div>\n  `,
ge.classList.remove("muted"),le.innerHTML="",le.classList.remove("has-many"),le.hidden=!0,le.style.display="none",pe.focus()}function jt(e){if(Array.isArray(e))return e
;if(!e||"object"!=typeof e)return[];const t=e.items||e.products||e.rows||e.data||e.result||[];return Array.isArray(t)?t:[]}function Vt(){Z||(Z=!0,
se&&le&&(window.SearchAutocomplete&&window.UnifiedProductSearch?(window.SearchAutocomplete.wire({input:se,box:le,getItems:()=>async function(e=""){const t=String(e||"").trim()
;if(t.length<2)return[];try{const e=jt(await r.getProducts(t,{limit:50,group:Ut()})).map(_t)
;return window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.sync&&window.UnifiedProductSearch.sync(e),e}catch(e){
console.warn("[mobile-sales] mobile product search fallback:",e.message||e)}
return window.UnifiedSearchEngine&&"function"==typeof window.UnifiedSearchEngine.searchProduct?jt(await window.UnifiedSearchEngine.searchProduct(t,{limit:50,mode:"sales",
includeStock:1,group:Ut()})).map(_t):window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.search?jt(await window.UnifiedProductSearch.search(t,{limit:50,
mode:"sales",group:Ut()})).map(_t):[]}(se.value.trim()),
label:e=>window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.label?window.UnifiedProductSearch.label(e,"sales"):e.label||[e.code,e.name].filter(Boolean).join(" - "),
select:Gt,emptyText:"Không tìm thấy sản phẩm phù hợp"}),se.addEventListener("input",Ft),de?.addEventListener("change",()=>{Ft(),se&&(se.value=""),le&&(le.innerHTML="",
le.classList.remove("has-many"),le.hidden=!0,le.style.display="none")}),async function(e=!1){if(de&&(!ue||e)){ue=!0;try{const e=await r.getProductGroups();!function(e=[]){
if(!de)return;const t=Ut(),n=[...new Set((e||[]).map(Ht).filter(Boolean))].sort((e,t)=>e.localeCompare(t,"vi",{numeric:!0}))
;de.innerHTML=['<option value="">Tất cả nhóm hàng</option>',...n.map(e=>`<option value="${Kt(e)}">${Kt(e)}</option>`)].join(""),t&&n.includes(t)&&(de.value=t)
}(e.items||e.groups||[])}catch(e){ue=!1,"REQUEST_ABORTED"!==e?.code&&console.warn("[mobile-sales] không tải được nhóm hàng sản phẩm:",e.message||e)}}}(),
se.addEventListener("focus",()=>{se.dispatchEvent(new Event("input",{bubbles:!0}))}),se.addEventListener("keydown",e=>{"Escape"===e.key&&(le.innerHTML="",
le.classList.remove("has-many"))})):le.innerHTML='<div class="suggestion-empty">Thiếu engine gợi ý sản phẩm dùng chung.</div>'))}function zt(e={}){
return String(e.customerId||e.customerCode||e.code||e.id||e._id||e.customerName||"").trim()}function Wt(e,t={}){const n="collect"===e?"collect":"customers";T=n,
ze?.classList.toggle("active","customers"===n),We?.classList.toggle("active","collect"===n),ze?.setAttribute("aria-selected",String("customers"===n)),
We?.setAttribute("aria-selected",String("collect"===n)),Xe?.classList.toggle("active","customers"===n),Je?.classList.toggle("active","collect"===n),
"collect"!==n?!1!==t.restoreScroll&&window.requestAnimationFrame(()=>window.scrollTo({top:R,behavior:"auto"})):!1!==t.scroll&&document.getElementById("debtTab")?.scrollIntoView({
block:"start",behavior:t.behavior||"smooth"})}async function Xt(e={}){const t=!0===e.append,n=!0===e.force,o=document.getElementById("debtTab")?.classList.contains("active")
;if(D)return;if(t&&!j)return;if(x&&!n&&!t)return void Jt($,V);const a=++M,i=t?G+1:1;D=!0,b(Ke,!0,"Đang tải...");try{He&&!t&&o&&Ct(He,{state:"loading",baseClass:"order-list",
title:"Đang tải công nợ..."});const e=await r.getSalesDebts({page:i,limit:30,includePaid:"0",includePendingCollections:"1",collectorType:"sales",cancelPrevious:!t});if(a!==M)return
;const n=Array.isArray(e.items)?e.items:[];G=Number(e.pagination?.page||i),j=Boolean(e.pagination?.hasMore),V=e.summary||V||{},$=t?function(e=[],t=[]){const n=new Map
;return[...e,...t].forEach(e=>{const t=zt(e)||`ROW:${n.size}`,r=n.get(t);n.set(t,r?{...r,...e}:e)}),[...n.values()]}($,n):n,x=!0,Jt($,V),Ke&&(Ke.hidden=!j),
Array.isArray(I)&&I.length&&Dt(I)}catch(e){if(a!==M||"REQUEST_ABORTED"===e?.code)return;t||(x=!1),He&&o&&!t?Ct(He,{state:"error",baseClass:"order-list",
title:"Không tải được công nợ",detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"debts"}):y(Ve,e.message||"Không tải thêm được công nợ","error")}finally{
a===M&&(D=!1),b(Ke,!1)}}function Jt(e=$,t={}){const n=Number(t.totalDebt??e.reduce((e,t)=>e+Number(t.debtAmount||0),0)),r=Number(t.pendingCollected??e.reduce((e,t)=>e+nt(t),0))
;if(Fe&&(Fe.textContent=g(n)),Ge&&(Ge.textContent=String(t.customerCount??e.length)),je&&(je.textContent=g(r)),Zt(e),O){const e=O&&$.find(e=>zt(e)===O)||null;e?Q||tn(e):(O="",Q=!1,
tn())}else tn()}function Yt(){It(),At(),function(){const e=C(A);ve.textContent=`${A.length} dòng`,Qe&&(Qe.textContent=String(A.length)),Se&&(Se.textContent=g(e.gross)),
Ne&&(Ne.textContent=e.discount>0?`-${g(e.discount)}`:g(0)),Ce.textContent=g(e.payable),Ee&&(Ee.textContent=`${A.length} sản phẩm`),ke&&(ke.textContent=g(e.payable)),
Pe&&(Pe.hidden=0===A.length),Oe&&(Oe.disabled=!k||0===A.length)}(),A.length?(ye.className="cart-list",ye.innerHTML=f(A,{escapeHtml:u,money:g,normalizePackingRate:Mt,
quantityDisplay:Qt})):Ct(ye,{state:"empty",baseClass:"cart-list",title:"Giỏ hàng chưa có sản phẩm",
detail:k?"Quay lại Bán hàng để chọn sản phẩm.":"Hãy chọn khách hàng trước khi lập đơn."})}function Zt(e=$){if(!He)return;const t=Array.isArray(e)?e:[]
;if(!t.length)return void Ct(He,{state:"empty",baseClass:"order-list",title:"Không có khách hàng còn nợ",detail:"Danh sách sẽ cập nhật khi có công nợ phát sinh."})
;const n=function(e=$){const t=String(Ye?.value||"").trim().toLowerCase(),n=String(Ze?.value||"debt_desc"),r=(Array.isArray(e)?e:[]).map((e,t)=>({item:e,originalIndex:t
})).filter(({item:e})=>!t||[e.customerCode,e.customerName,e.phone,e.customerPhone].some(e=>String(e||"").toLowerCase().includes(t)));return r.sort((e,t)=>{const r=e.item,o=t.item
;if("available_desc"===n)return tt(o)-tt(r);if("oldest_asc"===n){const e=m(r.oldestDebtDate||"9999-12-31"),t=m(o.oldestDebtDate||"9999-12-31");return e.localeCompare(t)}
return et(o)-et(r)}),r}(t);n.length?(He.className="order-list debt-customer-list",He.innerHTML=n.map(({item:e,originalIndex:t})=>{const n=tt(e),r=n<=0
;return`\n      <article class="debt-card${zt(e)===O?" selected":""}">\n        <div class="debt-card-content">\n          <strong>${u(e.customerCode||"")} - ${u(e.customerName||"")}</strong>\n          <span>Công nợ: ${g(e.debtAmount||0)} · Chờ KT: ${g(nt(e))} · Có thể thu: ${g(n)}</span>\n          <span>${e.orderCount||0} đơn · Nợ cũ nhất: ${l(e.oldestDebtDate||"")}</span>\n        </div>\n        <button type="button" class="${r?"ghost-btn":"primary-btn"} small-btn debt-collect-action" data-debt-index="${t}" ${r?'disabled aria-disabled="true"':""}>\n          ${r?"Đang chờ KT":"Thu nợ"}\n        </button>\n      </article>`
}).join(""),He.querySelectorAll("[data-debt-index]:not([disabled])").forEach(e=>{e.addEventListener("click",()=>function(e={}){const t=zt(e)
;!t||tt(e)<=0||(O!==t?Q&&O&&O!==t&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.")||(R=window.scrollY||document.documentElement.scrollTop||0,
O=t,Q=!1,tn(e),Wt("collect")):Wt("collect"))}(t[Number(e.dataset.debtIndex)]))})):Ct(He,{state:"empty",baseClass:"order-list",title:"Không tìm thấy khách hàng phù hợp",
detail:"Hãy thử mã khách, tên hoặc số điện thoại khác."})}function en(e={}){const t=Array.isArray(e.orders)?e.orders:[]
;return t.length?t.filter(e=>Number(e.availableDebt??e.debt??0)>0):(Array.isArray(e.ledgers)?e.ledgers:[]).filter(e=>Number(e.debt||0)>0).map(e=>({
salesOrderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderDate:e.date||e.documentDate||"",debt:Number(e.debt||0),
availableDebt:Number(e.debt||0),pendingCollectedAmount:0}))}function tn(e={}){if(!Ue)return;if(!zt(e))return Ue.className="order-list empty",
Ue.innerHTML='\n      <div class="debt-empty-state">\n        <strong>Chưa chọn khách hàng để thu nợ</strong>\n        <span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span>\n        <button id="chooseDebtCustomerBtn" type="button" class="ghost-btn">Chọn khách hàng</button>\n      </div>',
void document.getElementById("chooseDebtCustomerBtn")?.addEventListener("click",()=>Wt("customers"));const t=Array.isArray(e.ledgers)?e.ledgers:[],n=en(e);let o=0
;const c=t.length?`\n    <details class="debt-ledger-details">\n      <summary>Sổ công nợ (${t.length} dòng)</summary>\n      <div class="order-list">\n        ${t.map(e=>(o+=Number(e.debit||0)-Number(e.credit||0),
`\n            <div class="order-item">\n              <strong>${u(l(e.date))} · ${u(e.type||e.refType||"")}</strong>\n              <span>Đơn: ${u(e.salesOrderCode||e.refCode||"")}</span>\n              <span>Phát sinh: ${g(e.debit||0)} · Thanh toán: ${g(e.credit||0)} · Dư nợ: ${g(Math.max(0,o))}</span>\n            </div>`)).join("")}\n      </div>\n    </details>`:"",s=`\n    <div class="debt-selected-customer">\n      <strong>${u(e.customerCode||"")} - ${u(e.customerName||"")}</strong>\n      <span>Nợ: ${g(et(e))} · Chờ KT: ${g(nt(e))} · Có thể thu: ${g(tt(e))}</span>\n    </div>`,d=n.length?`\n    <form id="mobileDebtCollectionForm" class="order-list mobile-debt-collection-form">\n      <strong>Báo thu nợ chờ kế toán xác nhận</strong>\n      <span>Chọn đơn nợ, nhập số tiền đã thu. Công nợ chỉ giảm sau khi kế toán xác nhận.</span>\n      <div class="order-list debt-order-selection-list">\n        ${n.map((e,t)=>`\n          <label class="order-item debt-order-check-row">\n            <input type="checkbox" class="mobile-debt-order-check" data-index="${t}" checked />\n            <strong>${u(e.salesOrderCode||e.orderCode||"")}</strong>\n            <span>Ngày: ${l(e.orderDate||e.documentDate||"")} · Nợ: ${g(e.debt||0)} · Chờ KT: ${g(e.pendingCollectedAmount||0)} · Có thể thu: ${g(e.availableDebt??e.debt??0)}</span>\n          </label>`).join("")}\n      </div>\n      <label>Số tiền đã thu<input id="mobileDebtCollectionAmount" name="amount" inputmode="numeric" value="${Math.max(0,Math.round(tt(e)))}" /></label>\n      <label>Hình thức<select id="mobileDebtCollectionMethod" name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>\n      <label>Ghi chú<input id="mobileDebtCollectionNote" name="note" placeholder="VD: Khách trả một phần" /></label>\n      <div class="debt-submit-bar">\n        <button type="submit" class="primary-btn full-btn">Gửi phiếu thu chờ kế toán</button>\n      </div>\n      <p id="mobileDebtCollectionMessage" class="message"></p>\n    </form>`:'\n      <div class="order-item debt-no-available">\n        <strong>Không còn số tiền có thể thu</strong>\n        <span>Khách hàng đang có phiếu thu chờ kế toán hoặc công nợ đã được xử lý.</span>\n      </div>'
;Ue.className="order-list",Ue.innerHTML=s+d+c,Ue.querySelectorAll(".mobile-debt-order-check").forEach(t=>{t.addEventListener("change",()=>function(e={}){
const t=en(e),n=[...document.querySelectorAll(".mobile-debt-order-check:checked")].reduce((e,n)=>{const r=t[Number(n.dataset.index)]
;return e+Math.max(0,Number(r?.availableDebt??r?.debt??0))},0),r=document.getElementById("mobileDebtCollectionAmount");r&&(r.value=String(n)),Q=!0}(e))})
;const m=document.getElementById("mobileDebtCollectionForm");m&&(m.addEventListener("input",()=>{Q=!0}),m.addEventListener("change",()=>{Q=!0}),
m.addEventListener("submit",t=>async function(e,t={}){e.preventDefault();const n=e.target,o=document.getElementById("mobileDebtCollectionMessage"),c=function(e){
if("number"==typeof e)return Number.isFinite(e)?Math.max(0,Math.round(e)):0;const t=String(e||"").trim().toLowerCase();if(!t)return 0
;const n=t.endsWith("k")?1e3:t.endsWith("tr")?1e6:1,r=t.replace(/tr|k/g,"").replace(/[^0-9,.-]/g,"").replace(/[.,](?=\d{3}(\D|$))/g,"").replace(",","."),o=Number(r)
;return Number.isFinite(o)?Math.max(0,Math.round(o*n)):0}(n.elements.amount?.value||0);if(c<=0)return y(o,"Số tiền thu phải lớn hơn 0","error");const s=function(e={},t=0){
const n=en(e),r=[...document.querySelectorAll(".mobile-debt-order-check:checked")].map(e=>Number(e.dataset.index)).filter(e=>Number.isFinite(e));let o=Math.max(0,Number(t||0))
;const a=[];return r.forEach(e=>{const t=n[e],r=Math.max(0,Number(t?.availableDebt??t?.debt??0)),i=Math.min(r,o);t&&i>0&&(a.push({salesOrderId:t.salesOrderId||t.orderId||"",
salesOrderCode:t.salesOrderCode||t.orderCode||"",allocatedAmount:i}),o-=i)}),a}(t,c);if(!s.length)return y(o,"Cần chọn ít nhất một đơn nợ","error")
;if(s.reduce((e,t)=>e+Number(t.allocatedAmount||0),0)!==c)return y(o,"Tổng tiền phân bổ phải bằng số tiền thu","error");const d=n.querySelector('button[type="submit"]')
;b(d,!0,"Đang gửi...");const u={customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",amount:c,
paymentMethod:n.elements.paymentMethod?.value||"cash",note:n.elements.note?.value||"",allocations:s};try{
const e=(await r.submitDebtCollection(u)).message||"Đã ghi nhận thu nợ, chờ kế toán xác nhận";y(o,e,"success"),y(Ve,e,"success"),Q=!1,O="",x=!1,await Xt({force:!0}),
Wt("customers",{restoreScroll:!0})}catch(e){i(e)?(await a("debt_collection_submit",u),y(o,"Đã lưu phiếu thu offline, hệ thống sẽ tự đồng bộ khi có mạng","success"),
Q=!1):y(o,e.message||"Không gửi được phiếu thu nợ","error")}finally{b(d,!1)}}(t,e)))}function nn(e=!0){A=[],B="",w=null,se.value="",he.value="",pe.value="",be.value="",
ge.textContent="Chưa chọn sản phẩm",ge.classList.add("muted"),Te.textContent="Đặt hàng",Oe.textContent="Xác nhận đơn",e&&(k=null,
y(Me,"Đã làm mới đơn. Hãy chọn khách hàng ở tab 1.","success")),It(),Yt(),wt()||Bt()}function rn(e=L,n=Y){L=Array.isArray(e)?e:[]
;const r=L,o=String($e?.value||t()),a=[..._.filter(e=>!o||String(e.date||"").slice(0,10)===o),...r],i=a.filter(Pt).filter(Nt),c=Number(n?.totalAmount??r.reduce((e,t)=>e+Number(t.totalAmount||0),0)),s=Number(n?.paidAmount??r.reduce((e,t)=>e+Number(t.paidAmount||0),0)),d=Number(n?.debtAmount??r.reduce((e,t)=>e+Number(t.debtAmount||0),0)),m=Number(n?.orderCount??r.length)
;if(document.getElementById("todayRevenue").textContent=g(c),document.getElementById("todayOrderCount").textContent=String(m),document.getElementById("todayPaid").textContent=g(s),
document.getElementById("todayDebt").textContent=g(d),De&&(De.textContent=`${i.length} đơn`),Ie&&(Ie.hidden=!W||"pending_sync"===St()),!i.length){const e=a.length>0
;return void Ct(Be,{state:"empty",baseClass:"order-list",title:e?"Không có đơn phù hợp bộ lọc":"Chưa có đơn trong ngày đã chọn",
detail:e?"Hãy đổi từ khóa hoặc trạng thái hiển thị.":"Đơn online và đơn chờ đồng bộ sẽ xuất hiện tại đây."})}Be.className="order-list mobile-order-list",Be.innerHTML=v(i,{
escapeHtml:u,money:g,formatDate:l})}async function on(e={}){const n=!0===e.append,o=!0===e.force,a=JSON.stringify({date:String($e?.value||t()),q:String(Le?.value||"").trim()})
;if(n&&ne!==a)return on({reset:!0,force:!0});if(J)return;if(n&&!W)return;if(X&&ne===a&&!o&&!n)return void rn(L,Y);const i=++te,c=n?z+1:1;J=!0,b(Ie,!0,"Đang tải...");try{n||Ct(Be,{
state:"loading",baseClass:"order-list",title:"Đang tải đơn hàng..."});const e=await r.getMySalesOrders({page:c,limit:30,date:String($e?.value||t()),q:String(Le?.value||"").trim(),
requestKey:"mobile-sales-orders",cancelPrevious:!n});if(i!==te)return;const o=e.items||[],s=function(e=[]){const t=Array.isArray(e)?e:[];if("sales"!==String(E.role||""))return t
;const n=ot(at());return n?t.filter(e=>ot(function(e={}){
return String(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH||e.salesStaff&&e.salesStaff.code||"").trim()}(e))===n):[]}(o)
;z=Number(e.pagination?.page||c),W=Boolean(e.pagination?.hasMore),Y=e.summary||Y||{},L=n?function(e=[],t=[]){const n=new Map;return[...e,...t].forEach(e=>{
const t=String(e.id||e.code||`ROW:${n.size}`);n.set(t,{...n.get(t)||{},...e})}),[...n.values()]}(L,s):s,X=!0,ne=a,rn(L,Y),Ie&&(Ie.hidden=!W||"pending_sync"===St()),
o.length!==s.length&&console.warn("[MOBILE_SALES_OWNER_GUARD]",{currentSalesStaffCode:at(),received:o.length,rendered:s.length})}catch(e){
if(i!==te||"REQUEST_ABORTED"===e?.code)return;n?ft(e.message||"Không tải thêm được đơn hàng","error",{persist:!0}):(X=!1,ne="",Ct(Be,{state:"error",baseClass:"order-list",
title:"Không tải được đơn hàng",detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"orders"}))}finally{i===te&&(J=!1),b(Ie,!1)}}
re.forEach(e=>e.addEventListener("click",()=>yt(e.dataset.tab))),we?.addEventListener("click",()=>yt("cartTab")),Ae?.addEventListener("click",()=>yt("orderTab",{
historyMode:"replace"})),document.addEventListener("click",e=>{const t=e.target.closest("[data-mobile-retry]");if(!t)return;const n=t.dataset.mobileRetry
;"customers"===n&&xt(ae.value.trim(),{reset:!0,force:!0}),"orders"===n&&on({reset:!0,force:!0}),"debts"===n&&Xt({reset:!0,force:!0})}),
ae.addEventListener("input",d(()=>xt(ae.value.trim(),{reset:!0}),250)),document.getElementById("reloadCustomersBtn")?.addEventListener("click",()=>{
window.CatalogCache&&window.CatalogCache.invalidate("customers"),xt(ae.value.trim(),{reset:!0,force:!0})}),ce?.addEventListener("click",()=>xt(F,{append:!0})),
document.getElementById("reloadOrdersBtn")?.addEventListener("click",()=>on({reset:!0,force:!0})),Ie?.addEventListener("click",()=>on({append:!0})),
Ke?.addEventListener("click",()=>Xt({append:!0})),Le?.addEventListener("input",d(()=>{X=!1,ne="",on({reset:!0,force:!0})},300)),$e?.addEventListener("change",()=>{X=!1,ne="",on({
reset:!0,force:!0})}),xe?.addEventListener("change",()=>rn(L,Y)),Be?.addEventListener("click",async e=>{const t=e.target.closest("[data-edit-order]");if(t&&Be.contains(t)){
b(t,!0,"Đang mở...");try{await async function(e){try{const t=(await r.getSalesOrder(e)).order
;if(!t.canEdit)return y(Me,t.editLockReason||"Đơn hiện không thể chỉnh sửa trên app bán hàng.","error");B=t.id||t.code,k={id:t.customerId,code:t.customerCode,name:t.customerName,
phone:t.customerPhone,address:t.customerAddress,debtAmount:t.customerDebt||0,monthRevenue:t.customerMonthRevenue||0},It(),A=(t.items||[]).map(e=>({
productId:e.productId||e.productCode,productCode:e.productCode,productName:e.productName,unit:e.unit,conversionRate:e.conversionRate,quantity:Number(e.quantity||0),
originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),unitPrice:Number(e.unitPrice||e.salePrice||e.price||0),
salePrice:Number(e.salePrice||e.unitPrice||e.price||0),price:Number(e.price||e.unitPrice||e.salePrice||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),promotionAmount:Number(e.promotionAmount||e.discountAmount||e.totalDiscountAmount||0),
amount:Number(e.amount||Number(e.quantity||0)*Number(e.unitPrice||e.salePrice||e.price||0)),promotionCode:e.promotionCode||"",promotionName:e.promotionName||""})),
be.value=Number(t.paidAmount||0),Te.textContent=`Sửa đơn ${t.code||""}`,Oe.textContent=`Lưu sửa đơn ${t.code||""}`,await qt({silent:!0}),Yt()
;const n=`Đang sửa đơn ${t.code||""}. Hệ thống sẽ tính lại giá, khuyến mại và tồn kho khi lưu.`;y(Me,n,"success"),ft(n,"info"),yt("orderTab")}catch(e){y(Me,e.message,"error")}
}(t.dataset.editOrder)}finally{b(t,!1)}return}const n=e.target.closest("[data-delete-order]");if(n&&Be.contains(n)){b(n,!0,"Đang xóa...");try{await async function(e,t){
if(window.confirm(`Xóa đơn ${t||e}? Chỉ xóa được khi đơn chưa gộp đơn tổng.`))try{const n=await r.deleteSalesOrder(e)
;L=L.filter(n=>String(n.id||n.code||"")!==String(e||"")&&String(n.code||"")!==String(t||"")),rn(L,Y),await on({reset:!0,force:!0});const o=n.message||"Đã xóa đơn"
;y(Me,o,"success"),ft(o,"success")}catch(e){y(Me,e.message,"error"),ft(e.message||"Không xóa được đơn.","error",{persist:!0})}}(n.dataset.deleteOrder,n.dataset.orderCode)}finally{
b(n,!1)}}}),document.getElementById("reloadDebtsBtn")?.addEventListener("click",()=>{Q&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")||(Q=!1,
Xt({reset:!0,force:!0}))}),ze?.addEventListener("click",()=>Wt("customers")),We?.addEventListener("click",()=>Wt("collect")),Ye?.addEventListener("input",()=>Zt($)),
Ze?.addEventListener("change",()=>Zt($)),document.getElementById("clearOrderBtn")?.addEventListener("click",()=>{
wt()&&!window.confirm("Làm mới sẽ xóa khách hàng và toàn bộ giỏ đang nhập. Bạn có chắc không?")||nn(!0)}),document.getElementById("logoutBtn")?.addEventListener("click",e=>{
wt()&&(window.confirm("Bạn đang có đơn chưa lưu. Thoát ứng dụng vẫn giữ bản nháp trên thiết bị. Bạn có chắc muốn thoát?")||(e.preventDefault(),e.stopImmediatePropagation()))},!0),
be?.addEventListener("input",At),window.addEventListener("beforeunload",e=>{wt()&&(e.preventDefault(),e.returnValue="")}),window.addEventListener("mkpro:offline-queued",e=>{
"sales_order_create"===e.detail?.type&&($t(),ft("Đơn đã được lưu trên thiết bị và đang chờ đồng bộ.","warning",{persist:!0}))}),
window.addEventListener("mkpro:offline-synced",async()=>{await $t(),X&&await on({reset:!0,force:!0}),ft("Đã đồng bộ dữ liệu chờ lên máy chủ.","success")}),
window.addEventListener("online",()=>{vt(),ft("Đã có kết nối mạng. Hệ thống sẽ đồng bộ dữ liệu chờ.","success")}),window.addEventListener("offline",()=>{vt(),
ft("Mất kết nối mạng. Đơn mới sẽ được lưu chờ đồng bộ.","warning",{persist:!0})}),async function(){vt(),ee=bt.initialize(),$e&&!$e.value&&($e.value=t()),
ye&&"1"!==ye.dataset.phase3Bound&&(ye.dataset.phase3Bound="1",ye.addEventListener("click",async e=>{const t=e.target.closest("[data-remove]");if(t&&ye.contains(t)){
const e=Number(t.dataset.remove),n=A[e];if(!n)return;if(!window.confirm(`Xóa ${n.productName||n.productCode} khỏi giỏ hàng?`))return;return A.splice(e,1),await qt({silent:!0}),
Yt(),void ft("Đã xóa sản phẩm khỏi giỏ hàng.","success")}const n=e.target.closest("[data-cart-update]");n&&ye.contains(n)&&await async function(e,t){const n=A[e];if(!n)return
;const r=ye.querySelector(`[data-cart-case="${e}"]`),o=ye.querySelector(`[data-cart-loose="${e}"]`),a=Math.max(0,Number(r?.value||0)),i=Math.max(0,Number(o?.value||0)),c=Mt(n),s=a*c+i
;if(!Number.isFinite(s)||s<=0)return void y(Me,"Số lượng sau khi sửa phải lớn hơn 0. Hãy dùng nút Xóa nếu không mua sản phẩm này.","error")
;const d=Math.max(0,Number(n.availableQty||0)),u=Math.max(0,Number(n.maxOrderQty||0))
;if(d>0&&s>d)y(Me,`Số lượng vượt tồn đang hiển thị (${Ot(d,c)}).`,"error");else if(u>0&&s>u)y(Me,`Số lượng vượt hạn mức bán App (${Ot(u,c)}).`,"error");else{b(t,!0,"Đang tính...")
;try{n.quantity=s,await qt({silent:!0}),Yt(),ft(`Đã cập nhật số lượng ${n.productName||n.productCode}.`,"success")}finally{b(t,!1)}}}(Number(n.dataset.cartUpdate),n)})),tn(),
Wt("customers",{restoreScroll:!1}),function(){try{const e=localStorage.getItem(kt());if(!e)return!1;const t=JSON.parse(e);return k=t.selectedCustomer?lt(t.selectedCustomer):null,
A=Array.isArray(t.cart)?t.cart:[],B=String(t.editingOrderId||""),be&&(be.value=String(t.paidAmount||"")),It(),B&&(Te.textContent=`Tiếp tục sửa đơn ${B}`,
Oe.textContent=`Lưu sửa đơn ${B}`),wt()}catch(e){return Bt(),!1}}()&&ft("Đã khôi phục đơn đang nhập trên thiết bị này.","success"),await $t(),await xt("",{reset:!0}),Yt(),
activateTabData(ee)}(),document.getElementById("addItemBtn").addEventListener("click",async()=>{if(y(Me,""),!k)return y(Me,"Chưa chọn khách hàng ở tab 1","error")
;if(!w)return y(Me,"Chưa chọn sản phẩm","error");const e=Number(he?.value||0),t=Number(pe?.value||0),n=Mt(w),r=(e>0&&n>0?e*n:0)+t
;if(r<=0)return y(Me,"Số lượng phải lớn hơn 0","error");const o=Number(w.availableQty||0),a=Math.max(0,Number(w.maxOrderQty||0))
;if(o>0&&r>o)return y(Me,"Số lượng vượt tồn thực tế","error")
;if(r>a)return y(Me,a>0?`Sản phẩm chỉ còn được bán qua App ${Ot(a,n)}`:"Sản phẩm chưa có hạn mức bán qua App. Vui lòng cập nhật file tồn DMS buổi sáng.","error")
;const i=Number(w.salePrice||w.price||0),c=A.find(e=>e.productCode===w.code);if(c){const e=Number(c.quantity||0)+r;if(o>0&&e>o)return y(Me,"Tổng số lượng vượt tồn thực tế","error")
;if(e>a)return y(Me,`Tổng số lượng vượt hạn mức bán App. Còn tối đa ${Ot(a,n)}`,"error");c.quantity=e,c.availableQty=Math.max(Number(c.availableQty||0),o),
c.maxOrderQty=Math.max(Number(c.maxOrderQty||0),a),c.originalPrice=Number(c.originalPrice||c.grossPrice||c.catalogSalePrice||i),c.grossPrice=c.originalPrice,
c.catalogSalePrice=c.originalPrice,Tt(c,{conversionRate:c.conversionRate||w.conversionRate,unitsPerCase:c.unitsPerCase||w.unitsPerCase,packingQty:c.packingQty||w.packingQty,
packQty:w.packQty,pack:w.pack,packageQty:w.packageQty})}else A.push(Tt({productId:w.id,productCode:w.code,productName:w.name,unit:w.unit,quantity:r,originalPrice:i,grossPrice:i,
catalogSalePrice:i,grossAmount:Math.round(r*i),unitPrice:i,salePrice:i,price:i,finalPrice:i,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(r*i),
saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,availableQty:o,maxOrderQty:a,internalSaleQuota:w.internalSaleQuota||{}},w));w=null,se.value="",
he.value="",pe.value="",ge.textContent="Chưa chọn sản phẩm",ge.classList.add("muted"),await qt(),Yt(),y(Me,"Đã thêm vào giỏ hàng và áp giá sau khuyến mại","success")}),
Oe.addEventListener("click",async()=>{if(Oe.disabled)return;if(y(Me,""),!k)return y(Me,"Chưa chọn khách hàng","error");const e=lt(k)
;if(!(e.code||e.customerCode||e.id||e.customerId))return y(Me,"Thiếu mã khách hàng, vui lòng chọn lại khách ở tab Khách hàng","error")
;if(!A.length)return y(Me,"Chưa có sản phẩm","error");b(Oe,!0);let t=null;try{const n=Number(be.value||0);await qt({silent:!0});const o={customer:e,
customerId:e.customerId||e.id||e.code||"",customerCode:e.customerCode||e.code||"",customerName:e.customerName||e.name||"",items:A.map(e=>({...e,
grossPrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),unitPrice:Number(e.unitPrice||e.finalPrice||e.salePrice||e.price||0),
salePrice:Number(e.salePrice||e.unitPrice||e.finalPrice||e.price||0),finalPrice:Number(e.finalPrice||e.unitPrice||e.salePrice||e.price||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),amount:Number(e.amount||0),saleMode:"promotion",saleMethod:"promotion",pricingMode:"promotion",
priceLocked:!0})),paidAmount:n,note:B?"Sửa từ app bán hàng mobile":"Tạo từ app bán hàng mobile"};t=o
;const a=B?await r.updateSalesOrder(B,o):await r.createSalesOrder(o),i=a.salesOrder?.code||"";window.CatalogCache&&window.CatalogCache.invalidate("products"),nn(!1),function(e={}){
if(!e||!e.id&&!e.code)return;const t=String(e.id||e.code),n={...e,canEdit:!1!==e.canEdit&&!e.masterOrderId&&!e.masterOrderCode&&"merged"!==(e.mergeStatus||"unmerged"),
editLockReason:e.editLockReason||""},r=L.findIndex(n=>String(n.id||n.code)===t||String(n.code||"")===String(e.code||""));r>=0?L[r]={...L[r],...n}:L.unshift(n),rn(L,Y)
}(a.salesOrder);const c=`${a.message||"Đã lưu đơn"} ${i}`.trim();y(Me,c,"success"),ft(c,"success"),x&&await Xt({reset:!0,force:!0}),await on({reset:!0,force:!0}),yt("reportTab")
}catch(e){if(!B&&t&&i(e)){await a("sales_order_create",t),nn(!1);const e="Đã lưu đơn offline. Đơn đang hiển thị trong danh sách Chờ đồng bộ.";y(Me,e,"success"),ft(e,"warning",{
persist:!0}),await $t(),yt("reportTab")}else y(Me,e.message,"error"),ft(e.message||"Không lưu được đơn hàng.","error",{persist:!0})}finally{b(Oe,!1),Oe.disabled=!k||0===A.length}
});
