/* GENERATED FILE — edit src/engines/delivery.legacy.engine.source/part-01.jsfrag, src/engines/delivery.legacy.engine.source/part-02.jsfrag, src/engines/delivery.legacy.engine.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const{toNumber:e,makeId:r}=require("../utils/common.util"),t=require("../utils/deliveryFinance.util"),n=require("../utils/date.util"),{normalizeDebtAmount:a}=require("../constants/finance.constants"),{SALES_STAFF_CODE_FIELDS:o,SALES_STAFF_NAME_FIELDS:d,DELIVERY_STAFF_CODE_FIELDS:s,DELIVERY_STAFF_NAME_FIELDS:i,USER_ACCOUNT_SALES_STAFF_CODE_FIELDS:l,USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS:u,pickSalesStaffCode:c,pickSalesStaffName:f,pickDeliveryStaffCode:m,pickDeliveryStaffName:y,pickUserAccountSalesStaffCode:C,pickUserAccountDeliveryStaffCode:v}=require("../domain/staff/staffIdentity")
;function h(e){return String(null==e?"":e).trim()}function S(e){return h(e).toLowerCase()}function O(e=[]){return[...new Set(e.map(h).filter(Boolean))]}function g(){
return n.todayVN?n.todayVN():(new Date).toISOString().slice(0,10)}function p(e){const r=Number(e||0);return Number.isFinite(r)?r:0}function N(e){
return S(e).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g," ").trim()}function A(e){return N(e).replace(/[^a-z0-9]/g,"")}function w(e){
return["1","true","yes","y"].includes(S(e))}function I(e={}){const r=e&&"object"==typeof e.status?e.status:{},t=S(e.accountingStatus||r.accountingStatus)
;return Boolean(e.accountingNeedsReconfirm||e.needReAccounting||e.reAccountingRequired||e.adminAdjustmentOpen)||["reopened","needs_reconfirm","needs_repost"].includes(t)}
function b(e={}){if(!e||I(e))return!1;const r=e&&"object"==typeof e.status?e.status:{},t=S(e.accountingStatus||r.accountingStatus)
;return Boolean(e.accountingConfirmed||e.accountingLocked||e.editLocked)||["confirmed","locked","posted","done"].includes(t)}function D(e){
return h(e).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function R(e){return h(e).replace(/^RO[-_]?/i,"")}function $(e){const r=R(e);return r?`RO-${r}`:""}function M(e){const r=h(e)
;return O([r,R(r),$(r)])}function k(e){return O(M(e).flatMap(e=>[e,A(e),R(e),A(R(e))]))}function _(r=[]){return Math.round((Array.isArray(r)?r:[]).reduce((r,t)=>{
const n=ue(t)||le(t),a=ce(t);return r+(n>0&&a>0?n*a:e(t.returnAmount??t.amount??0))},0))}function E(e=[]){return(Array.isArray(e)?e:[]).reduce((e,r)=>e+(ue(r)||le(r)),0)}
function Q(r={}){return _(Array.isArray(r.items)?r.items:[])>0||e(r.totalAmount??r.totalReturnAmount??r.amount??r.debtReduction)>0}function B(r={}){
const t=(Array.isArray(r.items)?r.items:[]).map(r=>{const t=ue(r)||le(r),n=ce(r),a=Math.round(t>0&&n>0?t*n:e(r.returnAmount??r.amount??0));return{...r,productCode:se(r),code:se(r),
productName:ie(r),name:ie(r),returnQty:t,qtyReturn:t,returnQuantity:t,returnedQty:t,quantity:t,qty:t,price:n,salePrice:n,unitPrice:n,returnAmount:a,amount:a}
}).filter(r=>r.productCode||r.productName||e(r.returnQty)>0),n=_(t)||Math.round(e(r.totalAmount??r.totalReturnAmount??r.amount??r.debtReduction)),a=E(t)||e(r.totalQuantity??r.quantity??r.qty),o=h(r.id||r.code||r._id),d=h(r.code||r.id||o)
;return{...r,id:o,code:d,salesOrderId:h(r.salesOrderId||r.orderId||r.sourceOrderId||r.deliveryOrderId),
salesOrderCode:h(r.salesOrderCode||r.orderCode||r.sourceOrderCode||r.deliveryOrderCode||R(d)),orderId:h(r.orderId||r.salesOrderId||r.sourceOrderId||r.deliveryOrderId),
orderCode:h(r.orderCode||r.salesOrderCode||r.sourceOrderCode||r.deliveryOrderCode||R(d)),items:t,returnItems:t,totalQuantity:a,totalAmount:n,totalReturnAmount:n,amount:n,
debtReduction:n}}function F(r=[]){return r.reduce((r,t)=>(r.returnQty+=e(t.returnQty??t.totalQuantity),r.amount+=e(t.amount??t.totalAmount??t.debtReduction),r),{returnQty:0,
amount:0})}function L(e={},r=[]){for(const t of r){const r=h(e[t]);if(r&&!["all","tat ca","tất cả","*"].includes(N(r)))return r}return""}function q(e={},r=[]){return r.flatMap(r=>{
const t=e[r];return Array.isArray(t)?t:[t]}).map(h).filter(Boolean)}function x(e={},r="",t=[]){const n=A(r),a=N(r);return!n&&!a||q(e,t).some(e=>{const r=A(e),t=N(e)
;return n&&r.includes(n)||a&&t.includes(a)})}
const K=["deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","shipperCode","shipperName","nvghCode","nvghName","staffDeliveryCode","staffDeliveryName"],T=["salesStaffCode","salesStaffName","salesmanCode","salesmanName","staffCode","staffName","saleCode","saleName","nvbhCode","nvbhName"]
;function P(e=[],r={}){
const t=L(r,["deliveryStaffCode","deliveryStaffName","deliveryStaff","deliveryStaffKeyword","deliveryCode","deliveryName","nvgh","nvghCode","nvghName"]),n=L(r,["salesStaffCode","salesStaffName","salesStaff","salesStaffKeyword","salesCode","salesName","nvbh","nvbhCode","nvbhName"])
;return e.filter(e=>!(t&&!x(e,t,K)||n&&!x(e,n,T)))}function V(e){const r=h(e);return r?O([r,r.toLowerCase(),r.toUpperCase()]):[]}function U(e){const r=h(e),t=A(r)
;return Boolean(t)&&t.length<=16&&!/\s/.test(r)}function j(e={},r=""){
const t=L(e,"delivery"===r?["deliveryStaffCode","deliveryCode","nvghCode","staffDeliveryCode"]:["salesStaffCode","salesmanCode","salesCode","nvbhCode"]),n=L(e,"delivery"===r?["deliveryStaffName","deliveryStaff","deliveryStaffKeyword","deliveryName","nvgh","nvghName"]:["salesStaffName","salesStaff","salesStaffKeyword","salesName","nvbh","nvbhName"]),a=t||(U(n)?n:"")
;if(a){const e=V(a);return{
$or:("delivery"===r?["deliveryStaffCode","deliveryCode","shipperCode","nvghCode","staffDeliveryCode"]:["salesStaffCode","salesmanCode","saleCode","nvbhCode"]).map(r=>({[r]:{$in:e}
}))}}if(n){const e=new RegExp(D(n),"i");return{
$or:("delivery"===r?["deliveryStaffName","deliveryName","shipperName","nvghName","staffDeliveryName"]:["salesStaffName","salesmanName","saleName","nvbhName"]).map(r=>({[r]:e}))}}
return null}function z(e=[],r={}){const t=j(r,"delivery"),n=j(r,"sales");t&&e.push(t),n&&e.push(n)}
const H=["id","code","orderCode","salesOrderId","salesOrderCode","date","orderDate","deliveryDate","createdAt","updatedAt","customerId","customerCode","customerName","customerPhone","customerAddress","phone","address","routeName","salesStaffCode","salesStaffName","salesmanCode","salesmanName","nvbhCode","nvbhName","deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","shipperCode","shipperName","nvghCode","nvghName","status","deliveryStatus","accountingStatus","accountingConfirmed","totalAmount","paidAmount","debtAmount","cashCollected","cashAmount","bankCollected","bankAmount","rewardAmount","returnAmount","returnedAmount","items","note","masterOrderId","masterOrderCode","masterOrderNo","deliveryMasterId","deliveryMasterCode","mergeStatus"].join(" "),Y=["id","code","date","documentDate","returnDate","deliveryDate","createdAt","updatedAt","salesOrderId","salesOrderCode","orderId","orderCode","sourceOrderId","sourceOrderCode","deliveryOrderId","deliveryOrderCode","masterOrderId","masterOrderCode","masterReturnOrderId","masterReturnOrderCode","customerCode","customerName","deliveryStaffCode","deliveryStaffName","deliveryCode","deliveryName","nvghCode","nvghName","salesStaffCode","salesStaffName","salesmanCode","salesmanName","nvbhCode","nvbhName","status","returnStatus","warehouseStatus","accountingStatus","returnMergeStatus","items","returnItems","totalQuantity","quantity","qty","totalAmount","totalReturnAmount","amount","debtReduction","note"].join(" ")
;function Z(e={}){return L(e,["deliveryStaffCode","deliveryCode","nvghCode","staffDeliveryCode"])}function G(e={}){
return Boolean(Z(e))&&!e.salesStaffCode&&!e.salesmanCode&&!e.salesCode&&!e.nvbhCode&&!e.salesman}function J(e){return{[e]:{$type:"string",$gt:""}}}function X(){return{
$or:[J("masterOrderId"),J("masterOrderCode")]}}function W(){return{$or:[J("masterOrderNo"),J("deliveryMasterId"),J("deliveryMasterCode")]}}function ee(e={}){return e.legacy?W():X()
}function re(e={}){return h(e.id||e.orderId||e.salesOrderId||e._id)}function te(e={}){return h(e.code||e.orderCode||e.salesOrderCode||e.displayOrderCode||e.id||e._id)}
function ne(e={}){const r=R(e.salesOrderCode||e.orderCode||e.code||e.displayOrderCode);if(r)return`code:${A(r)}`;const t=h(e.salesOrderId||e.orderId||e.id||e._id)
;return t?`id:${t}`:""}function ae(e){const r=S(e)
;return["deleted","removed","void","cancelled","canceled"].includes(r)?-1e3:["delivered","completed","done"].includes(r)?80:["assigned","shipping","pending_delivery"].includes(r)?40:0
}function oe(r={}){const t=r&&"object"==typeof r.status?r.status:{},n=Date.parse(r.updatedAt||r.modifiedAt||r.createdAt||"")||0,a=Array.isArray(r.items)?r.items.length:0
;return ae(r.deletedAt?"deleted":"")+ae(r.deliveryStatus||t.deliveryStatus||r.status)+(r.accountingConfirmed?20:0)+(r.stockPosted?10:0)+Math.min(a,50)+Math.min(Math.max(e(r.totalAmount||r.amount||r.debtAmount),0),1e9)/1e9+n/1e14
}function de(e=[]){const r=new Map,t=[];for(const n of Array.isArray(e)?e:[]){if(!n)continue;const e=ne(n);if(!e){t.push(n);continue}const a=r.get(e);(!a||oe(n)>=oe(a))&&r.set(e,n)
}return t.concat(Array.from(r.values()))}function se(e={}){return h(e.productCode||e.code||e.productId||e.sku||e.id||e._id)}function ie(e={}){
return h(e.productName||e.name||e.product||"")}function le(r={}){return e(r.deliveredQty??r.soldQty??r.quantitySold??r.orderQty??r.totalQty??r.qtySold??r.quantity??r.qty??0)}
function ue(r={}){return e(r.returnQty??r.qtyReturn??r.returnQuantity??r.returnedQty??r.quantityReturn??0)}function ce(r={}){
return e(r.price??r.salePrice??r.unitPrice??r.finalPrice??r.giaBan??0)}function fe(e={}){const r=new Map;for(const t of Array.isArray(e.items)?e.items:[]){const e=se(t)
;e&&!r.has(e)&&r.set(e,t)}return r}function me(e={},r={}){const t=se(e)||se(r),n=ue(e),a=ce(e)||ce(r),o=ie(e)||ie(r),d=Math.max(0,Math.round(n*a));return{...r,...e,
productId:h(e.productId||r.productId||t),productCode:t,code:t,productName:o,name:o,returnQty:n,qtyReturn:n,returnQuantity:n,returnedQty:n,price:a,salePrice:a,unitPrice:a,
returnAmount:d,amount:d}}function ye(){return{status:{$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}}}function Ce(){
return require("../domain/lifecycle/ReturnLifecycleService")}function ve(e,r){return r&&e&&"function"==typeof e.session?e.session(r):e}function he(e={}){
return h(e.actorDeliveryStaffCode||e.actorStaffCode||e.authenticatedStaffCode||"")}function Se(e={}){return Boolean(e&&e.enforceDeliveryOwnership)}function Oe(e={}){
return h(e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.shipperCode||e.driverCode||e.staffDeliveryCode)}function ge(e={},r={}){if(!Se(r))return!0;const t=he(r),n=Oe(e)
;return Boolean(t&&n&&A(n)===A(t))}function pe(e=[],r={}){return Se(r)?(Array.isArray(e)?e:[]).filter(e=>ge(e,r)):e}function Ne(e={},r={}){if(!Se(r))return;const t=he(r),n=Oe(e)
;if(!t){const e=new Error("Không xác định được mã nhân viên giao hàng đang đăng nhập");throw e.status=403,e.code="DELIVERY_ACTOR_REQUIRED",e}if(!n||A(n)!==A(t)){
const e=new Error("Đơn giao hàng không thuộc nhân viên đang đăng nhập");throw e.status=403,e.code="DELIVERY_ORDER_FORBIDDEN",e}}function Ae(e){const r=h(e);if(!r)return null
;const t=[{id:r},{code:r},{orderCode:r},{salesOrderId:r},{salesOrderCode:r}];return/^[a-f\d]{24}$/i.test(r)&&t.push({_id:r}),{$or:t}}function we(e){const r=h(e);if(!r)return[]
;const t=[],n=new Set,a=e=>{const r=JSON.stringify(e);n.has(r)||(n.add(r),t.push(e))};return/^SO[0-9A-Z_-]+$/i.test(r)?(a({id:r}),a({code:r}),a({orderCode:r}),a({salesOrderId:r}),
a({salesOrderCode:r}),t):(/^[a-f\d]{24}$/i.test(r)&&a({_id:r}),a({id:r}),a({code:r}),a({orderCode:r}),a({salesOrderId:r}),a({salesOrderCode:r}),t)}function Ie(e,r={}){
const t=Ae(e),n=void 0!==r.version&&null!==r.version&&""!==r.version,a=n?Number(r.version):0;return{$and:[t,n?{version:a}:{$or:[{version:{$exists:!1}},{version:0},{version:null}]}]
}}function be(e){if(e)return e;const r=new Error("Dữ liệu đơn đã thay đổi bởi thao tác khác. Vui lòng tải lại trước khi lưu.");throw r.status=409,r.code="ORDER_VERSION_CONFLICT",r}
function De(e={},r={}){
const t=O([re(r),r.salesOrderId,r.orderId,r.sourceOrderId,r.deliveryOrderId,te(r),r.salesOrderCode,r.orderCode,r.sourceOrderCode,r.deliveryOrderCode,r.id,r.code]).flatMap(k),n=O([e.salesOrderId,e.orderId,e.sourceOrderId,e.deliveryOrderId,e.salesOrderCode,e.orderCode,e.sourceOrderCode,e.deliveryOrderCode,e.id,e.code]).flatMap(k),a=new Set(n)
;return t.some(e=>a.has(e))}function Re(e=[]){const r=new Map;for(const t of e||[]){const e=S(t.status)
;if(!["cancelled","canceled","void","deleted"].includes(e))for(const e of Array.isArray(t.items)?t.items:[]){const t=se(e);if(!t)continue;const n=r.get(t)||{productCode:t,code:t,
productName:ie(e),name:ie(e),returnQty:0,qtyReturn:0,returnQuantity:0,returnedQty:0,price:ce(e),salePrice:ce(e),unitPrice:ce(e),returnAmount:0,amount:0
},a=ue(e)||le(e),o=ce(e)||n.price||0;n.productName=n.productName||ie(e),n.name=n.productName,n.returnQty+=a,n.qtyReturn=n.returnQty,n.returnQuantity=n.returnQty,
n.returnedQty=n.returnQty,n.price=o,n.salePrice=o,n.unitPrice=o,n.returnAmount=Math.round(n.returnQty*o),n.amount=n.returnAmount,r.set(t,n)}}return Array.from(r.values())}
function $e(r={},t={}){const n=h(r.status||r.returnStatus||"active"),a={returnOrderId:h(r.id||r._id),returnOrderCode:h(r.code||r.id),
salesOrderId:h(r.salesOrderId||r.orderId||t.salesOrderId||t.orderId),salesOrderCode:h(r.salesOrderCode||r.orderCode||t.salesOrderCode||t.orderCode),
orderId:h(r.orderId||r.salesOrderId||t.orderId||t.salesOrderId),orderCode:h(r.orderCode||r.salesOrderCode||t.orderCode||t.salesOrderCode),
customerCode:h(r.customerCode||t.customerCode),customerName:h(r.customerName||t.customerName),deliveryDate:h(r.deliveryDate||r.date||t.deliveryDate),status:n
},o=Array.isArray(r.items)?r.items:[];return o.length?o.map(r=>{const t=ue(r)||le(r),n=ce(r);return{...a,productCode:se(r),productName:ie(r),returnQty:t,price:n,
amount:Math.round(t>0&&n>0?t*n:e(r.returnAmount??r.amount??0))}}):[{...a,productCode:"",productName:"",returnQty:0,price:0,
amount:e(r.totalAmount||r.amount||r.totalReturnAmount||r.debtReduction)}]}function Me(r={},n=[]){
const o=Re(n),d=o.reduce((r,t)=>r+e(t.returnAmount||t.amount),0),s=t.buildCanonicalDeliveryOrder(r,{returnItems:o,returnAmountOverride:d}),i=s.amounts||{};return{...s,
orderId:re(r),orderCode:te(r),salesOrderId:h(r.salesOrderId||r.id||r._id),salesOrderCode:h(r.salesOrderCode||r.orderCode||r.code||te(r)),customerCode:h(r.customerCode),
customerName:h(r.customerName),deliveryDate:h(r.deliveryDate||r.date||r.documentDate),salesStaffCode:h(r.salesStaffCode||r.salesmanCode),
salesStaffName:h(r.salesStaffName||r.salesmanName),deliveryStaffCode:h(r.deliveryStaffCode),deliveryStaffName:h(r.deliveryStaffName),items:s.items,returnItems:o,returnOrders:n,
amounts:{receivable:e(i.receivable??i.totalReceivable),cash:e(i.cash??i.cashAmount),bank:e(i.bank??i.bankAmount),reward:e(i.reward??i.rewardAmount),returnAmount:e(i.returnAmount),
processed:e(i.processed),debt:a(i.debt??i.debtAmount)},reconciliation:ke(i),status:{deliveryStatus:h(r.deliveryStatus||r.status||"pending"),
paymentStatus:a(i.debt??i.debtAmount)<=0?"paid":(i.processed||0)>0?"partial":"unpaid",returnStatus:(i.returnAmount||0)>0?"has_return":"none",
accountingStatus:h(r.accountingStatus||"")}}}function ke(r={}){
const t=e(r.receivable??r.totalReceivable),n=e(r.cash??r.cashAmount),o=e(r.bank??r.bankAmount),d=e(r.reward??r.rewardAmount),s=e(r.returnAmount),i=a(r.debt??r.debtAmount),l=n+o+d+s+i,u=Math.round(t-l)
;return{receivable:t,cash:n,bank:o,reward:d,returnAmount:s,debt:i,processed:l,difference:u,balanced:Math.abs(u)<=1e3,
message:Math.abs(u)<=1e3?"Đối soát OK":`Chênh lệch ${u.toLocaleString("vi-VN")}`}}function _e(r=[]){return r.reduce((r,t)=>{const n=t.amounts||{}
;return r.receivable+=e(n.receivable),r.cash+=e(n.cash),r.bank+=e(n.bank),r.reward+=e(n.reward),r.returnAmount+=e(n.returnAmount),r.debt+=a(n.debt),r},{receivable:0,cash:0,bank:0,
reward:0,returnAmount:0,debt:0})}function Ee(e={}){return S((e.status&&"object"==typeof e.status?e.status:{}).deliveryStatus||e.deliveryStatus||e.status||"pending")}
function Qe(e={}){return["delivered","success","done","completed"].includes(Ee(e))}function Be(r=[],t={}){
const n=S(t.statusFilter||t.deliveryStatusFilter||t.orderStatusFilter||"all")
;return!n||["all","tat ca","tất cả","*"].includes(n)?r:["delivered","da giao","đã giao"].includes(n)?r.filter(Qe):["pending","not_delivered","not-delivered","chua giao","chưa giao"].includes(n)?r.filter(e=>!Qe(e)):["return","returns","has_return","tra hang","trả hàng"].includes(n)?r.filter(r=>e(r.amounts&&r.amounts.returnAmount)>0||e(r.returnAmount||r.returnTotal||r.totalReturnAmount)>0):["debt","cong no","công nợ"].includes(n)?r.filter(e=>a((e.amounts&&e.amounts.debt)??e.debtAmount??e.debt)>0):r
}class Fe{constructor(e={}){this.SalesOrder=e.SalesOrder,this.MasterOrder=e.MasterOrder,this.ReturnOrder=e.ReturnOrder,this.StockTransaction=e.StockTransaction,
this.ArLedger=e.ArLedger,this.User=e.User}staffCodeOf(e={},r="sales"){return h("delivery"===r?m(e)||v(e):c(e)||C(e))}staffNameOf(e={},r="sales"){return h("delivery"===r?y(e):f(e))}
staffRoleOk(e={},r=""){const t=N([e.role,e.type,e.position,e.department,e.roleLabel].filter(Boolean).join(" "))
;return!!("delivery"===r?Boolean(e.isDelivery||e.isDeliveryStaff||e.deliveryStaff):Boolean(e.isSalesman||e.isSalesStaff||e.salesStaff))||("delivery"===r?["delivery","shipper","nvgh","giao hang","giaohang"].some(e=>t.includes(N(e))):["sales","sale","nvbh","ban hang","banhang","salesman"].some(e=>t.includes(N(e))))
}orderStaffCode(e={},r=""){
return h("delivery"===r?e.deliveryStaffCode||e.shipperCode||e.driverCode||e.staffDeliveryCode:e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.saleCode||e.sellerCode)}
orderStaffName(e={},r=""){
return h("delivery"===r?e.deliveryStaffName||e.shipperName||e.driverName||e.staffDeliveryName:e.salesStaffName||e.salesmanName||e.nvbhName||e.saleName||e.sellerName)}
async buildStaffSystemIndex(e=[]){const r={byCode:new Map,byName:new Map};if(!this.User||!e.length)return r
;const t=O(e.flatMap(e=>[this.orderStaffCode(e,"sales"),this.orderStaffName(e,"sales"),this.orderStaffCode(e,"delivery"),this.orderStaffName(e,"delivery")])).filter(Boolean)
;if(!t.length)return r;const n=t.map(e=>new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,"i")),a=await this.User.find({isActive:{$ne:!1},$or:[...l.map(e=>({[e]:{$in:n}
})),...u.map(e=>({[e]:{$in:n}})),...d.map(e=>({[e]:{$in:n}})),...i.map(e=>({[e]:{$in:n}}))]
}).select("id code staffCode employeeCode salesStaffCode salesStaffName salesmanCode salesmanName deliveryStaffCode deliveryStaffName shipperCode shipperName maNhanVien name fullName role type position department roleLabel isSalesman isSalesStaff salesStaff isDelivery isDeliveryStaff deliveryStaff isActive").lean().catch(()=>[]),o=new Map,s=new Map
;for(const e of a||[]){
const r=this.staffCodeOf(e,"sales"),t=this.staffCodeOf(e,"delivery"),n=this.staffNameOf(e,"sales"),a=this.staffNameOf(e,"delivery"),d=O([r,t]).map(A).filter(Boolean),i=O([n,a]).map(N).filter(Boolean)
;for(const r of d)o.set(r,e);for(const r of i)s.set(r,e)}return{byCode:o,byName:s}}verifyAssignedStaff(e={},r={byCode:new Map,byName:new Map},t=""){
const n=this.orderStaffCode(e,t),a=this.orderStaffName(e,t),o="delivery"===t?"NVGH":"NVBH";let d=n?r.byCode.get(A(n)):null;!d&&a&&(d=r.byName.get(N(a)))
;const s=d?this.staffCodeOf(d,t):"",i=d?this.staffNameOf(d,t):"",l=Boolean(d&&n&&A(s)===A(n)),u=Boolean(d&&a&&N(i)===N(a)),c=Boolean(d&&this.staffRoleOk(d,t))
;let f=`${o} đúng mã hệ thống`
;return n||a?d?c?!l&&n&&(f=`${o} không khớp mã hệ thống`):f=`${o} có mã hệ thống nhưng sai vai trò`:f=`${o} không tồn tại trong mục Tài khoản/Hệ thống`:f=`Thiếu ${o}`,{type:t,
label:o,ok:Boolean(d&&c&&(l||!n&&u)),exists:Boolean(d),roleOk:c,codeMatches:l,nameMatches:u,assignedCode:n,assignedName:a,systemCode:s,systemName:i,message:f}}
async enrichStaffAssignment(e=[]){const r=await this.buildStaffSystemIndex(e);return e.map(e=>{
const t=this.verifyAssignedStaff(e,r,"sales"),n=this.verifyAssignedStaff(e,r,"delivery"),a=t.ok&&n.ok;return{...e,staffAssignment:{ok:a,sales:t,delivery:n},
staffAssignmentStatus:a?"valid":"warning",staffAssignmentMessage:a?"Đơn đã gán đúng NVBH/NVGH theo mã hệ thống":[t,n].filter(e=>!e.ok).map(e=>e.message).join("; ")}})}
async execSalesOrderFind(e={},{select:r=H,sort:t={},limit:n=1e3}={}){let a=this.SalesOrder.find(e);return a&&"function"==typeof a.select&&(a=a.select(r)),
a&&"function"==typeof a.sort&&(a=a.sort(t)),a&&"function"==typeof a.limit&&(a=a.limit(n)),a&&"function"==typeof a.lean?a.lean():a}async resolveSalesOrderByKnownCode(e,r={}){
const t=we(e);for(const e of t){let t=this.SalesOrder.findOne(e);t=ve(t,r.session),t&&"function"==typeof t.select&&(t=t.select(H))
;const n=t&&"function"==typeof t.lean?await t.lean():await t;if(n)return n}const n=Ae(e);if(!n)return null;let a=this.SalesOrder.findOne(n);return a=ve(a,r.session),
a&&"function"==typeof a.select&&(a=a.select(H)),a&&"function"==typeof a.lean?a.lean():a}async findOrders(e={}){
const r=h(e.date||e.deliveryDate||g()),t=N(e.status||e.deliveryStatus),n=N(e.q||e.keyword);let a=[]
;const o=Math.min(1e3,Math.max(1,Number(e.limit||1e3))),d=async(a,{fast:d=!1}={})=>{const s=(()=>{const n={};return r&&(n.deliveryDate=r),
t&&!["all","tat ca","tất cả","*"].includes(t)&&(n.deliveryStatus=h(e.status||e.deliveryStatus)),w(e.includeInactive)||w(e.showInactive)||(n.status={
$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}),n})(),i=[a];if(d){const r=Z(e);i.push({deliveryStaffCode:{$in:V(r)}})}else z(i,e);return((r=[])=>{
if(!n)return;const t=new RegExp(D(e.q||e.keyword),"i");r.push({$or:[{code:t},{orderCode:t},{salesOrderCode:t},{customerCode:t},{customerName:t}]})})(i),s.$and=i,
this.execSalesOrderFind(s,{sort:d?{deliveryDate:-1,deliveryStaffCode:1,customerName:1,code:1}:{deliveryStaffCode:1,customerName:1,code:1},limit:d?Math.min(300,o):o})}
;if(G(e)&&(a=await d(ee(),{fast:!0}),a.length||(a=await d(ee({legacy:!0}),{fast:!0}))),a.length||(a=await d(ee()),a.length||(a=await d(ee({legacy:!0})))),
!a.length&&r&&this.MasterOrder){const t=O(P(await this.MasterOrder.find({deliveryDate:r
}).select("id code deliveryDate deliveryStaffCode deliveryStaffName childOrderIds children").lean(),e).flatMap(e=>Array.isArray(e.childOrderIds)?e.childOrderIds:[]))
;t.length&&(a=await this.execSalesOrderFind({$or:[{id:{$in:t}},{code:{$in:t}}]},{limit:1e3}))}return a=P(a,e),
n&&(a=a.filter(e=>[e.code,e.orderCode,e.salesOrderCode,e.customerCode,e.customerName,e.salesStaffCode,e.salesStaffName,e.staffCode,e.staffName,e.deliveryStaffCode,e.deliveryStaffName].some(e=>N(e).includes(n)))),
de(a)}async findReturnOrdersFor(e=[],r={}){
const t=O(e.flatMap(e=>[re(e),e.id,e._id,e.salesOrderId,e.orderId,e.sourceOrderId,e.deliveryOrderId])),n=O(e.flatMap(e=>[te(e),e.code,e.orderCode,e.salesOrderCode,e.sourceOrderCode,e.deliveryOrderCode])),a=O(t.flatMap(M)),o=O(n.flatMap(M)),d=[]
;if(a.length&&d.push({salesOrderId:{$in:a}},{orderId:{$in:a}},{sourceOrderId:{$in:a}},{deliveryOrderId:{$in:a}},{id:{$in:a}}),o.length&&d.push({salesOrderCode:{$in:o}},{orderCode:{
$in:o}},{sourceOrderCode:{$in:o}},{deliveryOrderCode:{$in:o}},{code:{$in:o}},{id:{$in:o}}),!d.length)return[];let s=this.ReturnOrder.find({...ye(),$or:d});return s=ve(s,r.session),
s&&"function"==typeof s.select&&(s=s.select(Y)),(await s.lean()).map(B).filter(Q)}async getCanonicalOrderByKey(e,r={}){const t=await this.resolveSalesOrderByKnownCode(e,r)
;if(!t)return null;const n=await this.findReturnOrdersFor([t],r);return Me(t,n.filter(e=>De(e,t)))}async listOrders(e={}){
const r=de(await this.findOrders(e)),t=await this.findReturnOrdersFor(r);let n=r.map(e=>Me(e,t.filter(r=>De(r,e))));return n=de(Be(n,e)),
(w(e.checkStaffAssignment)||w(e.checkStaff)||w(e.staffCheck))&&(n=await this.enrichStaffAssignment(n)),{rows:n,summary:_e(n),reconciliation:this.reconcileRows(n)}}
normalizeReturnItems(e=[],r={}){const t=fe(r);return(Array.isArray(e)?e:[]).map(e=>{const r=se(e);return me(e,t.get(r)||{})}).filter(e=>e.productCode&&e.returnQty>0)}
async saveReturn(r={}){const t=arguments[1]||{},n=h(r.salesOrderId||r.orderId||r.salesOrderCode||r.orderCode),a=await this.resolveSalesOrderByKnownCode(n,t);if(!a){
const e=new Error("Không tìm thấy đơn giao hàng");throw e.status=404,e}Ne(a,r)
;const o=this.normalizeReturnItems(r.items,a),d=o.reduce((r,t)=>r+e(t.returnAmount||t.amount),0),s=`RO-${te(a).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,i={id:s,
code:s,salesOrderId:re(a),salesOrderCode:te(a),orderId:re(a),orderCode:te(a),customerId:h(a.customerId),customerCode:h(a.customerCode),customerName:h(a.customerName),
deliveryDate:h(a.deliveryDate||r.deliveryDate||g()),date:h(r.date||a.deliveryDate||g()),documentDate:h(r.documentDate||r.date||a.deliveryDate||g()),
deliveryStaffCode:h(a.deliveryStaffCode||r.deliveryStaffCode),deliveryStaffName:h(a.deliveryStaffName||r.deliveryStaffName),
salesStaffCode:h(a.salesStaffCode||a.salesmanCode||r.salesStaffCode),salesStaffName:h(a.salesStaffName||a.salesmanName||r.salesStaffName),
salesmanCode:h(a.salesmanCode||a.salesStaffCode||r.salesmanCode),salesmanName:h(a.salesmanName||a.salesStaffName||r.salesmanName),
staffCode:h(a.deliveryStaffCode||r.deliveryStaffCode),staffName:h(a.deliveryStaffName||r.deliveryStaffName),source:"canonical_delivery_engine",
refType:o.length?"canonicalDeliveryReturn":"canonicalDeliveryReturnClear",returnType:h(r.returnType||"partial")||"partial",returnStatus:o.length?"waiting_receive":"cancelled",
status:o.length?"waiting_receive":"cancelled",accountingConfirmed:!1,accountingStatus:o.length?"pending":"cancelled",items:o,totalQuantity:o.reduce((r,t)=>r+e(t.returnQty),0),
totalAmount:d,totalReturnAmount:d,amount:d,debtReduction:d,note:h(r.note)||(o.length?"Cập nhật hàng trả từ DeliveryEngine":"Xóa hàng trả về 0 từ DeliveryEngine"),
updatedAt:(new Date).toISOString(),clearedAt:o.length?"":(new Date).toISOString()},l=t.session?await Ce().createPendingReturn(i,t):await Ce().createPendingReturn(i);if(l&&l.error){
const e=new Error(l.error);throw e.status=l.status||400,e}const u=l&&l.returnOrder||l,c=await this.getCanonicalOrderByKey(re(a),t),f=$e(u,c||a);return{order:c,returnOrder:u,
returns:f,returnOrders:f,rows:f,message:o.length?"Đã lưu hàng trả":"Đã xóa hàng trả về 0"}}async savePayment(r={},t={}){
const n=h(r.salesOrderId||r.orderId||r.salesOrderCode||r.orderCode),a=await this.getCanonicalOrderByKey(n,t);if(!a){const e=new Error("Không tìm thấy đơn giao hàng")
;throw e.status=404,e}Ne(a,r);const o=b(a),d=I(a);if(o&&!d){const e=new Error("Đơn đã xác nhận kế toán, cần mở khóa admin trước khi sửa tiền");throw e.status=423,e}
const s=Math.max(0,p(r.cashAmount??r.cashCollected)),i=Math.max(0,p(r.bankAmount??r.bankCollected??r.transferAmount)),l=Math.max(0,p(r.rewardAmount??r.bonusAmount)),u=e(a.amounts&&a.amounts.returnAmount),c=e(a.amounts&&a.amounts.receivable),f=s+i+l+u
;if(f-c>1e3){const e=new Error(`Tổng thu/trả (${f.toLocaleString("vi-VN")}) vượt phải thu (${c.toLocaleString("vi-VN")})`);throw e.status=400,e}const m={type:"delivery_collection",
source:"DeliveryEngine",date:h(r.date||g()),cashAmount:s,bankAmount:i,rewardAmount:l,returnAmount:u,amount:s+i+l,salesOrderId:a.salesOrderId,salesOrderCode:a.salesOrderCode,
orderId:a.orderId,orderCode:a.orderCode,deliveryStaffCode:h(r.deliveryStaffCode||a.deliveryStaffCode),deliveryStaffName:h(r.deliveryStaffName||a.deliveryStaffName),
createdAt:(new Date).toISOString()},y={deliveryPayment:m,paymentAllocations:[m],deliveryPaymentSource:"DeliveryEngine",cashCollected:s,cashAmount:s,bankCollected:i,bankAmount:i,
transferAmount:i,rewardAmount:l,displayRewardAmount:l,paidAmount:s+i,collectedAmount:s+i,...d?{accountingConfirmed:!1,accountingLocked:!1,editLocked:!1,accountingNeedsReconfirm:!0,
needReAccounting:!0,reAccountingRequired:!0,adminAdjustmentOpen:!0,accountingStatus:"needs_reconfirm",arStatus:"needs_reconfirm",lifecycleStatus:"needs_reconfirm",
financialSyncStatus:"needs_reconfirm",arPostedAt:""}:{accountingStatus:a.accountingStatus||"pending_accounting"},updatedAt:(new Date).toISOString()
},C=be(await this.SalesOrder.findOneAndUpdate(Ie(n,a),{$set:y,$inc:{version:1}},{new:!0,lean:!0,session:t.session}));return{order:await this.getCanonicalOrderByKey(re(C),t),
allocation:m,message:"Đã lưu thu tiền"}}async confirm(e={},r={}){const t=h(e.salesOrderId||e.orderId||e.salesOrderCode||e.orderCode),n=await this.getCanonicalOrderByKey(t,r)
;if(!n){const e=new Error("Không tìm thấy đơn giao hàng");throw e.status=404,e}if(Ne(n,e),n.reconciliation&&!n.reconciliation.balanced){
const e=new Error(n.reconciliation.message||"Đơn chưa cân đối, không thể xác nhận giao");throw e.status=400,e}
const a=h(e.deliveryStatus||e.status||"delivered"),o=["delivered","success","done","completed"].includes(S(a)),d={deliveryStatus:o?"delivered":a,status:o?"delivered":a,
deliveryStaffCode:h(e.deliveryStaffCode||n.deliveryStaffCode),deliveryStaffName:h(e.deliveryStaffName||n.deliveryStaffName),staffCode:h(e.deliveryStaffCode||n.deliveryStaffCode),
staffName:h(e.deliveryStaffName||n.deliveryStaffName),deliveryNote:h(e.note||e.deliveryNote),deliveredAt:(new Date).toISOString(),updatedAt:(new Date).toISOString()
},s=be(await this.SalesOrder.findOneAndUpdate(Ie(t,n),{$set:d,$inc:{version:1}},{new:!0,lean:!0,session:r.session}));return{order:await this.getCanonicalOrderByKey(re(s),r),
message:"Đã xác nhận giao hàng"}}reconcileRows(e=[]){const r=_e(e),t=Math.round(r.receivable-r.cash-r.bank-r.reward-r.returnAmount-r.debt);return{...r,difference:t,
balanced:Math.abs(t)<=1e3,message:Math.abs(t)<=1e3?"Đối soát OK":`Chênh lệch ${t.toLocaleString("vi-VN")}`}}async listReturnDocuments(e={}){const r={...ye()
},t=[],n=h(e.dateFrom||e.fromDate||e.from||("today"===e.dateMode?e.date||g():"")),a=h(e.dateTo||e.toDate||e.to||("today"===e.dateMode?e.date||g():""));if(n||a){const e={}
;n&&(e.$gte=n),a&&(e.$lte=a),t.push({$or:[{date:e},{documentDate:e},{deliveryDate:e},{returnDate:e}]})}
const o=O([e.salesOrderId,e.orderId,e.salesOrderCode,e.orderCode,e.orderKey,e.code,e.id]);if(o.length){const e=O(o.flatMap(M));t.push({$or:[{salesOrderId:{$in:e}},{orderId:{$in:e}
},{sourceOrderId:{$in:e}},{deliveryOrderId:{$in:e}},{salesOrderCode:{$in:e}},{orderCode:{$in:e}},{sourceOrderCode:{$in:e}},{deliveryOrderCode:{$in:e}},{id:{$in:e}},{code:{$in:e}}]
})}if(e.masterOrderId&&(r.masterOrderId=h(e.masterOrderId)),e.masterOrderCode&&(r.masterOrderCode=h(e.masterOrderCode)),e.customerCode&&(r.customerCode=h(e.customerCode)),
e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.delivery){const r=new RegExp(D(e.deliveryStaffCode||e.deliveryCode||e.nvghCode||e.delivery),"i");t.push({$or:[{
deliveryStaffCode:r},{deliveryStaffName:r},{deliveryCode:r},{deliveryName:r},{nvghCode:r},{nvghName:r}]})}if(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.salesman){
const r=new RegExp(D(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.salesman),"i");t.push({$or:[{salesStaffCode:r},{salesStaffName:r},{salesmanCode:r},{salesmanName:r},{nvbhCode:r
},{nvbhName:r}]})}const d=h(e.q||e.keyword||e.search);if(d){const e=new RegExp(D(d),"i");t.push({$or:[{id:e},{code:e},{salesOrderCode:e},{orderCode:e},{customerCode:e},{
customerName:e},{deliveryStaffCode:e},{deliveryStaffName:e},{salesStaffCode:e},{salesStaffName:e},{salesmanCode:e},{salesmanName:e},{note:e}]})}t.length&&(r.$and=t)
;const s=Math.max(1,Number(e.page||1)),i=Math.min(500,Math.max(1,Number(e.limit||100))),l=(s-1)*i,u=(await this.ReturnOrder.find(r).select(Y).sort({createdAt:-1,code:-1
}).skip(l).limit(i).lean()).map(B).filter(r=>"1"===String(e.includeZeroValue??e.showZero??"0")||Q(r)),c=u.flatMap(e=>$e(e,{}));return{returnOrders:u,returns:u,rows:c,summary:F(c)}}
async listReturns(e={}){const r=O([e.salesOrderId,e.orderId,e.salesOrderCode,e.orderCode,e.orderKey]);let t=null,n=[];if(r.length){const a=[],o=O(r.flatMap(M))
;for(const e of o)a.push({salesOrderId:e},{orderId:e},{salesOrderCode:e},{orderCode:e},{sourceOrderId:e},{sourceOrderCode:e},{deliveryOrderId:e},{deliveryOrderCode:e},{id:e},{
code:e});const d=a.length?(await this.ReturnOrder.find({...ye(),$or:a}).select(Y).lean()).map(B).filter(Q):[],s=pe(d,e);if(d.length&&!s.length&&Se(e))return{rows:[],
returnOrdersRaw:[],summary:F([])};if(s.length){let e={};for(const t of r)if(e=await this.getCanonicalOrderByKey(t)||{},e&&(e.orderId||e.orderCode))break
;const t=s.flatMap(r=>$e(r,e));return{rows:t,returnOrdersRaw:s,summary:F(t)}}for(const t of r){const r=await this.getCanonicalOrderByKey(t);if(r&&ge(r,e)){n=[r];break}}
if(!n.length&&Se(e))return{rows:[],returnOrdersRaw:[],summary:F([])};t={rows:n}}else{const r=await this.listReturnDocuments(e)
;if((r.rows||[]).length||e.deliveryStaffCode||e.delivery||e.date||e.deliveryDate)return{rows:r.rows||[],returnOrdersRaw:r.returnOrders||[],summary:r.summary||F(r.rows||[])}
;t=await this.listOrders(e),n=t.rows||[]}const a=new Map,o=new Map;for(const e of n||[]){for(const r of O([e.orderId,e.salesOrderId,e.id]))a.set(r,e)
;for(const r of O([e.orderCode,e.salesOrderCode,e.code]))o.set(r,e)}const d=await this.findReturnOrdersFor(n),s=[];for(const e of d||[]){
const r=a.get(h(e.salesOrderId||e.orderId||e.sourceOrderId||e.deliveryOrderId))||o.get(h(e.salesOrderCode||e.orderCode||e.sourceOrderCode||e.deliveryOrderCode))||{}
;s.push(...$e(e,r))}return{rows:s,returnOrdersRaw:d.map(B),summary:F(s)}}async reconciliation(e={}){return(await this.listOrders(e)).reconciliation}}function Le(e={}){return e}
module.exports={DeliveryEngine:Fe,buildDeliveryAssignment:Le,buildCanonicalOrder:Me,buildOrderReconciliation:ke,summarizeOrders:_e,helpers:{text:h,unique:O,orderIdOf:re,
orderCodeOf:te,productCodeOf:se,returnMatchesOrder:De,buildOrderLookup:Ae,canonicalizeReturnDocument:B,summarizeReturnRows:F}};
