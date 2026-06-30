/* GENERATED FILE — edit src/services/reportLegacy.service.source/part-01.jsfrag, src/services/reportLegacy.service.source/part-02.jsfrag, src/services/reportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),t=require("../models/Product"),o=require("../models/StockTransaction"),r=require("../models/SalesOrder"),n=require("../models/MasterOrder"),a=require("../models/Receipt"),d=require("../models/ArLedger"),u=require("../models/FundLedger"),i=require("../models/Cashbook"),s=require("../models/Bankbook"),c=require("../models/ReturnOrder"),l=require("../models/ImportOrder"),{normalizeText:m,toNumber:f}=require("../utils/common.util"),{STOCK_WAREHOUSE_CODE:y,STOCK_WAREHOUSE_NAME:p}=require("../constants/business.constants"),g=require("./inventoryStock.service"),{DEBT_ZERO_TOLERANCE:C,normalizeDebtAmount:$,hasOpenDebt:A,isOverpaid:b}=require("../constants/finance.constants"),h=require("./accounting/arDebtRuntimeView.service"),S=require("./accounting/arCustomerDebtReadModel.service")
;function v(t,o){const r=new Date(e.toDateOnly(t)),n=new Date(e.toDateOnly(o))
;return Number.isNaN(r.getTime())||Number.isNaN(n.getTime())?0:Math.floor((r.getTime()-n.getTime())/864e5)}function O(e={}){
return!["void","cancelled","canceled","deleted","duplicate_cancelled"].includes(String(e.status||"").toLowerCase())}function _(t,o={}){
const r=e.toDateOnly(t.date||t.documentDate||t.orderDate||t.deliveryDate||t.createdAt);return!(o.dateFrom&&r<o.dateFrom||o.dateTo&&r>o.dateTo||o.date&&r!==o.date)}function R(e={}){
return f(e.totalAmount??e.amount??e.grandTotal??e.total??e.value)}function N(e=[],t=R){return e.reduce((e,o)=>e+f(t(o)),0)}
const I=["void","cancelled","canceled","deleted","duplicate_cancelled"];function D(e,t,o={}){"test"!==process.env.NODE_ENV&&console.error("[REPORT_DATA_SOURCE_FAILED]",{report:t,
query:o,error:e?.message||String(e||"")});const r=new Error(`Không thể tải dữ liệu báo cáo ${t}`);return r.code="REPORT_DATA_SOURCE_FAILED",r.status=503,r.cause=e,r}
async function T(e,t,o){try{return await o()}catch(o){throw D(o,e,t)}}function E(e={},t=50,o=200){const r=ce(e.page),n=se(e.limit,t,o);return{page:r,limit:n,skip:(r-1)*n}}
function w(e,t,o){const r=Math.max(0,f(o));return{page:e,limit:t,total:r,totalPages:r>0?Math.ceil(r/t):0,hasMore:e*t<r}}function k(e={},t={},o=[]){
const r=String(t.q||t.keyword||t.search||"").trim();if(!r)return e;const n=new RegExp(ie(r),"i");return{$and:[e,{$or:o.map(e=>({[e]:n}))}]}}function L(e=[],t=0){
return e.reduceRight((e,t)=>({$ifNull:[`$${t}`,e]}),t)}function Q(e=[],t=0){return{$convert:{input:L(e,t),to:"double",onError:0,onNull:0}}}function M(e=[],t={},o=[]){
const r=m(t.q||t.keyword||t.search);return r?e.filter(e=>o.some(t=>m(e[t]).includes(r))):e}function q(t={},o=["date","createdAt"]){
const r=e.toDateOnly(t.date||""),n=e.toDateOnly(t.dateFrom||r||""),a=e.toDateOnly(t.dateTo||r||"");if(!n&&!a)return{};const d=r||{...n?{$gte:n}:{},...a?{$lte:a}:{}
},u=o.filter(e=>"createdAt"!==e).map(e=>({[e]:d}));if(o.includes("createdAt")){const e={};if(n&&(e.$gte=new Date(`${n}T00:00:00+07:00`)),a){const t=new Date(`${a}T00:00:00+07:00`)
;t.setDate(t.getDate()+1),e.$lt=t}u.push({createdAt:e})}return 1===u.length?u[0]:{$or:u}}function x(e={},t=["date","createdAt"]){return{status:{
$nin:["void","cancelled","canceled","deleted","duplicate_cancelled"]},...q(e,t)}}function U(t={}){const o={};return t.productCode&&(o.productCode=String(t.productCode).trim()),
(t.date||t.dateFrom||t.dateTo)&&(o.date={},t.dateFrom&&(o.date.$gte=e.toDateOnly(t.dateFrom)),t.dateTo&&(o.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(o.date=e.toDateOnly(t.date))),
o}function F(e={}){const t=String(e.direction||"").toUpperCase();return t?"IN"===t:f(e.quantity??e.qty)>=0}function B(e={}){return f(e.quantity??e.qty??0)}async function P(r={}){
const n=m(r.q),a=Boolean(r.dateFrom||r.dateTo||r.asOfDate||"movement"===r.mode),d=["1","true","yes"].includes(String(r.full||r.export||"").toLowerCase()),{page:u,limit:i,skip:s}=E(r,50,200)
;if(a){const a=e.toDateOnly(r.dateFrom||"0000-01-01"),c=e.toDateOnly(r.dateTo||r.asOfDate||e.todayVN()),[l,g]=await T("tồn kho theo kỳ",r,()=>Promise.all([o.find(q({dateTo:c
},["date","createdAt"])).sort({date:1,createdAt:1,productCode:1}).lean(),t.find({}).lean()])),C=new Map(g.map(e=>[String(e.code||e.id||e._id),e])),$=new Map;l.forEach(t=>{
const o=e.toDateOnly(t.date||t.createdAt);if(o>c)return;const r=String(t.productCode||t.productId||"").trim(),n=C.get(r)||{};$.has(r)||$.set(r,{
productId:t.productId||n.id||String(n._id||""),productCode:r,productName:t.productName||n.name||"",warehouseCode:y,warehouseName:p,unit:n.unit||t.unit||"",openingQty:0,importQty:0,
exportQty:0,returnQty:0,adjustmentQty:0,endingQty:0});const d=$.get(r),u=B(t);if(o<a)d.openingQty+=u;else{const e=String(t.type||"").toUpperCase()
;e.includes("RETURN")?d.returnQty+=Math.abs(u):e.includes("IMPORT")||F(t)?d.importQty+=Math.abs(u):e.includes("SALE")||!F(t)?d.exportQty+=Math.abs(u):d.adjustmentQty+=u}
d.endingQty+=u});let A=Array.from($.values()).map(e=>({...e,inQty:e.importQty+e.returnQty+Math.max(0,e.adjustmentQty),outQty:e.exportQty+Math.abs(Math.min(0,e.adjustmentQty)),
quantity:e.endingQty,qty:e.endingQty,availableQty:e.endingQty}));n&&(A=A.filter(e=>[e.productCode,e.productName].some(e=>m(e).includes(n))))
;const b=A.filter(e=>f(e.quantity??e.qty??e.availableQty)<0),h=A.reduce((e,t)=>(e.totalRows+=1,e.openingQty+=f(t.openingQty),e.importQty+=f(t.importQty),
e.exportQty+=f(t.exportQty),e.returnQty+=f(t.returnQty),e.endingQty+=f(t.endingQty),e),{totalRows:0,openingQty:0,importQty:0,exportQty:0,returnQty:0,endingQty:0})
;h.negativeStockCount=b.length;const S=d?A:A.slice(s,s+i);return{source:"mongo_stock_transactions",dateFrom:a,dateTo:c,stock:S,items:S,
meta:d?w(1,Math.max(A.length,1),A.length):w(u,i,A.length),summary:h,negativeStockCount:b.length,negativeStockRows:b}}
const c=await T("tồn kho hiện tại",r,()=>g.getInventorySummary(r)),l=c.stock||[],C=d?l:l.slice(s,s+i);return{...c,source:"mongo_inventories_canonical",
inventorySource:"inventories",stock:C,items:C,meta:d?w(1,Math.max(l.length,1),l.length):w(u,i,l.length),summary:c.summary,negativeStockCount:c.negativeStockCount,
negativeStockRows:c.negativeStockRows}}async function V(t={}){
const{page:r,limit:n,skip:a}=E(t,50,200),d=k(U(t),t,["productCode","productName","warehouseCode","refCode","refType","type"]),u=Q(["quantity","qty"],0),i=await T("thẻ kho",t,()=>o.aggregate([{
$match:d},{$sort:{productCode:1,date:1,createdAt:1,_id:1}},{$setWindowFields:{partitionBy:{$ifNull:["$productCode","$productId"]},sortBy:{date:1,createdAt:1,_id:1},output:{
runningBalance:{$sum:u,window:{documents:["unbounded","current"]}}}}},{$facet:{rows:[{$skip:a},{$limit:n}],totals:[{$group:{_id:null,transactionCount:{$sum:1},inQty:{$sum:{$cond:[{
$gt:[u,0]},u,0]}},outQty:{$sum:{$cond:[{$lt:[u,0]},{$abs:u},0]}}}}]}}]).allowDiskUse(!0).exec()),s=i?.[0]||{},c=(s.rows||[]).map(t=>{const o=B(t);return{id:t.id||String(t._id||""),
date:e.toDateOnly(t.date||t.createdAt),productCode:t.productCode||"",productName:t.productName||"",warehouseCode:y,type:t.type||"",refType:t.refType||"",refCode:t.refCode||"",
inQty:f(t.inQty||(o>0?o:0)),outQty:f(t.outQty||(o<0?Math.abs(o):0)),quantity:o,balanceQty:f(t.balanceQty??t.runningBalance),note:t.note||""}}),l=s.totals?.[0]||{};return{
source:"mongo_stock_transactions",transactions:c,items:c,meta:w(r,n,l.transactionCount||0),summary:{transactionCount:f(l.transactionCount),inQty:f(l.inQty),outQty:f(l.outQty)}}}
function K(e={}){return String(e.id||e._id||e.code||e.refId||e.refCode||"").trim()}function Z(e=[]){return e.filter(O).filter(e=>{const t=String(e.type||"").toLowerCase()
;return"AR"===String(e.account||"").toUpperCase()||t.includes("ar")||t.includes("debt")||t.includes("receipt")||t.includes("return")||f(e.debit)||f(e.credit)})}function j(e={}){
return{id:String(e.id||e._id||e.code||"").trim(),code:String(e.code||e.orderCode||"").trim()}}function z(e={},t={}){
const{id:o,code:r}=j(t),n=[e.orderId,e.salesOrderId,e.refId,e.orderCode,e.salesOrderCode,e.refCode].map(e=>String(e||"").trim()).filter(Boolean);return n.includes(o)||n.includes(r)
}function H(e={}){return String(e.orderId||e.salesOrderId||e.refId||e.orderCode||e.salesOrderCode||e.refCode||"").trim()}function G(e={}){
return String(e.customerId||e.customerCode||e.customerName||"").trim()}function W(e={}){
const t=["delivered","success","completed","done"].includes(String(e.deliveryStatus||"").toLowerCase()),o=String(e.accountingStatus||"").toLowerCase(),r=Boolean(e.accountingConfirmed)||["confirmed","locked","posted"].includes(o)
;return t&&r}function J(e={},t=new Map){
const o=[e.orderId,e.salesOrderId,e.sourceOrderId,e.refId,e.orderCode,e.salesOrderCode,e.sourceOrderCode,e.refCode].map(e=>String(e||"").trim()).filter(Boolean);for(const e of o){
const o=t.get(e);if(o)return o}return null}function X(e={}){const t=[e.source,e.refType,e.type,e.note].map(e=>String(e||"").toLowerCase()).join(" ")
;return t.includes("mobile_delivery")||t.includes("mobiledelivery")||t.includes("mobile delivery")||t.includes("mobile_delivery_return")||t.includes("app giao hàng")}
function Y(e={},t=new Map){if(!X(e))return!0;const o=J(e,t);return!!o&&W(o)}function ee(e={}){const t=String(e.accountingStatus||e.financeStatus||"").toLowerCase()
;return Boolean(e.accountingConfirmed||e.financeConfirmed)||["confirmed","locked","posted"].includes(t)}function te(e={},t=new Map){if(ee(e))return!0;const o=J(e,t);return!!o&&W(o)
}function oe(e={},t=new Map){const o=String(e.type||"").toLowerCase(),r=String(e.refType||"").toLowerCase();if(!o.includes("return")&&!r.includes("return")&&!X(e))return!1
;if(ee(e))return!1;const n=J(e,t);return n?!W(n):X(e)}function re(t={}){if(!W(t))return null
;const o=f(t.debtBeforeCollection??t.totalAmount??t.amount??t.grandTotal??t.payableAmount??t.debtAmount??t.debt??0);return o<=0?null:{id:`VIRTUAL-AR-SALE-${t.id||t.code}`,
code:`VIRTUAL-AR-SALE-${t.code||t.id}`,date:e.toDateOnly(t.date||t.orderDate||t.createdAt),type:"ar_sale_virtual_backfill",account:"AR",refType:"SALES_ORDER",
refId:t.id||t._id||t.code,refCode:t.code||t.id,orderId:t.id||t._id||t.code,orderCode:t.code||t.id,customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",salesmanCode:t.salesmanCode||t.salesStaffCode||t.nvbhCode||"",salesmanName:t.salesmanName||t.salesStaffName||t.nvbhName||"",
deliveryStaffCode:t.deliveryStaffCode||"",deliveryStaffName:t.deliveryStaffName||"",debit:o,credit:0,amount:o,status:"posted",source:"virtual_backfill_from_orders"}}
function ne(t={}){const o=R(t)||f(t.returnAmount||t.debtReduction||t.totalAmount);return o<=0?null:{id:`VIRTUAL-AR-RETURN-${t.id||t.code}`,code:`VIRTUAL-AR-RETURN-${t.code||t.id}`,
date:e.toDateOnly(t.date||t.createdAt),type:"ar_return_virtual_backfill",account:"AR",refType:"RETURN_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,
orderId:t.salesOrderId||t.orderId||t.sourceOrderId||"",orderCode:t.salesOrderCode||t.orderCode||"",customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",debit:0,credit:o,amount:o,status:"posted",source:"virtual_backfill_from_returns"}}function ae(t={}){const o=R(t);return o<=0?null:{
id:`VIRTUAL-AR-RECEIPT-${t.id||t.code}`,code:`VIRTUAL-AR-RECEIPT-${t.code||t.id}`,date:e.toDateOnly(t.date||t.createdAt),type:"ar_receipt_virtual_backfill",account:"AR",
refType:"RECEIPT",refId:t.id||t._id||t.code,refCode:t.code||t.id,orderId:t.orderId||t.salesOrderId||"",orderCode:t.orderCode||t.salesOrderCode||t.refCode||"",
customerId:t.customerId||"",customerCode:t.customerCode||"",customerName:t.customerName||"",debit:0,credit:o,amount:o,status:"posted",source:"virtual_backfill_from_receipts"}}
function de(t={}){const o=String(t.type||"").toLowerCase(),r=f(t.debit||(o.includes("sale")?t.amount:0)),n=f(t.credit||(o.includes("sale")?0:t.amount));return{
id:t.id||String(t._id||""),code:t.code||"",date:e.toDateOnly(t.date||t.createdAt),type:t.type||"",account:t.account||"AR",refType:t.refType||"",refId:t.refId||t.id||"",
refCode:t.refCode||t.code||"",orderId:t.orderId||t.salesOrderId||"",orderCode:t.orderCode||t.salesOrderCode||"",customerId:t.customerId||"",customerCode:t.customerCode||"",
customerName:t.customerName||"",debit:r,credit:n,balanceEffect:r-n,status:t.status||"posted",source:t.source||"",note:t.note||t.voidReason||""}}function ue(t=[],o=[]){
const r=o.map(de),n=[];return t.forEach(t=>{const o=String(t.id||t._id||"").trim(),a=String(t.code||"").trim(),d=r.filter(e=>{
const t=[e.refId,e.refCode,e.code,e.id].map(e=>String(e||"").trim());return o&&t.includes(o)||a&&t.includes(a)
}),u=d.some(e=>String(e.type||"").toLowerCase().includes("receipt")&&!String(e.type||"").toLowerCase().includes("void")&&f(e.credit)>0),i=d.some(e=>String(e.type||"").toLowerCase().includes("void")&&f(e.debit)>0),s=R(t)
;"void"!==String(t.status||"").toLowerCase()||i?"void"!==String(t.status||"").toLowerCase()&&!u&&s>0&&n.push({level:"warning",code:t.code||t.id||"",
date:e.toDateOnly(t.date||t.createdAt),customerCode:t.customerCode||"",customerName:t.customerName||"",amount:s,
message:"Phiếu thu đang hiệu lực nhưng chưa thấy bút toán AR credit."}):n.push({level:"danger",code:t.code||t.id||"",date:e.toDateOnly(t.date||t.createdAt),
customerCode:t.customerCode||"",customerName:t.customerName||"",amount:s,message:"Phiếu thu đã Void nhưng chưa có bút toán đảo AR debit."})}),n}function ie(e=""){
return String(e||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function se(e,t=50,o=100){const r=Number(e);return!Number.isFinite(r)||r<=0?t:Math.min(Math.max(1,Math.floor(r)),o)}
function ce(e){const t=Number(e);return!Number.isFinite(t)||t<=0?1:Math.max(1,Math.floor(t))}function le(e,t){t&&(Array.isArray(e.$and)||(e.$and=[]),e.$and.push(t))}
function me(t={}){const o={account:/^AR$/i,accountingConfirmed:!0,accountingStatus:{$in:["confirmed","locked","posted","accounting_confirmed"]},status:{
$nin:["void","cancelled","canceled","deleted","duplicate_cancelled","reversed","voided"]},reversed:{$ne:!0},refType:{$ne:"AR_LEDGER_REVERSAL"},entryType:{$ne:"reversal"},type:{
$nin:["ar_reversal","reversal","ar_void","ar_sale_reversal","ar_return_reversal"]},ledgerType:{$nin:["AR-RETURN-REVERSAL","AR-SALE-REVERSAL","AR-RECEIPT-REVERSAL"]},category:{
$nin:["AR-RETURN-REVERSAL","AR-SALE-REVERSAL","AR-RECEIPT-REVERSAL"]}};if((t.dateFrom||t.dateTo||t.date)&&(o.date={},t.dateFrom&&(o.date.$gte=e.toDateOnly(t.dateFrom)),
t.dateTo&&(o.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(o.date=e.toDateOnly(t.date))),t.customerCode){const e=new RegExp(`^${ie(t.customerCode)}$`,"i");le(o,{$or:[{customerCode:e
},{customerId:e}]})}if(t.customerId){const e=new RegExp(`^${ie(t.customerId)}$`,"i");le(o,{$or:[{customerId:e},{customerCode:e}]})}return o}function fe(e={}){const t=[]
;if(e.delivery){const o=new RegExp(ie(e.delivery),"i");t.push({$or:[{deliveryStaffCode:o},{deliveryStaffName:o},{deliveryCode:o},{deliveryName:o},{nvghCode:o},{nvghName:o}]})}
if(e.salesman){const o=new RegExp(ie(e.salesman),"i");t.push({$or:[{salesmanCode:o},{salesmanName:o},{salesStaffCode:o},{salesStaffName:o},{nvbhCode:o},{nvbhName:o}]})}
return t.length?1===t.length?t[0]:{$and:t}:null}function ye(e){return String(e||"").trim()}function pe(e=""){const t=ye(e).toUpperCase();if(!t)return""
;const o=t.match(/^RO-([A-Z0-9]+)$/i)||t.match(/^AR-RETURN:RO-([A-Z0-9]+)$/i)||t.match(/(?:^|[-_:])RO-([A-Z0-9]+)(?=$|[-_:])/i);return o?o[1]:""}function ge(e=[]){const t=new Set
;for(const o of e||[]){const e=ye(o);if(!e)continue;t.add(e);const r=pe(e);r&&t.add(r),/^[A-Z0-9]+$/i.test(e)&&!/^RO-/i.test(e)&&(t.add(`RO-${e}`),t.add(`AR-RETURN:RO-${e}`),
t.add(`AR-RETURN-RO-${e}`))}return Array.from(t)}function Ce(){return{$let:{vars:{match:{$regexFind:{input:{$concat:[{$ifNull:["$idempotencyKey",""]}," ",{$ifNull:["$code",""]
}," ",{$ifNull:["$id",""]}," ",{$ifNull:["$sourceCode",""]}," ",{$ifNull:["$returnOrderCode",""]}," ",{$ifNull:["$sourceId",""]}," ",{$ifNull:["$returnOrderId",""]}]},
regex:/(?:^|[-_:])RO-([A-Z0-9]+)(?=$|[-_:])/i}}},in:{$arrayElemAt:[{$ifNull:["$$match.captures",[]]},0]}}}}function $e(){return{$ifNull:["$orderCode",{$ifNull:["$salesOrderCode",{
$ifNull:["$sourceOrderCode",{$ifNull:["$refCode",{$ifNull:["$orderId",{$ifNull:["$salesOrderId",{$ifNull:["$sourceOrderId",{$ifNull:["$refId",Ce()]}]}]}]}]}]}]}]}}
const Ae="id code date createdAt type category ledgerType source sourceType sourceId sourceCode returnOrderId returnOrderCode sourceOrderId sourceOrderCode refType refId refCode orderId orderCode salesOrderId salesOrderCode customerId customerCode customerName debit credit amount status accountingConfirmed accountingStatus entryType note voidReason salesStaffCode salesStaffName salesmanCode salesmanName nvbhCode nvbhName deliveryStaffCode deliveryStaffName deliveryCode deliveryName nvghCode nvghName"
;async function be(t={}){const o=me(t),r=fe(t);if(!r)return o;const n={...me({}),type:{$in:["ar_sale","ar_external_debt"]},...r};(t.dateFrom||t.dateTo||t.date)&&(n.date={},
t.dateFrom&&(n.date.$gte=e.toDateOnly(t.dateFrom)),t.dateTo&&(n.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(n.date=e.toDateOnly(t.date)))
;const a=await T("phạm vi nhân viên công nợ",t,()=>d.find(n).select("orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode sourceId sourceCode returnOrderId returnOrderCode refId refCode id code idempotencyKey").limit(5e3).lean()),u=Array.from(new Set(a.flatMap(e=>[e.orderId,e.salesOrderId,e.sourceOrderId,e.sourceId,e.returnOrderId,e.refId]).map(ye).filter(Boolean))),i=ge(a.flatMap(e=>[e.orderCode,e.salesOrderCode,e.sourceOrderCode,e.sourceCode,e.returnOrderCode,e.refCode,e.idempotencyKey,e.code,e.id]).map(ye).filter(Boolean))
;return u.length||i.length?(le(o,{$or:[...u.length?[{orderId:{$in:u}},{salesOrderId:{$in:u}},{sourceOrderId:{$in:u}},{sourceId:{$in:u}},{returnOrderId:{$in:u}},{refId:{$in:u}
}]:[],...i.length?[{orderCode:{$in:i}},{salesOrderCode:{$in:i}},{sourceOrderCode:{$in:i}},{sourceCode:{$in:i}},{returnOrderCode:{$in:i}},{idempotencyKey:{$in:i}},{code:{$in:i}},{
id:{$in:i}},{refCode:{$in:i}}]:[]]}),o):(le(o,{_id:"__NO_AR_SALE_MATCHING_STAFF_SCOPE__"}),o)}function he(e=[],t={}){const o=String(t.status||"").trim()
;return"1"===String(t.includePaid||"").trim()||"paid"===o?e:o&&"all"!==o&&"unpaid"!==o&&"open"!==o?"overdue"===o?e.filter(e=>"overdue"===e.status):e.filter(e=>e.status===o):e.filter(e=>A(e.debt)||b(e.debt))
}async function Se(e={}){const t=await S.debtReport(e);return{...t,source:t.source||"mongo_ar_ledgers_read_model_v2",debtSource:"AR_DEBT_READ_MODEL_V2",legacyRuntimeDebtCalc:!1}}
async function ve(e={}){return{source:"mongo_ar_ledger_fast",summary:{totalDebt:0,customerDebt:0,orderDebt:0,overdueDebt:0,
note:"Màn công nợ chỉ tải danh sách khi người dùng nhập khách/NVBH/NVGH để tránh quét toàn bộ AR Ledger."},filters:{maxListLimit:100,maxAutocompleteLimit:20}}}
async function Oe(e={}){return Se({...e,limit:se(e.limit,50,100)})}async function _e(e={}){const t=e.customerCode||e.code||e.customerId||e.id||e.q;return Se({...e,customerCode:t,
q:e.q||t,includePaid:e.includePaid||"1",limit:se(e.limit,100,100)})}async function Re(e={}){const t=ce(e.page),o=se(e.limit,100,200),r=(t-1)*o,n=await be(e)
;if(e.q||e.keyword||e.search){const t=new RegExp(ie(e.q||e.keyword||e.search),"i");le(n,{$or:[{code:t},{refCode:t},{orderCode:t},{salesOrderCode:t},{customerCode:t},{customerName:t
},{customerId:t},{type:t},{note:t}]})}const a=await T("sổ công nợ",e,()=>d.find(n).select(Ae).sort({date:-1,createdAt:-1
}).skip(r).limit(o+1).lean()),u=a.length>o,i=(u?a.slice(0,o):a).map(de);return{source:"mongo_ar_ledger_fast",ledgerCollection:"arLedgers",debts:[],customerSummary:[],bySalesman:[],
byDelivery:[],arLedger:i,arDiagnostics:[],summary:{page:t,limit:o,hasMore:u,arLedgerCount:i.length,totalDebit:N(i,e=>e.debit),totalCredit:N(i,e=>e.credit),
totalDebt:N(i,e=>e.balanceEffect),arWarningCount:0,optimized:!0}}}function Ne(e=[],t={}){const o=t.codeKey||"salesmanCode",r=t.nameKey||"salesmanName",n=t.role||"person",a=new Map
;return e.forEach(e=>{const t=String(e[o]||"").trim(),d=String(e[r]||"").trim(),u=t||d||"UNASSIGNED";a.has(u)||a.set(u,{role:n,code:t,name:d||(t?"":"Chưa gán"),
label:t&&d?`${t} - ${d}`:d||t||"Chưa gán",customerKeys:new Set,customers:0,orders:0,paidOrders:0,overdueOrders:0,openOrders:0,debit:0,credit:0,receiptAmount:0,returnAmount:0,
bonusAmount:0,debt:0,maxOverdueDays:0,maxAgingDays:0});const i=a.get(u),s=e.customerId||e.customerCode||e.customerName;s&&i.customerKeys.add(String(s)),i.orders+=1,
"paid"===e.status&&(i.paidOrders+=1),"overdue"===e.status&&(i.overdueOrders+=1),"open"===e.status&&(i.openOrders+=1),i.debit+=f(e.debit),i.credit+=f(e.credit),
i.receiptAmount+=f(e.receiptAmount),i.returnAmount+=f(e.returnAmount),i.bonusAmount+=f(e.bonusAmount),i.debt+=$(e.debt),
i.maxOverdueDays=Math.max(i.maxOverdueDays,f(e.overdueDays)),i.maxAgingDays=Math.max(i.maxAgingDays,f(e.agingDays))}),Array.from(a.values()).map(e=>{const{customerKeys:t,...o}=e
;return{...o,customers:t.size,collectionRate:o.debit>0?Math.round(o.credit/o.debit*1e4)/100:0,debt:Math.max(0,$(o.debt)),debtZeroTolerance:C,
status:A(o.debt)?o.overdueOrders>0?"overdue":"open":"paid"}}).sort((e,t)=>t.debt-e.debt||t.overdueOrders-e.overdueOrders||String(e.label).localeCompare(String(t.label)))}
async function Ie(e={}){const t=await Se(e);return{source:t.source,ledgerCollection:t.ledgerCollection,bySalesman:t.bySalesman,summary:t.summary}}async function De(e={}){
const t=await Se(e);return{source:t.source,ledgerCollection:t.ledgerCollection,byDelivery:t.byDelivery,summary:t.summary}}async function Te(t={}){
const{page:o,limit:n,skip:a}=E(t,50,200),d=k(x(t,["date","orderDate","documentDate","createdAt"]),t,["code","orderCode","customerCode","customerName","salesStaffCode","salesStaffName"]),u=Q(["totalAmount","amount","grandTotal","total","value"],0),i=Q(["paidAmount","paymentAmount"],0),s=L(["salesStaffCode","salesmanCode","nvbhCode"],""),c=L(["salesStaffName","salesmanName","nvbhName"],""),l=await T("bán hàng",t,()=>r.aggregate([{
$match:d},{$facet:{rows:[{$sort:{date:-1,orderDate:-1,createdAt:-1,_id:-1}},{$skip:a},{$limit:n}],totals:[{$group:{_id:null,orderCount:{$sum:1},totalAmount:{$sum:u},paidAmount:{
$sum:i},debtAmount:{$sum:0}}}],bySalesman:[{$group:{_id:{code:s,name:c},orderCount:{$sum:1},totalAmount:{$sum:u}}},{$sort:{totalAmount:-1,"_id.name":1}}]}
}]).allowDiskUse(!0).exec()),m=l?.[0]||{},y=m.rows||[],p=Array.from(new Set(y.map(e=>String(e.customerCode||"").trim()).filter(Boolean))),g=await h.getCustomerDebtMap(p,{
status:"all"}),C=y.map(t=>{const o=g.get(String(t.customerCode||"").trim())||h._internal.emptyCustomerDebt(t.customerCode||"");return{id:t.id||String(t._id||""),
code:t.code||t.orderCode||"",date:e.toDateOnly(t.date||t.orderDate||t.createdAt),customerCode:t.customerCode||"",customerName:t.customerName||"",
salesmanCode:t.salesStaffCode||t.salesmanCode||t.nvbhCode||"",salesmanName:t.salesStaffName||t.salesmanName||t.nvbhName||"",totalAmount:R(t),
paidAmount:f(t.paidAmount||t.paymentAmount),debtAmount:o.currentDebtAmount,currentDebtAmount:o.currentDebtAmount,debtSource:o.debtSource,status:t.status||""}
}),$=m.totals?.[0]||{},A=Array.from(g.values()).reduce((e,t)=>e+Number(t.currentDebtAmount||0),0);return{source:"mongo_aggregate",sales:C,items:C,meta:w(o,n,$.orderCount||0),
bySalesman:(m.bySalesman||[]).map(e=>({salesmanCode:e?._id?.code||"",salesmanName:e?._id?.name||"",orderCount:f(e.orderCount),totalAmount:f(e.totalAmount)})),summary:{
orderCount:f($.orderCount),totalAmount:f($.totalAmount),paidAmount:f($.paidAmount),debtAmount:A,debtSource:h.DEBT_SOURCE}}}async function Ee(e={}){
const{page:t,limit:o,skip:r}=E(e,50,200),n=x(e,["date","createdAt"]),d=x(e,["date","documentDate","createdAt"]),l=x(e,["date","documentDate","createdAt"]),m=x(e,["date","returnDate","documentDate","deliveryDate","createdAt"]),[y,p,g,C,$,A,b,h]=await T("tài chính",e,()=>Promise.all([a.find(d).sort({
date:-1,createdAt:-1}).skip(r).limit(o).lean(),i.find(l).sort({date:-1,createdAt:-1}).skip(r).limit(o).lean(),s.find(l).sort({date:-1,createdAt:-1
}).skip(r).limit(o).lean(),c.find(m).sort({date:-1,createdAt:-1}).skip(r).limit(o).lean(),a.aggregate([{$match:d},{$group:{_id:null,count:{$sum:1},amount:{
$sum:Q(["amount","totalAmount","grandTotal","total","value"],0)}}}]),c.aggregate([{$match:m},{$group:{_id:null,count:{$sum:1},amount:{
$sum:Q(["returnAmount","totalAmount","amount","debtReduction"],0)}}}]),u.aggregate([{$match:n},{$group:{_id:{fundType:"$fundType",direction:"$direction"},amount:{
$sum:Q(["amount"],0)},count:{$sum:1}}}]),Promise.all([a.countDocuments(d),i.countDocuments(l),s.countDocuments(l),c.countDocuments(m)])])),S=(e,t)=>{
const o=(b||[]).find(o=>String(o?._id?.fundType||"").toLowerCase()===e&&String(o?._id?.direction||"").toLowerCase()===t);return f(o?.amount)
},v=S("cash","in"),O=S("cash","out"),_=S("bank","in"),R=S("bank","out"),N=$?.[0]||{},I=A?.[0]||{},D={receipts:f(h?.[0]),cashbook:f(h?.[1]),bankbook:f(h?.[2]),returns:f(h?.[3])
},k=Math.max(...Object.values(D),0);return{source:"mongo_paged",fundSource:"fundLedgers",meta:{...w(t,o,k),categoryCounts:D},summary:{receiptCount:f(N.count),
totalReceipts:f(N.amount),cashIn:v,cashOut:O,cashBalance:v-O,bankIn:_,bankOut:R,bankBalance:_-R,totalFundIn:v+_,totalFundOut:O+R,totalFundBalance:v+_-O-R,returnCount:f(I.count),
totalReturns:f(I.amount)},receipts:y,cashbook:p,bankbook:g,returns:C}}async function we(t={}){
const{page:o,limit:r,skip:a}=E(t,50,200),d=k(x(t,["deliveryDate","date","createdAt"]),t,["code","masterOrderCode","deliveryStaffCode","deliveryStaffName","status"]),u=Q(["totalAmount","amount","grandTotal","total","value"],0),i=Q(["collectedAmount","paidAmount"],0),s={
$convert:{input:{$ifNull:["$orderCount",{$ifNull:["$childOrderCount",{$cond:[{$isArray:"$childOrderIds"},{$size:"$childOrderIds"},{$cond:[{$isArray:"$orderIds"},{$size:"$orderIds"
},0]}]}]}]},to:"double",onError:0,onNull:0}
},c=L(["deliveryStaffCode","deliveryCode","nvghCode"],""),l=L(["deliveryStaffName","deliveryName","nvghName"],""),m=await T("giao hàng",t,()=>n.aggregate([{$match:d},{$facet:{
rows:[{$sort:{deliveryDate:-1,createdAt:-1,_id:-1}},{$skip:a},{$limit:r}],totals:[{$group:{_id:null,tripCount:{$sum:1},orderCount:{$sum:s},totalAmount:{$sum:u},collectedAmount:{
$sum:i}}}],byStaff:[{$group:{_id:{code:c,name:l},tripCount:{$sum:1},orderCount:{$sum:s},totalAmount:{$sum:u},collectedAmount:{$sum:i}}},{$sort:{totalAmount:-1,"_id.name":1}}]}
}]).allowDiskUse(!0).exec()),y=m?.[0]||{},p=(y.rows||[]).map(t=>({id:t.id||String(t._id||""),code:t.code||t.masterOrderCode||"",
deliveryDate:e.toDateOnly(t.deliveryDate||t.date||t.createdAt),deliveryStaffCode:t.deliveryStaffCode||t.deliveryCode||t.nvghCode||"",
deliveryStaffName:t.deliveryStaffName||t.deliveryName||t.nvghName||"",
orderCount:f(t.orderCount||t.childOrderCount||(Array.isArray(t.childOrderIds)?t.childOrderIds.length:Array.isArray(t.orderIds)?t.orderIds.length:0)),totalAmount:R(t),
collectedAmount:f(t.collectedAmount||t.paidAmount),status:t.status||""})),g=y.totals?.[0]||{};return{source:"mongo_aggregate",delivery:p,items:p,meta:w(o,r,g.tripCount||0),
byStaff:(y.byStaff||[]).map(e=>({deliveryStaffCode:e?._id?.code||"",deliveryStaffName:e?._id?.name||"",tripCount:f(e.tripCount),orderCount:f(e.orderCount),
totalAmount:f(e.totalAmount),collectedAmount:f(e.collectedAmount)})),summary:{tripCount:f(g.tripCount),orderCount:f(g.orderCount),totalAmount:f(g.totalAmount),
collectedAmount:f(g.collectedAmount)}}}async function ke(e={}){
const t=Q(["totalAmount","amount","grandTotal","total","value"],0),o=Q(["paidAmount","paymentAmount"],0),a=x(e,["date","orderDate","documentDate","createdAt"]),d=x(e,["deliveryDate","date","createdAt"]),i=x(e,["date","createdAt"]),s=x(e,["date","documentDate","importDate","createdAt"]),[c,m,y,p,A,b]=await T("dashboard",e,()=>Promise.all([r.aggregate([{
$match:a},{$group:{_id:null,orderCount:{$sum:1},totalAmount:{$sum:t},paidAmount:{$sum:o}}}]),h.getDebtSummary({status:"all"}),g.getInventorySummary({}),u.aggregate([{$match:i},{
$group:{_id:{fundType:"$fundType",direction:"$direction"},amount:{$sum:Q(["amount"],0)}}}]),n.aggregate([{$match:d},{$group:{_id:null,tripCount:{$sum:1},totalAmount:{
$sum:Q(["totalAmount","amount"],0)},collectedAmount:{$sum:Q(["collectedAmount","paidAmount"],0)}}}]),l.aggregate([{$match:s},{$group:{_id:null,importCount:{$sum:1},
totalImportAmount:{$sum:Q(["totalAmount","amount"],0)}}
}])])),S=c?.[0]||{},v=m||{},O=A?.[0]||{},_=b?.[0]||{},R=(e,t)=>f((p||[]).find(o=>String(o?._id?.fundType||"").toLowerCase()===e&&String(o?._id?.direction||"").toLowerCase()===t)?.amount),N=R("cash","in"),I=R("cash","out"),D=R("bank","in"),E=R("bank","out"),w=$(f(v.totalDebt))
;return{source:"mongo_summary_only",dashboard:{sales:{orderCount:f(S.orderCount),totalAmount:f(S.totalAmount),paidAmount:f(S.paidAmount),debtAmount:w,debtSource:h.DEBT_SOURCE},
debts:{totalDebit:0,totalCredit:0,totalDebt:w,debtZeroTolerance:C},stock:y?.summary||{},finance:{cashIn:N,cashOut:I,cashBalance:N-I,bankIn:D,bankOut:E,bankBalance:D-E,
totalFundBalance:N+D-I-E},delivery:{tripCount:f(O.tripCount),totalAmount:f(O.totalAmount),collectedAmount:f(O.collectedAmount)},imports:{importCount:f(_.importCount),
totalImportAmount:f(_.totalImportAmount)}}}}module.exports={stockReport:P,stockCardReport:V,debtReport:Se,debtInit:ve,debtCustomers:Oe,debtCustomerDetail:_e,debtArLedger:Re,
debtBySalesmanReport:Ie,debtByDeliveryReport:De,dashboardReport:ke,salesReport:Te,financeReport:Ee,deliveryReport:we};
