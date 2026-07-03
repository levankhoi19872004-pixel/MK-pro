/* GENERATED FILE — edit src/services/returnOrderLegacy.service.source/part-01.jsfrag, src/services/returnOrderLegacy.service.source/part-02.jsfrag, src/services/returnOrderLegacy.service.source/part-03.jsfrag, src/services/returnOrderLegacy.service.source/part-04.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),t=require("../utils/queryGuard.util"),{escapeRegex:r}=require("../utils/query.util"),n=require("../repositories/returnOrderRepository"),d=require("../repositories/orderRepository"),a=require("../repositories/customerRepository"),{makeId:o,normalizeText:u,toNumber:s}=require("../utils/common.util"),{withMongoTransaction:i}=require("../utils/transaction.util"),c=require("../domain/posting/InventoryPostingService"),l=require("../engines/posting.engine"),m=require("./financialService"),f=require("./auditService"),y=require("./mobile/warehouseReturnCheck.service"),C=require("../models/ReturnOrder"),g=require("../domain/lifecycle/ReturnStateMachine"),{RETURN_STATES:I}=g,{pickSalesStaffCode:p,pickSalesStaffName:h,pickDeliveryStaffCode:O,pickDeliveryStaffName:S}=require("../domain/staff/staffIdentity"),R=["draft","pending","active","waiting_receive","pending_warehouse_receive","merged","delivered","completed","has_return"]
;function A(e=[]){const t=e.reduce((e,t)=>{const r=String(t.code||"").match(/(\d+)$/);return Math.max(e,r?Number(r[1]):0)},0);return`THH${String(t+1).padStart(5,"0")}`}
function E(t={}){const r=[t.returnDate,t.date,t.documentDate,t.deliveryDate];for(const t of r){const r=e.toDateOnly(t||"");if(/^\d{4}-\d{2}-\d{2}$/.test(r))return r}return""}
function N(e){const t=E(e);return{...e,id:e.id||e.code,code:e.code||e.id,returnDate:t||e.returnDate||"",items:Array.isArray(e.items)?e.items:[],totalQuantity:s(e.totalQuantity),
totalAmount:s(e.totalAmount)}}function v(e={}){const t=String(e.status||"").toLowerCase()
;return["cancelled","canceled","void","deleted","removed","duplicate_cancelled","cleared"].includes(t)||Boolean(e.deletedAt)}function w(e={}){
return s(e.debtReduction??e.totalAmount??e.amount??e.totalValue)}function D(e={}){return w(e)>0}async function _(t={},r={}){const d=w(t);if(!t||d<=0)return{entry:null,returnOrder:t
};g.assertCanPostAR(t);const a=await l.postReturnOrderAR({...t,debtReduction:d,amount:d,totalReturnAmount:d,source:"returnOrders",accountingConfirmed:!0,
accountingStatus:I.ACCOUNTING_CONFIRMED},{...r,skipIfExists:!0});if(!a)return{entry:null,returnOrder:t};const o=g.patchForState(t,I.POSTED_TO_AR),u={...t,...o,
returnState:I.POSTED_TO_AR,stateChangedAt:e.nowIso(),arLedgerId:a.id||a.code||t.arLedgerId||""};return await n.upsert(u,r),{entry:a,returnOrder:u}}function T(e=[]){
return[...new Set((e||[]).map(e=>String(e||"").trim()).filter(Boolean))]}function q(e={}){
const t=String(e.id||"").trim(),r=String(e.code||"").trim(),n=String(e.salesOrderId||e.orderId||e.sourceOrderId||e.deliveryOrderId||"").trim(),d=String(e.salesOrderCode||e.orderCode||e.sourceOrderCode||e.deliveryOrderCode||"").trim(),a=[]
;return t&&a.push({id:t}),r&&a.push({code:r}),n&&(a.push({salesOrderId:n}),a.push({orderId:n}),a.push({sourceOrderId:n}),a.push({deliveryOrderId:n})),d&&(a.push({salesOrderCode:d
}),a.push({orderCode:d}),a.push({sourceOrderCode:d}),a.push({deliveryOrderCode:d})),a.length?{$or:a}:null}function M(e={},t={}){
return String(e.code||e.orderCode||e.salesOrderCode||t.salesOrderCode||t.orderCode||t.code||"").trim()}function L(e={},t={}){
return String(e.id||e._id||t.salesOrderId||t.orderId||t.id||"").trim()}function $(e={},t={}){const r=M(e,t);if(!r)return"";const n=String(r).replace(/^RO[-_]?/i,"").trim()
;return n?`RO-${n}`:""}function Q({salesOrderId:e="",salesOrderCode:t="",returnCode:r=""}={}){const n=[];return r&&(n.push({code:r}),n.push({id:r})),e&&(n.push({salesOrderId:e}),
n.push({orderId:e}),n.push({sourceOrderId:e}),n.push({deliveryOrderId:e})),t&&(n.push({salesOrderCode:t}),n.push({orderCode:t}),n.push({sourceOrderCode:t}),n.push({
deliveryOrderCode:t}),n.push({code:`RO-${String(t).replace(/^RO[-_]?/i,"")}`})),n.length?{$or:n,status:{$nin:["deleted"]}}:null}function k(e={},t=""){
const r=String(e.status||e.returnStatus||"").toLowerCase();let n=0;return!t||String(e.code||"")!==t&&String(e.id||"")!==t||(n+=1e3),String(e.code||"").startsWith("RO-")&&(n+=200),
String(e.id||"").startsWith("RO-")&&(n+=100),["waiting_receive","pending","draft","active","has_return"].includes(r)&&(n+=80),"cleared"===r&&(n+=40),
String(e.id||"").startsWith("RO-DRAFT-")&&(n+=10),String(e.id||"").startsWith("RO-MOBILE-")&&(n-=20),String(e.code||"").startsWith("THH")&&(n-=80),
["cancelled","canceled","cleared","void","deleted","removed","duplicate_cancelled"].includes(r)&&(n-=500),n}
async function V({salesOrderId:e="",salesOrderCode:t="",returnCode:r=""}={}){const d=Q({salesOrderId:e,salesOrderCode:t,returnCode:r});return d&&(await n.findAll(d,{sort:{
createdAt:1},limit:50})||[]).filter(e=>e&&!v(e)).sort((e,t)=>k(t,r)-k(e,r))[0]||null}
async function P({keepId:t,keepCode:r="",salesOrderId:d="",salesOrderCode:a="",returnCode:o=""}={}){const u=Q({salesOrderId:d,salesOrderCode:a,returnCode:o});if(!u)return{
cancelled:0};const s=await n.findAll(u,{sort:{createdAt:1},limit:100}),i=e.nowIso();let c=0;for(const e of s||[]){if(!e)continue
;if(t&&String(e._id||e.id||"")===String(t)||r&&(String(e.code||"")===String(r)||String(e.id||"")===String(r)))continue;const d=String(e.status||"").toLowerCase()
;["deleted","duplicate_cancelled"].includes(d)||"merged"===(e.returnMergeStatus||"unmerged")||e.masterReturnOrderId||e.masterReturnOrderCode||H(e.status)||"received"===String(e.warehouseReceiveStatus||"").toLowerCase()||(await n.upsert({
...e,status:"duplicate_cancelled",returnStatus:"duplicate_cancelled",warehouseReceiveStatus:"duplicate_cancelled",accountingStatus:"duplicate_cancelled",items:[],amount:0,
totalAmount:0,totalQuantity:0,debtReduction:0,totalReturnAmount:0,duplicateReason:"Trùng phiếu trả cùng salesOrderId/salesOrderCode",updatedAt:i}),c+=1)}return{cancelled:c}}
async function F(e=[],t={}){const r=[],d=[];for(const t of e||[])r.push(t?.salesOrderId,t?.orderId,t?.sourceOrderId,t?.deliveryOrderId,t?.id,t?._id),
d.push(t?.salesOrderCode,t?.orderCode,t?.sourceOrderCode,t?.deliveryOrderCode,t?.code);const a=T(r),o=T(d),u=[];return a.length&&(u.push({salesOrderId:{$in:a}}),u.push({orderId:{
$in:a}}),u.push({sourceOrderId:{$in:a}}),u.push({deliveryOrderId:{$in:a}})),o.length&&(u.push({salesOrderCode:{$in:o}}),u.push({orderCode:{$in:o}}),u.push({sourceOrderCode:{$in:o}
}),u.push({deliveryOrderCode:{$in:o}})),u.length?n.findAll({$or:u},{...t,projection:{id:1,code:1,salesOrderId:1,salesOrderCode:1,orderId:1,orderCode:1,sourceOrderId:1,
sourceOrderCode:1,deliveryOrderId:1,deliveryOrderCode:1,masterOrderId:1,masterOrderCode:1,masterReturnOrderId:1,masterReturnOrderCode:1,customerId:1,customerCode:1,customerName:1,
salesStaffId:1,salesStaffCode:1,salesStaffName:1,salesmanCode:1,salesmanName:1,deliveryStaffId:1,deliveryStaffCode:1,deliveryStaffName:1,staffCode:1,staffName:1,items:1,
totalQuantity:1,totalAmount:1,amount:1,debtReduction:1,status:1,returnStatus:1,returnMergeStatus:1,warehouseReceiveStatus:1,date:1,documentDate:1,deliveryDate:1,routeName:1,
deliveryRoute:1,createdAt:1,updatedAt:1}}):[]}function b(e={},t=null,r=null){const n=$(r||{},e||{});return String(n||t?.code||e.code||`THH${o("")}`).trim()}async function G(t={}){
const d={status:{$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}
},a=[],o=e.toDateOnly(t.dateFrom||t.fromDate||t.from||""),u=e.toDateOnly(t.dateTo||t.toDate||t.to||t.date||""),s=e.toDateOnly(t.date||""),i=Boolean(o||u||s);if(o&&u&&o>u){
const e=new Error("Từ ngày không được lớn hơn đến ngày");throw e.status=400,e.code="INVALID_RETURN_ORDER_DATE_RANGE",e}if(i){const e=s||{...o?{$gte:o}:{},...u?{$lte:u}:{}};a.push({
$or:[{returnDate:e},{date:e},{documentDate:e},{deliveryDate:e}]})}const c=T([t.salesOrderId,t.orderId,t.salesOrderCode,t.orderCode,t.orderKey,t.code,t.id]);c.length&&a.push({$or:[{
salesOrderId:{$in:c}},{orderId:{$in:c}},{sourceOrderId:{$in:c}},{deliveryOrderId:{$in:c}},{salesOrderCode:{$in:c}},{orderCode:{$in:c}},{sourceOrderCode:{$in:c}},{
deliveryOrderCode:{$in:c}},{id:{$in:c}},{code:{$in:c}}]}),t.masterOrderId&&(d.masterOrderId=String(t.masterOrderId).trim()),
t.masterOrderCode&&(d.masterOrderCode=String(t.masterOrderCode).trim()),t.customerCode&&(d.customerCode=String(t.customerCode).trim())
;const l=String(t.deliveryStaffCode||t.deliveryCode||t.nvghCode||t.delivery||"").trim();if(l){const e=new RegExp(r(l),"i");a.push({$or:[{deliveryStaffCode:e},{deliveryStaffName:e
},{deliveryCode:e},{deliveryName:e},{nvghCode:e},{nvghName:e}]})}const m=String(t.salesStaffCode||t.salesmanCode||t.nvbhCode||t.salesman||"").trim();if(m){
const e=new RegExp(r(m),"i");a.push({$or:[{salesStaffCode:e},{salesStaffName:e},{salesmanCode:e},{salesmanName:e},{nvbhCode:e},{nvbhName:e}]})}
const f=String(t.q||t.keyword||t.search||"").trim();if(f){const e=new RegExp(r(f),"i");a.push({$or:[{id:e},{code:e},{salesOrderCode:e},{orderCode:e},{customerCode:e},{
customerName:e},{deliveryStaffCode:e},{deliveryStaffName:e},{salesStaffCode:e},{salesStaffName:e},{note:e}]})}a.length&&(d.$and=a)
;const y=Math.max(1,Number(t.page||1)),C=Math.min(500,Math.max(1,Number(t.limit||100))),g=await n.findAll(d,{sort:{createdAt:-1,code:-1},skip:(y-1)*C,limit:C
}),I="1"===String(t.includeZeroValue??t.showZero??"0"),p=new Set;return g.map(N).filter(t=>!i||e.isDateInRange(E(t),{date:s,dateFrom:o,dateTo:u})).filter(e=>I||D(e)).filter(e=>{
const t=String(e.id||e.code||e._id||"").trim();return!t||!p.has(t)&&(p.add(t),!0)})}async function B(e={}){
const t=String(e.salesOrderId||e.salesOrderCode||e.orderId||e.orderCode||"").trim();return t?d.findByIdOrCode(t):null}async function W(e={},t=null){
const r=String(e.customerId||e.customerCode||e.customerName||t?.customerId||t?.customerCode||"").trim();return r?a.findByIdOrCode(r):null}function x(e=[],t=null){
const r=new Map((t?.items||[]).map(e=>[String(e.productCode||e.code||e.productId||"").trim(),e]));return(Array.isArray(e)?e:[]).map(e=>{
const t=String(e.productCode||e.code||e.productId||"").trim(),n=r.get(t)||{},d=s(e.qtyReturn??e.returnQuantity??e.returnedQty??e.returnQty??e.quantity??e.qty),a=s(e.price??e.salePrice??e.unitPrice??n.price??n.salePrice??0)
;return{...n,...e,productId:e.productId||n.productId||t,productCode:t||n.productCode||n.code||"",productName:e.productName||e.name||n.productName||n.name||"",quantity:d,qty:d,
price:a,salePrice:a,amount:s(e.amount??d*a)}}).filter(e=>e.quantity>0||e.productCode||e.productName)}async function K(e={}){
const t=await B(e).catch(()=>null),r=L(t||{},e||{}),d=M(t||{},e||{}),a=$(t||{},{...e,salesOrderCode:d}),o=await V({salesOrderId:r,salesOrderCode:d,returnCode:a});if(o)return o
;const u=q(e);return u&&(await n.findAll(u,{sort:{updatedAt:-1,createdAt:-1},limit:20})).find(e=>!v(e))||null}async function U(t={}){const r=q(t);if(!r)return{returnOrder:null,
cleared:0,rows:[]};const d=await n.findAll(r,{sort:{updatedAt:-1,createdAt:-1},limit:50
}),a=e.nowIso(),o=String(t.note||"NVGH sửa số lượng hàng trả về 0 trên app giao hàng").trim(),u=(d||[]).filter(e=>!(!e||v(e)||"merged"===(e.returnMergeStatus||"unmerged")||e.masterReturnOrderId||e.masterReturnOrderCode||H(e.status)))
;let s=null;for(const e of u){const r={...e,items:[],totalQuantity:0,totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0,status:"cleared",returnStatus:"cleared",
accountingStatus:"cleared",warehouseReceiveStatus:"cleared",refType:e.refType||t.refType||"mobileDeliveryReturnClear",note:o,clearedAt:a,postedAt:"",receivedAt:"",updatedAt:a}
;await n.upsert(r),s=r}return{returnOrder:s?N(s):null,cleared:u.length,rows:u}}function H(e=""){const t=g.normalizeReturnState(e)
;return[I.RECEIVED,I.ACCOUNTING_CONFIRMED,I.POSTED_TO_AR].includes(t)}function z(e=""){const t=g.normalizeReturnState(e);return[I.DRAFT,I.WAITING_RECEIVE].includes(t)}
function j(e={}){try{return g.assertCanEdit(e),!0}catch(e){return!1}}function Z(e={},t=""){try{return g.assertCanEdit(e),null}catch(e){return{error:t||e.message,message:e.message,
code:e.code,status:400}}}function J(e={}){try{return g.assertCanCancel(e),null}catch(e){return{error:e.message,code:e.code,status:400}}}function X(e={}){try{
return g.assertCanCancel(e),!1}catch(e){return!0}}function Y(e={},t="Khách lấy lại hàng"){return String(e.cancelReason||e.reason||e.note||t).trim()}
async function ee(t=null,r={},n={}){if(!t||!t.id&&!t.code)return null;const a={...t,...r,updatedAt:e.nowIso()};return await d.upsert(a,n),a}async function te(e,t=null,r=null,n=""){
await f.log(e,{refType:"returnOrder",refId:(r||t||{}).id||"",refCode:(r||t||{}).code||"",before:t,after:r,note:n})}async function re(t={}){const r=await B(t),n=await W(t,r)
;if(!n&&!t.customerName&&!r?.customerName)return{error:"Không tìm thấy khách hàng",status:404};const d=x(t.items,r).filter(e=>s(e.quantity)>0);if(!d.length)return{
error:"Phiếu trả hàng chưa có dòng hàng",status:400};const a=String(t.source||t.refType||"").toLowerCase()
;if((["mobileDeliveryReturn","erpDeliveryReturn"].includes(String(t.refType||""))||"returnOrders"===String(t.source||"")||a.includes("mobile_delivery")||a.includes("mobiledelivery"))&&!String(t.salesOrderId||"").trim()&&!String(t.salesOrderCode||"").trim())return{
error:"Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả",status:400};const u=await K(t),i=s(t.totalAmount??d.reduce((e,t)=>e+s(t.amount),0)),c=Ce(t,r||{},u||{});return{
returnOrder:{...u||{},...t,id:String($(r||{},t)||u?.id||t.id||o("RO")).trim(),code:b(t,u,r),date:c,documentDate:c,deliveryDate:c,
salesOrderId:r?.id||t.salesOrderId||t.orderId||u?.salesOrderId||"",salesOrderCode:r?.code||t.salesOrderCode||t.orderCode||u?.salesOrderCode||"",
orderId:r?.id||t.orderId||t.salesOrderId||u?.orderId||u?.salesOrderId||"",orderCode:r?.code||t.orderCode||t.salesOrderCode||u?.orderCode||u?.salesOrderCode||"",
customerId:n?.id||t.customerId||r?.customerId||u?.customerId||"",customerCode:n?.code||t.customerCode||r?.customerCode||u?.customerCode||"",
customerName:n?.name||t.customerName||r?.customerName||u?.customerName||"",salesStaffId:r?.salesStaffId||t.salesStaffId||u?.salesStaffId||"",salesStaffCode:p(r)||p(t)||p(u),
salesStaffName:h(r)||h(t)||h(u),salesmanCode:p(r)||p(t)||p(u),salesmanName:h(r)||h(t)||h(u),deliveryStaffId:r?.deliveryStaffId||t.deliveryStaffId||u?.deliveryStaffId||"",
deliveryStaffCode:O(r)||O(t)||O(u),deliveryStaffName:S(r)||S(t)||S(u),staffCode:O(r)||O(t)||O(u),staffName:S(r)||S(t)||S(u),note:String(t.note??u?.note??"").trim(),items:d,
totalQuantity:s(t.totalQuantity??d.reduce((e,t)=>e+s(t.quantity),0)),totalAmount:i,amount:s(t.amount??i),debtReduction:s(t.debtReduction??i),
status:t.status||u?.status||I.WAITING_RECEIVE,returnMergeStatus:t.returnMergeStatus||u?.returnMergeStatus||"unmerged",
warehouseReceiveStatus:t.warehouseReceiveStatus||u?.warehouseReceiveStatus||(H(t.status)?I.RECEIVED:I.WAITING_RECEIVE),source:t.source||u?.source||"returnOrders",
accountingStatus:t.accountingStatus||u?.accountingStatus||"",accountingConfirmed:Boolean(t.accountingConfirmed??u?.accountingConfirmed??!1),
createdAt:u?.createdAt||t.createdAt||e.nowIso(),updatedAt:e.nowIso()},existing:u}}async function ne(e={}){const t=await re({...e,status:e.status||I.WAITING_RECEIVE,
warehouseReceiveStatus:e.warehouseReceiveStatus||I.WAITING_RECEIVE});if(t.error)return t;const{returnOrder:r,existing:d}=t;let a=null;return await i(async t=>{
d&&H(d.status)&&(await c.reverseMovement(d,{type:"RETURN",reverseType:"RETURN_UPDATE_REVERSAL",direction:"IN",refType:"RETURN_ORDER",refId:d.id||d.code,refCode:d.code||d.id,
date:d.date,note:"Đảo nhập kho phiếu trả hàng trước khi cập nhật"},{session:t}),await l.reverseReturnOrderAR(d,{session:t}));const o={...r,...g.patchForState(r,I.RECEIVED),
returnState:I.RECEIVED},u={...o,...g.patchForState(o,I.ACCOUNTING_CONFIRMED),returnState:I.ACCOUNTING_CONFIRMED,accountingConfirmedBy:e.confirmedBy||e.user||"system",
accountingNote:e.note||r.accountingNote||""};await n.upsert(u,{session:t}),await c.postReturnIn(o,{session:t});const s=await _(u,{session:t});a=s.returnOrder||u}),{
returnOrder:N(a||{...r,...g.patchForState(r,I.POSTED_TO_AR)}),updatedExisting:Boolean(d)}}function de(e=[],t=null){
const r=new Map((t?.items||[]).map(e=>[String(e.productCode||e.code||e.productId||"").trim(),e]));return(Array.isArray(e)?e:[]).map(e=>{
const t=String(e.productCode||e.code||e.productId||"").trim(),n=r.get(t)||{},d=s(e.qtyReturn??e.returnQty??e.returnQuantity??e.returnedQty??e.quantity??e.qty??0),a=s(e.price??e.salePrice??e.unitPrice??n.price??n.salePrice??n.unitPrice??0)
;return{...n,...e,productId:e.productId||n.productId||t,productCode:t||n.productCode||n.code||"",productName:e.productName||e.name||n.productName||n.name||"",quantity:d,qty:d,
qtyReturn:d,returnQty:d,returnQuantity:d,returnedQty:d,price:a,salePrice:a,unitPrice:a,amount:Math.round(s(e.amount??d*a)),reason:e.reason||""}
}).filter(e=>e.productCode&&s(e.qtyReturn)>0)}async function ae(t={},r={}){const d=await B(t),a=L(d||{},t||{}),u=M(d||{},t||{});if(!a&&!u)return{
error:"Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả",status:400};const i=$(d||{},{...t,salesOrderCode:u}),c=await W(t,d)
;if(!c&&!t.customerName&&!d?.customerName)return{error:"Không tìm thấy khách hàng",status:404};const l=await V({salesOrderId:a,salesOrderCode:u,returnCode:i})
;if(l&&("merged"===(l.returnMergeStatus||"unmerged")||l.masterReturnOrderId||l.masterReturnOrderCode))return{
error:"Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng",status:400};if(l){const e=Z(l,"Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng")
;if(e)return e}const m=de(t.items,d),f=m.reduce((e,t)=>e+s(t.qtyReturn),0),y=m.reduce((e,t)=>e+s(t.amount??s(t.qtyReturn)*s(t.price||t.salePrice||t.unitPrice)),0),C=e.nowIso(),g={
...l||{},...t,id:i||l?.id||t.id||o("RO"),code:i||l?.code||t.code||o("RO"),date:e.toDateOnly(t.date||t.documentDate||l?.date||d?.deliveryDate||e.todayVN()),
documentDate:e.toDateOnly(t.documentDate||t.date||l?.documentDate||d?.date||e.todayVN()),
deliveryDate:e.toDateOnly(t.deliveryDate||d?.deliveryDate||l?.deliveryDate||t.date||e.todayVN()),salesOrderId:a,salesOrderCode:u,orderId:a,orderCode:u,
customerId:c?.id||t.customerId||d?.customerId||l?.customerId||"",customerCode:c?.code||t.customerCode||d?.customerCode||l?.customerCode||"",
customerName:c?.name||t.customerName||d?.customerName||l?.customerName||"",salesStaffId:d?.salesStaffId||t.salesStaffId||l?.salesStaffId||"",salesStaffCode:p(d)||p(t)||p(l),
salesStaffName:h(d)||h(t)||h(l),salesmanCode:p(d)||p(t)||p(l),salesmanName:h(d)||h(t)||h(l),deliveryStaffId:d?.deliveryStaffId||t.deliveryStaffId||l?.deliveryStaffId||"",
deliveryStaffCode:O(d)||O(t)||O(l),deliveryStaffName:S(d)||S(t)||S(l),staffCode:O(d)||O(t)||O(l),staffName:S(d)||S(t)||S(l),items:f>0?m:[],totalQuantity:f>0?f:0,
totalAmount:f>0?y:0,amount:f>0?y:0,debtReduction:f>0?y:0,totalReturnAmount:f>0?y:0,status:f>0?I.WAITING_RECEIVE:I.CANCELLED,returnStatus:f>0?I.WAITING_RECEIVE:I.CANCELLED,
returnState:f>0?I.WAITING_RECEIVE:I.CANCELLED,returnMergeStatus:l?.returnMergeStatus||t.returnMergeStatus||"unmerged",warehouseReceiveStatus:f>0?I.WAITING_RECEIVE:I.CANCELLED,
source:t.source||l?.source||"mobile_delivery",accountingStatus:f>0?"pending":I.CANCELLED,accountingConfirmed:!1,postedAt:"",receivedAt:"",note:String(t.note??l?.note??"").trim(),
clearedAt:f>0?"":C,updatedAt:C,createdAt:l?.createdAt||t.createdAt||C};return await n.upsert(g,r),await P({keepId:l?._id||g.id,keepCode:g.code,salesOrderId:a,salesOrderCode:u,
returnCode:g.code}),{returnOrder:N(await V({salesOrderId:a,salesOrderCode:u,returnCode:g.code})||g),updatedExisting:Boolean(l),canonicalCode:g.code}}async function oe(e={},t={}){
const r=await re({...e,status:e.status||I.WAITING_RECEIVE,returnMergeStatus:e.returnMergeStatus||"unmerged",warehouseReceiveStatus:e.warehouseReceiveStatus||I.WAITING_RECEIVE})
;if(r.error)return r;const{returnOrder:d,existing:a}=r
;if((s(d.totalQuantity??0)||(Array.isArray(d.items)?d.items.reduce((e,t)=>e+s(t.returnQty??t.qtyReturn??t.returnQuantity??t.quantity??t.qty??0),0):0))<=0){const e=await U(d)
;return{returnOrder:e.returnOrder||N({...d,items:[],totalQuantity:0,totalAmount:0,amount:0,debtReduction:0,status:I.CANCELLED,returnStatus:I.CANCELLED,returnState:I.CANCELLED,
warehouseReceiveStatus:I.CANCELLED,accountingStatus:I.CANCELLED}),updatedExisting:e.cleared>0,cleared:e.cleared,skippedCreate:e.cleared<=0}}
if(a&&("merged"===(a.returnMergeStatus||"unmerged")||a.masterReturnOrderId||a.masterReturnOrderCode))return{error:"Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng",
status:400};if(a){const e=Z(a,"Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng");if(e)return e}const o={...d,...g.patchForState(d,I.WAITING_RECEIVE),
returnState:I.WAITING_RECEIVE,returnMergeStatus:"unmerged",postedAt:"",receivedAt:""};return await n.upsert(o,t),{returnOrder:N({...o,status:I.WAITING_RECEIVE,
warehouseReceiveStatus:I.WAITING_RECEIVE}),updatedExisting:Boolean(a)}}async function ue(t,r={}){const d=r.session,a=await n.findByIdOrCode(t,{session:d});if(!a)return{
error:"Không tìm thấy phiếu trả hàng",status:404};const o=g.getReturnState(a);if(o===I.RECEIVED||o===I.ACCOUNTING_CONFIRMED||o===I.POSTED_TO_AR)return{returnOrder:N(a),
alreadyReceived:!0};try{g.assertTransition(a,I.RECEIVED,"confirm_receive")}catch(e){return{error:e.message,code:e.code,status:400}}const u={...a,...g.patchForState(a,I.RECEIVED),
returnState:I.RECEIVED,receivedBy:String(r.receivedBy||a.receivedBy||"").trim(),stateChangedAt:e.nowIso(),updatedAt:e.nowIso()};return await n.upsert(u,{session:d}),
await c.postReturnIn(u,{session:d}),{returnOrder:N(u),alreadyReceived:!1}}async function se(e,t={}){return t.session?ue(e,t):i(r=>ue(e,{...t,session:r}))}
async function ie(t,r={},d={}){const a=await n.findByIdOrCode(t);if(!a)return{error:"Không tìm thấy phiếu trả hàng",status:404};try{g.assertCanConfirmAccounting(a)}catch(e){return{
error:e.message,code:e.code,status:400}}if(await y.hasBlockingWarehouseReturnCheckForReturnOrder(a))return{
error:"Phiếu trả hàng chưa được thủ kho xác nhận. Vui lòng kiểm hàng trả trước khi chốt kế toán.",code:"WAREHOUSE_RETURN_CHECK_REQUIRED",status:409};let o=null
;return await i(async t=>{const u={...a,...g.patchForState(a,I.ACCOUNTING_CONFIRMED),returnState:I.ACCOUNTING_CONFIRMED,
accountingConfirmedBy:r.confirmedBy||r.user||d.user?.code||"system",accountingNote:r.note||a.accountingNote||"",stateChangedAt:e.nowIso(),updatedAt:e.nowIso()}
;g.assertTransition(a,I.ACCOUNTING_CONFIRMED,"confirm_accounting"),await n.upsert(u,{session:t});const s=await _(u,{session:t});o=s.returnOrder||u}),{returnOrder:N(o)}}
function ce(e={}){return[String(e.productCode||e.code||e.productId||"").trim(),String(e.unit||e.baseUnit||"").trim(),String(s(e.price??e.salePrice??e.unitPrice??0))].join("|")}
function le(e={},t={}){
const r=s(e.quantity??e.qty??e.totalQty??e.soldQty??0),n=s(e.price??e.salePrice??e.unitPrice??t.price??t.salePrice??0),d=s(t.returnQty??t.qtyReturn??t.returnQuantity??t.quantity??0)
;return{...t,productId:e.productId||t.productId||e.productCode||e.code||"",productCode:String(e.productCode||e.code||e.productId||t.productCode||"").trim(),
productName:String(e.productName||e.name||t.productName||"").trim(),unit:String(e.unit||e.baseUnit||t.unit||"").trim(),soldQty:r,price:n,salePrice:n,unitPrice:n,
soldAmount:Math.round(r*n),returnQty:d,qtyReturn:d,returnQuantity:d,returnedQty:d,quantity:d,qty:d,returnAmount:Math.round(d*n),amount:Math.round(d*n),lineKey:ce({...e,price:n})}}
function me(e={}){
return(Array.isArray(e.items)?e.items:[]).some(e=>s(e.returnQty??e.qtyReturn??e.returnQuantity??e.quantity??0)>0)||s(e.totalReturnAmount??e.totalAmount??e.amount??e.debtReduction??0)>0
}function fe(e=[]){
const t=e.reduce((e,t)=>e+s(t.soldAmount??s(t.soldQty)*s(t.price)),0),r=e.reduce((e,t)=>e+s(t.returnAmount??s(t.returnQty)*s(t.price)),0),n=e.reduce((e,t)=>e+s(t.returnQty??t.qtyReturn??t.quantity),0)
;return{totalSoldAmount:Math.round(t),totalReturnAmount:Math.round(r),totalQuantity:n,totalAmount:Math.round(r),amount:Math.round(r),debtReduction:Math.round(r)}}
async function ye(e={}){return(await F([e],{sort:{updatedAt:-1,createdAt:-1},limit:20})).find(e=>e&&!v(e))||null}function Ce(t={},r={},n={}){
return e.toDateOnly(t.deliveryDate||t.date||t.documentDate||r.deliveryDate||r.date||n.deliveryDate||n.date||n.documentDate||e.todayVN())}function ge(t={},r=null){const n=new Map
;for(const e of Array.isArray(r?.items)?r.items:[])n.set(String(e.lineKey||ce(e)).trim(),e);const d=(Array.isArray(t.items)?t.items:[]).map(e=>{const t=ce(e)
;return le(e,n.get(t)||{})}).filter(e=>e.productCode||e.productName),a=fe(d),u=a.totalReturnAmount>0||d.some(e=>s(e.returnQty)>0);return{...r||{},
id:String($(t,r)||r?.id||o("RO")).trim(),code:String($(t,r)||r?.code||o("RO")).trim(),date:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||r?.date||e.todayVN()),
documentDate:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||t.orderDate||r?.documentDate||r?.date||e.todayVN()),salesOrderId:t.id||r?.salesOrderId||"",
salesOrderCode:t.code||r?.salesOrderCode||"",orderId:t.id||r?.orderId||"",orderCode:t.code||r?.orderCode||"",customerId:t.customerId||r?.customerId||"",
customerCode:t.customerCode||r?.customerCode||"",customerName:t.customerName||r?.customerName||"",salesStaffId:t.salesStaffId||r?.salesStaffId||"",salesStaffCode:p(t)||p(r),
salesStaffName:h(t)||h(r),staffCode:O(t)||O(r),staffName:S(t)||S(r),masterOrderId:t.masterOrderId||r?.masterOrderId||"",masterOrderCode:t.masterOrderCode||r?.masterOrderCode||"",
deliveryStaffId:t.deliveryStaffId||r?.deliveryStaffId||"",deliveryStaffCode:O(t)||O(r),deliveryStaffName:S(t)||S(r),
deliveryDate:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||e.todayVN()),routeName:t.routeName||t.deliveryRoute||r?.routeName||"",
deliveryRoute:t.deliveryRoute||t.routeName||r?.deliveryRoute||"",items:d,...a,status:r&&H(r.status)?r.status:u?I.WAITING_RECEIVE:I.DRAFT,returnStatus:u?I.WAITING_RECEIVE:I.DRAFT,
returnState:u?I.WAITING_RECEIVE:I.DRAFT,returnMergeStatus:r?.returnMergeStatus||"unmerged",warehouseReceiveStatus:u?r?.warehouseReceiveStatus||I.WAITING_RECEIVE:I.DRAFT,
source:r?.source||"sales_order_draft",createdFrom:r?.createdFrom||"sales_order",accountingStatus:u?r?.accountingStatus||"pending":I.DRAFT,
accountingConfirmed:Boolean(r?.accountingConfirmed),postedAt:r?.postedAt||"",cancelledAt:"",deletedAt:"",updatedAt:e.nowIso(),createdAt:r?.createdAt||e.nowIso()}}
async function Ie(t={},r={}){if(!t||!t.id&&!t.code)return null;const d=await ye(t);if(!d)return{returnOrder:N(ge(t,null)),virtualDraft:!0,skipped:"no_return_quantity"}
;if(H(d.status))return{returnOrder:N(d),skipped:"posted"};const a=ge(t,d);if(!me(a)){const o={...a,items:[],totalQuantity:0,totalReturnAmount:0,totalAmount:0,amount:0,
debtReduction:0,status:I.CANCELLED,returnStatus:I.CANCELLED,returnState:I.CANCELLED,warehouseReceiveStatus:I.CANCELLED,accountingStatus:I.CANCELLED,cancelReason:"",cancelledAt:"",
clearedAt:e.nowIso(),updatedAt:e.nowIso(),note:"Đồng bộ đơn bán: không còn số lượng trả"};return r.dryRun||(await n.upsert(o,r),await ee(t,{hasReturn:!1,returnOrderId:"",
returnOrderCode:"",returnAmount:0},r),await te("clear_return_order",d,o,o.note)),{returnOrder:N(o),cleared:!0}}return await n.upsert(a,r),await ee(t,{hasReturn:!0,
returnOrderId:a.id||"",returnOrderCode:a.code||"",returnAmount:s(a.totalAmount??a.amount??0)},r),{returnOrder:N(a),updatedExisting:!0}}async function pe(e={},t={}){
return await ye(e)?Ie(e,t):{skipped:"not_found"}}async function he(t={},r={}){const d=await ye(t);if(!d)return{skipped:"not_found"};if(X(d))return{
error:"Phiếu trả hàng đã nhập kho/ghi sổ. Vui lòng tạo phiếu đảo trước khi hủy đơn.",status:400};const a={...d,...g.patchForState(d,I.CANCELLED),returnState:I.CANCELLED,
cancelReason:Y(r,"Huỷ theo đơn bán/giao"),cancelledAt:e.nowIso(),updatedAt:e.nowIso()};return r.dryRun?{returnOrder:N(a),dryRun:!0}:(await n.upsert(a,r),await ee(t,{hasReturn:!1,
returnOrderId:"",returnOrderCode:"",returnAmount:0},r),await te("cancel_return_order",d,a,a.cancelReason),{returnOrder:N(a)})}async function Oe(e={},t={}){const r=await ye(e)
;if(!r)return{returnOrder:N(ge(e,null)),virtualDraft:!0,skipped:"no_existing_return_order"};const d=ge(e,r);return me(d)?(d.status=me(d)?I.WAITING_RECEIVE:I.DRAFT,
d.returnStatus=d.status,d.returnState=d.status,d.cancelledAt="",await n.upsert(d,t),await ee(e,{hasReturn:!0,returnOrderId:d.id||"",returnOrderCode:d.code||"",
returnAmount:s(d.totalAmount??d.amount??0)},t),{returnOrder:N(d),updatedExisting:Boolean(r)}):{returnOrder:N(d),virtualDraft:!0,skipped:"no_return_quantity"}}
async function Se(t={},r=[],n={}){const d=T((r||[]).flatMap(e=>[e?.id,e?._id,e?.salesOrderId,e?.orderId])),a=T((r||[]).flatMap(e=>[e?.code,e?.orderCode,e?.salesOrderCode])),o=[]
;if(d.length&&(o.push({salesOrderId:{$in:d}}),o.push({orderId:{$in:d}})),a.length&&(o.push({salesOrderCode:{$in:a}}),o.push({orderCode:{$in:a}})),!o.length)return[];const u={$set:{
masterOrderId:t.id||"",masterOrderCode:t.code||"",deliveryStaffId:t.deliveryStaffId||"",deliveryStaffCode:t.deliveryStaffCode||"",deliveryStaffName:t.deliveryStaffName||"",
deliveryDate:e.toDateOnly(t.deliveryDate||t.date||e.todayVN()),routeName:t.routeName||"",deliveryRoute:t.deliveryRoute||t.routeName||"",
date:e.toDateOnly(t.deliveryDate||t.date||e.todayVN()),updatedAt:e.nowIso()}};return await C.updateMany({$or:o,status:{$in:R}},u,n.session?{session:n.session}:{}),F(r)}
async function Re(t=[],r={}){const n=T((t||[]).flatMap(e=>[e?.id,e?._id,e?.salesOrderId,e?.orderId])),d=T((t||[]).flatMap(e=>[e?.code,e?.orderCode,e?.salesOrderCode])),a=[]
;if(n.length&&(a.push({salesOrderId:{$in:n}}),a.push({orderId:{$in:n}})),d.length&&(a.push({salesOrderCode:{$in:d}}),a.push({orderCode:{$in:d}})),!a.length)return[]
;const o=T([r.expectedMasterOrderId,r.expectedMasterOrderCode]),u={$or:a,status:{$in:R}};return o.length&&(u.$and=[{$or:[{masterOrderId:{$in:o}},{masterOrderCode:{$in:o}},{
deliveryMasterId:{$in:o}},{deliveryMasterCode:{$in:o}}]}]),await C.updateMany(u,{$set:{updatedAt:e.nowIso()},$unset:{masterOrderId:"",masterOrderCode:"",deliveryMasterId:"",
deliveryMasterCode:"",deliveryStaffId:"",deliveryStaffCode:"",deliveryStaffName:"",deliveryCode:"",deliveryName:"",shipperCode:"",shipperName:"",nvghCode:"",nvghName:"",
staffDeliveryCode:"",staffDeliveryName:"",driverId:"",driverCode:"",driverName:"",staffCode:"",staffName:"",deliveryDate:"",routeName:"",deliveryRoute:""}},r.session?{
session:r.session}:{}),F(t)}async function Ae(e,t={},r={}){const n=String(e||t.salesOrderId||t.salesOrderCode||t.orderId||t.orderCode||"").trim();if(!n)return{
error:"Thiếu salesOrderId/salesOrderCode",status:400};const a=await d.findByIdOrCode(n),o={salesOrderId:a?.id||t.salesOrderId||t.orderId||n,
salesOrderCode:a?.code||t.salesOrderCode||t.orderCode||n};let u=await K(o);return!a||!1===r.ensureDraft||u&&H(u.status)?u?{returnOrder:N(u)}:{returnOrder:null}:{
returnOrder:N(ge(a,u||null)),virtualDraft:!u}}async function Ee(t,r={},a={}){const o=String(t||r.salesOrderId||r.salesOrderCode||r.orderId||r.orderCode||"").trim();if(!o)return{
error:"Thiếu salesOrderId/salesOrderCode",status:400};const u=await d.findByIdOrCode(o),i={...r,salesOrderId:u?.id||r.salesOrderId||r.orderId||o,
salesOrderCode:u?.code||r.salesOrderCode||r.orderCode||o};let c=await K(i);if(!c&&u&&(c=ge(u,null)),!c)return{error:"Không tìm thấy đơn gốc để tạo/cập nhật phiếu trả hàng",
status:404};const l=Z(c,"Phiếu trả hàng đã nhập kho/ghi sổ, không được sửa. Vui lòng tạo phiếu đảo nếu khách lấy lại hàng.");if(l)return l
;if("merged"===(c.returnMergeStatus||"unmerged")||c.masterReturnOrderId||c.masterReturnOrderCode)return{
error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, không được sửa số lượng trả",status:400};const m=Array.isArray(r.items)?r.items:[],f=new Map,y=new Map;for(const e of m){
const t=String(e.productCode||e.code||e.productId||"").trim(),r=String(e.lineKey||ce(e)).trim();t&&f.set(t,e),r&&y.set(r,e)}
const C=(Array.isArray(u?.items)&&u.items.length?ge(u,c).items:Array.isArray(c.items)?c.items:[]).map(e=>{
const t=String(e.lineKey||ce(e)).trim(),r=String(e.productCode||e.code||e.productId||"").trim(),n=y.get(t)||f.get(r)||null,d=s(n?n.returnQty??n.qtyReturn??n.returnQuantity??n.quantity??0:e.returnQty??e.qtyReturn??e.returnQuantity??0),a=s(e.soldQty??e.quantitySold??e.orderQty??e.totalQty??e.qtySold??0)
;if(d<0)throw new Error("Số lượng trả không được âm");if(a>0&&d>a)throw new Error(`Số lượng trả ${e.productCode||e.productName} không được lớn hơn số lượng giao`)
;const o=s(e.price??e.salePrice??e.unitPrice??0);return{...e,returnQty:d,qtyReturn:d,returnQuantity:d,returnedQty:d,quantity:d,qty:d,returnAmount:Math.round(d*o),
amount:Math.round(d*o),lineKey:t}}),p=fe(C),h=p.totalReturnAmount>0||C.some(e=>s(e.returnQty)>0),O=Ce(r,u||{},c||{}),S={...c,...p,date:O,deliveryDate:O,documentDate:O,items:C,
source:r.source||c.source||"returnOrders",updatedFrom:r.source||r.updatedFrom||"unknown",updatedBy:r.updatedBy||r.user||c.updatedBy||"",updatedAt:e.nowIso()};if(!h){
const t=await U({...i,...r,note:r.note||"Đã sửa hàng trả về 0 từ phần mềm"}),n={...S,items:[],totalQuantity:0,totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0,
status:I.CANCELLED,returnStatus:I.CANCELLED,returnState:I.CANCELLED,warehouseReceiveStatus:I.CANCELLED,accountingStatus:I.CANCELLED,cancelReason:"",cancelledAt:"",
clearedAt:e.nowIso(),note:r.note||"Đã sửa hàng trả về 0 từ phần mềm"};return u&&await ee(u,{hasReturn:!1,returnOrderId:"",returnOrderCode:"",returnAmount:0},a),
t.cleared>0&&await te("clear_return_order",c,t.returnOrder||n,n.note),{returnOrder:t.returnOrder||N(n),cleared:t.cleared>0,skippedCreate:t.cleared<=0}}const R={...S,
...g.patchForState(S,I.WAITING_RECEIVE),returnState:I.WAITING_RECEIVE,accountingStatus:"pending",cancelledAt:"",cancelReason:""};return await n.upsert(R,a),u&&await ee(u,{
hasReturn:!0,returnOrderId:R.id||"",returnOrderCode:R.code||"",returnAmount:s(R.totalAmount??R.amount??0)},a),
await te(c&&"cancelled"===c.status?"restore_return_order":"upsert_return_order",c,R,"Cập nhật số lượng hàng trả"),{returnOrder:N(R)}}async function Ne(t,r={},a={}){
const o=await n.findByIdOrCode(t);if(!o)return{error:"Không tìm thấy phiếu trả hàng",status:404};const u=J(o);if(u)return u
;if("merged"===(o.returnMergeStatus||"unmerged")||o.masterReturnOrderId||o.masterReturnOrderCode)return{error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, cần hủy gộp trước",
status:400};const s={...o,...g.patchForState(o,I.CANCELLED),returnState:I.CANCELLED,warehouseReceiveStatus:"cancelled",accountingStatus:"cancelled",
cancelReason:Y(r,"Khách lấy lại hàng"),cancelledAt:e.nowIso(),updatedAt:e.nowIso()};await n.upsert(s,a)
;const i=o.salesOrderId||o.orderId||o.salesOrderCode||o.orderCode||"",c=i?await d.findByIdOrCode(i):null;return c&&await ee(c,{hasReturn:!1,returnOrderId:"",returnOrderCode:"",
returnAmount:0},a),await te("cancel_return_order",o,s,s.cancelReason),{returnOrder:N(s)}}async function ve(t,r={},d={}){const a=await n.findByIdOrCode(t);if(!a)return{
error:"Không tìm thấy đơn chờ trả hàng",status:404};const o=Z(a,"Phiếu trả hàng đã ghi sổ/kho, không được sửa");if(o)return o
;if("merged"===(a.returnMergeStatus||"unmerged")||a.masterReturnOrderId||a.masterReturnOrderCode)return{
error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, không được sửa số lượng trả",status:400};const u=Array.isArray(r.items)?r.items:[],i=new Map;for(const e of u){
const t=String(e.lineKey||ce(e)).trim();t&&i.set(t,e)}const c=(Array.isArray(a.items)?a.items:[]).map(e=>{
const t=String(e.lineKey||ce(e)).trim(),r=i.get(t)||u.find(t=>String(t.productCode||t.code||"").trim()===String(e.productCode||"").trim()),n=s(r?r.returnQty??r.qtyReturn??r.returnQuantity??r.quantity??0:e.returnQty??e.qtyReturn??e.quantity??0),d=s(e.soldQty??e.quantitySold??0)
;if(n<0)throw new Error("Số lượng trả không được âm");if(n>d)throw new Error(`Số lượng trả ${e.productCode||e.productName} không được lớn hơn số lượng bán`)
;const a=s(e.price??e.salePrice??e.unitPrice??0);return{...e,returnQty:n,qtyReturn:n,returnQuantity:n,returnedQty:n,quantity:n,qty:n,returnAmount:Math.round(n*a),
amount:Math.round(n*a),lineKey:t}}),l=fe(c),m=l.totalReturnAmount>0||c.some(e=>s(e.returnQty)>0),f=m?I.WAITING_RECEIVE:I.CANCELLED,y=Ce(r,{},a||{}),C={...a,...m?l:{totalQuantity:0,
totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0},date:y,deliveryDate:y,documentDate:y,items:m?c:[],status:f,returnStatus:f,returnState:f,
warehouseReceiveStatus:m?I.WAITING_RECEIVE:I.CANCELLED,accountingStatus:m?"pending":I.CANCELLED,cancelReason:"",cancelledAt:"",clearedAt:m?"":e.nowIso(),
note:m?a.note:r.note||"Đã sửa hàng trả về 0",updatedAt:e.nowIso()};return await n.upsert(C,d),{returnOrder:N(C),cleared:!m}}module.exports={listReturnOrders:G,createReturnOrder:ne,
createPendingReturnOrder:oe,upsertDeliveryReturnOrder:ae,buildCanonicalReturnCode:$,findExistingReturnOrderForSalesOrder:V,cancelDuplicateReturnOrders:P,
confirmReceiveReturnOrder:se,confirmAccountingReturnOrder:ie,ensureReturnDraftForSalesOrder:Ie,syncReturnDraftWithSalesOrder:pe,cancelReturnDraftForSalesOrder:he,
restoreReturnDraftForSalesOrder:Oe,attachMasterOrderToReturnDrafts:Se,detachMasterOrderFromReturnDrafts:Re,getReturnOrderBySalesOrderKey:Ae,updateReturnDraftItemsBySalesOrder:Ee,
updateReturnDraftItems:ve,cancelReturnOrderById:Ne,toClient:N};
