/* GENERATED FILE — edit public/mobile/js/sales.source/part-01.jsfrag, public/mobile/js/sales.source/part-01c.jsfrag, public/mobile/js/sales.source/part-01b.jsfrag, public/mobile/js/sales.source/part-02.jsfrag, public/mobile/js/sales.source/part-02b.jsfrag, public/mobile/js/sales.source/part-03.jsfrag, public/mobile/js/sales.source/part-03b.jsfrag and run npm run build:source-bundles. */
const e=window.V45Common||{},t=e.todayValue,n=e.calculateCartonUnit;import{mobileApi as r,getUser as a}from"./api.js?v=phase86-production-hardening-v1"
;import{queueOperation as o,canQueueOfflineOperation as s,isNetworkError as i,listOperations as c}from"./offline-sync.js?v=phase86-production-hardening-v1"
;import{bindLogout as d,debounce as l,escapeHtml as u,formatDisplayDate as m,formatShortDate as h,money as g,requireLogin as p,requireRole as b,setButtonBusy as f,setMessage as y}from"./ui.js"
;import{buildCartItemsHtml as v,buildOrderCardsHtml as C,createMobileSalesNavigation as w,createStatusAnnouncer as k}from"./sales-ux.js?v=phase155-returns-modal-v1"
;import{collectMobileSalesDom as S}from"./sales/dom.js?v=phase86-production-hardening-v1"
;import{createMobileSalesState as N,OrderDraftStore as P}from"./sales/state.js?v=phase86-production-hardening-v1"
;import{buildDebtLookup as E,customerAddressValue as L,customerAvailableDebtValue as T,customerCodeValue as A,customerDebtValue as x,customerNameValue as D,customerPendingCollectedValue as $,customerPhoneValue as M,customerSalesValue as O,debtClassName as B,mergeCustomerDebt as I,mergeCustomerPages as q,normalizeSelectedCustomerForSubmit as K,uniqueCustomerIdentityKeys as Q}from"./sales/customer.js?v=phase86-production-hardening-v1"
;import{currentSalesStaffCode as R,filterOrdersForCurrentSalesUser as _}from"./sales/staff.js?v=phase86-production-hardening-v1"
;import{applyPromotionLines as H,attachPackingRate as U,buildPromotionCartPayloadItem as j,normalizePackingRate as F,normalizeProductGroupName as V,normalizeProductSearchResponse as G,toMobileProduct as z}from"./sales/product.js?v=phase86-production-hardening-v1"
;import{buildOrderPayloadItems as X,calculateCartTotals as Y,cartQuantityFromInputs as W,validateCartQuantity as J}from"./sales/cart.js?v=phase86-production-hardening-v1"
;import{buildOrderQueryKey as Z,mergeOrderPages as ee,orderMatchesDisplayFilter as te,orderMatchesSearchText as ne,orderStatusFilterValue as re,upsertOrder as ae}from"./sales/orders.js?v=phase86-production-hardening-v1"
;import{debtCustomerKey as oe,filterAndSortDebts as se,mergeDebtPages as ie,parseMobileMoneyInput as ce}from"./sales/debt.js?v=phase86-production-hardening-v1"
;import{offlineOperationToOrder as de}from"./sales/sync.js?v=phase86-production-hardening-v1";p(),b(["sales"]),d(document.getElementById("logoutBtn"));const le=a()
;document.getElementById("staffInfo").textContent=`${le.name||le.username||"Nhân viên"}`;const ue=N({draftStore:new P({ownerKey:R(le)||le.id||le.username||"sales"})
}),{tabs:me,panels:he,customerSearch:ge,customerList:pe,customerLoadMoreBtn:be,productSearch:fe,productGroupFilter:ye,productSuggestions:ve,selectedCustomerBox:Ce,selectedProductBox:we,caseQtyInput:ke,looseQtyInput:Se,paidAmountInput:Ne,cartList:Pe,cartCustomerContext:Ee,cartCount:Le,cartTotal:Te,cartGrossTotal:Ae,cartDiscountTotal:xe,orderDraftBar:De,orderDraftLineCount:$e,orderDraftTotal:Me,openCartBtn:Oe,backToOrderBtn:Be,todayOrders:Ie,orderLoadMoreBtn:qe,orderSearch:Ke,orderDateFilter:Qe,orderStatusFilter:Re,orderFilterResultCount:_e,message:He,orderFormTitle:Ue,submitOrderBtn:je,cartTabBadge:Fe,syncNavBadge:Ve,networkStatus:Ge,mobileGlobalStatus:ze,debtList:Xe,debtLoadMoreBtn:Ye,debtLedgerList:We,debtTotalAmount:Je,debtCustomerCount:Ze,debtPendingAmount:et,debtTabMessage:tt,debtCustomersSubtab:nt,debtCollectSubtab:rt,debtCustomersPanel:at,debtCollectPanel:ot,debtCustomerSearch:st,debtCustomerSort:it}=S(),ct=window.MobileUiRuntime,dt=ct.createLifecycle(),lt=ct.createChunkedHtmlRenderer(pe,{
initialCount:60,chunkSize:80}),ut=ct.createChunkedHtmlRenderer(Xe,{initialCount:60,chunkSize:80}),mt=ct.createChunkedHtmlRenderer(Ie,{initialCount:60,chunkSize:80}),ht=w({tabs:me,
panels:he,panelIds:["customersTab","orderTab","cartTab","debtTab","reportTab"],initialPanel:"customersTab",fallbackPanel:"customersTab",hashByPanel:{customersTab:"#khach-hang",
orderTab:"#ban-hang",cartTab:"#gio-hang",debtTab:"#cong-no",reportTab:"#don-hang"},onActivate(e){ue.ui.activeTabId=e,"debtTab"===e&&qt(),"reportTab"===e&&Ft(),
"orderTab"!==e&&"cartTab"!==e||Bt()}});function gt(e,t={}){ue.ui.activeTabId=ht.switchPanel(e,t)}const pt=k(ze);function bt(){if(!Ge)return;const e=!1!==navigator.onLine
;Ge.textContent=e?"":"Mất mạng",Ge.hidden=e,Ge.classList.toggle("offline",!e),Ge.classList.toggle("online",e)}function ft(e,t={}){ct.renderState(e,{...t,
className:t.baseClass||"order-list"})}function yt(){return re(Re)}function vt(e={}){return te(e,yt())}function Ct(e={}){return ne(e,Ke?.value||"")}function wt(){
return ue.draft.isDirty(Ne?.value||0)}function kt(){ue.draft.persist(Ne?.value||"")}function St(){
if(!ue.draft.customer)return Ce.textContent="Chưa chọn khách hàng. Hãy sang tab Khách hàng để chọn.",Ce.classList.add("muted"),
void(Ee&&(Ee.textContent="Chưa chọn khách hàng cho đơn này.",Ee.classList.add("muted")));const e=ue.draft.customer,t=A(e),n=D(e),r=L(e),a={
heading:`${t||""}${t&&n?" · ":""}${n||""}`,lines:[`${/^chưa có/i.test(r)?"":`${r} · `}Nợ ${g(x(e))} · DS tháng ${g(O(e))}`]};window.SafeDom.renderSummary(Ce,a),
Ce.classList.remove("muted"),Ee&&(window.SafeDom.renderSummary(Ee,{...a,prefix:"Đơn đang lập cho"}),Ee.classList.remove("muted"))}function Nt(e={}){return de(e,{customerName:D,
customerCode:A})}async function Pt(){try{const e=await c({statuses:["pending","failed","conflict","needs_attention"],limit:100})
;ue.sync.pendingOrders=e.filter(e=>"sales_order_create"===e.type).map(Nt),Ve&&(Ve.textContent=String(ue.sync.pendingOrders.length),Ve.hidden=0===ue.sync.pendingOrders.length),
jt(ue.orders.rows)}catch(e){ue.sync.pendingOrders=[],Ve&&(Ve.hidden=!0)}}async function Et(e="",t={}){const n=!0===t.append;if(ue.customer.loading)return
;if(n&&!ue.customer.hasMore)return;const a=++ue.customer.requestSeq,o=n?ue.customer.page+1:1;ue.customer.loading=!0,ue.customer.query=e,f(be,!0,"Đang tải...");try{n||ft(pe,{
state:"loading",baseClass:"customer-list",title:e?"Đang tìm khách hàng...":"Đang tải khách hàng phụ trách..."});const t=await async function(e="",t={}){return r.getCustomers(e,{
page:t.page||1,limit:t.limit||40,requestKey:"mobile-customers",cancelPrevious:!1!==t.cancelPrevious})}(e,{page:o,cancelPrevious:!n});if(a!==ue.customer.requestSeq)return
;const s=t.items||t.customers||[];ue.customer.page=Number(t.pagination?.page||o),ue.customer.hasMore=Boolean(t.pagination?.hasMore),ue.customer.rows=n?q(ue.customer.rows,s):s,
Lt(ue.customer.rows),be&&(be.hidden=!ue.customer.hasMore)}catch(e){if(a!==ue.customer.requestSeq||"REQUEST_ABORTED"===e?.code)return
;n?y(He,e.message||"Không tải thêm được khách hàng","error"):ft(pe,{state:"error",baseClass:"customer-list",title:"Không tải được khách hàng",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"customers"})}finally{a===ue.customer.requestSeq&&(ue.customer.loading=!1),f(be,!1)}}function Lt(e){
const t=E(ue.debt.rows),n=(Array.isArray(e)?e:[]).map(e=>I(e,t)).sort((e,t)=>x(t)-x(e));ue.customer.rows=n,n.length?(pe.className="customer-list",lt.render(n,(e,t)=>{
const n=A(e),r=D(e),a=x(e),o=M(e),s=L(e)
;return`\n      <button class="customer-card ${B(e)}" data-customer-index="${t}">\n        <strong>${u(n||"")}${n&&r?" - ":""}${u(r||"")}</strong>\n        <span class="customer-contact">SĐT: ${u(o)}</span>\n        <span class="customer-contact">ĐC: ${u(s)}</span>\n        <div class="customer-metrics">\n          <em class="metric-debt">Nợ: ${g(a)}</em>\n          <em>DS tháng: ${g(O(e))}</em>\n        </div>\n      </button>\n    `
})):ft(pe,{state:"empty",baseClass:"customer-list",title:"Không có khách hàng phù hợp",
detail:ge.value.trim()?"Hãy thử từ khóa ngắn hơn hoặc kiểm tra mã khách.":"Danh sách khách hàng phụ trách đang trống."})}function Tt(e,t){return n(e,t).display}function At(e={}){
const t=F(e);return Tt(Number(e.quantity||e.qty||0),t)}async function xt(e={}){if(!ue.draft.cart.length)return;const n=!!e.silent;try{const e=await r.calculatePromotions({date:t(),
saleDate:t(),items:ue.draft.cart.map(j)}),n=Array.isArray(e?.result?.lines)?e.result.lines:[];ue.draft.cart=H(ue.draft.cart,n)}catch(e){
n||y(He,e.message||"Không tính được khuyến mại cho giỏ hàng","error"),ue.draft.cart=ue.draft.cart.map(e=>{
const t=Number(e.quantity||0),n=Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0);return{...e,originalPrice:n,grossPrice:n,catalogSalePrice:n,
unitPrice:n,salePrice:n,price:n,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(t*n),saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",
priceLocked:!0}})}}function Dt(e={}){return z(e,{formatStock:Tt})}function $t(){return V(ye?.value||"")}function Mt(){ue.draft.product=null,fe&&(fe.dataset.id="",
fe.dataset.code="",fe.dataset.name="",fe.dataset.type=""),we.textContent="",we.hidden=!0,we.classList.add("muted")}function Ot(e){const t=Dt(e);ue.draft.product=t,
fe.dataset.id=t.id||"",fe.dataset.code=t.code||"",fe.dataset.name=t.name||"",fe.dataset.type="product",fe.value=t.label||[t.code,t.name].filter(Boolean).join(" - ")
;const n=Number(t.finalPrice||t.unitPrice||t.salePrice||t.price||0),r=Number(t.originalPrice||t.grossPrice||t.catalogSalePrice||t.salePrice||t.price||0),a=[{label:"Tồn thực tế",
value:t.stockDisplay||Tt(t.availableQty,t.conversionRate)},{label:"Được bán App",value:Tt(t.maxOrderQty,t.conversionRate),className:"mobile-app-quota-meta"}];r>n?a.push({
label:"Giá KM",value:g(n)},{label:"Giá gốc",value:g(r)}):a.push({label:"Giá bán",value:g(n)}),window.SafeDom.renderMetricCard(we,{title:`${t.code||""} - ${t.name||""}`,
titleClass:"mobile-selected-product-name",metaClass:"mobile-selected-product-meta",metrics:a,note:`Hạn mức theo file DMS: ${t.internalSaleQuota?.snapshotDate||"chưa cập nhật"}`,
noteClass:"mobile-selected-product-quota-note"}),we.hidden=!1,we.classList.remove("muted"),ve.innerHTML="",ve.classList.remove("has-many"),ve.hidden=!0,ve.style.display="none",
Se.focus()}function Bt(){ue.product.toolsInitialized||(ue.product.toolsInitialized=!0,
fe&&ve&&(window.SearchAutocomplete&&window.UnifiedProductSearch?(window.SearchAutocomplete.wire({input:fe,box:ve,getItems:()=>async function(e=""){const t=String(e||"").trim()
;if(t.length<2)return[];try{const e=await r.getProducts(t,{limit:20,group:$t(),inStockOnly:"1"
}),n=G(e).map(Dt).filter(e=>Number(e.availableQty||e.availableStock||e.stockQuantity||0)>0)
;return window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.sync&&window.UnifiedProductSearch.sync(n),n}catch(e){
console.warn("[mobile-sales] mobile product search fallback:",e.message||e)}if(window.UnifiedSearchEngine&&"function"==typeof window.UnifiedSearchEngine.searchProduct){
const e=await window.UnifiedSearchEngine.searchProduct(t,{limit:20,mode:"sales",includeStock:1,inStockOnly:1,group:$t()})
;return G(e).map(Dt).filter(e=>Number(e.availableQty||e.availableStock||e.stockQuantity||0)>0)}
if(window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.search){const e=await window.UnifiedProductSearch.search(t,{limit:20,mode:"sales",group:$t()})
;return G(e).map(Dt).filter(e=>Number(e.availableQty||e.availableStock||e.stockQuantity||0)>0)}return[]}(fe.value.trim()),
label:e=>window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.label?window.UnifiedProductSearch.label(e,"sales"):e.label||[e.code,e.name].filter(Boolean).join(" - "),
select:Ot,emptyText:"Không tìm thấy sản phẩm phù hợp"}),fe.addEventListener("input",Mt),ye?.addEventListener("change",()=>{Mt(),fe&&(fe.value=""),ve&&(ve.innerHTML="",
ve.classList.remove("has-many"),ve.hidden=!0,ve.style.display="none")}),async function(e=!1){if(ye&&(!ue.product.groupOptionsLoaded||e)){ue.product.groupOptionsLoaded=!0;try{
const e=await r.getProductGroups();!function(e=[]){if(!ye)return;const t=$t(),n=[...new Set((e||[]).map(V).filter(Boolean))].sort((e,t)=>e.localeCompare(t,"vi",{numeric:!0}))
;ye.replaceChildren();const r=document.createElement("option");r.value="",r.textContent="Tất cả nhóm hàng",ye.appendChild(r),n.forEach(e=>{const t=document.createElement("option")
;t.value=e,t.textContent=e,ye.appendChild(t)}),t&&n.includes(t)&&(ye.value=t)}(e.items||e.groups||[])}catch(e){ue.product.groupOptionsLoaded=!1,
"REQUEST_ABORTED"!==e?.code&&console.warn("[mobile-sales] không tải được nhóm hàng sản phẩm:",e.message||e)}}}(),fe.addEventListener("focus",()=>{
fe.dispatchEvent(new Event("input",{bubbles:!0}))}),fe.addEventListener("keydown",e=>{"Escape"===e.key&&(ve.innerHTML="",ve.classList.remove("has-many"))
})):ve.innerHTML='<div class="suggestion-empty">Thiếu engine gợi ý sản phẩm dùng chung.</div>'))}function It(e,t={}){const n="collect"===e?"collect":"customers";ue.debt.subtab=n,
nt?.classList.toggle("active","customers"===n),rt?.classList.toggle("active","collect"===n),nt?.setAttribute("aria-selected",String("customers"===n)),
rt?.setAttribute("aria-selected",String("collect"===n)),at?.classList.toggle("active","customers"===n),ot?.classList.toggle("active","collect"===n),
"collect"!==n?!1!==t.restoreScroll&&window.requestAnimationFrame(()=>window.scrollTo({top:ue.debt.listScrollTop,behavior:"auto"
})):!1!==t.scroll&&document.getElementById("debtTab")?.scrollIntoView({block:"start",behavior:t.behavior||"smooth"})}async function qt(e={}){
const t=!0===e.append,n=!0===e.force,a=document.getElementById("debtTab")?.classList.contains("active");if(ue.debt.loading)return;if(t&&!ue.debt.hasMore)return
;if(ue.debt.loaded&&!n&&!t)return void Kt(ue.debt.rows,ue.debt.summary);const o=++ue.debt.requestSeq,s=t?ue.debt.page+1:1;ue.debt.loading=!0,f(Ye,!0,"Đang tải...");try{
Xe&&!t&&a&&ft(Xe,{state:"loading",baseClass:"order-list",title:"Đang tải công nợ..."});const e=await r.getSalesDebts({page:s,limit:30,includePaid:"0",includePendingCollections:"1",
collectorType:"sales",cancelPrevious:!t});if(o!==ue.debt.requestSeq)return;const n=Array.isArray(e.items)?e.items:[];ue.debt.page=Number(e.pagination?.page||s),
ue.debt.hasMore=Boolean(e.pagination?.hasMore),ue.debt.summary=e.summary||ue.debt.summary||{},ue.debt.rows=t?ie(ue.debt.rows,n):n,ue.debt.loaded=!0,
Kt(ue.debt.rows,ue.debt.summary),Ye&&(Ye.hidden=!ue.debt.hasMore),Array.isArray(ue.customer.rows)&&ue.customer.rows.length&&Lt(ue.customer.rows)}catch(e){
if(o!==ue.debt.requestSeq||"REQUEST_ABORTED"===e?.code)return;t||(ue.debt.loaded=!1),Xe&&a&&!t?ft(Xe,{state:"error",baseClass:"order-list",title:"Không tải được công nợ",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"debts"}):y(tt,e.message||"Không tải thêm được công nợ","error")}finally{
o===ue.debt.requestSeq&&(ue.debt.loading=!1),f(Ye,!1)}}function Kt(e=ue.debt.rows,t={}){
const n=Number(t.totalDebt??e.reduce((e,t)=>e+Number(t.debtAmount||0),0)),r=Number(t.pendingCollected??e.reduce((e,t)=>e+$(t),0));if(Je&&(Je.textContent=g(n)),
Ze&&(Ze.textContent=String(t.customerCount??e.length)),et&&(et.textContent=g(r)),Rt(e),ue.debt.selectedCustomerKey){
const e=ue.debt.selectedCustomerKey&&ue.debt.rows.find(e=>oe(e)===ue.debt.selectedCustomerKey)||null;e?ue.debt.formDirty||Ht(e):(ue.debt.selectedCustomerKey="",
ue.debt.formDirty=!1,Ht())}else Ht()}function Qt(){St(),kt(),function(){const e=Y(ue.draft.cart);Le.textContent=`${ue.draft.cart.length} dòng`,
Fe&&(Fe.textContent=String(ue.draft.cart.length)),Ae&&(Ae.textContent=g(e.gross)),xe&&(xe.textContent=e.discount>0?`-${g(e.discount)}`:g(0)),Te.textContent=g(e.payable),
$e&&($e.textContent=`${ue.draft.cart.length} sản phẩm`),Me&&(Me.textContent=g(e.payable)),De&&(De.hidden=0===ue.draft.cart.length),
je&&(je.disabled=!ue.draft.customer||0===ue.draft.cart.length)}(),ue.draft.cart.length?(Pe.className="cart-list",Pe.innerHTML=v(ue.draft.cart,{escapeHtml:u,money:g,
normalizePackingRate:F,quantityDisplay:At})):ft(Pe,{state:"empty",baseClass:"cart-list",title:"Giỏ hàng chưa có sản phẩm",
detail:ue.draft.customer?"Quay lại Bán hàng để chọn sản phẩm.":"Hãy chọn khách hàng trước khi lập đơn."})}function Rt(e=ue.debt.rows){if(!Xe)return;const t=Array.isArray(e)?e:[]
;if(!t.length)return void ft(Xe,{state:"empty",baseClass:"order-list",title:"Không có khách hàng còn nợ",detail:"Danh sách sẽ cập nhật khi có công nợ phát sinh."})
;const n=function(e=ue.debt.rows){return se(e,{keyword:st?.value||"",sortMode:it?.value||"debt_desc",formatDate:h})}(t);n.length?(Xe.className="order-list debt-customer-list",
ut.render(n,({item:e,originalIndex:t})=>{const n=T(e),r=n<=0
;return`\n      <article class="debt-card${oe(e)===ue.debt.selectedCustomerKey?" selected":""}">\n        <div class="debt-card-content">\n          <strong>${u(e.customerCode||"")} - ${u(e.customerName||"")}</strong>\n          <span>Công nợ: ${g(e.debtAmount||0)} · Chờ KT: ${g($(e))} · Có thể thu: ${g(n)}</span>\n          <span>${e.orderCount||0} đơn · Nợ cũ nhất: ${m(e.oldestDebtDate||"")}</span>\n        </div>\n        <button type="button" class="${r?"ghost-btn":"primary-btn"} small-btn debt-collect-action" data-debt-index="${t}" ${r?'disabled aria-disabled="true"':""}>\n          ${r?"Đang chờ KT":"Thu nợ"}\n        </button>\n      </article>`
})):ft(Xe,{state:"empty",baseClass:"order-list",title:"Không tìm thấy khách hàng phù hợp",detail:"Hãy thử mã khách, tên hoặc số điện thoại khác."})}function _t(e={}){
const t=Array.isArray(e.orders)?e.orders:[]
;return t.length?t.filter(e=>Number(e.availableDebt??e.debt??0)>0):(Array.isArray(e.ledgers)?e.ledgers:[]).filter(e=>Number(e.debt||0)>0).map(e=>({
salesOrderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderDate:e.date||e.documentDate||"",debt:Number(e.debt||0),
availableDebt:Number(e.debt||0),pendingCollectedAmount:0}))}function Ht(e={}){if(!We)return;if(!oe(e))return We.className="order-list empty",
We.innerHTML='\n      <div class="debt-empty-state">\n        <strong>Chưa chọn khách hàng để thu nợ</strong>\n        <span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span>\n        <button id="chooseDebtCustomerBtn" type="button" class="ghost-btn">Chọn khách hàng</button>\n      </div>',
void document.getElementById("chooseDebtCustomerBtn")?.addEventListener("click",()=>It("customers"));const t=Array.isArray(e.ledgers)?e.ledgers:[],n=_t(e);let a=0
;const c=t.length?`\n    <details class="debt-ledger-details">\n      <summary>Sổ công nợ (${t.length} dòng)</summary>\n      <div class="order-list">\n        ${t.map(e=>(a+=Number(e.debit||0)-Number(e.credit||0),
`\n            <div class="order-item">\n              <strong>${u(m(e.date))} · ${u(e.type||e.refType||"")}</strong>\n              <span>Đơn: ${u(e.salesOrderCode||e.refCode||"")}</span>\n              <span>Phát sinh: ${g(e.debit||0)} · Thanh toán: ${g(e.credit||0)} · Dư nợ: ${g(Math.max(0,a))}</span>\n            </div>`)).join("")}\n      </div>\n    </details>`:"",d=`\n    <div class="debt-selected-customer">\n      <strong>${u(e.customerCode||"")} - ${u(e.customerName||"")}</strong>\n      <span>Nợ: ${g(x(e))} · Chờ KT: ${g($(e))} · Có thể thu: ${g(T(e))}</span>\n    </div>`,l=n.length?`\n    <form id="mobileDebtCollectionForm" class="order-list mobile-debt-collection-form">\n      <strong>Báo thu nợ chờ kế toán xác nhận</strong>\n      <span>Chọn đơn nợ, nhập số tiền đã thu. Công nợ chỉ giảm sau khi kế toán xác nhận.</span>\n      <div class="order-list debt-order-selection-list">\n        ${n.map((e,t)=>`\n          <label class="order-item debt-order-check-row">\n            <input type="checkbox" class="mobile-debt-order-check" data-index="${t}" checked />\n            <strong>${u(e.salesOrderCode||e.orderCode||"")}</strong>\n            <span>Ngày: ${m(e.orderDate||e.documentDate||"")} · Nợ: ${g(e.debt||0)} · Chờ KT: ${g(e.pendingCollectedAmount||0)} · Có thể thu: ${g(e.availableDebt??e.debt??0)}</span>\n          </label>`).join("")}\n      </div>\n      <label>Số tiền đã thu<input id="mobileDebtCollectionAmount" name="amount" inputmode="numeric" value="${Math.max(0,Math.round(T(e)))}" /></label>\n      <label>Hình thức<select id="mobileDebtCollectionMethod" name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>\n      <label>Ghi chú<input id="mobileDebtCollectionNote" name="note" placeholder="VD: Khách trả một phần" /></label>\n      <div class="debt-submit-bar">\n        <button type="submit" class="primary-btn full-btn">Gửi phiếu thu chờ kế toán</button>\n      </div>\n      <p id="mobileDebtCollectionMessage" class="message"></p>\n    </form>`:'\n      <div class="order-item debt-no-available">\n        <strong>Không còn số tiền có thể thu</strong>\n        <span>Khách hàng đang có phiếu thu chờ kế toán hoặc công nợ đã được xử lý.</span>\n      </div>'
;We.className="order-list",We.innerHTML=d+l+c,We.querySelectorAll(".mobile-debt-order-check").forEach(t=>{t.addEventListener("change",()=>function(e={}){
const t=_t(e),n=[...document.querySelectorAll(".mobile-debt-order-check:checked")].reduce((e,n)=>{const r=t[Number(n.dataset.index)]
;return e+Math.max(0,Number(r?.availableDebt??r?.debt??0))},0),r=document.getElementById("mobileDebtCollectionAmount");r&&(r.value=String(n)),ue.debt.formDirty=!0}(e))})
;const h=document.getElementById("mobileDebtCollectionForm");h&&(h.addEventListener("input",()=>{ue.debt.formDirty=!0}),h.addEventListener("change",()=>{ue.debt.formDirty=!0}),
h.addEventListener("submit",t=>async function(e,t={}){e.preventDefault();const n=e.target,a=document.getElementById("mobileDebtCollectionMessage"),c=ce(n.elements.amount?.value||0)
;if(c<=0)return y(a,"Số tiền thu phải lớn hơn 0","error");const d=function(e={},t=0){
const n=_t(e),r=[...document.querySelectorAll(".mobile-debt-order-check:checked")].map(e=>Number(e.dataset.index)).filter(e=>Number.isFinite(e));let a=Math.max(0,Number(t||0))
;const o=[];return r.forEach(e=>{const t=n[e],r=Math.max(0,Number(t?.availableDebt??t?.debt??0)),s=Math.min(r,a);t&&s>0&&(o.push({salesOrderId:t.salesOrderId||t.orderId||"",
salesOrderCode:t.salesOrderCode||t.orderCode||"",allocatedAmount:s}),a-=s)}),o}(t,c);if(!d.length)return y(a,"Cần chọn ít nhất một đơn nợ","error")
;if(d.reduce((e,t)=>e+Number(t.allocatedAmount||0),0)!==c)return y(a,"Tổng tiền phân bổ phải bằng số tiền thu","error");const l=n.querySelector('button[type="submit"]')
;f(l,!0,"Đang gửi...");const u={customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",amount:c,
paymentMethod:n.elements.paymentMethod?.value||"cash",note:n.elements.note?.value||"",allocations:d};try{
const e=(await r.submitDebtCollection(u)).message||"Đã ghi nhận thu nợ, chờ kế toán xác nhận";y(a,e,"success"),y(tt,e,"success"),ue.debt.formDirty=!1,
ue.debt.selectedCustomerKey="",ue.debt.loaded=!1,await qt({force:!0}),It("customers",{restoreScroll:!0})}catch(e){
i(e)&&s("debt_collection_submit")?(await o("debt_collection_submit",u),y(a,"Đã lưu phiếu thu offline, hệ thống sẽ tự đồng bộ khi có mạng","success"),
ue.debt.formDirty=!1):i(e)?y(a,"Mất kết nối. Phiếu thu chưa được gửi; dữ liệu đang nhập vẫn được giữ để bạn thử lại.","error"):y(a,e.message||"Không gửi được phiếu thu nợ","error")
}finally{f(l,!1)}}(t,e)))}function Ut(e=!0){ue.draft.cart=[],ue.draft.editingOrderId="",ue.draft.product=null,fe.value="",ke.value="",Se.value="",Ne.value="",Mt(),
Ue.textContent="Đặt hàng",je.textContent="Xác nhận đơn",e&&(ue.draft.customer=null,y(He,"Đã làm mới đơn. Hãy chọn khách hàng ở tab 1.","success")),St(),Qt(),
wt()||ue.draft.clearPersistence()}function jt(e=ue.orders.rows,n=ue.orders.summary){ue.orders.rows=Array.isArray(e)?e:[]
;const r=ue.orders.rows,a=String(Qe?.value||t()),o=[...ue.sync.pendingOrders.filter(e=>!a||String(e.date||"").slice(0,10)===a),...r],s=o.filter(Ct).filter(vt),i=Number(n?.totalAmount??r.reduce((e,t)=>e+Number(t.totalAmount||0),0)),c=Number(n?.paidAmount??r.reduce((e,t)=>e+Number(t.paidAmount||0),0)),d=Number(n?.debtAmount??r.reduce((e,t)=>e+Number(t.debtAmount||0),0)),l=Number(n?.orderCount??r.length)
;if(document.getElementById("todayRevenue").textContent=g(i),document.getElementById("todayOrderCount").textContent=String(l),document.getElementById("todayPaid").textContent=g(c),
document.getElementById("todayDebt").textContent=g(d),_e&&(_e.textContent=`${s.length} đơn`),qe&&(qe.hidden=!ue.orders.hasMore||"pending_sync"===yt()),!s.length){const e=o.length>0
;return void ft(Ie,{state:"empty",baseClass:"order-list",title:e?"Không có đơn phù hợp bộ lọc":"Chưa có đơn trong ngày đã chọn",
detail:e?"Hãy đổi từ khóa hoặc trạng thái hiển thị.":"Đơn online và đơn chờ đồng bộ sẽ xuất hiện tại đây."})}Ie.className="order-list mobile-order-list",mt.render(s,e=>C([e],{
escapeHtml:u,money:g,formatDate:m}))}async function Ft(e={}){const n=!0===e.append,a=!0===e.force,o=Z({date:Qe?.value||t(),q:Ke?.value||""})
;if(n&&ue.orders.loadedKey!==o)return Ft({reset:!0,force:!0});if(ue.orders.loading)return;if(n&&!ue.orders.hasMore)return
;if(ue.orders.loaded&&ue.orders.loadedKey===o&&!a&&!n)return void jt(ue.orders.rows,ue.orders.summary);const s=++ue.orders.requestSeq,i=n?ue.orders.page+1:1;ue.orders.loading=!0,
f(qe,!0,"Đang tải...");try{n||ft(Ie,{state:"loading",baseClass:"order-list",title:"Đang tải đơn hàng..."});const e=await r.getMySalesOrders({page:i,limit:30,
date:String(Qe?.value||t()),q:String(Ke?.value||"").trim(),requestKey:"mobile-sales-orders",cancelPrevious:!n});if(s!==ue.orders.requestSeq)return
;const a=e.items||[],c=function(e=[]){return _(e,le)}(a);ue.orders.page=Number(e.pagination?.page||i),ue.orders.hasMore=Boolean(e.pagination?.hasMore),
ue.orders.summary=e.summary||ue.orders.summary||{},ue.orders.rows=n?ee(ue.orders.rows,c):c,ue.orders.loaded=!0,ue.orders.loadedKey=o,jt(ue.orders.rows,ue.orders.summary),
qe&&(qe.hidden=!ue.orders.hasMore||"pending_sync"===yt()),a.length!==c.length&&console.warn("[MOBILE_SALES_OWNER_GUARD]",{currentSalesStaffCode:R(le),received:a.length,
rendered:c.length})}catch(e){if(s!==ue.orders.requestSeq||"REQUEST_ABORTED"===e?.code)return;n?pt(e.message||"Không tải thêm được đơn hàng","error",{persist:!0
}):(ue.orders.loaded=!1,ue.orders.loadedKey="",ft(Ie,{state:"error",baseClass:"order-list",title:"Không tải được đơn hàng",
detail:e.message||"Vui lòng kiểm tra kết nối và thử lại.",retryAction:"orders"}))}finally{s===ue.orders.requestSeq&&(ue.orders.loading=!1),f(qe,!1)}}
me.forEach(e=>e.addEventListener("click",()=>gt(e.dataset.tab))),Oe?.addEventListener("click",()=>gt("cartTab")),Be?.addEventListener("click",()=>gt("orderTab",{
historyMode:"replace"})),dt.delegate(pe,"click","[data-customer-index]",(e,t)=>{const n=ue.customer.rows[Number(t.dataset.customerIndex)];n&&function(e){
const t=K(I(e,E(ue.debt.rows))),n=Q(ue.draft.customer||{})[0]||"",r=Q(t)[0]||"";if(Boolean(ue.draft.customer&&(n||r)&&n!==r)&&(ue.draft.cart.length||ue.draft.editingOrderId)){
if(!window.confirm("Giỏ hiện tại đang thuộc khách hàng khác. Đổi khách sẽ xóa toàn bộ giỏ đang nhập. Bạn có chắc không?"))return;ue.draft.cart=[],ue.draft.editingOrderId="",
Ne.value="",Qt()}ue.draft.customer=t,St(),kt(),y(He,"Đã chọn khách hàng. Hãy thêm sản phẩm vào giỏ.","success"),gt("orderTab"),Bt(),setTimeout(()=>fe.focus(),200)}(n)}),
dt.delegate(Xe,"click","[data-debt-index]:not([disabled])",(e,t)=>{const n=ue.debt.rows[Number(t.dataset.debtIndex)];n&&function(e={}){const t=oe(e)
;!t||T(e)<=0||(ue.debt.selectedCustomerKey!==t?ue.debt.formDirty&&ue.debt.selectedCustomerKey&&ue.debt.selectedCustomerKey!==t&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.")||(ue.debt.listScrollTop=window.scrollY||document.documentElement.scrollTop||0,
ue.debt.selectedCustomerKey=t,ue.debt.formDirty=!1,Ht(e),It("collect")):It("collect"))}(n)}),dt.listen(window,"pagehide",()=>{lt.cancel(),ut.cancel(),mt.cancel(),dt.destroy()},{
once:!0}),document.addEventListener("click",e=>{const t=e.target.closest("[data-mobile-retry]");if(!t)return;const n=t.dataset.mobileRetry;"customers"===n&&Et(ge.value.trim(),{
reset:!0,force:!0}),"orders"===n&&Ft({reset:!0,force:!0}),"debts"===n&&qt({reset:!0,force:!0})}),ge.addEventListener("input",l(()=>Et(ge.value.trim(),{reset:!0}),250)),
document.getElementById("reloadCustomersBtn")?.addEventListener("click",()=>{window.CatalogCache&&window.CatalogCache.invalidate("customers"),Et(ge.value.trim(),{reset:!0,force:!0
})}),be?.addEventListener("click",()=>Et(ue.customer.query,{append:!0})),document.getElementById("reloadOrdersBtn")?.addEventListener("click",()=>Ft({reset:!0,force:!0})),
qe?.addEventListener("click",()=>Ft({append:!0})),Ye?.addEventListener("click",()=>qt({append:!0})),Ke?.addEventListener("input",l(()=>{ue.orders.loaded=!1,ue.orders.loadedKey="",
Ft({reset:!0,force:!0})},300)),Qe?.addEventListener("change",()=>{ue.orders.loaded=!1,ue.orders.loadedKey="",Ft({reset:!0,force:!0})}),
Re?.addEventListener("change",()=>jt(ue.orders.rows,ue.orders.summary)),Ie?.addEventListener("click",async e=>{const t=e.target.closest("[data-edit-order]");if(t&&Ie.contains(t)){
f(t,!0,"Đang mở...");try{await async function(e){try{const t=(await r.getSalesOrder(e)).order
;if(!t.canEdit)return y(He,t.editLockReason||"Đơn hiện không thể chỉnh sửa trên app bán hàng.","error");ue.draft.editingOrderId=t.id||t.code,ue.draft.customer={id:t.customerId,
code:t.customerCode,name:t.customerName,phone:t.customerPhone,address:t.customerAddress,debtAmount:t.customerDebt||0,monthRevenue:t.customerMonthRevenue||0},St(),
ue.draft.cart=(t.items||[]).map(e=>({productId:e.productId||e.productCode,productCode:e.productCode,productName:e.productName,unit:e.unit,conversionRate:e.conversionRate,
quantity:Number(e.quantity||0),originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),
unitPrice:Number(e.unitPrice||e.salePrice||e.price||0),salePrice:Number(e.salePrice||e.unitPrice||e.price||0),price:Number(e.price||e.unitPrice||e.salePrice||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),promotionAmount:Number(e.promotionAmount||e.discountAmount||e.totalDiscountAmount||0),
amount:Number(e.amount||Number(e.quantity||0)*Number(e.unitPrice||e.salePrice||e.price||0)),promotionCode:e.promotionCode||"",promotionName:e.promotionName||""})),
Ne.value=Number(t.paidAmount||0),Ue.textContent=`Sửa đơn ${t.code||""}`,je.textContent=`Lưu sửa đơn ${t.code||""}`,await xt({silent:!0}),Qt()
;const n=`Đang sửa đơn ${t.code||""}. Hệ thống sẽ tính lại giá, khuyến mại và tồn kho khi lưu.`;y(He,n,"success"),pt(n,"info"),gt("orderTab")}catch(e){y(He,e.message,"error")}
}(t.dataset.editOrder)}finally{f(t,!1)}return}const n=e.target.closest("[data-delete-order]");if(n&&Ie.contains(n)){f(n,!0,"Đang xóa...");try{await async function(e,t){
if(window.confirm(`Xóa đơn ${t||e}? Chỉ xóa được khi đơn chưa gộp đơn tổng.`))try{const n=await r.deleteSalesOrder(e)
;ue.orders.rows=ue.orders.rows.filter(n=>String(n.id||n.code||"")!==String(e||"")&&String(n.code||"")!==String(t||"")),jt(ue.orders.rows,ue.orders.summary),await Ft({reset:!0,
force:!0});const a=n.message||"Đã xóa đơn";y(He,a,"success"),pt(a,"success")}catch(e){y(He,e.message,"error"),pt(e.message||"Không xóa được đơn.","error",{persist:!0})}
}(n.dataset.deleteOrder,n.dataset.orderCode)}finally{f(n,!1)}}}),document.getElementById("reloadDebtsBtn")?.addEventListener("click",()=>{
ue.debt.formDirty&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")||(ue.debt.formDirty=!1,qt({reset:!0,force:!0}))}),
nt?.addEventListener("click",()=>It("customers")),rt?.addEventListener("click",()=>It("collect")),st?.addEventListener("input",()=>Rt(ue.debt.rows)),
it?.addEventListener("change",()=>Rt(ue.debt.rows)),document.getElementById("clearOrderBtn")?.addEventListener("click",()=>{
wt()&&!window.confirm("Làm mới sẽ xóa khách hàng và toàn bộ giỏ đang nhập. Bạn có chắc không?")||Ut(!0)}),document.getElementById("logoutBtn")?.addEventListener("click",e=>{
wt()&&(window.confirm("Bạn đang có đơn chưa lưu. Thoát ứng dụng vẫn giữ bản nháp trên thiết bị. Bạn có chắc muốn thoát?")||(e.preventDefault(),e.stopImmediatePropagation()))},!0),
Ne?.addEventListener("input",kt),window.addEventListener("beforeunload",e=>{wt()&&(e.preventDefault(),e.returnValue="")}),window.addEventListener("mkpro:offline-queued",e=>{
"sales_order_create"===e.detail?.type&&(Pt(),pt("Đơn đã được lưu trên thiết bị và đang chờ đồng bộ.","warning",{persist:!0}))}),
window.addEventListener("mkpro:offline-synced",async()=>{await Pt(),ue.orders.loaded&&await Ft({reset:!0,force:!0}),pt("Đã đồng bộ dữ liệu chờ lên máy chủ.","success")}),
window.addEventListener("online",()=>{bt(),pt("Đã có kết nối mạng. Bạn có thể gửi lại thao tác chưa hoàn tất.","success")}),window.addEventListener("offline",()=>{bt(),
pt("Mất kết nối mạng. Đơn chưa gửi vẫn được giữ dưới dạng bản nháp và chưa ghi lên máy chủ.","warning",{persist:!0})}),async function(){bt(),ue.ui.activeTabId=ht.initialize(),
Qe&&!Qe.value&&(Qe.value=t()),Pe&&"1"!==Pe.dataset.phase3Bound&&(Pe.dataset.phase3Bound="1",Pe.addEventListener("click",async e=>{const t=e.target.closest("[data-remove]")
;if(t&&Pe.contains(t)){const e=Number(t.dataset.remove),n=ue.draft.cart[e];if(!n)return;if(!window.confirm(`Xóa ${n.productName||n.productCode} khỏi giỏ hàng?`))return
;return ue.draft.cart.splice(e,1),await xt({silent:!0}),Qt(),void pt("Đã xóa sản phẩm khỏi giỏ hàng.","success")}const n=e.target.closest("[data-cart-update]")
;n&&Pe.contains(n)&&await async function(e,t){const n=ue.draft.cart[e];if(!n)return
;const r=Pe.querySelector(`[data-cart-case="${e}"]`),a=Pe.querySelector(`[data-cart-loose="${e}"]`),{rate:o,quantity:s}=W(n,r?.value,a?.value),i=J(n,s)
;if(i.ok||"INVALID_QUANTITY"!==i.code)if(i.ok||"OVER_STOCK"!==i.code)if(i.ok||"OVER_APP_QUOTA"!==i.code){f(t,!0,"Đang tính...");try{n.quantity=s,await xt({silent:!0}),Qt(),
pt(`Đã cập nhật số lượng ${n.productName||n.productCode}.`,"success")}finally{f(t,!1)}
}else y(He,`Số lượng vượt hạn mức bán App (${Tt(i.maxOrderQty,o)}).`,"error");else y(He,`Số lượng vượt tồn đang hiển thị (${Tt(i.availableQty,o)}).`,"error");else y(He,"Số lượng sau khi sửa phải lớn hơn 0. Hãy dùng nút Xóa nếu không mua sản phẩm này.","error")
}(Number(n.dataset.cartUpdate),n)})),Ht(),It("customers",{restoreScroll:!1}),function(){const e=ue.draft.restore();return!!e&&(e.customer&&(ue.draft.customer=K(e.customer)),
Ne&&(Ne.value=e.paidAmount),St(),ue.draft.editingOrderId&&(Ue.textContent=`Tiếp tục sửa đơn ${ue.draft.editingOrderId}`,je.textContent=`Lưu sửa đơn ${ue.draft.editingOrderId}`),
wt())}()&&pt("Đã khôi phục đơn đang nhập trên thiết bị này.","success");const e=r.getRuntimeConfig().catch(()=>null);await Pt(),await Et("",{reset:!0}),await e,Qt(),
activateTabData(ue.ui.activeTabId)}(),document.getElementById("addItemBtn").addEventListener("click",async()=>{if(y(He,""),
!ue.draft.customer)return y(He,"Chưa chọn khách hàng ở tab 1","error");if(!ue.draft.product)return y(He,"Chưa chọn sản phẩm","error")
;const e=Number(ke?.value||0),t=Number(Se?.value||0),n=F(ue.draft.product),r=(e>0&&n>0?e*n:0)+t;if(r<=0)return y(He,"Số lượng phải lớn hơn 0","error")
;const a=Number(ue.draft.product.availableQty||0),o=Math.max(0,Number(ue.draft.product.maxOrderQty||0));if(a>0&&r>a)return y(He,"Số lượng vượt tồn thực tế","error")
;if(r>o)return y(He,o>0?`Sản phẩm chỉ còn được bán qua App ${Tt(o,n)}`:"Sản phẩm chưa có hạn mức bán qua App. Vui lòng cập nhật file tồn DMS buổi sáng.","error")
;const s=Number(ue.draft.product.salePrice||ue.draft.product.price||0),i=ue.draft.cart.find(e=>e.productCode===ue.draft.product.code);if(i){const e=Number(i.quantity||0)+r
;if(a>0&&e>a)return y(He,"Tổng số lượng vượt tồn thực tế","error");if(e>o)return y(He,`Tổng số lượng vượt hạn mức bán App. Còn tối đa ${Tt(o,n)}`,"error");i.quantity=e,
i.availableQty=Math.max(Number(i.availableQty||0),a),i.maxOrderQty=Math.max(Number(i.maxOrderQty||0),o),
i.originalPrice=Number(i.originalPrice||i.grossPrice||i.catalogSalePrice||s),i.grossPrice=i.originalPrice,i.catalogSalePrice=i.originalPrice,U(i,{
conversionRate:i.conversionRate||ue.draft.product.conversionRate,unitsPerCase:i.unitsPerCase||ue.draft.product.unitsPerCase,packingQty:i.packingQty||ue.draft.product.packingQty,
packQty:ue.draft.product.packQty,pack:ue.draft.product.pack,packageQty:ue.draft.product.packageQty})}else ue.draft.cart.push(U({productId:ue.draft.product.id,
productCode:ue.draft.product.code,productName:ue.draft.product.name,unit:ue.draft.product.unit,quantity:r,originalPrice:s,grossPrice:s,catalogSalePrice:s,
grossAmount:Math.round(r*s),unitPrice:s,salePrice:s,price:s,finalPrice:s,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(r*s),saleMethod:"promotion",
saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,availableQty:a,maxOrderQty:o,internalSaleQuota:ue.draft.product.internalSaleQuota||{}},ue.draft.product))
;ue.draft.product=null,fe.value="",ke.value="",Se.value="",we.textContent="",we.hidden=!0,we.classList.add("muted"),await xt(),Qt(),
y(He,"Đã thêm vào giỏ hàng và áp giá sau khuyến mại","success"),ve&&(ve.innerHTML="",ve.classList.remove("has-many"),ve.hidden=!0,ve.style.display="none"),
window.requestAnimationFrame(()=>fe?.focus())}),je.addEventListener("click",async()=>{if(je.disabled)return;if(y(He,""),
!ue.draft.customer)return y(He,"Chưa chọn khách hàng","error");const e=K(ue.draft.customer)
;if(!(e.code||e.customerCode||e.id||e.customerId))return y(He,"Thiếu mã khách hàng, vui lòng chọn lại khách ở tab Khách hàng","error")
;if(!ue.draft.cart.length)return y(He,"Chưa có sản phẩm","error");f(je,!0);let t=null;try{const n=Number(Ne.value||0);await xt({silent:!0});const a={customer:e,
customerId:e.customerId||e.id||e.code||"",customerCode:e.customerCode||e.code||"",customerName:e.customerName||e.name||"",items:X(ue.draft.cart),paidAmount:n,
note:ue.draft.editingOrderId?"Sửa từ app bán hàng mobile":"Tạo từ app bán hàng mobile"};t=a
;const o=ue.draft.editingOrderId?await r.updateSalesOrder(ue.draft.editingOrderId,a):await r.createSalesOrder(a),s=o.salesOrder?.code||""
;window.CatalogCache&&window.CatalogCache.invalidate("products"),Ut(!1),function(e={}){ue.orders.rows=ae(ue.orders.rows,e),jt(ue.orders.rows,ue.orders.summary)}(o.salesOrder)
;const i=`${o.message||"Đã lưu đơn"} ${s}`.trim();y(He,i,"success"),pt(i,"success"),ue.debt.loaded&&await qt({reset:!0,force:!0}),await Ft({reset:!0,force:!0}),gt("reportTab")
}catch(e){if(!ue.draft.editingOrderId&&t&&i(e)&&s("sales_order_create")){await o("sales_order_create",t),Ut(!1)
;const e="Đã lưu đơn offline. Đơn đang hiển thị trong danh sách Chờ đồng bộ.";y(He,e,"success"),pt(e,"warning",{persist:!0}),await Pt(),gt("reportTab")}else if(i(e)){kt()
;const e="Mất kết nối — đơn chưa được gửi. Bản nháp vẫn được giữ; vui lòng thử lại khi có mạng.";y(He,e,"error"),pt(e,"warning",{persist:!0})}else y(He,e.message,"error"),
pt(e.message||"Không lưu được đơn hàng.","error",{persist:!0})}finally{f(je,!1),je.disabled=!ue.draft.customer||0===ue.draft.cart.length}});
