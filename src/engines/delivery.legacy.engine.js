/* GENERATED FILE — edit src/engines/delivery.legacy.engine.source/part-01.jsfrag, src/engines/delivery.legacy.engine.source/part-02.jsfrag, src/engines/delivery.legacy.engine.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
/* Static contract marker: masterOrderId: { $exists: true, $nin: [null, ''] } */
;const{toNumber:e,makeId:t}=require("../utils/common.util"),r=require("../utils/deliveryFinance.util"),n=require("../utils/date.util"),{normalizeDebtAmount:a}=require("../constants/finance.constants"),{SALES_STAFF_CODE_FIELDS:o,SALES_STAFF_NAME_FIELDS:d,DELIVERY_STAFF_CODE_FIELDS:s,DELIVERY_STAFF_NAME_FIELDS:i,USER_ACCOUNT_SALES_STAFF_CODE_FIELDS:u,USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS:l,pickSalesStaffCode:c,pickSalesStaffName:f,pickDeliveryStaffCode:m,pickDeliveryStaffName:y,pickUserAccountSalesStaffCode:C,pickUserAccountDeliveryStaffCode:v}=require("../domain/staff/staffIdentity")
;function h(e){return String(null==e?"":e).trim()}function S(e){return h(e).toLowerCase()}function O(e=[]){return[...new Set(e.map(h).filter(Boolean))]}function p(){
return n.todayVN?n.todayVN():(new Date).toISOString().slice(0,10)}function g(e){const t=Number(e||0);return Number.isFinite(t)?t:0}function N(e){
return S(e).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g," ").trim()}function A(e){return N(e).replace(/[^a-z0-9]/g,"")}function I(e){
return["1","true","yes","y"].includes(S(e))}function w(e={}){const t=e&&"object"==typeof e.status?e.status:{},r=S(e.accountingStatus||t.accountingStatus)
;return Boolean(e.accountingNeedsReconfirm||e.needReAccounting||e.reAccountingRequired||e.adminAdjustmentOpen)||["reopened","needs_reconfirm","needs_repost"].includes(r)}
function b(e={}){if(!e||w(e))return!1;const t=e&&"object"==typeof e.status?e.status:{},r=S(e.accountingStatus||t.accountingStatus)
;return Boolean(e.accountingConfirmed||e.accountingLocked||e.editLocked)||["confirmed","locked","posted","done"].includes(r)}function D(e){
return h(e).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function R(e){return h(e).replace(/^RO[-_]?/i,"")}function $(e){const t=R(e);return t?`RO-${t}`:""}function M(e){const t=h(e)
;return O([t,R(t),$(t)])}function _(e){return O(M(e).flatMap(e=>[e,A(e),R(e),A(R(e))]))}function k(t=[]){return Math.round((Array.isArray(t)?t:[]).reduce((t,r)=>{
const n=le(r)||ue(r),a=ce(r);return t+(n>0&&a>0?n*a:e(r.returnAmount??r.amount??0))},0))}function E(e=[]){return(Array.isArray(e)?e:[]).reduce((e,t)=>e+(le(t)||ue(t)),0)}
function F(t={}){return k(Array.isArray(t.items)?t.items:[])>0||e(t.totalAmount??t.totalReturnAmount??t.amount??t.debtReduction)>0}function Q(t={}){
const r=(Array.isArray(t.items)?t.items:[]).map(t=>{const r=le(t)||ue(t),n=ce(t),a=Math.round(r>0&&n>0?r*n:e(t.returnAmount??t.amount??0));return{...t,productCode:se(t),code:se(t),
productName:ie(t),name:ie(t),returnQty:r,qtyReturn:r,returnQuantity:r,returnedQty:r,quantity:r,qty:r,price:n,salePrice:n,unitPrice:n,returnAmount:a,amount:a}
}).filter(t=>t.productCode||t.productName||e(t.returnQty)>0),n=k(r)||Math.round(e(t.totalAmount??t.totalReturnAmount??t.amount??t.debtReduction)),a=E(r)||e(t.totalQuantity??t.quantity??t.qty),o=h(t.id||t.code||t._id),d=h(t.code||t.id||o)
;return{...t,id:o,code:d,salesOrderId:h(t.salesOrderId||t.orderId||t.sourceOrderId||t.deliveryOrderId),
salesOrderCode:h(t.salesOrderCode||t.orderCode||t.sourceOrderCode||t.deliveryOrderCode||R(d)),orderId:h(t.orderId||t.salesOrderId||t.sourceOrderId||t.deliveryOrderId),
orderCode:h(t.orderCode||t.salesOrderCode||t.sourceOrderCode||t.deliveryOrderCode||R(d)),items:r,returnItems:r,totalQuantity:a,totalAmount:n,totalReturnAmount:n,amount:n,
debtReduction:n}}function B(t=[]){return t.reduce((t,r)=>(t.returnQty+=e(r.returnQty??r.totalQuantity),t.amount+=e(r.amount??r.totalAmount??r.debtReduction),t),{returnQty:0,
amount:0})}function L(e={},t=[]){for(const r of t){const t=h(e[r]);if(t&&!["all","tat ca","tất cả","*"].includes(N(t)))return t}return""}function x(e={},t=[]){return t.flatMap(t=>{
const r=e[t];return Array.isArray(r)?r:[r]}).map(h).filter(Boolean)}function q(e={},t="",r=[]){const n=A(t),a=N(t);return!n&&!a||x(e,r).some(e=>{const t=A(e),r=N(e)
;return n&&t.includes(n)||a&&r.includes(a)})}
const K=["deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","shipperCode","shipperName","nvghCode","nvghName","staffDeliveryCode","staffDeliveryName"],T=["salesStaffCode","salesStaffName","salesmanCode","salesmanName","staffCode","staffName","saleCode","saleName","nvbhCode","nvbhName"]
;function P(e=[],t={}){
const r=L(t,["deliveryStaffCode","deliveryStaffName","deliveryStaff","deliveryStaffKeyword","deliveryCode","deliveryName","nvgh","nvghCode","nvghName"]),n=L(t,["salesStaffCode","salesStaffName","salesStaff","salesStaffKeyword","salesCode","salesName","nvbh","nvbhCode","nvbhName"])
;return e.filter(e=>!(r&&!q(e,r,K)||n&&!q(e,n,T)))}function V(e){const t=h(e);return t?O([t,t.toLowerCase(),t.toUpperCase()]):[]}function U(e){const t=h(e),r=A(t)
;return Boolean(r)&&r.length<=16&&!/\s/.test(t)}function j(e={},t=""){
const r=L(e,"delivery"===t?["deliveryStaffCode","deliveryCode","nvghCode","staffDeliveryCode"]:["salesStaffCode","salesmanCode","salesCode","nvbhCode"]),n=L(e,"delivery"===t?["deliveryStaffName","deliveryStaff","deliveryStaffKeyword","deliveryName","nvgh","nvghName"]:["salesStaffName","salesStaff","salesStaffKeyword","salesName","nvbh","nvbhName"]),a=r||(U(n)?n:"")
;if(a){const e=V(a);return{
$or:("delivery"===t?["deliveryStaffCode","deliveryCode","shipperCode","nvghCode","staffDeliveryCode"]:["salesStaffCode","salesmanCode","saleCode","nvbhCode"]).map(t=>({[t]:{$in:e}
}))}}if(n){const e=new RegExp(D(n),"i");return{
$or:("delivery"===t?["deliveryStaffName","deliveryName","shipperName","nvghName","staffDeliveryName"]:["salesStaffName","salesmanName","saleName","nvbhName"]).map(t=>({[t]:e}))}}
return null}function z(e=[],t={}){const r=j(t,"delivery"),n=j(t,"sales");r&&e.push(r),n&&e.push(n)}
const H=["id","code","orderCode","salesOrderId","salesOrderCode","date","orderDate","deliveryDate","createdAt","updatedAt","version","customerId","customerCode","customerName","customerPhone","customerAddress","phone","address","routeName","salesStaffCode","salesStaffName","salesmanCode","salesmanName","nvbhCode","nvbhName","deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","shipperCode","shipperName","nvghCode","nvghName","status","deliveryStatus","accountingStatus","accountingConfirmed","totalAmount","paidAmount","debtAmount","cashCollected","cashAmount","bankCollected","bankAmount","rewardAmount","returnAmount","returnedAmount","items","note","masterOrderId","masterOrderCode","masterOrderNo","deliveryMasterId","deliveryMasterCode","mergeStatus"].join(" "),Y=["id","code","date","documentDate","returnDate","deliveryDate","createdAt","updatedAt","salesOrderId","salesOrderCode","orderId","orderCode","sourceOrderId","sourceOrderCode","deliveryOrderId","deliveryOrderCode","masterOrderId","masterOrderCode","masterReturnOrderId","masterReturnOrderCode","customerCode","customerName","deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","nvghCode","nvghName","salesStaffCode","salesStaffName","salesmanCode","salesmanName","nvbhCode","nvbhName","status","returnStatus","warehouseStatus","accountingStatus","returnMergeStatus","items","returnItems","totalQuantity","quantity","qty","totalAmount","totalReturnAmount","amount","debtReduction","note"].join(" ")
;function Z(e={}){return L(e,["deliveryStaffCode","deliveryCode","nvghCode","staffDeliveryCode"])}function G(e={}){
return Boolean(Z(e))&&!e.salesStaffCode&&!e.salesmanCode&&!e.salesCode&&!e.nvbhCode&&!e.salesman}function J(e){return{[e]:{$type:"string",$gt:""}}}function X(){return{
$or:[J("masterOrderId"),J("masterOrderCode")]}}function W(){return{$or:[J("masterOrderNo"),J("deliveryMasterId"),J("deliveryMasterCode")]}}function ee(e={}){return e.legacy?W():X()
}function te(e={}){return h(e.id||e.orderId||e.salesOrderId||e._id)}function re(e={}){return h(e.code||e.orderCode||e.salesOrderCode||e.displayOrderCode||e.id||e._id)}
function ne(e={}){const t=R(e.salesOrderCode||e.orderCode||e.code||e.displayOrderCode);if(t)return`code:${A(t)}`;const r=h(e.salesOrderId||e.orderId||e.id||e._id)
;return r?`id:${r}`:""}function ae(e){const t=S(e)
;return["deleted","removed","void","cancelled","canceled"].includes(t)?-1e3:["delivered","completed","done"].includes(t)?80:["assigned","shipping","pending_delivery"].includes(t)?40:0
}function oe(t={}){const r=t&&"object"==typeof t.status?t.status:{},n=Date.parse(t.updatedAt||t.modifiedAt||t.createdAt||"")||0,a=Array.isArray(t.items)?t.items.length:0
;return ae(t.deletedAt?"deleted":"")+ae(t.deliveryStatus||r.deliveryStatus||t.status)+(t.accountingConfirmed?20:0)+(t.stockPosted?10:0)+Math.min(a,50)+Math.min(Math.max(e(t.totalAmount||t.amount||t.debtAmount),0),1e9)/1e9+n/1e14
}function de(e=[]){const t=new Map,r=[];for(const n of Array.isArray(e)?e:[]){if(!n)continue;const e=ne(n);if(!e){r.push(n);continue}const a=t.get(e);(!a||oe(n)>=oe(a))&&t.set(e,n)
}return r.concat(Array.from(t.values()))}function se(e={}){return h(e.productCode||e.code||e.productId||e.sku||e.id||e._id)}function ie(e={}){
return h(e.productName||e.name||e.product||"")}function ue(t={}){return e(t.deliveredQty??t.soldQty??t.quantitySold??t.orderQty??t.totalQty??t.qtySold??t.quantity??t.qty??0)}
function le(t={}){return e(t.returnQty??t.qtyReturn??t.returnQuantity??t.returnedQty??t.quantityReturn??0)}function ce(t={}){
return e(t.price??t.salePrice??t.unitPrice??t.finalPrice??t.giaBan??0)}function fe(e={}){const t=new Map;for(const r of Array.isArray(e.items)?e.items:[]){const e=se(r)
;e&&!t.has(e)&&t.set(e,r)}return t}function me(e={},t={}){const r=se(e)||se(t),n=le(e),a=ce(e)||ce(t),o=ie(e)||ie(t),d=Math.max(0,Math.round(n*a));return{...t,...e,
productId:h(e.productId||t.productId||r),productCode:r,code:r,productName:o,name:o,returnQty:n,qtyReturn:n,returnQuantity:n,returnedQty:n,price:a,salePrice:a,unitPrice:a,
returnAmount:d,amount:d}}function ye(){return{status:{$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}}}function Ce(){
return require("../domain/lifecycle/ReturnLifecycleService")}function ve(e,t){return t&&e&&"function"==typeof e.session?e.session(t):e}function he(e={}){
return h(e.actorDeliveryStaffCode||e.actorStaffCode||e.authenticatedStaffCode||"")}function Se(e={}){return Boolean(e&&e.enforceDeliveryOwnership)}function Oe(e={}){
return h(e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.shipperCode||e.driverCode||e.staffDeliveryCode)}function pe(e={},t={}){if(!Se(t))return!0;const r=he(t),n=Oe(e)
;return Boolean(r&&n&&A(n)===A(r))}function ge(e=[],t={}){return Se(t)?(Array.isArray(e)?e:[]).filter(e=>pe(e,t)):e}function Ne(e={},t={}){if(!Se(t))return;const r=he(t),n=Oe(e)
;if(!r){const e=new Error("Không xác định được mã nhân viên giao hàng đang đăng nhập");throw e.status=403,e.code="DELIVERY_ACTOR_REQUIRED",e}if(!n||A(n)!==A(r)){
const e=new Error("Đơn giao hàng không thuộc nhân viên đang đăng nhập");throw e.status=403,e.code="DELIVERY_ORDER_FORBIDDEN",e}}function Ae(e){const t=h(e);if(!t)return null
;const r=[{id:t},{code:t},{orderCode:t},{salesOrderId:t},{salesOrderCode:t}];return/^[a-f\d]{24}$/i.test(t)&&r.push({_id:t}),{$or:r}}function Ie(e){const t=h(e);if(!t)return[]
;const r=[],n=new Set,a=e=>{const t=JSON.stringify(e);n.has(t)||(n.add(t),r.push(e))};return/^SO[0-9A-Z_-]+$/i.test(t)?(a({id:t}),a({code:t}),a({orderCode:t}),a({salesOrderId:t}),
a({salesOrderCode:t}),r):(/^[a-f\d]{24}$/i.test(t)&&a({_id:t}),a({id:t}),a({code:t}),a({orderCode:t}),a({salesOrderId:t}),a({salesOrderCode:t}),r)}function we(e,t={}){
const r=Ae(e),n=void 0!==t.version&&null!==t.version&&""!==t.version,a=n?Number(t.version):0;return{$and:[r,n?{version:a}:{$or:[{version:{$exists:!1}},{version:0},{version:null}]}]
}}function be(e){if(e)return e;const t=new Error("Dữ liệu đơn đã thay đổi bởi thao tác khác. Vui lòng tải lại trước khi lưu.");throw t.status=409,t.code="ORDER_VERSION_CONFLICT",t}
function De(e={},t={}){
const r=O([te(t),t.salesOrderId,t.orderId,t.sourceOrderId,t.deliveryOrderId,re(t),t.salesOrderCode,t.orderCode,t.sourceOrderCode,t.deliveryOrderCode,t.id,t.code]).flatMap(_),n=O([e.salesOrderId,e.orderId,e.sourceOrderId,e.deliveryOrderId,e.salesOrderCode,e.orderCode,e.sourceOrderCode,e.deliveryOrderCode,e.id,e.code]).flatMap(_),a=new Set(n)
;return r.some(e=>a.has(e))}function Re(e=[]){const t=new Map;for(const r of e||[]){const e=S(r.status)
;if(!["cancelled","canceled","void","deleted"].includes(e))for(const e of Array.isArray(r.items)?r.items:[]){const r=se(e);if(!r)continue;const n=t.get(r)||{productCode:r,code:r,
productName:ie(e),name:ie(e),returnQty:0,qtyReturn:0,returnQuantity:0,returnedQty:0,price:ce(e),salePrice:ce(e),unitPrice:ce(e),returnAmount:0,amount:0
},a=le(e)||ue(e),o=ce(e)||n.price||0;n.productName=n.productName||ie(e),n.name=n.productName,n.returnQty+=a,n.qtyReturn=n.returnQty,n.returnQuantity=n.returnQty,
n.returnedQty=n.returnQty,n.price=o,n.salePrice=o,n.unitPrice=o,n.returnAmount=Math.round(n.returnQty*o),n.amount=n.returnAmount,t.set(r,n)}}return Array.from(t.values())}
function $e(t={},r={}){const n=h(t.status||t.returnStatus||"active"),a={returnOrderId:h(t.id||t._id),returnOrderCode:h(t.code||t.id),
salesOrderId:h(t.salesOrderId||t.orderId||r.salesOrderId||r.orderId),salesOrderCode:h(t.salesOrderCode||t.orderCode||r.salesOrderCode||r.orderCode),
orderId:h(t.orderId||t.salesOrderId||r.orderId||r.salesOrderId),orderCode:h(t.orderCode||t.salesOrderCode||r.orderCode||r.salesOrderCode),
customerCode:h(t.customerCode||r.customerCode),customerName:h(t.customerName||r.customerName),deliveryDate:h(t.deliveryDate||t.date||r.deliveryDate),status:n
},o=Array.isArray(t.items)?t.items:[];return o.length?o.map(t=>{const r=le(t)||ue(t),n=ce(t);return{...a,productCode:se(t),productName:ie(t),returnQty:r,price:n,
amount:Math.round(r>0&&n>0?r*n:e(t.returnAmount??t.amount??0))}}):[{...a,productCode:"",productName:"",returnQty:0,price:0,
amount:e(t.totalAmount||t.amount||t.totalReturnAmount||t.debtReduction)}]}function Me(t={},n=[]){
const o=Re(n),d=o.reduce((t,r)=>t+e(r.returnAmount||r.amount),0),s=r.buildCanonicalDeliveryOrder(t,{returnItems:o,returnAmountOverride:d}),i=s.amounts||{};return{...s,
orderId:te(t),orderCode:re(t),salesOrderId:h(t.salesOrderId||t.id||t._id),salesOrderCode:h(t.salesOrderCode||t.orderCode||t.code||re(t)),customerCode:h(t.customerCode),
customerName:h(t.customerName),deliveryDate:h(t.deliveryDate||t.date||t.documentDate),salesStaffCode:h(t.salesStaffCode||t.salesmanCode),
salesStaffName:h(t.salesStaffName||t.salesmanName),deliveryStaffCode:h(t.deliveryStaffCode),deliveryStaffName:h(t.deliveryStaffName),items:s.items,returnItems:o,returnOrders:n,
amounts:{receivable:e(i.receivable??i.totalReceivable),cash:e(i.cash??i.cashAmount),bank:e(i.bank??i.bankAmount),reward:e(i.reward??i.rewardAmount),returnAmount:e(i.returnAmount),
processed:e(i.processed),debt:a(i.debt??i.debtAmount)},reconciliation:_e(i),status:{deliveryStatus:h(t.deliveryStatus||t.status||"pending"),
paymentStatus:a(i.debt??i.debtAmount)<=0?"paid":(i.processed||0)>0?"partial":"unpaid",returnStatus:(i.returnAmount||0)>0?"has_return":"none",
accountingStatus:h(t.accountingStatus||"")}}}function _e(t={}){
const r=e(t.receivable??t.totalReceivable),n=e(t.cash??t.cashAmount),o=e(t.bank??t.bankAmount),d=e(t.reward??t.rewardAmount),s=e(t.returnAmount),i=a(t.debt??t.debtAmount),u=n+o+d+s+i,l=Math.round(r-u)
;return{receivable:r,cash:n,bank:o,reward:d,returnAmount:s,debt:i,processed:u,difference:l,balanced:Math.abs(l)<=1e3,
message:Math.abs(l)<=1e3?"Đối soát OK":`Chênh lệch ${l.toLocaleString("vi-VN")}`}}function ke(t=[]){return t.reduce((t,r)=>{const n=r.amounts||{}
;return t.receivable+=e(n.receivable),t.cash+=e(n.cash),t.bank+=e(n.bank),t.reward+=e(n.reward),t.returnAmount+=e(n.returnAmount),t.debt+=a(n.debt),t},{receivable:0,cash:0,bank:0,
reward:0,returnAmount:0,debt:0})}
const Ee=["delivered","success","done","completed","accounting_confirmed"],Fe=["all","tat ca","tất cả","*"],Qe=Ee.concat(["da giao","đã giao"]),Be=["open","processing","pending","assigned","not_delivered","not-delivered","chua giao","chưa giao"]
;function Le(e={}){return S((e.status&&"object"==typeof e.status?e.status:{}).deliveryStatus||e.deliveryStatus||e.status||"pending")}function xe(e={}){return Ee.includes(Le(e))}
function qe(e={},t=!1){const r=t?["statusFilter","deliveryStatusFilter","orderStatusFilter","status","deliveryStatus"]:["statusFilter","deliveryStatusFilter","orderStatusFilter"]
;for(const t of r){const r=h(e[t]);if(r)return S(r)}return""}function Ke(e={}){const t=qe(e,!0)
;return I(e.includeCompleted)||I(e.showCompleted)||I(e.includeDelivered)||Fe.includes(t)||Qe.includes(t)}function Te(e={}){return!Ke(e)}function Pe(e){return{$or:[{[e]:{$exists:!1}
},{[e]:null},{[e]:""},{[e]:{$nin:Ee}}]}}function Ve(t=[],r={}){const n=qe(r)||qe(r,!0);let o=t;return Te(r)&&(o=o.filter(e=>!xe(e))),
!n||Fe.includes(n)?o:Qe.includes(n)?t.filter(xe):Be.includes(n)?t.filter(e=>!xe(e)):["return","returns","has_return","tra hang","trả hàng"].includes(n)?t.filter(t=>e(t.amounts&&t.amounts.returnAmount)>0||e(t.returnAmount||t.returnTotal||t.totalReturnAmount)>0):["debt","cong no","công nợ"].includes(n)?t.filter(e=>a((e.amounts&&e.amounts.debt)??e.debtAmount??e.debt)>0):t
}class Ue{constructor(e={}){this.SalesOrder=e.SalesOrder,this.MasterOrder=e.MasterOrder,this.ReturnOrder=e.ReturnOrder,this.StockTransaction=e.StockTransaction,
this.ArLedger=e.ArLedger,this.User=e.User}staffCodeOf(e={},t="sales"){return h("delivery"===t?m(e)||v(e):c(e)||C(e))}staffNameOf(e={},t="sales"){return h("delivery"===t?y(e):f(e))}
staffRoleOk(e={},t=""){const r=N([e.role,e.type,e.position,e.department,e.roleLabel].filter(Boolean).join(" "))
;return!!("delivery"===t?Boolean(e.isDelivery||e.isDeliveryStaff||e.deliveryStaff):Boolean(e.isSalesman||e.isSalesStaff||e.salesStaff))||("delivery"===t?["delivery","shipper","nvgh","giao hang","giaohang"].some(e=>r.includes(N(e))):["sales","sale","nvbh","ban hang","banhang","salesman"].some(e=>r.includes(N(e))))
}orderStaffCode(e={},t=""){
return h("delivery"===t?e.deliveryStaffCode||e.shipperCode||e.driverCode||e.staffDeliveryCode:e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.saleCode||e.sellerCode)}
orderStaffName(e={},t=""){
return h("delivery"===t?e.deliveryStaffName||e.shipperName||e.driverName||e.staffDeliveryName:e.salesStaffName||e.salesmanName||e.nvbhName||e.saleName||e.sellerName)}
async buildStaffSystemIndex(e=[]){const t={byCode:new Map,byName:new Map};if(!this.User||!e.length)return t
;const r=O(e.flatMap(e=>[this.orderStaffCode(e,"sales"),this.orderStaffName(e,"sales"),this.orderStaffCode(e,"delivery"),this.orderStaffName(e,"delivery")])).filter(Boolean)
;if(!r.length)return t;const n=r.map(e=>new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,"i")),a=await this.User.find({isActive:{$ne:!1},$or:[...u.map(e=>({[e]:{$in:n}
})),...l.map(e=>({[e]:{$in:n}})),...d.map(e=>({[e]:{$in:n}})),...i.map(e=>({[e]:{$in:n}}))]
}).select("id code staffCode employeeCode salesStaffCode salesStaffName salesmanCode salesmanName deliveryStaffCode deliveryStaffName shipperCode shipperName maNhanVien name fullName role type position department roleLabel isSalesman isSalesStaff salesStaff isDelivery isDeliveryStaff deliveryStaff isActive").lean().catch(()=>[]),o=new Map,s=new Map
;for(const e of a||[]){
const t=this.staffCodeOf(e,"sales"),r=this.staffCodeOf(e,"delivery"),n=this.staffNameOf(e,"sales"),a=this.staffNameOf(e,"delivery"),d=O([t,r]).map(A).filter(Boolean),i=O([n,a]).map(N).filter(Boolean)
;for(const t of d)o.set(t,e);for(const t of i)s.set(t,e)}return{byCode:o,byName:s}}verifyAssignedStaff(e={},t={byCode:new Map,byName:new Map},r=""){
const n=this.orderStaffCode(e,r),a=this.orderStaffName(e,r),o="delivery"===r?"NVGH":"NVBH";let d=n?t.byCode.get(A(n)):null;!d&&a&&(d=t.byName.get(N(a)))
;const s=d?this.staffCodeOf(d,r):"",i=d?this.staffNameOf(d,r):"",u=Boolean(d&&n&&A(s)===A(n)),l=Boolean(d&&a&&N(i)===N(a)),c=Boolean(d&&this.staffRoleOk(d,r))
;let f=`${o} đúng mã hệ thống`
;return n||a?d?c?!u&&n&&(f=`${o} không khớp mã hệ thống`):f=`${o} có mã hệ thống nhưng sai vai trò`:f=`${o} không tồn tại trong mục Tài khoản/Hệ thống`:f=`Thiếu ${o}`,{type:r,
label:o,ok:Boolean(d&&c&&(u||!n&&l)),exists:Boolean(d),roleOk:c,codeMatches:u,nameMatches:l,assignedCode:n,assignedName:a,systemCode:s,systemName:i,message:f}}
async enrichStaffAssignment(e=[]){const t=await this.buildStaffSystemIndex(e);return e.map(e=>{
const r=this.verifyAssignedStaff(e,t,"sales"),n=this.verifyAssignedStaff(e,t,"delivery"),a=r.ok&&n.ok;return{...e,staffAssignment:{ok:a,sales:r,delivery:n},
staffAssignmentStatus:a?"valid":"warning",staffAssignmentMessage:a?"Đơn đã gán đúng NVBH/NVGH theo mã hệ thống":[r,n].filter(e=>!e.ok).map(e=>e.message).join("; ")}})}
async execSalesOrderFind(e={},{select:t=H,sort:r={},limit:n=1e3}={}){let a=this.SalesOrder.find(e);return a&&"function"==typeof a.select&&(a=a.select(t)),
a&&"function"==typeof a.sort&&(a=a.sort(r)),a&&"function"==typeof a.limit&&(a=a.limit(n)),a&&"function"==typeof a.lean?a.lean():a}async resolveSalesOrderByKnownCode(e,t={}){
const r=Ie(e);for(const e of r){let r=this.SalesOrder.findOne(e);r=ve(r,t.session),r&&"function"==typeof r.select&&(r=r.select(H))
;const n=r&&"function"==typeof r.lean?await r.lean():await r;if(n)return n}const n=Ae(e);if(!n)return null;let a=this.SalesOrder.findOne(n);return a=ve(a,t.session),
a&&"function"==typeof a.select&&(a=a.select(H)),a&&"function"==typeof a.lean?a.lean():a}async findOrders(e={}){
const t=h(e.date||e.deliveryDate||p()),r=N(e.status||e.deliveryStatus),n=N(e.q||e.keyword);let a=[]
;const o=Math.min(1e3,Math.max(1,Number(e.limit||1e3))),d=async(a,{fast:d=!1}={})=>{const s=(()=>{const n={};return t&&(n.deliveryDate=t),
r&&!["all","tat ca","tất cả","*"].includes(r)&&(n.deliveryStatus=h(e.status||e.deliveryStatus)),I(e.includeInactive)||I(e.showInactive)||(n.status={
$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}),n})(),i=[a];if(d){const t=Z(e);i.push({deliveryStaffCode:{$in:V(t)}})}else z(i,e)
;return Te(e)&&(i.push(Pe("deliveryStatus")),i.push(Pe("status"))),((t=[])=>{if(!n)return;const r=new RegExp(D(e.q||e.keyword),"i");t.push({$or:[{code:r},{orderCode:r},{
salesOrderCode:r},{customerCode:r},{customerName:r}]})})(i),s.$and=i,this.execSalesOrderFind(s,{sort:d?{deliveryDate:-1,deliveryStaffCode:1,customerName:1,code:1}:{
deliveryStaffCode:1,customerName:1,code:1},limit:d?Math.min(300,o):o})};if(G(e)&&(a=await d(ee(),{fast:!0}),a.length||(a=await d(ee({legacy:!0}),{fast:!0}))),
a.length||(a=await d(ee()),a.length||(a=await d(ee({legacy:!0})))),!a.length&&t&&this.MasterOrder){const r=O(P(await this.MasterOrder.find({deliveryDate:t
}).select("id code deliveryDate deliveryStaffCode deliveryStaffName childOrderIds children").lean(),e).flatMap(e=>Array.isArray(e.childOrderIds)?e.childOrderIds:[]))
;r.length&&(a=await this.execSalesOrderFind({$or:[{id:{$in:r}},{code:{$in:r}}]},{limit:1e3}))}return a=P(a,e),
n&&(a=a.filter(e=>[e.code,e.orderCode,e.salesOrderCode,e.customerCode,e.customerName,e.salesStaffCode,e.salesStaffName,e.staffCode,e.staffName,e.deliveryStaffCode,e.deliveryStaffName].some(e=>N(e).includes(n)))),
de(a)}async findReturnOrdersFor(e=[],t={}){
const r=O(e.flatMap(e=>[te(e),e.id,e._id,e.salesOrderId,e.orderId,e.sourceOrderId,e.deliveryOrderId])),n=O(e.flatMap(e=>[re(e),e.code,e.orderCode,e.salesOrderCode,e.sourceOrderCode,e.deliveryOrderCode])),a=O(r.flatMap(M)),o=O(n.flatMap(M)),d=[]
;if(a.length&&d.push({salesOrderId:{$in:a}},{orderId:{$in:a}},{sourceOrderId:{$in:a}},{deliveryOrderId:{$in:a}},{id:{$in:a}}),o.length&&d.push({salesOrderCode:{$in:o}},{orderCode:{
$in:o}},{sourceOrderCode:{$in:o}},{deliveryOrderCode:{$in:o}},{code:{$in:o}},{id:{$in:o}}),!d.length)return[];let s=this.ReturnOrder.find({...ye(),$or:d});return s=ve(s,t.session),
s&&"function"==typeof s.select&&(s=s.select(Y)),(await s.lean()).map(Q).filter(F)}async getCanonicalOrderByKey(e,t={}){const r=await this.resolveSalesOrderByKnownCode(e,t)
;if(!r)return null;const n=await this.findReturnOrdersFor([r],t);return Me(r,n.filter(e=>De(e,r)))}async listOrders(e={}){
const t=de(await this.findOrders(e)),r=await this.findReturnOrdersFor(t);let n=t.map(e=>Me(e,r.filter(t=>De(t,e))));return n=de(Ve(n,e)),
(I(e.checkStaffAssignment)||I(e.checkStaff)||I(e.staffCheck))&&(n=await this.enrichStaffAssignment(n)),{rows:n,summary:ke(n),reconciliation:this.reconcileRows(n)}}
normalizeReturnItems(e=[],t={}){const r=fe(t);return(Array.isArray(e)?e:[]).map(e=>{const t=se(e);return me(e,r.get(t)||{})}).filter(e=>e.productCode&&e.returnQty>0)}
async saveReturn(t={}){const r=arguments[1]||{},n=h(t.salesOrderId||t.orderId||t.salesOrderCode||t.orderCode),a=await this.resolveSalesOrderByKnownCode(n,r);if(!a){
const e=new Error("Không tìm thấy đơn giao hàng");throw e.status=404,e}Ne(a,t)
;const o=this.normalizeReturnItems(t.items,a),d=o.reduce((t,r)=>t+e(r.returnAmount||r.amount),0),s=`RO-${re(a).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,i={id:s,
code:s,salesOrderId:te(a),salesOrderCode:re(a),orderId:te(a),orderCode:re(a),customerId:h(a.customerId),customerCode:h(a.customerCode),customerName:h(a.customerName),
deliveryDate:h(a.deliveryDate||t.deliveryDate||p()),date:h(t.date||a.deliveryDate||p()),documentDate:h(t.documentDate||t.date||a.deliveryDate||p()),
deliveryStaffCode:h(a.deliveryStaffCode||t.deliveryStaffCode),deliveryStaffName:h(a.deliveryStaffName||t.deliveryStaffName),
salesStaffCode:h(a.salesStaffCode||a.salesmanCode||t.salesStaffCode),salesStaffName:h(a.salesStaffName||a.salesmanName||t.salesStaffName),
salesmanCode:h(a.salesmanCode||a.salesStaffCode||t.salesmanCode),salesmanName:h(a.salesmanName||a.salesStaffName||t.salesmanName),
staffCode:h(a.deliveryStaffCode||t.deliveryStaffCode),staffName:h(a.deliveryStaffName||t.deliveryStaffName),source:"canonical_delivery_engine",
refType:o.length?"canonicalDeliveryReturn":"canonicalDeliveryReturnClear",returnType:h(t.returnType||"partial")||"partial",returnStatus:o.length?"waiting_receive":"cancelled",
status:o.length?"waiting_receive":"cancelled",accountingConfirmed:!1,accountingStatus:o.length?"pending":"cancelled",items:o,totalQuantity:o.reduce((t,r)=>t+e(r.returnQty),0),
totalAmount:d,totalReturnAmount:d,amount:d,debtReduction:d,note:h(t.note)||(o.length?"Cập nhật hàng trả từ DeliveryEngine":"Xóa hàng trả về 0 từ DeliveryEngine"),
updatedAt:(new Date).toISOString(),clearedAt:o.length?"":(new Date).toISOString()},u=r.session?await Ce().createPendingReturn(i,r):await Ce().createPendingReturn(i);if(u&&u.error){
const e=new Error(u.error);throw e.status=u.status||400,e}const l=u&&u.returnOrder||u,c=await this.getCanonicalOrderByKey(te(a),r),f=$e(l,c||a);return{order:c,returnOrder:l,
returns:f,returnOrders:f,rows:f,message:o.length?"Đã lưu hàng trả":"Đã xóa hàng trả về 0"}}async savePayment(t={},r={}){
const n=h(t.salesOrderId||t.orderId||t.salesOrderCode||t.orderCode),a=await this.getCanonicalOrderByKey(n,r);if(!a){const e=new Error("Không tìm thấy đơn giao hàng")
;throw e.status=404,e}Ne(a,t);const o=b(a),d=w(a);if(o&&!d){const e=new Error("Đơn đã xác nhận kế toán, cần mở khóa admin trước khi sửa tiền");throw e.status=423,e}
const s=Math.max(0,g(t.cashAmount??t.cashCollected)),i=Math.max(0,g(t.bankAmount??t.bankCollected??t.transferAmount)),u=Math.max(0,g(t.rewardAmount??t.bonusAmount)),l=e(a.amounts&&a.amounts.returnAmount),c=e(a.amounts&&a.amounts.receivable),f=s+i+u+l
;if(f-c>1e3){const e=new Error(`Tổng thu/trả (${f.toLocaleString("vi-VN")}) vượt phải thu (${c.toLocaleString("vi-VN")})`);throw e.status=400,e}const m={type:"delivery_collection",
source:"DeliveryEngine",date:h(t.date||p()),cashAmount:s,bankAmount:i,rewardAmount:u,returnAmount:l,amount:s+i+u,salesOrderId:a.salesOrderId,salesOrderCode:a.salesOrderCode,
orderId:a.orderId,orderCode:a.orderCode,deliveryStaffCode:h(t.deliveryStaffCode||a.deliveryStaffCode),deliveryStaffName:h(t.deliveryStaffName||a.deliveryStaffName),
createdAt:(new Date).toISOString()},y={deliveryPayment:m,paymentAllocations:[m],deliveryPaymentSource:"DeliveryEngine",cashCollected:s,cashAmount:s,bankCollected:i,bankAmount:i,
transferAmount:i,rewardAmount:u,displayRewardAmount:u,paidAmount:s+i,collectedAmount:s+i,...d?{accountingConfirmed:!1,accountingLocked:!1,editLocked:!1,accountingNeedsReconfirm:!0,
needReAccounting:!0,reAccountingRequired:!0,adminAdjustmentOpen:!0,accountingStatus:"needs_reconfirm",arStatus:"needs_reconfirm",lifecycleStatus:"needs_reconfirm",
financialSyncStatus:"needs_reconfirm",arPostedAt:""}:{accountingStatus:a.accountingStatus||"pending_accounting"},updatedAt:(new Date).toISOString()
},C=be(await this.SalesOrder.findOneAndUpdate(we(n,a),{$set:y,$inc:{version:1}},{new:!0,lean:!0,session:r.session}));return{order:await this.getCanonicalOrderByKey(te(C),r),
allocation:m,message:"Đã lưu thu tiền"}}async confirm(e={},t={}){const r=h(e.salesOrderId||e.orderId||e.salesOrderCode||e.orderCode),n=await this.getCanonicalOrderByKey(r,t)
;if(!n){const e=new Error("Không tìm thấy đơn giao hàng");throw e.status=404,e}if(Ne(n,e),n.reconciliation&&!n.reconciliation.balanced){
const e=new Error(n.reconciliation.message||"Đơn chưa cân đối, không thể xác nhận giao");throw e.status=400,e}
const a=h(e.deliveryStatus||e.status||"delivered"),o=["delivered","success","done","completed"].includes(S(a)),d={deliveryStatus:o?"delivered":a,status:o?"delivered":a,
deliveryStaffCode:h(e.deliveryStaffCode||n.deliveryStaffCode),deliveryStaffName:h(e.deliveryStaffName||n.deliveryStaffName),staffCode:h(e.deliveryStaffCode||n.deliveryStaffCode),
staffName:h(e.deliveryStaffName||n.deliveryStaffName),deliveryNote:h(e.note||e.deliveryNote),deliveredAt:(new Date).toISOString(),updatedAt:(new Date).toISOString()
},s=be(await this.SalesOrder.findOneAndUpdate(we(r,n),{$set:d,$inc:{version:1}},{new:!0,lean:!0,session:t.session}));return{order:await this.getCanonicalOrderByKey(te(s),t),
message:"Đã xác nhận giao hàng"}}reconcileRows(e=[]){const t=ke(e),r=Math.round(t.receivable-t.cash-t.bank-t.reward-t.returnAmount-t.debt);return{...t,difference:r,
balanced:Math.abs(r)<=1e3,message:Math.abs(r)<=1e3?"Đối soát OK":`Chênh lệch ${r.toLocaleString("vi-VN")}`}}async listReturnDocuments(e={}){const t={...ye()
},r=[],n=h(e.dateFrom||e.fromDate||e.from||("today"===e.dateMode?e.date||p():"")),a=h(e.dateTo||e.toDate||e.to||("today"===e.dateMode?e.date||p():""));if(n||a){const e={}
;n&&(e.$gte=n),a&&(e.$lte=a),r.push({$or:[{date:e},{documentDate:e},{deliveryDate:e},{returnDate:e}]})}
const o=O([e.salesOrderId,e.orderId,e.salesOrderCode,e.orderCode,e.orderKey,e.code,e.id]);if(o.length){const e=O(o.flatMap(M));r.push({$or:[{salesOrderId:{$in:e}},{orderId:{$in:e}
},{sourceOrderId:{$in:e}},{deliveryOrderId:{$in:e}},{salesOrderCode:{$in:e}},{orderCode:{$in:e}},{sourceOrderCode:{$in:e}},{deliveryOrderCode:{$in:e}},{id:{$in:e}},{code:{$in:e}}]
})}if(e.masterOrderId&&(t.masterOrderId=h(e.masterOrderId)),e.masterOrderCode&&(t.masterOrderCode=h(e.masterOrderCode)),e.customerCode&&(t.customerCode=h(e.customerCode)),
e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.delivery){const t=new RegExp(D(e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.delivery),"i");r.push({$or:[{
deliveryStaffCode:t},{deliveryStaffName:t},{deliveryCode:t},{deliveryName:t},{nvghCode:t},{nvghName:t}]})}if(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.salesman){
const t=new RegExp(D(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.salesman),"i");r.push({$or:[{salesStaffCode:t},{salesStaffName:t},{salesmanCode:t},{salesmanName:t},{nvbhCode:t
},{nvbhName:t}]})}const d=h(e.q||e.keyword||e.search);if(d){const e=new RegExp(D(d),"i");r.push({$or:[{id:e},{code:e},{salesOrderCode:e},{orderCode:e},{customerCode:e},{
customerName:e},{deliveryStaffCode:e},{deliveryStaffName:e},{salesStaffCode:e},{salesStaffName:e},{salesmanCode:e},{salesmanName:e},{note:e}]})}r.length&&(t.$and=r)
;const s=Math.max(1,Number(e.page||1)),i=Math.min(500,Math.max(1,Number(e.limit||100))),u=(s-1)*i,l=(await this.ReturnOrder.find(t).select(Y).sort({createdAt:-1,code:-1
}).skip(u).limit(i).lean()).map(Q).filter(t=>"1"===String(e.includeZeroValue??e.showZero??"0")||F(t)),c=l.flatMap(e=>$e(e,{}));return{returnOrders:l,returns:l,rows:c,summary:B(c)}}
async listReturns(e={}){
const t=e=>Array.isArray(e)?e:h(e).split(",").map(e=>e.trim()).filter(Boolean),r=O([e.salesOrderId,e.orderId,e.salesOrderCode,e.orderCode,e.orderKey,...t(e.salesOrderIds||e.orderIds),...t(e.salesOrderCodes||e.orderCodes)])
;let n=null,a=[];if(r.length){const t=[],n=O(r.flatMap(M));for(const e of n)t.push({salesOrderId:e},{orderId:e},{salesOrderCode:e},{orderCode:e},{sourceOrderId:e},{
sourceOrderCode:e},{deliveryOrderId:e},{deliveryOrderCode:e},{id:e},{code:e});let a=[];if(t.length){let e=this.ReturnOrder.find({...ye(),$or:t})
;e&&"function"==typeof e.select&&(e=e.select(Y)),a=((e&&"function"==typeof e.lean?await e.lean():await e)||[]).map(Q).filter(F)}const o=ge(a,e)
;if(a.length&&!o.length&&Se(e))return{rows:[],returnOrdersRaw:[],summary:B([])};if(o.length){const e=o.flatMap(e=>$e(e,{}));return{rows:e,returnOrdersRaw:o,summary:B(e)}}return{
rows:[],returnOrdersRaw:[],summary:B([])}}{const t=await this.listReturnDocuments(e);if((t.rows||[]).length||e.deliveryStaffCode||e.delivery||e.date||e.deliveryDate)return{
rows:t.rows||[],returnOrdersRaw:t.returnOrders||[],summary:t.summary||B(t.rows||[])};n=await this.listOrders(e),a=n.rows||[]}const o=new Map,d=new Map;for(const e of a||[]){
for(const t of O([e.orderId,e.salesOrderId,e.id]))o.set(t,e);for(const t of O([e.orderCode,e.salesOrderCode,e.code]))d.set(t,e)}const s=await this.findReturnOrdersFor(a),i=[]
;for(const e of s||[]){
const t=o.get(h(e.salesOrderId||e.orderId||e.sourceOrderId||e.deliveryOrderId))||d.get(h(e.salesOrderCode||e.orderCode||e.sourceOrderCode||e.deliveryOrderCode))||{}
;i.push(...$e(e,t))}return{rows:i,returnOrdersRaw:s.map(Q),summary:B(i)}}async reconciliation(e={}){return(await this.listOrders(e)).reconciliation}}function je(e={}){return e}
module.exports={DeliveryEngine:Ue,buildDeliveryAssignment:je,buildCanonicalOrder:Me,buildOrderReconciliation:_e,summarizeOrders:ke,helpers:{text:h,unique:O,orderIdOf:te,
orderCodeOf:re,productCodeOf:se,returnMatchesOrder:De,buildOrderLookup:Ae,canonicalizeReturnDocument:Q,summarizeReturnRows:B}};
