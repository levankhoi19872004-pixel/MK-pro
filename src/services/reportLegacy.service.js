/* GENERATED FILE — edit src/services/reportLegacy.service.source/part-01.jsfrag, src/services/reportLegacy.service.source/part-02.jsfrag, src/services/reportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),t=require("../models/Product"),o=require("../models/StockTransaction"),r=require("../models/SalesOrder"),a=require("../models/MasterOrder"),n=require("../models/Receipt"),d=require("../models/ArLedger"),s=require("../models/FundLedger"),i=require("../models/Cashbook"),u=require("../models/Bankbook"),l=require("../models/ReturnOrder"),c=require("../models/ImportOrder"),{normalizeText:m,toNumber:f}=require("../utils/common.util"),{STOCK_WAREHOUSE_CODE:y,STOCK_WAREHOUSE_NAME:$}=require("../constants/business.constants"),g=require("./inventoryStock.service"),{DEBT_ZERO_TOLERANCE:p,normalizeDebtAmount:C,hasOpenDebt:b,isOverpaid:h}=require("../constants/finance.constants")
;function v(t,o){const r=new Date(e.toDateOnly(t)),a=new Date(e.toDateOnly(o))
;return Number.isNaN(r.getTime())||Number.isNaN(a.getTime())?0:Math.floor((r.getTime()-a.getTime())/864e5)}function A(e={}){
return!["void","cancelled","canceled","deleted","duplicate_cancelled"].includes(String(e.status||"").toLowerCase())}function N(t,o={}){
const r=e.toDateOnly(t.date||t.documentDate||t.orderDate||t.deliveryDate||t.createdAt);return!(o.dateFrom&&r<o.dateFrom||o.dateTo&&r>o.dateTo||o.date&&r!==o.date)}function S(e={}){
return f(e.totalAmount??e.amount??e.grandTotal??e.total??e.value)}function D(e=[],t=S){return e.reduce((e,o)=>e+f(t(o)),0)}
const _=["void","cancelled","canceled","deleted","duplicate_cancelled"];function I(e,t,o={}){"test"!==process.env.NODE_ENV&&console.error("[REPORT_DATA_SOURCE_FAILED]",{report:t,
query:o,error:e?.message||String(e||"")});const r=new Error(`Không thể tải dữ liệu báo cáo ${t}`);return r.code="REPORT_DATA_SOURCE_FAILED",r.status=503,r.cause=e,r}
async function O(e,t,o){try{return await o()}catch(o){throw I(o,e,t)}}function w(e={},t=50,o=200){const r=ie(e.page),a=se(e.limit,t,o);return{page:r,limit:a,skip:(r-1)*a}}
function x(e,t,o){const r=Math.max(0,f(o));return{page:e,limit:t,total:r,totalPages:r>0?Math.ceil(r/t):0,hasMore:e*t<r}}function k(e={},t={},o=[]){
const r=String(t.q||t.keyword||t.search||"").trim();if(!r)return e;const a=new RegExp(de(r),"i");return{$and:[e,{$or:o.map(e=>({[e]:a}))}]}}function T(e=[],t=0){
return e.reduceRight((e,t)=>({$ifNull:[`$${t}`,e]}),t)}function R(e=[],t=0){return{$convert:{input:T(e,t),to:"double",onError:0,onNull:0}}}function M(e=[],t={},o=[]){
const r=m(t.q||t.keyword||t.search);return r?e.filter(e=>o.some(t=>m(e[t]).includes(r))):e}function L(t={},o=["date","createdAt"]){
const r=e.toDateOnly(t.date||""),a=e.toDateOnly(t.dateFrom||r||""),n=e.toDateOnly(t.dateTo||r||"");if(!a&&!n)return{};const d=r||{...a?{$gte:a}:{},...n?{$lte:n}:{}
},s=o.filter(e=>"createdAt"!==e).map(e=>({[e]:d}));if(o.includes("createdAt")){const e={};if(a&&(e.$gte=new Date(`${a}T00:00:00+07:00`)),n){const t=new Date(`${n}T00:00:00+07:00`)
;t.setDate(t.getDate()+1),e.$lt=t}s.push({createdAt:e})}return 1===s.length?s[0]:{$or:s}}function E(e={},t=["date","createdAt"]){return{status:{
$nin:["void","cancelled","canceled","deleted","duplicate_cancelled"]},...L(e,t)}}function Q(t={}){const o={};return t.productCode&&(o.productCode=String(t.productCode).trim()),
(t.date||t.dateFrom||t.dateTo)&&(o.date={},t.dateFrom&&(o.date.$gte=e.toDateOnly(t.dateFrom)),t.dateTo&&(o.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(o.date=e.toDateOnly(t.date))),
o}function q(e={}){const t=String(e.direction||"").toUpperCase();return t?"IN"===t:f(e.quantity??e.qty)>=0}function F(e={}){return f(e.quantity??e.qty??0)}async function B(r={}){
const a=m(r.q),n=Boolean(r.dateFrom||r.dateTo||r.asOfDate||"movement"===r.mode),d=["1","true","yes"].includes(String(r.full||r.export||"").toLowerCase()),{page:s,limit:i,skip:u}=w(r,50,200)
;if(n){const n=e.toDateOnly(r.dateFrom||"0000-01-01"),l=e.toDateOnly(r.dateTo||r.asOfDate||e.todayVN()),[c,g]=await O("tồn kho theo kỳ",r,()=>Promise.all([o.find(L({dateTo:l
},["date","createdAt"])).sort({date:1,createdAt:1,productCode:1}).lean(),t.find({}).lean()])),p=new Map(g.map(e=>[String(e.code||e.id||e._id),e])),C=new Map;c.forEach(t=>{
const o=e.toDateOnly(t.date||t.createdAt);if(o>l)return;const r=String(t.productCode||t.productId||"").trim(),a=p.get(r)||{};C.has(r)||C.set(r,{
productId:t.productId||a.id||String(a._id||""),productCode:r,productName:t.productName||a.name||"",warehouseCode:y,warehouseName:$,unit:a.unit||t.unit||"",openingQty:0,importQty:0,
exportQty:0,returnQty:0,adjustmentQty:0,endingQty:0});const d=C.get(r),s=F(t);if(o<n)d.openingQty+=s;else{const e=String(t.type||"").toUpperCase()
;e.includes("RETURN")?d.returnQty+=Math.abs(s):e.includes("IMPORT")||q(t)?d.importQty+=Math.abs(s):e.includes("SALE")||!q(t)?d.exportQty+=Math.abs(s):d.adjustmentQty+=s}
d.endingQty+=s});let b=Array.from(C.values()).map(e=>({...e,inQty:e.importQty+e.returnQty+Math.max(0,e.adjustmentQty),outQty:e.exportQty+Math.abs(Math.min(0,e.adjustmentQty)),
quantity:e.endingQty,qty:e.endingQty,availableQty:e.endingQty}));a&&(b=b.filter(e=>[e.productCode,e.productName].some(e=>m(e).includes(a))))
;const h=b.filter(e=>f(e.quantity??e.qty??e.availableQty)<0),v=b.reduce((e,t)=>(e.totalRows+=1,e.openingQty+=f(t.openingQty),e.importQty+=f(t.importQty),
e.exportQty+=f(t.exportQty),e.returnQty+=f(t.returnQty),e.endingQty+=f(t.endingQty),e),{totalRows:0,openingQty:0,importQty:0,exportQty:0,returnQty:0,endingQty:0})
;v.negativeStockCount=h.length;const A=d?b:b.slice(u,u+i);return{source:"mongo_stock_transactions",dateFrom:n,dateTo:l,stock:A,items:A,
meta:d?x(1,Math.max(b.length,1),b.length):x(s,i,b.length),summary:v,negativeStockCount:h.length,negativeStockRows:h}}
const l=await O("tồn kho hiện tại",r,()=>g.getInventorySummary(r)),c=l.stock||[],p=d?c:c.slice(u,u+i);return{...l,source:"mongo_inventories_canonical",
inventorySource:"inventories",stock:p,items:p,meta:d?x(1,Math.max(c.length,1),c.length):x(s,i,c.length),summary:l.summary,negativeStockCount:l.negativeStockCount,
negativeStockRows:l.negativeStockRows}}async function U(t={}){
const{page:r,limit:a,skip:n}=w(t,50,200),d=k(Q(t),t,["productCode","productName","warehouseCode","refCode","refType","type"]),s=R(["quantity","qty"],0),i=await O("thẻ kho",t,()=>o.aggregate([{
$match:d},{$sort:{productCode:1,date:1,createdAt:1,_id:1}},{$setWindowFields:{partitionBy:{$ifNull:["$productCode","$productId"]},sortBy:{date:1,createdAt:1,_id:1},output:{
runningBalance:{$sum:s,window:{documents:["unbounded","current"]}}}}},{$facet:{rows:[{$skip:n},{$limit:a}],totals:[{$group:{_id:null,transactionCount:{$sum:1},inQty:{$sum:{$cond:[{
$gt:[s,0]},s,0]}},outQty:{$sum:{$cond:[{$lt:[s,0]},{$abs:s},0]}}}}]}}]).allowDiskUse(!0).exec()),u=i?.[0]||{},l=(u.rows||[]).map(t=>{const o=F(t);return{id:t.id||String(t._id||""),
date:e.toDateOnly(t.date||t.createdAt),productCode:t.productCode||"",productName:t.productName||"",warehouseCode:y,type:t.type||"",refType:t.refType||"",refCode:t.refCode||"",
inQty:f(t.inQty||(o>0?o:0)),outQty:f(t.outQty||(o<0?Math.abs(o):0)),quantity:o,balanceQty:f(t.balanceQty??t.runningBalance),note:t.note||""}}),c=u.totals?.[0]||{};return{
source:"mongo_stock_transactions",transactions:l,items:l,meta:x(r,a,c.transactionCount||0),summary:{transactionCount:f(c.transactionCount),inQty:f(c.inQty),outQty:f(c.outQty)}}}
function P(e={}){return String(e.id||e._id||e.code||e.refId||e.refCode||"").trim()}function V(e=[]){return e.filter(A).filter(e=>{const t=String(e.type||"").toLowerCase()
;return"AR"===String(e.account||"").toUpperCase()||t.includes("ar")||t.includes("debt")||t.includes("receipt")||t.includes("return")||f(e.debit)||f(e.credit)})}function K(e={}){
return{id:String(e.id||e._id||e.code||"").trim(),code:String(e.code||e.orderCode||"").trim()}}function j(e={},t={}){
const{id:o,code:r}=K(t),a=[e.orderId,e.salesOrderId,e.refId,e.orderCode,e.salesOrderCode,e.refCode].map(e=>String(e||"").trim()).filter(Boolean);return a.includes(o)||a.includes(r)
}function z(e={}){return String(e.orderId||e.salesOrderId||e.refId||e.orderCode||e.salesOrderCode||e.refCode||"").trim()}function H(e={}){
return String(e.customerId||e.customerCode||e.customerName||"").trim()}function Z(e={}){
const t=["delivered","success","completed","done"].includes(String(e.deliveryStatus||"").toLowerCase()),o=String(e.accountingStatus||"").toLowerCase(),r=Boolean(e.accountingConfirmed)||["confirmed","locked","posted"].includes(o)
;return t&&r}function W(e={},t=new Map){
const o=[e.orderId,e.salesOrderId,e.sourceOrderId,e.refId,e.orderCode,e.salesOrderCode,e.sourceOrderCode,e.refCode].map(e=>String(e||"").trim()).filter(Boolean);for(const e of o){
const o=t.get(e);if(o)return o}return null}function G(e={}){const t=[e.source,e.refType,e.type,e.note].map(e=>String(e||"").toLowerCase()).join(" ")
;return t.includes("mobile_delivery")||t.includes("mobiledelivery")||t.includes("mobile delivery")||t.includes("mobile_delivery_return")||t.includes("app giao hàng")}
function J(e={},t=new Map){if(!G(e))return!0;const o=W(e,t);return!!o&&Z(o)}function X(e={}){const t=String(e.accountingStatus||e.financeStatus||"").toLowerCase()
;return Boolean(e.accountingConfirmed||e.financeConfirmed)||["confirmed","locked","posted"].includes(t)}function Y(e={},t=new Map){if(X(e))return!0;const o=W(e,t);return!!o&&Z(o)}
function ee(e={},t=new Map){const o=String(e.type||"").toLowerCase(),r=String(e.refType||"").toLowerCase();if(!o.includes("return")&&!r.includes("return")&&!G(e))return!1
;if(X(e))return!1;const a=W(e,t);return a?!Z(a):G(e)}function te(t={}){if(!Z(t))return null
;const o=f(t.debtBeforeCollection??t.totalAmount??t.amount??t.grandTotal??t.payableAmount??t.debtAmount??t.debt??0);return o<=0?null:{id:`VIRTUAL-AR-SALE-${t.id||t.code}`,
code:`VIRTUAL-AR-SALE-${t.code||t.id}`,date:e.toDateOnly(t.date||t.orderDate||t.createdAt),type:"ar_sale_virtual_backfill",account:"AR",refType:"SALES_ORDER",
refId:t.id||t._id||t.code,refCode:t.code||t.id,orderId:t.id||t._id||t.code,orderCode:t.code||t.id,customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",salesmanCode:t.salesmanCode||t.salesStaffCode||t.nvbhCode||"",salesmanName:t.salesmanName||t.salesStaffName||t.nvbhName||"",
deliveryStaffCode:t.deliveryStaffCode||"",deliveryStaffName:t.deliveryStaffName||"",debit:o,credit:0,amount:o,status:"posted",source:"virtual_backfill_from_orders"}}
function oe(t={}){const o=S(t)||f(t.returnAmount||t.debtReduction||t.totalAmount);return o<=0?null:{id:`VIRTUAL-AR-RETURN-${t.id||t.code}`,code:`VIRTUAL-AR-RETURN-${t.code||t.id}`,
date:e.toDateOnly(t.date||t.createdAt),type:"ar_return_virtual_backfill",account:"AR",refType:"RETURN_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,
orderId:t.salesOrderId||t.orderId||t.sourceOrderId||"",orderCode:t.salesOrderCode||t.orderCode||"",customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",debit:0,credit:o,amount:o,status:"posted",source:"virtual_backfill_from_returns"}}function re(t={}){const o=S(t);return o<=0?null:{
id:`VIRTUAL-AR-RECEIPT-${t.id||t.code}`,code:`VIRTUAL-AR-RECEIPT-${t.code||t.id}`,date:e.toDateOnly(t.date||t.createdAt),type:"ar_receipt_virtual_backfill",account:"AR",
refType:"RECEIPT",refId:t.id||t._id||t.code,refCode:t.code||t.id,orderId:t.orderId||t.salesOrderId||"",orderCode:t.orderCode||t.salesOrderCode||t.refCode||"",
customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",debit:0,credit:o,amount:o,status:"posted",source:"virtual_backfill_from_receipts"}}
function ae(t={}){const o=String(t.type||"").toLowerCase(),r=f(t.debit||(o.includes("sale")?t.amount:0)),a=f(t.credit||(o.includes("sale")?0:t.amount));return{
id:t.id||String(t._id||""),code:t.code||"",date:e.toDateOnly(t.date||t.createdAt),type:t.type||"",account:t.account||"AR",refType:t.refType||"",refId:t.refId||t.id||"",
refCode:t.refCode||t.code||"",orderId:t.orderId||t.salesOrderId||"",orderCode:t.orderCode||t.salesOrderCode||"",customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",debit:r,credit:a,balanceEffect:r-a,status:t.status||"posted",source:t.source||"",note:t.note||t.voidReason||""}}function ne(t=[],o=[]){
const r=o.map(ae),a=[];return t.forEach(t=>{const o=String(t.id||t._id||"").trim(),n=String(t.code||"").trim(),d=r.filter(e=>{
const t=[e.refId,e.refCode,e.code,e.id].map(e=>String(e||"").trim());return o&&t.includes(o)||n&&t.includes(n)
}),s=d.some(e=>String(e.type||"").toLowerCase().includes("receipt")&&!String(e.type||"").toLowerCase().includes("void")&&f(e.credit)>0),i=d.some(e=>String(e.type||"").toLowerCase().includes("void")&&f(e.debit)>0),u=S(t)
;"void"!==String(t.status||"").toLowerCase()||i?"void"!==String(t.status||"").toLowerCase()&&!s&&u>0&&a.push({level:"warning",code:t.code||t.id||"",
date:e.toDateOnly(t.date||t.createdAt),customerCode:t.customerCode||"",customerName:t.customerName||"",amount:u,
message:"Phiếu thu đang hiệu lực nhưng chưa thấy bút toán AR credit."}):a.push({level:"danger",code:t.code||t.id||"",date:e.toDateOnly(t.date||t.createdAt),
customerCode:t.customerCode||"",customerName:t.customerName||"",amount:u,message:"Phiếu thu đã Void nhưng chưa có bút toán đảo AR debit."})}),a}function de(e=""){
return String(e||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function se(e,t=50,o=100){const r=Number(e);return!Number.isFinite(r)||r<=0?t:Math.min(Math.max(1,Math.floor(r)),o)}
function ie(e){const t=Number(e);return!Number.isFinite(t)||t<=0?1:Math.max(1,Math.floor(t))}function ue(e,t){t&&(Array.isArray(e.$and)||(e.$and=[]),e.$and.push(t))}
function le(t={}){const o={status:{$nin:["void","cancelled","canceled","deleted","duplicate_cancelled","reversed"]},reversed:{$ne:!0},refType:{$ne:"AR_LEDGER_REVERSAL"},type:{
$nin:["ar_reversal","reversal","ar_void"]}};if((t.dateFrom||t.dateTo||t.date)&&(o.date={},t.dateFrom&&(o.date.$gte=e.toDateOnly(t.dateFrom)),
t.dateTo&&(o.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(o.date=e.toDateOnly(t.date))),t.customerCode){const e=new RegExp(`^${de(t.customerCode)}$`,"i");ue(o,{$or:[{customerCode:e
},{customerId:e}]})}if(t.customerId){const e=new RegExp(`^${de(t.customerId)}$`,"i");ue(o,{$or:[{customerId:e},{customerCode:e}]})}return o}function ce(e={}){const t=[]
;if(e.delivery){const o=new RegExp(de(e.delivery),"i");t.push({$or:[{deliveryStaffCode:o},{deliveryStaffName:o},{deliveryCode:o},{deliveryName:o},{nvghCode:o},{nvghName:o}]})}
if(e.salesman){const o=new RegExp(de(e.salesman),"i");t.push({$or:[{salesmanCode:o},{salesmanName:o},{salesStaffCode:o},{salesStaffName:o},{nvbhCode:o},{nvbhName:o}]})}
return t.length?1===t.length?t[0]:{$and:t}:null}function me(e){return String(e||"").trim()}async function fe(t={}){const o=le(t),r=ce(t);if(!r)return o;const a={...le({}),type:{
$in:["ar_sale","ar_external_debt"]},...r};(t.dateFrom||t.dateTo||t.date)&&(a.date={},t.dateFrom&&(a.date.$gte=e.toDateOnly(t.dateFrom)),
t.dateTo&&(a.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(a.date=e.toDateOnly(t.date)))
;const n=await O("phạm vi nhân viên công nợ",t,()=>d.find(a).select("orderId orderCode salesOrderId salesOrderCode refId refCode").limit(5e3).lean()),s=Array.from(new Set(n.flatMap(e=>[e.orderId,e.salesOrderId,e.refId]).map(me).filter(Boolean))),i=Array.from(new Set(n.flatMap(e=>[e.orderCode,e.salesOrderCode,e.refCode]).map(me).filter(Boolean)))
;return s.length||i.length?(ue(o,{$or:[...s.length?[{orderId:{$in:s}},{salesOrderId:{$in:s}},{refId:{$in:s}}]:[],...i.length?[{orderCode:{$in:i}},{salesOrderCode:{$in:i}},{
refCode:{$in:i}}]:[]]}),o):(ue(o,{_id:"__NO_AR_SALE_MATCHING_STAFF_SCOPE__"}),o)}function ye(e=[],t={}){const o=String(t.status||"").trim()
;return"1"===String(t.includePaid||"").trim()||"paid"===o?e:o&&"all"!==o&&"unpaid"!==o&&"open"!==o?"overdue"===o?e.filter(e=>"overdue"===e.status):e.filter(e=>e.status===o):e.filter(e=>b(e.debt)||h(e.debt))
}async function $e(t={}){
const o=ie(t.page),r=se(t.limit,50,100),a=(o-1)*r,n=Boolean(t.q||t.keyword||t.search||t.salesman||t.delivery||t.customerCode||t.customerId||t.dateFrom||t.dateTo||t.date),s=await fe(t),i=String(t.q||t.keyword||t.search||"").trim()
;if(i){const e=new RegExp(de(i),"i");ue(s,{$or:[{customerCode:e},{customerName:e},{customerId:e},{orderCode:e},{salesOrderCode:e},{refCode:e}]})}n||(s.date=s.date||{
$gte:e.toDateOnly(e.todayVN())});const u=await O("tổng hợp công nợ",t,()=>d.aggregate([{$match:s},{$project:{date:{$ifNull:["$date","$createdAt"]},code:1,type:1,orderType:1,
refType:1,refId:1,refCode:1,orderId:{$ifNull:["$orderId","$salesOrderId"]},orderCode:{$ifNull:["$orderCode","$salesOrderCode"]},customerId:1,customerCode:1,customerName:1,phone:{
$ifNull:["$phone","$customerPhone"]},address:{$ifNull:["$address","$customerAddress"]},salesmanCode:1,salesmanName:1,salesStaffCode:1,salesStaffName:1,staffCode:1,staffName:1,
nvbhCode:1,nvbhName:1,deliveryStaffCode:1,deliveryStaffName:1,deliveryCode:1,deliveryName:1,deliveryStaff:1,nvghCode:1,nvghName:1,debit:{$ifNull:["$debit",0]},credit:{
$ifNull:["$credit",0]},amount:{$ifNull:["$amount",0]},status:1,source:1,note:1,createdAt:1}},{$group:{_id:{customerCode:"$customerCode",customerId:"$customerId",
customerName:"$customerName",orderCode:"$orderCode",orderId:"$orderId"},firstDate:{$min:"$date"},lastDate:{$max:"$date"},phone:{$max:"$phone"},address:{$max:"$address"},debit:{
$sum:{$cond:[{$gt:["$debit",0]},"$debit",{$cond:[{$regexMatch:{input:{$toLower:{$ifNull:["$type",""]}},regex:"sale|external_debt"}},"$amount",0]}]}},credit:{$sum:{$cond:[{
$gt:["$credit",0]},"$credit",{$cond:[{$regexMatch:{input:{$toLower:{$ifNull:["$type",""]}},regex:"sale|external_debt"}},0,"$amount"]}]}},receiptAmount:{$sum:{$cond:[{$regexMatch:{
input:{$toLower:{$ifNull:["$type",""]}},regex:"receipt|payment|collection|debt"}},{$ifNull:["$credit","$amount"]},0]}},returnAmount:{$sum:{$cond:[{$regexMatch:{input:{$toLower:{
$ifNull:["$type",""]}},regex:"return"}},{$ifNull:["$credit","$amount"]},0]}},bonusAmount:{$sum:{$cond:[{$regexMatch:{input:{$toLower:{$ifNull:["$type",""]}},
regex:"bonus|discount|allowance"}},{$ifNull:["$credit","$amount"]},0]}},saleSalesmanCode:{$max:{$cond:[{$regexMatch:{input:{$toLower:{$ifNull:["$type",""]}},
regex:"sale|external_debt"}},{$ifNull:["$salesmanCode",{$ifNull:["$salesStaffCode","$nvbhCode"]}]},""]}},saleSalesmanName:{$max:{$cond:[{$regexMatch:{input:{$toLower:{
$ifNull:["$type",""]}},regex:"sale|external_debt"}},{$ifNull:["$salesmanName",{$ifNull:["$salesStaffName","$nvbhName"]}]},""]}},saleDeliveryStaffCode:{$max:{$cond:[{$regexMatch:{
input:{$toLower:{$ifNull:["$type",""]}},regex:"sale|external_debt"}},{$ifNull:["$deliveryStaffCode",{$ifNull:["$deliveryCode","$nvghCode"]}]},""]}},saleDeliveryStaffName:{$max:{
$cond:[{$regexMatch:{input:{$toLower:{$ifNull:["$type",""]}},regex:"sale|external_debt"}},{$ifNull:["$deliveryStaffName",{$ifNull:["$deliveryName","$nvghName"]}]},""]}},
saleOrderType:{$max:{$cond:[{$regexMatch:{input:{$toLower:{$ifNull:["$type",""]}},regex:"sale|external_debt"}},{$ifNull:["$orderType",{$cond:[{$eq:["$type","ar_external_debt"]
},"external_debt","sales_order"]}]},""]}},salesmanCode:{$max:{$ifNull:["$salesmanCode",{$ifNull:["$salesStaffCode","$nvbhCode"]}]}},salesmanName:{$max:{$ifNull:["$salesmanName",{
$ifNull:["$salesStaffName","$nvbhName"]}]}},deliveryStaffCode:{$max:{$ifNull:["$deliveryStaffCode",{$ifNull:["$deliveryCode","$nvghCode"]}]}},deliveryStaffName:{$max:{
$ifNull:["$deliveryStaffName",{$ifNull:["$deliveryName","$nvghName"]}]}},fallbackSalesmanCode:{$max:{$ifNull:["$salesmanCode",{$ifNull:["$salesStaffCode","$nvbhCode"]}]}},
fallbackSalesmanName:{$max:{$ifNull:["$salesmanName",{$ifNull:["$salesStaffName","$nvbhName"]}]}},fallbackDeliveryStaffCode:{$max:{$ifNull:["$deliveryStaffCode",{
$ifNull:["$deliveryCode","$nvghCode"]}]}},fallbackDeliveryStaffName:{$max:{$ifNull:["$deliveryStaffName",{$ifNull:["$deliveryName","$nvghName"]}]}}}},{$addFields:{debt:{
$subtract:["$debit","$credit"]}}},{$sort:{debt:-1,lastDate:-1}},{$limit:Math.max(a+r+1,r+1)}]).allowDiskUse(!0).exec()),l=e.todayVN();let c=u.map(t=>{const o=t._id||{}
;!t.fallbackSalesmanCode&&t.salesmanCode&&(t.fallbackSalesmanCode=t.salesmanCode),!t.fallbackSalesmanName&&t.salesmanName&&(t.fallbackSalesmanName=t.salesmanName),
!t.fallbackDeliveryStaffCode&&t.deliveryStaffCode&&(t.fallbackDeliveryStaffCode=t.deliveryStaffCode),
!t.fallbackDeliveryStaffName&&t.deliveryStaffName&&(t.fallbackDeliveryStaffName=t.deliveryStaffName)
;const r=C(f(t.debit)-f(t.credit)),a=e.toDateOnly(t.firstDate||t.lastDate||new Date),n=b(r)?Math.max(0,v(l,a)):0,d=h(r)?"overpaid":b(r)?n>0?"overdue":"open":"paid";return{
orderId:o.orderId||o.orderCode||"",orderCode:o.orderCode||o.orderId||"",customerId:o.customerId||"",customerCode:o.customerCode||"",customerName:o.customerName||"Chưa rõ khách",
phone:t.phone||"",address:t.address||"",salesmanCode:t.saleSalesmanCode||t.fallbackSalesmanCode||"",salesmanName:t.saleSalesmanName||t.fallbackSalesmanName||"",
deliveryStaffCode:t.saleDeliveryStaffCode||t.fallbackDeliveryStaffCode||"",deliveryStaffName:t.saleDeliveryStaffName||t.fallbackDeliveryStaffName||"",
orderType:t.saleOrderType||(/^NDNBLH/i.test(String(o.orderCode||""))?"external_debt":"sales_order"),documentDate:a,dueDate:a,debit:f(t.debit),credit:f(t.credit),
receiptAmount:Math.max(0,f(t.receiptAmount)),returnAmount:Math.max(0,f(t.returnAmount)),bonusAmount:Math.max(0,f(t.bonusAmount)),debt:r,rawDebt:r,overpaidAmount:Math.max(0,-r),
debtZeroTolerance:p,overdueDays:n,agingDays:a?Math.max(0,v(l,a)):0,status:d}});c=ye(c,t),a&&(c=c.slice(a));const m=c.length>r;c=c.slice(0,r);const y=new Map;c.forEach(e=>{
const t=String(e.customerCode||e.customerId||e.customerName||"").trim();if(!t)return;y.has(t)||y.set(t,{customerId:e.customerId,customerCode:e.customerCode,
customerName:e.customerName||"Chưa rõ khách",phone:e.phone,address:e.address,salesmanCode:e.salesmanCode||"",salesmanName:e.salesmanName||"",
deliveryStaffCode:e.deliveryStaffCode||"",deliveryStaffName:e.deliveryStaffName||"",debit:0,credit:0,receiptAmount:0,returnAmount:0,bonusAmount:0,debt:0,orderCount:0,
overdueCount:0,overdueDays:0,agingDays:0,orders:[]});const o=y.get(t);o.debit+=f(e.debit),o.credit+=f(e.credit),o.receiptAmount+=f(e.receiptAmount),
o.returnAmount+=f(e.returnAmount),o.bonusAmount+=f(e.bonusAmount),o.debt+=C(e.debt),o.orderCount+=1,o.orders.push({orderId:e.orderId,orderCode:e.orderCode,
documentDate:e.documentDate,dueDate:e.dueDate,debit:f(e.debit),credit:f(e.credit),receiptAmount:f(e.receiptAmount),returnAmount:f(e.returnAmount),bonusAmount:f(e.bonusAmount),
debt:C(e.debt),overdueDays:f(e.overdueDays),agingDays:f(e.agingDays),status:e.status,salesmanCode:e.salesmanCode,salesmanName:e.salesmanName,deliveryStaffCode:e.deliveryStaffCode,
deliveryStaffName:e.deliveryStaffName,orderType:e.orderType||"sales_order"}),o.overdueDays=Math.max(f(o.overdueDays),f(e.overdueDays)),
o.agingDays=Math.max(f(o.agingDays),f(e.agingDays)),"overdue"===e.status&&(o.overdueCount+=1)});const $=Array.from(y.values()).map(e=>({...e,debt:C(e.debt),
overpaidAmount:Math.max(0,-C(e.debt)),status:h(e.debt)?"overpaid":b(e.debt)?f(e.overdueDays)>0?"overdue":"open":"paid",debtZeroTolerance:p
})).sort((e,t)=>Math.abs(t.debt)-Math.abs(e.debt)||t.overdueDays-e.overdueDays||String(e.customerName).localeCompare(String(t.customerName)))
;let g=(await O("chi tiết công nợ",t,()=>d.find(s).sort({date:-1,createdAt:-1}).limit(200).lean())).map(ae)
;g=M(g,t,["code","refCode","orderCode","customerCode","customerName","type","note"]);const A=he(c,{codeKey:"salesmanCode",nameKey:"salesmanName",role:"salesman"}),N=he(c,{
codeKey:"deliveryStaffCode",nameKey:"deliveryStaffName",role:"delivery"}),S={page:o,limit:r,hasMore:m,orderCount:c.length,customerCount:$.length,
overdueCount:c.filter(e=>"overdue"===e.status).length,totalDebit:D(c,e=>e.debit),totalCredit:D(c,e=>e.credit),totalDebt:D(c,e=>C(e.debt)),
totalPositiveDebt:D(c.filter(e=>b(e.debt)),e=>C(e.debt)),totalOverpaid:D(c.filter(e=>h(e.debt)),e=>Math.abs(C(e.debt))),debtZeroTolerance:p,journalCount:u.length,
arLedgerCount:g.length,arWarningCount:0,optimized:!0};return{source:"mongo_ar_ledger_fast",ledgerCollection:"arLedgers",debts:c,customerSummary:$,bySalesman:A,byDelivery:N,
arLedger:g,arDiagnostics:[],summary:S}}async function ge(e={}){return{source:"mongo_ar_ledger_fast",summary:{totalDebt:0,customerDebt:0,orderDebt:0,overdueDebt:0,
note:"Màn công nợ chỉ tải danh sách khi người dùng nhập khách/NVBH/NVGH để tránh quét toàn bộ AR Ledger."},filters:{maxListLimit:100,maxAutocompleteLimit:20}}}
async function pe(e={}){return $e({...e,limit:se(e.limit,50,100)})}async function Ce(e={}){const t=e.customerCode||e.code||e.customerId||e.id||e.q;return $e({...e,customerCode:t,
q:e.q||t,includePaid:e.includePaid||"1",limit:se(e.limit,100,100)})}async function be(e={}){const t=ie(e.page),o=se(e.limit,100,200),r=(t-1)*o,a=await fe(e)
;if(e.q||e.keyword||e.search){const t=new RegExp(de(e.q||e.keyword||e.search),"i");ue(a,{$or:[{code:t},{refCode:t},{orderCode:t},{salesOrderCode:t},{customerCode:t},{customerName:t
},{customerId:t},{type:t},{note:t}]})}const n=await O("sổ công nợ",e,()=>d.find(a).sort({date:-1,createdAt:-1}).skip(r).limit(o+1).lean()),s=n.length>o,i=(s?n.slice(0,o):n).map(ae)
;return{source:"mongo_ar_ledger_fast",ledgerCollection:"arLedgers",debts:[],customerSummary:[],bySalesman:[],byDelivery:[],arLedger:i,arDiagnostics:[],summary:{page:t,limit:o,
hasMore:s,arLedgerCount:i.length,totalDebit:D(i,e=>e.debit),totalCredit:D(i,e=>e.credit),totalDebt:D(i,e=>e.balanceEffect),arWarningCount:0,optimized:!0}}}function he(e=[],t={}){
const o=t.codeKey||"salesmanCode",r=t.nameKey||"salesmanName",a=t.role||"person",n=new Map;return e.forEach(e=>{
const t=String(e[o]||"").trim(),d=String(e[r]||"").trim(),s=t||d||"UNASSIGNED";n.has(s)||n.set(s,{role:a,code:t,name:d||(t?"":"Chưa gán"),label:t&&d?`${t} - ${d}`:d||t||"Chưa gán",
customerKeys:new Set,customers:0,orders:0,paidOrders:0,overdueOrders:0,openOrders:0,debit:0,credit:0,receiptAmount:0,returnAmount:0,bonusAmount:0,debt:0,maxOverdueDays:0,
maxAgingDays:0});const i=n.get(s),u=e.customerId||e.customerCode||e.customerName;u&&i.customerKeys.add(String(u)),i.orders+=1,"paid"===e.status&&(i.paidOrders+=1),
"overdue"===e.status&&(i.overdueOrders+=1),"open"===e.status&&(i.openOrders+=1),i.debit+=f(e.debit),i.credit+=f(e.credit),i.receiptAmount+=f(e.receiptAmount),
i.returnAmount+=f(e.returnAmount),i.bonusAmount+=f(e.bonusAmount),i.debt+=C(e.debt),i.maxOverdueDays=Math.max(i.maxOverdueDays,f(e.overdueDays)),
i.maxAgingDays=Math.max(i.maxAgingDays,f(e.agingDays))}),Array.from(n.values()).map(e=>{const{customerKeys:t,...o}=e;return{...o,customers:t.size,
collectionRate:o.debit>0?Math.round(o.credit/o.debit*1e4)/100:0,debt:Math.max(0,C(o.debt)),debtZeroTolerance:p,status:b(o.debt)?o.overdueOrders>0?"overdue":"open":"paid"}
}).sort((e,t)=>t.debt-e.debt||t.overdueOrders-e.overdueOrders||String(e.label).localeCompare(String(t.label)))}async function ve(e={}){const t=await $e(e);return{source:t.source,
ledgerCollection:t.ledgerCollection,bySalesman:t.bySalesman,summary:t.summary}}async function Ae(e={}){const t=await $e(e);return{source:t.source,
ledgerCollection:t.ledgerCollection,byDelivery:t.byDelivery,summary:t.summary}}async function Ne(t={}){
const{page:o,limit:a,skip:n}=w(t,50,200),d=k(E(t,["date","orderDate","documentDate","createdAt"]),t,["code","orderCode","customerCode","customerName","salesStaffCode","salesStaffName"]),s=R(["totalAmount","amount","grandTotal","total","value"],0),i=R(["paidAmount","paymentAmount"],0),u={
$let:{vars:{remaining:{$subtract:[s,i]}},in:{$cond:[{$gt:["$$remaining",0]},"$$remaining",0]}}
},l=T(["salesStaffCode","salesmanCode","nvbhCode"],""),c=T(["salesStaffName","salesmanName","nvbhName"],""),m=await O("bán hàng",t,()=>r.aggregate([{$match:d},{$facet:{rows:[{
$sort:{date:-1,orderDate:-1,createdAt:-1,_id:-1}},{$skip:n},{$limit:a}],totals:[{$group:{_id:null,orderCount:{$sum:1},totalAmount:{$sum:s},paidAmount:{$sum:i},debtAmount:{$sum:u}}
}],bySalesman:[{$group:{_id:{code:l,name:c},orderCount:{$sum:1},totalAmount:{$sum:s}}},{$sort:{totalAmount:-1,"_id.name":1}}]}
}]).allowDiskUse(!0).exec()),y=m?.[0]||{},$=(y.rows||[]).map(t=>({id:t.id||String(t._id||""),code:t.code||t.orderCode||"",date:e.toDateOnly(t.date||t.orderDate||t.createdAt),
customerCode:t.customerCode||"",customerName:t.customerName||"",salesmanCode:t.salesStaffCode||t.salesmanCode||t.nvbhCode||"",
salesmanName:t.salesStaffName||t.salesmanName||t.nvbhName||"",totalAmount:S(t),paidAmount:f(t.paidAmount||t.paymentAmount),
debtAmount:Math.max(0,S(t)-f(t.paidAmount||t.paymentAmount)),status:t.status||""})),g=y.totals?.[0]||{};return{source:"mongo_aggregate",sales:$,items:$,meta:x(o,a,g.orderCount||0),
bySalesman:(y.bySalesman||[]).map(e=>({salesmanCode:e?._id?.code||"",salesmanName:e?._id?.name||"",orderCount:f(e.orderCount),totalAmount:f(e.totalAmount)})),summary:{
orderCount:f(g.orderCount),totalAmount:f(g.totalAmount),paidAmount:f(g.paidAmount),debtAmount:f(g.debtAmount)}}}async function Se(e={}){
const{page:t,limit:o,skip:r}=w(e,50,200),a=E(e,["date","createdAt"]),d=E(e,["date","documentDate","createdAt"]),c=E(e,["date","documentDate","createdAt"]),m=E(e,["date","returnDate","documentDate","deliveryDate","createdAt"]),[y,$,g,p,C,b,h,v]=await O("tài chính",e,()=>Promise.all([n.find(d).sort({
date:-1,createdAt:-1}).skip(r).limit(o).lean(),i.find(c).sort({date:-1,createdAt:-1}).skip(r).limit(o).lean(),u.find(c).sort({date:-1,createdAt:-1
}).skip(r).limit(o).lean(),l.find(m).sort({date:-1,createdAt:-1}).skip(r).limit(o).lean(),n.aggregate([{$match:d},{$group:{_id:null,count:{$sum:1},amount:{
$sum:R(["amount","totalAmount","grandTotal","total","value"],0)}}}]),l.aggregate([{$match:m},{$group:{_id:null,count:{$sum:1},amount:{
$sum:R(["returnAmount","totalAmount","amount","debtReduction"],0)}}}]),s.aggregate([{$match:a},{$group:{_id:{fundType:"$fundType",direction:"$direction"},amount:{
$sum:R(["amount"],0)},count:{$sum:1}}}]),Promise.all([n.countDocuments(d),i.countDocuments(c),u.countDocuments(c),l.countDocuments(m)])])),A=(e,t)=>{
const o=(h||[]).find(o=>String(o?._id?.fundType||"").toLowerCase()===e&&String(o?._id?.direction||"").toLowerCase()===t);return f(o?.amount)
},N=A("cash","in"),S=A("cash","out"),D=A("bank","in"),_=A("bank","out"),I=C?.[0]||{},k=b?.[0]||{},T={receipts:f(v?.[0]),cashbook:f(v?.[1]),bankbook:f(v?.[2]),returns:f(v?.[3])
},M=Math.max(...Object.values(T),0);return{source:"mongo_paged",fundSource:"fundLedgers",meta:{...x(t,o,M),categoryCounts:T},summary:{receiptCount:f(I.count),
totalReceipts:f(I.amount),cashIn:N,cashOut:S,cashBalance:N-S,bankIn:D,bankOut:_,bankBalance:D-_,totalFundIn:N+D,totalFundOut:S+_,totalFundBalance:N+D-S-_,returnCount:f(k.count),
totalReturns:f(k.amount)},receipts:y,cashbook:$,bankbook:g,returns:p}}async function De(t={}){
const{page:o,limit:r,skip:n}=w(t,50,200),d=k(E(t,["deliveryDate","date","createdAt"]),t,["code","masterOrderCode","deliveryStaffCode","deliveryStaffName","status"]),s=R(["totalAmount","amount","grandTotal","total","value"],0),i=R(["collectedAmount","paidAmount"],0),u={
$convert:{input:{$ifNull:["$orderCount",{$ifNull:["$childOrderCount",{$cond:[{$isArray:"$childOrderIds"},{$size:"$childOrderIds"},{$cond:[{$isArray:"$orderIds"},{$size:"$orderIds"
},0]}]}]}]},to:"double",onError:0,onNull:0}
},l=T(["deliveryStaffCode","deliveryCode","nvghCode"],""),c=T(["deliveryStaffName","deliveryName","nvghName"],""),m=await O("giao hàng",t,()=>a.aggregate([{$match:d},{$facet:{
rows:[{$sort:{deliveryDate:-1,createdAt:-1,_id:-1}},{$skip:n},{$limit:r}],totals:[{$group:{_id:null,tripCount:{$sum:1},orderCount:{$sum:u},totalAmount:{$sum:s},collectedAmount:{
$sum:i}}}],byStaff:[{$group:{_id:{code:l,name:c},tripCount:{$sum:1},orderCount:{$sum:u},totalAmount:{$sum:s},collectedAmount:{$sum:i}}},{$sort:{totalAmount:-1,"_id.name":1}}]}
}]).allowDiskUse(!0).exec()),y=m?.[0]||{},$=(y.rows||[]).map(t=>({id:t.id||String(t._id||""),code:t.code||t.masterOrderCode||"",
deliveryDate:e.toDateOnly(t.deliveryDate||t.date||t.createdAt),deliveryStaffCode:t.deliveryStaffCode||t.deliveryCode||t.nvghCode||"",
deliveryStaffName:t.deliveryStaffName||t.deliveryName||t.nvghName||"",
orderCount:f(t.orderCount||t.childOrderCount||(Array.isArray(t.childOrderIds)?t.childOrderIds.length:Array.isArray(t.orderIds)?t.orderIds.length:0)),totalAmount:S(t),
collectedAmount:f(t.collectedAmount||t.paidAmount),status:t.status||""})),g=y.totals?.[0]||{};return{source:"mongo_aggregate",delivery:$,items:$,meta:x(o,r,g.tripCount||0),
byStaff:(y.byStaff||[]).map(e=>({deliveryStaffCode:e?._id?.code||"",deliveryStaffName:e?._id?.name||"",tripCount:f(e.tripCount),orderCount:f(e.orderCount),
totalAmount:f(e.totalAmount),collectedAmount:f(e.collectedAmount)})),summary:{tripCount:f(g.tripCount),orderCount:f(g.orderCount),totalAmount:f(g.totalAmount),
collectedAmount:f(g.collectedAmount)}}}async function _e(e={}){
const t=R(["totalAmount","amount","grandTotal","total","value"],0),o=R(["paidAmount","paymentAmount"],0),n=E(e,["date","orderDate","documentDate","createdAt"]),i=E(e,["deliveryDate","date","createdAt"]),u=E(e,["date","createdAt"]),l=E(e,["date","documentDate","importDate","createdAt"]),m={
status:{$nin:_}},[y,$,b,h,v,A]=await O("dashboard",e,()=>Promise.all([r.aggregate([{$match:n},{$group:{_id:null,orderCount:{$sum:1},totalAmount:{$sum:t},paidAmount:{$sum:o}}
}]),d.aggregate([{$match:m},{$group:{_id:null,debit:{$sum:R(["debit","arDebit"],0)},credit:{$sum:R(["credit","arCredit"],0)}}}]),g.getInventorySummary({}),s.aggregate([{$match:u},{
$group:{_id:{fundType:"$fundType",direction:"$direction"},amount:{$sum:R(["amount"],0)}}}]),a.aggregate([{$match:i},{$group:{_id:null,tripCount:{$sum:1},totalAmount:{
$sum:R(["totalAmount","amount"],0)},collectedAmount:{$sum:R(["collectedAmount","paidAmount"],0)}}}]),c.aggregate([{$match:l},{$group:{_id:null,importCount:{$sum:1},
totalImportAmount:{$sum:R(["totalAmount","amount"],0)}}
}])])),N=y?.[0]||{},S=$?.[0]||{},D=v?.[0]||{},I=A?.[0]||{},w=(e,t)=>f((h||[]).find(o=>String(o?._id?.fundType||"").toLowerCase()===e&&String(o?._id?.direction||"").toLowerCase()===t)?.amount),x=w("cash","in"),k=w("cash","out"),T=w("bank","in"),M=w("bank","out"),L=C(f(S.debit)-f(S.credit))
;return{source:"mongo_summary_only",dashboard:{sales:{orderCount:f(N.orderCount),totalAmount:f(N.totalAmount),paidAmount:f(N.paidAmount),
debtAmount:Math.max(0,f(N.totalAmount)-f(N.paidAmount))},debts:{totalDebit:f(S.debit),totalCredit:f(S.credit),totalDebt:L,debtZeroTolerance:p},stock:b?.summary||{},finance:{
cashIn:x,cashOut:k,cashBalance:x-k,bankIn:T,bankOut:M,bankBalance:T-M,totalFundBalance:x+T-k-M},delivery:{tripCount:f(D.tripCount),totalAmount:f(D.totalAmount),
collectedAmount:f(D.collectedAmount)},imports:{importCount:f(I.importCount),totalImportAmount:f(I.totalImportAmount)}}}}module.exports={stockReport:B,stockCardReport:U,
debtReport:$e,debtInit:ge,debtCustomers:pe,debtCustomerDetail:Ce,debtArLedger:be,debtBySalesmanReport:ve,debtByDeliveryReport:Ae,dashboardReport:_e,salesReport:Ne,financeReport:Se,
deliveryReport:De};
