/* GENERATED FILE — edit src/services/returnOrderLegacy.service.source/part-01.jsfrag, src/services/returnOrderLegacy.service.source/part-01b.jsfrag, src/services/returnOrderLegacy.service.source/part-02.jsfrag, src/services/returnOrderLegacy.service.source/part-02b.jsfrag, src/services/returnOrderLegacy.service.source/part-03.jsfrag, src/services/returnOrderLegacy.service.source/part-04.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),t=require("../utils/queryGuard.util"),{escapeRegex:r}=require("../utils/query.util"),n=require("../repositories/returnOrderRepository"),o=require("../repositories/orderRepository"),a=require("../repositories/customerRepository"),{makeId:s,normalizeText:d,toNumber:u}=require("../utils/common.util"),{withMongoTransaction:i}=require("../utils/transaction.util"),c=require("../domain/posting/InventoryPostingService"),l=require("../engines/posting.engine"),h=require("./financialService"),m=require("./auditService"),y=require("./mobile/warehouseReturnCheck.service"),C=require("../models/ReturnOrder"),f=require("../models/StockTransaction"),I=require("../domain/lifecycle/ReturnStateMachine"),{RETURN_STATES:p}=I,{guardLegacyReturnWrite:g}=require("./returns/ReturnOrderLegacyMutationGuard"),{pickSalesStaffCode:S,pickSalesStaffName:O,pickDeliveryStaffCode:k,pickDeliveryStaffName:R}=require("../domain/staff/staffIdentity"),A=["draft","pending","active","waiting_receive","pending_warehouse_receive","pending_warehouse_check","ready_to_stock_in","warehouse_matched","warehouse_discrepancy","merged","delivered","completed","has_return"]
;function E(e=[]){const t=e.reduce((e,t)=>{const r=String(t.code||"").match(/(\d+)$/);return Math.max(e,r?Number(r[1]):0)},0);return`THH${String(t+1).padStart(5,"0")}`}
function w(t={}){const r=[t.returnDate,t.date,t.documentDate,t.deliveryDate];for(const t of r){const r=e.toDateOnly(t||"");if(/^\d{4}-\d{2}-\d{2}$/.test(r))return r}return""}
function N(e=""){return String(e??"").trim()}function _(e=""){return N(e).toLowerCase()}function v(e={}){
return N(e.fullName||e.name||e.username||e.code||e.staffCode||e.id||"system")}function D(e={}){return N(e.code||e.staffCode||e.username||e.id||e._id||"system")}function T(e={}){
return U([e.id,e._id,e.code,e.returnOrderId,e.returnOrderCode])}function P(e=[]){return U((Array.isArray(e)?e:[]).map(e=>e&&(e.id||e._id||e.code||e.idempotencyKey)))}
function $(e={}){const t=I.getReturnState(e),r=I.normalizeReturnState(e.warehouseReceiveStatus||e.stockReceiveStatus||"")
;return Boolean(e.stockPosted)||"posted"===_(e.stockInStatus)||t===p.RECEIVED||t===p.ACCOUNTING_CONFIRMED||t===p.POSTED_TO_AR||r===p.RECEIVED}function B(e={}){
const t=_(e.warehouseCheckStatus||e.warehouseStatus||"")
;return["matched","match","confirmed","warehouse_matched"].includes(t)?"matched":["discrepancy","mismatch","blocked","warehouse_discrepancy"].includes(t)?"discrepancy":$(e)?"matched":"pending"
}function L(e={}){const t=_(e.stockInStatus||e.stockReceiveStatus||"");if($(e)||["posted","stocked_in","received"].includes(t))return"posted";const r=B(e)
;return"discrepancy"===r?"blocked":"matched"===r?"blocked"===t?"blocked":"ready":t||"pending"}function q(e={}){return b(e)||I.getReturnState(e)===p.CANCELLED}function M(e={}){
return!q(e)&&"matched"===B(e)&&"ready"===L(e)&&!$(e)}function Q(e={}){const t=B(e),r=L(e)
;return q(e)?"Đã hủy":"posted"===r?"Đã nhập kho":"discrepancy"===t?"Có lệch kho":"matched"===t&&"ready"===r?"Đã kiểm khớp - Chờ nhập kho":"Chờ thủ kho kiểm"}function V(e={}){
const t=w(e),r=B(e),n=L(e),o="posted"===n;return{...e,id:e.id||e.code,code:e.code||e.id,returnDate:t||e.returnDate||"",items:Array.isArray(e.items)?e.items:[],
totalQuantity:u(e.totalQuantity),totalAmount:u(e.totalAmount),warehouseCheckStatus:r,stockInStatus:n,stockPosted:o,canStockIn:M({...e,warehouseCheckStatus:r,stockInStatus:n,
stockPosted:o}),statusLabel:Q({...e,warehouseCheckStatus:r,stockInStatus:n,stockPosted:o})}}function b(e={}){const t=String(e.status||"").toLowerCase()
;return["cancelled","canceled","void","deleted","removed","duplicate_cancelled","cleared"].includes(t)||Boolean(e.deletedAt)}function W(e={}){
return u(e.debtReduction??e.totalAmount??e.amount??e.totalValue)}function G(e={}){return W(e)>0}async function F(e={},t={}){const r=T(e);if(!r.length)return[];const n={
direction:"IN",$or:[{sourceType:{$in:["RETURN_ORDER","RETURN_ORDER_STOCK_IN"]},sourceId:{$in:r}},{refType:{$in:["RETURN_ORDER","RETURN_ORDER_STOCK_IN"]},refId:{$in:r}}]
},o=f.find(n).select("id _id code idempotencyKey sourceType sourceId sourceCode refType refId refCode productCode quantity qty inQty direction type createdAt updatedAt"),a=t.session&&"function"==typeof o.session?o.session(t.session):o
;return("function"==typeof a.lean?await a.lean():await a)||[]}async function K(t={},r={}){const o=W(t);if(!t||o<=0)return{entry:null,returnOrder:t};I.assertCanPostAR(t)
;const a=await l.postReturnOrderAR({...t,debtReduction:o,amount:o,totalReturnAmount:o,source:"returnOrders",accountingConfirmed:!0,accountingStatus:p.ACCOUNTING_CONFIRMED},{...r,
skipIfExists:!0});if(!a)return{entry:null,returnOrder:t};const s=I.patchForState(t,p.POSTED_TO_AR),d={...t,...s,returnState:p.POSTED_TO_AR,stateChangedAt:e.nowIso(),
arLedgerId:a.id||a.code||t.arLedgerId||""};return await n.upsert(d,r),{entry:a,returnOrder:d}}function U(e=[]){
return[...new Set((e||[]).map(e=>String(e||"").trim()).filter(Boolean))]}function x(e={}){
const t=String(e.id||"").trim(),r=String(e.code||"").trim(),n=String(e.salesOrderId||e.orderId||e.sourceOrderId||e.deliveryOrderId||"").trim(),o=String(e.salesOrderCode||e.orderCode||e.sourceOrderCode||e.deliveryOrderCode||"").trim(),a=[]
;return t&&a.push({id:t}),r&&a.push({code:r}),n&&(a.push({salesOrderId:n}),a.push({orderId:n}),a.push({sourceOrderId:n}),a.push({deliveryOrderId:n})),o&&(a.push({salesOrderCode:o
}),a.push({orderCode:o}),a.push({sourceOrderCode:o}),a.push({deliveryOrderCode:o})),a.length?{$or:a}:null}function H(e={},t={}){
return String(e.code||e.orderCode||e.salesOrderCode||t.salesOrderCode||t.orderCode||t.code||"").trim()}function z(e={},t={}){
return String(e.id||e._id||t.salesOrderId||t.orderId||t.id||"").trim()}function j(e={},t={}){const r=H(e,t);if(!r)return"";const n=String(r).replace(/^RO[-_]?/i,"").trim()
;return n?`RO-${n}`:""}function Y({salesOrderId:e="",salesOrderCode:t="",returnCode:r=""}={}){const n=[];return r&&(n.push({code:r}),n.push({id:r})),e&&(n.push({salesOrderId:e}),
n.push({orderId:e}),n.push({sourceOrderId:e}),n.push({deliveryOrderId:e})),t&&(n.push({salesOrderCode:t}),n.push({orderCode:t}),n.push({sourceOrderCode:t}),n.push({
deliveryOrderCode:t}),n.push({code:`RO-${String(t).replace(/^RO[-_]?/i,"")}`})),n.length?{$or:n,status:{$nin:["deleted"]}}:null}function Z(e={},t=""){
const r=String(e.status||e.returnStatus||"").toLowerCase();let n=0;return!t||String(e.code||"")!==t&&String(e.id||"")!==t||(n+=1e3),String(e.code||"").startsWith("RO-")&&(n+=200),
String(e.id||"").startsWith("RO-")&&(n+=100),["waiting_receive","pending","draft","active","has_return"].includes(r)&&(n+=80),"cleared"===r&&(n+=40),
String(e.id||"").startsWith("RO-DRAFT-")&&(n+=10),String(e.id||"").startsWith("RO-MOBILE-")&&(n-=20),String(e.code||"").startsWith("THH")&&(n-=80),
["cancelled","canceled","cleared","void","deleted","removed","duplicate_cancelled"].includes(r)&&(n-=500),n}
async function J({salesOrderId:e="",salesOrderCode:t="",returnCode:r=""}={}){const o=Y({salesOrderId:e,salesOrderCode:t,returnCode:r});return o&&(await n.findAll(o,{sort:{
createdAt:1},limit:50})||[]).filter(e=>e&&!b(e)).sort((e,t)=>Z(t,r)-Z(e,r))[0]||null}
async function X({keepId:t,keepCode:r="",salesOrderId:o="",salesOrderCode:a="",returnCode:s=""}={}){const d=Y({salesOrderId:o,salesOrderCode:a,returnCode:s});if(!d)return{
cancelled:0};const u=await n.findAll(d,{sort:{createdAt:1},limit:100}),i=e.nowIso();let c=0;for(const e of u||[]){if(!e)continue
;if(t&&String(e._id||e.id||"")===String(t)||r&&(String(e.code||"")===String(r)||String(e.id||"")===String(r)))continue;const o=String(e.status||"").toLowerCase()
;["deleted","duplicate_cancelled"].includes(o)||"merged"===(e.returnMergeStatus||"unmerged")||e.masterReturnOrderId||e.masterReturnOrderCode||ie(e.status)||"received"===String(e.warehouseReceiveStatus||"").toLowerCase()||(await n.upsert({
...e,status:"duplicate_cancelled",returnStatus:"duplicate_cancelled",warehouseReceiveStatus:"duplicate_cancelled",accountingStatus:"duplicate_cancelled",items:[],amount:0,
totalAmount:0,totalQuantity:0,debtReduction:0,totalReturnAmount:0,duplicateReason:"Trùng phiếu trả cùng salesOrderId/salesOrderCode",updatedAt:i}),c+=1)}return{cancelled:c}}
async function ee(e=[],t={}){const r=[],o=[];for(const t of e||[])r.push(t?.salesOrderId,t?.orderId,t?.sourceOrderId,t?.deliveryOrderId,t?.id,t?._id),
o.push(t?.salesOrderCode,t?.orderCode,t?.sourceOrderCode,t?.deliveryOrderCode,t?.code);const a=U(r),s=U(o),d=[];return a.length&&(d.push({salesOrderId:{$in:a}}),d.push({orderId:{
$in:a}}),d.push({sourceOrderId:{$in:a}}),d.push({deliveryOrderId:{$in:a}})),s.length&&(d.push({salesOrderCode:{$in:s}}),d.push({orderCode:{$in:s}}),d.push({sourceOrderCode:{$in:s}
}),d.push({deliveryOrderCode:{$in:s}})),d.length?n.findAll({$or:d},{...t,projection:{id:1,code:1,salesOrderId:1,salesOrderCode:1,orderId:1,orderCode:1,sourceOrderId:1,
sourceOrderCode:1,deliveryOrderId:1,deliveryOrderCode:1,masterOrderId:1,masterOrderCode:1,masterReturnOrderId:1,masterReturnOrderCode:1,customerId:1,customerCode:1,customerName:1,
salesStaffId:1,salesStaffCode:1,salesStaffName:1,salesmanCode:1,salesmanName:1,deliveryStaffId:1,deliveryStaffCode:1,deliveryStaffName:1,staffCode:1,staffName:1,items:1,
totalQuantity:1,totalAmount:1,amount:1,debtReduction:1,status:1,returnStatus:1,returnMergeStatus:1,warehouseReceiveStatus:1,date:1,documentDate:1,deliveryDate:1,routeName:1,
deliveryRoute:1,createdAt:1,updatedAt:1}}):[]}const te=n.findAll;function re(e={},t=null,r=null){const n=j(r||{},e||{});return String(n||t?.code||e.code||`THH${s("")}`).trim()}
async function ne(t={}){const o={status:{$nin:["cancelled","canceled","void","deleted","removed","duplicate_cancelled"]}
},a=[],s=e.toDateOnly(t.dateFrom||t.fromDate||t.from||""),d=e.toDateOnly(t.dateTo||t.toDate||t.to||t.date||""),i=e.toDateOnly(t.date||""),c=Boolean(s||d||i);if(s&&d&&s>d){
const e=new Error("Từ ngày không được lớn hơn đến ngày");throw e.status=400,e.code="INVALID_RETURN_ORDER_DATE_RANGE",e}if(c){const e=i||{...s?{$gte:s}:{},...d?{$lte:d}:{}};a.push({
$or:[{returnDate:e},{date:e},{documentDate:e},{deliveryDate:e}]})}const l=U([t.salesOrderId,t.orderId,t.salesOrderCode,t.orderCode,t.orderKey,t.code,t.id]);l.length&&a.push({$or:[{
salesOrderId:{$in:l}},{orderId:{$in:l}},{sourceOrderId:{$in:l}},{deliveryOrderId:{$in:l}},{salesOrderCode:{$in:l}},{orderCode:{$in:l}},{sourceOrderCode:{$in:l}},{
deliveryOrderCode:{$in:l}},{id:{$in:l}},{code:{$in:l}}]}),t.masterOrderId&&(o.masterOrderId=String(t.masterOrderId).trim()),
t.masterOrderCode&&(o.masterOrderCode=String(t.masterOrderCode).trim()),t.customerCode&&(o.customerCode=String(t.customerCode).trim())
;const h=String(t.deliveryStaffCode||t.deliveryCode||t.nvghCode||t.delivery||"").trim();if(h){const e=new RegExp(r(h),"i");a.push({$or:[{deliveryStaffCode:e},{deliveryStaffName:e
},{deliveryCode:e},{deliveryName:e},{nvghCode:e},{nvghName:e}]})}const m=String(t.salesStaffCode||t.salesmanCode||t.nvbhCode||t.salesman||"").trim();if(m){
const e=new RegExp(r(m),"i");a.push({$or:[{salesStaffCode:e},{salesStaffName:e},{salesmanCode:e},{salesmanName:e},{nvbhCode:e},{nvbhName:e}]})}
const y=String(t.q||t.keyword||t.search||"").trim();if(y){const e=new RegExp(r(y),"i");a.push({$or:[{id:e},{code:e},{salesOrderCode:e},{orderCode:e},{customerCode:e},{
customerName:e},{deliveryStaffCode:e},{deliveryStaffName:e},{salesStaffCode:e},{salesStaffName:e},{note:e}]})}a.length&&(o.$and=a)
;const f="1"===String(t.includeZeroValue??t.showZero??"0"),I=Math.max(1,Math.trunc(Number(t.page||1))||1),p=Math.min(500,Math.max(1,Math.trunc(Number(t.limit||100))||100)),g=(I-1)*p
;if(n.findAll!==te)return(await n.findAll(o,{sort:{createdAt:-1,code:-1},skip:g,limit:p})).map(V).filter(t=>!c||e.isDateInRange(w(t),{date:i,dateFrom:s,dateTo:d
})).filter(e=>f||G(e));const S=f?{}:{_returnValue:{$gt:0}};c&&(S._businessDate=i||{...s?{$gte:s}:{},...d?{$lte:d}:{}});const O=[{$match:o},{$addFields:{_businessDate:{
$ifNull:["$returnDate",{$ifNull:["$date",{$ifNull:["$documentDate","$deliveryDate"]}]}]},_returnValue:{$convert:{input:{$ifNull:["$debtReduction",{$ifNull:["$totalAmount",{
$ifNull:["$amount","$totalValue"]}]}]},to:"double",onError:0,onNull:0}},_stableKey:{$ifNull:["$id",{$ifNull:["$code",{$toString:"$_id"}]}]}}},{$match:S},{$sort:{createdAt:-1,
code:-1}},{$group:{_id:"$_stableKey",doc:{$first:"$$ROOT"}}},{$replaceRoot:{newRoot:"$doc"}},{$sort:{createdAt:-1,code:-1}},{$facet:{rows:[{$skip:g},{$limit:p}],summary:[{$group:{
_id:null,count:{$sum:1},totalAmount:{$sum:"$_returnValue"}}}]}}],[k]=await C.aggregate(O),R=k?.rows||[],A=k?.summary?.[0]||{},E=R.map(e=>{
const{_businessDate:t,_returnValue:r,_stableKey:n,...o}=e||{};return V(o)}),N=u(A.count),_=u(A.totalAmount);return E.summary={count:N,totalAmount:_},E.pagination={page:I,limit:p,
totalRows:N,hasMore:I*p<N},E}async function oe(e={}){const t=String(e.salesOrderId||e.salesOrderCode||e.orderId||e.orderCode||"").trim();return t?o.findByIdOrCode(t):null}
async function ae(e={},t=null){const r=String(e.customerId||e.customerCode||e.customerName||t?.customerId||t?.customerCode||"").trim();return r?a.findByIdOrCode(r):null}
function se(e=[],t=null){const r=new Map((t?.items||[]).map(e=>[String(e.productCode||e.code||e.productId||"").trim(),e]));return(Array.isArray(e)?e:[]).map(e=>{
const t=String(e.productCode||e.code||e.productId||"").trim(),n=r.get(t)||{},o=u(e.qtyReturn??e.returnQuantity??e.returnedQty??e.returnQty??e.quantity??e.qty),a=u(e.price??e.salePrice??e.unitPrice??n.price??n.salePrice??0)
;return{...n,...e,productId:e.productId||n.productId||t,productCode:t||n.productCode||n.code||"",productName:e.productName||e.name||n.productName||n.name||"",quantity:o,qty:o,
price:a,salePrice:a,amount:u(e.amount??o*a)}}).filter(e=>e.quantity>0||e.productCode||e.productName)}async function de(e={}){
const t=await oe(e).catch(()=>null),r=z(t||{},e||{}),o=H(t||{},e||{}),a=j(t||{},{...e,salesOrderCode:o}),s=await J({salesOrderId:r,salesOrderCode:o,returnCode:a});if(s)return s
;const d=x(e);return d&&(await n.findAll(d,{sort:{updatedAt:-1,createdAt:-1},limit:20})).find(e=>!b(e))||null}async function ue(t={}){const r=x(t);if(!r)return{returnOrder:null,
cleared:0,rows:[]};const o=await n.findAll(r,{sort:{updatedAt:-1,createdAt:-1},limit:50
}),a=e.nowIso(),s=String(t.note||"NVGH sửa số lượng hàng trả về 0 trên app giao hàng").trim(),d=(o||[]).filter(e=>!(!e||b(e)||"merged"===(e.returnMergeStatus||"unmerged")||e.masterReturnOrderId||e.masterReturnOrderCode||ie(e.status)))
;let u=null;for(const e of d){const r={...e,items:[],totalQuantity:0,totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0,status:"cleared",returnStatus:"cleared",
accountingStatus:"cleared",warehouseReceiveStatus:"cleared",refType:e.refType||t.refType||"mobileDeliveryReturnClear",note:s,clearedAt:a,postedAt:"",receivedAt:"",updatedAt:a}
;await n.upsert(r),u=r}return{returnOrder:u?V(u):null,cleared:d.length,rows:d}}function ie(e=""){const t=I.normalizeReturnState(e)
;return[p.RECEIVED,p.ACCOUNTING_CONFIRMED,p.POSTED_TO_AR].includes(t)}function ce(e=""){const t=I.normalizeReturnState(e);return[p.DRAFT,p.WAITING_RECEIVE].includes(t)}
function le(e={}){try{return I.assertCanEdit(e),!0}catch(e){return!1}}function he(e={},t=""){
if(["matched","discrepancy"].includes(B(e))||["ready","blocked","posted"].includes(L(e)))return{error:t||"Phiếu trả đã được thủ kho kiểm, không được sửa từ NVGH/app giao hàng.",
message:"Phiếu trả đã được thủ kho kiểm, không được sửa từ NVGH/app giao hàng.",code:"RETURN_ORDER_WAREHOUSE_CHECKED_LOCKED",status:400};try{return I.assertCanEdit(e),null
}catch(e){return{error:t||e.message,message:e.message,code:e.code,status:400}}}function me(e={}){try{return I.assertCanCancel(e),null}catch(e){return{error:e.message,code:e.code,
status:400}}}function ye(e={}){if(["matched","discrepancy"].includes(B(e))||["ready","blocked","posted"].includes(L(e)))return!0;try{return I.assertCanCancel(e),!1}catch(e){
return!0}}function Ce(e={},t="Khách lấy lại hàng"){return String(e.cancelReason||e.reason||e.note||t).trim()}async function fe(t=null,r={},n={}){if(!t||!t.id&&!t.code)return null
;const a={...t,...r,updatedAt:e.nowIso()};return await o.upsert(a,n),a}async function Ie(e,t=null,r=null,n=""){await m.log(e,{refType:"returnOrder",refId:(r||t||{}).id||"",
refCode:(r||t||{}).code||"",before:t,after:r,note:n})}async function pe(t={}){const r=await oe(t),n=await ae(t,r);if(!n&&!t.customerName&&!r?.customerName)return{
error:"Không tìm thấy khách hàng",status:404};const o=se(t.items,r).filter(e=>u(e.quantity)>0);if(!o.length)return{error:"Phiếu trả hàng chưa có dòng hàng",status:400}
;const a=String(t.source||t.refType||"").toLowerCase()
;if((["mobileDeliveryReturn","erpDeliveryReturn"].includes(String(t.refType||""))||"returnOrders"===String(t.source||"")||a.includes("mobile_delivery")||a.includes("mobiledelivery"))&&!String(t.salesOrderId||"").trim()&&!String(t.salesOrderCode||"").trim())return{
error:"Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả",status:400};const d=await de(t),i=u(t.totalAmount??o.reduce((e,t)=>e+u(t.amount),0)),c=$e(t,r||{},d||{});return{
returnOrder:{...d||{},...t,id:String(j(r||{},t)||d?.id||t.id||s("RO")).trim(),code:re(t,d,r),date:c,documentDate:c,deliveryDate:c,
salesOrderId:r?.id||t.salesOrderId||t.orderId||d?.salesOrderId||"",salesOrderCode:r?.code||t.salesOrderCode||t.orderCode||d?.salesOrderCode||"",
orderId:r?.id||t.orderId||t.salesOrderId||d?.orderId||d?.salesOrderId||"",orderCode:r?.code||t.orderCode||t.salesOrderCode||d?.orderCode||d?.salesOrderCode||"",
customerId:n?.id||t.customerId||r?.customerId||d?.customerId||"",customerCode:n?.code||t.customerCode||r?.customerCode||d?.customerCode||"",
customerName:n?.name||t.customerName||r?.customerName||d?.customerName||"",salesStaffId:r?.salesStaffId||t.salesStaffId||d?.salesStaffId||"",salesStaffCode:S(r)||S(t)||S(d),
salesStaffName:O(r)||O(t)||O(d),salesmanCode:S(r)||S(t)||S(d),salesmanName:O(r)||O(t)||O(d),deliveryStaffId:r?.deliveryStaffId||t.deliveryStaffId||d?.deliveryStaffId||"",
deliveryStaffCode:k(r)||k(t)||k(d),deliveryStaffName:R(r)||R(t)||R(d),staffCode:k(r)||k(t)||k(d),staffName:R(r)||R(t)||R(d),note:String(t.note??d?.note??"").trim(),items:o,
totalQuantity:u(t.totalQuantity??o.reduce((e,t)=>e+u(t.quantity),0)),totalAmount:i,amount:u(t.amount??i),debtReduction:u(t.debtReduction??i),
status:t.status||d?.status||p.WAITING_RECEIVE,returnMergeStatus:t.returnMergeStatus||d?.returnMergeStatus||"unmerged",
warehouseReceiveStatus:t.warehouseReceiveStatus||d?.warehouseReceiveStatus||(ie(t.status)?p.RECEIVED:p.WAITING_RECEIVE),
warehouseCheckStatus:t.warehouseCheckStatus||d?.warehouseCheckStatus||(d&&$(d)?"matched":"pending"),warehouseCheckId:t.warehouseCheckId||d?.warehouseCheckId||"",
warehouseCheckedAt:t.warehouseCheckedAt||d?.warehouseCheckedAt||"",warehouseCheckedBy:t.warehouseCheckedBy||d?.warehouseCheckedBy||"",
warehouseCheckedByName:t.warehouseCheckedByName||d?.warehouseCheckedByName||"",warehouseCheckNote:t.warehouseCheckNote||d?.warehouseCheckNote||"",
stockInStatus:t.stockInStatus||d?.stockInStatus||(d&&$(d)?"posted":"pending"),stockPosted:Boolean(t.stockPosted??d?.stockPosted??!1),
stockPostedAt:t.stockPostedAt||d?.stockPostedAt||"",stockPostedBy:t.stockPostedBy||d?.stockPostedBy||"",stockPostedByName:t.stockPostedByName||d?.stockPostedByName||"",
stockTransactionId:t.stockTransactionId||d?.stockTransactionId||"",
stockTransactionIds:Array.isArray(t.stockTransactionIds)?t.stockTransactionIds:Array.isArray(d?.stockTransactionIds)?d.stockTransactionIds:[],
stockPostError:t.stockPostError||d?.stockPostError||"",source:t.source||d?.source||"returnOrders",accountingStatus:t.accountingStatus||d?.accountingStatus||"",
accountingConfirmed:Boolean(t.accountingConfirmed??d?.accountingConfirmed??!1),createdAt:d?.createdAt||t.createdAt||e.nowIso(),updatedAt:e.nowIso()},existing:d,salesOrder:r}}
async function ge(t={}){const r=await pe({...t,status:t.status||p.WAITING_RECEIVE,returnState:t.returnState||p.WAITING_RECEIVE,
warehouseReceiveStatus:t.warehouseReceiveStatus||p.WAITING_RECEIVE,warehouseCheckStatus:t.warehouseCheckStatus||"pending",stockInStatus:t.stockInStatus||"pending",stockPosted:!1})
;if(r.error)return r;const{returnOrder:o,existing:a,salesOrder:s}=r,d=await g(s,a||o,{},"c");if(d)return d;const u=he(a,o);if(u)return u;const i={...o,
...I.patchForState(o,p.WAITING_RECEIVE),returnState:p.WAITING_RECEIVE,warehouseReceiveStatus:p.WAITING_RECEIVE,warehouseCheckStatus:"pending",warehouseCheckId:"",
warehouseCheckedAt:"",warehouseCheckedBy:"",warehouseCheckedByName:"",warehouseCheckNote:o.warehouseCheckNote||"",stockInStatus:"pending",stockPosted:!1,stockPostedAt:"",
stockPostedBy:"",stockPostedByName:"",stockTransactionId:"",stockTransactionIds:[],stockPostError:"",updatedAt:e.nowIso()};return await n.upsert(i),
await Ie("return_order_created_pending_warehouse_check",a||null,i,"Tạo phiếu trả hàng chờ thủ kho kiểm, chưa cộng tồn kho"),{returnOrder:V(i),updatedExisting:Boolean(a)}}
function Se(e=[],t=null){const r=new Map((t?.items||[]).map(e=>[String(e.productCode||e.code||e.productId||"").trim(),e]));return(Array.isArray(e)?e:[]).map(e=>{
const t=String(e.productCode||e.code||e.productId||"").trim(),n=r.get(t)||{},o=u(e.qtyReturn??e.returnQty??e.returnQuantity??e.returnedQty??e.quantity??e.qty??0),a=u(e.price??e.salePrice??e.unitPrice??n.price??n.salePrice??n.unitPrice??0)
;return{...n,...e,productId:e.productId||n.productId||t,productCode:t||n.productCode||n.code||"",productName:e.productName||e.name||n.productName||n.name||"",quantity:o,qty:o,
qtyReturn:o,returnQty:o,returnQuantity:o,returnedQty:o,price:a,salePrice:a,unitPrice:a,amount:Math.round(u(e.amount??o*a)),reason:e.reason||""}
}).filter(e=>e.productCode&&u(e.qtyReturn)>0)}async function Oe(t={},r={}){const o=await oe(t),a=z(o||{},t||{}),d=H(o||{},t||{});if(!a&&!d)return{
error:"Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả",status:400};const i=j(o||{},{...t,salesOrderCode:d}),c=await ae(t,o)
;if(!c&&!t.customerName&&!o?.customerName)return{error:"Không tìm thấy khách hàng",status:404};const l=await J({salesOrderId:a,salesOrderCode:d,returnCode:i})
;if(l&&("merged"===(l.returnMergeStatus||"unmerged")||l.masterReturnOrderId||l.masterReturnOrderCode))return{
error:"Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng",status:400};const h=await g(o,l||{},r,"l");if(h)return h;if(l){
const e=he(l,"Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng");if(e)return e}
const m=Se(t.items,o),y=m.reduce((e,t)=>e+u(t.qtyReturn),0),C=m.reduce((e,t)=>e+u(t.amount??u(t.qtyReturn)*u(t.price||t.salePrice||t.unitPrice)),0),f=e.nowIso(),I={...l||{},...t,
id:i||l?.id||t.id||s("RO"),code:i||l?.code||t.code||s("RO"),date:e.toDateOnly(t.date||t.documentDate||l?.date||o?.deliveryDate||e.todayVN()),
documentDate:e.toDateOnly(t.documentDate||t.date||l?.documentDate||o?.date||e.todayVN()),
deliveryDate:e.toDateOnly(t.deliveryDate||o?.deliveryDate||l?.deliveryDate||t.date||e.todayVN()),salesOrderId:a,salesOrderCode:d,orderId:a,orderCode:d,
customerId:c?.id||t.customerId||o?.customerId||l?.customerId||"",customerCode:c?.code||t.customerCode||o?.customerCode||l?.customerCode||"",
customerName:c?.name||t.customerName||o?.customerName||l?.customerName||"",salesStaffId:o?.salesStaffId||t.salesStaffId||l?.salesStaffId||"",salesStaffCode:S(o)||S(t)||S(l),
salesStaffName:O(o)||O(t)||O(l),salesmanCode:S(o)||S(t)||S(l),salesmanName:O(o)||O(t)||O(l),deliveryStaffId:o?.deliveryStaffId||t.deliveryStaffId||l?.deliveryStaffId||"",
deliveryStaffCode:k(o)||k(t)||k(l),deliveryStaffName:R(o)||R(t)||R(l),staffCode:k(o)||k(t)||k(l),staffName:R(o)||R(t)||R(l),items:y>0?m:[],totalQuantity:y>0?y:0,
totalAmount:y>0?C:0,amount:y>0?C:0,debtReduction:y>0?C:0,totalReturnAmount:y>0?C:0,status:y>0?p.WAITING_RECEIVE:p.CANCELLED,returnStatus:y>0?p.WAITING_RECEIVE:p.CANCELLED,
returnState:y>0?p.WAITING_RECEIVE:p.CANCELLED,returnMergeStatus:l?.returnMergeStatus||t.returnMergeStatus||"unmerged",warehouseReceiveStatus:y>0?p.WAITING_RECEIVE:p.CANCELLED,
warehouseCheckStatus:y>0?"pending":"cancelled",warehouseCheckId:"",warehouseCheckedAt:"",warehouseCheckedBy:"",warehouseCheckedByName:"",warehouseCheckNote:"",
stockInStatus:y>0?"pending":p.CANCELLED,stockPosted:!1,stockPostedAt:"",stockPostedBy:"",stockPostedByName:"",stockTransactionId:"",stockTransactionIds:[],stockPostError:"",
source:t.source||l?.source||"mobile_delivery",accountingStatus:y>0?"pending":p.CANCELLED,accountingConfirmed:!1,postedAt:"",receivedAt:"",note:String(t.note??l?.note??"").trim(),
clearedAt:y>0?"":f,updatedAt:f,createdAt:l?.createdAt||t.createdAt||f};return await n.upsert(I,r),await X({keepId:l?._id||I.id,keepCode:I.code,salesOrderId:a,salesOrderCode:d,
returnCode:I.code}),{returnOrder:V(await J({salesOrderId:a,salesOrderCode:d,returnCode:I.code})||I),updatedExisting:Boolean(l),canonicalCode:I.code}}async function ke(e={},t={}){
const r=await pe({...e,status:e.status||p.WAITING_RECEIVE,returnMergeStatus:e.returnMergeStatus||"unmerged",warehouseReceiveStatus:e.warehouseReceiveStatus||p.WAITING_RECEIVE})
;if(r.error)return r
;const{returnOrder:o,existing:a,salesOrder:s}=r,d=u(o.totalQuantity??0)||(Array.isArray(o.items)?o.items.reduce((e,t)=>e+u(t.returnQty??t.qtyReturn??t.returnQuantity??t.quantity??t.qty??0),0):0),i=await g(s,a||o,t,d>0?"c":"z")
;if(i)return i;if(d<=0){const e=await ue(o);return{returnOrder:e.returnOrder||V({...o,items:[],totalQuantity:0,totalAmount:0,amount:0,debtReduction:0,status:p.CANCELLED,
returnStatus:p.CANCELLED,returnState:p.CANCELLED,warehouseReceiveStatus:p.CANCELLED,accountingStatus:p.CANCELLED}),updatedExisting:e.cleared>0,cleared:e.cleared,
skippedCreate:e.cleared<=0}}if(a&&("merged"===(a.returnMergeStatus||"unmerged")||a.masterReturnOrderId||a.masterReturnOrderCode))return{
error:"Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng",status:400};if(a){const e=he(a,"Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng")
;if(e)return e}const c={...o,...I.patchForState(o,p.WAITING_RECEIVE),returnState:p.WAITING_RECEIVE,returnMergeStatus:"unmerged",warehouseCheckStatus:"pending",warehouseCheckId:"",
warehouseCheckedAt:"",warehouseCheckedBy:"",warehouseCheckedByName:"",warehouseCheckNote:"",stockInStatus:"pending",stockPosted:!1,stockPostedAt:"",stockPostedBy:"",
stockPostedByName:"",stockTransactionId:"",stockTransactionIds:[],stockPostError:"",postedAt:"",receivedAt:""};return await n.upsert(c,t),{returnOrder:V({...c,
status:p.WAITING_RECEIVE,warehouseReceiveStatus:p.WAITING_RECEIVE}),updatedExisting:Boolean(a)}}async function Re(t,r={}){const o=r.session,a=await n.findByIdOrCode(t,{session:o})
;if(!a)return{error:"Không tìm thấy phiếu trả hàng",status:404};const s=I.getReturnState(a);if(s===p.RECEIVED||s===p.ACCOUNTING_CONFIRMED||s===p.POSTED_TO_AR)return{
returnOrder:V(a),alreadyReceived:!0};try{I.assertTransition(a,p.RECEIVED,"confirm_receive")}catch(e){return{error:e.message,code:e.code,status:400}}const d={...a,
...I.patchForState(a,p.RECEIVED),returnState:p.RECEIVED,receivedBy:String(r.receivedBy||a.receivedBy||"").trim(),stateChangedAt:e.nowIso(),updatedAt:e.nowIso()};await n.upsert(d,{
session:o});const u=await c.postReturnIn(d,{session:o}),i=e.nowIso(),l=P(u),h={...d,warehouseCheckStatus:"pending"===B(d)?"matched":B(d),stockInStatus:"posted",stockPosted:!0,
stockPostedAt:d.stockPostedAt||i,stockPostedBy:String(r.receivedBy||a.receivedBy||"").trim(),stockTransactionId:l[0]||d.stockTransactionId||"",
stockTransactionIds:l.length?l:Array.isArray(d.stockTransactionIds)?d.stockTransactionIds:[],stockPostError:"",updatedAt:i};return await n.upsert(h,{session:o}),{returnOrder:V(h),
alreadyReceived:!1}}async function Ae(e,t={}){return t.session?Re(e,t):i(r=>Re(e,{...t,session:r}))}async function Ee(e,t={},r="",n={},o={}){await m.log(e,{actor:n,
refType:"returnOrder",refId:t.id||t._id||t.code||"",refCode:t.code||t.id||"",before:{status:t.status,returnState:t.returnState,warehouseCheckStatus:t.warehouseCheckStatus,
stockInStatus:t.stockInStatus,stockPosted:t.stockPosted},after:{reason:r,...o},note:r})}async function we(t,r={},o={}){const a=o.user||r.user||{},s=await n.findByIdOrCode(t)
;if(!s)return{error:"Không tìm thấy phiếu trả hàng",status:404};const d=await F(s);if($(s)||d.length>0){const t=e.nowIso(),r=P(d),o={...s,
warehouseCheckStatus:"pending"===B(s)?"matched":B(s),stockInStatus:"posted",stockPosted:!0,stockPostedAt:s.stockPostedAt||s.receivedAt||t,stockPostedBy:s.stockPostedBy||D(a),
stockPostedByName:s.stockPostedByName||v(a),stockTransactionId:s.stockTransactionId||r[0]||"",
stockTransactionIds:Array.isArray(s.stockTransactionIds)&&s.stockTransactionIds.length?s.stockTransactionIds:r,stockPostError:"",updatedAt:t};return await n.upsert(o),
await Ee("return_order_stock_in_duplicate_attempt",o,"Phiếu trả đã nhập kho.",a,{stockTransactionIds:r}),{returnOrder:V(o),alreadyStockedIn:!0,message:"Phiếu trả đã nhập kho."}}
if(q(s))return await Ee("return_order_stock_in_blocked",s,"Phiếu trả đã hủy, không thể nhập kho.",a),{error:"Phiếu trả đã hủy, không thể nhập kho.",code:"RETURN_ORDER_CANCELLED",
status:400};if("matched"!==B(s))return await Ee("return_order_stock_in_blocked",s,"Phiếu trả chưa được thủ kho xác nhận khớp, chưa thể nhập kho.",a),{
error:"Phiếu trả chưa được thủ kho xác nhận khớp, chưa thể nhập kho.",code:"WAREHOUSE_CHECK_NOT_MATCHED",status:409}
;if("ready"!==L(s))return await Ee("return_order_stock_in_blocked",s,"Phiếu trả chưa ở trạng thái sẵn sàng nhập kho.",a),{error:"Phiếu trả chưa ở trạng thái sẵn sàng nhập kho.",
code:"RETURN_ORDER_STOCK_IN_NOT_READY",status:409};let u=null,l=[];return await i(async r=>{const o=await n.findByIdOrCode(t,{session:r});if(!o){
const e=new Error("Không tìm thấy phiếu trả hàng");throw e.status=404,e}const s=await F(o,{session:r});if($(o)||s.length>0){const t=P(s);return u={...o,
warehouseCheckStatus:"pending"===B(o)?"matched":B(o),stockInStatus:"posted",stockPosted:!0,stockPostedAt:o.stockPostedAt||o.receivedAt||e.nowIso(),
stockPostedBy:o.stockPostedBy||D(a),stockPostedByName:o.stockPostedByName||v(a),stockTransactionId:o.stockTransactionId||t[0]||"",
stockTransactionIds:Array.isArray(o.stockTransactionIds)&&o.stockTransactionIds.length?o.stockTransactionIds:t,stockPostError:"",updatedAt:e.nowIso()},await n.upsert(u,{session:r
}),void(l=s)}if("matched"!==B(o)||"ready"!==L(o)){const e=new Error("Phiếu trả chưa được thủ kho xác nhận khớp, chưa thể nhập kho.");throw e.code="WAREHOUSE_CHECK_NOT_MATCHED",
e.status=409,e}I.assertTransition(o,p.RECEIVED,"return_order_stock_in");const d=e.nowIso(),i={...o,...I.patchForState(o,p.RECEIVED),returnState:p.RECEIVED,
warehouseCheckStatus:"matched",stockInStatus:"ready",stockPosted:!1,receivedBy:D(a),stateChangedAt:d,updatedAt:d};await n.upsert(i,{session:r}),l=await c.postReturnIn(i,{session:r
});const h=P(l);u={...i,stockInStatus:"posted",stockPosted:!0,stockPostedAt:d,stockPostedBy:D(a),stockPostedByName:v(a),stockTransactionId:h[0]||"",stockTransactionIds:h,
stockPostError:"",updatedAt:d},await n.upsert(u,{session:r}),await m.record({action:"return_order_stock_in_posted",actor:a,refType:"returnOrder",refId:u.id||u._id||u.code||"",
refCode:u.code||u.id||"",before:{status:o.status,returnState:o.returnState,warehouseCheckStatus:o.warehouseCheckStatus,stockInStatus:o.stockInStatus,stockPosted:o.stockPosted},
after:{status:u.status,returnState:u.returnState,warehouseCheckStatus:u.warehouseCheckStatus,stockInStatus:u.stockInStatus,stockPosted:u.stockPosted,
warehouseCheckId:u.warehouseCheckId||"",stockTransactionIds:h},note:`Nhập kho phiếu trả ${u.code||u.id||""}`.trim()},{session:r})}),{returnOrder:V(u),stockTransactions:l,
alreadyStockedIn:Boolean(l.length&&l.every(e=>e&&e.skipped))}}async function Ne(t,r={},o={}){const a=await n.findByIdOrCode(t);if(!a)return{error:"Không tìm thấy phiếu trả hàng",
status:404};if("discrepancy"===B(a))return{error:`Phiếu trả ${a.code||a.id||""} có lệch kho, chưa thể chốt kế toán.`,code:"WAREHOUSE_RETURN_DISCREPANCY_BLOCKED",status:409}
;if("matched"!==B(a))return{error:`Phiếu trả ${a.code||a.id||""} chưa được thủ kho xác nhận khớp, chưa thể chốt kế toán.`,code:"WAREHOUSE_RETURN_CHECK_REQUIRED",status:409}
;if("posted"!==L(a))return{error:`Phiếu trả ${a.code||a.id||""} chưa nhập kho, chưa thể chốt kế toán.`,code:"RETURN_ORDER_STOCK_IN_REQUIRED",status:409};try{
I.assertCanConfirmAccounting(a)}catch(e){return{error:e.message,code:e.code,status:400}}if(await y.hasBlockingWarehouseReturnCheckForReturnOrder(a))return{
error:"Phiếu trả hàng chưa được thủ kho xác nhận. Vui lòng kiểm hàng trả trước khi chốt kế toán.",code:"WAREHOUSE_RETURN_CHECK_REQUIRED",status:409};let s=null
;return await i(async t=>{const d={...a,...I.patchForState(a,p.ACCOUNTING_CONFIRMED),returnState:p.ACCOUNTING_CONFIRMED,
accountingConfirmedBy:r.confirmedBy||r.user||o.user?.code||"system",accountingNote:r.note||a.accountingNote||"",stateChangedAt:e.nowIso(),updatedAt:e.nowIso()}
;I.assertTransition(a,p.ACCOUNTING_CONFIRMED,"confirm_accounting"),await n.upsert(d,{session:t});const u=await K(d,{session:t});s=u.returnOrder||d}),{returnOrder:V(s)}}
function _e(e={}){return[String(e.productCode||e.code||e.productId||"").trim(),String(e.unit||e.baseUnit||"").trim(),String(u(e.price??e.salePrice??e.unitPrice??0))].join("|")}
function ve(e={},t={}){
const r=u(e.quantity??e.qty??e.totalQty??e.soldQty??0),n=u(e.price??e.salePrice??e.unitPrice??t.price??t.salePrice??0),o=u(t.returnQty??t.qtyReturn??t.returnQuantity??t.quantity??0)
;return{...t,productId:e.productId||t.productId||e.productCode||e.code||"",productCode:String(e.productCode||e.code||e.productId||t.productCode||"").trim(),
productName:String(e.productName||e.name||t.productName||"").trim(),unit:String(e.unit||e.baseUnit||t.unit||"").trim(),soldQty:r,price:n,salePrice:n,unitPrice:n,
soldAmount:Math.round(r*n),returnQty:o,qtyReturn:o,returnQuantity:o,returnedQty:o,quantity:o,qty:o,returnAmount:Math.round(o*n),amount:Math.round(o*n),lineKey:_e({...e,price:n})}}
function De(e={}){
return(Array.isArray(e.items)?e.items:[]).some(e=>u(e.returnQty??e.qtyReturn??e.returnQuantity??e.quantity??0)>0)||u(e.totalReturnAmount??e.totalAmount??e.amount??e.debtReduction??0)>0
}function Te(e=[]){
const t=e.reduce((e,t)=>e+u(t.soldAmount??u(t.soldQty)*u(t.price)),0),r=e.reduce((e,t)=>e+u(t.returnAmount??u(t.returnQty)*u(t.price)),0),n=e.reduce((e,t)=>e+u(t.returnQty??t.qtyReturn??t.quantity),0)
;return{totalSoldAmount:Math.round(t),totalReturnAmount:Math.round(r),totalQuantity:n,totalAmount:Math.round(r),amount:Math.round(r),debtReduction:Math.round(r)}}
async function Pe(e={}){return(await ee([e],{sort:{updatedAt:-1,createdAt:-1},limit:20})).find(e=>e&&!b(e))||null}function $e(t={},r={},n={}){
return e.toDateOnly(t.deliveryDate||t.date||t.documentDate||r.deliveryDate||r.date||n.deliveryDate||n.date||n.documentDate||e.todayVN())}function Be(t={},r=null){const n=new Map
;for(const e of Array.isArray(r?.items)?r.items:[])n.set(String(e.lineKey||_e(e)).trim(),e);const o=(Array.isArray(t.items)?t.items:[]).map(e=>{const t=_e(e)
;return ve(e,n.get(t)||{})}).filter(e=>e.productCode||e.productName),a=Te(o),d=a.totalReturnAmount>0||o.some(e=>u(e.returnQty)>0);return{...r||{},
id:String(j(t,r)||r?.id||s("RO")).trim(),code:String(j(t,r)||r?.code||s("RO")).trim(),date:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||r?.date||e.todayVN()),
documentDate:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||t.orderDate||r?.documentDate||r?.date||e.todayVN()),salesOrderId:t.id||r?.salesOrderId||"",
salesOrderCode:t.code||r?.salesOrderCode||"",orderId:t.id||r?.orderId||"",orderCode:t.code||r?.orderCode||"",customerId:t.customerId||r?.customerId||"",
customerCode:t.customerCode||r?.customerCode||"",customerName:t.customerName||r?.customerName||"",salesStaffId:t.salesStaffId||r?.salesStaffId||"",salesStaffCode:S(t)||S(r),
salesStaffName:O(t)||O(r),staffCode:k(t)||k(r),staffName:R(t)||R(r),masterOrderId:t.masterOrderId||r?.masterOrderId||"",masterOrderCode:t.masterOrderCode||r?.masterOrderCode||"",
deliveryStaffId:t.deliveryStaffId||r?.deliveryStaffId||"",deliveryStaffCode:k(t)||k(r),deliveryStaffName:R(t)||R(r),
deliveryDate:e.toDateOnly(t.deliveryDate||r?.deliveryDate||t.date||e.todayVN()),routeName:t.routeName||t.deliveryRoute||r?.routeName||"",
deliveryRoute:t.deliveryRoute||t.routeName||r?.deliveryRoute||"",items:o,...a,status:r&&ie(r.status)?r.status:d?p.WAITING_RECEIVE:p.DRAFT,returnStatus:d?p.WAITING_RECEIVE:p.DRAFT,
returnState:d?p.WAITING_RECEIVE:p.DRAFT,returnMergeStatus:r?.returnMergeStatus||"unmerged",warehouseReceiveStatus:d?r?.warehouseReceiveStatus||p.WAITING_RECEIVE:p.DRAFT,
source:r?.source||"sales_order_draft",createdFrom:r?.createdFrom||"sales_order",accountingStatus:d?r?.accountingStatus||"pending":p.DRAFT,
accountingConfirmed:Boolean(r?.accountingConfirmed),postedAt:r?.postedAt||"",cancelledAt:"",deletedAt:"",updatedAt:e.nowIso(),createdAt:r?.createdAt||e.nowIso()}}
async function Le(t={},r={}){if(!t||!t.id&&!t.code)return null;const o=await Pe(t);if(!o)return{returnOrder:V(Be(t,null)),virtualDraft:!0,skipped:"no_return_quantity"}
;if(ie(o.status))return{returnOrder:V(o),skipped:"posted"};const a=await g(t,o,r,"u");if(a)return a;const s=Be(t,o);if(!De(s)){const a={...s,items:[],totalQuantity:0,
totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0,status:p.CANCELLED,returnStatus:p.CANCELLED,returnState:p.CANCELLED,warehouseReceiveStatus:p.CANCELLED,
accountingStatus:p.CANCELLED,cancelReason:"",cancelledAt:"",clearedAt:e.nowIso(),updatedAt:e.nowIso(),note:"Đồng bộ đơn bán: không còn số lượng trả"}
;return r.dryRun||(await n.upsert(a,r),await fe(t,{hasReturn:!1,returnOrderId:"",returnOrderCode:"",returnAmount:0},r),await Ie("clear_return_order",o,a,a.note)),{returnOrder:V(a),
cleared:!0}}return await n.upsert(s,r),await fe(t,{hasReturn:!0,returnOrderId:s.id||"",returnOrderCode:s.code||"",returnAmount:u(s.totalAmount??s.amount??0)},r),{returnOrder:V(s),
updatedExisting:!0}}async function qe(e={},t={}){return await Pe(e)?Le(e,t):{skipped:"not_found"}}async function Me(t={},r={}){const o=await Pe(t);if(!o)return{skipped:"not_found"}
;const a=await g(t,o,r,"x");if(a)return a;if(ye(o))return{error:"Phiếu trả hàng đã nhập kho/ghi sổ. Vui lòng tạo phiếu đảo trước khi hủy đơn.",status:400};const s={...o,
...I.patchForState(o,p.CANCELLED),returnState:p.CANCELLED,cancelReason:Ce(r,"Huỷ theo đơn bán/giao"),cancelledAt:e.nowIso(),updatedAt:e.nowIso()};return r.dryRun?{returnOrder:V(s),
dryRun:!0}:(await n.upsert(s,r),await fe(t,{hasReturn:!1,returnOrderId:"",returnOrderCode:"",returnAmount:0},r),await Ie("cancel_return_order",o,s,s.cancelReason),{returnOrder:V(s)
})}async function Qe(e={},t={}){const r=await Pe(e);if(!r)return{returnOrder:V(Be(e,null)),virtualDraft:!0,skipped:"no_existing_return_order"};const o=await g(e,r,t,"r")
;if(o)return o;const a=Be(e,r);return De(a)?(a.status=De(a)?p.WAITING_RECEIVE:p.DRAFT,a.returnStatus=a.status,a.returnState=a.status,a.cancelledAt="",await n.upsert(a,t),
await fe(e,{hasReturn:!0,returnOrderId:a.id||"",returnOrderCode:a.code||"",returnAmount:u(a.totalAmount??a.amount??0)},t),{returnOrder:V(a),updatedExisting:Boolean(r)}):{
returnOrder:V(a),virtualDraft:!0,skipped:"no_return_quantity"}}async function Ve(t={},r=[],n={}){
const o=U((r||[]).flatMap(e=>[e?.id,e?._id,e?.salesOrderId,e?.orderId])),a=U((r||[]).flatMap(e=>[e?.code,e?.orderCode,e?.salesOrderCode])),s=[];if(o.length&&(s.push({salesOrderId:{
$in:o}}),s.push({orderId:{$in:o}})),a.length&&(s.push({salesOrderCode:{$in:a}}),s.push({orderCode:{$in:a}})),!s.length)return[];const d={$set:{masterOrderId:t.id||"",
masterOrderCode:t.code||"",deliveryStaffId:t.deliveryStaffId||"",deliveryStaffCode:t.deliveryStaffCode||"",deliveryStaffName:t.deliveryStaffName||"",
deliveryDate:e.toDateOnly(t.deliveryDate||t.date||e.todayVN()),routeName:t.routeName||"",deliveryRoute:t.deliveryRoute||t.routeName||"",
date:e.toDateOnly(t.deliveryDate||t.date||e.todayVN()),updatedAt:e.nowIso()}};return await C.updateMany({$or:s,status:{$in:A}},d,n.session?{session:n.session}:{}),ee(r)}
async function be(t=[],r={}){const n=U((t||[]).flatMap(e=>[e?.id,e?._id,e?.salesOrderId,e?.orderId])),o=U((t||[]).flatMap(e=>[e?.code,e?.orderCode,e?.salesOrderCode])),a=[]
;if(n.length&&(a.push({salesOrderId:{$in:n}}),a.push({orderId:{$in:n}})),o.length&&(a.push({salesOrderCode:{$in:o}}),a.push({orderCode:{$in:o}})),!a.length)return[]
;const s=U([r.expectedMasterOrderId,r.expectedMasterOrderCode]),d={$or:a,status:{$in:A}};return s.length&&(d.$and=[{$or:[{masterOrderId:{$in:s}},{masterOrderCode:{$in:s}},{
deliveryMasterId:{$in:s}},{deliveryMasterCode:{$in:s}}]}]),await C.updateMany(d,{$set:{updatedAt:e.nowIso()},$unset:{masterOrderId:"",masterOrderCode:"",deliveryMasterId:"",
deliveryMasterCode:"",deliveryStaffId:"",deliveryStaffCode:"",deliveryStaffName:"",deliveryCode:"",deliveryName:"",shipperCode:"",shipperName:"",nvghCode:"",nvghName:"",
staffDeliveryCode:"",staffDeliveryName:"",driverId:"",driverCode:"",driverName:"",staffCode:"",staffName:"",deliveryDate:"",routeName:"",deliveryRoute:""}},r.session?{
session:r.session}:{}),ee(t)}async function We(e,t={},r={}){const n=String(e||t.salesOrderId||t.salesOrderCode||t.orderId||t.orderCode||"").trim();if(!n)return{
error:"Thiếu salesOrderId/salesOrderCode",status:400};const a=await o.findByIdOrCode(n),s={salesOrderId:a?.id||t.salesOrderId||t.orderId||n,
salesOrderCode:a?.code||t.salesOrderCode||t.orderCode||n};let d=await de(s);return!a||!1===r.ensureDraft||d&&ie(d.status)?d?{returnOrder:V(d)}:{returnOrder:null}:{
returnOrder:V(Be(a,d||null)),virtualDraft:!d}}async function Ge(t,r={},a={}){const s=String(t||r.salesOrderId||r.salesOrderCode||r.orderId||r.orderCode||"").trim();if(!s)return{
error:"Thiếu salesOrderId/salesOrderCode",status:400};const d=await o.findByIdOrCode(s),i={...r,salesOrderId:d?.id||r.salesOrderId||r.orderId||s,
salesOrderCode:d?.code||r.salesOrderCode||r.orderCode||s};let c=await de(i);!c&&d&&(c=Be(d,null));const l=await g(d,c,a,"u");if(l)return l;if(!c)return{
error:"Không tìm thấy đơn gốc để tạo/cập nhật phiếu trả hàng",status:404}
;const h=he(c,"Phiếu trả hàng đã nhập kho/ghi sổ, không được sửa. Vui lòng tạo phiếu đảo nếu khách lấy lại hàng.");if(h)return h
;if("merged"===(c.returnMergeStatus||"unmerged")||c.masterReturnOrderId||c.masterReturnOrderCode)return{
error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, không được sửa số lượng trả",status:400};const m=Array.isArray(r.items)?r.items:[],y=new Map,C=new Map;for(const e of m){
const t=String(e.productCode||e.code||e.productId||"").trim(),r=String(e.lineKey||_e(e)).trim();t&&y.set(t,e),r&&C.set(r,e)}
const f=(Array.isArray(d?.items)&&d.items.length?Be(d,c).items:Array.isArray(c.items)?c.items:[]).map(e=>{
const t=String(e.lineKey||_e(e)).trim(),r=String(e.productCode||e.code||e.productId||"").trim(),n=C.get(t)||y.get(r)||null,o=u(n?n.returnQty??n.qtyReturn??n.returnQuantity??n.quantity??0:e.returnQty??e.qtyReturn??e.returnQuantity??0),a=u(e.soldQty??e.quantitySold??e.orderQty??e.totalQty??e.qtySold??0)
;if(o<0)throw new Error("Số lượng trả không được âm");if(a>0&&o>a)throw new Error(`Số lượng trả ${e.productCode||e.productName} không được lớn hơn số lượng giao`)
;const s=u(e.price??e.salePrice??e.unitPrice??0);return{...e,returnQty:o,qtyReturn:o,returnQuantity:o,returnedQty:o,quantity:o,qty:o,returnAmount:Math.round(o*s),
amount:Math.round(o*s),lineKey:t}}),S=Te(f),O=S.totalReturnAmount>0||f.some(e=>u(e.returnQty)>0),k=$e(r,d||{},c||{}),R={...c,...S,date:k,deliveryDate:k,documentDate:k,items:f,
source:r.source||c.source||"returnOrders",updatedFrom:r.source||r.updatedFrom||"unknown",updatedBy:r.updatedBy||r.user||c.updatedBy||"",updatedAt:e.nowIso()};if(!O){
const t=await ue({...i,...r,note:r.note||"Đã sửa hàng trả về 0 từ phần mềm"}),n={...R,items:[],totalQuantity:0,totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0,
status:p.CANCELLED,returnStatus:p.CANCELLED,returnState:p.CANCELLED,warehouseReceiveStatus:p.CANCELLED,accountingStatus:p.CANCELLED,cancelReason:"",cancelledAt:"",
clearedAt:e.nowIso(),note:r.note||"Đã sửa hàng trả về 0 từ phần mềm"};return d&&await fe(d,{hasReturn:!1,returnOrderId:"",returnOrderCode:"",returnAmount:0},a),
t.cleared>0&&await Ie("clear_return_order",c,t.returnOrder||n,n.note),{returnOrder:t.returnOrder||V(n),cleared:t.cleared>0,skippedCreate:t.cleared<=0}}const A={...R,
...I.patchForState(R,p.WAITING_RECEIVE),returnState:p.WAITING_RECEIVE,accountingStatus:"pending",cancelledAt:"",cancelReason:""};return await n.upsert(A,a),d&&await fe(d,{
hasReturn:!0,returnOrderId:A.id||"",returnOrderCode:A.code||"",returnAmount:u(A.totalAmount??A.amount??0)},a),
await Ie(c&&"cancelled"===c.status?"restore_return_order":"upsert_return_order",c,A,"Cập nhật số lượng hàng trả"),{returnOrder:V(A)}}async function Fe(t,r={},a={}){
const s=await n.findByIdOrCode(t);if(!s)return{error:"Không tìm thấy phiếu trả hàng",status:404};const d=await g({},s,a,"x");if(d)return d;const u=me(s);if(u)return u
;if("merged"===(s.returnMergeStatus||"unmerged")||s.masterReturnOrderId||s.masterReturnOrderCode)return{error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, cần hủy gộp trước",
status:400};const i={...s,...I.patchForState(s,p.CANCELLED),returnState:p.CANCELLED,warehouseReceiveStatus:"cancelled",accountingStatus:"cancelled",
cancelReason:Ce(r,"Khách lấy lại hàng"),cancelledAt:e.nowIso(),updatedAt:e.nowIso()};await n.upsert(i,a)
;const c=s.salesOrderId||s.orderId||s.salesOrderCode||s.orderCode||"",l=c?await o.findByIdOrCode(c):null;return l&&await fe(l,{hasReturn:!1,returnOrderId:"",returnOrderCode:"",
returnAmount:0},a),await Ie("cancel_return_order",s,i,i.cancelReason),{returnOrder:V(i)}}async function Ke(t,r={},o={}){const a=await n.findByIdOrCode(t);if(!a)return{
error:"Không tìm thấy đơn chờ trả hàng",status:404};const s=he(a,"Phiếu trả hàng đã ghi sổ/kho, không được sửa");if(s)return s
;if("merged"===(a.returnMergeStatus||"unmerged")||a.masterReturnOrderId||a.masterReturnOrderCode)return{
error:"Phiếu trả hàng đã gộp đơn tổng trả hàng, không được sửa số lượng trả",status:400};const d=Array.isArray(r.items)?r.items:[],i=new Map;for(const e of d){
const t=String(e.lineKey||_e(e)).trim();t&&i.set(t,e)}const c=(Array.isArray(a.items)?a.items:[]).map(e=>{
const t=String(e.lineKey||_e(e)).trim(),r=i.get(t)||d.find(t=>String(t.productCode||t.code||"").trim()===String(e.productCode||"").trim()),n=u(r?r.returnQty??r.qtyReturn??r.returnQuantity??r.quantity??0:e.returnQty??e.qtyReturn??e.quantity??0),o=u(e.soldQty??e.quantitySold??0)
;if(n<0)throw new Error("Số lượng trả không được âm");if(n>o)throw new Error(`Số lượng trả ${e.productCode||e.productName} không được lớn hơn số lượng bán`)
;const a=u(e.price??e.salePrice??e.unitPrice??0);return{...e,returnQty:n,qtyReturn:n,returnQuantity:n,returnedQty:n,quantity:n,qty:n,returnAmount:Math.round(n*a),
amount:Math.round(n*a),lineKey:t}}),l=Te(c),h=l.totalReturnAmount>0||c.some(e=>u(e.returnQty)>0),m=h?p.WAITING_RECEIVE:p.CANCELLED,y=$e(r,{},a||{}),C={...a,...h?l:{totalQuantity:0,
totalReturnAmount:0,totalAmount:0,amount:0,debtReduction:0},date:y,deliveryDate:y,documentDate:y,items:h?c:[],status:m,returnStatus:m,returnState:m,
warehouseReceiveStatus:h?p.WAITING_RECEIVE:p.CANCELLED,accountingStatus:h?"pending":p.CANCELLED,cancelReason:"",cancelledAt:"",clearedAt:h?"":e.nowIso(),
note:h?a.note:r.note||"Đã sửa hàng trả về 0",updatedAt:e.nowIso()};return await n.upsert(C,o),{returnOrder:V(C),cleared:!h}}module.exports={listReturnOrders:ne,
createReturnOrder:ge,createPendingReturnOrder:ke,upsertDeliveryReturnOrder:Oe,buildCanonicalReturnCode:j,findExistingReturnOrderForSalesOrder:J,cancelDuplicateReturnOrders:X,
confirmReceiveReturnOrder:Ae,stockInReturnOrder:we,confirmAccountingReturnOrder:Ne,ensureReturnDraftForSalesOrder:Le,syncReturnDraftWithSalesOrder:qe,
cancelReturnDraftForSalesOrder:Me,restoreReturnDraftForSalesOrder:Qe,attachMasterOrderToReturnDrafts:Ve,detachMasterOrderFromReturnDrafts:be,getReturnOrderBySalesOrderKey:We,
updateReturnDraftItemsBySalesOrder:Ge,updateReturnDraftItems:Ke,cancelReturnOrderById:Fe,toClient:V};
