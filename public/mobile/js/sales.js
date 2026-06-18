/* GENERATED FILE — edit public/mobile/js/sales.source/part-01.jsfrag, public/mobile/js/sales.source/part-02.jsfrag, public/mobile/js/sales.source/part-03.jsfrag and run npm run build:source-bundles. */
const e=window.V45Common||{},t=e.todayValue,n=e.calculateCartonUnit;import{mobileApi as o,getUser as r}from"./api.js"
;import{queueOperation as a,isNetworkError as c}from"./offline-sync.js"
;import{bindLogout as i,debounce as s,escapeHtml as d,money as u,requireLogin as l,requireRole as m,setMessage as h}from"./ui.js";l(),m(["sales"]),
i(document.getElementById("logoutBtn"));const g=r();function p(e,t,n="Đang lưu..."){e&&(t?(e.dataset.originalText=e.dataset.originalText||e.textContent||"",e.disabled=!0,
e.textContent=n):(e.disabled=!1,e.dataset.originalText&&(e.textContent=e.dataset.originalText),delete e.dataset.originalText))}
document.getElementById("staffInfo").textContent=`${g.name||g.username||"Nhân viên"} · ${g.role||"sales"}`
;let b=null,y=null,f=[],C="",v=[],N=[],P=[],S=[],A=!1,$=!1,w=0,k="customers",E="",x=!1,I=0
;const L=document.querySelectorAll(".tab-btn"),D=document.querySelectorAll(".tab-panel"),B=document.getElementById("customerSearch"),M=document.getElementById("customerList"),T=document.getElementById("productSearch"),Q=document.getElementById("productGroupFilter")
;let O=!1
;const q=document.getElementById("productSuggestions"),R=document.getElementById("selectedCustomer"),K=document.getElementById("selectedProduct"),H=document.getElementById("caseQtyInput"),_=document.getElementById("looseQtyInput"),U=document.getElementById("paidAmountInput"),j=document.getElementById("cartList"),G=document.getElementById("cartCount"),F=document.getElementById("cartTotal"),V=document.getElementById("todayOrders"),X=document.getElementById("salesMessage"),W=document.getElementById("orderFormTitle"),z=document.getElementById("submitOrderBtn"),Y=document.getElementById("cartTabBadge"),J=document.getElementById("debtList"),Z=document.getElementById("debtLedgerList"),ee=document.getElementById("debtTotalAmount"),te=document.getElementById("debtCustomerCount"),ne=document.getElementById("debtPendingAmount"),oe=document.getElementById("debtTabMessage"),re=document.getElementById("debtCustomersSubtab"),ae=document.getElementById("debtCollectSubtab"),ce=document.getElementById("debtCustomersPanel"),ie=document.getElementById("debtCollectPanel"),se=document.getElementById("debtCustomerSearch"),de=document.getElementById("debtCustomerSort")
;function ue(e){L.forEach(t=>t.classList.toggle("active",t.dataset.tab===e)),D.forEach(t=>t.classList.toggle("active",t.id===e)),window.scrollTo({top:0,behavior:"smooth"})}
function le(e){const n=String(e||t()).trim();let o=n.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
;if(o)return`${o[1]}-${String(o[2]).padStart(2,"0")}-${String(o[3]).padStart(2,"0")}`;if(o=n.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/),o){
let e=Number(o[1]),t=Number(o[2]),n=Number(o[3]);if(n<100&&(n+=n>=70?1900:2e3),t>=1&&t<=12&&e>=1&&e<=31)return`${n}-${String(t).padStart(2,"0")}-${String(e).padStart(2,"0")}`}
return n.slice(0,10)}function me(e){const t=le(e),n=String(t||"").match(/^(\d{4})-(\d{2})-(\d{2})/);return n?`${n[3]}/${n[2]}`:t||"-"}function he(e={}){
return Number(e.debtAmount??e.currentDebt??e.debt??e.arDebt??0)}function ge(e={}){return Number(e.availableDebtAmount??e.availableDebt??e.debtAmount??e.debt??0)}function pe(e={}){
return Number(e.pendingCollectedAmount??e.pendingCollected??0)}function be(e={}){return Number(e.monthRevenue??e.monthSales??e.salesAmount??0)}function ye(e=""){
return String(e||"").trim().toLowerCase()}function fe(){return String(g.salesStaffCode||g.salesmanCode||g.nvbhCode||g.maNVBH||g.staffCode||g.code||"").trim()}function Ce(e,t=""){
const n=String(e??"").trim();return n&&"undefined"!==n&&"null"!==n?n:t}function ve(e={}){return Ce(e.code||e.customerCode||e.customerId||e.id||"")}function Ne(e={}){
return Ce(e.name||e.customerName||e.fullName||"")}function Pe(e={}){return Ce(e.phone||e.customerPhone||e.mobile||e.tel||e.telephone||e.contactPhone||e.sdt||"","Chưa có SĐT")}
function Se(e={}){return Ce(e.address||e.customerAddress||e.fullAddress||e.diaChi||e.routeAddress||"","Chưa có địa chỉ")}function Ae(e={}){
const t=ve(e),n=Ne(e),o=Ce(e.id||e._id||e.customerId||""),r=Ce(e.phone||e.customerPhone||e.mobile||e.tel||e.telephone||e.contactPhone||e.sdt||""),a=Ce(e.address||e.customerAddress||e.fullAddress||e.diaChi||e.routeAddress||"")
;return{...e,id:o,customerId:Ce(e.customerId||o||t),code:t,customerCode:t,name:n,customerName:n,phone:r,customerPhone:r,address:a,customerAddress:a}}function $e(e={}){
return[e.id,e._id,e.customerId,e.code,e.customerCode,e.name,e.customerName].map(e=>String(e||"").trim()).filter(Boolean)}function we(e=S){const t=new Map
;return(Array.isArray(e)?e:[]).forEach(e=>{$e(e).forEach(n=>t.set(n,e))}),t}function ke(e={},t=we()){const n=$e(e).map(e=>t.get(e)).find(Boolean);return n?{...e,
debtAmount:Number(n.debtAmount||0),orderCount:Number(n.orderCount||0),oldestDebtDate:n.oldestDebtDate||e.oldestDebtDate||""}:{...e,debtAmount:he(e)}}async function Ee(e=""){try{
M.className="customer-list empty",M.textContent=e?"Đang tìm khách hàng...":"Nhập từ khóa để tìm khách hàng...",v=await async function(e=""){const t=await o.getCustomers(e,{
limit:300});return t.items||t.customers||[]}(e),xe(v)}catch(e){M.className="customer-list empty",M.textContent=e.message}}function xe(e){
const t=we(),n=(Array.isArray(e)?e:[]).map(e=>ke(e,t)).sort((e,t)=>he(t)-he(e));if(v=n,!n.length)return M.className="customer-list empty",
void(M.textContent="Không có khách hàng phù hợp");M.className="customer-list",M.innerHTML=n.map((e,t)=>{const n=ve(e),o=Ne(e),r=he(e),a=Pe(e),c=Se(e)
;return`\n      <button class="customer-card ${function(e={}){const t=he(e);return t>1e7?"debt-high":t>=3e6?"debt-mid":t>0?"debt-low":"debt-zero"
}(e)}" data-customer-index="${t}">\n        <strong>${d(n||"")}${n&&o?" - ":""}${d(o||"")}</strong>\n        <span class="customer-contact">SĐT: ${d(a)}</span>\n        <span class="customer-contact">ĐC: ${d(c)}</span>\n        <div class="customer-metrics">\n          <em class="metric-debt">Nợ: ${u(r)}</em>\n          <em>DS tháng: ${u(be(e))}</em>\n        </div>\n      </button>\n    `
}).join(""),M.querySelectorAll("[data-customer-index]").forEach(e=>{e.addEventListener("click",()=>function(e){const t=Ae(ke(e));b=t;const n=ve(t),o=Ne(t)
;R.innerHTML=`\n    <strong>${d(n||"")}${n&&o?" - ":""}${d(o||"")}</strong><br />\n    <span>SĐT: ${d(Pe(t))}</span><br />\n    <span>ĐC: ${d(Se(t))}</span><br />\n    <span>Nợ: ${u(he(t))} · DS tháng: ${u(be(t))}</span>\n  `,
R.classList.remove("muted"),h(X,"Đã chọn khách hàng. Hãy thêm sản phẩm vào giỏ.","success"),ue("orderTab"),setTimeout(()=>T.focus(),200)}(v[Number(e.dataset.customerIndex)]))})}
function Ie(e={}){const t=Number(e.conversionRate??e.unitsPerCase??e.packingQty??e.packQty??e.pack??e.packageQty??1);return Number.isFinite(t)&&t>0?t:1}function Le(e={},t={}){
const n=Ie(t);return e.conversionRate=n,e.packingQty=n,e.unitsPerCase=n,e}function De(e,t){return n(e,t).display}function Be(e={}){return{
productId:e.productId||e.id||e.productCode,productCode:e.productCode||e.code,productName:e.productName||e.name,quantity:Number(e.quantity||0),conversionRate:Ie(e),
grossPrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
salePrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
price:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0)}}async function Me(e={}){if(!f.length)return;const n=!!e.silent;try{
const e=await o.calculatePromotions({date:t(),saleDate:t(),items:f.map(Be)
}),n=Array.isArray(e?.result?.lines)?e.result.lines:[],r=new Map(n.map(e=>[String(e.productCode||e.code||"").trim(),e]));f=f.map(e=>{
const t=String(e.productCode||e.code||"").trim(),n=r.get(t)||{},o=Number(e.quantity||0),a=Number(n.catalogSalePrice||e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),c=Math.round(o*a),i=Number(n.directDiscountAmount||0),s=Number(n.groupDiscountAmount||0),d=Math.min(c,Math.max(0,i+s)),u=Math.max(0,c-d),l=o>0?Math.round(u/o):a,m=Array.isArray(n.promotionRows)?n.promotionRows:[],h=m[0]||n.directPromotionRule||{}
;return Le({...e,originalPrice:a,grossPrice:a,catalogSalePrice:a,grossAmount:c,directDiscountPercent:Number(n.directDiscountPercent||0),
groupDiscountPercent:Number(n.groupDiscountPercent||0),discountPercent:c>0?d/c*100:0,directDiscountAmount:i,groupDiscountAmount:s,discountAmount:d,promotionAmount:d,
totalDiscountAmount:d,finalPrice:l,unitPrice:l,salePrice:l,price:l,amount:u,netAmount:u,saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,
lockedPrice:!0,lockedPromotion:!0,promotionCalculated:!0,promotionCode:n.promotionCode||h.promotionCode||h.code||h.programCode||"",
promotionName:n.promotionName||h.description||h.programName||h.name||"",promotionRows:m},e)})}catch(e){n||h(X,e.message||"Không tính được khuyến mại cho giỏ hàng","error"),
f=f.map(e=>{const t=Number(e.quantity||0),n=Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0);return{...e,originalPrice:n,grossPrice:n,
catalogSalePrice:n,unitPrice:n,salePrice:n,price:n,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(t*n),saleMethod:"promotion",saleMode:"promotion",
pricingMode:"promotion",priceLocked:!0}})}}function Te(e={}){
const t=Number(e._availableQty??e.availableQty??e.availableStock??e.stockQuantity??e.stock??0),n=e.code||e.productCode||e.sku||"",o=e.name||e.productName||"",r=String(e.groupName||e.productGroupName||e.productGroup||e.group||e.categoryName||e.category||"").trim(),a=e.internalSaleQuota&&"object"==typeof e.internalSaleQuota?e.internalSaleQuota:{},c=Math.max(0,Number(e.maxOrderQty??a.currentlyAllowedQty??a.remainingQty??0))
;return{...e,id:e.id||e._id||n,code:n,name:o,groupName:r,category:e.category||r,salePrice:Number(e.salePrice||e.price||0),availableQty:t,stockQuantity:t,conversionRate:Ie(e),
packingQty:Ie(e),unitsPerCase:Ie(e),stockDisplay:De(t,Ie(e)),maxOrderQty:c,internalSaleQuota:{...a,remainingQty:Math.max(0,Number(a.remainingQty||0)),currentlyAllowedQty:c}}}
function Qe(e=""){return String(e||"").trim()}function Oe(e=""){
return String(e||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function qe(){return Qe(Q?.value||"")}
function Re(){y=null,T&&(T.dataset.id="",T.dataset.code="",T.dataset.name="",T.dataset.type=""),K.textContent="Chưa chọn sản phẩm",K.classList.add("muted")}function Ke(e){
const t=Te(e);y=t,T.dataset.id=t.id||"",T.dataset.code=t.code||"",T.dataset.name=t.name||"",T.dataset.type="product",T.value=t.label||[t.code,t.name].filter(Boolean).join(" - ")
;const n=Number(t.finalPrice||t.unitPrice||t.salePrice||t.price||0),o=Number(t.originalPrice||t.grossPrice||t.catalogSalePrice||t.salePrice||t.price||0),r=o>n?`Giá KM<strong>${u(n)}</strong>`:`Giá bán<strong>${u(n)}</strong>`,a=o>n?`<span>Giá gốc<strong>${u(o)}</strong></span>`:""
;K.innerHTML=`\n    <div class="mobile-selected-product-name">${d(t.code||"")} - ${d(t.name||"")}</div>\n    <div class="mobile-selected-product-meta">\n      <span>Tồn thực tế<strong>${d(t.stockDisplay||De(t.availableQty,t.conversionRate))}</strong></span>\n      <span class="mobile-app-quota-meta">Được bán App<strong>${d(De(t.maxOrderQty,t.conversionRate))}</strong></span>\n      <span>${r}</span>\n      ${a}\n    </div>\n    <div class="mobile-selected-product-quota-note">Hạn mức theo file DMS: ${d(t.internalSaleQuota?.snapshotDate||"chưa cập nhật")}</div>\n  `,
K.classList.remove("muted"),q.innerHTML="",q.classList.remove("has-many"),q.hidden=!0,q.style.display="none",_.focus()}function He(e){if(Array.isArray(e))return e
;if(!e||"object"!=typeof e)return[];const t=e.items||e.products||e.rows||e.data||e.result||[];return Array.isArray(t)?t:[]}function _e(){
const e=f.reduce((e,t)=>e+Number(t.amount||0),0);if(G.textContent=`${f.length} dòng`,Y&&(Y.textContent=String(f.length)),F.textContent=u(e),
!f.length)return j.className="cart-list empty",void(j.textContent="Chưa có sản phẩm");j.className="cart-list",j.innerHTML=f.map((e,t)=>{
const n=Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),o=Number(e.unitPrice||e.salePrice||e.price||0),r=Number(e.discountAmount||e.promotionAmount||Math.max(0,(n-o)*Number(e.quantity||0))),a=r>0?`Giá gốc: ${u(n)} · KM: -${u(r)} · Giá bán: ${u(o)}`:`Giá bán: ${u(o)}`
;return`\n    <div class="cart-item">\n      <strong>${d(e.productCode)} - ${d(e.productName)}</strong>\n      <span>SL: ${function(e={}){const t=Ie(e)
;return De(Number(e.quantity||e.qty||0),t)}(e)} · ${a} · Thành tiền: ${u(e.amount)}</span>\n      <button class="danger-btn small-btn" data-remove="${t}">Xóa</button>\n    </div>`
}).join(""),j.querySelectorAll("[data-remove]").forEach(e=>{e.addEventListener("click",async()=>{f.splice(Number(e.dataset.remove),1),await Me({silent:!0}),_e()})})}
function Ue(e={}){return String(e.customerId||e.customerCode||e.code||e.id||e._id||e.customerName||"").trim()}function je(e,t={}){const n="collect"===e?"collect":"customers";k=n,
re?.classList.toggle("active","customers"===n),ae?.classList.toggle("active","collect"===n),re?.setAttribute("aria-selected",String("customers"===n)),
ae?.setAttribute("aria-selected",String("collect"===n)),ce?.classList.toggle("active","customers"===n),ie?.classList.toggle("active","collect"===n),
"collect"!==n?!1!==t.restoreScroll&&window.requestAnimationFrame(()=>window.scrollTo({top:I,behavior:"auto"})):!1!==t.scroll&&document.getElementById("debtTab")?.scrollIntoView({
block:"start",behavior:t.behavior||"smooth"})}async function Ge(e={}){const t=!!e.silent,n=!!e.force,r=document.getElementById("debtTab")?.classList.contains("active");if($)return
;if(A&&!n&&S.length&&!t)return void Fe(S,{totalDebt:S.reduce((e,t)=>e+Number(t.debtAmount||0),0),pendingCollected:S.reduce((e,t)=>e+pe(t),0),customerCount:S.length});const a=++w
;$=!0;try{!J||t&&!r||(J.className="order-list empty",J.textContent="Đang tải công nợ...");const e=await o.getSalesDebts({limit:100,includePaid:"0",includePendingCollections:"1",
collectorType:"sales"});if(a!==w)return;S=Array.isArray(e.items)?e.items:[],A=!0,Fe(S,e.summary||{}),Array.isArray(v)&&v.length&&xe(v)}catch(e){if(a!==w)return;A=!1,
!J||t&&!r||(J.className="order-list empty error-text",J.textContent=e.message||"Không tải được công nợ"),!ee||t&&!r||(ee.textContent="0"),!te||t&&!r||(te.textContent="0"),
!ne||t&&!r||(ne.textContent="0")}finally{a===w&&($=!1)}}function Fe(e=S,t={}){
const n=Number(t.totalDebt??e.reduce((e,t)=>e+Number(t.debtAmount||0),0)),o=Number(t.pendingCollected??e.reduce((e,t)=>e+pe(t),0));if(ee&&(ee.textContent=u(n)),
te&&(te.textContent=String(t.customerCount??e.length)),ne&&(ne.textContent=u(o)),Ve(e),E){const e=E&&S.find(e=>Ue(e)===E)||null;e?x||We(e):(E="",x=!1,We())}else We()}
function Ve(e=S){if(!J)return;const t=Array.isArray(e)?e:[];if(!t.length)return J.className="order-list empty",void(J.textContent="Không có khách hàng còn nợ")
;const n=function(e=S){const t=String(se?.value||"").trim().toLowerCase(),n=String(de?.value||"debt_desc"),o=(Array.isArray(e)?e:[]).map((e,t)=>({item:e,originalIndex:t
})).filter(({item:e})=>!t||[e.customerCode,e.customerName,e.phone,e.customerPhone].some(e=>String(e||"").toLowerCase().includes(t)));return o.sort((e,t)=>{const o=e.item,r=t.item
;if("available_desc"===n)return ge(r)-ge(o);if("oldest_asc"===n){const e=le(o.oldestDebtDate||"9999-12-31"),t=le(r.oldestDebtDate||"9999-12-31");return e.localeCompare(t)}
return he(r)-he(o)}),o}(t);if(!n.length)return J.className="order-list empty",void(J.textContent="Không tìm thấy khách hàng phù hợp");J.className="order-list debt-customer-list",
J.innerHTML=n.map(({item:e,originalIndex:t})=>{const n=ge(e),o=n<=0
;return`\n      <article class="debt-card${Ue(e)===E?" selected":""}">\n        <div class="debt-card-content">\n          <strong>${d(e.customerCode||"")} - ${d(e.customerName||"")}</strong>\n          <span>Công nợ: ${u(e.debtAmount||0)} · Chờ KT: ${u(pe(e))} · Có thể thu: ${u(n)}</span>\n          <span>${e.orderCount||0} đơn · Nợ cũ nhất: ${me(e.oldestDebtDate||"")}</span>\n        </div>\n        <button type="button" class="${o?"ghost-btn":"primary-btn"} small-btn debt-collect-action" data-debt-index="${t}" ${o?'disabled aria-disabled="true"':""}>\n          ${o?"Đang chờ KT":"Thu nợ"}\n        </button>\n      </article>`
}).join(""),J.querySelectorAll("[data-debt-index]:not([disabled])").forEach(e=>{e.addEventListener("click",()=>function(e={}){const t=Ue(e)
;!t||ge(e)<=0||(E!==t?x&&E&&E!==t&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.")||(I=window.scrollY||document.documentElement.scrollTop||0,
E=t,x=!1,We(e),je("collect")):je("collect"))}(t[Number(e.dataset.debtIndex)]))})}function Xe(e={}){const t=Array.isArray(e.orders)?e.orders:[]
;return t.length?t.filter(e=>Number(e.availableDebt??e.debt??0)>0):(Array.isArray(e.ledgers)?e.ledgers:[]).filter(e=>Number(e.debt||0)>0).map(e=>({
salesOrderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderDate:e.date||e.documentDate||"",debt:Number(e.debt||0),
availableDebt:Number(e.debt||0),pendingCollectedAmount:0}))}function We(e={}){if(!Z)return;if(!Ue(e))return Z.className="order-list empty",
Z.innerHTML='\n      <div class="debt-empty-state">\n        <strong>Chưa chọn khách hàng để thu nợ</strong>\n        <span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span>\n        <button id="chooseDebtCustomerBtn" type="button" class="ghost-btn">Chọn khách hàng</button>\n      </div>',
void document.getElementById("chooseDebtCustomerBtn")?.addEventListener("click",()=>je("customers"));const t=Array.isArray(e.ledgers)?e.ledgers:[],n=Xe(e);let r=0
;const i=t.length?`\n    <details class="debt-ledger-details">\n      <summary>Sổ công nợ (${t.length} dòng)</summary>\n      <div class="order-list">\n        ${t.map(e=>(r+=Number(e.debit||0)-Number(e.credit||0),
`\n            <div class="order-item">\n              <strong>${d(me(e.date))} · ${d(e.type||e.refType||"")}</strong>\n              <span>Đơn: ${d(e.salesOrderCode||e.refCode||"")}</span>\n              <span>Phát sinh: ${u(e.debit||0)} · Thanh toán: ${u(e.credit||0)} · Dư nợ: ${u(Math.max(0,r))}</span>\n            </div>`)).join("")}\n      </div>\n    </details>`:"",s=`\n    <div class="debt-selected-customer">\n      <strong>${d(e.customerCode||"")} - ${d(e.customerName||"")}</strong>\n      <span>Nợ: ${u(he(e))} · Chờ KT: ${u(pe(e))} · Có thể thu: ${u(ge(e))}</span>\n    </div>`,l=n.length?`\n    <form id="mobileDebtCollectionForm" class="order-list mobile-debt-collection-form">\n      <strong>Báo thu nợ chờ kế toán xác nhận</strong>\n      <span>Chọn đơn nợ, nhập số tiền đã thu. Công nợ chỉ giảm sau khi kế toán xác nhận.</span>\n      <div class="order-list debt-order-selection-list">\n        ${n.map((e,t)=>`\n          <label class="order-item debt-order-check-row">\n            <input type="checkbox" class="mobile-debt-order-check" data-index="${t}" checked />\n            <strong>${d(e.salesOrderCode||e.orderCode||"")}</strong>\n            <span>Ngày: ${me(e.orderDate||e.documentDate||"")} · Nợ: ${u(e.debt||0)} · Chờ KT: ${u(e.pendingCollectedAmount||0)} · Có thể thu: ${u(e.availableDebt??e.debt??0)}</span>\n          </label>`).join("")}\n      </div>\n      <label>Số tiền đã thu<input id="mobileDebtCollectionAmount" name="amount" inputmode="numeric" value="${Math.max(0,Math.round(ge(e)))}" /></label>\n      <label>Hình thức<select id="mobileDebtCollectionMethod" name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>\n      <label>Ghi chú<input id="mobileDebtCollectionNote" name="note" placeholder="VD: Khách trả một phần" /></label>\n      <div class="debt-submit-bar">\n        <button type="submit" class="primary-btn full-btn">Gửi phiếu thu chờ kế toán</button>\n      </div>\n      <p id="mobileDebtCollectionMessage" class="message"></p>\n    </form>`:'\n      <div class="order-item debt-no-available">\n        <strong>Không còn số tiền có thể thu</strong>\n        <span>Khách hàng đang có phiếu thu chờ kế toán hoặc công nợ đã được xử lý.</span>\n      </div>'
;Z.className="order-list",Z.innerHTML=s+l+i,Z.querySelectorAll(".mobile-debt-order-check").forEach(t=>{t.addEventListener("change",()=>function(e={}){
const t=Xe(e),n=[...document.querySelectorAll(".mobile-debt-order-check:checked")].reduce((e,n)=>{const o=t[Number(n.dataset.index)]
;return e+Math.max(0,Number(o?.availableDebt??o?.debt??0))},0),o=document.getElementById("mobileDebtCollectionAmount");o&&(o.value=String(n)),x=!0}(e))})
;const m=document.getElementById("mobileDebtCollectionForm");m&&(m.addEventListener("input",()=>{x=!0}),m.addEventListener("change",()=>{x=!0}),
m.addEventListener("submit",t=>async function(e,t={}){e.preventDefault();const n=e.target,r=document.getElementById("mobileDebtCollectionMessage"),i=function(e){
if("number"==typeof e)return Number.isFinite(e)?Math.max(0,Math.round(e)):0;const t=String(e||"").trim().toLowerCase();if(!t)return 0
;const n=t.endsWith("k")?1e3:t.endsWith("tr")?1e6:1,o=t.replace(/tr|k/g,"").replace(/[^0-9,.-]/g,"").replace(/[.,](?=\d{3}(\D|$))/g,"").replace(",","."),r=Number(o)
;return Number.isFinite(r)?Math.max(0,Math.round(r*n)):0}(n.elements.amount?.value||0);if(i<=0)return h(r,"Số tiền thu phải lớn hơn 0","error");const s=function(e={},t=0){
const n=Xe(e),o=[...document.querySelectorAll(".mobile-debt-order-check:checked")].map(e=>Number(e.dataset.index)).filter(e=>Number.isFinite(e));let r=Math.max(0,Number(t||0))
;const a=[];return o.forEach(e=>{const t=n[e],o=Math.max(0,Number(t?.availableDebt??t?.debt??0)),c=Math.min(o,r);t&&c>0&&(a.push({salesOrderId:t.salesOrderId||t.orderId||"",
salesOrderCode:t.salesOrderCode||t.orderCode||"",allocatedAmount:c}),r-=c)}),a}(t,i);if(!s.length)return h(r,"Cần chọn ít nhất một đơn nợ","error")
;if(s.reduce((e,t)=>e+Number(t.allocatedAmount||0),0)!==i)return h(r,"Tổng tiền phân bổ phải bằng số tiền thu","error");const d=n.querySelector('button[type="submit"]')
;p(d,!0,"Đang gửi...");const u={customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",amount:i,
paymentMethod:n.elements.paymentMethod?.value||"cash",note:n.elements.note?.value||"",allocations:s};try{
const e=(await o.submitDebtCollection(u)).message||"Đã ghi nhận thu nợ, chờ kế toán xác nhận";h(r,e,"success"),h(oe,e,"success"),x=!1,E="",A=!1,await Ge({force:!0}),
je("customers",{restoreScroll:!0})}catch(e){c(e)?(await a("debt_collection_submit",u),h(r,"Đã lưu phiếu thu offline, hệ thống sẽ tự đồng bộ khi có mạng","success"),
x=!1):h(r,e.message||"Không gửi được phiếu thu nợ","error")}finally{p(d,!1)}}(t,e)))}function ze(e=!0){f=[],C="",y=null,T.value="",H.value="",_.value="",U.value="",
K.textContent="Chưa chọn sản phẩm",K.classList.add("muted"),W.textContent="Đặt hàng",z.textContent="Xác nhận đơn",e&&(b=null,
R.textContent="Chưa chọn khách hàng. Hãy sang tab Khách hàng để chọn.",R.classList.add("muted"),h(X,"Đã làm mới đơn. Hãy chọn khách hàng ở tab 1.","success")),_e()}
function Ye(e=P){P=Array.isArray(e)?e:[]
;const t=P.reduce((e,t)=>e+Number(t.totalAmount||0),0),n=P.reduce((e,t)=>e+Number(t.paidAmount||0),0),o=P.reduce((e,t)=>e+Number(t.debtAmount||0),0)
;if(document.getElementById("todayRevenue").textContent=u(t),document.getElementById("todayOrderCount").textContent=String(P.length),
document.getElementById("todayPaid").textContent=u(n),document.getElementById("todayDebt").textContent=u(o),!P.length)return V.className="order-list empty",
void(V.textContent="Chưa có đơn")
;V.className="order-list",V.innerHTML=P.map(e=>`\n    <div class="order-item">\n      <strong>${d(e.code)} - ${d(e.customerName||"")}</strong>\n      <span>Ngày: ${le(e.date)} · Tổng: ${u(e.totalAmount)} · Đã thu: ${u(e.paidAmount)} · Còn nợ: ${u(e.debtAmount)}</span>\n      <span>Trạng thái: ${d(e.status||"")} / ${d(e.deliveryStatus||"")} · ${e.canEdit?"Có thể chỉnh sửa":d(e.editLockReason||"Không thể chỉnh sửa")}</span>\n      <div class="row-actions">\n        ${e.canEdit?`<button type="button" class="ghost-btn small-btn" data-edit-order="${d(e.id||e.code)}">Chỉnh sửa</button><button type="button" class="danger-btn small-btn" data-delete-order="${d(e.id||e.code)}" data-order-code="${d(e.code)}">Xóa</button>`:`<span class="muted">${d(e.editLockReason||"Không thể sửa/xóa trên app")}</span>`}\n      </div>\n    </div>\n  `).join("")
}async function Je(){try{const e=(await o.getMySalesOrders()).items||[],t=function(e=[]){const t=Array.isArray(e)?e:[];if("sales"!==String(g.role||""))return t;const n=ye(fe())
;return n?t.filter(e=>ye(function(e={}){return String(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH||e.salesStaff&&e.salesStaff.code||"").trim()
}(e))===n):[]}(e);Ye(t),e.length!==t.length&&console.warn("[MOBILE_SALES_OWNER_GUARD]",{currentSalesStaffCode:fe(),received:e.length,rendered:t.length})}catch(e){
V.className="order-list empty",V.textContent=e.message}}L.forEach(e=>e.addEventListener("click",()=>{ue(e.dataset.tab),"debtTab"===e.dataset.tab&&Ge({force:!0})})),
B.addEventListener("input",s(()=>Ee(B.value.trim()),250)),document.getElementById("reloadCustomersBtn")?.addEventListener("click",async()=>{await async function(e=!1){return N=[],
e&&window.CatalogCache&&window.CatalogCache.invalidate("customers"),N}(!0),await Ge({silent:!0}),Ee(B.value.trim())}),
document.getElementById("reloadOrdersBtn")?.addEventListener("click",Je),V?.addEventListener("click",async e=>{const t=e.target.closest("[data-edit-order]");if(t&&V.contains(t)){
p(t,!0,"Đang mở...");try{await async function(e){try{const t=(await o.getSalesOrder(e)).order
;if(!t.canEdit)return h(X,t.editLockReason||"Đơn hiện không thể chỉnh sửa trên app bán hàng.","error");C=t.id||t.code,b={id:t.customerId,code:t.customerCode,name:t.customerName,
phone:t.customerPhone,address:t.customerAddress,debtAmount:t.customerDebt||0,monthRevenue:t.customerMonthRevenue||0},
R.innerHTML=`<strong>${d(t.customerCode||"")} - ${d(t.customerName||"")}</strong><br /><span>${d(t.customerPhone||"")} · ${d(t.customerAddress||"")}</span>`,
R.classList.remove("muted"),f=(t.items||[]).map(e=>({productId:e.productId||e.productCode,productCode:e.productCode,productName:e.productName,unit:e.unit,
conversionRate:e.conversionRate,quantity:Number(e.quantity||0),originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),
unitPrice:Number(e.unitPrice||e.salePrice||e.price||0),salePrice:Number(e.salePrice||e.unitPrice||e.price||0),price:Number(e.price||e.unitPrice||e.salePrice||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),promotionAmount:Number(e.promotionAmount||e.discountAmount||e.totalDiscountAmount||0),
amount:Number(e.amount||Number(e.quantity||0)*Number(e.unitPrice||e.salePrice||e.price||0)),promotionCode:e.promotionCode||"",promotionName:e.promotionName||""})),
U.value=Number(t.paidAmount||0),W.textContent=`Sửa đơn ${t.code||""}`,z.textContent=`Lưu sửa đơn ${t.code||""}`,await Me({silent:!0}),_e(),
h(X,`Đang sửa đơn ${t.code||""}. Khi lưu, hệ thống sẽ tự điều chỉnh tồn kho và hạn mức bán App theo phần chênh lệch.`,"success"),ue("orderTab")}catch(e){h(X,e.message,"error")}
}(t.dataset.editOrder)}finally{p(t,!1)}return}const n=e.target.closest("[data-delete-order]");if(n&&V.contains(n)){p(n,!0,"Đang xóa...");try{await async function(e,t){
if(window.confirm(`Xóa đơn ${t||e}? Chỉ xóa được khi đơn chưa gộp đơn tổng.`))try{const t=await o.deleteSalesOrder(e);await Je(),h(X,t.message||"Đã xóa đơn","success")}catch(e){
h(X,e.message,"error")}}(n.dataset.deleteOrder,n.dataset.orderCode)}finally{p(n,!1)}}}),document.getElementById("reloadDebtsBtn")?.addEventListener("click",()=>{
x&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")||(x=!1,Ge({force:!0}))}),re?.addEventListener("click",()=>je("customers")),
ae?.addEventListener("click",()=>je("collect")),se?.addEventListener("input",()=>Ve(S)),de?.addEventListener("change",()=>Ve(S)),
document.getElementById("clearOrderBtn")?.addEventListener("click",ze),async function(){We(),je("customers",{restoreScroll:!1}),await Ge({silent:!0}),await Ee(""),Je(),
T&&q&&(window.SearchAutocomplete&&window.UnifiedProductSearch?(window.SearchAutocomplete.wire({input:T,box:q,getItems:()=>async function(e=""){const t=String(e||"").trim()
;if(t.length<2)return[];try{const e=He(await o.getProducts(t,{limit:50,group:qe()})).map(Te)
;return window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.sync&&window.UnifiedProductSearch.sync(e),e}catch(e){
console.warn("[mobile-sales] mobile product search fallback:",e.message||e)}
return window.UnifiedSearchEngine&&"function"==typeof window.UnifiedSearchEngine.searchProduct?He(await window.UnifiedSearchEngine.searchProduct(t,{limit:50,mode:"sales",
includeStock:1,group:qe()})).map(Te):window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.search?He(await window.UnifiedProductSearch.search(t,{limit:50,
mode:"sales",group:qe()})).map(Te):[]}(T.value.trim()),
label:e=>window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.label?window.UnifiedProductSearch.label(e,"sales"):e.label||[e.code,e.name].filter(Boolean).join(" - "),
select:Ke,emptyText:"Không tìm thấy sản phẩm phù hợp"}),T.addEventListener("input",Re),Q?.addEventListener("change",()=>{Re(),T&&(T.value=""),q&&(q.innerHTML="",
q.classList.remove("has-many"),q.hidden=!0,q.style.display="none")}),async function(e=!1){if(Q&&(!O||e)){O=!0;try{!function(e=[]){if(!Q)return
;const t=qe(),n=[...new Set((e||[]).map(Qe).filter(Boolean))].sort((e,t)=>e.localeCompare(t,"vi",{numeric:!0}))
;Q.innerHTML=['<option value="">Tất cả nhóm hàng</option>',...n.map(e=>`<option value="${Oe(e)}">${Oe(e)}</option>`)].join(""),t&&n.includes(t)&&(Q.value=t)
}(He(await o.getProducts("",{all:!0,limit:5e3,inStockOnly:0})).map(Te).map(e=>e.groupName||e.category))}catch(e){
console.warn("[mobile-sales] không tải được nhóm hàng sản phẩm:",e.message||e)}}}(),T.addEventListener("focus",()=>{T.dispatchEvent(new Event("input",{bubbles:!0}))}),
T.addEventListener("keydown",e=>{"Escape"===e.key&&(q.innerHTML="",q.classList.remove("has-many"))
})):q.innerHTML='<div class="suggestion-empty">Thiếu engine gợi ý sản phẩm dùng chung.</div>'),_e()}(),document.getElementById("addItemBtn").addEventListener("click",async()=>{
if(h(X,""),!b)return h(X,"Chưa chọn khách hàng ở tab 1","error");if(!y)return h(X,"Chưa chọn sản phẩm","error")
;const e=Number(H?.value||0),t=Number(_?.value||0),n=Ie(y),o=(e>0&&n>0?e*n:0)+t;if(o<=0)return h(X,"Số lượng phải lớn hơn 0","error")
;const r=Number(y.availableQty||0),a=Math.max(0,Number(y.maxOrderQty||0));if(r>0&&o>r)return h(X,"Số lượng vượt tồn thực tế","error")
;if(o>a)return h(X,a>0?`Sản phẩm chỉ còn được bán qua App ${De(a,n)}`:"Sản phẩm chưa có hạn mức bán qua App. Vui lòng cập nhật file tồn DMS buổi sáng.","error")
;const c=Number(y.salePrice||y.price||0),i=f.find(e=>e.productCode===y.code);if(i){const e=Number(i.quantity||0)+o;if(r>0&&e>r)return h(X,"Tổng số lượng vượt tồn thực tế","error")
;if(e>a)return h(X,`Tổng số lượng vượt hạn mức bán App. Còn tối đa ${De(a,n)}`,"error");i.quantity=e,i.originalPrice=Number(i.originalPrice||i.grossPrice||i.catalogSalePrice||c),
i.grossPrice=i.originalPrice,i.catalogSalePrice=i.originalPrice,Le(i,{conversionRate:i.conversionRate||y.conversionRate,unitsPerCase:i.unitsPerCase||y.unitsPerCase,
packingQty:i.packingQty||y.packingQty,packQty:y.packQty,pack:y.pack,packageQty:y.packageQty})}else f.push(Le({productId:y.id,productCode:y.code,productName:y.name,unit:y.unit,
quantity:o,originalPrice:c,grossPrice:c,catalogSalePrice:c,grossAmount:Math.round(o*c),unitPrice:c,salePrice:c,price:c,finalPrice:c,discountAmount:0,promotionAmount:0,
totalDiscountAmount:0,amount:Math.round(o*c),saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,maxOrderQty:a,
internalSaleQuota:y.internalSaleQuota||{}},y));y=null,T.value="",H.value="",_.value="",K.textContent="Chưa chọn sản phẩm",K.classList.add("muted"),await Me(),_e(),
h(X,"Đã thêm vào giỏ hàng và áp giá sau khuyến mại","success")}),z.addEventListener("click",async()=>{if(z.disabled)return;if(h(X,""),!b)return h(X,"Chưa chọn khách hàng","error")
;const e=Ae(b);if(!(e.code||e.customerCode||e.id||e.customerId))return h(X,"Thiếu mã khách hàng, vui lòng chọn lại khách ở tab Khách hàng","error")
;if(!f.length)return h(X,"Chưa có sản phẩm","error");p(z,!0);let t=null;try{const n=Number(U.value||0);await Me({silent:!0});const r={customer:e,
customerId:e.customerId||e.id||e.code||"",customerCode:e.customerCode||e.code||"",customerName:e.customerName||e.name||"",items:f.map(e=>({...e,
grossPrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),unitPrice:Number(e.unitPrice||e.finalPrice||e.salePrice||e.price||0),
salePrice:Number(e.salePrice||e.unitPrice||e.finalPrice||e.price||0),finalPrice:Number(e.finalPrice||e.unitPrice||e.salePrice||e.price||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),amount:Number(e.amount||0),saleMode:"promotion",saleMethod:"promotion",pricingMode:"promotion",
priceLocked:!0})),paidAmount:n,note:C?"Sửa từ app bán hàng mobile":"Tạo từ app bán hàng mobile"};t=r
;const a=C?await o.updateSalesOrder(C,r):await o.createSalesOrder(r),c=a.salesOrder?.code||"";window.CatalogCache&&window.CatalogCache.invalidate("products"),ze(!1),function(e={}){
if(!e||!e.id&&!e.code)return;const t=String(e.id||e.code),n={...e,canEdit:!1!==e.canEdit&&!e.masterOrderId&&!e.masterOrderCode&&"merged"!==(e.mergeStatus||"unmerged"),
editLockReason:e.editLockReason||""},o=P.findIndex(n=>String(n.id||n.code)===t||String(n.code||"")===String(e.code||""));o>=0?P[o]={...P[o],...n}:P.unshift(n),Ye(P)}(a.salesOrder),
h(X,`${a.message||"Đã lưu đơn"} ${c}`,"success"),await Ge(),ue("reportTab")}catch(e){!C&&t&&c(e)?(await a("sales_order_create",t),ze(!1),
h(X,"Đã lưu đơn offline, hệ thống sẽ tự đồng bộ khi có mạng","success")):h(X,e.message,"error")}finally{p(z,!1)}});
