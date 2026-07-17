/* GENERATED FILE — edit src/engines/delivery.legacy.engine.source/part-01.jsfrag, src/engines/delivery.legacy.engine.source/part-02.jsfrag, src/engines/delivery.legacy.engine.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const{toNumber:e,makeId:t}=require("../utils/common.util"),r=require("../utils/deliveryFinance.util"),n=require("../utils/date.util"),{normalizeDebtAmount:a}=require("../constants/finance.constants"),{SALES_STAFF_CODE_FIELDS:o,SALES_STAFF_NAME_FIELDS:d,DELIVERY_STAFF_CODE_FIELDS:s,DELIVERY_STAFF_NAME_FIELDS:i,USER_ACCOUNT_SALES_STAFF_CODE_FIELDS:u,USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS:l,pickSalesStaffCode:c,pickSalesStaffName:f,pickDeliveryStaffCode:m,pickDeliveryStaffName:y,pickUserAccountSalesStaffCode:C,pickUserAccountDeliveryStaffCode:v}=require("../domain/staff/staffIdentity"),{assertEngineReturnMutationAllowed:h}=require("../services/returns/DeliveryReturnMutationGuard")
;function S(e){return String(null==e?"":e).trim()}function O(e){return S(e).toLowerCase()}function p(e=[]){return[...new Set(e.map(S).filter(Boolean))]}function g(){
return n.todayVN?n.todayVN():(new Date).toISOString().slice(0,10)}function N(e){const t=Number(e||0);return Number.isFinite(t)?t:0}function A(e){
return O(e).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g," ").trim()}function w(e){return A(e).replace(/[^a-z0-9]/g,"")}function I(e){
return["1","true","yes","y"].includes(O(e))}function b(e={}){const t=e&&"object"==typeof e.status?e.status:{},r=O(e.accountingStatus||t.accountingStatus)
;return Boolean(e.accountingNeedsReconfirm||e.needReAccounting||e.reAccountingRequired||e.adminAdjustmentOpen)||["reopened","needs_reconfirm","needs_repost"].includes(r)}
function D(e={}){if(!e||b(e))return!1;const t=e&&"object"==typeof e.status?e.status:{},r=O(e.accountingStatus||t.accountingStatus)
;return Boolean(e.accountingConfirmed||e.accountingLocked||e.editLocked)||["confirmed","locked","posted","done"].includes(r)}function R(e){
return S(e).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function $(e){return S(e).replace(/^RO[-_]?/i,"")}function M(e){const t=$(e);return t?`RO-${t}`:""}function _(e){const t=S(e)
;return p([t,$(t),M(t)])}function k(e){return p(_(e).flatMap(e=>[e,w(e),$(e),w($(e))]))}function E(t=[]){return Math.round((Array.isArray(t)?t:[]).reduce((t,r)=>{
const n=ce(r)||le(r),a=fe(r);return t+(n>0&&a>0?n*a:e(r.returnAmount??r.amount??0))},0))}function F(e=[]){return(Array.isArray(e)?e:[]).reduce((e,t)=>e+(ce(t)||le(t)),0)}
function Q(t={}){return E(Array.isArray(t.items)?t.items:[])>0||e(t.totalAmount??t.totalReturnAmount??t.amount??t.debtReduction)>0}function B(t={}){
const r=(Array.isArray(t.items)?t.items:[]).map(t=>{const r=ce(t)||le(t),n=fe(t),a=Math.round(r>0&&n>0?r*n:e(t.returnAmount??t.amount??0));return{...t,productCode:ie(t),code:ie(t),
productName:ue(t),name:ue(t),returnQty:r,qtyReturn:r,returnQuantity:r,returnedQty:r,quantity:r,qty:r,price:n,salePrice:n,unitPrice:n,returnAmount:a,amount:a}
}).filter(t=>t.productCode||t.productName||e(t.returnQty)>0),n=E(r)||Math.round(e(t.totalAmount??t.totalReturnAmount??t.amount??t.debtReduction)),a=F(r)||e(t.totalQuantity??t.quantity??t.qty),o=S(t.id||t.code||t._id),d=S(t.code||t.id||o)
;return{...t,id:o,code:d,salesOrderId:S(t.salesOrderId||t.orderId||t.sourceOrderId||t.deliveryOrderId),
salesOrderCode:S(t.salesOrderCode||t.orderCode||t.sourceOrderCode||t.deliveryOrderCode||$(d)),orderId:S(t.orderId||t.salesOrderId||t.sourceOrderId||t.deliveryOrderId),
orderCode:S(t.orderCode||t.salesOrderCode||t.sourceOrderCode||t.deliveryOrderCode||$(d)),items:r,returnItems:r,totalQuantity:a,totalAmount:n,totalReturnAmount:n,amount:n,
debtReduction:n}}function L(t=[]){return t.reduce((t,r)=>(t.returnQty+=e(r.returnQty??r.totalQuantity),t.amount+=e(r.amount??r.totalAmount??r.debtReduction),t),{returnQty:0,
amount:0})}function q(e={},t=[]){for(const r of t){const t=S(e[r]);if(t&&!["all","tat ca","tất cả","*"].includes(A(t)))return t}return""}function x(e={},t=[]){return t.flatMap(t=>{
const r=e[t];return Array.isArray(r)?r:[r]}).map(S).filter(Boolean)}function K(e={},t="",r=[]){const n=w(t),a=A(t);return!n&&!a||x(e,r).some(e=>{const t=w(e),r=A(e)
;return n&&t.includes(n)||a&&r.includes(a)})}
const T=["deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","shipperCode","shipperName","nvghCode","nvghName","staffDeliveryCode","staffDeliveryName"],P=["salesStaffCode","salesStaffName","salesmanCode","salesmanName","staffCode","staffName","saleCode","saleName","nvbhCode","nvbhName"]
;function V(e=[],t={}){
const r=q(t,["deliveryStaffCode","deliveryStaffName","deliveryStaff","deliveryStaffKeyword","deliveryCode","deliveryName","nvgh","nvghCode","nvghName"]),n=q(t,["salesStaffCode","salesStaffName","salesStaff","salesStaffKeyword","salesCode","salesName","nvbh","nvbhCode","nvbhName"])
;return e.filter(e=>!(r&&!K(e,r,T)||n&&!K(e,n,P)))}function U(e){const t=S(e);return t?p([t,t.toLowerCase(),t.toUpperCase()]):[]}function j(e){const t=S(e),r=w(t)
;return Boolean(r)&&r.length<=16&&!/\s/.test(t)}function z(e={},t=""){
const r=q(e,"delivery"===t?["deliveryStaffCode","deliveryCode","nvghCode","staffDeliveryCode"]:["salesStaffCode","salesmanCode","salesCode","nvbhCode"]),n=q(e,"delivery"===t?["deliveryStaffName","deliveryStaff","deliveryStaffKeyword","deliveryName","nvgh","nvghName"]:["salesStaffName","salesStaff","salesStaffKeyword","salesName","nvbh","nvbhName"]),a=r||(j(n)?n:"")
;if(a){const e=U(a);return{
$or:("delivery"===t?["deliveryStaffCode","deliveryCode","shipperCode","nvghCode","staffDeliveryCode"]:["salesStaffCode","salesmanCode","saleCode","nvbhCode"]).map(t=>({[t]:{$in:e}
}))}}if(n){const e=new RegExp(R(n),"i");return{
$or:("delivery"===t?["deliveryStaffName","deliveryName","shipperName","nvghName","staffDeliveryName"]:["salesStaffName","salesmanName","saleName","nvbhName"]).map(t=>({[t]:e}))}}
return null}function H(e=[],t={}){const r=z(t,"delivery"),n=z(t,"sales");r&&e.push(r),n&&e.push(n)}
const Y=["id","code","orderCode","salesOrderId","salesOrderCode","date","orderDate","deliveryDate","createdAt","updatedAt","version","customerId","customerCode","customerName","customerPhone","customerAddress","phone","address","routeName","salesStaffCode","salesStaffName","salesmanCode","salesmanName","nvbhCode","nvbhName","deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","shipperCode","shipperName","nvghCode","nvghName","status","deliveryStatus","accountingStatus","accountingConfirmed","totalAmount","paidAmount","debtAmount","cashCollected","cashAmount","bankCollected","bankAmount","rewardAmount","returnAmount","returnedAmount","items","note","masterOrderId","masterOrderCode","masterOrderNo","deliveryMasterId","deliveryMasterCode","mergeStatus"].join(" "),Z=["id","code","date","documentDate","returnDate","deliveryDate","createdAt","updatedAt","salesOrderId","salesOrderCode","orderId","orderCode","sourceOrderId","sourceOrderCode","deliveryOrderId","deliveryOrderCode","masterOrderId","masterOrderCode","masterReturnOrderId","masterReturnOrderCode","customerCode","customerName","deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","nvghCode","nvghName","salesStaffCode","salesStaffName","salesmanCode","salesmanName","nvbhCode","nvbhName","status","returnStatus","warehouseStatus","accountingStatus","returnMergeStatus","items","returnItems","totalQuantity","quantity","qty","totalAmount","totalReturnAmount","amount","debtReduction","note"].join(" ")
;function G(e={}){return q(e,["deliveryStaffCode","deliveryCode","nvghCode","staffDeliveryCode"])}function J(e={}){
return Boolean(G(e))&&!e.salesStaffCode&&!e.salesmanCode&&!e.salesCode&&!e.nvbhCode&&!e.salesman}function X(e){return{[e]:{$type:"string",$gt:""}}}function W(){return{
$or:[X("masterOrderId"),X("masterOrderCode")]}}function ee(){return{$or:[X("masterOrderNo"),X("deliveryMasterId"),X("deliveryMasterCode")]}}function te(e={}){
return e.legacy?ee():W()}function re(e={}){return S(e.id||e.orderId||e.salesOrderId||e._id)}function ne(e={}){
return S(e.code||e.orderCode||e.salesOrderCode||e.displayOrderCode||e.id||e._id)}function ae(e={}){const t=$(e.salesOrderCode||e.orderCode||e.code||e.displayOrderCode)
;if(t)return`code:${w(t)}`;const r=S(e.salesOrderId||e.orderId||e.id||e._id);return r?`id:${r}`:""}function oe(e){const t=O(e)
;return["deleted","removed","void","cancelled","canceled"].includes(t)?-1e3:["delivered","completed","done"].includes(t)?80:["assigned","shipping","pending_delivery"].includes(t)?40:0
}function de(t={}){const r=t&&"object"==typeof t.status?t.status:{},n=Date.parse(t.updatedAt||t.modifiedAt||t.createdAt||"")||0,a=Array.isArray(t.items)?t.items.length:0
;return oe(t.deletedAt?"deleted":"")+oe(t.deliveryStatus||r.deliveryStatus||t.status)+(t.accountingConfirmed?20:0)+(t.stockPosted?10:0)+Math.min(a,50)+Math.min(Math.max(e(t.totalAmount||t.amount||t.debtAmount),0),1e9)/1e9+n/1e14
}function se(e=[]){const t=new Map,r=[];for(const n of Array.isArray(e)?e:[]){if(!n)continue;const e=ae(n);if(!e){r.push(n);continue}const a=t.get(e);(!a||de(n)>=de(a))&&t.set(e,n)
}return r.concat(Array.from(t.values()))}function ie(e={}){return S(e.productCode||e.code||e.productId||e.sku||e.id||e._id)}function ue(e={}){
return S(e.productName||e.name||e.product||"")}function le(t={}){return e(t.deliveredQty??t.soldQty??t.quantitySold??t.orderQty??t.totalQty??t.qtySold??t.quantity??t.qty??0)}
function ce(t={}){return e(t.returnQty??t.qtyReturn??t.returnQuantity??t.returnedQty??t.quantityReturn??0)}function fe(t={}){
return e(t.price??t.salePrice??t.unitPrice??t.finalPrice??t.giaBan??0)}function me(e={}){const t=new Map;for(const r of Array.isArray(e.items)?e.items:[]){const e=ie(r)
;e&&!t.has(e)&&t.set(e,r)}return t}function ye(e={},t={}){const r=ie(e)||ie(t),n=ce(e),a=fe(e)||fe(t),o=ue(e)||ue(t),d=Math.max(0,Math.round(n*a));return{...t,...e,
productId:S(e.productId||t.productId||r),productCode:r,code:r,productName:o,name:o,returnQty:n,qtyReturn:n,returnQuantity:n,returnedQty:n,price:a,salePrice:a,unitPrice:a,
returnAmount:d,amount:d}}function Ce(){return{status:{$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}}}function ve(){
return require("../domain/lifecycle/ReturnLifecycleService")}function he(e,t){return t&&e&&"function"==typeof e.session?e.session(t):e}function Se(e={}){
return S(e.actorDeliveryStaffCode||e.actorStaffCode||e.authenticatedStaffCode||"")}function Oe(e={}){return Boolean(e&&e.enforceDeliveryOwnership)}function pe(e={}){
return S(e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.shipperCode||e.driverCode||e.staffDeliveryCode)}function ge(e={},t={}){if(!Oe(t))return!0;const r=Se(t),n=pe(e)
;return Boolean(r&&n&&w(n)===w(r))}function Ne(e=[],t={}){return Oe(t)?(Array.isArray(e)?e:[]).filter(e=>ge(e,t)):e}function Ae(e={},t={}){if(!Oe(t))return;const r=Se(t),n=pe(e)
;if(!r){const e=new Error("Không xác định được mã nhân viên giao hàng đang đăng nhập");throw e.status=403,e.code="DELIVERY_ACTOR_REQUIRED",e}if(!n||w(n)!==w(r)){
const e=new Error("Đơn giao hàng không thuộc nhân viên đang đăng nhập");throw e.status=403,e.code="DELIVERY_ORDER_FORBIDDEN",e}}function we(e){const t=S(e);if(!t)return null
;const r=[{id:t},{code:t},{orderCode:t},{salesOrderId:t},{salesOrderCode:t}];return/^[a-f\d]{24}$/i.test(t)&&r.push({_id:t}),{$or:r}}function Ie(e){const t=S(e);if(!t)return[]
;const r=[],n=new Set,a=e=>{const t=JSON.stringify(e);n.has(t)||(n.add(t),r.push(e))};return/^SO[0-9A-Z_-]+$/i.test(t)?(a({id:t}),a({code:t}),a({orderCode:t}),a({salesOrderId:t}),
a({salesOrderCode:t}),r):(/^[a-f\d]{24}$/i.test(t)&&a({_id:t}),a({id:t}),a({code:t}),a({orderCode:t}),a({salesOrderId:t}),a({salesOrderCode:t}),r)}function be(e,t={}){
const r=we(e),n=void 0!==t.version&&null!==t.version&&""!==t.version,a=n?Number(t.version):0;return{$and:[r,n?{version:a}:{$or:[{version:{$exists:!1}},{version:0},{version:null}]}]
}}function De(e){if(e)return e;const t=new Error("Dữ liệu đơn đã thay đổi bởi thao tác khác. Vui lòng tải lại trước khi lưu.");throw t.status=409,t.code="ORDER_VERSION_CONFLICT",t}
function Re(e={},t={}){
const r=p([re(t),t.salesOrderId,t.orderId,t.sourceOrderId,t.deliveryOrderId,ne(t),t.salesOrderCode,t.orderCode,t.sourceOrderCode,t.deliveryOrderCode,t.id,t.code]).flatMap(k),n=p([e.salesOrderId,e.orderId,e.sourceOrderId,e.deliveryOrderId,e.salesOrderCode,e.orderCode,e.sourceOrderCode,e.deliveryOrderCode,e.id,e.code]).flatMap(k),a=new Set(n)
;return r.some(e=>a.has(e))}function $e(e=[]){const t=new Map;for(const r of e||[]){const e=O(r.status)
;if(!["cancelled","canceled","void","deleted"].includes(e))for(const e of Array.isArray(r.items)?r.items:[]){const r=ie(e);if(!r)continue;const n=t.get(r)||{productCode:r,code:r,
productName:ue(e),name:ue(e),returnQty:0,qtyReturn:0,returnQuantity:0,returnedQty:0,price:fe(e),salePrice:fe(e),unitPrice:fe(e),returnAmount:0,amount:0
},a=ce(e)||le(e),o=fe(e)||n.price||0;n.productName=n.productName||ue(e),n.name=n.productName,n.returnQty+=a,n.qtyReturn=n.returnQty,n.returnQuantity=n.returnQty,
n.returnedQty=n.returnQty,n.price=o,n.salePrice=o,n.unitPrice=o,n.returnAmount=Math.round(n.returnQty*o),n.amount=n.returnAmount,t.set(r,n)}}return Array.from(t.values())}
function Me(t={},r={}){const n=S(t.status||t.returnStatus||"active"),a={returnOrderId:S(t.id||t._id),returnOrderCode:S(t.code||t.id),
salesOrderId:S(t.salesOrderId||t.orderId||r.salesOrderId||r.orderId),salesOrderCode:S(t.salesOrderCode||t.orderCode||r.salesOrderCode||r.orderCode),
orderId:S(t.orderId||t.salesOrderId||r.orderId||r.salesOrderId),orderCode:S(t.orderCode||t.salesOrderCode||r.orderCode||r.salesOrderCode),
customerCode:S(t.customerCode||r.customerCode),customerName:S(t.customerName||r.customerName),deliveryDate:S(t.deliveryDate||t.date||r.deliveryDate),status:n
},o=Array.isArray(t.items)?t.items:[];return o.length?o.map(t=>{const r=ce(t)||le(t),n=fe(t);return{...a,productCode:ie(t),productName:ue(t),returnQty:r,price:n,
amount:Math.round(r>0&&n>0?r*n:e(t.returnAmount??t.amount??0))}}):[{...a,productCode:"",productName:"",returnQty:0,price:0,
amount:e(t.totalAmount||t.amount||t.totalReturnAmount||t.debtReduction)}]}function _e(t={},n=[]){
const o=$e(n),d=o.reduce((t,r)=>t+e(r.returnAmount||r.amount),0),s=r.buildCanonicalDeliveryOrder(t,{returnItems:o,returnAmountOverride:d}),i=s.amounts||{};return{...s,
orderId:re(t),orderCode:ne(t),salesOrderId:S(t.salesOrderId||t.id||t._id),salesOrderCode:S(t.salesOrderCode||t.orderCode||t.code||ne(t)),customerCode:S(t.customerCode),
customerName:S(t.customerName),deliveryDate:S(t.deliveryDate||t.date||t.documentDate),salesStaffCode:S(t.salesStaffCode||t.salesmanCode),
salesStaffName:S(t.salesStaffName||t.salesmanName),deliveryStaffCode:S(t.deliveryStaffCode),deliveryStaffName:S(t.deliveryStaffName),items:s.items,returnItems:o,returnOrders:n,
amounts:{receivable:e(i.receivable??i.totalReceivable),cash:e(i.cash??i.cashAmount),bank:e(i.bank??i.bankAmount),reward:e(i.reward??i.rewardAmount),returnAmount:e(i.returnAmount),
processed:e(i.processed),debt:a(i.debt??i.debtAmount)},reconciliation:ke(i),status:{deliveryStatus:S(t.deliveryStatus||t.status||"pending"),
paymentStatus:a(i.debt??i.debtAmount)<=0?"paid":(i.processed||0)>0?"partial":"unpaid",returnStatus:(i.returnAmount||0)>0?"has_return":"none",
accountingStatus:S(t.accountingStatus||"")}}}function ke(t={}){
const r=e(t.receivable??t.totalReceivable),n=e(t.cash??t.cashAmount),o=e(t.bank??t.bankAmount),d=e(t.reward??t.rewardAmount),s=e(t.returnAmount),i=a(t.debt??t.debtAmount),u=n+o+d+s+i,l=Math.round(r-u)
;return{receivable:r,cash:n,bank:o,reward:d,returnAmount:s,debt:i,processed:u,difference:l,balanced:Math.abs(l)<=1e3,
message:Math.abs(l)<=1e3?"Đối soát OK":`Chênh lệch ${l.toLocaleString("vi-VN")}`}}function Ee(t=[]){return t.reduce((t,r)=>{const n=r.amounts||{}
;return t.receivable+=e(n.receivable),t.cash+=e(n.cash),t.bank+=e(n.bank),t.reward+=e(n.reward),t.returnAmount+=e(n.returnAmount),t.debt+=a(n.debt),t},{receivable:0,cash:0,bank:0,
reward:0,returnAmount:0,debt:0})}
const Fe=["delivered","success","done","completed","accounting_confirmed"],Qe=["all","tat ca","tất cả","*"],Be=Fe.concat(["da giao","đã giao"]),Le=["open","processing","pending","assigned","not_delivered","not-delivered","chua giao","chưa giao"]
;function qe(e={}){return O((e.status&&"object"==typeof e.status?e.status:{}).deliveryStatus||e.deliveryStatus||e.status||"pending")}function xe(e={}){return Fe.includes(qe(e))}
function Ke(e={},t=!1){const r=t?["statusFilter","deliveryStatusFilter","orderStatusFilter","status","deliveryStatus"]:["statusFilter","deliveryStatusFilter","orderStatusFilter"]
;for(const t of r){const r=S(e[t]);if(r)return O(r)}return""}function Te(e={}){const t=Ke(e,!0)
;return I(e.includeCompleted)||I(e.showCompleted)||I(e.includeDelivered)||Qe.includes(t)||Be.includes(t)}function Pe(e={}){return!Te(e)}function Ve(e){return{$or:[{[e]:{$exists:!1}
},{[e]:null},{[e]:""},{[e]:{$nin:Fe}}]}}function Ue(t=[],r={}){const n=Ke(r)||Ke(r,!0);let o=t;return Pe(r)&&(o=o.filter(e=>!xe(e))),
!n||Qe.includes(n)?o:Be.includes(n)?t.filter(xe):Le.includes(n)?t.filter(e=>!xe(e)):["return","returns","has_return","tra hang","trả hàng"].includes(n)?t.filter(t=>e(t.amounts&&t.amounts.returnAmount)>0||e(t.returnAmount||t.returnTotal||t.totalReturnAmount)>0):["debt","cong no","công nợ"].includes(n)?t.filter(e=>a((e.amounts&&e.amounts.debt)??e.debtAmount??e.debt)>0):t
}class je{constructor(e={}){this.SalesOrder=e.SalesOrder,this.MasterOrder=e.MasterOrder,this.ReturnOrder=e.ReturnOrder,this.StockTransaction=e.StockTransaction,
this.ArLedger=e.ArLedger,this.User=e.User}staffCodeOf(e={},t="sales"){return S("delivery"===t?m(e)||v(e):c(e)||C(e))}staffNameOf(e={},t="sales"){return S("delivery"===t?y(e):f(e))}
staffRoleOk(e={},t=""){const r=A([e.role,e.type,e.position,e.department,e.roleLabel].filter(Boolean).join(" "))
;return!!("delivery"===t?Boolean(e.isDelivery||e.isDeliveryStaff||e.deliveryStaff):Boolean(e.isSalesman||e.isSalesStaff||e.salesStaff))||("delivery"===t?["delivery","shipper","nvgh","giao hang","giaohang"].some(e=>r.includes(A(e))):["sales","sale","nvbh","ban hang","banhang","salesman"].some(e=>r.includes(A(e))))
}orderStaffCode(e={},t=""){
return S("delivery"===t?e.deliveryStaffCode||e.shipperCode||e.driverCode||e.staffDeliveryCode:e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.saleCode||e.sellerCode)}
orderStaffName(e={},t=""){
return S("delivery"===t?e.deliveryStaffName||e.shipperName||e.driverName||e.staffDeliveryName:e.salesStaffName||e.salesmanName||e.nvbhName||e.saleName||e.sellerName)}
async buildStaffSystemIndex(e=[]){const t={byCode:new Map,byName:new Map};if(!this.User||!e.length)return t
;const r=p(e.flatMap(e=>[this.orderStaffCode(e,"sales"),this.orderStaffName(e,"sales"),this.orderStaffCode(e,"delivery"),this.orderStaffName(e,"delivery")])).filter(Boolean)
;if(!r.length)return t;const n=r.map(e=>new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,"i")),a=await this.User.find({isActive:{$ne:!1},$or:[...u.map(e=>({[e]:{$in:n}
})),...l.map(e=>({[e]:{$in:n}})),...d.map(e=>({[e]:{$in:n}})),...i.map(e=>({[e]:{$in:n}}))]
}).select("id code staffCode employeeCode salesStaffCode salesStaffName salesmanCode salesmanName deliveryStaffCode deliveryStaffName shipperCode shipperName maNhanVien name fullName role type position department roleLabel isSalesman isSalesStaff salesStaff isDelivery isDeliveryStaff deliveryStaff isActive").lean().catch(()=>[]),o=new Map,s=new Map
;for(const e of a||[]){
const t=this.staffCodeOf(e,"sales"),r=this.staffCodeOf(e,"delivery"),n=this.staffNameOf(e,"sales"),a=this.staffNameOf(e,"delivery"),d=p([t,r]).map(w).filter(Boolean),i=p([n,a]).map(A).filter(Boolean)
;for(const t of d)o.set(t,e);for(const t of i)s.set(t,e)}return{byCode:o,byName:s}}verifyAssignedStaff(e={},t={byCode:new Map,byName:new Map},r=""){
const n=this.orderStaffCode(e,r),a=this.orderStaffName(e,r),o="delivery"===r?"NVGH":"NVBH";let d=n?t.byCode.get(w(n)):null;!d&&a&&(d=t.byName.get(A(a)))
;const s=d?this.staffCodeOf(d,r):"",i=d?this.staffNameOf(d,r):"",u=Boolean(d&&n&&w(s)===w(n)),l=Boolean(d&&a&&A(i)===A(a)),c=Boolean(d&&this.staffRoleOk(d,r))
;let f=`${o} đúng mã hệ thống`
;return n||a?d?c?!u&&n&&(f=`${o} không khớp mã hệ thống`):f=`${o} có mã hệ thống nhưng sai vai trò`:f=`${o} không tồn tại trong mục Tài khoản/Hệ thống`:f=`Thiếu ${o}`,{type:r,
label:o,ok:Boolean(d&&c&&(u||!n&&l)),exists:Boolean(d),roleOk:c,codeMatches:u,nameMatches:l,assignedCode:n,assignedName:a,systemCode:s,systemName:i,message:f}}
async enrichStaffAssignment(e=[]){const t=await this.buildStaffSystemIndex(e);return e.map(e=>{
const r=this.verifyAssignedStaff(e,t,"sales"),n=this.verifyAssignedStaff(e,t,"delivery"),a=r.ok&&n.ok;return{...e,staffAssignment:{ok:a,sales:r,delivery:n},
staffAssignmentStatus:a?"valid":"warning",staffAssignmentMessage:a?"Đơn đã gán đúng NVBH/NVGH theo mã hệ thống":[r,n].filter(e=>!e.ok).map(e=>e.message).join("; ")}})}
async execSalesOrderFind(e={},{select:t=Y,sort:r={},limit:n=1e3}={}){let a=this.SalesOrder.find(e);return a&&"function"==typeof a.select&&(a=a.select(t)),
a&&"function"==typeof a.sort&&(a=a.sort(r)),a&&"function"==typeof a.limit&&(a=a.limit(n)),a&&"function"==typeof a.lean?a.lean():a}async resolveSalesOrderByKnownCode(e,t={}){
const r=Ie(e);for(const e of r){let r=this.SalesOrder.findOne(e);r=he(r,t.session),r&&"function"==typeof r.select&&(r=r.select(Y))
;const n=r&&"function"==typeof r.lean?await r.lean():await r;if(n)return n}const n=we(e);if(!n)return null;let a=this.SalesOrder.findOne(n);return a=he(a,t.session),
a&&"function"==typeof a.select&&(a=a.select(Y)),a&&"function"==typeof a.lean?a.lean():a}async findOrders(e={}){
const t=S(e.date||e.deliveryDate||g()),r=A(e.status||e.deliveryStatus),n=A(e.q||e.keyword);let a=[]
;const o=Math.min(1e3,Math.max(1,Number(e.limit||1e3))),d=async(a,{fast:d=!1}={})=>{const s=(()=>{const n={};return t&&(n.deliveryDate=t),
r&&!["all","tat ca","tất cả","*"].includes(r)&&(n.deliveryStatus=S(e.status||e.deliveryStatus)),I(e.includeInactive)||I(e.showInactive)||(n.status={
$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}),n})(),i=[a];if(d){const t=G(e);i.push({deliveryStaffCode:{$in:U(t)}})}else H(i,e)
;return Pe(e)&&(i.push(Ve("deliveryStatus")),i.push(Ve("status"))),((t=[])=>{if(!n)return;const r=new RegExp(R(e.q||e.keyword),"i");t.push({$or:[{code:r},{orderCode:r},{
salesOrderCode:r},{customerCode:r},{customerName:r}]})})(i),s.$and=i,this.execSalesOrderFind(s,{sort:d?{deliveryDate:-1,deliveryStaffCode:1,customerName:1,code:1}:{
deliveryStaffCode:1,customerName:1,code:1},limit:d?Math.min(300,o):o})};if(J(e)&&(a=await d(te(),{fast:!0}),a.length||(a=await d(te({legacy:!0}),{fast:!0}))),
a.length||(a=await d(te()),a.length||(a=await d(te({legacy:!0})))),!a.length&&t&&this.MasterOrder){const r=p(V(await this.MasterOrder.find({deliveryDate:t
}).select("id code deliveryDate deliveryStaffCode deliveryStaffName childOrderIds children").lean(),e).flatMap(e=>Array.isArray(e.childOrderIds)?e.childOrderIds:[]))
;r.length&&(a=await this.execSalesOrderFind({$or:[{id:{$in:r}},{code:{$in:r}}]},{limit:1e3}))}return a=V(a,e),
n&&(a=a.filter(e=>[e.code,e.orderCode,e.salesOrderCode,e.customerCode,e.customerName,e.salesStaffCode,e.salesStaffName,e.staffCode,e.staffName,e.deliveryStaffCode,e.deliveryStaffName].some(e=>A(e).includes(n)))),
se(a)}async findReturnOrdersFor(e=[],t={}){
const r=p(e.flatMap(e=>[re(e),e.id,e._id,e.salesOrderId,e.orderId,e.sourceOrderId,e.deliveryOrderId])),n=p(e.flatMap(e=>[ne(e),e.code,e.orderCode,e.salesOrderCode,e.sourceOrderCode,e.deliveryOrderCode])),a=p(r.flatMap(_)),o=p(n.flatMap(_)),d=[]
;if(a.length&&d.push({salesOrderId:{$in:a}},{orderId:{$in:a}},{sourceOrderId:{$in:a}},{deliveryOrderId:{$in:a}},{id:{$in:a}}),o.length&&d.push({salesOrderCode:{$in:o}},{orderCode:{
$in:o}},{sourceOrderCode:{$in:o}},{deliveryOrderCode:{$in:o}},{code:{$in:o}},{id:{$in:o}}),!d.length)return[];let s=this.ReturnOrder.find({...Ce(),$or:d});return s=he(s,t.session),
s&&"function"==typeof s.select&&(s=s.select(Z)),(await s.lean()).map(B).filter(Q)}async getCanonicalOrderByKey(e,t={}){const r=await this.resolveSalesOrderByKnownCode(e,t)
;if(!r)return null;const n=await this.findReturnOrdersFor([r],t);return _e(r,n.filter(e=>Re(e,r)))}async listOrders(e={}){
const t=se(await this.findOrders(e)),r=await this.findReturnOrdersFor(t);let n=t.map(e=>_e(e,r.filter(t=>Re(t,e))));return n=se(Ue(n,e)),
(I(e.checkStaffAssignment)||I(e.checkStaff)||I(e.staffCheck))&&(n=await this.enrichStaffAssignment(n)),{rows:n,summary:Ee(n),reconciliation:this.reconcileRows(n)}}
normalizeReturnItems(e=[],t={}){const r=me(t);return(Array.isArray(e)?e:[]).map(e=>{const t=ie(e);return ye(e,r.get(t)||{})}).filter(e=>e.productCode&&e.returnQty>0)}
async saveReturn(t={}){const r=arguments[1]||{},n=S(t.salesOrderId||t.orderId||t.salesOrderCode||t.orderCode),a=await this.resolveSalesOrderByKnownCode(n,r);if(!a){
const e=new Error("Không tìm thấy đơn giao hàng");throw e.status=404,e}Ae(a,t),await h(this,a,t,r,Re)
;const o=this.normalizeReturnItems(t.items,a),d=o.reduce((t,r)=>t+e(r.returnAmount||r.amount),0),s=`RO-${ne(a).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,i={id:s,
code:s,salesOrderId:re(a),salesOrderCode:ne(a),orderId:re(a),orderCode:ne(a),customerId:S(a.customerId),customerCode:S(a.customerCode),customerName:S(a.customerName),
deliveryDate:S(a.deliveryDate||t.deliveryDate||g()),date:S(t.date||a.deliveryDate||g()),documentDate:S(t.documentDate||t.date||a.deliveryDate||g()),
deliveryStaffCode:S(a.deliveryStaffCode||t.deliveryStaffCode),deliveryStaffName:S(a.deliveryStaffName||t.deliveryStaffName),
salesStaffCode:S(a.salesStaffCode||a.salesmanCode||t.salesStaffCode),salesStaffName:S(a.salesStaffName||a.salesmanName||t.salesStaffName),
salesmanCode:S(a.salesmanCode||a.salesStaffCode||t.salesmanCode),salesmanName:S(a.salesmanName||a.salesStaffName||t.salesmanName),
staffCode:S(a.deliveryStaffCode||t.deliveryStaffCode),staffName:S(a.deliveryStaffName||t.deliveryStaffName),source:"canonical_delivery_engine",
refType:o.length?"canonicalDeliveryReturn":"canonicalDeliveryReturnClear",returnType:S(t.returnType||"partial")||"partial",returnStatus:o.length?"waiting_receive":"cancelled",
status:o.length?"waiting_receive":"cancelled",accountingConfirmed:!1,accountingStatus:o.length?"pending":"cancelled",items:o,totalQuantity:o.reduce((t,r)=>t+e(r.returnQty),0),
totalAmount:d,totalReturnAmount:d,amount:d,debtReduction:d,note:S(t.note)||(o.length?"Cập nhật hàng trả từ DeliveryEngine":"Xóa hàng trả về 0 từ DeliveryEngine"),
updatedAt:(new Date).toISOString(),clearedAt:o.length?"":(new Date).toISOString()},u=r.session?await ve().createPendingReturn(i,r):await ve().createPendingReturn(i);if(u&&u.error){
const e=new Error(u.error);throw e.status=u.status||400,e}const l=u&&u.returnOrder||u,c=await this.getCanonicalOrderByKey(re(a),r),f=Me(l,c||a);return{order:c,returnOrder:l,
returns:f,returnOrders:f,rows:f,message:o.length?"Đã lưu hàng trả":"Đã xóa hàng trả về 0"}}async savePayment(t={},r={}){
const n=S(t.salesOrderId||t.orderId||t.salesOrderCode||t.orderCode),a=await this.getCanonicalOrderByKey(n,r);if(!a){const e=new Error("Không tìm thấy đơn giao hàng")
;throw e.status=404,e}Ae(a,t);const o=D(a),d=b(a);if(o&&!d){const e=new Error("Đơn đã xác nhận kế toán, cần mở khóa admin trước khi sửa tiền");throw e.status=423,e}
const s=Math.max(0,N(t.cashAmount??t.cashCollected)),i=Math.max(0,N(t.bankAmount??t.bankCollected??t.transferAmount)),u=Math.max(0,N(t.rewardAmount??t.bonusAmount)),l=e(a.amounts&&a.amounts.returnAmount),c=e(a.amounts&&a.amounts.receivable),f=s+i+u+l
;if(f-c>1e3){const e=new Error(`Tổng thu/trả (${f.toLocaleString("vi-VN")}) vượt phải thu (${c.toLocaleString("vi-VN")})`);throw e.status=400,e}const m={type:"delivery_collection",
source:"DeliveryEngine",date:S(t.date||g()),cashAmount:s,bankAmount:i,rewardAmount:u,returnAmount:l,amount:s+i+u,salesOrderId:a.salesOrderId,salesOrderCode:a.salesOrderCode,
orderId:a.orderId,orderCode:a.orderCode,deliveryStaffCode:S(t.deliveryStaffCode||a.deliveryStaffCode),deliveryStaffName:S(t.deliveryStaffName||a.deliveryStaffName),
createdAt:(new Date).toISOString()},y={deliveryPayment:m,paymentAllocations:[m],deliveryPaymentSource:"DeliveryEngine",cashCollected:s,cashAmount:s,bankCollected:i,bankAmount:i,
transferAmount:i,rewardAmount:u,displayRewardAmount:u,paidAmount:s+i,collectedAmount:s+i,...d?{accountingConfirmed:!1,accountingLocked:!1,editLocked:!1,accountingNeedsReconfirm:!0,
needReAccounting:!0,reAccountingRequired:!0,adminAdjustmentOpen:!0,accountingStatus:"needs_reconfirm",arStatus:"needs_reconfirm",lifecycleStatus:"needs_reconfirm",
financialSyncStatus:"needs_reconfirm",arPostedAt:""}:{accountingStatus:a.accountingStatus||"pending_accounting"},updatedAt:(new Date).toISOString()
},C=De(await this.SalesOrder.findOneAndUpdate(be(n,a),{$set:y,$inc:{version:1}},{new:!0,lean:!0,session:r.session}));return{order:await this.getCanonicalOrderByKey(re(C),r),
allocation:m,message:"Đã lưu thu tiền"}}async confirm(e={},t={}){const r=S(e.salesOrderId||e.orderId||e.salesOrderCode||e.orderCode),n=await this.getCanonicalOrderByKey(r,t)
;if(!n){const e=new Error("Không tìm thấy đơn giao hàng");throw e.status=404,e}if(Ae(n,e),n.reconciliation&&!n.reconciliation.balanced){
const e=new Error(n.reconciliation.message||"Đơn chưa cân đối, không thể xác nhận giao");throw e.status=400,e}
const a=S(e.deliveryStatus||e.status||"delivered"),o=["delivered","success","done","completed"].includes(O(a)),d={deliveryStatus:o?"delivered":a,status:o?"delivered":a,
deliveryStaffCode:S(e.deliveryStaffCode||n.deliveryStaffCode),deliveryStaffName:S(e.deliveryStaffName||n.deliveryStaffName),staffCode:S(e.deliveryStaffCode||n.deliveryStaffCode),
staffName:S(e.deliveryStaffName||n.deliveryStaffName),deliveryNote:S(e.note||e.deliveryNote),deliveredAt:(new Date).toISOString(),updatedAt:(new Date).toISOString()
},s=De(await this.SalesOrder.findOneAndUpdate(be(r,n),{$set:d,$inc:{version:1}},{new:!0,lean:!0,session:t.session}));return{order:await this.getCanonicalOrderByKey(re(s),t),
message:"Đã xác nhận giao hàng"}}reconcileRows(e=[]){const t=Ee(e),r=Math.round(t.receivable-t.cash-t.bank-t.reward-t.returnAmount-t.debt);return{...t,difference:r,
balanced:Math.abs(r)<=1e3,message:Math.abs(r)<=1e3?"Đối soát OK":`Chênh lệch ${r.toLocaleString("vi-VN")}`}}async listReturnDocuments(e={}){const t={...Ce()
},r=[],n=S(e.dateFrom||e.fromDate||e.from||("today"===e.dateMode?e.date||g():"")),a=S(e.dateTo||e.toDate||e.to||("today"===e.dateMode?e.date||g():""));if(n||a){const e={}
;n&&(e.$gte=n),a&&(e.$lte=a),r.push({$or:[{date:e},{documentDate:e},{deliveryDate:e},{returnDate:e}]})}
const o=p([e.salesOrderId,e.orderId,e.salesOrderCode,e.orderCode,e.orderKey,e.code,e.id]);if(o.length){const e=p(o.flatMap(_));r.push({$or:[{salesOrderId:{$in:e}},{orderId:{$in:e}
},{sourceOrderId:{$in:e}},{deliveryOrderId:{$in:e}},{salesOrderCode:{$in:e}},{orderCode:{$in:e}},{sourceOrderCode:{$in:e}},{deliveryOrderCode:{$in:e}},{id:{$in:e}},{code:{$in:e}}]
})}if(e.masterOrderId&&(t.masterOrderId=S(e.masterOrderId)),e.masterOrderCode&&(t.masterOrderCode=S(e.masterOrderCode)),e.customerCode&&(t.customerCode=S(e.customerCode)),
e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.delivery){const t=new RegExp(R(e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.delivery),"i");r.push({$or:[{
deliveryStaffCode:t},{deliveryStaffName:t},{deliveryCode:t},{deliveryName:t},{nvghCode:t},{nvghName:t}]})}if(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.salesman){
const t=new RegExp(R(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.salesman),"i");r.push({$or:[{salesStaffCode:t},{salesStaffName:t},{salesmanCode:t},{salesmanName:t},{nvbhCode:t
},{nvbhName:t}]})}const d=S(e.q||e.keyword||e.search);if(d){const e=new RegExp(R(d),"i");r.push({$or:[{id:e},{code:e},{salesOrderCode:e},{orderCode:e},{customerCode:e},{
customerName:e},{deliveryStaffCode:e},{deliveryStaffName:e},{salesStaffCode:e},{salesStaffName:e},{salesmanCode:e},{salesmanName:e},{note:e}]})}r.length&&(t.$and=r)
;const s=Math.max(1,Number(e.page||1)),i=Math.min(500,Math.max(1,Number(e.limit||100))),u=(s-1)*i,l=(await this.ReturnOrder.find(t).select(Z).sort({createdAt:-1,code:-1
}).skip(u).limit(i).lean()).map(B).filter(t=>"1"===String(e.includeZeroValue??e.showZero??"0")||Q(t)),c=l.flatMap(e=>Me(e,{}));return{returnOrders:l,returns:l,rows:c,summary:L(c)}}
async listReturns(e={}){
const t=e=>Array.isArray(e)?e:S(e).split(",").map(e=>e.trim()).filter(Boolean),r=p([e.salesOrderId,e.orderId,e.salesOrderCode,e.orderCode,e.orderKey,...t(e.salesOrderIds||e.orderIds),...t(e.salesOrderCodes||e.orderCodes)])
;let n=null,a=[];if(r.length){const t=[],n=p(r.flatMap(_));for(const e of n)t.push({salesOrderId:e},{orderId:e},{salesOrderCode:e},{orderCode:e},{sourceOrderId:e},{
sourceOrderCode:e},{deliveryOrderId:e},{deliveryOrderCode:e},{id:e},{code:e});let a=[];if(t.length){let e=this.ReturnOrder.find({...Ce(),$or:t})
;e&&"function"==typeof e.select&&(e=e.select(Z)),a=((e&&"function"==typeof e.lean?await e.lean():await e)||[]).map(B).filter(Q)}const o=Ne(a,e)
;if(a.length&&!o.length&&Oe(e))return{rows:[],returnOrdersRaw:[],summary:L([])};if(o.length){const e=o.flatMap(e=>Me(e,{}));return{rows:e,returnOrdersRaw:o,summary:L(e)}}return{
rows:[],returnOrdersRaw:[],summary:L([])}}{const t=await this.listReturnDocuments(e);if((t.rows||[]).length||e.deliveryStaffCode||e.delivery||e.date||e.deliveryDate)return{
rows:t.rows||[],returnOrdersRaw:t.returnOrders||[],summary:t.summary||L(t.rows||[])};n=await this.listOrders(e),a=n.rows||[]}const o=new Map,d=new Map;for(const e of a||[]){
for(const t of p([e.orderId,e.salesOrderId,e.id]))o.set(t,e);for(const t of p([e.orderCode,e.salesOrderCode,e.code]))d.set(t,e)}const s=await this.findReturnOrdersFor(a),i=[]
;for(const e of s||[]){
const t=o.get(S(e.salesOrderId||e.orderId||e.sourceOrderId||e.deliveryOrderId))||d.get(S(e.salesOrderCode||e.orderCode||e.sourceOrderCode||e.deliveryOrderCode))||{}
;i.push(...Me(e,t))}return{rows:i,returnOrdersRaw:s.map(B),summary:L(i)}}async reconciliation(e={}){return(await this.listOrders(e)).reconciliation}}function ze(e={}){return e}
module.exports={DeliveryEngine:je,buildDeliveryAssignment:ze,buildCanonicalOrder:_e,buildOrderReconciliation:ke,summarizeOrders:Ee,helpers:{text:S,unique:p,orderIdOf:re,
orderCodeOf:ne,productCodeOf:ie,returnMatchesOrder:Re,buildOrderLookup:we,canonicalizeReturnDocument:B,summarizeReturnRows:L}};
