/* GENERATED FILE — edit public/mobile/js/sales.source/part-01.jsfrag, public/mobile/js/sales.source/part-02.jsfrag, public/mobile/js/sales.source/part-03.jsfrag and run npm run build:source-bundles. */
const e=window.V45Common||{},t=e.todayValue,n=e.calculateCartonUnit;import{mobileApi as o,getUser as r}from"./api.js"
;import{bindLogout as a,debounce as c,escapeHtml as i,money as s,requireLogin as d,requireRole as u,setMessage as l}from"./ui.js";d(),u(["sales"]),
a(document.getElementById("logoutBtn"));const m=r();function h(e,t,n="Đang lưu..."){e&&(t?(e.dataset.originalText=e.dataset.originalText||e.textContent||"",e.disabled=!0,
e.textContent=n):(e.disabled=!1,e.dataset.originalText&&(e.textContent=e.dataset.originalText),delete e.dataset.originalText))}
document.getElementById("staffInfo").textContent=`${m.name||m.username||"Nhân viên"} · ${m.role||"sales"}`
;let g=null,p=null,b=[],y="",f=[],C=[],v=[],N=[],P=!1,S=!1,A=0,$="customers",w="",E=!1,k=0
;const x=document.querySelectorAll(".tab-btn"),I=document.querySelectorAll(".tab-panel"),L=document.getElementById("customerSearch"),D=document.getElementById("customerList"),B=document.getElementById("productSearch"),M=document.getElementById("productGroupFilter")
;let T=!1
;const Q=document.getElementById("productSuggestions"),O=document.getElementById("selectedCustomer"),q=document.getElementById("selectedProduct"),R=document.getElementById("caseQtyInput"),K=document.getElementById("looseQtyInput"),H=document.getElementById("paidAmountInput"),U=document.getElementById("cartList"),j=document.getElementById("cartCount"),G=document.getElementById("cartTotal"),_=document.getElementById("todayOrders"),F=document.getElementById("salesMessage"),V=document.getElementById("orderFormTitle"),X=document.getElementById("submitOrderBtn"),W=document.getElementById("cartTabBadge"),z=document.getElementById("debtList"),Y=document.getElementById("debtLedgerList"),J=document.getElementById("debtTotalAmount"),Z=document.getElementById("debtCustomerCount"),ee=document.getElementById("debtPendingAmount"),te=document.getElementById("debtTabMessage"),ne=document.getElementById("debtCustomersSubtab"),oe=document.getElementById("debtCollectSubtab"),re=document.getElementById("debtCustomersPanel"),ae=document.getElementById("debtCollectPanel"),ce=document.getElementById("debtCustomerSearch"),ie=document.getElementById("debtCustomerSort")
;function se(e){x.forEach(t=>t.classList.toggle("active",t.dataset.tab===e)),I.forEach(t=>t.classList.toggle("active",t.id===e)),window.scrollTo({top:0,behavior:"smooth"})}
function de(e){const n=String(e||t()).trim();let o=n.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
;if(o)return`${o[1]}-${String(o[2]).padStart(2,"0")}-${String(o[3]).padStart(2,"0")}`;if(o=n.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/),o){
let e=Number(o[1]),t=Number(o[2]),n=Number(o[3]);if(n<100&&(n+=n>=70?1900:2e3),t>=1&&t<=12&&e>=1&&e<=31)return`${n}-${String(t).padStart(2,"0")}-${String(e).padStart(2,"0")}`}
return n.slice(0,10)}function ue(e){const t=de(e),n=String(t||"").match(/^(\d{4})-(\d{2})-(\d{2})/);return n?`${n[3]}/${n[2]}`:t||"-"}function le(e={}){
return Number(e.debtAmount??e.currentDebt??e.debt??e.arDebt??0)}function me(e={}){return Number(e.availableDebtAmount??e.availableDebt??e.debtAmount??e.debt??0)}function he(e={}){
return Number(e.pendingCollectedAmount??e.pendingCollected??0)}function ge(e={}){return Number(e.monthRevenue??e.monthSales??e.salesAmount??0)}function pe(e=""){
return String(e||"").trim().toLowerCase()}function be(){return String(m.salesStaffCode||m.salesmanCode||m.nvbhCode||m.maNVBH||m.staffCode||m.code||"").trim()}function ye(e,t=""){
const n=String(e??"").trim();return n&&"undefined"!==n&&"null"!==n?n:t}function fe(e={}){return ye(e.code||e.customerCode||e.customerId||e.id||"")}function Ce(e={}){
return ye(e.name||e.customerName||e.fullName||"")}function ve(e={}){return ye(e.phone||e.customerPhone||e.mobile||e.tel||e.telephone||e.contactPhone||e.sdt||"","Chưa có SĐT")}
function Ne(e={}){return ye(e.address||e.customerAddress||e.fullAddress||e.diaChi||e.routeAddress||"","Chưa có địa chỉ")}function Pe(e={}){
const t=fe(e),n=Ce(e),o=ye(e.id||e._id||e.customerId||""),r=ye(e.phone||e.customerPhone||e.mobile||e.tel||e.telephone||e.contactPhone||e.sdt||""),a=ye(e.address||e.customerAddress||e.fullAddress||e.diaChi||e.routeAddress||"")
;return{...e,id:o,customerId:ye(e.customerId||o||t),code:t,customerCode:t,name:n,customerName:n,phone:r,customerPhone:r,address:a,customerAddress:a}}function Se(e={}){
return[e.id,e._id,e.customerId,e.code,e.customerCode,e.name,e.customerName].map(e=>String(e||"").trim()).filter(Boolean)}function Ae(e=N){const t=new Map
;return(Array.isArray(e)?e:[]).forEach(e=>{Se(e).forEach(n=>t.set(n,e))}),t}function $e(e={},t=Ae()){const n=Se(e).map(e=>t.get(e)).find(Boolean);return n?{...e,
debtAmount:Number(n.debtAmount||0),orderCount:Number(n.orderCount||0),oldestDebtDate:n.oldestDebtDate||e.oldestDebtDate||""}:{...e,debtAmount:le(e)}}async function we(e=""){try{
D.className="customer-list empty",D.textContent=e?"Đang tìm khách hàng...":"Nhập từ khóa để tìm khách hàng...",f=await async function(e=""){const t=await o.getCustomers(e,{
limit:300});return t.items||t.customers||[]}(e),Ee(f)}catch(e){D.className="customer-list empty",D.textContent=e.message}}function Ee(e){
const t=Ae(),n=(Array.isArray(e)?e:[]).map(e=>$e(e,t)).sort((e,t)=>le(t)-le(e));if(f=n,!n.length)return D.className="customer-list empty",
void(D.textContent="Không có khách hàng phù hợp");D.className="customer-list",D.innerHTML=n.map((e,t)=>{const n=fe(e),o=Ce(e),r=le(e),a=ve(e),c=Ne(e)
;return`\n      <button class="customer-card ${function(e={}){const t=le(e);return t>1e7?"debt-high":t>=3e6?"debt-mid":t>0?"debt-low":"debt-zero"
}(e)}" data-customer-index="${t}">\n        <strong>${i(n||"")}${n&&o?" - ":""}${i(o||"")}</strong>\n        <span class="customer-contact">SĐT: ${i(a)}</span>\n        <span class="customer-contact">ĐC: ${i(c)}</span>\n        <div class="customer-metrics">\n          <em class="metric-debt">Nợ: ${s(r)}</em>\n          <em>DS tháng: ${s(ge(e))}</em>\n        </div>\n      </button>\n    `
}).join(""),D.querySelectorAll("[data-customer-index]").forEach(e=>{e.addEventListener("click",()=>function(e){const t=Pe($e(e));g=t;const n=fe(t),o=Ce(t)
;O.innerHTML=`\n    <strong>${i(n||"")}${n&&o?" - ":""}${i(o||"")}</strong><br />\n    <span>SĐT: ${i(ve(t))}</span><br />\n    <span>ĐC: ${i(Ne(t))}</span><br />\n    <span>Nợ: ${s(le(t))} · DS tháng: ${s(ge(t))}</span>\n  `,
O.classList.remove("muted"),l(F,"Đã chọn khách hàng. Hãy thêm sản phẩm vào giỏ.","success"),se("orderTab"),setTimeout(()=>B.focus(),200)}(f[Number(e.dataset.customerIndex)]))})}
function ke(e={}){const t=Number(e.conversionRate??e.unitsPerCase??e.packingQty??e.packQty??e.pack??e.packageQty??1);return Number.isFinite(t)&&t>0?t:1}function xe(e={},t={}){
const n=ke(t);return e.conversionRate=n,e.packingQty=n,e.unitsPerCase=n,e}function Ie(e,t){return n(e,t).display}function Le(e={}){return{
productId:e.productId||e.id||e.productCode,productCode:e.productCode||e.code,productName:e.productName||e.name,quantity:Number(e.quantity||0),conversionRate:ke(e),
grossPrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
salePrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
price:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0)}}async function De(e={}){if(!b.length)return;const n=!!e.silent;try{
const e=await o.calculatePromotions({date:t(),saleDate:t(),items:b.map(Le)
}),n=Array.isArray(e?.result?.lines)?e.result.lines:[],r=new Map(n.map(e=>[String(e.productCode||e.code||"").trim(),e]));b=b.map(e=>{
const t=String(e.productCode||e.code||"").trim(),n=r.get(t)||{},o=Number(e.quantity||0),a=Number(n.catalogSalePrice||e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),c=Math.round(o*a),i=Number(n.directDiscountAmount||0),s=Number(n.groupDiscountAmount||0),d=Math.min(c,Math.max(0,i+s)),u=Math.max(0,c-d),l=o>0?Math.round(u/o):a,m=Array.isArray(n.promotionRows)?n.promotionRows:[],h=m[0]||n.directPromotionRule||{}
;return xe({...e,originalPrice:a,grossPrice:a,catalogSalePrice:a,grossAmount:c,directDiscountPercent:Number(n.directDiscountPercent||0),
groupDiscountPercent:Number(n.groupDiscountPercent||0),discountPercent:c>0?d/c*100:0,directDiscountAmount:i,groupDiscountAmount:s,discountAmount:d,promotionAmount:d,
totalDiscountAmount:d,finalPrice:l,unitPrice:l,salePrice:l,price:l,amount:u,netAmount:u,saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,
lockedPrice:!0,lockedPromotion:!0,promotionCalculated:!0,promotionCode:n.promotionCode||h.promotionCode||h.code||h.programCode||"",
promotionName:n.promotionName||h.description||h.programName||h.name||"",promotionRows:m},e)})}catch(e){n||l(F,e.message||"Không tính được khuyến mại cho giỏ hàng","error"),
b=b.map(e=>{const t=Number(e.quantity||0),n=Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0);return{...e,originalPrice:n,grossPrice:n,
catalogSalePrice:n,unitPrice:n,salePrice:n,price:n,discountAmount:0,promotionAmount:0,totalDiscountAmount:0,amount:Math.round(t*n),saleMethod:"promotion",saleMode:"promotion",
pricingMode:"promotion",priceLocked:!0}})}}function Be(e={}){
const t=Number(e._availableQty??e.availableQty??e.availableStock??e.stockQuantity??e.stock??0),n=e.code||e.productCode||e.sku||"",o=e.name||e.productName||"",r=String(e.groupName||e.productGroupName||e.productGroup||e.group||e.categoryName||e.category||"").trim(),a=e.internalSaleQuota&&"object"==typeof e.internalSaleQuota?e.internalSaleQuota:{},c=Math.max(0,Number(e.maxOrderQty??a.currentlyAllowedQty??a.remainingQty??0))
;return{...e,id:e.id||e._id||n,code:n,name:o,groupName:r,category:e.category||r,salePrice:Number(e.salePrice||e.price||0),availableQty:t,stockQuantity:t,conversionRate:ke(e),
packingQty:ke(e),unitsPerCase:ke(e),stockDisplay:Ie(t,ke(e)),maxOrderQty:c,internalSaleQuota:{...a,remainingQty:Math.max(0,Number(a.remainingQty||0)),currentlyAllowedQty:c}}}
function Me(e=""){return String(e||"").trim()}function Te(e=""){
return String(e||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Qe(){return Me(M?.value||"")}
function Oe(){p=null,B&&(B.dataset.id="",B.dataset.code="",B.dataset.name="",B.dataset.type=""),q.textContent="Chưa chọn sản phẩm",q.classList.add("muted")}function qe(e){
const t=Be(e);p=t,B.dataset.id=t.id||"",B.dataset.code=t.code||"",B.dataset.name=t.name||"",B.dataset.type="product",B.value=t.label||[t.code,t.name].filter(Boolean).join(" - ")
;const n=Number(t.finalPrice||t.unitPrice||t.salePrice||t.price||0),o=Number(t.originalPrice||t.grossPrice||t.catalogSalePrice||t.salePrice||t.price||0),r=o>n?`Giá KM<strong>${s(n)}</strong>`:`Giá bán<strong>${s(n)}</strong>`,a=o>n?`<span>Giá gốc<strong>${s(o)}</strong></span>`:""
;q.innerHTML=`\n    <div class="mobile-selected-product-name">${i(t.code||"")} - ${i(t.name||"")}</div>\n    <div class="mobile-selected-product-meta">\n      <span>Tồn thực tế<strong>${i(t.stockDisplay||Ie(t.availableQty,t.conversionRate))}</strong></span>\n      <span class="mobile-app-quota-meta">Được bán App<strong>${i(Ie(t.maxOrderQty,t.conversionRate))}</strong></span>\n      <span>${r}</span>\n      ${a}\n    </div>\n    <div class="mobile-selected-product-quota-note">Hạn mức theo file DMS: ${i(t.internalSaleQuota?.snapshotDate||"chưa cập nhật")}</div>\n  `,
q.classList.remove("muted"),Q.innerHTML="",Q.classList.remove("has-many"),Q.hidden=!0,Q.style.display="none",K.focus()}function Re(e){if(Array.isArray(e))return e
;if(!e||"object"!=typeof e)return[];const t=e.items||e.products||e.rows||e.data||e.result||[];return Array.isArray(t)?t:[]}function Ke(){
const e=b.reduce((e,t)=>e+Number(t.amount||0),0);if(j.textContent=`${b.length} dòng`,W&&(W.textContent=String(b.length)),G.textContent=s(e),
!b.length)return U.className="cart-list empty",void(U.textContent="Chưa có sản phẩm");U.className="cart-list",U.innerHTML=b.map((e,t)=>{
const n=Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),o=Number(e.unitPrice||e.salePrice||e.price||0),r=Number(e.discountAmount||e.promotionAmount||Math.max(0,(n-o)*Number(e.quantity||0))),a=r>0?`Giá gốc: ${s(n)} · KM: -${s(r)} · Giá bán: ${s(o)}`:`Giá bán: ${s(o)}`
;return`\n    <div class="cart-item">\n      <strong>${i(e.productCode)} - ${i(e.productName)}</strong>\n      <span>SL: ${function(e={}){const t=ke(e)
;return Ie(Number(e.quantity||e.qty||0),t)}(e)} · ${a} · Thành tiền: ${s(e.amount)}</span>\n      <button class="danger-btn small-btn" data-remove="${t}">Xóa</button>\n    </div>`
}).join(""),U.querySelectorAll("[data-remove]").forEach(e=>{e.addEventListener("click",async()=>{b.splice(Number(e.dataset.remove),1),await De({silent:!0}),Ke()})})}
function He(e={}){return String(e.customerId||e.customerCode||e.code||e.id||e._id||e.customerName||"").trim()}function Ue(e,t={}){const n="collect"===e?"collect":"customers";$=n,
ne?.classList.toggle("active","customers"===n),oe?.classList.toggle("active","collect"===n),ne?.setAttribute("aria-selected",String("customers"===n)),
oe?.setAttribute("aria-selected",String("collect"===n)),re?.classList.toggle("active","customers"===n),ae?.classList.toggle("active","collect"===n),
"collect"!==n?!1!==t.restoreScroll&&window.requestAnimationFrame(()=>window.scrollTo({top:k,behavior:"auto"})):!1!==t.scroll&&document.getElementById("debtTab")?.scrollIntoView({
block:"start",behavior:t.behavior||"smooth"})}async function je(e={}){const t=!!e.silent,n=!!e.force,r=document.getElementById("debtTab")?.classList.contains("active");if(S)return
;if(P&&!n&&N.length&&!t)return void Ge(N,{totalDebt:N.reduce((e,t)=>e+Number(t.debtAmount||0),0),pendingCollected:N.reduce((e,t)=>e+he(t),0),customerCount:N.length});const a=++A
;S=!0;try{!z||t&&!r||(z.className="order-list empty",z.textContent="Đang tải công nợ...");const e=await o.getSalesDebts({limit:100,includePaid:"0",includePendingCollections:"1",
collectorType:"sales"});if(a!==A)return;N=Array.isArray(e.items)?e.items:[],P=!0,Ge(N,e.summary||{}),Array.isArray(f)&&f.length&&Ee(f)}catch(e){if(a!==A)return;P=!1,
!z||t&&!r||(z.className="order-list empty error-text",z.textContent=e.message||"Không tải được công nợ"),!J||t&&!r||(J.textContent="0"),!Z||t&&!r||(Z.textContent="0"),
!ee||t&&!r||(ee.textContent="0")}finally{a===A&&(S=!1)}}function Ge(e=N,t={}){
const n=Number(t.totalDebt??e.reduce((e,t)=>e+Number(t.debtAmount||0),0)),o=Number(t.pendingCollected??e.reduce((e,t)=>e+he(t),0));if(J&&(J.textContent=s(n)),
Z&&(Z.textContent=String(t.customerCount??e.length)),ee&&(ee.textContent=s(o)),_e(e),w){const e=w&&N.find(e=>He(e)===w)||null;e?E||Ve(e):(w="",E=!1,Ve())}else Ve()}
function _e(e=N){if(!z)return;const t=Array.isArray(e)?e:[];if(!t.length)return z.className="order-list empty",void(z.textContent="Không có khách hàng còn nợ")
;const n=function(e=N){const t=String(ce?.value||"").trim().toLowerCase(),n=String(ie?.value||"debt_desc"),o=(Array.isArray(e)?e:[]).map((e,t)=>({item:e,originalIndex:t
})).filter(({item:e})=>!t||[e.customerCode,e.customerName,e.phone,e.customerPhone].some(e=>String(e||"").toLowerCase().includes(t)));return o.sort((e,t)=>{const o=e.item,r=t.item
;if("available_desc"===n)return me(r)-me(o);if("oldest_asc"===n){const e=de(o.oldestDebtDate||"9999-12-31"),t=de(r.oldestDebtDate||"9999-12-31");return e.localeCompare(t)}
return le(r)-le(o)}),o}(t);if(!n.length)return z.className="order-list empty",void(z.textContent="Không tìm thấy khách hàng phù hợp");z.className="order-list debt-customer-list",
z.innerHTML=n.map(({item:e,originalIndex:t})=>{const n=me(e),o=n<=0
;return`\n      <article class="debt-card${He(e)===w?" selected":""}">\n        <div class="debt-card-content">\n          <strong>${i(e.customerCode||"")} - ${i(e.customerName||"")}</strong>\n          <span>Công nợ: ${s(e.debtAmount||0)} · Chờ KT: ${s(he(e))} · Có thể thu: ${s(n)}</span>\n          <span>${e.orderCount||0} đơn · Nợ cũ nhất: ${ue(e.oldestDebtDate||"")}</span>\n        </div>\n        <button type="button" class="${o?"ghost-btn":"primary-btn"} small-btn debt-collect-action" data-debt-index="${t}" ${o?'disabled aria-disabled="true"':""}>\n          ${o?"Đang chờ KT":"Thu nợ"}\n        </button>\n      </article>`
}).join(""),z.querySelectorAll("[data-debt-index]:not([disabled])").forEach(e=>{e.addEventListener("click",()=>function(e={}){const t=He(e)
;!t||me(e)<=0||(w!==t?E&&w&&w!==t&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.")||(k=window.scrollY||document.documentElement.scrollTop||0,
w=t,E=!1,Ve(e),Ue("collect")):Ue("collect"))}(t[Number(e.dataset.debtIndex)]))})}function Fe(e={}){const t=Array.isArray(e.orders)?e.orders:[]
;return t.length?t.filter(e=>Number(e.availableDebt??e.debt??0)>0):(Array.isArray(e.ledgers)?e.ledgers:[]).filter(e=>Number(e.debt||0)>0).map(e=>({
salesOrderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderCode:e.salesOrderCode||e.refCode||e.orderCode||"",orderDate:e.date||e.documentDate||"",debt:Number(e.debt||0),
availableDebt:Number(e.debt||0),pendingCollectedAmount:0}))}function Ve(e={}){if(!Y)return;if(!He(e))return Y.className="order-list empty",
Y.innerHTML='\n      <div class="debt-empty-state">\n        <strong>Chưa chọn khách hàng để thu nợ</strong>\n        <span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span>\n        <button id="chooseDebtCustomerBtn" type="button" class="ghost-btn">Chọn khách hàng</button>\n      </div>',
void document.getElementById("chooseDebtCustomerBtn")?.addEventListener("click",()=>Ue("customers"));const t=Array.isArray(e.ledgers)?e.ledgers:[],n=Fe(e);let r=0
;const a=t.length?`\n    <details class="debt-ledger-details">\n      <summary>Sổ công nợ (${t.length} dòng)</summary>\n      <div class="order-list">\n        ${t.map(e=>(r+=Number(e.debit||0)-Number(e.credit||0),
`\n            <div class="order-item">\n              <strong>${i(ue(e.date))} · ${i(e.type||e.refType||"")}</strong>\n              <span>Đơn: ${i(e.salesOrderCode||e.refCode||"")}</span>\n              <span>Phát sinh: ${s(e.debit||0)} · Thanh toán: ${s(e.credit||0)} · Dư nợ: ${s(Math.max(0,r))}</span>\n            </div>`)).join("")}\n      </div>\n    </details>`:"",c=`\n    <div class="debt-selected-customer">\n      <strong>${i(e.customerCode||"")} - ${i(e.customerName||"")}</strong>\n      <span>Nợ: ${s(le(e))} · Chờ KT: ${s(he(e))} · Có thể thu: ${s(me(e))}</span>\n    </div>`,d=n.length?`\n    <form id="mobileDebtCollectionForm" class="order-list mobile-debt-collection-form">\n      <strong>Báo thu nợ chờ kế toán xác nhận</strong>\n      <span>Chọn đơn nợ, nhập số tiền đã thu. Công nợ chỉ giảm sau khi kế toán xác nhận.</span>\n      <div class="order-list debt-order-selection-list">\n        ${n.map((e,t)=>`\n          <label class="order-item debt-order-check-row">\n            <input type="checkbox" class="mobile-debt-order-check" data-index="${t}" checked />\n            <strong>${i(e.salesOrderCode||e.orderCode||"")}</strong>\n            <span>Ngày: ${ue(e.orderDate||e.documentDate||"")} · Nợ: ${s(e.debt||0)} · Chờ KT: ${s(e.pendingCollectedAmount||0)} · Có thể thu: ${s(e.availableDebt??e.debt??0)}</span>\n          </label>`).join("")}\n      </div>\n      <label>Số tiền đã thu<input id="mobileDebtCollectionAmount" name="amount" inputmode="numeric" value="${Math.max(0,Math.round(me(e)))}" /></label>\n      <label>Hình thức<select id="mobileDebtCollectionMethod" name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>\n      <label>Ghi chú<input id="mobileDebtCollectionNote" name="note" placeholder="VD: Khách trả một phần" /></label>\n      <div class="debt-submit-bar">\n        <button type="submit" class="primary-btn full-btn">Gửi phiếu thu chờ kế toán</button>\n      </div>\n      <p id="mobileDebtCollectionMessage" class="message"></p>\n    </form>`:'\n      <div class="order-item debt-no-available">\n        <strong>Không còn số tiền có thể thu</strong>\n        <span>Khách hàng đang có phiếu thu chờ kế toán hoặc công nợ đã được xử lý.</span>\n      </div>'
;Y.className="order-list",Y.innerHTML=c+d+a,Y.querySelectorAll(".mobile-debt-order-check").forEach(t=>{t.addEventListener("change",()=>function(e={}){
const t=Fe(e),n=[...document.querySelectorAll(".mobile-debt-order-check:checked")].reduce((e,n)=>{const o=t[Number(n.dataset.index)]
;return e+Math.max(0,Number(o?.availableDebt??o?.debt??0))},0),o=document.getElementById("mobileDebtCollectionAmount");o&&(o.value=String(n)),E=!0}(e))})
;const u=document.getElementById("mobileDebtCollectionForm");u&&(u.addEventListener("input",()=>{E=!0}),u.addEventListener("change",()=>{E=!0}),
u.addEventListener("submit",t=>async function(e,t={}){e.preventDefault();const n=e.target,r=document.getElementById("mobileDebtCollectionMessage"),a=function(e){
if("number"==typeof e)return Number.isFinite(e)?Math.max(0,Math.round(e)):0;const t=String(e||"").trim().toLowerCase();if(!t)return 0
;const n=t.endsWith("k")?1e3:t.endsWith("tr")?1e6:1,o=t.replace(/tr|k/g,"").replace(/[^0-9,.-]/g,"").replace(/[.,](?=\d{3}(\D|$))/g,"").replace(",","."),r=Number(o)
;return Number.isFinite(r)?Math.max(0,Math.round(r*n)):0}(n.elements.amount?.value||0);if(a<=0)return l(r,"Số tiền thu phải lớn hơn 0","error");const c=function(e={},t=0){
const n=Fe(e),o=[...document.querySelectorAll(".mobile-debt-order-check:checked")].map(e=>Number(e.dataset.index)).filter(e=>Number.isFinite(e));let r=Math.max(0,Number(t||0))
;const a=[];return o.forEach(e=>{const t=n[e],o=Math.max(0,Number(t?.availableDebt??t?.debt??0)),c=Math.min(o,r);t&&c>0&&(a.push({salesOrderId:t.salesOrderId||t.orderId||"",
salesOrderCode:t.salesOrderCode||t.orderCode||"",allocatedAmount:c}),r-=c)}),a}(t,a);if(!c.length)return l(r,"Cần chọn ít nhất một đơn nợ","error")
;if(c.reduce((e,t)=>e+Number(t.allocatedAmount||0),0)!==a)return l(r,"Tổng tiền phân bổ phải bằng số tiền thu","error");const i=n.querySelector('button[type="submit"]')
;h(i,!0,"Đang gửi...");try{const e=(await o.submitDebtCollection({customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",amount:a,
paymentMethod:n.elements.paymentMethod?.value||"cash",note:n.elements.note?.value||"",allocations:c})).message||"Đã ghi nhận thu nợ, chờ kế toán xác nhận";l(r,e,"success"),
l(te,e,"success"),E=!1,w="",P=!1,await je({force:!0}),Ue("customers",{restoreScroll:!0})}catch(e){l(r,e.message||"Không gửi được phiếu thu nợ","error")}finally{h(i,!1)}}(t,e)))}
function Xe(e=!0){b=[],y="",p=null,B.value="",R.value="",K.value="",H.value="",q.textContent="Chưa chọn sản phẩm",q.classList.add("muted"),V.textContent="Đặt hàng",
X.textContent="Xác nhận đơn",e&&(g=null,O.textContent="Chưa chọn khách hàng. Hãy sang tab Khách hàng để chọn.",O.classList.add("muted"),
l(F,"Đã làm mới đơn. Hãy chọn khách hàng ở tab 1.","success")),Ke()}function We(e=v){v=Array.isArray(e)?e:[]
;const t=v.reduce((e,t)=>e+Number(t.totalAmount||0),0),n=v.reduce((e,t)=>e+Number(t.paidAmount||0),0),o=v.reduce((e,t)=>e+Number(t.debtAmount||0),0)
;if(document.getElementById("todayRevenue").textContent=s(t),document.getElementById("todayOrderCount").textContent=String(v.length),
document.getElementById("todayPaid").textContent=s(n),document.getElementById("todayDebt").textContent=s(o),!v.length)return _.className="order-list empty",
void(_.textContent="Chưa có đơn")
;_.className="order-list",_.innerHTML=v.map(e=>`\n    <div class="order-item">\n      <strong>${i(e.code)} - ${i(e.customerName||"")}</strong>\n      <span>Ngày: ${de(e.date)} · Tổng: ${s(e.totalAmount)} · Đã thu: ${s(e.paidAmount)} · Còn nợ: ${s(e.debtAmount)}</span>\n      <span>Trạng thái: ${i(e.status||"")} / ${i(e.deliveryStatus||"")} · ${e.canEdit?"Có thể chỉnh sửa":i(e.editLockReason||"Không thể chỉnh sửa")}</span>\n      <div class="row-actions">\n        ${e.canEdit?`<button type="button" class="ghost-btn small-btn" data-edit-order="${i(e.id||e.code)}">Chỉnh sửa</button><button type="button" class="danger-btn small-btn" data-delete-order="${i(e.id||e.code)}" data-order-code="${i(e.code)}">Xóa</button>`:`<span class="muted">${i(e.editLockReason||"Không thể sửa/xóa trên app")}</span>`}\n      </div>\n    </div>\n  `).join("")
}async function ze(){try{const e=(await o.getMySalesOrders()).items||[],t=function(e=[]){const t=Array.isArray(e)?e:[];if("sales"!==String(m.role||""))return t;const n=pe(be())
;return n?t.filter(e=>pe(function(e={}){return String(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH||e.salesStaff&&e.salesStaff.code||"").trim()
}(e))===n):[]}(e);We(t),e.length!==t.length&&console.warn("[MOBILE_SALES_OWNER_GUARD]",{currentSalesStaffCode:be(),received:e.length,rendered:t.length})}catch(e){
_.className="order-list empty",_.textContent=e.message}}x.forEach(e=>e.addEventListener("click",()=>{se(e.dataset.tab),"debtTab"===e.dataset.tab&&je({force:!0})})),
L.addEventListener("input",c(()=>we(L.value.trim()),250)),document.getElementById("reloadCustomersBtn")?.addEventListener("click",async()=>{await async function(e=!1){return C=[],
e&&window.CatalogCache&&window.CatalogCache.invalidate("customers"),C}(!0),await je({silent:!0}),we(L.value.trim())}),
document.getElementById("reloadOrdersBtn")?.addEventListener("click",ze),_?.addEventListener("click",async e=>{const t=e.target.closest("[data-edit-order]");if(t&&_.contains(t)){
h(t,!0,"Đang mở...");try{await async function(e){try{const t=(await o.getSalesOrder(e)).order
;if(!t.canEdit)return l(F,t.editLockReason||"Đơn hiện không thể chỉnh sửa trên app bán hàng.","error");y=t.id||t.code,g={id:t.customerId,code:t.customerCode,name:t.customerName,
phone:t.customerPhone,address:t.customerAddress,debtAmount:t.customerDebt||0,monthRevenue:t.customerMonthRevenue||0},
O.innerHTML=`<strong>${i(t.customerCode||"")} - ${i(t.customerName||"")}</strong><br /><span>${i(t.customerPhone||"")} · ${i(t.customerAddress||"")}</span>`,
O.classList.remove("muted"),b=(t.items||[]).map(e=>({productId:e.productId||e.productCode,productCode:e.productCode,productName:e.productName,unit:e.unit,
conversionRate:e.conversionRate,quantity:Number(e.quantity||0),originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),
unitPrice:Number(e.unitPrice||e.salePrice||e.price||0),salePrice:Number(e.salePrice||e.unitPrice||e.price||0),price:Number(e.price||e.unitPrice||e.salePrice||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),promotionAmount:Number(e.promotionAmount||e.discountAmount||e.totalDiscountAmount||0),
amount:Number(e.amount||Number(e.quantity||0)*Number(e.unitPrice||e.salePrice||e.price||0)),promotionCode:e.promotionCode||"",promotionName:e.promotionName||""})),
H.value=Number(t.paidAmount||0),V.textContent=`Sửa đơn ${t.code||""}`,X.textContent=`Lưu sửa đơn ${t.code||""}`,await De({silent:!0}),Ke(),
l(F,`Đang sửa đơn ${t.code||""}. Khi lưu, hệ thống sẽ tự điều chỉnh tồn kho và hạn mức bán App theo phần chênh lệch.`,"success"),se("orderTab")}catch(e){l(F,e.message,"error")}
}(t.dataset.editOrder)}finally{h(t,!1)}return}const n=e.target.closest("[data-delete-order]");if(n&&_.contains(n)){h(n,!0,"Đang xóa...");try{await async function(e,t){
if(window.confirm(`Xóa đơn ${t||e}? Chỉ xóa được khi đơn chưa gộp đơn tổng.`))try{const t=await o.deleteSalesOrder(e);await ze(),l(F,t.message||"Đã xóa đơn","success")}catch(e){
l(F,e.message,"error")}}(n.dataset.deleteOrder,n.dataset.orderCode)}finally{h(n,!1)}}}),document.getElementById("reloadDebtsBtn")?.addEventListener("click",()=>{
E&&!window.confirm("Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.")||(E=!1,je({force:!0}))}),ne?.addEventListener("click",()=>Ue("customers")),
oe?.addEventListener("click",()=>Ue("collect")),ce?.addEventListener("input",()=>_e(N)),ie?.addEventListener("change",()=>_e(N)),
document.getElementById("clearOrderBtn")?.addEventListener("click",Xe),async function(){Ve(),Ue("customers",{restoreScroll:!1}),await je({silent:!0}),await we(""),ze(),
B&&Q&&(window.SearchAutocomplete&&window.UnifiedProductSearch?(window.SearchAutocomplete.wire({input:B,box:Q,getItems:()=>async function(e=""){const t=String(e||"").trim()
;if(t.length<2)return[];try{const e=Re(await o.getProducts(t,{limit:50,group:Qe()})).map(Be)
;return window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.sync&&window.UnifiedProductSearch.sync(e),e}catch(e){
console.warn("[mobile-sales] mobile product search fallback:",e.message||e)}
return window.UnifiedSearchEngine&&"function"==typeof window.UnifiedSearchEngine.searchProduct?Re(await window.UnifiedSearchEngine.searchProduct(t,{limit:50,mode:"sales",
includeStock:1,group:Qe()})).map(Be):window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.search?Re(await window.UnifiedProductSearch.search(t,{limit:50,
mode:"sales",group:Qe()})).map(Be):[]}(B.value.trim()),
label:e=>window.UnifiedProductSearch&&"function"==typeof window.UnifiedProductSearch.label?window.UnifiedProductSearch.label(e,"sales"):e.label||[e.code,e.name].filter(Boolean).join(" - "),
select:qe,emptyText:"Không tìm thấy sản phẩm phù hợp"}),B.addEventListener("input",Oe),M?.addEventListener("change",()=>{Oe(),B&&(B.value=""),Q&&(Q.innerHTML="",
Q.classList.remove("has-many"),Q.hidden=!0,Q.style.display="none")}),async function(e=!1){if(M&&(!T||e)){T=!0;try{!function(e=[]){if(!M)return
;const t=Qe(),n=[...new Set((e||[]).map(Me).filter(Boolean))].sort((e,t)=>e.localeCompare(t,"vi",{numeric:!0}))
;M.innerHTML=['<option value="">Tất cả nhóm hàng</option>',...n.map(e=>`<option value="${Te(e)}">${Te(e)}</option>`)].join(""),t&&n.includes(t)&&(M.value=t)
}(Re(await o.getProducts("",{all:!0,limit:5e3,inStockOnly:0})).map(Be).map(e=>e.groupName||e.category))}catch(e){
console.warn("[mobile-sales] không tải được nhóm hàng sản phẩm:",e.message||e)}}}(),B.addEventListener("focus",()=>{B.dispatchEvent(new Event("input",{bubbles:!0}))}),
B.addEventListener("keydown",e=>{"Escape"===e.key&&(Q.innerHTML="",Q.classList.remove("has-many"))
})):Q.innerHTML='<div class="suggestion-empty">Thiếu engine gợi ý sản phẩm dùng chung.</div>'),Ke()}(),document.getElementById("addItemBtn").addEventListener("click",async()=>{
if(l(F,""),!g)return l(F,"Chưa chọn khách hàng ở tab 1","error");if(!p)return l(F,"Chưa chọn sản phẩm","error")
;const e=Number(R?.value||0),t=Number(K?.value||0),n=ke(p),o=(e>0&&n>0?e*n:0)+t;if(o<=0)return l(F,"Số lượng phải lớn hơn 0","error")
;const r=Number(p.availableQty||0),a=Math.max(0,Number(p.maxOrderQty||0));if(r>0&&o>r)return l(F,"Số lượng vượt tồn thực tế","error")
;if(o>a)return l(F,a>0?`Sản phẩm chỉ còn được bán qua App ${Ie(a,n)}`:"Sản phẩm chưa có hạn mức bán qua App. Vui lòng cập nhật file tồn DMS buổi sáng.","error")
;const c=Number(p.salePrice||p.price||0),i=b.find(e=>e.productCode===p.code);if(i){const e=Number(i.quantity||0)+o;if(r>0&&e>r)return l(F,"Tổng số lượng vượt tồn thực tế","error")
;if(e>a)return l(F,`Tổng số lượng vượt hạn mức bán App. Còn tối đa ${Ie(a,n)}`,"error");i.quantity=e,i.originalPrice=Number(i.originalPrice||i.grossPrice||i.catalogSalePrice||c),
i.grossPrice=i.originalPrice,i.catalogSalePrice=i.originalPrice,xe(i,{conversionRate:i.conversionRate||p.conversionRate,unitsPerCase:i.unitsPerCase||p.unitsPerCase,
packingQty:i.packingQty||p.packingQty,packQty:p.packQty,pack:p.pack,packageQty:p.packageQty})}else b.push(xe({productId:p.id,productCode:p.code,productName:p.name,unit:p.unit,
quantity:o,originalPrice:c,grossPrice:c,catalogSalePrice:c,grossAmount:Math.round(o*c),unitPrice:c,salePrice:c,price:c,finalPrice:c,discountAmount:0,promotionAmount:0,
totalDiscountAmount:0,amount:Math.round(o*c),saleMethod:"promotion",saleMode:"promotion",pricingMode:"promotion",priceLocked:!0,maxOrderQty:a,
internalSaleQuota:p.internalSaleQuota||{}},p));p=null,B.value="",R.value="",K.value="",q.textContent="Chưa chọn sản phẩm",q.classList.add("muted"),await De(),Ke(),
l(F,"Đã thêm vào giỏ hàng và áp giá sau khuyến mại","success")}),X.addEventListener("click",async()=>{if(X.disabled)return;if(l(F,""),!g)return l(F,"Chưa chọn khách hàng","error")
;const e=Pe(g);if(!(e.code||e.customerCode||e.id||e.customerId))return l(F,"Thiếu mã khách hàng, vui lòng chọn lại khách ở tab Khách hàng","error")
;if(!b.length)return l(F,"Chưa có sản phẩm","error");h(X,!0);try{const t=Number(H.value||0);await De({silent:!0});const n={customer:e,customerId:e.customerId||e.id||e.code||"",
customerCode:e.customerCode||e.code||"",customerName:e.customerName||e.name||"",items:b.map(e=>({...e,
grossPrice:Number(e.grossPrice||e.originalPrice||e.catalogSalePrice||e.salePrice||e.price||0),
originalPrice:Number(e.originalPrice||e.grossPrice||e.catalogSalePrice||e.salePrice||e.price||0),unitPrice:Number(e.unitPrice||e.finalPrice||e.salePrice||e.price||0),
salePrice:Number(e.salePrice||e.unitPrice||e.finalPrice||e.price||0),finalPrice:Number(e.finalPrice||e.unitPrice||e.salePrice||e.price||0),
discountAmount:Number(e.discountAmount||e.promotionAmount||e.totalDiscountAmount||0),amount:Number(e.amount||0),saleMode:"promotion",saleMethod:"promotion",pricingMode:"promotion",
priceLocked:!0})),paidAmount:t,note:y?"Sửa từ app bán hàng mobile":"Tạo từ app bán hàng mobile"
},r=y?await o.updateSalesOrder(y,n):await o.createSalesOrder(n),a=r.salesOrder?.code||"";window.CatalogCache&&window.CatalogCache.invalidate("products"),Xe(!1),function(e={}){
if(!e||!e.id&&!e.code)return;const t=String(e.id||e.code),n={...e,canEdit:!1!==e.canEdit&&!e.masterOrderId&&!e.masterOrderCode&&"merged"!==(e.mergeStatus||"unmerged"),
editLockReason:e.editLockReason||""},o=v.findIndex(n=>String(n.id||n.code)===t||String(n.code||"")===String(e.code||""));o>=0?v[o]={...v[o],...n}:v.unshift(n),We(v)}(r.salesOrder),
l(F,`${r.message||"Đã lưu đơn"} ${a}`,"success"),await je(),se("reportTab")}catch(e){l(F,e.message,"error")}finally{h(X,!1)}});
