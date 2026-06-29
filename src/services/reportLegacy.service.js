/* GENERATED FILE — edit src/services/reportLegacy.service.source/part-01.jsfrag, src/services/reportLegacy.service.source/part-02.jsfrag, src/services/reportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),t=require("../models/Product"),r=require("../models/StockTransaction"),o=require("../models/SalesOrder"),a=require("../models/MasterOrder"),d=require("../models/Receipt"),n=require("../models/ArLedger"),i=require("../models/FundLedger"),s=require("../models/Cashbook"),u=require("../models/Bankbook"),l=require("../models/ReturnOrder"),c=require("../models/ImportOrder"),{normalizeText:m,toNumber:f}=require("../utils/common.util"),{STOCK_WAREHOUSE_CODE:$,STOCK_WAREHOUSE_NAME:y}=require("../constants/business.constants"),p=require("./inventoryStock.service"),{DEBT_ZERO_TOLERANCE:g,normalizeDebtAmount:C,hasOpenDebt:A,isOverpaid:b}=require("../constants/finance.constants")
;function N(t,r){const o=new Date(e.toDateOnly(t)),a=new Date(e.toDateOnly(r))
;return Number.isNaN(o.getTime())||Number.isNaN(a.getTime())?0:Math.floor((o.getTime()-a.getTime())/864e5)}function v(e={}){
return!["void","cancelled","canceled","deleted","duplicate_cancelled"].includes(String(e.status||"").toLowerCase())}function h(t,r={}){
const o=e.toDateOnly(t.date||t.documentDate||t.orderDate||t.deliveryDate||t.createdAt);return!(r.dateFrom&&o<r.dateFrom||r.dateTo&&o>r.dateTo||r.date&&o!==r.date)}function S(e={}){
return f(e.totalAmount??e.amount??e.grandTotal??e.total??e.value)}function D(e=[],t=S){return e.reduce((e,r)=>e+f(t(r)),0)}
const R=["void","cancelled","canceled","deleted","duplicate_cancelled"];function O(e,t,r={}){"test"!==process.env.NODE_ENV&&console.error("[REPORT_DATA_SOURCE_FAILED]",{report:t,
query:r,error:e?.message||String(e||"")});const o=new Error(`Không thể tải dữ liệu báo cáo ${t}`);return o.code="REPORT_DATA_SOURCE_FAILED",o.status=503,o.cause=e,o}
async function I(e,t,r){try{return await r()}catch(r){throw O(r,e,t)}}function _(e={},t=50,r=200){const o=se(e.page),a=ie(e.limit,t,r);return{page:o,limit:a,skip:(o-1)*a}}
function T(e,t,r){const o=Math.max(0,f(r));return{page:e,limit:t,total:o,totalPages:o>0?Math.ceil(o/t):0,hasMore:e*t<o}}function k(e={},t={},r=[]){
const o=String(t.q||t.keyword||t.search||"").trim();if(!o)return e;const a=new RegExp(ne(o),"i");return{$and:[e,{$or:r.map(e=>({[e]:a}))}]}}function w(e=[],t=0){
return e.reduceRight((e,t)=>({$ifNull:[`$${t}`,e]}),t)}function x(e=[],t=0){return{$convert:{input:w(e,t),to:"double",onError:0,onNull:0}}}function E(e=[],t={},r=[]){
const o=m(t.q||t.keyword||t.search);return o?e.filter(e=>r.some(t=>m(e[t]).includes(o))):e}function L(t={},r=["date","createdAt"]){
const o=e.toDateOnly(t.date||""),a=e.toDateOnly(t.dateFrom||o||""),d=e.toDateOnly(t.dateTo||o||"");if(!a&&!d)return{};const n=o||{...a?{$gte:a}:{},...d?{$lte:d}:{}
},i=r.filter(e=>"createdAt"!==e).map(e=>({[e]:n}));if(r.includes("createdAt")){const e={};if(a&&(e.$gte=new Date(`${a}T00:00:00+07:00`)),d){const t=new Date(`${d}T00:00:00+07:00`)
;t.setDate(t.getDate()+1),e.$lt=t}i.push({createdAt:e})}return 1===i.length?i[0]:{$or:i}}function M(e={},t=["date","createdAt"]){return{status:{
$nin:["void","cancelled","canceled","deleted","duplicate_cancelled"]},...L(e,t)}}function Q(t={}){const r={};return t.productCode&&(r.productCode=String(t.productCode).trim()),
(t.date||t.dateFrom||t.dateTo)&&(r.date={},t.dateFrom&&(r.date.$gte=e.toDateOnly(t.dateFrom)),t.dateTo&&(r.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(r.date=e.toDateOnly(t.date))),
r}function q(e={}){const t=String(e.direction||"").toUpperCase();return t?"IN"===t:f(e.quantity??e.qty)>=0}function U(e={}){return f(e.quantity??e.qty??0)}async function F(o={}){
const a=m(o.q),d=Boolean(o.dateFrom||o.dateTo||o.asOfDate||"movement"===o.mode),n=["1","true","yes"].includes(String(o.full||o.export||"").toLowerCase()),{page:i,limit:s,skip:u}=_(o,50,200)
;if(d){const d=e.toDateOnly(o.dateFrom||"0000-01-01"),l=e.toDateOnly(o.dateTo||o.asOfDate||e.todayVN()),[c,p]=await I("tồn kho theo kỳ",o,()=>Promise.all([r.find(L({dateTo:l
},["date","createdAt"])).sort({date:1,createdAt:1,productCode:1}).lean(),t.find({}).lean()])),g=new Map(p.map(e=>[String(e.code||e.id||e._id),e])),C=new Map;c.forEach(t=>{
const r=e.toDateOnly(t.date||t.createdAt);if(r>l)return;const o=String(t.productCode||t.productId||"").trim(),a=g.get(o)||{};C.has(o)||C.set(o,{
productId:t.productId||a.id||String(a._id||""),productCode:o,productName:t.productName||a.name||"",warehouseCode:$,warehouseName:y,unit:a.unit||t.unit||"",openingQty:0,importQty:0,
exportQty:0,returnQty:0,adjustmentQty:0,endingQty:0});const n=C.get(o),i=U(t);if(r<d)n.openingQty+=i;else{const e=String(t.type||"").toUpperCase()
;e.includes("RETURN")?n.returnQty+=Math.abs(i):e.includes("IMPORT")||q(t)?n.importQty+=Math.abs(i):e.includes("SALE")||!q(t)?n.exportQty+=Math.abs(i):n.adjustmentQty+=i}
n.endingQty+=i});let A=Array.from(C.values()).map(e=>({...e,inQty:e.importQty+e.returnQty+Math.max(0,e.adjustmentQty),outQty:e.exportQty+Math.abs(Math.min(0,e.adjustmentQty)),
quantity:e.endingQty,qty:e.endingQty,availableQty:e.endingQty}));a&&(A=A.filter(e=>[e.productCode,e.productName].some(e=>m(e).includes(a))))
;const b=A.filter(e=>f(e.quantity??e.qty??e.availableQty)<0),N=A.reduce((e,t)=>(e.totalRows+=1,e.openingQty+=f(t.openingQty),e.importQty+=f(t.importQty),
e.exportQty+=f(t.exportQty),e.returnQty+=f(t.returnQty),e.endingQty+=f(t.endingQty),e),{totalRows:0,openingQty:0,importQty:0,exportQty:0,returnQty:0,endingQty:0})
;N.negativeStockCount=b.length;const v=n?A:A.slice(u,u+s);return{source:"mongo_stock_transactions",dateFrom:d,dateTo:l,stock:v,items:v,
meta:n?T(1,Math.max(A.length,1),A.length):T(i,s,A.length),summary:N,negativeStockCount:b.length,negativeStockRows:b}}
const l=await I("tồn kho hiện tại",o,()=>p.getInventorySummary(o)),c=l.stock||[],g=n?c:c.slice(u,u+s);return{...l,source:"mongo_inventories_canonical",
inventorySource:"inventories",stock:g,items:g,meta:n?T(1,Math.max(c.length,1),c.length):T(i,s,c.length),summary:l.summary,negativeStockCount:l.negativeStockCount,
negativeStockRows:l.negativeStockRows}}async function B(t={}){
const{page:o,limit:a,skip:d}=_(t,50,200),n=k(Q(t),t,["productCode","productName","warehouseCode","refCode","refType","type"]),i=x(["quantity","qty"],0),s=await I("thẻ kho",t,()=>r.aggregate([{
$match:n},{$sort:{productCode:1,date:1,createdAt:1,_id:1}},{$setWindowFields:{partitionBy:{$ifNull:["$productCode","$productId"]},sortBy:{date:1,createdAt:1,_id:1},output:{
runningBalance:{$sum:i,window:{documents:["unbounded","current"]}}}}},{$facet:{rows:[{$skip:d},{$limit:a}],totals:[{$group:{_id:null,transactionCount:{$sum:1},inQty:{$sum:{$cond:[{
$gt:[i,0]},i,0]}},outQty:{$sum:{$cond:[{$lt:[i,0]},{$abs:i},0]}}}}]}}]).allowDiskUse(!0).exec()),u=s?.[0]||{},l=(u.rows||[]).map(t=>{const r=U(t);return{id:t.id||String(t._id||""),
date:e.toDateOnly(t.date||t.createdAt),productCode:t.productCode||"",productName:t.productName||"",warehouseCode:$,type:t.type||"",refType:t.refType||"",refCode:t.refCode||"",
inQty:f(t.inQty||(r>0?r:0)),outQty:f(t.outQty||(r<0?Math.abs(r):0)),quantity:r,balanceQty:f(t.balanceQty??t.runningBalance),note:t.note||""}}),c=u.totals?.[0]||{};return{
source:"mongo_stock_transactions",transactions:l,items:l,meta:T(o,a,c.transactionCount||0),summary:{transactionCount:f(c.transactionCount),inQty:f(c.inQty),outQty:f(c.outQty)}}}
function P(e={}){return String(e.id||e._id||e.code||e.refId||e.refCode||"").trim()}function K(e=[]){return e.filter(v).filter(e=>{const t=String(e.type||"").toLowerCase()
;return"AR"===String(e.account||"").toUpperCase()||t.includes("ar")||t.includes("debt")||t.includes("receipt")||t.includes("return")||f(e.debit)||f(e.credit)})}function V(e={}){
return{id:String(e.id||e._id||e.code||"").trim(),code:String(e.code||e.orderCode||"").trim()}}function Z(e={},t={}){
const{id:r,code:o}=V(t),a=[e.orderId,e.salesOrderId,e.refId,e.orderCode,e.salesOrderCode,e.refCode].map(e=>String(e||"").trim()).filter(Boolean);return a.includes(r)||a.includes(o)
}function j(e={}){return String(e.orderId||e.salesOrderId||e.refId||e.orderCode||e.salesOrderCode||e.refCode||"").trim()}function z(e={}){
return String(e.customerId||e.customerCode||e.customerName||"").trim()}function H(e={}){
const t=["delivered","success","completed","done"].includes(String(e.deliveryStatus||"").toLowerCase()),r=String(e.accountingStatus||"").toLowerCase(),o=Boolean(e.accountingConfirmed)||["confirmed","locked","posted"].includes(r)
;return t&&o}function W(e={},t=new Map){
const r=[e.orderId,e.salesOrderId,e.sourceOrderId,e.refId,e.orderCode,e.salesOrderCode,e.sourceOrderCode,e.refCode].map(e=>String(e||"").trim()).filter(Boolean);for(const e of r){
const r=t.get(e);if(r)return r}return null}function G(e={}){const t=[e.source,e.refType,e.type,e.note].map(e=>String(e||"").toLowerCase()).join(" ")
;return t.includes("mobile_delivery")||t.includes("mobiledelivery")||t.includes("mobile delivery")||t.includes("mobile_delivery_return")||t.includes("app giao hàng")}
function J(e={},t=new Map){if(!G(e))return!0;const r=W(e,t);return!!r&&H(r)}function X(e={}){const t=String(e.accountingStatus||e.financeStatus||"").toLowerCase()
;return Boolean(e.accountingConfirmed||e.financeConfirmed)||["confirmed","locked","posted"].includes(t)}function Y(e={},t=new Map){if(X(e))return!0;const r=W(e,t);return!!r&&H(r)}
function ee(e={},t=new Map){const r=String(e.type||"").toLowerCase(),o=String(e.refType||"").toLowerCase();if(!r.includes("return")&&!o.includes("return")&&!G(e))return!1
;if(X(e))return!1;const a=W(e,t);return a?!H(a):G(e)}function te(t={}){if(!H(t))return null
;const r=f(t.debtBeforeCollection??t.totalAmount??t.amount??t.grandTotal??t.payableAmount??t.debtAmount??t.debt??0);return r<=0?null:{id:`VIRTUAL-AR-SALE-${t.id||t.code}`,
code:`VIRTUAL-AR-SALE-${t.code||t.id}`,date:e.toDateOnly(t.date||t.orderDate||t.createdAt),type:"ar_sale_virtual_backfill",account:"AR",refType:"SALES_ORDER",
refId:t.id||t._id||t.code,refCode:t.code||t.id,orderId:t.id||t._id||t.code,orderCode:t.code||t.id,customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",salesmanCode:t.salesmanCode||t.salesStaffCode||t.nvbhCode||"",salesmanName:t.salesmanName||t.salesStaffName||t.nvbhName||"",
deliveryStaffCode:t.deliveryStaffCode||"",deliveryStaffName:t.deliveryStaffName||"",debit:r,credit:0,amount:r,status:"posted",source:"virtual_backfill_from_orders"}}
function re(t={}){const r=S(t)||f(t.returnAmount||t.debtReduction||t.totalAmount);return r<=0?null:{id:`VIRTUAL-AR-RETURN-${t.id||t.code}`,code:`VIRTUAL-AR-RETURN-${t.code||t.id}`,
date:e.toDateOnly(t.date||t.createdAt),type:"ar_return_virtual_backfill",account:"AR",refType:"RETURN_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,
orderId:t.salesOrderId||t.orderId||t.sourceOrderId||"",orderCode:t.salesOrderCode||t.orderCode||"",customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",debit:0,credit:r,amount:r,status:"posted",source:"virtual_backfill_from_returns"}}function oe(t={}){const r=S(t);return r<=0?null:{
id:`VIRTUAL-AR-RECEIPT-${t.id||t.code}`,code:`VIRTUAL-AR-RECEIPT-${t.code||t.id}`,date:e.toDateOnly(t.date||t.createdAt),type:"ar_receipt_virtual_backfill",account:"AR",
refType:"RECEIPT",refId:t.id||t._id||t.code,refCode:t.code||t.id,orderId:t.orderId||t.salesOrderId||"",orderCode:t.orderCode||t.salesOrderCode||t.refCode||"",
customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",debit:0,credit:r,amount:r,status:"posted",source:"virtual_backfill_from_receipts"}}
function ae(t={}){const r=String(t.type||"").toLowerCase(),o=f(t.debit||(r.includes("sale")?t.amount:0)),a=f(t.credit||(r.includes("sale")?0:t.amount));return{
id:t.id||String(t._id||""),code:t.code||"",date:e.toDateOnly(t.date||t.createdAt),type:t.type||"",account:t.account||"AR",refType:t.refType||"",refId:t.refId||t.id||"",
refCode:t.refCode||t.code||"",orderId:t.orderId||t.salesOrderId||"",orderCode:t.orderCode||t.salesOrderCode||"",customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",debit:o,credit:a,balanceEffect:o-a,status:t.status||"posted",source:t.source||"",note:t.note||t.voidReason||""}}function de(t=[],r=[]){
const o=r.map(ae),a=[];return t.forEach(t=>{const r=String(t.id||t._id||"").trim(),d=String(t.code||"").trim(),n=o.filter(e=>{
const t=[e.refId,e.refCode,e.code,e.id].map(e=>String(e||"").trim());return r&&t.includes(r)||d&&t.includes(d)
}),i=n.some(e=>String(e.type||"").toLowerCase().includes("receipt")&&!String(e.type||"").toLowerCase().includes("void")&&f(e.credit)>0),s=n.some(e=>String(e.type||"").toLowerCase().includes("void")&&f(e.debit)>0),u=S(t)
;"void"!==String(t.status||"").toLowerCase()||s?"void"!==String(t.status||"").toLowerCase()&&!i&&u>0&&a.push({level:"warning",code:t.code||t.id||"",
date:e.toDateOnly(t.date||t.createdAt),customerCode:t.customerCode||"",customerName:t.customerName||"",amount:u,
message:"Phiếu thu đang hiệu lực nhưng chưa thấy bút toán AR credit."}):a.push({level:"danger",code:t.code||t.id||"",date:e.toDateOnly(t.date||t.createdAt),
customerCode:t.customerCode||"",customerName:t.customerName||"",amount:u,message:"Phiếu thu đã Void nhưng chưa có bút toán đảo AR debit."})}),a}function ne(e=""){
return String(e||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function ie(e,t=50,r=100){const o=Number(e);return!Number.isFinite(o)||o<=0?t:Math.min(Math.max(1,Math.floor(o)),r)}
function se(e){const t=Number(e);return!Number.isFinite(t)||t<=0?1:Math.max(1,Math.floor(t))}function ue(e,t){t&&(Array.isArray(e.$and)||(e.$and=[]),e.$and.push(t))}
function le(t={}){const r={account:/^AR$/i,accountingConfirmed:!0,accountingStatus:{$in:["confirmed","locked","posted","accounting_confirmed"]},status:{
$nin:["void","cancelled","canceled","deleted","duplicate_cancelled","reversed","voided"]},reversed:{$ne:!0},refType:{$ne:"AR_LEDGER_REVERSAL"},entryType:{$ne:"reversal"},type:{
$nin:["ar_reversal","reversal","ar_void","ar_sale_reversal","ar_return_reversal"]},ledgerType:{$nin:["AR-RETURN-REVERSAL","AR-SALE-REVERSAL","AR-RECEIPT-REVERSAL"]},category:{
$nin:["AR-RETURN-REVERSAL","AR-SALE-REVERSAL","AR-RECEIPT-REVERSAL"]}};if((t.dateFrom||t.dateTo||t.date)&&(r.date={},t.dateFrom&&(r.date.$gte=e.toDateOnly(t.dateFrom)),
t.dateTo&&(r.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(r.date=e.toDateOnly(t.date))),t.customerCode){const e=new RegExp(`^${ne(t.customerCode)}$`,"i");ue(r,{$or:[{customerCode:e
},{customerId:e}]})}if(t.customerId){const e=new RegExp(`^${ne(t.customerId)}$`,"i");ue(r,{$or:[{customerId:e},{customerCode:e}]})}return r}function ce(e={}){const t=[]
;if(e.delivery){const r=new RegExp(ne(e.delivery),"i");t.push({$or:[{deliveryStaffCode:r},{deliveryStaffName:r},{deliveryCode:r},{deliveryName:r},{nvghCode:r},{nvghName:r}]})}
if(e.salesman){const r=new RegExp(ne(e.salesman),"i");t.push({$or:[{salesmanCode:r},{salesmanName:r},{salesStaffCode:r},{salesStaffName:r},{nvbhCode:r},{nvbhName:r}]})}
return t.length?1===t.length?t[0]:{$and:t}:null}function me(e){return String(e||"").trim()}function fe(e=""){const t=me(e).toUpperCase();if(!t)return""
;const r=t.match(/^RO-([A-Z0-9]+)$/i)||t.match(/^AR-RETURN:RO-([A-Z0-9]+)$/i)||t.match(/(?:^|[-_:])RO-([A-Z0-9]+)(?=$|[-_:])/i);return r?r[1]:""}function $e(e=[]){const t=new Set
;for(const r of e||[]){const e=me(r);if(!e)continue;t.add(e);const o=fe(e);o&&t.add(o),/^[A-Z0-9]+$/i.test(e)&&!/^RO-/i.test(e)&&(t.add(`RO-${e}`),t.add(`AR-RETURN:RO-${e}`),
t.add(`AR-RETURN-RO-${e}`))}return Array.from(t)}function ye(){return{$let:{vars:{match:{$regexFind:{input:{$concat:[{$ifNull:["$idempotencyKey",""]}," ",{$ifNull:["$code",""]
}," ",{$ifNull:["$id",""]}," ",{$ifNull:["$sourceCode",""]}," ",{$ifNull:["$returnOrderCode",""]}," ",{$ifNull:["$sourceId",""]}," ",{$ifNull:["$returnOrderId",""]}]},
regex:/(?:^|[-_:])RO-([A-Z0-9]+)(?=$|[-_:])/i}}},in:{$arrayElemAt:[{$ifNull:["$$match.captures",[]]},0]}}}}function pe(){return{$ifNull:["$orderCode",{$ifNull:["$salesOrderCode",{
$ifNull:["$sourceOrderCode",{$ifNull:["$refCode",{$ifNull:["$orderId",{$ifNull:["$salesOrderId",{$ifNull:["$sourceOrderId",{$ifNull:["$refId",ye()]}]}]}]}]}]}]}]}}
const ge="id code date createdAt type category ledgerType source sourceType sourceId sourceCode returnOrderId returnOrderCode sourceOrderId sourceOrderCode refType refId refCode orderId orderCode salesOrderId salesOrderCode customerId customerCode customerName debit credit amount status accountingConfirmed accountingStatus entryType note voidReason salesStaffCode salesStaffName salesmanCode salesmanName nvbhCode nvbhName deliveryStaffCode deliveryStaffName deliveryCode deliveryName nvghCode nvghName"
;async function Ce(t={}){const r=le(t),o=ce(t);if(!o)return r;const a={...le({}),type:{$in:["ar_sale","ar_external_debt"]},...o};(t.dateFrom||t.dateTo||t.date)&&(a.date={},
t.dateFrom&&(a.date.$gte=e.toDateOnly(t.dateFrom)),t.dateTo&&(a.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(a.date=e.toDateOnly(t.date)))
;const d=await I("phạm vi nhân viên công nợ",t,()=>n.find(a).select("orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode sourceId sourceCode returnOrderId returnOrderCode refId refCode id code idempotencyKey").limit(5e3).lean()),i=Array.from(new Set(d.flatMap(e=>[e.orderId,e.salesOrderId,e.sourceOrderId,e.sourceId,e.returnOrderId,e.refId]).map(me).filter(Boolean))),s=$e(d.flatMap(e=>[e.orderCode,e.salesOrderCode,e.sourceOrderCode,e.sourceCode,e.returnOrderCode,e.refCode,e.idempotencyKey,e.code,e.id]).map(me).filter(Boolean))
;return i.length||s.length?(ue(r,{$or:[...i.length?[{orderId:{$in:i}},{salesOrderId:{$in:i}},{sourceOrderId:{$in:i}},{sourceId:{$in:i}},{returnOrderId:{$in:i}},{refId:{$in:i}
}]:[],...s.length?[{orderCode:{$in:s}},{salesOrderCode:{$in:s}},{sourceOrderCode:{$in:s}},{sourceCode:{$in:s}},{returnOrderCode:{$in:s}},{idempotencyKey:{$in:s}},{code:{$in:s}},{
id:{$in:s}},{refCode:{$in:s}}]:[]]}),r):(ue(r,{_id:"__NO_AR_SALE_MATCHING_STAFF_SCOPE__"}),r)}function Ae(e=[],t={}){const r=String(t.status||"").trim()
;return"1"===String(t.includePaid||"").trim()||"paid"===r?e:r&&"all"!==r&&"unpaid"!==r&&"open"!==r?"overdue"===r?e.filter(e=>"overdue"===e.status):e.filter(e=>e.status===r):e.filter(e=>A(e.debt)||b(e.debt))
}async function be(t={}){
const r=se(t.page),o=ie(t.limit,50,100),a=(r-1)*o,d=Boolean(t.q||t.keyword||t.search||t.salesman||t.delivery||t.customerCode||t.customerId||t.dateFrom||t.dateTo||t.date),i=await Ce(t),s=String(t.q||t.keyword||t.search||"").trim()
;if(s){const e=new RegExp(ne(s),"i");ue(i,{$or:[{customerCode:e},{customerName:e},{customerId:e},{orderCode:e},{salesOrderCode:e},{sourceOrderCode:e},{sourceCode:e},{
returnOrderCode:e},{refCode:e},{idempotencyKey:e}]})}d||(i.date=i.date||{$gte:e.toDateOnly(e.todayVN())});const u=await I("tổng hợp công nợ",t,()=>n.aggregate([{$match:i},{
$project:{date:{$ifNull:["$date","$createdAt"]},id:1,code:1,type:1,category:1,ledgerType:1,orderType:1,source:1,sourceType:1,sourceId:1,sourceCode:1,sourceOrderId:1,
sourceOrderCode:1,returnOrderId:1,returnOrderCode:1,idempotencyKey:1,refType:1,refId:1,refCode:1,orderId:pe(),orderCode:pe(),customerId:1,customerCode:1,customerName:1,phone:{
$ifNull:["$phone","$customerPhone"]},address:{$ifNull:["$address","$customerAddress"]},salesmanCode:1,salesmanName:1,salesStaffCode:1,salesStaffName:1,staffCode:1,staffName:1,
nvbhCode:1,nvbhName:1,deliveryStaffCode:1,deliveryStaffName:1,deliveryCode:1,deliveryName:1,deliveryStaff:1,nvghCode:1,nvghName:1,debit:{$ifNull:["$debit",0]},credit:{
$ifNull:["$credit",0]},amount:{$ifNull:["$amount",0]},status:1,note:1,createdAt:1}},{$addFields:{ledgerText:{$toLower:{$concat:[{$ifNull:["$type",""]}," ",{$ifNull:["$category",""]
}," ",{$ifNull:["$ledgerType",""]}," ",{$ifNull:["$sourceType",""]}," ",{$ifNull:["$source",""]}," ",{$ifNull:["$refType",""]}," ",{$ifNull:["$code",""]}," ",{$ifNull:["$id",""]
}," ",{$ifNull:["$idempotencyKey",""]}]}},creditLikeAmount:{$cond:[{$gt:["$credit",0]},"$credit","$amount"]},debitLikeAmount:{$cond:[{$gt:["$debit",0]},"$debit","$amount"]}}},{
$addFields:{isSale:{$or:[{$eq:[{$toUpper:{$ifNull:["$category",""]}},"AR-SALE"]},{$eq:[{$toUpper:{$ifNull:["$ledgerType",""]}},"AR-SALE"]},{$regexMatch:{input:"$ledgerText",
regex:"sale|external_debt"}}]},isReturn:{$or:[{$eq:[{$toUpper:{$ifNull:["$category",""]}},"AR-RETURN"]},{$eq:[{$toUpper:{$ifNull:["$ledgerType",""]}},"AR-RETURN"]},{$regexMatch:{
input:{$toUpper:{$ifNull:["$code",""]}},regex:/^AR-RETURN/}},{$regexMatch:{input:{$toUpper:{$ifNull:["$id",""]}},regex:/^AR-RETURN/}},{$regexMatch:{input:{$toUpper:{
$ifNull:["$idempotencyKey",""]}},regex:/^AR-RETURN:/}},{$regexMatch:{input:"$ledgerText",regex:"return"}}]},isBonus:{$regexMatch:{input:"$ledgerText",
regex:/bonus|discount|allowance/}}}},{$addFields:{isReceipt:{$and:[{$not:["$isSale"]},{$not:["$isReturn"]},{$regexMatch:{input:"$ledgerText",
regex:/receipt|payment|collection|debt_collection/}}]}}},{$group:{_id:{customerCode:"$customerCode",customerId:"$customerId",customerName:"$customerName",orderCode:"$orderCode",
orderId:"$orderId"},firstDate:{$min:"$date"},lastDate:{$max:"$date"},phone:{$max:"$phone"},address:{$max:"$address"},debit:{$sum:{$cond:["$isSale","$debitLikeAmount",0]}},credit:{
$sum:{$cond:[{$gt:["$credit",0]},"$credit",{$cond:["$isSale",0,"$amount"]}]}},receiptAmount:{$sum:{$cond:["$isReceipt","$creditLikeAmount",0]}},returnAmount:{$sum:{
$cond:["$isReturn","$creditLikeAmount",0]}},bonusAmount:{$sum:{$cond:["$isBonus","$creditLikeAmount",0]}},saleSalesmanCode:{$max:{$cond:["$isSale",{$ifNull:["$salesmanCode",{
$ifNull:["$salesStaffCode","$nvbhCode"]}]},""]}},saleSalesmanName:{$max:{$cond:["$isSale",{$ifNull:["$salesmanName",{$ifNull:["$salesStaffName","$nvbhName"]}]},""]}},
saleDeliveryStaffCode:{$max:{$cond:["$isSale",{$ifNull:["$deliveryStaffCode",{$ifNull:["$deliveryCode","$nvghCode"]}]},""]}},saleDeliveryStaffName:{$max:{$cond:["$isSale",{
$ifNull:["$deliveryStaffName",{$ifNull:["$deliveryName","$nvghName"]}]},""]}},saleOrderType:{$max:{$cond:["$isSale",{$ifNull:["$orderType",{$cond:[{$eq:["$type","ar_external_debt"]
},"external_debt","sales_order"]}]},""]}},salesmanCode:{$max:{$ifNull:["$salesmanCode",{$ifNull:["$salesStaffCode","$nvbhCode"]}]}},salesmanName:{$max:{$ifNull:["$salesmanName",{
$ifNull:["$salesStaffName","$nvbhName"]}]}},deliveryStaffCode:{$max:{$ifNull:["$deliveryStaffCode",{$ifNull:["$deliveryCode","$nvghCode"]}]}},deliveryStaffName:{$max:{
$ifNull:["$deliveryStaffName",{$ifNull:["$deliveryName","$nvghName"]}]}},fallbackSalesmanCode:{$max:{$ifNull:["$salesmanCode",{$ifNull:["$salesStaffCode","$nvbhCode"]}]}},
fallbackSalesmanName:{$max:{$ifNull:["$salesmanName",{$ifNull:["$salesStaffName","$nvbhName"]}]}},fallbackDeliveryStaffCode:{$max:{$ifNull:["$deliveryStaffCode",{
$ifNull:["$deliveryCode","$nvghCode"]}]}},fallbackDeliveryStaffName:{$max:{$ifNull:["$deliveryStaffName",{$ifNull:["$deliveryName","$nvghName"]}]}}}},{$addFields:{debt:{
$subtract:["$debit","$credit"]}}},{$sort:{debt:-1,lastDate:-1}},{$limit:Math.max(a+o+1,o+1)}]).allowDiskUse(!0).exec()),l=e.todayVN();let c=u.map(t=>{const r=t._id||{}
;!t.fallbackSalesmanCode&&t.salesmanCode&&(t.fallbackSalesmanCode=t.salesmanCode),!t.fallbackSalesmanName&&t.salesmanName&&(t.fallbackSalesmanName=t.salesmanName),
!t.fallbackDeliveryStaffCode&&t.deliveryStaffCode&&(t.fallbackDeliveryStaffCode=t.deliveryStaffCode),
!t.fallbackDeliveryStaffName&&t.deliveryStaffName&&(t.fallbackDeliveryStaffName=t.deliveryStaffName)
;const o=C(f(t.debit)-f(t.credit)),a=e.toDateOnly(t.firstDate||t.lastDate||new Date),d=A(o)?Math.max(0,N(l,a)):0,n=b(o)?"overpaid":A(o)?d>0?"overdue":"open":"paid";return{
orderId:r.orderId||r.orderCode||"",orderCode:r.orderCode||r.orderId||"",customerId:r.customerId||"",customerCode:r.customerCode||"",customerName:r.customerName||"Chưa rõ khách",
phone:t.phone||"",address:t.address||"",salesmanCode:t.saleSalesmanCode||t.fallbackSalesmanCode||"",salesmanName:t.saleSalesmanName||t.fallbackSalesmanName||"",
deliveryStaffCode:t.saleDeliveryStaffCode||t.fallbackDeliveryStaffCode||"",deliveryStaffName:t.saleDeliveryStaffName||t.fallbackDeliveryStaffName||"",
orderType:t.saleOrderType||(/^NDNBLH/i.test(String(r.orderCode||""))?"external_debt":"sales_order"),documentDate:a,dueDate:a,debit:f(t.debit),credit:f(t.credit),
receiptAmount:Math.max(0,f(t.receiptAmount)),returnAmount:Math.max(0,f(t.returnAmount)),bonusAmount:Math.max(0,f(t.bonusAmount)),debt:o,rawDebt:o,overpaidAmount:Math.max(0,-o),
debtZeroTolerance:g,overdueDays:d,agingDays:a?Math.max(0,N(l,a)):0,status:n}});c=Ae(c,t),a&&(c=c.slice(a));const m=c.length>o;c=c.slice(0,o);const $=new Map;c.forEach(e=>{
const t=String(e.customerCode||e.customerId||e.customerName||"").trim();if(!t)return;$.has(t)||$.set(t,{customerId:e.customerId,customerCode:e.customerCode,
customerName:e.customerName||"Chưa rõ khách",phone:e.phone,address:e.address,salesmanCode:e.salesmanCode||"",salesmanName:e.salesmanName||"",
deliveryStaffCode:e.deliveryStaffCode||"",deliveryStaffName:e.deliveryStaffName||"",debit:0,credit:0,receiptAmount:0,returnAmount:0,bonusAmount:0,debt:0,orderCount:0,
overdueCount:0,overdueDays:0,agingDays:0,orders:[]});const r=$.get(t);r.debit+=f(e.debit),r.credit+=f(e.credit),r.receiptAmount+=f(e.receiptAmount),
r.returnAmount+=f(e.returnAmount),r.bonusAmount+=f(e.bonusAmount),r.debt+=C(e.debt),r.orderCount+=1,r.orders.push({orderId:e.orderId,orderCode:e.orderCode,
documentDate:e.documentDate,dueDate:e.dueDate,debit:f(e.debit),credit:f(e.credit),receiptAmount:f(e.receiptAmount),returnAmount:f(e.returnAmount),bonusAmount:f(e.bonusAmount),
debt:C(e.debt),overdueDays:f(e.overdueDays),agingDays:f(e.agingDays),status:e.status,salesmanCode:e.salesmanCode,salesmanName:e.salesmanName,deliveryStaffCode:e.deliveryStaffCode,
deliveryStaffName:e.deliveryStaffName,orderType:e.orderType||"sales_order"}),r.overdueDays=Math.max(f(r.overdueDays),f(e.overdueDays)),
r.agingDays=Math.max(f(r.agingDays),f(e.agingDays)),"overdue"===e.status&&(r.overdueCount+=1)});const y=Array.from($.values()).map(e=>({...e,debt:C(e.debt),
overpaidAmount:Math.max(0,-C(e.debt)),status:b(e.debt)?"overpaid":A(e.debt)?f(e.overdueDays)>0?"overdue":"open":"paid",debtZeroTolerance:g
})).sort((e,t)=>Math.abs(t.debt)-Math.abs(e.debt)||t.overdueDays-e.overdueDays||String(e.customerName).localeCompare(String(t.customerName)))
;let p=(await I("chi tiết công nợ",t,()=>n.find(i).select(ge).sort({date:-1,createdAt:-1}).limit(200).lean())).map(ae)
;p=E(p,t,["code","refCode","orderCode","customerCode","customerName","type","note"]);const v=De(c,{codeKey:"salesmanCode",nameKey:"salesmanName",role:"salesman"}),h=De(c,{
codeKey:"deliveryStaffCode",nameKey:"deliveryStaffName",role:"delivery"}),S={page:r,limit:o,hasMore:m,orderCount:c.length,customerCount:y.length,
overdueCount:c.filter(e=>"overdue"===e.status).length,totalDebit:D(c,e=>e.debit),totalCredit:D(c,e=>e.credit),totalDebt:D(c,e=>C(e.debt)),
totalPositiveDebt:D(c.filter(e=>A(e.debt)),e=>C(e.debt)),totalOverpaid:D(c.filter(e=>b(e.debt)),e=>Math.abs(C(e.debt))),debtZeroTolerance:g,journalCount:u.length,
arLedgerCount:p.length,arWarningCount:0,optimized:!0};return{source:"mongo_ar_ledger_fast",ledgerCollection:"arLedgers",debts:c,customerSummary:y,bySalesman:v,byDelivery:h,
arLedger:p,arDiagnostics:[],summary:S}}async function Ne(e={}){return{source:"mongo_ar_ledger_fast",summary:{totalDebt:0,customerDebt:0,orderDebt:0,overdueDebt:0,
note:"Màn công nợ chỉ tải danh sách khi người dùng nhập khách/NVBH/NVGH để tránh quét toàn bộ AR Ledger."},filters:{maxListLimit:100,maxAutocompleteLimit:20}}}
async function ve(e={}){return be({...e,limit:ie(e.limit,50,100)})}async function he(e={}){const t=e.customerCode||e.code||e.customerId||e.id||e.q;return be({...e,customerCode:t,
q:e.q||t,includePaid:e.includePaid||"1",limit:ie(e.limit,100,100)})}async function Se(e={}){const t=se(e.page),r=ie(e.limit,100,200),o=(t-1)*r,a=await Ce(e)
;if(e.q||e.keyword||e.search){const t=new RegExp(ne(e.q||e.keyword||e.search),"i");ue(a,{$or:[{code:t},{refCode:t},{orderCode:t},{salesOrderCode:t},{customerCode:t},{customerName:t
},{customerId:t},{type:t},{note:t}]})}const d=await I("sổ công nợ",e,()=>n.find(a).select(ge).sort({date:-1,createdAt:-1
}).skip(o).limit(r+1).lean()),i=d.length>r,s=(i?d.slice(0,r):d).map(ae);return{source:"mongo_ar_ledger_fast",ledgerCollection:"arLedgers",debts:[],customerSummary:[],bySalesman:[],
byDelivery:[],arLedger:s,arDiagnostics:[],summary:{page:t,limit:r,hasMore:i,arLedgerCount:s.length,totalDebit:D(s,e=>e.debit),totalCredit:D(s,e=>e.credit),
totalDebt:D(s,e=>e.balanceEffect),arWarningCount:0,optimized:!0}}}function De(e=[],t={}){const r=t.codeKey||"salesmanCode",o=t.nameKey||"salesmanName",a=t.role||"person",d=new Map
;return e.forEach(e=>{const t=String(e[r]||"").trim(),n=String(e[o]||"").trim(),i=t||n||"UNASSIGNED";d.has(i)||d.set(i,{role:a,code:t,name:n||(t?"":"Chưa gán"),
label:t&&n?`${t} - ${n}`:n||t||"Chưa gán",customerKeys:new Set,customers:0,orders:0,paidOrders:0,overdueOrders:0,openOrders:0,debit:0,credit:0,receiptAmount:0,returnAmount:0,
bonusAmount:0,debt:0,maxOverdueDays:0,maxAgingDays:0});const s=d.get(i),u=e.customerId||e.customerCode||e.customerName;u&&s.customerKeys.add(String(u)),s.orders+=1,
"paid"===e.status&&(s.paidOrders+=1),"overdue"===e.status&&(s.overdueOrders+=1),"open"===e.status&&(s.openOrders+=1),s.debit+=f(e.debit),s.credit+=f(e.credit),
s.receiptAmount+=f(e.receiptAmount),s.returnAmount+=f(e.returnAmount),s.bonusAmount+=f(e.bonusAmount),s.debt+=C(e.debt),
s.maxOverdueDays=Math.max(s.maxOverdueDays,f(e.overdueDays)),s.maxAgingDays=Math.max(s.maxAgingDays,f(e.agingDays))}),Array.from(d.values()).map(e=>{const{customerKeys:t,...r}=e
;return{...r,customers:t.size,collectionRate:r.debit>0?Math.round(r.credit/r.debit*1e4)/100:0,debt:Math.max(0,C(r.debt)),debtZeroTolerance:g,
status:A(r.debt)?r.overdueOrders>0?"overdue":"open":"paid"}}).sort((e,t)=>t.debt-e.debt||t.overdueOrders-e.overdueOrders||String(e.label).localeCompare(String(t.label)))}
async function Re(e={}){const t=await be(e);return{source:t.source,ledgerCollection:t.ledgerCollection,bySalesman:t.bySalesman,summary:t.summary}}async function Oe(e={}){
const t=await be(e);return{source:t.source,ledgerCollection:t.ledgerCollection,byDelivery:t.byDelivery,summary:t.summary}}async function Ie(t={}){
const{page:r,limit:a,skip:d}=_(t,50,200),n=k(M(t,["date","orderDate","documentDate","createdAt"]),t,["code","orderCode","customerCode","customerName","salesStaffCode","salesStaffName"]),i=x(["totalAmount","amount","grandTotal","total","value"],0),s=x(["paidAmount","paymentAmount"],0),u={
$let:{vars:{remaining:{$subtract:[i,s]}},in:{$cond:[{$gt:["$$remaining",0]},"$$remaining",0]}}
},l=w(["salesStaffCode","salesmanCode","nvbhCode"],""),c=w(["salesStaffName","salesmanName","nvbhName"],""),m=await I("bán hàng",t,()=>o.aggregate([{$match:n},{$facet:{rows:[{
$sort:{date:-1,orderDate:-1,createdAt:-1,_id:-1}},{$skip:d},{$limit:a}],totals:[{$group:{_id:null,orderCount:{$sum:1},totalAmount:{$sum:i},paidAmount:{$sum:s},debtAmount:{$sum:u}}
}],bySalesman:[{$group:{_id:{code:l,name:c},orderCount:{$sum:1},totalAmount:{$sum:i}}},{$sort:{totalAmount:-1,"_id.name":1}}]}
}]).allowDiskUse(!0).exec()),$=m?.[0]||{},y=($.rows||[]).map(t=>({id:t.id||String(t._id||""),code:t.code||t.orderCode||"",date:e.toDateOnly(t.date||t.orderDate||t.createdAt),
customerCode:t.customerCode||"",customerName:t.customerName||"",salesmanCode:t.salesStaffCode||t.salesmanCode||t.nvbhCode||"",
salesmanName:t.salesStaffName||t.salesmanName||t.nvbhName||"",totalAmount:S(t),paidAmount:f(t.paidAmount||t.paymentAmount),
debtAmount:Math.max(0,S(t)-f(t.paidAmount||t.paymentAmount)),status:t.status||""})),p=$.totals?.[0]||{};return{source:"mongo_aggregate",sales:y,items:y,meta:T(r,a,p.orderCount||0),
bySalesman:($.bySalesman||[]).map(e=>({salesmanCode:e?._id?.code||"",salesmanName:e?._id?.name||"",orderCount:f(e.orderCount),totalAmount:f(e.totalAmount)})),summary:{
orderCount:f(p.orderCount),totalAmount:f(p.totalAmount),paidAmount:f(p.paidAmount),debtAmount:f(p.debtAmount)}}}async function _e(e={}){
const{page:t,limit:r,skip:o}=_(e,50,200),a=M(e,["date","createdAt"]),n=M(e,["date","documentDate","createdAt"]),c=M(e,["date","documentDate","createdAt"]),m=M(e,["date","returnDate","documentDate","deliveryDate","createdAt"]),[$,y,p,g,C,A,b,N]=await I("tài chính",e,()=>Promise.all([d.find(n).sort({
date:-1,createdAt:-1}).skip(o).limit(r).lean(),s.find(c).sort({date:-1,createdAt:-1}).skip(o).limit(r).lean(),u.find(c).sort({date:-1,createdAt:-1
}).skip(o).limit(r).lean(),l.find(m).sort({date:-1,createdAt:-1}).skip(o).limit(r).lean(),d.aggregate([{$match:n},{$group:{_id:null,count:{$sum:1},amount:{
$sum:x(["amount","totalAmount","grandTotal","total","value"],0)}}}]),l.aggregate([{$match:m},{$group:{_id:null,count:{$sum:1},amount:{
$sum:x(["returnAmount","totalAmount","amount","debtReduction"],0)}}}]),i.aggregate([{$match:a},{$group:{_id:{fundType:"$fundType",direction:"$direction"},amount:{
$sum:x(["amount"],0)},count:{$sum:1}}}]),Promise.all([d.countDocuments(n),s.countDocuments(c),u.countDocuments(c),l.countDocuments(m)])])),v=(e,t)=>{
const r=(b||[]).find(r=>String(r?._id?.fundType||"").toLowerCase()===e&&String(r?._id?.direction||"").toLowerCase()===t);return f(r?.amount)
},h=v("cash","in"),S=v("cash","out"),D=v("bank","in"),R=v("bank","out"),O=C?.[0]||{},k=A?.[0]||{},w={receipts:f(N?.[0]),cashbook:f(N?.[1]),bankbook:f(N?.[2]),returns:f(N?.[3])
},E=Math.max(...Object.values(w),0);return{source:"mongo_paged",fundSource:"fundLedgers",meta:{...T(t,r,E),categoryCounts:w},summary:{receiptCount:f(O.count),
totalReceipts:f(O.amount),cashIn:h,cashOut:S,cashBalance:h-S,bankIn:D,bankOut:R,bankBalance:D-R,totalFundIn:h+D,totalFundOut:S+R,totalFundBalance:h+D-S-R,returnCount:f(k.count),
totalReturns:f(k.amount)},receipts:$,cashbook:y,bankbook:p,returns:g}}async function Te(t={}){
const{page:r,limit:o,skip:d}=_(t,50,200),n=k(M(t,["deliveryDate","date","createdAt"]),t,["code","masterOrderCode","deliveryStaffCode","deliveryStaffName","status"]),i=x(["totalAmount","amount","grandTotal","total","value"],0),s=x(["collectedAmount","paidAmount"],0),u={
$convert:{input:{$ifNull:["$orderCount",{$ifNull:["$childOrderCount",{$cond:[{$isArray:"$childOrderIds"},{$size:"$childOrderIds"},{$cond:[{$isArray:"$orderIds"},{$size:"$orderIds"
},0]}]}]}]},to:"double",onError:0,onNull:0}
},l=w(["deliveryStaffCode","deliveryCode","nvghCode"],""),c=w(["deliveryStaffName","deliveryName","nvghName"],""),m=await I("giao hàng",t,()=>a.aggregate([{$match:n},{$facet:{
rows:[{$sort:{deliveryDate:-1,createdAt:-1,_id:-1}},{$skip:d},{$limit:o}],totals:[{$group:{_id:null,tripCount:{$sum:1},orderCount:{$sum:u},totalAmount:{$sum:i},collectedAmount:{
$sum:s}}}],byStaff:[{$group:{_id:{code:l,name:c},tripCount:{$sum:1},orderCount:{$sum:u},totalAmount:{$sum:i},collectedAmount:{$sum:s}}},{$sort:{totalAmount:-1,"_id.name":1}}]}
}]).allowDiskUse(!0).exec()),$=m?.[0]||{},y=($.rows||[]).map(t=>({id:t.id||String(t._id||""),code:t.code||t.masterOrderCode||"",
deliveryDate:e.toDateOnly(t.deliveryDate||t.date||t.createdAt),deliveryStaffCode:t.deliveryStaffCode||t.deliveryCode||t.nvghCode||"",
deliveryStaffName:t.deliveryStaffName||t.deliveryName||t.nvghName||"",
orderCount:f(t.orderCount||t.childOrderCount||(Array.isArray(t.childOrderIds)?t.childOrderIds.length:Array.isArray(t.orderIds)?t.orderIds.length:0)),totalAmount:S(t),
collectedAmount:f(t.collectedAmount||t.paidAmount),status:t.status||""})),p=$.totals?.[0]||{};return{source:"mongo_aggregate",delivery:y,items:y,meta:T(r,o,p.tripCount||0),
byStaff:($.byStaff||[]).map(e=>({deliveryStaffCode:e?._id?.code||"",deliveryStaffName:e?._id?.name||"",tripCount:f(e.tripCount),orderCount:f(e.orderCount),
totalAmount:f(e.totalAmount),collectedAmount:f(e.collectedAmount)})),summary:{tripCount:f(p.tripCount),orderCount:f(p.orderCount),totalAmount:f(p.totalAmount),
collectedAmount:f(p.collectedAmount)}}}async function ke(e={}){
const t=x(["totalAmount","amount","grandTotal","total","value"],0),r=x(["paidAmount","paymentAmount"],0),d=M(e,["date","orderDate","documentDate","createdAt"]),s=M(e,["deliveryDate","date","createdAt"]),u=M(e,["date","createdAt"]),l=M(e,["date","documentDate","importDate","createdAt"]),m={
status:{$nin:R}},[$,y,A,b,N,v]=await I("dashboard",e,()=>Promise.all([o.aggregate([{$match:d},{$group:{_id:null,orderCount:{$sum:1},totalAmount:{$sum:t},paidAmount:{$sum:r}}
}]),n.aggregate([{$match:m},{$group:{_id:null,debit:{$sum:x(["debit","arDebit"],0)},credit:{$sum:x(["credit","arCredit"],0)}}}]),p.getInventorySummary({}),i.aggregate([{$match:u},{
$group:{_id:{fundType:"$fundType",direction:"$direction"},amount:{$sum:x(["amount"],0)}}}]),a.aggregate([{$match:s},{$group:{_id:null,tripCount:{$sum:1},totalAmount:{
$sum:x(["totalAmount","amount"],0)},collectedAmount:{$sum:x(["collectedAmount","paidAmount"],0)}}}]),c.aggregate([{$match:l},{$group:{_id:null,importCount:{$sum:1},
totalImportAmount:{$sum:x(["totalAmount","amount"],0)}}
}])])),h=$?.[0]||{},S=y?.[0]||{},D=N?.[0]||{},O=v?.[0]||{},_=(e,t)=>f((b||[]).find(r=>String(r?._id?.fundType||"").toLowerCase()===e&&String(r?._id?.direction||"").toLowerCase()===t)?.amount),T=_("cash","in"),k=_("cash","out"),w=_("bank","in"),E=_("bank","out"),L=C(f(S.debit)-f(S.credit))
;return{source:"mongo_summary_only",dashboard:{sales:{orderCount:f(h.orderCount),totalAmount:f(h.totalAmount),paidAmount:f(h.paidAmount),
debtAmount:Math.max(0,f(h.totalAmount)-f(h.paidAmount))},debts:{totalDebit:f(S.debit),totalCredit:f(S.credit),totalDebt:L,debtZeroTolerance:g},stock:A?.summary||{},finance:{
cashIn:T,cashOut:k,cashBalance:T-k,bankIn:w,bankOut:E,bankBalance:w-E,totalFundBalance:T+w-k-E},delivery:{tripCount:f(D.tripCount),totalAmount:f(D.totalAmount),
collectedAmount:f(D.collectedAmount)},imports:{importCount:f(O.importCount),totalImportAmount:f(O.totalImportAmount)}}}}module.exports={stockReport:F,stockCardReport:B,
debtReport:be,debtInit:Ne,debtCustomers:ve,debtCustomerDetail:he,debtArLedger:Se,debtBySalesmanReport:Re,debtByDeliveryReport:Oe,dashboardReport:ke,salesReport:Ie,financeReport:_e,
deliveryReport:Te};
