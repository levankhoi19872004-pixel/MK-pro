/* GENERATED FILE — edit public/mobile/js/sales.source/part-01.jsfrag, public/mobile/js/sales.source/part-01c.jsfrag, public/mobile/js/sales.source/part-01b.jsfrag, public/mobile/js/sales.source/part-02.jsfrag, public/mobile/js/sales.source/part-02b.jsfrag, public/mobile/js/sales.source/part-03.jsfrag, public/mobile/js/sales.source/part-03b.jsfrag and run npm run build:source-bundles. */
const e=window.V45Common||{},t=e.todayValue,r=e.calculateCartonUnit;import{mobileApi as n,getUser as o}from"./api.js?v=phase86-production-hardening-v1"
;import{queueOperation as a,canQueueOfflineOperation as s,isNetworkError as i,listOperations as c}from"./offline-sync.js?v=phase86-production-hardening-v1"
;import{bindLogout as d,debounce as l,escapeHtml as u,formatDisplayDate as m,formatShortDate as h,money as g,requireLogin as p,requireRole as b,setButtonBusy as f,setMessage as y}from"./ui.js"
;import{buildCartItemsHtml as v,buildOrderCardsHtml as C,createMobileSalesNavigation as w,createStatusAnnouncer as k}from"./sales-ux.js?v=phase155-returns-modal-v1"
;import{collectMobileSalesDom as S}from"./sales/dom.js?v=phase86-production-hardening-v1"
;import{createMobileSalesState as L,OrderDraftStore as E}from"./sales/state.js?v=phase86-production-hardening-v1"
;import{buildDebtLookup as N,customerAddressValue as T,customerAvailableDebtValue as P,customerCodeValue as A,customerDebtValue as x,customerNameValue as D,customerPendingCollectedValue as $,customerPhoneValue as M,customerSalesValue as B,debtClassName as I,mergeCustomerDebt as O,mergeCustomerPages as q,normalizeSelectedCustomerForSubmit as K,uniqueCustomerIdentityKeys as Q}from"./sales/customer.js?v=phase86-production-hardening-v1"
;import{currentSalesStaffCode as R,filterOrdersForCurrentSalesUser as _}from"./sales/staff.js?v=phase86-production-hardening-v1"
;import{applyPromotionLines as H,attachPackingRate as U,buildPromotionCartPayloadItem as j,normalizePackingRate as F,normalizeProductGroupName as V,normalizeProductSearchResponse as G,toMobileProduct as z}from"./sales/product.js?v=phase86-production-hardening-v1"
;import{buildMobileProductMetrics as X,installMobileSalesProductLabel as Y,mobileProductMetaLine as J}from"./sales/product-view.js?v=phase178-test-repair-v1"
;import{buildOrderPayloadItems as W,calculateCartTotals as Z,cartQuantityFromInputs as ee,validateCartQuantity as te}from"./sales/cart.js?v=phase86-production-hardening-v1"
;import{buildOrderQueryKey as re,mergeOrderPages as ne,orderMatchesDisplayFilter as oe,orderMatchesSearchText as ae,orderStatusFilterValue as se,upsertOrder as ie}from"./sales/orders.js?v=phase86-production-hardening-v1"
;import{debtCustomerKey as ce,filterAndSortDebts as de,mergeDebtPages as le,parseMobileMoneyInput as ue}from"./sales/debt.js?v=phase86-production-hardening-v1"
;import{offlineOperationToOrder as me}from"./sales/sync.js?v=phase86-production-hardening-v1";p(),b(["sales"]),d(document.getElementById("logoutBtn"));const he=o()
;document.getElementById("staffInfo").textContent=`${he.name||he.username||"Nhân viên"}`;const ge=L({draftStore:new E({ownerKey:R(he)||he.id||he.username||"sales"})
}),{tabs:pe,panels:be,customerSearch:fe,customerList:ye,customerLoadMoreBtn:ve,productSearch:Ce,productGroupFilter:we,productSuggestions:ke,selectedCustomerBox:Se,selectedProductBox:Le,caseQtyInput:Ee,looseQtyInput:Ne,paidAmountInput:Te,cartList:Pe,cartCustomerContext:Ae,cartCount:xe,cartTotal:De,cartGrossTotal:$e,cartDiscountTotal:Me,orderDraftBar:Be,orderDraftLineCount:Ie,orderDraftTotal:Oe,openCartBtn:qe,backToOrderBtn:Ke,todayOrders:Qe,orderLoadMoreBtn:Re,orderSearch:_e,orderDateFilter:He,orderStatusFilter:Ue,orderFilterResultCount:je,message:Fe,orderFormTitle:Ve,submitOrderBtn:Ge,cartTabBadge:ze,syncNavBadge:Xe,networkStatus:Ye,mobileGlobalStatus:Je,debtList:We,debtLoadMoreBtn:Ze,debtLedgerList:et,debtTotalAmount:tt,debtCustomerCount:rt,debtPendingAmount:nt,debtTabMessage:ot,debtCustomersSubtab:at,debtCollectSubtab:st,debtCustomersPanel:it,debtCollectPanel:ct,debtCustomerSearch:dt,debtCustomerSort:lt}=S(),ut=window.MobileUiRuntime,mt=ut.createLifecycle(),ht=ut.createChunkedHtmlRenderer(ye,{
initialCount:60,chunkSize:80}),gt=ut.createChunkedHtmlRenderer(We,{initialCount:60,chunkSize:80}),pt=ut.createChunkedHtmlRenderer(Qe,{initialCount:60,chunkSize:80}),bt=w({tabs:pe,
panels:be,panelIds:["customersTab","orderTab","cartTab","debtTab","reportTab"],initialPanel:"customersTab",fallbackPanel:"customersTab",hashByPanel:{customersTab:"#khach-hang",
orderTab:"#ban-hang",cartTab:"#gio-hang",debtTab:"#cong-no",reportTab:"#don-hang"},onActivate(e){ge.ui.activeTabId=e,"debtTab"===e&&Ut(),"reportTab"===e&&Jt(),
"orderTab"!==e&&"cartTab"!==e||_t()}});function ft(e,t={}){ge.ui.activeTabId=bt.switchPanel(e,t)}const yt=k(Je);function vt(){if(!Ye)return;const e=!1!==navigator.onLine
;Ye.textContent=e?"":"Mất mạng",Ye.hidden=e,Ye.classList.toggle("offline",!e),Ye.classList.toggle("online",e)}function Ct(e,t={}){ut.renderState(e,{...t,
className:t.baseClass||"order-list"})}function wt(){return se(Ue)}function kt(e={}){return oe(e,wt())}function St(e={}){return ae(e,_e?.value||"")}function Lt(){
return ge.draft.isDirty(Te?.value||0)}function Et(){ge.draft.persist(Te?.value||"")}function Nt(){
if(!ge.draft.customer)return Se.textContent="Chưa chọn khách hàng. Hãy sang tab Khách hàng để chọn.",Se.classList.add("muted"),
void(Ae&&(Ae.textContent="Chưa chọn khách hàng cho đơn này.",Ae.classList.add("muted")));const e=ge.draft.customer,t=A(e),r=D(e),n=T(e),o={
heading:`${t||""}${t&&r?" · ":""}${r||""}`,lines:[`${/^chưa có/i.test(n)?"":`${n} · `}Nợ ${g(x(e))} · DS tháng ${g(B(e))}`]};window.SafeDom.renderSummary(Se,o),
Se.classList.remove("muted"),Ae&&(window.SafeDom.renderSummary(Ae,{...o,prefix:"Đơn đang lập cho"}),Ae.classList.remove("muted"))}function Tt(e={}){return me(e,{customerName:D,
customerCode:A})}async function Pt(){try{const e=await c({statuses:["pending","failed","conflict","needs_attention"],limit:100})
;ge.sync.pendingOrders=e.filter(e=>"sales_order_create"===e.type).map(Tt),Xe&&(Xe.textContent=String(ge.sync.pendingOrders.length),Xe.hidden=0===ge.sync.pendingOrders.length),
Yt(ge.orders.rows)}catch(e){ge.sync.pendingOrders=[],Xe&&(Xe.hidden=!0)}}async function At(e="",t={}){const r=!0===t.append;if(ge.customer.loading)return
;if(r&&!ge.customer.hasMore)return;const o=++ge.customer.requestSeq,a=r?ge.customer.page+1:1;ge.customer.loading=!0,ge.customer.query=e,f(ve,!0,"Đang tải...");try{r||Ct(ye,{
state:"loading",baseClass:"customer-list",title:e?"Đang tìm khách hàng...":"Đang tải khách hàng phụ trách..."});const t=await async function(e="",t={}){return n.getCustomers(e,{
page:t.page||1,limit:t.limit||40,requestKey:"mobile-customers",cancelPrevious:!1!==t.cancelPrevious})}(e,{page:a,cancelPrevious:!r});if(o!==ge.customer.requestSeq)return
;const s=t.items||t.customers||[];ge.customer.page=Number(t.pagination?.page||a),ge.customer.hasMore=Boolean(t.pagination?.hasMore),ge.customer.rows=r?q(ge.customer.rows,s):s,
xt(ge.customer.rows),ve&&(ve.hidden=!ge.customer.hasMore)}catch(e){if(o!==ge.customer.requestSeq||"REQUEST_ABORTED"===e?.code)return
;r?y(Fe,e.message||"Không tải thêm được khách hàng","error"):Ct(ye,{state:"error",baseClass:"customer-list",title:"Không tải được khách hàng",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"customers"})}finally{o===ge.customer.requestSeq&&(ge.customer.loading=!1),f(ve,!1)}}function xt(e){
const t=N(ge.debt.rows),r=(Array.isArray(e)?e:[]).map(e=>O(e,t)).sort((e,t)=>x(t)-x(e));ge.customer.rows=r,r.length?(ye.className="customer-list",ht.render(r,(e,t)=>{
const r=A(e),n=D(e),o=x(e),a=M(e),s=T(e)
;return`\n      <button class="customer-card ${I(e)}" data-customer-index="${t}">\n        <strong>${u(r||"")}${r&&n?" - ":""}${u(n||"")}</strong>\n        <span class="customer-contact">SĐT: ${u(a)}</span>\n        <span class="customer-contact">ĐC: ${u(s)}</span>\n        <div class="customer-metrics">\n          <em class="metric-debt">Nợ: ${g(o)}</em>\n          <em>DS tháng: ${g(B(e))}</em>\n        </div>\n      </button>\n    `
})):Ct(ye,{state:"empty",baseClass:"customer-list",title:"Không có khách hàng phù hợp",
detail:fe.value.trim()?"Hãy thử từ khóa ngắn hơn hoặc kiểm tra mã khách.":"Danh sách khách hàng phụ trách đang trống."})}function Dt(e,t){return r(e,t).display}function $t(e={}){
const t=F(e);return Dt(Number(e.quantity||e.qty||0),t)}async function Mt(e={}){if(!ge.draft.cart.length)return;const r=!!e.silent;try{const e=await n.calculatePromotions({date:t(),
saleDate:t(),items:ge.draft.cart.map(j)}),r=Array.isArray(e?.result?.lines)?e.result.lines:[];ge.draft.cart=H(ge.draft.cart,r)}catch(e){
r||y(Fe,e.message||"Không tính được khuyến mại cho giỏ hàng","error"),ge.draft.cart=ge.draft.cart.map(e=>{
const t=Number(e.quantity||0),r=Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0);return{...e,originalPrice:r,grossPrice:r,catalogSalePrice:r,
unitPrice:r,salePrice:r,price:r,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(t*r),saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",
priceLocked:!0}})}}function Bt(e={}){return z(e,{formatStock:Dt})}function It(){return V(we?.value||"")}function Ot(){ge.draft.product=null,Ce&&(Ce.dataset.id="",
Ce.dataset.code="",Ce.dataset.name="",Ce.dataset.type=""),Le.textContent="",Le.hidden=!0,Le.classList.add("muted"),Le.classList.remove("mobile-selected-product-compact-meta")}
function qt(){return{formatStockTL:Dt,money:g,formatDisplayDate:m}}function Kt(e={}){return J(e,qt())}function Qt(){if(!Ce||!ke)return
;const e=Ce.closest(".clearable-search-control"),t=document.querySelector("#orderTab .mobile-product-search-first-card")
;e&&t&&ke.parentElement===e&&e.insertAdjacentElement("afterend",ke),t&&ke.parentElement!==t&&e?.parentElement===t&&e.insertAdjacentElement("afterend",ke)}function Rt(e){
const t=Bt(e);ge.draft.product=t,Ce.dataset.id=t.id||"",Ce.dataset.code=t.code||"",Ce.dataset.name=t.name||"",Ce.dataset.type="product",
Ce.value=[t.code,t.name].filter(Boolean).join(" · "),function(e={}){Le&&(window.SafeDom.renderMetricCard(Le,{title:"",titleClass:"mobile-sr-only",
metaClass:"mobile-selected-product-compact-meta-line",metrics:X(e,qt())}),Le.hidden=!1,Le.classList.remove("muted"),Le.classList.add("mobile-selected-product-compact-meta"))}(t),
ke.innerHTML="",ke.classList.remove("has-many"),ke.hidden=!0,ke.style.display="none",Qt(),Ne.focus()}function _t(){ge.product.toolsInitialized||(ge.product.toolsInitialized=!0,
Ce&&ke&&(window.SearchAutocomplete&&window.UnifiedProductSearch?(Y({toMobileProduct:Bt,escapeHtml:u,mobileProductMetaLine:Kt}),window.SearchAutocomplete.wire({input:Ce,box:ke,
getItems:()=>async function(e=""){const t=String(e||"").trim();if(t.length<2)return[];try{const e=await n.getProducts(t,{limit:20,group:It(),inStockOnly:"1"
}),r=G(e).map(Bt).filter(e=>Number(e.availableQty||e.availableStock||e.stockQuantity||0)>0)
;return window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.sync&&window.UnifiedProductSearch.sync(r),r}catch(e){
console.warn("[sales:product]",e.message||e)}if(window.UnifiedSearchEngine&&"function"==typeof window.UnifiedSearchEngine.searchProduct){
const e=await window.UnifiedSearchEngine.searchProduct(t,{limit:20,mode:"sales",includeStock:1,inStockOnly:1,group:It()})
;return G(e).map(Bt).filter(e=>Number(e.availableQty||e.availableStock||e.stockQuantity||0)>0)}
if(window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.search){const e=await window.UnifiedProductSearch.search(t,{limit:20,mode:"sales",group:It()})
;return G(e).map(Bt).filter(e=>Number(e.availableQty||e.availableStock||e.stockQuantity||0)>0)}return[]}(Ce.value.trim()),
label:e=>window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.label?window.UnifiedProductSearch.label(e,"sales"):e.label||[e.code,e.name].filter(Boolean).join(" - "),
select:Rt,emptyText:"Không tìm thấy sản phẩm phù hợp"}),Qt(),Ce.addEventListener("input",()=>{Ot(),Qt()}),we?.addEventListener("change",()=>{Ot(),Ce&&(Ce.value=""),
ke&&(ke.innerHTML="",ke.classList.remove("has-many"),ke.hidden=!0,ke.style.display="none")}),async function(e=!1){if(we&&(!ge.product.groupOptionsLoaded||e)){
ge.product.groupOptionsLoaded=!0;try{const e=await n.getProductGroups();!function(e=[]){if(!we)return
;const t=It(),r=[...new Set((e||[]).map(V).filter(Boolean))].sort((e,t)=>e.localeCompare(t,"vi",{numeric:!0}));we.replaceChildren();const n=document.createElement("option")
;n.value="",n.textContent="Tất cả nhóm hàng",we.appendChild(n),r.forEach(e=>{const t=document.createElement("option");t.value=e,t.textContent=e,we.appendChild(t)}),
t&&r.includes(t)&&(we.value=t)}(e.items||e.groups||[])}catch(e){ge.product.groupOptionsLoaded=!1,"REQUEST_ABORTED"!==e?.code&&console.warn("[sales:groups]",e.message||e)}}}(),
Ce.addEventListener("focus",()=>{Qt(),Ce.dispatchEvent(new Event("input",{bubbles:!0}))}),Ce.addEventListener("keydown",e=>{"Escape"===e.key&&(ke.innerHTML="",
ke.classList.remove("has-many"))})):ke.innerHTML='<div class="suggestion-empty">Thiếu engine gợi ý sản phẩm dùng chung.</div>'))}function Ht(e,t={}){
const r="collect"===e?"collect":"customers";ge.debt.subtab=r,at?.classList.toggle("active","customers"===r),st?.classList.toggle("active","collect"===r),
at?.setAttribute("aria-selected",String("customers"===r)),st?.setAttribute("aria-selected",String("collect"===r)),it?.classList.toggle("active","customers"===r),
ct?.classList.toggle("active","collect"===r),"collect"!==r?!1!==t.restoreScroll&&window.requestAnimationFrame(()=>window.scrollTo({top:ge.debt.listScrollTop,behavior:"auto"
})):!1!==t.scroll&&document.getElementById("debtTab")?.scrollIntoView({block:"start",behavior:t.behavior||"smooth"})}async function Ut(e={}){
const t=!0===e.append,r=!0===e.force,o=document.getElementById("debtTab")?.classList.contains("active");if(ge.debt.loading)return;if(t&&!ge.debt.hasMore)return
;if(ge.debt.loaded&&!r&&!t)return void jt(ge.debt.rows,ge.debt.summary);const a=++ge.debt.requestSeq,s=t?ge.debt.page+1:1;ge.debt.loading=!0,f(Ze,!0,"Đang tải...");try{
We&&!t&&o&&Ct(We,{state:"loading",baseClass:"order-list",title:"Đang tải công nợ..."});const e=await n.getSalesDebts({page:s,limit:30,includePaid:"0",includePendingCollections:"1",
collectorType:"sales",cancelPrevious:!t});if(a!==ge.debt.requestSeq)return;const r=Array.isArray(e.items)?e.items:[];ge.debt.page=Number(e.pagination?.page||s),
ge.debt.hasMore=Boolean(e.pagination?.hasMore),ge.debt.summary=e.summary||ge.debt.summary||{},ge.debt.rows=t?le(ge.debt.rows,r):r,ge.debt.loaded=!0,
jt(ge.debt.rows,ge.debt.summary),Ze&&(Ze.hidden=!ge.debt.hasMore),Array.isArray(ge.customer.rows)&&ge.customer.rows.length&&xt(ge.customer.rows)}catch(e){
if(a!==ge.debt.requestSeq||"REQUEST_ABORTED"===e?.code)return;t||(ge.debt.loaded=!1),We&&o&&!t?Ct(We,{state:"error",baseClass:"order-list",title:"Không tải được công nợ",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"debts"}):y(ot,e.message||"Không tải thêm được công nợ","error")}finally{
a===ge.debt.requestSeq&&(ge.debt.loading=!1),f(Ze,!1)}}function jt(e=ge.debt.rows,t={}){
const r=Number(t.totalDebt??e.reduce((e,t)=>e+Number(t.debtAmount||0),0)),n=Number(t.pendingCollected??e.reduce((e,t)=>e+$(t),0));if(tt&&(tt.textContent=g(r)),
rt&&(rt.textContent=String(t.customerCount??e.length)),nt&&(nt.textContent=g(n)),Vt(e),ge.debt.selectedCustomerKey){
const e=ge.debt.selectedCustomerKey&&ge.debt.rows.find(e=>ce(e)===ge.debt.selectedCustomerKey)||null;e?ge.debt.formDirty||zt(e):(ge.debt.selectedCustomerKey="",
ge.debt.formDirty=!1,zt())}else zt()}function Ft(){Nt(),Et(),function(){const e=Z(ge.draft.cart);xe.textContent=`${ge.draft.cart.length} dòng`,
ze&&(ze.textContent=String(ge.draft.cart.length)),$e&&($e.textContent=g(e.gross)),Me&&(Me.textContent=e.discount>0?`-${g(e.discount)}`:g(0)),De.textContent=g(e.payable),
Ie&&(Ie.textContent=`${ge.draft.cart.length} sản phẩm`),Oe&&(Oe.textContent=g(e.payable)),Be&&(Be.hidden=0===ge.draft.cart.length),
Ge&&(Ge.disabled=!ge.draft.customer||0===ge.draft.cart.length)}(),ge.draft.cart.length?(Pe.className="cart-list",Pe.innerHTML=v(ge.draft.cart,{escapeHtml:u,money:g,
normalizePackingRate:F,quantityDisplay:$t})):Ct(Pe,{state:"empty",baseClass:"cart-list",title:"Giỏ hàng chưa có sản phẩm",
detail:ge.draft.customer?"Quay lại Bán hàng để chọn sản phẩm.":"Hãy chọn khách hàng trước khi lập đơn."})}function Vt(e=ge.debt.rows){if(!We)return;const t=Array.isArray(e)?e:[]
;if(!t.length)return void Ct(We,{state:"empty",baseClass:"order-list",title:"Không có khách hàng còn nợ",detail:"Danh sách sẽ cập nhật khi có công nợ phát sinh."})
;const r=function(e=ge.debt.rows){return de(e,{keyword:dt?.value||"",sortMode:lt?.value||"debt_desc",formatDate:h})}(t);r.length?(We.className="order-list debt-customer-list",
gt.render(r,({item:e,originalIndex:t})=>{const r=P(e),n=r<=0
;return`\n      <article class="debt-card${ce(e)===ge.debt.selectedCustomerKey?" selected":""}">\n        <div class="debt-card-content">\n          <strong>${u(e.customerCode||"")} - ${u(e.customerName||"")}</strong>\n          <span>Công nợ: ${g(e.debtAmount||0)} · Chờ KT: ${g($(e))} · Có thể thu: ${g(r)}</span>\n          <span>${e.orderCount||0} đơn · Nợ cũ nhất: ${m(e.oldestDebtDate||"")}</span>\n        </div>\n        <button type="button" class="${n?"ghost-btn":"primary-btn"} small-btn debt-collect-action" data-debt-index="${t}" ${n?'disabled aria-disabled="true"':""}>\n          ${n?"Đang chờ KT":"Thu nợ"}\n        </button>\n      </article>`
})):Ct(We,{state:"empty",baseClass:"order-list",title:"Không tìm thấy khách hàng phù hợp",detail:"Hãy thử mã khách, tên hoặc số điện thoại khác."})}function Gt(e={}){
const t=Array.isArray(e.orders)?e.orders:[]
;return t.length?t.filter(e=>Number(e.availableDebt??e.debt??0)>0):(Array.isArray(e.ledgers)?e.ledgers:[]).filter(e=>Number(e.debt||0)>0).map(e=>({
salesOrderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderDate:e.date||e.documentDate||"",debt:Number(e.debt||0),
availableDebt:Number(e.debt||0),pendingCollectedAmount:0}))}function zt(e={}){if(!et)return;if(!ce(e))return et.className="order-list empty",
et.innerHTML='\n      <div class="debt-empty-state">\n        <strong>Chưa chọn khách hàng để thu nợ</strong>\n        <span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span>\n        <button id="chooseDebtCustomerBtn" type="button" class="ghost-btn">Chọn khách hàng</button>\n      </div>',
void document.getElementById("chooseDebtCustomerBtn")?.addEventListener("click",()=>Ht("customers"));const t=Array.isArray(e.ledgers)?e.ledgers:[],r=Gt(e);let o=0
;const c=t.length?`\n    <details class="debt-ledger-details">\n      <summary>Sổ công nợ (${t.length} dòng)</summary>\n      <div class="order-list">\n        ${t.map(e=>(o+=Number(e.debit||0)-Number(e.credit||0),
`\n            <div class="order-item">\n              <strong>${u(m(e.date))} · ${u(e.type||e.refType||"")}</strong>\n              <span>Đơn: ${u(e.salesOrderCode||e.refCode||"")}</span>\n              <span>Phát sinh: ${g(e.debit||0)} · Thanh toán: ${g(e.credit||0)} · Dư nợ: ${g(Math.max(0,o))}</span>\n            </div>`)).join("")}\n      </div>\n    </details>`:"",d=`\n    <div class="debt-selected-customer">\n      <strong>${u(e.customerCode||"")} - ${u(e.customerName||"")}</strong>\n      <span>Nợ: ${g(x(e))} · Chờ KT: ${g($(e))} · Có thể thu: ${g(P(e))}</span>\n    </div>`,l=r.length?`\n    <form id="mobileDebtCollectionForm" class="order-list mobile-debt-collection-form">\n      <strong>Báo thu nợ chờ kế toán xác nhận</strong>\n      <span>Chọn đơn nợ, nhập số tiền đã thu. Công nợ chỉ giảm sau khi kế toán xác nhận.</span>\n      <div class="order-list debt-order-selection-list">\n        ${r.map((e,t)=>`\n          <label class="order-item debt-order-check-row">\n            <input type="checkbox" class="mobile-debt-order-check" data-index="${t}" checked />\n            <strong>${u(e.salesOrderCode||e.orderCode||"")}</strong>\n            <span>Ngày: ${m(e.orderDate||e.documentDate||"")} · Nợ: ${g(e.debt||0)} · Chờ KT: ${g(e.pendingCollectedAmount||0)} · Có thể thu: ${g(e.availableDebt??e.debt??0)}</span>\n          </label>`).join("")}\n      </div>\n      <label>Số tiền đã thu<input id="mobileDebtCollectionAmount" name="amount" inputmode="numeric" value="${Math.max(0,Math.round(P(e)))}" /></label>\n      <label>Hình thức<select id="mobileDebtCollectionMethod" name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>\n      <label>Ghi chú<input id="mobileDebtCollectionNote" name="note" placeholder="VD: Khách trả một phần" /></label>\n      <div class="debt-submit-bar">\n        <button type="submit" class="primary-btn full-btn">Gửi phiếu thu chờ kế toán</button>\n      </div>\n      <p id="mobileDebtCollectionMessage" class="message"></p>\n    </form>`:'\n      <div class="order-item debt-no-available">\n        <strong>Không còn số tiền có thể thu</strong>\n        <span>Khách hàng đang có phiếu thu chờ kế toán hoặc công nợ đã được xử lý.</span>\n      </div>'
;et.className="order-list",et.innerHTML=d+l+c,et.querySelectorAll(".mobile-debt-order-check").forEach(t=>{t.addEventListener("change",()=>function(e={}){
const t=Gt(e),r=[...document.querySelectorAll(".mobile-debt-order-check:checked")].reduce((e,r)=>{const n=t[Number(r.dataset.index)]
;return e+Math.max(0,Number(n?.availableDebt??n?.debt??0))},0),n=document.getElementById("mobileDebtCollectionAmount");n&&(n.value=String(r)),ge.debt.formDirty=!0}(e))})
;const h=document.getElementById("mobileDebtCollectionForm");h&&(h.addEventListener("input",()=>{ge.debt.formDirty=!0}),h.addEventListener("change",()=>{ge.debt.formDirty=!0}),
h.addEventListener("submit",t=>async function(e,t={}){e.preventDefault();const r=e.target,o=document.getElementById("mobileDebtCollectionMessage"),c=ue(r.elements.amount?.value||0)
;if(c<=0)return y(o,"Số tiền thu phải lớn hơn 0","error");const d=function(e={},t=0){
const r=Gt(e),n=[...document.querySelectorAll(".mobile-debt-order-check:checked")].map(e=>Number(e.dataset.index)).filter(e=>Number.isFinite(e));let o=Math.max(0,Number(t||0))
;const a=[];return n.forEach(e=>{const t=r[e],n=Math.max(0,Number(t?.availableDebt??t?.debt??0)),s=Math.min(n,o);t&&s>0&&(a.push({salesOrderId:t.salesOrderId||t.orderId||"",
salesOrderCode:t.salesOrderCode||t.orderCode||"",allocatedAmount:s}),o-=s)}),a}(t,c);if(!d.length)return y(o,"Cần chọn ít nhất một đơn nợ","error")
;if(d.reduce((e,t)=>e+Number(t.allocatedAmount||0),0)!==c)return y(o,"Tổng tiền phân bổ phải bằng số tiền thu","error");const l=r.querySelector('button[type="submit"]')
;f(l,!0,"Đang gửi...");const u={customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",amount:c,
paymentMethod:r.elements.paymentMethod?.value||"cash",note:r.elements.note?.value||"",allocations:d};try{
const e=(await n.submitDebtCollection(u)).message||"Đã ghi nhận thu nợ, chờ kế toán xác nhận";y(o,e,"success"),y(ot,e,"success"),ge.debt.formDirty=!1,
ge.debt.selectedCustomerKey="",ge.debt.loaded=!1,await Ut({force:!0}),Ht("customers",{restoreScroll:!0})}catch(e){
i(e)&&s("debt_collection_submit")?(await a("debt_collection_submit",u),y(o,"Đã lưu phiếu thu offline, hệ thống sẽ tự đồng bộ khi có mạng","success"),
ge.debt.formDirty=!1):i(e)?y(o,"Mất kết nối. Phiếu thu chưa được gửi; dữ liệu đang nhập vẫn được giữ để bạn thử lại.","error"):y(o,e.message||"Không gửi được phiếu thu nợ","error")
}finally{f(l,!1)}}(t,e)))}function Xt(e=!0){ge.draft.cart=[],ge.draft.editingOrderId="",ge.draft.product=null,Ce.value="",Ee.value="",Ne.value="",Te.value="",Ot(),
Ve.textContent="Đặt hàng",Ge.textContent="Xác nhận đơn",e&&(ge.draft.customer=null,y(Fe,"Đã làm mới đơn. Hãy chọn khách hàng ở tab 1.","success")),Nt(),Ft(),
Lt()||ge.draft.clearPersistence()}function Yt(e=ge.orders.rows,r=ge.orders.summary){ge.orders.rows=Array.isArray(e)?e:[]
;const n=ge.orders.rows,o=String(He?.value||t()),a=[...ge.sync.pendingOrders.filter(e=>!o||String(e.date||"").slice(0,10)===o),...n],s=a.filter(St).filter(kt),i=Number(r?.totalAmount??n.reduce((e,t)=>e+Number(t.totalAmount||0),0)),c=Number(r?.paidAmount??n.reduce((e,t)=>e+Number(t.paidAmount||0),0)),d=Number(r?.debtAmount??n.reduce((e,t)=>e+Number(t.debtAmount||0),0)),l=Number(r?.orderCount??n.length)
;if(document.getElementById("todayRevenue").textContent=g(i),document.getElementById("todayOrderCount").textContent=String(l),document.getElementById("todayPaid").textContent=g(c),
document.getElementById("todayDebt").textContent=g(d),je&&(je.textContent=`${s.length} đơn`),Re&&(Re.hidden=!ge.orders.hasMore||"pending_sync"===wt()),!s.length){const e=a.length>0
;return void Ct(Qe,{state:"empty",baseClass:"order-list",title:e?"Không có đơn phù hợp bộ lọc":"Chưa có đơn trong ngày đã chọn",
detail:e?"Hãy đổi từ khóa hoặc trạng thái hiển thị.":"Đơn online và đơn chờ đồng bộ sẽ xuất hiện tại đây."})}Qe.className="order-list mobile-order-list",pt.render(s,e=>C([e],{
escapeHtml:u,money:g,formatDate:m}))}async function Jt(e={}){const r=!0===e.append,o=!0===e.force,a=re({date:He?.value||t(),q:_e?.value||""})
;if(r&&ge.orders.loadedKey!==a)return Jt({reset:!0,force:!0});if(ge.orders.loading)return;if(r&&!ge.orders.hasMore)return
;if(ge.orders.loaded&&ge.orders.loadedKey===a&&!o&&!r)return void Yt(ge.orders.rows,ge.orders.summary);const s=++ge.orders.requestSeq,i=r?ge.orders.page+1:1;ge.orders.loading=!0,
f(Re,!0,"Đang tải...");try{r||Ct(Qe,{state:"loading",baseClass:"order-list",title:"Đang tải đơn hàng..."});const e=await n.getMySalesOrders({page:i,limit:30,
date:String(He?.value||t()),q:String(_e?.value||"").trim(),requestKey:"mobile-sales-orders",cancelPrevious:!r});if(s!==ge.orders.requestSeq)return
;const o=e.items||[],c=function(e=[]){return _(e,he)}(o);ge.orders.page=Number(e.pagination?.page||i),ge.orders.hasMore=Boolean(e.pagination?.hasMore),
ge.orders.summary=e.summary||ge.orders.summary||{},ge.orders.rows=r?ne(ge.orders.rows,c):c,ge.orders.loaded=!0,ge.orders.loadedKey=a,Yt(ge.orders.rows,ge.orders.summary),
Re&&(Re.hidden=!ge.orders.hasMore||"pending_sync"===wt()),o.length!==c.length&&console.warn("[sales:owner]",R(he),o.length,c.length)}catch(e){
if(s!==ge.orders.requestSeq||"REQUEST_ABORTED"===e?.code)return;r?yt(e.message||"Không tải thêm được đơn hàng","error",{persist:!0}):(ge.orders.loaded=!1,ge.orders.loadedKey="",
Ct(Qe,{state:"error",baseClass:"order-list",title:"Không tải được đơn hàng",detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"orders"}))}finally{
s===ge.orders.requestSeq&&(ge.orders.loading=!1),f(Re,!1)}}pe.forEach(e=>e.addEventListener("click",()=>ft(e.dataset.tab))),qe?.addEventListener("click",()=>ft("cartTab")),
Ke?.addEventListener("click",()=>ft("orderTab",{historyMode:"replace"})),mt.delegate(ye,"click","[data-customer-index]",(e,t)=>{
const r=ge.customer.rows[Number(t.dataset.customerIndex)];r&&function(e){const t=K(O(e,N(ge.debt.rows))),r=Q(ge.draft.customer||{})[0]||"",n=Q(t)[0]||""
;if(Boolean(ge.draft.customer&&(r||n)&&r!==n)&&(ge.draft.cart.length||ge.draft.editingOrderId)){
if(!window.confirm("Giỏ hiện tại đang thuộc khách hàng khác. Đổi khách sẽ xóa toàn bộ giỏ đang nhập. Bạn có chắc không?"))return;ge.draft.cart=[],ge.draft.editingOrderId="",
Te.value="",Ft()}ge.draft.customer=t,Nt(),Et(),y(Fe,"Đã chọn khách hàng. Hãy thêm sản phẩm vào giỏ.","success"),ft("orderTab"),_t(),setTimeout(()=>Ce.focus(),200)}(r)}),
mt.delegate(We,"click","[data-debt-index]:not([disabled])",(e,t)=>{const r=ge.debt.rows[Number(t.dataset.debtIndex)];r&&function(e={}){const t=ce(e)
;!t||P(e)<=0||(ge.debt.selectedCustomerKey!==t?ge.debt.formDirty&&ge.debt.selectedCustomerKey&&ge.debt.selectedCustomerKey!==t&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.")||(ge.debt.listScrollTop=window.scrollY||document.documentElement.scrollTop||0,
ge.debt.selectedCustomerKey=t,ge.debt.formDirty=!1,zt(e),Ht("collect")):Ht("collect"))}(r)}),mt.listen(window,"pagehide",()=>{ht.cancel(),gt.cancel(),pt.cancel(),mt.destroy()},{
once:!0}),document.addEventListener("click",e=>{const t=e.target.closest("[data-mobile-retry]");if(!t)return;const r=t.dataset.mobileRetry;"customers"===r&&At(fe.value.trim(),{
reset:!0,force:!0}),"orders"===r&&Jt({reset:!0,force:!0}),"debts"===r&&Ut({reset:!0,force:!0})}),fe.addEventListener("input",l(()=>At(fe.value.trim(),{reset:!0}),250)),
document.getElementById("reloadCustomersBtn")?.addEventListener("click",()=>{window.CatalogCache&&window.CatalogCache.invalidate("customers"),At(fe.value.trim(),{reset:!0,force:!0
})}),ve?.addEventListener("click",()=>At(ge.customer.query,{append:!0})),document.getElementById("reloadOrdersBtn")?.addEventListener("click",()=>Jt({reset:!0,force:!0})),
Re?.addEventListener("click",()=>Jt({append:!0})),Ze?.addEventListener("click",()=>Ut({append:!0})),_e?.addEventListener("input",l(()=>{ge.orders.loaded=!1,ge.orders.loadedKey="",
Jt({reset:!0,force:!0})},300)),He?.addEventListener("change",()=>{ge.orders.loaded=!1,ge.orders.loadedKey="",Jt({reset:!0,force:!0})}),
Ue?.addEventListener("change",()=>Yt(ge.orders.rows,ge.orders.summary)),Qe?.addEventListener("click",async e=>{const t=e.target.closest("[data-edit-order]");if(t&&Qe.contains(t)){
f(t,!0,"Đang mở...");try{await async function(e){try{const t=(await n.getSalesOrder(e)).order
;if(!t.canEdit)return y(Fe,t.editLockReason||"Đơn hiện không thể chỉnh sửa trên app bán hàng.","error");ge.draft.editingOrderId=t.id||t.code,ge.draft.customer={id:t.customerId,
code:t.customerCode,name:t.customerName,phone:t.customerPhone,address:t.customerAddress,debtAmount:t.customerDebt||0,monthRevenue:t.customerMonthRevenue||0},Nt(),
ge.draft.cart=(t.items||[]).map(e=>({productId:e.productId||e.productCode,productCode:e.productCode,productName:e.productName,unit:e.unit,conversionRate:e.conversionRate,
quantity:Number(e.quantity||0),originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),
unitPrice:Number(e.unitPrice||e.salePrice||e.price||0),salePrice:Number(e.salePrice||e.unitPrice||e.price||0),price:Number(e.price||e.unitPrice||e.salePrice||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),promotionAmount:Number(e.promotionAmount||e.discountAmount||e.totalDiscountAmount||0),
amount:Number(e.amount||Number(e.quantity||0)*Number(e.unitPrice||e.salePrice||e.price||0)),promotionCode:e.promotionCode||"",promotionName:e.promotionName||""})),
Te.value=Number(t.paidAmount||0),Ve.textContent=`Sửa đơn ${t.code||""}`,Ge.textContent=`Lưu sửa đơn ${t.code||""}`,await Mt({silent:!0}),Ft()
;const r=`Đang sửa đơn ${t.code||""}. Hệ thống sẽ tính lại giá, khuyến mại và tồn kho khi lưu.`;y(Fe,r,"success"),yt(r,"info"),ft("orderTab")}catch(e){y(Fe,e.message,"error")}
}(t.dataset.editOrder)}finally{f(t,!1)}return}const r=e.target.closest("[data-delete-order]");if(r&&Qe.contains(r)){f(r,!0,"Đang xóa...");try{await async function(e,t){
if(window.confirm(`Xóa đơn ${t||e}? Chỉ xóa được khi đơn chưa gộp đơn tổng.`))try{const r=await n.deleteSalesOrder(e)
;ge.orders.rows=ge.orders.rows.filter(r=>String(r.id||r.code||"")!==String(e||"")&&String(r.code||"")!==String(t||"")),Yt(ge.orders.rows,ge.orders.summary),await Jt({reset:!0,
force:!0});const o=r.message||"Đã xóa đơn";y(Fe,o,"success"),yt(o,"success")}catch(e){y(Fe,e.message,"error"),yt(e.message||"Không xóa được đơn.","error",{persist:!0})}
}(r.dataset.deleteOrder,r.dataset.orderCode)}finally{f(r,!1)}}}),document.getElementById("reloadDebtsBtn")?.addEventListener("click",()=>{
ge.debt.formDirty&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")||(ge.debt.formDirty=!1,Ut({reset:!0,force:!0}))}),
at?.addEventListener("click",()=>Ht("customers")),st?.addEventListener("click",()=>Ht("collect")),dt?.addEventListener("input",()=>Vt(ge.debt.rows)),
lt?.addEventListener("change",()=>Vt(ge.debt.rows)),document.getElementById("clearOrderBtn")?.addEventListener("click",()=>{
Lt()&&!window.confirm("Làm mới sẽ xóa khách hàng và toàn bộ giỏ đang nhập. Bạn có chắc không?")||Xt(!0)}),document.getElementById("logoutBtn")?.addEventListener("click",e=>{
Lt()&&(window.confirm("Bạn đang có đơn chưa lưu. Thoát ứng dụng vẫn giữ bản nháp trên thiết bị. Bạn có chắc muốn thoát?")||(e.preventDefault(),e.stopImmediatePropagation()))},!0),
Te?.addEventListener("input",Et),window.addEventListener("beforeunload",e=>{Lt()&&(e.preventDefault(),e.returnValue="")}),window.addEventListener("mkpro:offline-queued",e=>{
"sales_order_create"===e.detail?.type&&(Pt(),yt("Đơn đã được lưu trên thiết bị và đang chờ đồng bộ.","warning",{persist:!0}))}),
window.addEventListener("mkpro:offline-synced",async()=>{await Pt(),ge.orders.loaded&&await Jt({reset:!0,force:!0}),yt("Đã đồng bộ dữ liệu chờ lên máy chủ.","success")}),
window.addEventListener("online",()=>{vt(),yt("Đã có kết nối mạng. Bạn có thể gửi lại thao tác chưa hoàn tất.","success")}),window.addEventListener("offline",()=>{vt(),
yt("Mất kết nối mạng. Đơn chưa gửi vẫn được giữ dưới dạng bản nháp và chưa ghi lên máy chủ.","warning",{persist:!0})}),async function(){vt(),ge.ui.activeTabId=bt.initialize(),
He&&!He.value&&(He.value=t()),Pe&&"1"!==Pe.dataset.phase3Bound&&(Pe.dataset.phase3Bound="1",Pe.addEventListener("click",async e=>{const t=e.target.closest("[data-remove]")
;if(t&&Pe.contains(t)){const e=Number(t.dataset.remove),r=ge.draft.cart[e];if(!r)return;if(!window.confirm(`Xóa ${r.productName||r.productCode} khỏi giỏ hàng?`))return
;return ge.draft.cart.splice(e,1),await Mt({silent:!0}),Ft(),void yt("Đã xóa sản phẩm khỏi giỏ hàng.","success")}const r=e.target.closest("[data-cart-update]")
;r&&Pe.contains(r)&&await async function(e,t){const r=ge.draft.cart[e];if(!r)return
;const n=Pe.querySelector(`[data-cart-case="${e}"]`),o=Pe.querySelector(`[data-cart-loose="${e}"]`),{rate:a,quantity:s}=ee(r,n?.value,o?.value),i=te(r,s)
;if(i.ok||"INVALID_QUANTITY"!==i.code)if(i.ok||"OVER_STOCK"!==i.code)if(i.ok||"OVER_APP_QUOTA"!==i.code){f(t,!0,"Đang tính...");try{r.quantity=s,await Mt({silent:!0}),Ft(),
yt(`Đã cập nhật số lượng ${r.productName||r.productCode}.`,"success")}finally{f(t,!1)}
}else y(Fe,`Số lượng vượt hạn mức bán App (${Dt(i.maxOrderQty,a)}).`,"error");else y(Fe,`Số lượng vượt tồn đang hiển thị (${Dt(i.availableQty,a)}).`,"error");else y(Fe,"Số lượng sau khi sửa phải lớn hơn 0. Hãy dùng nút Xóa nếu không mua sản phẩm này.","error")
}(Number(r.dataset.cartUpdate),r)})),zt(),Ht("customers",{restoreScroll:!1}),function(){const e=ge.draft.restore();return!!e&&(e.customer&&(ge.draft.customer=K(e.customer)),
Te&&(Te.value=e.paidAmount),Nt(),ge.draft.editingOrderId&&(Ve.textContent=`Tiếp tục sửa đơn ${ge.draft.editingOrderId}`,Ge.textContent=`Lưu sửa đơn ${ge.draft.editingOrderId}`),
Lt())}()&&yt("Đã khôi phục đơn đang nhập trên thiết bị này.","success");const e=n.getRuntimeConfig().catch(()=>null);await Pt(),await At("",{reset:!0}),await e,Ft(),
activateTabData(ge.ui.activeTabId)}(),document.getElementById("addItemBtn").addEventListener("click",async()=>{if(y(Fe,""),
!ge.draft.customer)return y(Fe,"Chưa chọn khách hàng ở tab 1","error");if(!ge.draft.product)return y(Fe,"Chưa chọn sản phẩm","error")
;const e=Number(Ee?.value||0),t=Number(Ne?.value||0),r=F(ge.draft.product),n=(e>0&&r>0?e*r:0)+t;if(n<=0)return y(Fe,"Số lượng phải lớn hơn 0","error")
;const o=Number(ge.draft.product.availableQty||0),a=Math.max(0,Number(ge.draft.product.maxOrderQty||0));if(o>0&&n>o)return y(Fe,"Số lượng vượt tồn thực tế","error")
;if(n>a)return y(Fe,a>0?`Sản phẩm chỉ còn được bán qua App ${Dt(a,r)}`:"Sản phẩm chưa có hạn mức bán qua App. Vui lòng cập nhật file tồn DMS buổi sáng.","error")
;const s=Number(ge.draft.product.salePrice||ge.draft.product.price||0),i=ge.draft.cart.find(e=>e.productCode===ge.draft.product.code);if(i){const e=Number(i.quantity||0)+n
;if(o>0&&e>o)return y(Fe,"Tổng số lượng vượt tồn thực tế","error");if(e>a)return y(Fe,`Tổng số lượng vượt hạn mức bán App. Còn tối đa ${Dt(a,r)}`,"error");i.quantity=e,
i.availableQty=Math.max(Number(i.availableQty||0),o),i.maxOrderQty=Math.max(Number(i.maxOrderQty||0),a),
i.originalPrice=Number(i.originalPrice||i.grossPrice||i.catalogSalePrice||s),i.grossPrice=i.originalPrice,i.catalogSalePrice=i.originalPrice,U(i,{
conversionRate:i.conversionRate||ge.draft.product.conversionRate,unitsPerCase:i.unitsPerCase||ge.draft.product.unitsPerCase,packingQty:i.packingQty||ge.draft.product.packingQty,
packQty:ge.draft.product.packQty,pack:ge.draft.product.pack,packageQty:ge.draft.product.packageQty})}else ge.draft.cart.push(U({productId:ge.draft.product.id,
productCode:ge.draft.product.code,productName:ge.draft.product.name,unit:ge.draft.product.unit,quantity:n,originalPrice:s,grossPrice:s,catalogSalePrice:s,
grossAmount:Math.round(n*s),unitPrice:s,salePrice:s,price:s,finalPrice:s,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(n*s),saleMethod:"promotion",
saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,availableQty:o,maxOrderQty:a,internalSaleQuota:ge.draft.product.internalSaleQuota||{}},ge.draft.product))
;ge.draft.product=null,Ce.value="",Ee.value="",Ne.value="",Le.textContent="",Le.hidden=!0,Le.classList.add("muted"),await Mt(),Ft(),
y(Fe,"Đã thêm vào giỏ hàng và áp giá sau khuyến mại","success"),ke&&(ke.innerHTML="",ke.classList.remove("has-many"),ke.hidden=!0,ke.style.display="none"),
window.requestAnimationFrame(()=>Ce?.focus())}),Ge.addEventListener("click",async()=>{if(Ge.disabled)return;if(y(Fe,""),
!ge.draft.customer)return y(Fe,"Chưa chọn khách hàng","error");const e=K(ge.draft.customer)
;if(!(e.code||e.customerCode||e.id||e.customerId))return y(Fe,"Thiếu mã khách hàng, vui lòng chọn lại khách ở tab Khách hàng","error")
;if(!ge.draft.cart.length)return y(Fe,"Chưa có sản phẩm","error");f(Ge,!0);let t=null;try{const r=Number(Te.value||0);await Mt({silent:!0});const o={customer:e,
customerId:e.customerId||e.id||e.code||"",customerCode:e.customerCode||e.code||"",customerName:e.customerName||e.name||"",items:W(ge.draft.cart),paidAmount:r,
note:ge.draft.editingOrderId?"Sửa từ app bán hàng mobile":"Tạo từ app bán hàng mobile"};t=o
;const a=ge.draft.editingOrderId?await n.updateSalesOrder(ge.draft.editingOrderId,o):await n.createSalesOrder(o),s=a.salesOrder?.code||""
;window.CatalogCache&&window.CatalogCache.invalidate("products"),Xt(!1),function(e={}){ge.orders.rows=ie(ge.orders.rows,e),Yt(ge.orders.rows,ge.orders.summary)}(a.salesOrder)
;const i=`${a.message||"Đã lưu đơn"} ${s}`.trim();y(Fe,i,"success"),yt(i,"success"),ge.debt.loaded&&await Ut({reset:!0,force:!0}),await Jt({reset:!0,force:!0}),ft("reportTab")
}catch(e){if(!ge.draft.editingOrderId&&t&&i(e)&&s("sales_order_create")){await a("sales_order_create",t),Xt(!1)
;const e="Đã lưu đơn offline. Đơn đang hiển thị trong danh sách Chờ đồng bộ.";y(Fe,e,"success"),yt(e,"warning",{persist:!0}),await Pt(),ft("reportTab")}else if(i(e)){Et()
;const e="Mất kết nối — đơn chưa được gửi. Bản nháp vẫn được giữ; vui lòng thử lại khi có mạng.";y(Fe,e,"error"),yt(e,"warning",{persist:!0})}else y(Fe,e.message,"error"),
yt(e.message||"Không lưu được đơn hàng.","error",{persist:!0})}finally{f(Ge,!1),Ge.disabled=!ge.draft.customer||0===ge.draft.cart.length}});
