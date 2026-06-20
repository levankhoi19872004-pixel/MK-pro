/* GENERATED FILE — edit public/mobile/js/sales.source/part-01.jsfrag, public/mobile/js/sales.source/part-01c.jsfrag, public/mobile/js/sales.source/part-01b.jsfrag, public/mobile/js/sales.source/part-02.jsfrag, public/mobile/js/sales.source/part-02b.jsfrag, public/mobile/js/sales.source/part-03.jsfrag, public/mobile/js/sales.source/part-03b.jsfrag and run npm run build:source-bundles. */
const e=window.V45Common||{},t=e.todayValue,n=e.calculateCartonUnit;import{mobileApi as r,getUser as o}from"./api.js?v=phase86-production-hardening-v1"
;import{queueOperation as a,canQueueOfflineOperation as s,isNetworkError as i,listOperations as c}from"./offline-sync.js?v=phase86-production-hardening-v1"
;import{bindLogout as d,debounce as l,escapeHtml as u,formatDisplayDate as m,formatShortDate as h,money as g,requireLogin as p,requireRole as b,setButtonBusy as f,setMessage as y}from"./ui.js"

;import{buildCartItemsHtml as v,buildOrderCardsHtml as C,createMobileSalesNavigation as w,createStatusAnnouncer as k,renderMobileListState as S}from"./sales-ux.js?v=phase86-production-hardening-v1"
;import{collectMobileSalesDom as L}from"./sales/dom.js?v=phase86-production-hardening-v1"
;import{createMobileSalesState as T,OrderDraftStore as E}from"./sales/state.js?v=phase86-production-hardening-v1"
;import{buildDebtLookup as N,customerAddressValue as P,customerAvailableDebtValue as A,customerCodeValue as $,customerDebtValue as x,customerNameValue as D,customerPendingCollectedValue as M,customerPhoneValue as B,customerSalesValue as I,debtClassName as O,mergeCustomerDebt as q,mergeCustomerPages as K,normalizeSelectedCustomerForSubmit as Q,uniqueCustomerIdentityKeys as _}from"./sales/customer.js?v=phase86-production-hardening-v1"
;import{currentSalesStaffCode as H,filterOrdersForCurrentSalesUser as R}from"./sales/staff.js?v=phase86-production-hardening-v1"
;import{applyPromotionLines as U,attachPackingRate as j,buildPromotionCartPayloadItem as V,normalizePackingRate as F,normalizeProductGroupName as G,normalizeProductSearchResponse as z,toMobileProduct as X}from"./sales/product.js?v=phase86-production-hardening-v1"
;import{buildOrderPayloadItems as Y,calculateCartTotals as W,cartQuantityFromInputs as J,validateCartQuantity as Z}from"./sales/cart.js?v=phase86-production-hardening-v1"
;import{buildOrderQueryKey as ee,mergeOrderPages as te,orderMatchesDisplayFilter as ne,orderMatchesSearchText as re,orderStatusFilterValue as oe,upsertOrder as ae}from"./sales/orders.js?v=phase86-production-hardening-v1"
;import{debtCustomerKey as se,filterAndSortDebts as ie,mergeDebtPages as ce,parseMobileMoneyInput as de}from"./sales/debt.js?v=phase86-production-hardening-v1"
;import{offlineOperationToOrder as le}from"./sales/sync.js?v=phase86-production-hardening-v1";p(),b(["sales"]),d(document.getElementById("logoutBtn"));const ue=o()
;document.getElementById("staffInfo").textContent=`${ue.name||ue.username||"Nhân viên"} · ${ue.role||"sales"}`;const me=T({draftStore:new E({
ownerKey:H(ue)||ue.id||ue.username||"sales"})
}),{tabs:he,panels:ge,customerSearch:pe,customerList:be,customerLoadMoreBtn:fe,productSearch:ye,productGroupFilter:ve,productSuggestions:Ce,selectedCustomerBox:we,selectedProductBox:ke,caseQtyInput:Se,looseQtyInput:Le,paidAmountInput:Te,cartList:Ee,cartCustomerContext:Ne,cartCount:Pe,cartTotal:Ae,cartGrossTotal:$e,cartDiscountTotal:xe,orderDraftBar:De,orderDraftLineCount:Me,orderDraftTotal:Be,openCartBtn:Ie,backToOrderBtn:Oe,todayOrders:qe,orderLoadMoreBtn:Ke,orderSearch:Qe,orderDateFilter:_e,orderStatusFilter:He,orderFilterResultCount:Re,message:Ue,orderFormTitle:je,submitOrderBtn:Ve,cartTabBadge:Fe,syncNavBadge:Ge,networkStatus:ze,mobileGlobalStatus:Xe,debtList:Ye,debtLoadMoreBtn:We,debtLedgerList:Je,debtTotalAmount:Ze,debtCustomerCount:et,debtPendingAmount:tt,debtTabMessage:nt,debtCustomersSubtab:rt,debtCollectSubtab:ot,debtCustomersPanel:at,debtCollectPanel:st,debtCustomerSearch:it,debtCustomerSort:ct}=L(),dt=w({
tabs:he,panels:ge,panelIds:["customersTab","orderTab","cartTab","debtTab","reportTab"],initialPanel:"customersTab",fallbackPanel:"customersTab",hashByPanel:{
customersTab:"#khach-hang",orderTab:"#ban-hang",cartTab:"#gio-hang",debtTab:"#cong-no",reportTab:"#don-hang"},onActivate(e){me.ui.activeTabId=e,"debtTab"===e&&Bt(),
"reportTab"===e&&Rt(),"orderTab"!==e&&"cartTab"!==e||Dt()}});function lt(e,t={}){me.ui.activeTabId=dt.switchPanel(e,t)}const ut=k(Xe);function mt(){if(!ze)return
;const e=!1!==navigator.onLine;ze.textContent=e?"Đang online":"Đang offline",ze.classList.toggle("offline",!e),ze.classList.toggle("online",e)}function ht(e,t={}){S(e,t,u)}
function gt(){return oe(He)}function pt(e={}){return ne(e,gt())}function bt(e={}){return re(e,Qe?.value||"")}function ft(){return me.draft.isDirty(Te?.value||0)}function yt(){
me.draft.persist(Te?.value||"")}function vt(){if(!me.draft.customer)return we.textContent="Chưa chọn khách hàng. Hãy sang tab Khách hàng để chọn.",we.classList.add("muted"),
void(Ne&&(Ne.textContent="Chưa chọn khách hàng cho đơn này.",Ne.classList.add("muted")))
;const e=$(me.draft.customer),t=D(me.draft.customer),n=`<strong>${u(e||"")}${e&&t?" - ":""}${u(t||"")}</strong><br /><span>SĐT: ${u(B(me.draft.customer))}</span><br /><span>ĐC: ${u(P(me.draft.customer))}</span><br /><span>Nợ: ${g(x(me.draft.customer))} · DS tháng: ${g(I(me.draft.customer))}</span>`
;we.innerHTML=n,we.classList.remove("muted"),Ne&&(Ne.innerHTML=`<span>Đơn đang lập cho</span><br />${n}`,Ne.classList.remove("muted"))}function Ct(e={}){return le(e,{
customerName:D,customerCode:$})}async function wt(){try{const e=await c({statuses:["pending","failed","conflict","needs_attention"],limit:100})
;me.sync.pendingOrders=e.filter(e=>"sales_order_create"===e.type).map(Ct),Ge&&(Ge.textContent=String(me.sync.pendingOrders.length),Ge.hidden=0===me.sync.pendingOrders.length),
Ht(me.orders.rows)}catch(e){me.sync.pendingOrders=[],Ge&&(Ge.hidden=!0)}}async function kt(e="",t={}){const n=!0===t.append;if(me.customer.loading)return
;if(n&&!me.customer.hasMore)return;const o=++me.customer.requestSeq,a=n?me.customer.page+1:1;me.customer.loading=!0,me.customer.query=e,f(fe,!0,"Đang tải...");try{n||ht(be,{
state:"loading",baseClass:"customer-list",title:e?"Đang tìm khách hàng...":"Đang tải khách hàng phụ trách..."});const t=await async function(e="",t={}){return r.getCustomers(e,{
page:t.page||1,limit:t.limit||40,requestKey:"mobile-customers",cancelPrevious:!1!==t.cancelPrevious})}(e,{page:a,cancelPrevious:!n});if(o!==me.customer.requestSeq)return
;const s=t.items||t.customers||[];me.customer.page=Number(t.pagination?.page||a),me.customer.hasMore=Boolean(t.pagination?.hasMore),me.customer.rows=n?K(me.customer.rows,s):s,
St(me.customer.rows),fe&&(fe.hidden=!me.customer.hasMore)}catch(e){if(o!==me.customer.requestSeq||"REQUEST_ABORTED"===e?.code)return
;n?y(Ue,e.message||"Không tải thêm được khách hàng","error"):ht(be,{state:"error",baseClass:"customer-list",title:"Không tải được khách hàng",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"customers"})}finally{o===me.customer.requestSeq&&(me.customer.loading=!1),f(fe,!1)}}function St(e){
const t=N(me.debt.rows),n=(Array.isArray(e)?e:[]).map(e=>q(e,t)).sort((e,t)=>x(t)-x(e));me.customer.rows=n,n.length?(be.className="customer-list",be.innerHTML=n.map((e,t)=>{
const n=$(e),r=D(e),o=x(e),a=B(e),s=P(e)
;return`\n      <button class="customer-card ${O(e)}" data-customer-index="${t}">\n        <strong>${u(n||"")}${n&&r?" - ":""}${u(r||"")}</strong>\n        <span class="customer-contact">SĐT: ${u(a)}</span>\n        <span class="customer-contact">ĐC: ${u(s)}</span>\n        <div class="customer-metrics">\n          <em class="metric-debt">Nợ: ${g(o)}</em>\n          <em>DS tháng: ${g(I(e))}</em>\n        </div>\n      </button>\n    `
}).join(""),be.querySelectorAll("[data-customer-index]").forEach(e=>{e.addEventListener("click",()=>function(e){
const t=Q(q(e,N(me.debt.rows))),n=_(me.draft.customer||{})[0]||"",r=_(t)[0]||"";if(Boolean(me.draft.customer&&(n||r)&&n!==r)&&(me.draft.cart.length||me.draft.editingOrderId)){
if(!window.confirm("Giỏ hiện tại đang thuộc khách hàng khác. Đổi khách sẽ xóa toàn bộ giỏ đang nhập. Bạn có chắc không?"))return;me.draft.cart=[],me.draft.editingOrderId="",
Te.value="",Ot()}me.draft.customer=t,vt(),yt(),y(Ue,"Đã chọn khách hàng. Hãy thêm sản phẩm vào giỏ.","success"),lt("orderTab"),Dt(),setTimeout(()=>ye.focus(),200)
}(me.customer.rows[Number(e.dataset.customerIndex)]))})):ht(be,{state:"empty",baseClass:"customer-list",title:"Không có khách hàng phù hợp",
detail:pe.value.trim()?"Hãy thử từ khóa ngắn hơn hoặc kiểm tra mã khách.":"Danh sách khách hàng phụ trách đang trống."})}function Lt(e,t){return n(e,t).display}function Tt(e={}){
const t=F(e);return Lt(Number(e.quantity||e.qty||0),t)}async function Et(e={}){if(!me.draft.cart.length)return;const n=!!e.silent;try{const e=await r.calculatePromotions({date:t(),
saleDate:t(),items:me.draft.cart.map(V)}),n=Array.isArray(e?.result?.lines)?e.result.lines:[];me.draft.cart=U(me.draft.cart,n)}catch(e){
n||y(Ue,e.message||"Không tính được khuyến mại cho giỏ hàng","error"),me.draft.cart=me.draft.cart.map(e=>{
const t=Number(e.quantity||0),n=Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0);return{...e,originalPrice:n,grossPrice:n,catalogSalePrice:n,
unitPrice:n,salePrice:n,price:n,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(t*n),saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",
priceLocked:!0}})}}function Nt(e={}){return X(e,{formatStock:Lt})}function Pt(e=""){
return String(e||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function At(){return G(ve?.value||"")}
function $t(){me.draft.product=null,ye&&(ye.dataset.id="",ye.dataset.code="",ye.dataset.name="",ye.dataset.type=""),ke.textContent="Chưa chọn sản phẩm",ke.classList.add("muted")}
function xt(e){const t=Nt(e);me.draft.product=t,ye.dataset.id=t.id||"",ye.dataset.code=t.code||"",ye.dataset.name=t.name||"",ye.dataset.type="product",
ye.value=t.label||[t.code,t.name].filter(Boolean).join(" - ")
;const n=Number(t.finalPrice||t.unitPrice||t.salePrice||t.price||0),r=Number(t.originalPrice||t.grossPrice||t.catalogSalePrice||t.salePrice||t.price||0),o=r>n?`Giá KM<strong>${g(n)}</strong>`:`Giá bán<strong>${g(n)}</strong>`,a=r>n?`<span>Giá gốc<strong>${g(r)}</strong></span>`:""
;ke.innerHTML=`\n    <div class="mobile-selected-product-name">${u(t.code||"")} - ${u(t.name||"")}</div>\n    <div class="mobile-selected-product-meta">\n      <span>Tồn thực tế<strong>${u(t.stockDisplay||Lt(t.availableQty,t.conversionRate))}</strong></span>\n      <span class="mobile-app-quota-meta">Được bán App<strong>${u(Lt(t.maxOrderQty,t.conversionRate))}</strong></span>\n      <span>${o}</span>\n      ${a}\n    </div>\n    <div class="mobile-selected-product-quota-note">Hạn mức theo file DMS: ${u(t.internalSaleQuota?.snapshotDate||"chưa cập nhật")}</div>\n  `,
ke.classList.remove("muted"),Ce.innerHTML="",Ce.classList.remove("has-many"),Ce.hidden=!0,Ce.style.display="none",Le.focus()}function Dt(){
me.product.toolsInitialized||(me.product.toolsInitialized=!0,ye&&Ce&&(window.SearchAutocomplete&&window.UnifiedProductSearch?(window.SearchAutocomplete.wire({input:ye,box:Ce,
getItems:()=>async function(e=""){const t=String(e||"").trim();if(t.length<2)return[];try{const e=await r.getProducts(t,{limit:50,group:At()}),n=z(e).map(Nt)
;return window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.sync&&window.UnifiedProductSearch.sync(n),n}catch(e){
console.warn("[mobile-sales] mobile product search fallback:",e.message||e)}if(window.UnifiedSearchEngine&&"function"==typeof window.UnifiedSearchEngine.searchProduct){
const e=await window.UnifiedSearchEngine.searchProduct(t,{limit:50,mode:"sales",includeStock:1,group:At()});return z(e).map(Nt)}
if(window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.search){const e=await window.UnifiedProductSearch.search(t,{limit:50,mode:"sales",group:At()})
;return z(e).map(Nt)}return[]}(ye.value.trim()),
label:e=>window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.label?window.UnifiedProductSearch.label(e,"sales"):e.label||[e.code,e.name].filter(Boolean).join(" - "),
select:xt,emptyText:"Không tìm thấy sản phẩm phù hợp"}),ye.addEventListener("input",$t),ve?.addEventListener("change",()=>{$t(),ye&&(ye.value=""),Ce&&(Ce.innerHTML="",
Ce.classList.remove("has-many"),Ce.hidden=!0,Ce.style.display="none")}),async function(e=!1){if(ve&&(!me.product.groupOptionsLoaded||e)){me.product.groupOptionsLoaded=!0;try{
const e=await r.getProductGroups();!function(e=[]){if(!ve)return;const t=At(),n=[...new Set((e||[]).map(G).filter(Boolean))].sort((e,t)=>e.localeCompare(t,"vi",{numeric:!0}))
;ve.innerHTML=['<option value="">Tất cả nhóm hàng</option>',...n.map(e=>`<option value="${Pt(e)}">${Pt(e)}</option>`)].join(""),t&&n.includes(t)&&(ve.value=t)
}(e.items||e.groups||[])}catch(e){me.product.groupOptionsLoaded=!1,"REQUEST_ABORTED"!==e?.code&&console.warn("[mobile-sales] không tải được nhóm hàng sản phẩm:",e.message||e)}}}(),
ye.addEventListener("focus",()=>{ye.dispatchEvent(new Event("input",{bubbles:!0}))}),ye.addEventListener("keydown",e=>{"Escape"===e.key&&(Ce.innerHTML="",
Ce.classList.remove("has-many"))})):Ce.innerHTML='<div class="suggestion-empty">Thiếu engine gợi ý sản phẩm dùng chung.</div>'))}function Mt(e,t={}){
const n="collect"===e?"collect":"customers";me.debt.subtab=n,rt?.classList.toggle("active","customers"===n),ot?.classList.toggle("active","collect"===n),
rt?.setAttribute("aria-selected",String("customers"===n)),ot?.setAttribute("aria-selected",String("collect"===n)),at?.classList.toggle("active","customers"===n),
st?.classList.toggle("active","collect"===n),"collect"!==n?!1!==t.restoreScroll&&window.requestAnimationFrame(()=>window.scrollTo({top:me.debt.listScrollTop,behavior:"auto"
})):!1!==t.scroll&&document.getElementById("debtTab")?.scrollIntoView({block:"start",behavior:t.behavior||"smooth"})}async function Bt(e={}){
const t=!0===e.append,n=!0===e.force,o=document.getElementById("debtTab")?.classList.contains("active");if(me.debt.loading)return;if(t&&!me.debt.hasMore)return
;if(me.debt.loaded&&!n&&!t)return void It(me.debt.rows,me.debt.summary);const a=++me.debt.requestSeq,s=t?me.debt.page+1:1;me.debt.loading=!0,f(We,!0,"Đang tải...");try{
Ye&&!t&&o&&ht(Ye,{state:"loading",baseClass:"order-list",title:"Đang tải công nợ..."});const e=await r.getSalesDebts({page:s,limit:30,includePaid:"0",includePendingCollections:"1",
collectorType:"sales",cancelPrevious:!t});if(a!==me.debt.requestSeq)return;const n=Array.isArray(e.items)?e.items:[];me.debt.page=Number(e.pagination?.page||s),
me.debt.hasMore=Boolean(e.pagination?.hasMore),me.debt.summary=e.summary||me.debt.summary||{},me.debt.rows=t?ce(me.debt.rows,n):n,me.debt.loaded=!0,
It(me.debt.rows,me.debt.summary),We&&(We.hidden=!me.debt.hasMore),Array.isArray(me.customer.rows)&&me.customer.rows.length&&St(me.customer.rows)}catch(e){
if(a!==me.debt.requestSeq||"REQUEST_ABORTED"===e?.code)return;t||(me.debt.loaded=!1),Ye&&o&&!t?ht(Ye,{state:"error",baseClass:"order-list",title:"Không tải được công nợ",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"debts"}):y(nt,e.message||"Không tải thêm được công nợ","error")}finally{
a===me.debt.requestSeq&&(me.debt.loading=!1),f(We,!1)}}function It(e=me.debt.rows,t={}){
const n=Number(t.totalDebt??e.reduce((e,t)=>e+Number(t.debtAmount||0),0)),r=Number(t.pendingCollected??e.reduce((e,t)=>e+M(t),0));if(Ze&&(Ze.textContent=g(n)),
et&&(et.textContent=String(t.customerCount??e.length)),tt&&(tt.textContent=g(r)),qt(e),me.debt.selectedCustomerKey){
const e=me.debt.selectedCustomerKey&&me.debt.rows.find(e=>se(e)===me.debt.selectedCustomerKey)||null;e?me.debt.formDirty||Qt(e):(me.debt.selectedCustomerKey="",
me.debt.formDirty=!1,Qt())}else Qt()}function Ot(){vt(),yt(),function(){const e=W(me.draft.cart);Pe.textContent=`${me.draft.cart.length} dòng`,
Fe&&(Fe.textContent=String(me.draft.cart.length)),$e&&($e.textContent=g(e.gross)),xe&&(xe.textContent=e.discount>0?`-${g(e.discount)}`:g(0)),Ae.textContent=g(e.payable),
Me&&(Me.textContent=`${me.draft.cart.length} sản phẩm`),Be&&(Be.textContent=g(e.payable)),De&&(De.hidden=0===me.draft.cart.length),
Ve&&(Ve.disabled=!me.draft.customer||0===me.draft.cart.length)}(),me.draft.cart.length?(Ee.className="cart-list",Ee.innerHTML=v(me.draft.cart,{escapeHtml:u,money:g,
normalizePackingRate:F,quantityDisplay:Tt})):ht(Ee,{state:"empty",baseClass:"cart-list",title:"Giỏ hàng chưa có sản phẩm",
detail:me.draft.customer?"Quay lại Bán hàng để chọn sản phẩm.":"Hãy chọn khách hàng trước khi lập đơn."})}function qt(e=me.debt.rows){if(!Ye)return;const t=Array.isArray(e)?e:[]
;if(!t.length)return void ht(Ye,{state:"empty",baseClass:"order-list",title:"Không có khách hàng còn nợ",detail:"Danh sách sẽ cập nhật khi có công nợ phát sinh."})
;const n=function(e=me.debt.rows){return ie(e,{keyword:it?.value||"",sortMode:ct?.value||"debt_desc",formatDate:h})}(t);n.length?(Ye.className="order-list debt-customer-list",
Ye.innerHTML=n.map(({item:e,originalIndex:t})=>{const n=A(e),r=n<=0
;return`\n      <article class="debt-card${se(e)===me.debt.selectedCustomerKey?" selected":""}">\n        <div class="debt-card-content">\n          <strong>${u(e.customerCode||"")} - ${u(e.customerName||"")}</strong>\n          <span>Công nợ: ${g(e.debtAmount||0)} · Chờ KT: ${g(M(e))} · Có thể thu: ${g(n)}</span>\n          <span>${e.orderCount||0} đơn · Nợ cũ nhất: ${m(e.oldestDebtDate||"")}</span>\n        </div>\n        <button type="button" class="${r?"ghost-btn":"primary-btn"} small-btn debt-collect-action" data-debt-index="${t}" ${r?'disabled aria-disabled="true"':""}>\n          ${r?"Đang chờ KT":"Thu nợ"}\n        </button>\n      </article>`
}).join(""),Ye.querySelectorAll("[data-debt-index]:not([disabled])").forEach(e=>{e.addEventListener("click",()=>function(e={}){const t=se(e)
;!t||A(e)<=0||(me.debt.selectedCustomerKey!==t?me.debt.formDirty&&me.debt.selectedCustomerKey&&me.debt.selectedCustomerKey!==t&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.")||(me.debt.listScrollTop=window.scrollY||document.documentElement.scrollTop||0,
me.debt.selectedCustomerKey=t,me.debt.formDirty=!1,Qt(e),Mt("collect")):Mt("collect"))}(t[Number(e.dataset.debtIndex)]))})):ht(Ye,{state:"empty",baseClass:"order-list",
title:"Không tìm thấy khách hàng phù hợp",detail:"Hãy thử mã khách, tên hoặc số điện thoại khác."})}function Kt(e={}){const t=Array.isArray(e.orders)?e.orders:[]
;return t.length?t.filter(e=>Number(e.availableDebt??e.debt??0)>0):(Array.isArray(e.ledgers)?e.ledgers:[]).filter(e=>Number(e.debt||0)>0).map(e=>({
salesOrderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderDate:e.date||e.documentDate||"",debt:Number(e.debt||0),
availableDebt:Number(e.debt||0),pendingCollectedAmount:0}))}function Qt(e={}){if(!Je)return;if(!se(e))return Je.className="order-list empty",
Je.innerHTML='\n      <div class="debt-empty-state">\n        <strong>Chưa chọn khách hàng để thu nợ</strong>\n        <span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span>\n        <button id="chooseDebtCustomerBtn" type="button" class="ghost-btn">Chọn khách hàng</button>\n      </div>',
void document.getElementById("chooseDebtCustomerBtn")?.addEventListener("click",()=>Mt("customers"));const t=Array.isArray(e.ledgers)?e.ledgers:[],n=Kt(e);let o=0
;const c=t.length?`\n    <details class="debt-ledger-details">\n      <summary>Sổ công nợ (${t.length} dòng)</summary>\n      <div class="order-list">\n        ${t.map(e=>(o+=Number(e.debit||0)-Number(e.credit||0),
`\n            <div class="order-item">\n              <strong>${u(m(e.date))} · ${u(e.type||e.refType||"")}</strong>\n              <span>Đơn: ${u(e.salesOrderCode||e.refCode||"")}</span>\n              <span>Phát sinh: ${g(e.debit||0)} · Thanh toán: ${g(e.credit||0)} · Dư nợ: ${g(Math.max(0,o))}</span>\n            </div>`)).join("")}\n      </div>\n    </details>`:"",d=`\n    <div class="debt-selected-customer">\n      <strong>${u(e.customerCode||"")} - ${u(e.customerName||"")}</strong>\n      <span>Nợ: ${g(x(e))} · Chờ KT: ${g(M(e))} · Có thể thu: ${g(A(e))}</span>\n    </div>`,l=n.length?`\n    <form id="mobileDebtCollectionForm" class="order-list mobile-debt-collection-form">\n      <strong>Báo thu nợ chờ kế toán xác nhận</strong>\n      <span>Chọn đơn nợ, nhập số tiền đã thu. Công nợ chỉ giảm sau khi kế toán xác nhận.</span>\n      <div class="order-list debt-order-selection-list">\n        ${n.map((e,t)=>`\n          <label class="order-item debt-order-check-row">\n            <input type="checkbox" class="mobile-debt-order-check" data-index="${t}" checked />\n            <strong>${u(e.salesOrderCode||e.orderCode||"")}</strong>\n            <span>Ngày: ${m(e.orderDate||e.documentDate||"")} · Nợ: ${g(e.debt||0)} · Chờ KT: ${g(e.pendingCollectedAmount||0)} · Có thể thu: ${g(e.availableDebt??e.debt??0)}</span>\n          </label>`).join("")}\n      </div>\n      <label>Số tiền đã thu<input id="mobileDebtCollectionAmount" name="amount" inputmode="numeric" value="${Math.max(0,Math.round(A(e)))}" /></label>\n      <label>Hình thức<select id="mobileDebtCollectionMethod" name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>\n      <label>Ghi chú<input id="mobileDebtCollectionNote" name="note" placeholder="VD: Khách trả một phần" /></label>\n      <div class="debt-submit-bar">\n        <button type="submit" class="primary-btn full-btn">Gửi phiếu thu chờ kế toán</button>\n      </div>\n      <p id="mobileDebtCollectionMessage" class="message"></p>\n    </form>`:'\n      <div class="order-item debt-no-available">\n        <strong>Không còn số tiền có thể thu</strong>\n        <span>Khách hàng đang có phiếu thu chờ kế toán hoặc công nợ đã được xử lý.</span>\n      </div>'
;Je.className="order-list",Je.innerHTML=d+l+c,Je.querySelectorAll(".mobile-debt-order-check").forEach(t=>{t.addEventListener("change",()=>function(e={}){
const t=Kt(e),n=[...document.querySelectorAll(".mobile-debt-order-check:checked")].reduce((e,n)=>{const r=t[Number(n.dataset.index)]
;return e+Math.max(0,Number(r?.availableDebt??r?.debt??0))},0),r=document.getElementById("mobileDebtCollectionAmount");r&&(r.value=String(n)),me.debt.formDirty=!0}(e))})
;const h=document.getElementById("mobileDebtCollectionForm");h&&(h.addEventListener("input",()=>{me.debt.formDirty=!0}),h.addEventListener("change",()=>{me.debt.formDirty=!0}),
h.addEventListener("submit",t=>async function(e,t={}){e.preventDefault();const n=e.target,o=document.getElementById("mobileDebtCollectionMessage"),c=de(n.elements.amount?.value||0)
;if(c<=0)return y(o,"Số tiền thu phải lớn hơn 0","error");const d=function(e={},t=0){
const n=Kt(e),r=[...document.querySelectorAll(".mobile-debt-order-check:checked")].map(e=>Number(e.dataset.index)).filter(e=>Number.isFinite(e));let o=Math.max(0,Number(t||0))
;const a=[];return r.forEach(e=>{const t=n[e],r=Math.max(0,Number(t?.availableDebt??t?.debt??0)),s=Math.min(r,o);t&&s>0&&(a.push({salesOrderId:t.salesOrderId||t.orderId||"",
salesOrderCode:t.salesOrderCode||t.orderCode||"",allocatedAmount:s}),o-=s)}),a}(t,c);if(!d.length)return y(o,"Cần chọn ít nhất một đơn nợ","error")
;if(d.reduce((e,t)=>e+Number(t.allocatedAmount||0),0)!==c)return y(o,"Tổng tiền phân bổ phải bằng số tiền thu","error");const l=n.querySelector('button[type="submit"]')
;f(l,!0,"Đang gửi...");const u={customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",amount:c,
paymentMethod:n.elements.paymentMethod?.value||"cash",note:n.elements.note?.value||"",allocations:d};try{
const e=(await r.submitDebtCollection(u)).message||"Đã ghi nhận thu nợ, chờ kế toán xác nhận";y(o,e,"success"),y(nt,e,"success"),me.debt.formDirty=!1,
me.debt.selectedCustomerKey="",me.debt.loaded=!1,await Bt({force:!0}),Mt("customers",{restoreScroll:!0})}catch(e){
i(e)&&s("debt_collection_submit")?(await a("debt_collection_submit",u),y(o,"Đã lưu phiếu thu offline, hệ thống sẽ tự đồng bộ khi có mạng","success"),
me.debt.formDirty=!1):i(e)?y(o,"Mất kết nối. Phiếu thu chưa được gửi; dữ liệu đang nhập vẫn được giữ để bạn thử lại.","error"):y(o,e.message||"Không gửi được phiếu thu nợ","error")
}finally{f(l,!1)}}(t,e)))}function _t(e=!0){me.draft.cart=[],me.draft.editingOrderId="",me.draft.product=null,ye.value="",Se.value="",Le.value="",Te.value="",
ke.textContent="Chưa chọn sản phẩm",ke.classList.add("muted"),je.textContent="Đặt hàng",Ve.textContent="Xác nhận đơn",e&&(me.draft.customer=null,
y(Ue,"Đã làm mới đơn. Hãy chọn khách hàng ở tab 1.","success")),vt(),Ot(),ft()||me.draft.clearPersistence()}function Ht(e=me.orders.rows,n=me.orders.summary){
me.orders.rows=Array.isArray(e)?e:[]
;const r=me.orders.rows,o=String(_e?.value||t()),a=[...me.sync.pendingOrders.filter(e=>!o||String(e.date||"").slice(0,10)===o),...r],s=a.filter(bt).filter(pt),i=Number(n?.totalAmount??r.reduce((e,t)=>e+Number(t.totalAmount||0),0)),c=Number(n?.paidAmount??r.reduce((e,t)=>e+Number(t.paidAmount||0),0)),d=Number(n?.debtAmount??r.reduce((e,t)=>e+Number(t.debtAmount||0),0)),l=Number(n?.orderCount??r.length)
;if(document.getElementById("todayRevenue").textContent=g(i),document.getElementById("todayOrderCount").textContent=String(l),document.getElementById("todayPaid").textContent=g(c),
document.getElementById("todayDebt").textContent=g(d),Re&&(Re.textContent=`${s.length} đơn`),Ke&&(Ke.hidden=!me.orders.hasMore||"pending_sync"===gt()),!s.length){const e=a.length>0
;return void ht(qe,{state:"empty",baseClass:"order-list",title:e?"Không có đơn phù hợp bộ lọc":"Chưa có đơn trong ngày đã chọn",
detail:e?"Hãy đổi từ khóa hoặc trạng thái hiển thị.":"Đơn online và đơn chờ đồng bộ sẽ xuất hiện tại đây."})}qe.className="order-list mobile-order-list",qe.innerHTML=C(s,{
escapeHtml:u,money:g,formatDate:m})}async function Rt(e={}){const n=!0===e.append,o=!0===e.force,a=ee({date:_e?.value||t(),q:Qe?.value||""})
;if(n&&me.orders.loadedKey!==a)return Rt({reset:!0,force:!0});if(me.orders.loading)return;if(n&&!me.orders.hasMore)return
;if(me.orders.loaded&&me.orders.loadedKey===a&&!o&&!n)return void Ht(me.orders.rows,me.orders.summary);const s=++me.orders.requestSeq,i=n?me.orders.page+1:1;me.orders.loading=!0,
f(Ke,!0,"Đang tải...");try{n||ht(qe,{state:"loading",baseClass:"order-list",title:"Đang tải đơn hàng..."});const e=await r.getMySalesOrders({page:i,limit:30,
date:String(_e?.value||t()),q:String(Qe?.value||"").trim(),requestKey:"mobile-sales-orders",cancelPrevious:!n});if(s!==me.orders.requestSeq)return
;const o=e.items||[],c=function(e=[]){return R(e,ue)}(o);me.orders.page=Number(e.pagination?.page||i),me.orders.hasMore=Boolean(e.pagination?.hasMore),
me.orders.summary=e.summary||me.orders.summary||{},me.orders.rows=n?te(me.orders.rows,c):c,me.orders.loaded=!0,me.orders.loadedKey=a,Ht(me.orders.rows,me.orders.summary),
Ke&&(Ke.hidden=!me.orders.hasMore||"pending_sync"===gt()),o.length!==c.length&&console.warn("[MOBILE_SALES_OWNER_GUARD]",{currentSalesStaffCode:H(ue),received:o.length,
rendered:c.length})}catch(e){if(s!==me.orders.requestSeq||"REQUEST_ABORTED"===e?.code)return;n?ut(e.message||"Không tải thêm được đơn hàng","error",{persist:!0
}):(me.orders.loaded=!1,me.orders.loadedKey="",ht(qe,{state:"error",baseClass:"order-list",title:"Không tải được đơn hàng",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"orders"}))}finally{s===me.orders.requestSeq&&(me.orders.loading=!1),f(Ke,!1)}}
he.forEach(e=>e.addEventListener("click",()=>lt(e.dataset.tab))),Ie?.addEventListener("click",()=>lt("cartTab")),Oe?.addEventListener("click",()=>lt("orderTab",{
historyMode:"replace"})),document.addEventListener("click",e=>{const t=e.target.closest("[data-mobile-retry]");if(!t)return;const n=t.dataset.mobileRetry
;"customers"===n&&kt(pe.value.trim(),{reset:!0,force:!0}),"orders"===n&&Rt({reset:!0,force:!0}),"debts"===n&&Bt({reset:!0,force:!0})}),
pe.addEventListener("input",l(()=>kt(pe.value.trim(),{reset:!0}),250)),document.getElementById("reloadCustomersBtn")?.addEventListener("click",()=>{
window.CatalogCache&&window.CatalogCache.invalidate("customers"),kt(pe.value.trim(),{reset:!0,force:!0})}),fe?.addEventListener("click",()=>kt(me.customer.query,{append:!0})),
document.getElementById("reloadOrdersBtn")?.addEventListener("click",()=>Rt({reset:!0,force:!0})),Ke?.addEventListener("click",()=>Rt({append:!0})),
We?.addEventListener("click",()=>Bt({append:!0})),Qe?.addEventListener("input",l(()=>{me.orders.loaded=!1,me.orders.loadedKey="",Rt({reset:!0,force:!0})},300)),
_e?.addEventListener("change",()=>{me.orders.loaded=!1,me.orders.loadedKey="",Rt({reset:!0,force:!0})}),He?.addEventListener("change",()=>Ht(me.orders.rows,me.orders.summary)),
qe?.addEventListener("click",async e=>{const t=e.target.closest("[data-edit-order]");if(t&&qe.contains(t)){f(t,!0,"Đang mở...");try{await async function(e){try{
const t=(await r.getSalesOrder(e)).order;if(!t.canEdit)return y(Ue,t.editLockReason||"Đơn hiện không thể chỉnh sửa trên app bán hàng.","error")
;me.draft.editingOrderId=t.id||t.code,me.draft.customer={id:t.customerId,code:t.customerCode,name:t.customerName,phone:t.customerPhone,address:t.customerAddress,
debtAmount:t.customerDebt||0,monthRevenue:t.customerMonthRevenue||0},vt(),me.draft.cart=(t.items||[]).map(e=>({productId:e.productId||e.productCode,productCode:e.productCode,
productName:e.productName,unit:e.unit,conversionRate:e.conversionRate,quantity:Number(e.quantity||0),
originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),unitPrice:Number(e.unitPrice||e.salePrice||e.price||0),
salePrice:Number(e.salePrice||e.unitPrice||e.price||0),price:Number(e.price||e.unitPrice||e.salePrice||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),promotionAmount:Number(e.promotionAmount||e.discountAmount||e.totalDiscountAmount||0),
amount:Number(e.amount||Number(e.quantity||0)*Number(e.unitPrice||e.salePrice||e.price||0)),promotionCode:e.promotionCode||"",promotionName:e.promotionName||""})),
Te.value=Number(t.paidAmount||0),je.textContent=`Sửa đơn ${t.code||""}`,Ve.textContent=`Lưu sửa đơn ${t.code||""}`,await Et({silent:!0}),Ot()
;const n=`Đang sửa đơn ${t.code||""}. Hệ thống sẽ tính lại giá, khuyến mại và tồn kho khi lưu.`;y(Ue,n,"success"),ut(n,"info"),lt("orderTab")}catch(e){y(Ue,e.message,"error")}
}(t.dataset.editOrder)}finally{f(t,!1)}return}const n=e.target.closest("[data-delete-order]");if(n&&qe.contains(n)){f(n,!0,"Đang xóa...");try{await async function(e,t){
if(window.confirm(`Xóa đơn ${t||e}? Chỉ xóa được khi đơn chưa gộp đơn tổng.`))try{const n=await r.deleteSalesOrder(e)
;me.orders.rows=me.orders.rows.filter(n=>String(n.id||n.code||"")!==String(e||"")&&String(n.code||"")!==String(t||"")),Ht(me.orders.rows,me.orders.summary),await Rt({reset:!0,
force:!0});const o=n.message||"Đã xóa đơn";y(Ue,o,"success"),ut(o,"success")}catch(e){y(Ue,e.message,"error"),ut(e.message||"Không xóa được đơn.","error",{persist:!0})}
}(n.dataset.deleteOrder,n.dataset.orderCode)}finally{f(n,!1)}}}),document.getElementById("reloadDebtsBtn")?.addEventListener("click",()=>{
me.debt.formDirty&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")||(me.debt.formDirty=!1,Bt({reset:!0,force:!0}))}),
rt?.addEventListener("click",()=>Mt("customers")),ot?.addEventListener("click",()=>Mt("collect")),it?.addEventListener("input",()=>qt(me.debt.rows)),
ct?.addEventListener("change",()=>qt(me.debt.rows)),document.getElementById("clearOrderBtn")?.addEventListener("click",()=>{
ft()&&!window.confirm("Làm mới sẽ xóa khách hàng và toàn bộ giỏ đang nhập. Bạn có chắc không?")||_t(!0)}),document.getElementById("logoutBtn")?.addEventListener("click",e=>{
ft()&&(window.confirm("Bạn đang có đơn chưa lưu. Thoát ứng dụng vẫn giữ bản nháp trên thiết bị. Bạn có chắc muốn thoát?")||(e.preventDefault(),e.stopImmediatePropagation()))},!0),
Te?.addEventListener("input",yt),window.addEventListener("beforeunload",e=>{ft()&&(e.preventDefault(),e.returnValue="")}),window.addEventListener("mkpro:offline-queued",e=>{
"sales_order_create"===e.detail?.type&&(wt(),ut("Đơn đã được lưu trên thiết bị và đang chờ đồng bộ.","warning",{persist:!0}))}),
window.addEventListener("mkpro:offline-synced",async()=>{await wt(),me.orders.loaded&&await Rt({reset:!0,force:!0}),ut("Đã đồng bộ dữ liệu chờ lên máy chủ.","success")}),
window.addEventListener("online",()=>{mt(),ut("Đã có kết nối mạng. Bạn có thể gửi lại thao tác chưa hoàn tất.","success")}),window.addEventListener("offline",()=>{mt(),
ut("Mất kết nối mạng. Đơn chưa gửi vẫn được giữ dưới dạng bản nháp và chưa ghi lên máy chủ.","warning",{persist:!0})}),async function(){mt(),me.ui.activeTabId=dt.initialize(),
_e&&!_e.value&&(_e.value=t()),Ee&&"1"!==Ee.dataset.phase3Bound&&(Ee.dataset.phase3Bound="1",Ee.addEventListener("click",async e=>{const t=e.target.closest("[data-remove]")
;if(t&&Ee.contains(t)){const e=Number(t.dataset.remove),n=me.draft.cart[e];if(!n)return;if(!window.confirm(`Xóa ${n.productName||n.productCode} khỏi giỏ hàng?`))return
;return me.draft.cart.splice(e,1),await Et({silent:!0}),Ot(),void ut("Đã xóa sản phẩm khỏi giỏ hàng.","success")}const n=e.target.closest("[data-cart-update]")
;n&&Ee.contains(n)&&await async function(e,t){const n=me.draft.cart[e];if(!n)return
;const r=Ee.querySelector(`[data-cart-case="${e}"]`),o=Ee.querySelector(`[data-cart-loose="${e}"]`),{rate:a,quantity:s}=J(n,r?.value,o?.value),i=Z(n,s)
;if(i.ok||"INVALID_QUANTITY"!==i.code)if(i.ok||"OVER_STOCK"!==i.code)if(i.ok||"OVER_APP_QUOTA"!==i.code){f(t,!0,"Đang tính...");try{n.quantity=s,await Et({silent:!0}),Ot(),
ut(`Đã cập nhật số lượng ${n.productName||n.productCode}.`,"success")}finally{f(t,!1)}
}else y(Ue,`Số lượng vượt hạn mức bán App (${Lt(i.maxOrderQty,a)}).`,"error");else y(Ue,`Số lượng vượt tồn đang hiển thị (${Lt(i.availableQty,a)}).`,"error");else y(Ue,"Số lượng sau khi sửa phải lớn hơn 0. Hãy dùng nút Xóa nếu không mua sản phẩm này.","error")
}(Number(n.dataset.cartUpdate),n)})),Qt(),Mt("customers",{restoreScroll:!1}),function(){const e=me.draft.restore();return!!e&&(e.customer&&(me.draft.customer=Q(e.customer)),
Te&&(Te.value=e.paidAmount),vt(),me.draft.editingOrderId&&(je.textContent=`Tiếp tục sửa đơn ${me.draft.editingOrderId}`,Ve.textContent=`Lưu sửa đơn ${me.draft.editingOrderId}`),
ft())}()&&ut("Đã khôi phục đơn đang nhập trên thiết bị này.","success");const e=r.getRuntimeConfig().catch(()=>null);await wt(),await kt("",{reset:!0}),await e,Ot(),
activateTabData(me.ui.activeTabId)}(),document.getElementById("addItemBtn").addEventListener("click",async()=>{if(y(Ue,""),
!me.draft.customer)return y(Ue,"Chưa chọn khách hàng ở tab 1","error");if(!me.draft.product)return y(Ue,"Chưa chọn sản phẩm","error")
;const e=Number(Se?.value||0),t=Number(Le?.value||0),n=F(me.draft.product),r=(e>0&&n>0?e*n:0)+t;if(r<=0)return y(Ue,"Số lượng phải lớn hơn 0","error")
;const o=Number(me.draft.product.availableQty||0),a=Math.max(0,Number(me.draft.product.maxOrderQty||0));if(o>0&&r>o)return y(Ue,"Số lượng vượt tồn thực tế","error")
;if(r>a)return y(Ue,a>0?`Sản phẩm chỉ còn được bán qua App ${Lt(a,n)}`:"Sản phẩm chưa có hạn mức bán qua App. Vui lòng cập nhật file tồn DMS buổi sáng.","error")
;const s=Number(me.draft.product.salePrice||me.draft.product.price||0),i=me.draft.cart.find(e=>e.productCode===me.draft.product.code);if(i){const e=Number(i.quantity||0)+r
;if(o>0&&e>o)return y(Ue,"Tổng số lượng vượt tồn thực tế","error");if(e>a)return y(Ue,`Tổng số lượng vượt hạn mức bán App. Còn tối đa ${Lt(a,n)}`,"error");i.quantity=e,
i.availableQty=Math.max(Number(i.availableQty||0),o),i.maxOrderQty=Math.max(Number(i.maxOrderQty||0),a),
i.originalPrice=Number(i.originalPrice||i.grossPrice||i.catalogSalePrice||s),i.grossPrice=i.originalPrice,i.catalogSalePrice=i.originalPrice,j(i,{
conversionRate:i.conversionRate||me.draft.product.conversionRate,unitsPerCase:i.unitsPerCase||me.draft.product.unitsPerCase,packingQty:i.packingQty||me.draft.product.packingQty,
packQty:me.draft.product.packQty,pack:me.draft.product.pack,packageQty:me.draft.product.packageQty})}else me.draft.cart.push(j({productId:me.draft.product.id,
productCode:me.draft.product.code,productName:me.draft.product.name,unit:me.draft.product.unit,quantity:r,originalPrice:s,grossPrice:s,catalogSalePrice:s,
grossAmount:Math.round(r*s),unitPrice:s,salePrice:s,price:s,finalPrice:s,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(r*s),saleMethod:"promotion",
saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,availableQty:o,maxOrderQty:a,internalSaleQuota:me.draft.product.internalSaleQuota||{}},me.draft.product))
;me.draft.product=null,ye.value="",Se.value="",Le.value="",ke.textContent="Chưa chọn sản phẩm",ke.classList.add("muted"),await Et(),Ot(),
y(Ue,"Đã thêm vào giỏ hàng và áp giá sau khuyến mại","success")}),Ve.addEventListener("click",async()=>{if(Ve.disabled)return;if(y(Ue,""),
!me.draft.customer)return y(Ue,"Chưa chọn khách hàng","error");const e=Q(me.draft.customer)
;if(!(e.code||e.customerCode||e.id||e.customerId))return y(Ue,"Thiếu mã khách hàng, vui lòng chọn lại khách ở tab Khách hàng","error")
;if(!me.draft.cart.length)return y(Ue,"Chưa có sản phẩm","error");f(Ve,!0);let t=null;try{const n=Number(Te.value||0);await Et({silent:!0});const o={customer:e,
customerId:e.customerId||e.id||e.code||"",customerCode:e.customerCode||e.code||"",customerName:e.customerName||e.name||"",items:Y(me.draft.cart),paidAmount:n,
note:me.draft.editingOrderId?"Sửa từ app bán hàng mobile":"Tạo từ app bán hàng mobile"};t=o
;const a=me.draft.editingOrderId?await r.updateSalesOrder(me.draft.editingOrderId,o):await r.createSalesOrder(o),s=a.salesOrder?.code||""
;window.CatalogCache&&window.CatalogCache.invalidate("products"),_t(!1),function(e={}){me.orders.rows=ae(me.orders.rows,e),Ht(me.orders.rows,me.orders.summary)}(a.salesOrder)
;const i=`${a.message||"Đã lưu đơn"} ${s}`.trim();y(Ue,i,"success"),ut(i,"success"),me.debt.loaded&&await Bt({reset:!0,force:!0}),await Rt({reset:!0,force:!0}),lt("reportTab")
}catch(e){if(!me.draft.editingOrderId&&t&&i(e)&&s("sales_order_create")){await a("sales_order_create",t),_t(!1)
;const e="Đã lưu đơn offline. Đơn đang hiển thị trong danh sách Chờ đồng bộ.";y(Ue,e,"success"),ut(e,"warning",{persist:!0}),await wt(),lt("reportTab")}else if(i(e)){yt()
;const e="Mất kết nối — đơn chưa được gửi. Bản nháp vẫn được giữ; vui lòng thử lại khi có mạng.";y(Ue,e,"error"),ut(e,"warning",{persist:!0})}else y(Ue,e.message,"error"),
ut(e.message||"Không lưu được đơn hàng.","error",{persist:!0})}finally{f(Ve,!1),Ve.disabled=!me.draft.customer||0===me.draft.cart.length}});
