/* GENERATED FILE — edit src/services/returnOrderLegacy.service.source/part-01.jsfrag, src/services/returnOrderLegacy.service.source/part-02.jsfrag, src/services/returnOrderLegacy.service.source/part-03.jsfrag, src/services/returnOrderLegacy.service.source/part-04.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),t=require("../utils/queryGuard.util"),{escapeRegex:r}=require("../utils/query.util"),n=require("../repositories/returnOrderRepository"),d=require("../repositories/orderRepository"),a=require("../repositories/customerRepository"),{makeId:o,normalizeText:s,toNumber:u}=require("../utils/common.util"),{withMongoTransaction:i}=require("../utils/transaction.util"),c=require("../domain/posting/InventoryPostingService"),l=require("../engines/posting.engine"),m=require("./financialService"),y=require("./auditService"),f=require("../models/ReturnOrder"),C=require("../domain/lifecycle/ReturnStateMachine"),{RETURN_STATES:g}=C,{pickSalesStaffCode:I,pickSalesStaffName:p,pickDeliveryStaffCode:O,pickDeliveryStaffName:h}=require("../domain/staff/staffIdentity"),S=["draft","pending","active","waiting_receive","pending_warehouse_receive","merged","delivered","completed","has_return"]
;function R(e=[]){const t=e.reduce((e,t)=>{const r=String(t.code||"").match(/(\d+)$/);return Math.max(e,r?Number(r[1]):0)},0);return`THH${String(t+1).padStart(5,"0")}`}
function A(t={}){const r=[t.returnDate,t.date,t.documentDate,t.deliveryDate];for(const t of r){const r=e.toDateOnly(t||"");if(/^\d{4}-\d{2}-\d{2}$/.test(r))return r}return""}
function E(e){const t=A(e);return{...e,id:e.id||e.code,code:e.code||e.id,returnDate:t||e.returnDate||"",items:Array.isArray(e.items)?e.items:[],totalQuantity:u(e.totalQuantity),
totalAmount:u(e.totalAmount)}}function N(e={}){const t=String(e.status||"").toLowerCase()
;return["cancelled","canceled","void","deleted","removed","duplicate_cancelled","cleared"].includes(t)||Boolean(e.deletedAt)}function v(e={}){
return u(e.debtReduction??e.totalAmount??e.amount??e.totalValue)}function w(e={}){return v(e)>0}async function D(t={},r={}){const d=v(t);if(!t||d<=0)return{entry:null,returnOrder:t
};C.assertCanPostAR(t);const a=await l.postReturnOrderAR({...t,debtReduction:d,amount:d,totalReturnAmount:d,source:"returnOrders",accountingConfirmed:!0,
accountingStatus:g.ACCOUNTING_CONFIRMED},{...r,skipIfExists:!0});if(!a)return{entry:null,returnOrder:t};const o=C.patchForState(t,g.POSTED_TO_AR),s={...t,...o,
returnState:g.POSTED_TO_AR,stateChangedAt:e.nowIso(),arLedgerId:a.id||a.code||t.arLedgerId||""};return await n.upsert(s,r),{entry:a,returnOrder:s}}function _(e=[]){
return[...new Set((e||[]).map(e=>String(e||"").trim()).filter(Boolean))]}function T(e={}){
const t=String(e.id||"").trim(),r=String(e.code||"").trim(),n=String(e.salesOrderId||e.orderId||e.sourceOrderId||e.deliveryOrderId||"").trim(),d=String(e.salesOrderCode||e.orderCode||e.sourceOrderCode||e.deliveryOrderCode||"").trim(),a=[]
;return t&&a.push({id:t}),r&&a.push({code:r}),n&&(a.push({salesOrderId:n}),a.push({orderId:n}),a.push({sourceOrderId:n}),a.push({deliveryOrderId:n})),d&&(a.push({salesOrderCode:d
}),a.push({orderCode:d}),a.push({sourceOrderCode:d}),a.push({deliveryOrderCode:d})),a.length?{$or:a}:null}function M(e={},t={}){
return String(e.code||e.orderCode||e.salesOrderCode||t.salesOrderCode||t.orderCode||t.code||"").trim()}function q(e={},t={}){
return String(e.id||e._id||t.salesOrderId||t.orderId||t.id||"").trim()}function L(e={},t={}){const r=M(e,t);if(!r)return"";const n=String(r).replace(/^RO[-_]?/i,"").trim()
;return n?`RO-${n}`:""}function $({salesOrderId:e="",salesOrderCode:t="",returnCode:r=""}={}){const n=[];return r&&(n.push({code:r}),n.push({id:r})),e&&(n.push({salesOrderId:e}),
n.push({orderId:e}),n.push({sourceOrderId:e}),n.push({deliveryOrderId:e})),t&&(n.push({salesOrderCode:t}),n.push({orderCode:t}),n.push({sourceOrderCode:t}),n.push({
deliveryOrderCode:t}),n.push({code:`RO-${String(t).replace(/^RO[-_]?/i,"")}`})),n.length?{$or:n,status:{$nin:["deleted"]}}:null}function Q(e={},t=""){
const r=String(e.status||e.returnStatus||"").toLowerCase();let n=0;return!t||String(e.code||"")!==t&&String(e.id||"")!==t||(n+=1e3),String(e.code||"").startsWith("RO-")&&(n+=200),
String(e.id||"").startsWith("RO-")&&(n+=100),["waiting_receive","pending","draft","active","has_return"].includes(r)&&(n+=80),"cleared"===r&&(n+=40),
String(e.id||"").startsWith("RO-DRAFT-")&&(n+=10),String(e.id||"").startsWith("RO-MOBILE-")&&(n-=20),String(e.code||"").startsWith("THH")&&(n-=80),
["cancelled","canceled","cleared","void","deleted","removed","duplicate_cancelled"].includes(r)&&(n-=500),n}
async function k({salesOrderId:e="",salesOrderCode:t="",returnCode:r=""}={}){const d=$({salesOrderId:e,salesOrderCode:t,returnCode:r});return d&&(await n.findAll(d,{sort:{
createdAt:1},limit:50})||[]).filter(e=>e&&!N(e)).sort((e,t)=>Q(t,r)-Q(e,r))[0]||null}
async function V({keepId:t,keepCode:r="",salesOrderId:d="",salesOrderCode:a="",returnCode:o=""}={}){const s=$({salesOrderId:d,salesOrderCode:a,returnCode:o});if(!s)return{
cancelled:0};const u=await n.findAll(s,{sort:{createdAt:1},limit:100}),i=e.nowIso();let c=0;for(const e of u||[]){if(!e)continue
;if(t&&String(e._id||e.id||"")===String(t)||r&&(String(e.code||"")===String(r)||String(e.id||"")===String(r)))continue;const d=String(e.status||"").toLowerCase()
;["deleted","duplicate_cancelled"].includes(d)||"merged"===(e.returnMergeStatus||"unmerged")||e.masterReturnOrderId||e.masterReturnOrderCode||U(e.status)||"received"===String(e.warehouseReceiveStatus||"").toLowerCase()||(await n.upsert({
...e,status:"duplicate_cancelled",returnStatus:"duplicate_cancelled",warehouseReceiveStatus:"duplicate_cancelled",accountingStatus:"duplicate_cancelled",items:[],amount:0,
totalAmount:0,totalQuantity:0,debtReduction:0,totalReturnAmount:0,duplicateReason:"Trùng phiếu trả cùng salesOrderId/salesOrderCode",updatedAt:i}),c+=1)}return{cancelled:c}}
async function P(e=[],t={}){const r=[],d=[];for(const t of e||[])r.push(t?.salesOrderId,t?.orderId,t?.sourceOrderId,t?.deliveryOrderId,t?.id,t?._id),
d.push(t?.salesOrderCode,t?.orderCode,t?.sourceOrderCode,t?.deliveryOrderCode,t?.code);const a=_(r),o=_(d),s=[];return a.length&&(s.push({salesOrderId:{$in:a}}),s.push({orderId:{
$in:a}}),s.push({sourceOrderId:{$in:a}}),s.push({deliveryOrderId:{$in:a}})),o.length&&(s.push({salesOrderCode:{$in:o}}),s.push({orderCode:{$in:o}}),s.push({sourceOrderCode:{$in:o}
}),s.push({deliveryOrderCode:{$in:o}})),s.length?n.findAll({$or:s},{...t,projection:{id:1,code:1,salesOrderId:1,salesOrderCode:1,orderId:1,orderCode:1,sourceOrderId:1,
sourceOrderCode:1,deliveryOrderId:1,deliveryOrderCode:1,masterOrderId:1,masterOrderCode:1,masterReturnOrderId:1,masterReturnOrderCode:1,customerId:1,customerCode:1,customerName:1,
salesStaffId:1,salesStaffCode:1,salesStaffName:1,salesmanCode:1,salesmanName:1,deliveryStaffId:1,deliveryStaffCode:1,deliveryStaffName:1,staffCode:1,staffName:1,items:1,
totalQuantity:1,totalAmount:1,amount:1,debtReduction:1,status:1,returnStatus:1,returnMergeStatus:1,warehouseReceiveStatus:1,date:1,documentDate:1,deliveryDate:1,routeName:1,
deliveryRoute:1,createdAt:1,updatedAt:1}}):[]}function F(e={},t=null,r=null){const n=L(r||{},e||{});return String(n||t?.code||e.code||`THH${o("")}`).trim()}async function G(t={}){
const d={status:{$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}
},a=[],o=e.toDateOnly(t.dateFrom||t.fromDate||t.from||""),s=e.toDateOnly(t.dateTo||t.toDate||t.to||t.date||""),u=e.toDateOnly(t.date||""),i=Boolean(o||s||u);if(o&&s&&o>s){
const e=new Error("Từ ngày không được lớn hơn đến ngày");throw e.status=400,e.code="INVALID_RETURN_ORDER_DATE_RANGE",e}if(i){const e=u||{...o?{$gte:o}:{},...s?{$lte:s}:{}};a.push({
$or:[{returnDate:e},{date:e},{documentDate:e},{deliveryDate:e}]})}const c=_([t.salesOrderId,t.orderId,t.salesOrderCode,t.orderCode,t.orderKey,t.code,t.id]);c.length&&a.push({$or:[{
salesOrderId:{$in:c}},{orderId:{$in:c}},{sourceOrderId:{$in:c}},{deliveryOrderId:{$in:c}},{salesOrderCode:{$in:c}},{orderCode:{$in:c}},{sourceOrderCode:{$in:c}},{
deliveryOrderCode:{$in:c}},{id:{$in:c}},{code:{$in:c}}]}),t.masterOrderId&&(d.masterOrderId=String(t.masterOrderId).trim()),
t.masterOrderCode&&(d.masterOrderCode=String(t.masterOrderCode).trim()),t.customerCode&&(d.customerCode=String(t.customerCode).trim())
;const l=String(t.deliveryStaffCode||t.deliveryCode||t.nvghCode||t.delivery||"").trim();if(l){const e=new RegExp(r(l),"i");a.push({$or:[{deliveryStaffCode:e},{deliveryStaffName:e
},{deliveryCode:e},{deliveryName:e},{nvghCode:e},{nvghName:e}]})}const m=String(t.salesStaffCode||t.salesmanCode||t.nvbhCode||t.salesman||"").trim();if(m){
const e=new RegExp(r(m),"i");a.push({$or:[{salesStaffCode:e},{salesStaffName:e},{salesmanCode:e},{salesmanName:e},{nvbhCode:e},{nvbhName:e}]})}
const y=String(t.q||t.keyword||t.search||"").trim();if(y){const e=new RegExp(r(y),"i");a.push({$or:[{id:e},{code:e},{salesOrderCode:e},{orderCode:e},{customerCode:e},{
customerName:e},{deliveryStaffCode:e},{deliveryStaffName:e},{salesStaffCode:e},{salesStaffName:e},{note:e}]})}a.length&&(d.$and=a)
;const f=Math.max(1,Number(t.page||1)),C=Math.min(500,Math.max(1,Number(t.limit||100))),g=await n.findAll(d,{sort:{createdAt:-1,code:-1},skip:(f-1)*C,limit:C
}),I="1"===String(t.includeZeroValue??t.showZero??"0"),p=new Set;return g.map(E).filter(t=>!i||e.isDateInRange(A(t),{date:u,dateFrom:o,dateTo:s})).filter(e=>I||w(e)).filter(e=>{
const t=String(e.id||e.code||e._id||"").trim();return!t||!p.has(t)&&(p.add(t),!0)})}async function b(e={}){
const t=String(e.salesOrderId||e.salesOrderCode||e.orderId||e.orderCode||"").trim();return t?d.findByIdOrCode(t):null}async function B(e={},t=null){
const r=String(e.customerId||e.customerCode||e.customerName||t?.customerId||t?.customerCode||"").trim();return r?a.findByIdOrCode(r):null}function W(e=[],t=null){
const r=new Map((t?.items||[]).map(e=>[String(e.productCode||e.code||e.productId||"").trim(),e]));return(Array.isArray(e)?e:[]).map(e=>{
const t=String(e.productCode||e.code||e.productId||"").trim(),n=r.get(t)||{},d=u(e.qtyReturn??e.returnQuantity??e.returnedQty??e.returnQty??e.quantity??e.qty),a=u(e.price??e.salePrice??e.unitPrice??n.price??n.salePrice??0)
;return{...n,...e,productId:e.productId||n.productId||t,productCode:t||n.productCode||n.code||"",productName:e.productName||e.name||n.productName||n.name||"",quantity:d,qty:d,
price:a,salePrice:a,amount:u(e.amount??d*a)}}).filter(e=>e.quantity>0||e.productCode||e.productName)}async function x(e={}){
const t=await b(e).catch(()=>null),r=q(t||{},e||{}),d=M(t||{},e||{}),a=L(t||{},{...e,salesOrderCode:d}),o=await k({salesOrderId:r,salesOrderCode:d,returnCode:a});if(o)return o
;const s=T(e);return s&&(await n.findAll(s,{sort:{updatedAt:-1,createdAt:-1},limit:20})).find(e=>!N(e))||null}async function K(t={}){const r=T(t);if(!r)return{returnOrder:null,
cleared:0,rows:[]};const d=await n.findAll(r,{sort:{updatedAt:-1,createdAt:-1},limit:50
}),a=e.nowIso(),o=String(t.note||"NVGH sửa số lượng hàng trả về 0 trên app giao hàng").trim(),s=(d||[]).filter(e=>!(!e||N(e)||"merged"===(e.returnMergeStatus||"unmerged")||e.masterReturnOrderId||e.masterReturnOrderCode||U(e.status)))
;let u=null;for(const e of s){const r={...e,items:[],totalQuantity:0,totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0,status:"cleared",returnStatus:"cleared",
accountingStatus:"cleared",warehouseReceiveStatus:"cleared",refType:e.refType||t.refType||"mobileDeliveryReturnClear",note:o,clearedAt:a,postedAt:"",receivedAt:"",updatedAt:a}
;await n.upsert(r),u=r}return{returnOrder:u?E(u):null,cleared:s.length,rows:s}}function U(e=""){const t=C.normalizeReturnState(e)
;return[g.RECEIVED,g.ACCOUNTING_CONFIRMED,g.POSTED_TO_AR].includes(t)}function H(e=""){const t=C.normalizeReturnState(e);return[g.DRAFT,g.WAITING_RECEIVE].includes(t)}
function z(e={}){try{return C.assertCanEdit(e),!0}catch(e){return!1}}function j(e={},t=""){try{return C.assertCanEdit(e),null}catch(e){return{error:t||e.message,message:e.message,
code:e.code,status:400}}}function Z(e={}){try{return C.assertCanCancel(e),null}catch(e){return{error:e.message,code:e.code,status:400}}}function J(e={}){try{
return C.assertCanCancel(e),!1}catch(e){return!0}}function X(e={},t="Khách lấy lại hàng"){return String(e.cancelReason||e.reason||e.note||t).trim()}
async function Y(t=null,r={},n={}){if(!t||!t.id&&!t.code)return null;const a={...t,...r,updatedAt:e.nowIso()};return await d.upsert(a,n),a}async function ee(e,t=null,r=null,n=""){
await y.log(e,{refType:"returnOrder",refId:(r||t||{}).id||"",refCode:(r||t||{}).code||"",before:t,after:r,note:n})}async function te(t={}){const r=await b(t),n=await B(t,r)
;if(!n&&!t.customerName&&!r?.customerName)return{error:"Không tìm thấy khách hàng",status:404};const d=W(t.items,r).filter(e=>u(e.quantity)>0);if(!d.length)return{
error:"Phiếu trả hàng chưa có dòng hàng",status:400};const a=String(t.source||t.refType||"").toLowerCase()
;if((["mobileDeliveryReturn","erpDeliveryReturn"].includes(String(t.refType||""))||"returnOrders"===String(t.source||"")||a.includes("mobile_delivery")||a.includes("mobiledelivery"))&&!String(t.salesOrderId||"").trim()&&!String(t.salesOrderCode||"").trim())return{
error:"Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả",status:400};const s=await x(t),i=u(t.totalAmount??d.reduce((e,t)=>e+u(t.amount),0)),c=fe(t,r||{},s||{});return{
returnOrder:{...s||{},...t,id:String(L(r||{},t)||s?.id||t.id||o("RO")).trim(),code:F(t,s,r),date:c,documentDate:c,deliveryDate:c,
salesOrderId:r?.id||t.salesOrderId||t.orderId||s?.salesOrderId||"",salesOrderCode:r?.code||t.salesOrderCode||t.orderCode||s?.salesOrderCode||"",
orderId:r?.id||t.orderId||t.salesOrderId||s?.orderId||s?.salesOrderId||"",orderCode:r?.code||t.orderCode||t.salesOrderCode||s?.orderCode||s?.salesOrderCode||"",
customerId:n?.id||t.customerId||r?.customerId||s?.customerId||"",customerCode:n?.code||t.customerCode||r?.customerCode||s?.customerCode||"",
customerName:n?.name||t.customerName||r?.customerName||s?.customerName||"",salesStaffId:r?.salesStaffId||t.salesStaffId||s?.salesStaffId||"",salesStaffCode:I(r)||I(t)||I(s),
salesStaffName:p(r)||p(t)||p(s),salesmanCode:I(r)||I(t)||I(s),salesmanName:p(r)||p(t)||p(s),deliveryStaffId:r?.deliveryStaffId||t.deliveryStaffId||s?.deliveryStaffId||"",
deliveryStaffCode:O(r)||O(t)||O(s),deliveryStaffName:h(r)||h(t)||h(s),staffCode:O(r)||O(t)||O(s),staffName:h(r)||h(t)||h(s),note:String(t.note??s?.note??"").trim(),items:d,
totalQuantity:u(t.totalQuantity??d.reduce((e,t)=>e+u(t.quantity),0)),totalAmount:i,amount:u(t.amount??i),debtReduction:u(t.debtReduction??i),
status:t.status||s?.status||g.WAITING_RECEIVE,returnMergeStatus:t.returnMergeStatus||s?.returnMergeStatus||"unmerged",
warehouseReceiveStatus:t.warehouseReceiveStatus||s?.warehouseReceiveStatus||(U(t.status)?g.RECEIVED:g.WAITING_RECEIVE),source:t.source||s?.source||"returnOrders",
accountingStatus:t.accountingStatus||s?.accountingStatus||"",accountingConfirmed:Boolean(t.accountingConfirmed??s?.accountingConfirmed??!1),
createdAt:s?.createdAt||t.createdAt||e.nowIso(),updatedAt:e.nowIso()},existing:s}}async function re(e={}){const t=await te({...e,status:e.status||g.WAITING_RECEIVE,
warehouseReceiveStatus:e.warehouseReceiveStatus||g.WAITING_RECEIVE});if(t.error)return t;const{returnOrder:r,existing:d}=t;let a=null;return await i(async t=>{
d&&U(d.status)&&(await c.reverseMovement(d,{type:"RETURN",reverseType:"RETURN_UPDATE_REVERSAL",direction:"IN",refType:"RETURN_ORDER",refId:d.id||d.code,refCode:d.code||d.id,
date:d.date,note:"Đảo nhập kho phiếu trả hàng trước khi cập nhật"},{session:t}),await l.reverseReturnOrderAR(d,{session:t}));const o={...r,...C.patchForState(r,g.RECEIVED),
returnState:g.RECEIVED},s={...o,...C.patchForState(o,g.ACCOUNTING_CONFIRMED),returnState:g.ACCOUNTING_CONFIRMED,accountingConfirmedBy:e.confirmedBy||e.user||"system",
accountingNote:e.note||r.accountingNote||""};await n.upsert(s,{session:t}),await c.postReturnIn(o,{session:t});const u=await D(s,{session:t});a=u.returnOrder||s}),{
returnOrder:E(a||{...r,...C.patchForState(r,g.POSTED_TO_AR)}),updatedExisting:Boolean(d)}}function ne(e=[],t=null){
const r=new Map((t?.items||[]).map(e=>[String(e.productCode||e.code||e.productId||"").trim(),e]));return(Array.isArray(e)?e:[]).map(e=>{
const t=String(e.productCode||e.code||e.productId||"").trim(),n=r.get(t)||{},d=u(e.qtyReturn??e.returnQty??e.returnQuantity??e.returnedQty??e.quantity??e.qty??0),a=u(e.price??e.salePrice??e.unitPrice??n.price??n.salePrice??n.unitPrice??0)
;return{...n,...e,productId:e.productId||n.productId||t,productCode:t||n.productCode||n.code||"",productName:e.productName||e.name||n.productName||n.name||"",quantity:d,qty:d,
qtyReturn:d,returnQty:d,returnQuantity:d,returnedQty:d,price:a,salePrice:a,unitPrice:a,amount:Math.round(u(e.amount??d*a)),reason:e.reason||""}
}).filter(e=>e.productCode&&u(e.qtyReturn)>0)}async function de(t={},r={}){const d=await b(t),a=q(d||{},t||{}),s=M(d||{},t||{});if(!a&&!s)return{
error:"Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả",status:400};const i=L(d||{},{...t,salesOrderCode:s}),c=await B(t,d)
;if(!c&&!t.customerName&&!d?.customerName)return{error:"Không tìm thấy khách hàng",status:404};const l=await k({salesOrderId:a,salesOrderCode:s,returnCode:i})
;if(l&&("merged"===(l.returnMergeStatus||"unmerged")||l.masterReturnOrderId||l.masterReturnOrderCode))return{
error:"Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng",status:400};if(l){const e=j(l,"Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng")
;if(e)return e}const m=ne(t.items,d),y=m.reduce((e,t)=>e+u(t.qtyReturn),0),f=m.reduce((e,t)=>e+u(t.amount??u(t.qtyReturn)*u(t.price||t.salePrice||t.unitPrice)),0),C=e.nowIso(),S={
...l||{},...t,id:i||l?.id||t.id||o("RO"),code:i||l?.code||t.code||o("RO"),date:e.toDateOnly(t.date||t.documentDate||l?.date||d?.deliveryDate||e.todayVN()),
documentDate:e.toDateOnly(t.documentDate||t.date||l?.documentDate||d?.date||e.todayVN()),
deliveryDate:e.toDateOnly(t.deliveryDate||d?.deliveryDate||l?.deliveryDate||t.date||e.todayVN()),salesOrderId:a,salesOrderCode:s,orderId:a,orderCode:s,
customerId:c?.id||t.customerId||d?.customerId||l?.customerId||"",customerCode:c?.code||t.customerCode||d?.customerCode||l?.customerCode||"",
customerName:c?.name||t.customerName||d?.customerName||l?.customerName||"",salesStaffId:d?.salesStaffId||t.salesStaffId||l?.salesStaffId||"",salesStaffCode:I(d)||I(t)||I(l),
salesStaffName:p(d)||p(t)||p(l),salesmanCode:I(d)||I(t)||I(l),salesmanName:p(d)||p(t)||p(l),deliveryStaffId:d?.deliveryStaffId||t.deliveryStaffId||l?.deliveryStaffId||"",
deliveryStaffCode:O(d)||O(t)||O(l),deliveryStaffName:h(d)||h(t)||h(l),staffCode:O(d)||O(t)||O(l),staffName:h(d)||h(t)||h(l),items:y>0?m:[],totalQuantity:y>0?y:0,
totalAmount:y>0?f:0,amount:y>0?f:0,debtReduction:y>0?f:0,totalReturnAmount:y>0?f:0,status:y>0?g.WAITING_RECEIVE:g.CANCELLED,returnStatus:y>0?g.WAITING_RECEIVE:g.CANCELLED,
returnState:y>0?g.WAITING_RECEIVE:g.CANCELLED,returnMergeStatus:l?.returnMergeStatus||t.returnMergeStatus||"unmerged",warehouseReceiveStatus:y>0?g.WAITING_RECEIVE:g.CANCELLED,
source:t.source||l?.source||"mobile_delivery",accountingStatus:y>0?"pending":g.CANCELLED,accountingConfirmed:!1,postedAt:"",receivedAt:"",note:String(t.note??l?.note??"").trim(),
clearedAt:y>0?"":C,updatedAt:C,createdAt:l?.createdAt||t.createdAt||C};return await n.upsert(S,r),await V({keepId:l?._id||S.id,keepCode:S.code,salesOrderId:a,salesOrderCode:s,
returnCode:S.code}),{returnOrder:E(await k({salesOrderId:a,salesOrderCode:s,returnCode:S.code})||S),updatedExisting:Boolean(l),canonicalCode:S.code}}async function ae(e={},t={}){
const r=await te({...e,status:e.status||g.WAITING_RECEIVE,returnMergeStatus:e.returnMergeStatus||"unmerged",warehouseReceiveStatus:e.warehouseReceiveStatus||g.WAITING_RECEIVE})
;if(r.error)return r;const{returnOrder:d,existing:a}=r
;if((u(d.totalQuantity??0)||(Array.isArray(d.items)?d.items.reduce((e,t)=>e+u(t.returnQty??t.qtyReturn??t.returnQuantity??t.quantity??t.qty??0),0):0))<=0){const e=await K(d)
;return{returnOrder:e.returnOrder||E({...d,items:[],totalQuantity:0,totalAmount:0,amount:0,debtReduction:0,status:g.CANCELLED,returnStatus:g.CANCELLED,returnState:g.CANCELLED,
warehouseReceiveStatus:g.CANCELLED,accountingStatus:g.CANCELLED}),updatedExisting:e.cleared>0,cleared:e.cleared,skippedCreate:e.cleared<=0}}
if(a&&("merged"===(a.returnMergeStatus||"unmerged")||a.masterReturnOrderId||a.masterReturnOrderCode))return{error:"Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng",
status:400};if(a){const e=j(a,"Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng");if(e)return e}const o={...d,...C.patchForState(d,g.WAITING_RECEIVE),
returnState:g.WAITING_RECEIVE,returnMergeStatus:"unmerged",postedAt:"",receivedAt:""};return await n.upsert(o,t),{returnOrder:E({...o,status:g.WAITING_RECEIVE,
warehouseReceiveStatus:g.WAITING_RECEIVE}),updatedExisting:Boolean(a)}}async function oe(t,r={}){const d=r.session,a=await n.findByIdOrCode(t,{session:d});if(!a)return{
error:"Không tìm thấy phiếu trả hàng",status:404};const o=C.getReturnState(a);if(o===g.RECEIVED||o===g.ACCOUNTING_CONFIRMED||o===g.POSTED_TO_AR)return{returnOrder:E(a),
alreadyReceived:!0};try{C.assertTransition(a,g.RECEIVED,"confirm_receive")}catch(e){return{error:e.message,code:e.code,status:400}}const s={...a,...C.patchForState(a,g.RECEIVED),
returnState:g.RECEIVED,receivedBy:String(r.receivedBy||a.receivedBy||"").trim(),stateChangedAt:e.nowIso(),updatedAt:e.nowIso()};return await n.upsert(s,{session:d}),
await c.postReturnIn(s,{session:d}),{returnOrder:E(s),alreadyReceived:!1}}async function se(e,t={}){return t.session?oe(e,t):i(r=>oe(e,{...t,session:r}))}
async function ue(t,r={},d={}){const a=await n.findByIdOrCode(t);if(!a)return{error:"Không tìm thấy phiếu trả hàng",status:404};try{C.assertCanConfirmAccounting(a)}catch(e){return{
error:e.message,code:e.code,status:400}}let o=null;return await i(async t=>{const s={...a,...C.patchForState(a,g.ACCOUNTING_CONFIRMED),returnState:g.ACCOUNTING_CONFIRMED,
accountingConfirmedBy:r.confirmedBy||r.user||d.user?.code||"system",accountingNote:r.note||a.accountingNote||"",stateChangedAt:e.nowIso(),updatedAt:e.nowIso()}
;C.assertTransition(a,g.ACCOUNTING_CONFIRMED,"confirm_accounting"),await n.upsert(s,{session:t});const u=await D(s,{session:t});o=u.returnOrder||s}),{returnOrder:E(o)}}
function ie(e={}){return[String(e.productCode||e.code||e.productId||"").trim(),String(e.unit||e.baseUnit||"").trim(),String(u(e.price??e.salePrice??e.unitPrice??0))].join("|")}
function ce(e={},t={}){
const r=u(e.quantity??e.qty??e.totalQty??e.soldQty??0),n=u(e.price??e.salePrice??e.unitPrice??t.price??t.salePrice??0),d=u(t.returnQty??t.qtyReturn??t.returnQuantity??t.quantity??0)
;return{...t,productId:e.productId||t.productId||e.productCode||e.code||"",productCode:String(e.productCode||e.code||e.productId||t.productCode||"").trim(),
productName:String(e.productName||e.name||t.productName||"").trim(),unit:String(e.unit||e.baseUnit||t.unit||"").trim(),soldQty:r,price:n,salePrice:n,unitPrice:n,
soldAmount:Math.round(r*n),returnQty:d,qtyReturn:d,returnQuantity:d,returnedQty:d,quantity:d,qty:d,returnAmount:Math.round(d*n),amount:Math.round(d*n),lineKey:ie({...e,price:n})}}
function le(e={}){
return(Array.isArray(e.items)?e.items:[]).some(e=>u(e.returnQty??e.qtyReturn??e.returnQuantity??e.quantity??0)>0)||u(e.totalReturnAmount??e.totalAmount??e.amount??e.debtReduction??0)>0
}function me(e=[]){
const t=e.reduce((e,t)=>e+u(t.soldAmount??u(t.soldQty)*u(t.price)),0),r=e.reduce((e,t)=>e+u(t.returnAmount??u(t.returnQty)*u(t.price)),0),n=e.reduce((e,t)=>e+u(t.returnQty??t.qtyReturn??t.quantity),0)
;return{totalSoldAmount:Math.round(t),totalReturnAmount:Math.round(r),totalQuantity:n,totalAmount:Math.round(r),amount:Math.round(r),debtReduction:Math.round(r)}}
async function ye(e={}){return(await P([e],{sort:{updatedAt:-1,createdAt:-1},limit:20})).find(e=>e&&!N(e))||null}function fe(t={},r={},n={}){
return e.toDateOnly(t.deliveryDate||t.date||t.documentDate||r.deliveryDate||r.date||n.deliveryDate||n.date||n.documentDate||e.todayVN())}function Ce(t={},r=null){const n=new Map
;for(const e of Array.isArray(r?.items)?r.items:[])n.set(String(e.lineKey||ie(e)).trim(),e);const d=(Array.isArray(t.items)?t.items:[]).map(e=>{const t=ie(e)
;return ce(e,n.get(t)||{})}).filter(e=>e.productCode||e.productName),a=me(d),s=a.totalReturnAmount>0||d.some(e=>u(e.returnQty)>0);return{...r||{},
id:String(L(t,r)||r?.id||o("RO")).trim(),code:String(L(t,r)||r?.code||o("RO")).trim(),date:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||r?.date||e.todayVN()),
documentDate:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||t.orderDate||r?.documentDate||r?.date||e.todayVN()),salesOrderId:t.id||r?.salesOrderId||"",
salesOrderCode:t.code||r?.salesOrderCode||"",orderId:t.id||r?.orderId||"",orderCode:t.code||r?.orderCode||"",customerId:t.customerId||r?.customerId||"",
customerCode:t.customerCode||r?.customerCode||"",customerName:t.customerName||r?.customerName||"",salesStaffId:t.salesStaffId||r?.salesStaffId||"",salesStaffCode:I(t)||I(r),
salesStaffName:p(t)||p(r),staffCode:O(t)||O(r),staffName:h(t)||h(r),masterOrderId:t.masterOrderId||r?.masterOrderId||"",masterOrderCode:t.masterOrderCode||r?.masterOrderCode||"",
deliveryStaffId:t.deliveryStaffId||r?.deliveryStaffId||"",deliveryStaffCode:O(t)||O(r),deliveryStaffName:h(t)||h(r),
deliveryDate:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||e.todayVN()),routeName:t.routeName||t.deliveryRoute||r?.routeName||"",
deliveryRoute:t.deliveryRoute||t.routeName||r?.deliveryRoute||"",items:d,...a,status:r&&U(r.status)?r.status:s?g.WAITING_RECEIVE:g.DRAFT,returnStatus:s?g.WAITING_RECEIVE:g.DRAFT,
returnState:s?g.WAITING_RECEIVE:g.DRAFT,returnMergeStatus:r?.returnMergeStatus||"unmerged",warehouseReceiveStatus:s?r?.warehouseReceiveStatus||g.WAITING_RECEIVE:g.DRAFT,
source:r?.source||"sales_order_draft",createdFrom:r?.createdFrom||"sales_order",accountingStatus:s?r?.accountingStatus||"pending":g.DRAFT,
accountingConfirmed:Boolean(r?.accountingConfirmed),postedAt:r?.postedAt||"",cancelledAt:"",deletedAt:"",updatedAt:e.nowIso(),createdAt:r?.createdAt||e.nowIso()}}
async function ge(t={},r={}){if(!t||!t.id&&!t.code)return null;const d=await ye(t);if(!d)return{returnOrder:E(Ce(t,null)),virtualDraft:!0,skipped:"no_return_quantity"}
;if(U(d.status))return{returnOrder:E(d),skipped:"posted"};const a=Ce(t,d);if(!le(a)){const o={...a,items:[],totalQuantity:0,totalReturnAmount:0,totalAmount:0,amount:0,
debtReduction:0,status:g.CANCELLED,returnStatus:g.CANCELLED,returnState:g.CANCELLED,warehouseReceiveStatus:g.CANCELLED,accountingStatus:g.CANCELLED,cancelReason:"",cancelledAt:"",
clearedAt:e.nowIso(),updatedAt:e.nowIso(),note:"Đồng bộ đơn bán: không còn số lượng trả"};return r.dryRun||(await n.upsert(o,r),await Y(t,{hasReturn:!1,returnOrderId:"",
returnOrderCode:"",returnAmount:0},r),await ee("clear_return_order",d,o,o.note)),{returnOrder:E(o),cleared:!0}}return await n.upsert(a,r),await Y(t,{hasReturn:!0,
returnOrderId:a.id||"",returnOrderCode:a.code||"",returnAmount:u(a.totalAmount??a.amount??0)},r),{returnOrder:E(a),updatedExisting:!0}}async function Ie(e={},t={}){
return await ye(e)?ge(e,t):{skipped:"not_found"}}async function pe(t={},r={}){const d=await ye(t);if(!d)return{skipped:"not_found"};if(J(d))return{
error:"Phiếu trả hàng đã nhập kho/ghi sổ. Vui lòng tạo phiếu đảo trước khi hủy đơn.",status:400};const a={...d,...C.patchForState(d,g.CANCELLED),returnState:g.CANCELLED,
cancelReason:X(r,"Huỷ theo đơn bán/giao"),cancelledAt:e.nowIso(),updatedAt:e.nowIso()};return r.dryRun?{returnOrder:E(a),dryRun:!0}:(await n.upsert(a,r),await Y(t,{hasReturn:!1,
returnOrderId:"",returnOrderCode:"",returnAmount:0},r),await ee("cancel_return_order",d,a,a.cancelReason),{returnOrder:E(a)})}async function Oe(e={},t={}){const r=await ye(e)
;if(!r)return{returnOrder:E(Ce(e,null)),virtualDraft:!0,skipped:"no_existing_return_order"};const d=Ce(e,r);return le(d)?(d.status=le(d)?g.WAITING_RECEIVE:g.DRAFT,
d.returnStatus=d.status,d.returnState=d.status,d.cancelledAt="",await n.upsert(d,t),await Y(e,{hasReturn:!0,returnOrderId:d.id||"",returnOrderCode:d.code||"",
returnAmount:u(d.totalAmount??d.amount??0)},t),{returnOrder:E(d),updatedExisting:Boolean(r)}):{returnOrder:E(d),virtualDraft:!0,skipped:"no_return_quantity"}}
async function he(t={},r=[],n={}){const d=_((r||[]).flatMap(e=>[e?.id,e?._id,e?.salesOrderId,e?.orderId])),a=_((r||[]).flatMap(e=>[e?.code,e?.orderCode,e?.salesOrderCode])),o=[]
;if(d.length&&(o.push({salesOrderId:{$in:d}}),o.push({orderId:{$in:d}})),a.length&&(o.push({salesOrderCode:{$in:a}}),o.push({orderCode:{$in:a}})),!o.length)return[];const s={$set:{
masterOrderId:t.id||"",masterOrderCode:t.code||"",deliveryStaffId:t.deliveryStaffId||"",deliveryStaffCode:t.deliveryStaffCode||"",deliveryStaffName:t.deliveryStaffName||"",
deliveryDate:e.toDateOnly(t.deliveryDate||t.date||e.todayVN()),routeName:t.routeName||"",deliveryRoute:t.deliveryRoute||t.routeName||"",
date:e.toDateOnly(t.deliveryDate||t.date||e.todayVN()),updatedAt:e.nowIso()}};return await f.updateMany({$or:o,status:{$in:S}},s,n.session?{session:n.session}:{}),P(r)}
async function Se(t=[],r={}){const n=_((t||[]).flatMap(e=>[e?.id,e?._id,e?.salesOrderId,e?.orderId])),d=_((t||[]).flatMap(e=>[e?.code,e?.orderCode,e?.salesOrderCode])),a=[]
;if(n.length&&(a.push({salesOrderId:{$in:n}}),a.push({orderId:{$in:n}})),d.length&&(a.push({salesOrderCode:{$in:d}}),a.push({orderCode:{$in:d}})),!a.length)return[]
;const o=_([r.expectedMasterOrderId,r.expectedMasterOrderCode]),s={$or:a,status:{$in:S}};return o.length&&(s.$and=[{$or:[{masterOrderId:{$in:o}},{masterOrderCode:{$in:o}},{
deliveryMasterId:{$in:o}},{deliveryMasterCode:{$in:o}}]}]),await f.updateMany(s,{$set:{updatedAt:e.nowIso()},$unset:{masterOrderId:"",masterOrderCode:"",deliveryMasterId:"",
deliveryMasterCode:"",deliveryStaffId:"",deliveryStaffCode:"",deliveryStaffName:"",deliveryCode:"",deliveryName:"",shipperCode:"",shipperName:"",nvghCode:"",nvghName:"",
staffDeliveryCode:"",staffDeliveryName:"",driverId:"",driverCode:"",driverName:"",staffCode:"",staffName:"",deliveryDate:"",routeName:"",deliveryRoute:""}},r.session?{
session:r.session}:{}),P(t)}async function Re(e,t={},r={}){const n=String(e||t.salesOrderId||t.salesOrderCode||t.orderId||t.orderCode||"").trim();if(!n)return{
error:"Thiếu salesOrderId/salesOrderCode",status:400};const a=await d.findByIdOrCode(n),o={salesOrderId:a?.id||t.salesOrderId||t.orderId||n,
salesOrderCode:a?.code||t.salesOrderCode||t.orderCode||n};let s=await x(o);return!a||!1===r.ensureDraft||s&&U(s.status)?s?{returnOrder:E(s)}:{returnOrder:null}:{
returnOrder:E(Ce(a,s||null)),virtualDraft:!s}}async function Ae(t,r={},a={}){const o=String(t||r.salesOrderId||r.salesOrderCode||r.orderId||r.orderCode||"").trim();if(!o)return{
error:"Thiếu salesOrderId/salesOrderCode",status:400};const s=await d.findByIdOrCode(o),i={...r,salesOrderId:s?.id||r.salesOrderId||r.orderId||o,
salesOrderCode:s?.code||r.salesOrderCode||r.orderCode||o};let c=await x(i);if(!c&&s&&(c=Ce(s,null)),!c)return{error:"Không tìm thấy đơn gốc để tạo/cập nhật phiếu trả hàng",
status:404};const l=j(c,"Phiếu trả hàng đã nhập kho/ghi sổ, không được sửa. Vui lòng tạo phiếu đảo nếu khách lấy lại hàng.");if(l)return l
;if("merged"===(c.returnMergeStatus||"unmerged")||c.masterReturnOrderId||c.masterReturnOrderCode)return{
error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, không được sửa số lượng trả",status:400};const m=Array.isArray(r.items)?r.items:[],y=new Map,f=new Map;for(const e of m){
const t=String(e.productCode||e.code||e.productId||"").trim(),r=String(e.lineKey||ie(e)).trim();t&&y.set(t,e),r&&f.set(r,e)}
const I=(Array.isArray(s?.items)&&s.items.length?Ce(s,c).items:Array.isArray(c.items)?c.items:[]).map(e=>{
const t=String(e.lineKey||ie(e)).trim(),r=String(e.productCode||e.code||e.productId||"").trim(),n=f.get(t)||y.get(r)||null,d=u(n?n.returnQty??n.qtyReturn??n.returnQuantity??n.quantity??0:e.returnQty??e.qtyReturn??e.returnQuantity??0),a=u(e.soldQty??e.quantitySold??e.orderQty??e.totalQty??e.qtySold??0)
;if(d<0)throw new Error("Số lượng trả không được âm");if(a>0&&d>a)throw new Error(`Số lượng trả ${e.productCode||e.productName} không được lớn hơn số lượng giao`)
;const o=u(e.price??e.salePrice??e.unitPrice??0);return{...e,returnQty:d,qtyReturn:d,returnQuantity:d,returnedQty:d,quantity:d,qty:d,returnAmount:Math.round(d*o),
amount:Math.round(d*o),lineKey:t}}),p=me(I),O=p.totalReturnAmount>0||I.some(e=>u(e.returnQty)>0),h=fe(r,s||{},c||{}),S={...c,...p,date:h,deliveryDate:h,documentDate:h,items:I,
source:r.source||c.source||"returnOrders",updatedFrom:r.source||r.updatedFrom||"unknown",updatedBy:r.updatedBy||r.user||c.updatedBy||"",updatedAt:e.nowIso()};if(!O){
const t=await K({...i,...r,note:r.note||"Đã sửa hàng trả về 0 từ phần mềm"}),n={...S,items:[],totalQuantity:0,totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0,
status:g.CANCELLED,returnStatus:g.CANCELLED,returnState:g.CANCELLED,warehouseReceiveStatus:g.CANCELLED,accountingStatus:g.CANCELLED,cancelReason:"",cancelledAt:"",
clearedAt:e.nowIso(),note:r.note||"Đã sửa hàng trả về 0 từ phần mềm"};return s&&await Y(s,{hasReturn:!1,returnOrderId:"",returnOrderCode:"",returnAmount:0},a),
t.cleared>0&&await ee("clear_return_order",c,t.returnOrder||n,n.note),{returnOrder:t.returnOrder||E(n),cleared:t.cleared>0,skippedCreate:t.cleared<=0}}const R={...S,
...C.patchForState(S,g.WAITING_RECEIVE),returnState:g.WAITING_RECEIVE,accountingStatus:"pending",cancelledAt:"",cancelReason:""};return await n.upsert(R,a),s&&await Y(s,{
hasReturn:!0,returnOrderId:R.id||"",returnOrderCode:R.code||"",returnAmount:u(R.totalAmount??R.amount??0)},a),
await ee(c&&"cancelled"===c.status?"restore_return_order":"upsert_return_order",c,R,"Cập nhật số lượng hàng trả"),{returnOrder:E(R)}}async function Ee(t,r={},a={}){
const o=await n.findByIdOrCode(t);if(!o)return{error:"Không tìm thấy phiếu trả hàng",status:404};const s=Z(o);if(s)return s
;if("merged"===(o.returnMergeStatus||"unmerged")||o.masterReturnOrderId||o.masterReturnOrderCode)return{error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, cần hủy gộp trước",
status:400};const u={...o,...C.patchForState(o,g.CANCELLED),returnState:g.CANCELLED,warehouseReceiveStatus:"cancelled",accountingStatus:"cancelled",
cancelReason:X(r,"Khách lấy lại hàng"),cancelledAt:e.nowIso(),updatedAt:e.nowIso()};await n.upsert(u,a)
;const i=o.salesOrderId||o.orderId||o.salesOrderCode||o.orderCode||"",c=i?await d.findByIdOrCode(i):null;return c&&await Y(c,{hasReturn:!1,returnOrderId:"",returnOrderCode:"",
returnAmount:0},a),await ee("cancel_return_order",o,u,u.cancelReason),{returnOrder:E(u)}}async function Ne(t,r={},d={}){const a=await n.findByIdOrCode(t);if(!a)return{
error:"Không tìm thấy đơn chờ trả hàng",status:404};const o=j(a,"Phiếu trả hàng đã ghi sổ/kho, không được sửa");if(o)return o
;if("merged"===(a.returnMergeStatus||"unmerged")||a.masterReturnOrderId||a.masterReturnOrderCode)return{
error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, không được sửa số lượng trả",status:400};const s=Array.isArray(r.items)?r.items:[],i=new Map;for(const e of s){
const t=String(e.lineKey||ie(e)).trim();t&&i.set(t,e)}const c=(Array.isArray(a.items)?a.items:[]).map(e=>{
const t=String(e.lineKey||ie(e)).trim(),r=i.get(t)||s.find(t=>String(t.productCode||t.code||"").trim()===String(e.productCode||"").trim()),n=u(r?r.returnQty??r.qtyReturn??r.returnQuantity??r.quantity??0:e.returnQty??e.qtyReturn??e.quantity??0),d=u(e.soldQty??e.quantitySold??0)
;if(n<0)throw new Error("Số lượng trả không được âm");if(n>d)throw new Error(`Số lượng trả ${e.productCode||e.productName} không được lớn hơn số lượng bán`)
;const a=u(e.price??e.salePrice??e.unitPrice??0);return{...e,returnQty:n,qtyReturn:n,returnQuantity:n,returnedQty:n,quantity:n,qty:n,returnAmount:Math.round(n*a),
amount:Math.round(n*a),lineKey:t}}),l=me(c),m=l.totalReturnAmount>0||c.some(e=>u(e.returnQty)>0),y=m?g.WAITING_RECEIVE:g.CANCELLED,f=fe(r,{},a||{}),C={...a,...m?l:{totalQuantity:0,
totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0},date:f,deliveryDate:f,documentDate:f,items:m?c:[],status:y,returnStatus:y,returnState:y,
warehouseReceiveStatus:m?g.WAITING_RECEIVE:g.CANCELLED,accountingStatus:m?"pending":g.CANCELLED,cancelReason:"",cancelledAt:"",clearedAt:m?"":e.nowIso(),
note:m?a.note:r.note||"Đã sửa hàng trả về 0",updatedAt:e.nowIso()};return await n.upsert(C,d),{returnOrder:E(C),cleared:!m}}module.exports={listReturnOrders:G,createReturnOrder:re,
createPendingReturnOrder:ae,upsertDeliveryReturnOrder:de,buildCanonicalReturnCode:L,findExistingReturnOrderForSalesOrder:k,cancelDuplicateReturnOrders:V,
confirmReceiveReturnOrder:se,confirmAccountingReturnOrder:ue,ensureReturnDraftForSalesOrder:ge,syncReturnDraftWithSalesOrder:Ie,cancelReturnDraftForSalesOrder:pe,
restoreReturnDraftForSalesOrder:Oe,attachMasterOrderToReturnDrafts:he,detachMasterOrderFromReturnDrafts:Se,getReturnOrderBySalesOrderKey:Re,updateReturnDraftItemsBySalesOrder:Ae,
updateReturnDraftItems:Ne,cancelReturnOrderById:Ee,toClient:E};
