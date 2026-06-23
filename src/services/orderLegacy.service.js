/* GENERATED FILE — edit src/services/orderLegacy.service.source/part-01.jsfrag, src/services/orderLegacy.service.source/part-02.jsfrag, src/services/orderLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("mongoose"),t=require("../utils/deliveryFinance.util"),r=require("../utils/date.util"),o=require("../repositories/orderRepository"),a=require("../repositories/masterOrderRepository"),n=require("../repositories/productRepository"),i=require("../repositories/customerRepository"),s=require("../repositories/userRepository"),d=require("../rules/staffRules"),{pickSalesStaffCode:c,pickSalesStaffName:u}=require("../domain/staff/staffIdentity"),{makeId:l,normalizeText:m,toNumber:f}=require("../utils/common.util"),S=require("../utils/queryGuard.util"),p=require("../utils/transaction.util"),{normalizeOrderSourceValue:g,applyOrderSourceFields:y}=require("../utils/orderSource.util"),v=require("../domain/posting/InventoryPostingService"),C=require("../engines/posting.engine"),A=require("./returnOrderService"),I=require("./promotionService"),O=require("../utils/orderStatus.util"),{DIRECT_PRICE:D,PROMOTION:N,normalizePricingMode:h}=require("../constants/pricingModes"),{debugLog:w}=require("../utils/debug.util"),{normalizePickingZone:P,pickingZoneFrom:M,legacyPrintGroupCode:R,PICKING_ZONES:$}=require("../utils/pickingZone.util")
;function B(t=[]){return!(!e.connection||1===e.connection.readyState)&&(t||[]).every(e=>void 0!==e.price||void 0!==e.salePrice||void 0!==e.unitPrice)}function q(e){
return r.toDateOnly(e)}function k(e,t=!0){return!1!==e&&"false"!==String(e).trim().toLowerCase()&&(!0===e||"true"===String(e).trim().toLowerCase()||!1!==t)}function b(e){
const t=String(e||"").trim();if(!t)return"";const r=t.split(/\s+-\s+|\|/)[0].trim(),o=r.match(/[A-Za-z0-9_.-]+/);return String(o?o[0]:r).trim()}function L(){return l("SO")}
function T(e,t=D){return h(e||t)}function _(e={}){return e.saleMethod??e.saleMode??e.pricingMode??e.orderPricingMode??e.priceMode}function E(e={}){const t=_(e)
;return null!=t&&""!==String(t).trim()}function U(e={}){const t=[e.source,e.orderSource,e.sourceType,e.importSource,e.orderSourceName].filter(Boolean).join(" ").toUpperCase()
;return!0===e.isImported||/(^|[^A-Z0-9])DMS([^A-Z0-9]|$)|DMS_IMPORT|EXCEL_DMS|IMPORT EXCEL DMS|IMPORT|EXCEL/.test(t)}function V(e=[]){
return(Array.isArray(e)?e:[]).find(e=>e&&"object"==typeof e)||{}}function x(e=[]){const t=V(e);return{
promotionId:String(t.promotionId||t.id||t._id||t.programId||t.ruleId||"").trim(),promotionCode:String(t.promotionCode||t.code||t.programCode||t.ruleCode||"").trim(),
promotionName:String(t.promotionName||t.name||t.programName||t.ruleName||t.description||"").trim()}}function H(e={}){return E(e)?T(_(e))===D:U(e)}function z(e=[],t=D,r={}){
const o=T(t),a=H({...r,saleMode:o});return(Array.isArray(e)?e:[]).map(e=>{
const t=a?D:T(e.saleMethod||e.saleMode||e.pricingMode,o),r=f(e.quantity??e.qty??e.totalQty),n=f(e.unitPrice??e.price??e.salePrice??e.finalPrice),i=f(e.amount||r*n),s=f(e.originalPrice||e.grossPrice||e.catalogSalePrice||n),d=Math.round(r*s),c=Math.max(0,f(e.discountAmount||e.totalDiscountAmount||e.promotionAmount||d-i)),u=s>0&&r>0?c/d*100:f(e.discountPercent||0),l=Array.isArray(e.promotionRows)?e.promotionRows:[],m=x(l)
;return{...e,productId:String(e.productId||e.id||e.productCode||e.code||"").trim(),productCode:String(e.productCode||e.code||e.sku||e.productId||"").trim(),
productName:String(e.productName||e.name||"").trim(),quantity:r,qty:r,originalPrice:s,grossPrice:s,catalogSalePrice:s,grossAmount:d,discountPercent:u,discountAmount:c,
promotionAmount:c,totalDiscountAmount:c,finalPrice:n,unitPrice:n,price:n,salePrice:n,amount:i,netAmount:i,saleMethod:t,saleMode:t,pricingMode:t,priceLocked:a||t===N,
lockedPrice:a||t===N,lockedPromotion:t===N,promotionRows:l,...m}}).filter(e=>e.quantity>0||e.productCode||e.productName)}async function F(e=[],t=D,r={}){const o=T(t);if(H({...r,
saleMode:o}))return z(e,D,{...r,saleMode:D});const a=z(e,N,{...r,saleMode:N});if(!a.length)return a;if(B(a))return a
;const n=await I.calculatePromotions(a),i=new Map((n.lines||[]).map(e=>[String(e.productCode||"").trim(),e]));return a.map(e=>{
const t=i.get(String(e.productCode||"").trim())||{},r=f(e.quantity),o=f(t.catalogSalePrice||e.grossPrice||e.salePrice||e.price),a=Math.round(r*o),n=f(t.directDiscountAmount||0),s=f(t.groupDiscountAmount||0),d=Math.min(a,n+s),c=Math.max(0,a-d),u=r>0?Math.round(c/r):0,l=a>0?d/a*100:0,m=Array.isArray(t.promotionRows)?t.promotionRows:[],S=x(m)
;return{...e,productName:e.productName||t.productName||"",originalPrice:o,grossPrice:o,catalogSalePrice:o,grossAmount:a,directDiscountPercent:f(t.directDiscountPercent||0),
groupDiscountPercent:f(t.groupDiscountPercent||0),discountPercent:l,directDiscountAmount:n,groupDiscountAmount:s,discountAmount:d,promotionAmount:d,totalDiscountAmount:d,
finalPrice:u,unitPrice:u,salePrice:u,price:u,amount:c,netAmount:c,saleMethod:N,saleMode:N,pricingMode:N,priceLocked:!0,lockedPrice:!0,lockedPromotion:!0,promotionCalculated:!0,
promotionRows:m,...S}})}async function Q(e={}){const t=String(e.customerId||e.customerCode||e.customerName||"").trim();return t?i.findByIdOrCode(t):null}async function Z(e={}){
const t=String(e.salesStaffCode||e.salesmanCode||"").trim();return t?d.resolveSalesStaffByCode(t):null}function K(e={},t=null,r=null,o=null){
return Boolean(o&&(o.salesStaffCode||o.salesStaffName||o.salesmanCode||o.salesmanName))?{salesStaffId:o.salesStaffId||"",salesStaffCode:c(o),salesStaffName:u(o)}:{
salesStaffId:r?.id||"",salesStaffCode:r?.code||c(e),salesStaffName:r?.name||u(e)}}async function j(e,t=D){
const r=[...new Set((Array.isArray(e)?e:[]).flatMap(e=>[e.productCode,e.code,e.sku,e.productId,e.barcode]).map(e=>String(e||"").trim()).filter(Boolean))],o=await n.findByCodes(r),a=new Map
;for(const e of o||[])[e.code,e.sku,e.productCode,e.barcode,e.id].map(e=>String(e||"").trim()).filter(Boolean).forEach(t=>a.set(t,e));return e.map(e=>{
const r=a.get(String(e.productCode||e.code||e.sku||e.productId||e.barcode||"").trim());if(!r)return e
;const o=T(e.saleMethod||e.saleMode||e.pricingMode,t),n=f(e.price||e.salePrice||r.salePrice||0),i=e.productCode||r.code||r.sku||r.productCode,s=e.productName||r.name,d=f(e.conversionRateAtOrder||e.conversionRate||r.conversionRate||1)||1,c=P(M(e,r),$.HC),u=R(c),l=f(e.catalogSalePriceAtOrder||e.catalogSalePrice||e.grossPrice||r.salePrice||n),m=f(e.finalPrice||e.priceAfterPromotion||n),S=f(e.quantity||e.qty||0),p=f(e.preTaxPriceAtOrder||e.listPriceBeforeVat||Math.round(l/1.08)),g=f(e.lineAmountAtOrder||e.lineAmount||e.amount||Math.round(S*m)),y=f(e.vatAmountAtOrder||e.vatAmount||e.taxAmount||Math.round((m-m/1.08)*S))
;return{...e,productId:e.productId||r.id||r.code,productCode:i,productName:s,price:n,salePrice:n,finalPrice:m,catalogSalePriceAtOrder:l,preTaxPriceAtOrder:p,vatAmountAtOrder:y,
lineAmountAtOrder:g,conversionRateAtOrder:d,pickingZoneAtOrder:c,warehouseCodeAtOrder:u,
appliedPromotionRows:Array.isArray(e.appliedPromotionRows)?e.appliedPromotionRows:Array.isArray(e.promotionRows)?e.promotionRows:[],productSnapshot:{...e.productSnapshot||{},
code:i,productCode:i,name:s,productName:s,salePrice:l,conversionRate:d,unit:e.unit||r.unit||r.baseUnit||"",pickingZone:c,warehouseCode:u,defaultWarehouse:u},amount:g,saleMethod:o,
saleMode:o,pricingMode:o,priceLocked:Boolean(e.priceLocked)||o===N||o===D}})}function G(e={},t=""){const o=r.nowIso();return{...e,stockPosted:!0,stockPostedAt:e.stockPostedAt||o,
stockPostedBy:e.stockPostedBy||t||e.createdBy||e.userName||"system"}}function W(e={}){const t=String(e.stockStatus||e.inventoryStatus||"").toLowerCase()
;return Boolean(e.stockPosted)||["posted","confirmed","locked"].includes(t)}function X(e={}){const t=["confirmed","locked","posted"]
;return Boolean(e.arPosted||e.accountingConfirmed)||t.includes(String(e.accountingStatus||"").toLowerCase())||t.includes(String(e.arStatus||"").toLowerCase())}
async function Y(e,t={}){await v.postSaleOut(e,t)}async function J(e,t={}){await v.reverseMovement(e,{type:"SALE",reverseType:"SALE_REVERSAL",direction:"OUT",refType:"SALES_ORDER",
refId:e.id||e._id||e.code,refCode:e.code||e.id,date:r.todayVN(),note:"Đảo xuất kho đơn bán"},t)}async function ee(e,t={}){X(e)&&await C.reverseSalesOrderAR(e,t)}function te(e){
const t=g(e),o=O.lifecyclePatch(e,{source:t}),a=O.normalizeMergeStatus({...e,...o}),n=r.toDateOnly(e.orderDate||e.date||e.documentDate||e.importDate||e.displayDate||"");return{
...e,...o,id:e.id||e.code,code:e.code||e.id,date:n,orderDate:n,documentDate:r.toDateOnly(e.documentDate||n),items:Array.isArray(e.items)?e.items:[],totalAmount:f(e.totalAmount),
paidAmount:f(e.paidAmount),debtAmount:f(e.debtAmount),source:t,orderSource:t,orderSourceName:"DMS"===t?"Từ DMS":"Từ NVBH",mergeStatus:a,isMerged:"merged"===a,
vatInvoiceRequired:!1!==e.vatInvoiceRequired,vatInvoiceDecisionSource:e.vatInvoiceDecisionSource||"default",vatInvoiceNote:String(e.vatInvoiceNote||""),
vatInvoiceUpdatedAt:String(e.vatInvoiceUpdatedAt||""),vatInvoiceUpdatedBy:String(e.vatInvoiceUpdatedBy||""),
salesStaffCode:e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH||"",
salesStaffName:e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName||"",visibleInHistory:O.isOrderVisibleInHistory({...e,...o})}}async function re(e){
const t=await o.findByIdOrCode(e);return t?{salesOrder:te(t)}:{error:"Không tìm thấy đơn bán",status:404}}function oe(e={}){const t=String(e.status||"").toLowerCase()
;return["cancelled","canceled","void","deleted","removed"].includes(t)||Boolean(e.deletedAt)}function ae(e={}){
const t=String(e.status||"").toLowerCase(),r=String(e.deliveryStatus||"").toLowerCase(),o=String(e.accountingStatus||e.arStatus||"").toLowerCase()
;return Boolean(e.accountingConfirmed)||["confirmed","locked","posted"].includes(o)||["delivered","success","completed","done"].includes(r)||["delivered","completed","done"].includes(t)
}function ne(e={}){return Boolean(e.masterOrderId||e.masterOrderCode||e.masterOrderNo)||"merged"===String(e.mergeStatus||"").toLowerCase()}function ie(e={}){return!ne(e)&&!ae(e)}
const se=["cancelled","canceled","void","deleted","removed"],de=[!0,"true",1,"1","yes","YES","y","Y"];function ce(e={}){return e.status={$nin:se},e.lifecycleStatus={$nin:se},
e.deliveryStatus={$nin:se},e.deleted={$nin:de},e.isDeleted={$nin:de},e.deletedAt={$in:[null,""]},e}function ue(e,t){t&&Object.keys(t).length&&e.push(t)}function le(e,t){const r={}
;return e&&(r.$gte=e),t&&(r.$lte=t),r}const me=["salesStaffCode","salesPersonCode","salesmanCode","nvbhCode","maNVBH","salesStaff.code"];function fe(e){
return String(e||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function Se(e){const t=String(e??"").trim();if(!t)return""
;const r=t.split(/\s+-\s+|\|/)[0].trim(),o=r.match(/[A-Za-z0-9_.-]+/);return String(o?o[0]:r).trim()}function pe(e={},t=""){
return String(t||"").split(".").reduce((e,t)=>e&&void 0!==e[t]?e[t]:void 0,e)}function ge(e,t){const r=Se(t);if(!r)return[];const o=[r],a=Number(r)
;return Number.isFinite(a)&&o.push(a),[{[e]:{$in:o}},{[e]:{$regex:`^\\s*${fe(r)}\\s*$`,$options:"i"}}]}function ye(e,t={}){const r=Se(e);return r?t.includeAliases?{
$or:me.flatMap(e=>ge(e,r))}:{salesStaffCode:r}:null}function ve(e={}){return me.map(t=>pe(e,t)).map(Se).filter(Boolean)}function Ce(e={},t=""){const r=Se(t)
;return!r||ve(e).some(e=>e===r)}function Ae(e={}){return e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH||pe(e,"salesStaff.code")||""}function Ie(e={}){
return e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName||pe(e,"salesStaff.name")||pe(e,"salesStaff.fullName")||""}function Oe(e={}){
const t=S.normalizeQueryDateRange(e,{defaultToday:!0
}),o=String(t.q||t.keyword||t.search||"").trim(),a=r.toDateOnly(t.dateFrom||t.fromDate||t.from),n=r.toDateOnly(t.dateTo||t.toDate||t.to),i=String(t.dateType||t.filterDateType||"orderDate").trim(),s="1"===String(t.includeCancelled||"0")||"cancelled"===String(t.status||"").toLowerCase(),d={},c=[]
;if(a||n){const e=le(a,n);"deliveryDate"===i?d.deliveryDate=e:"all"===i?ue(c,{$or:[{orderDate:e},{date:e},{createdDate:e},{deliveryDate:e},{createdAt:e}]
}):"date"===i?d.date=e:d.orderDate=e}s||ce(d);const u=String(t.customerCode||t.maKhachHang||t.maKH||"").trim();u&&(d.customerCode=u)
;const l=String(t.masterOrderCode||t.masterCode||"").trim();l&&(d.masterOrderCode=l);const m=Se(t.salesStaffCode||t.salesmanCode||t.nvbhCode||t.maNVBH);if(m)ue(c,ye(m,{
includeAliases:["1","true","yes"].includes(String(t.includeStaffAliases||"").trim().toLowerCase())}));else{
const e=String(t.salesStaffText||t.salesStaffName||t.salesmanName||"").trim();if(e){const t=S.buildRegex(e);ue(c,{$or:[{salesStaffCode:t},{salesStaffName:t},{salesPersonCode:t},{
salesPersonName:t},{salesmanCode:t},{salesmanName:t},{nvbhCode:t},{nvbhName:t},{maNVBH:t},{maNVBHName:t},{"salesStaff.code":t},{"salesStaff.name":t},{"salesStaff.fullName":t}]})}}
const f=Se(t.deliveryStaffCode||t.nvghCode||t.deliveryCode);f&&ue(c,{$or:[{deliveryStaffCode:f},{deliveryCode:f},{"deliveryStaff.code":f}]})
;const p=String(t.source||t.orderSource||"").trim(),g=O.normalizeOrderSource(p);if(g&&"manual"!==g){
const e=Array.from(new Set([g,g.toUpperCase(),g.toLowerCase(),p,p.toUpperCase(),p.toLowerCase()].filter(Boolean)));ue(c,{$or:[{source:{$in:e}},{orderSource:{$in:e}}]})}
const y=String(t.deliveryStatus||"").trim();y&&(d.deliveryStatus=y);const v=String(t.accountingStatus||"").trim();v&&(d.accountingStatus=v)
;const C=String(t.status||t.lifecycleStatus||"").trim();if(C&&"cancelled"!==C&&(d.status=C),o){const e=S.buildRegex(o);ue(c,{$or:/^[A-Z0-9_-]{5,}$/i.test(o)?[{code:o},{id:o},{
orderCode:o},{salesOrderCode:o},{invoiceCode:o},{documentCode:o},{customerCode:e},{customerName:e},{customerId:e},{note:e},{remark:e},{description:e}]:[{customerCode:e},{
customerName:e},{customerId:e},{customerPhone:e},{masterOrderCode:e},{note:e},{remark:e},{description:e}]})}return c.length&&(d.$and=c),{filter:d,guardedQuery:t,
strictSalesStaffCode:m}}function De(e={}){const t=g(e),o=O.normalizeMergeStatus(e);return{id:e.id||e.code,code:e.code||e.orderCode||e.salesOrderCode||e.id,
orderCode:e.orderCode||e.code||e.id,salesOrderCode:e.salesOrderCode||e.code||e.id,date:r.toDateOnly(e.orderDate||e.date||e.documentDate||e.importDate||e.displayDate||""),
orderDate:r.toDateOnly(e.orderDate||e.date||e.documentDate||e.importDate||e.displayDate||""),documentDate:r.toDateOnly(e.documentDate||e.orderDate||e.date||""),
deliveryDate:r.toDateOnly(e.deliveryDate||""),createdAt:e.createdAt,updatedAt:e.updatedAt,deleted:Boolean(e.deleted),isDeleted:Boolean(e.isDeleted),deletedAt:e.deletedAt||"",
deleteMode:e.deleteMode||"",deleteReason:e.deleteReason||"",customerId:e.customerId||"",customerCode:e.customerCode||"",customerName:e.customerName||"",
customerPhone:e.customerPhone||"",staffCode:Ae(e),staffName:Ie(e),salesStaffCode:Ae(e),salesStaffName:Ie(e),deliveryStaffCode:e.deliveryStaffCode||"",
deliveryStaffName:e.deliveryStaffName||"",masterOrderId:e.masterOrderId||"",masterOrderCode:e.masterOrderCode||"",status:e.status||e.lifecycleStatus||"pending",
lifecycleStatus:e.lifecycleStatus||e.status||"pending",deliveryStatus:e.deliveryStatus||"",mergeStatus:o,isMerged:"merged"===o,accountingStatus:e.accountingStatus||"",
accountingConfirmed:Boolean(e.accountingConfirmed),vatInvoiceRequired:!1!==e.vatInvoiceRequired,vatInvoiceDecisionSource:e.vatInvoiceDecisionSource||"default",
vatInvoiceNote:String(e.vatInvoiceNote||""),vatInvoiceUpdatedAt:String(e.vatInvoiceUpdatedAt||""),vatInvoiceUpdatedBy:String(e.vatInvoiceUpdatedBy||""),source:t,orderSource:t,
orderSourceName:"DMS"===t?"Từ DMS":"Từ NVBH",totalAmount:f(e.totalAmount??e.amount??e.total),paidAmount:f(e.paidAmount),debtAmount:f(e.debtAmount),
visibleInHistory:O.isOrderVisibleInHistory(e)}}const Ne={_id:0,id:1,code:1,documentCode:1,invoiceCode:1,orderCode:1,salesOrderCode:1,date:1,orderDate:1,deliveryDate:1,createdAt:1,
updatedAt:1,deleted:1,isDeleted:1,deletedAt:1,deleteMode:1,deleteReason:1,customerId:1,customerCode:1,customerName:1,customerPhone:1,staffCode:1,staffName:1,salesStaffCode:1,
salesStaffName:1,salesPersonCode:1,salesPersonName:1,salesmanCode:1,salesmanName:1,nvbhCode:1,nvbhName:1,maNVBH:1,maNVBHName:1,"salesStaff.code":1,"salesStaff.name":1,
"salesStaff.fullName":1,deliveryStaffCode:1,deliveryStaffName:1,masterOrderId:1,masterOrderCode:1,status:1,lifecycleStatus:1,deliveryStatus:1,mergeStatus:1,accountingStatus:1,
accountingConfirmed:1,vatInvoiceRequired:1,vatInvoiceDecisionSource:1,vatInvoiceNote:1,vatInvoiceUpdatedAt:1,vatInvoiceUpdatedBy:1,source:1,orderSource:1,totalAmount:1,
paidAmount:1,debtAmount:1,amount:1,total:1};async function he(e={}){const t=Date.now(),{filter:r,guardedQuery:a,strictSalesStaffCode:n}=Oe(e),i=S.getPagination(a,{defaultLimit:50,
maxLimit:100}),s=("1"===String(a.includeCancelled||"0")||String(a.status||"").toLowerCase(),"deliveryDate"===a.dateType?{deliveryDate:-1,createdAt:-1,code:-1}:{orderDate:-1,
date:-1,createdAt:-1,code:-1}),d=Date.now(),c=o.findAll(r,{projection:Ne,sort:s,skip:i.skip,limit:i.limit}).then(e=>({orders:e,queryMs:Date.now()-d
})),u=Date.now(),l=o.count(r).then(e=>({total:e,countMs:Date.now()-u
})),[{orders:m,queryMs:f},{total:p,countMs:g}]=await Promise.all([c,l]),y=Date.now(),v=m.map(De),C=Date.now()-y,A=Date.now()-t
;return w("DEBUG_ORDER_FLOW","[SALES_ORDER_SEARCH_REBUILT]",{ms:A,queryMs:f,countMs:g,mapMs:C,page:i.page,limit:i.limit,total:p,returned:v.length,filter:r}),{rows:v,salesOrders:v,
orders:v,total:p,page:i.page,limit:i.limit,returned:v.length,hasMore:i.skip+v.length<p,ms:A,queryMs:f,countMs:g,mapMs:C}}function we(e={}){
return Array.isArray(e.$and)||(e.$and=[]),e.$and}function Pe(e="",t=""){if(!e||"manual"===e)return null
;const r=[...new Set([e,t,e.toUpperCase(),e.toLowerCase(),String(t||"").toUpperCase(),String(t||"").toLowerCase()].filter(Boolean))],o={dms:/dms/i,s3:/s3/i,
sales_app:/(mobile|app|nvbh|sales)/i},a=[{source:{$in:r}},{orderSource:{$in:r}}];return o[e]&&a.push({source:o[e]},{orderSource:o[e]}),{$or:a}}function Me(e=""){
const t=String(e||"").trim().toLowerCase();if(!t)return null;if("cancelled"===t)return{$or:[{status:{$in:se}},{lifecycleStatus:{$in:se}},{deliveryStatus:{$in:se}},{deleted:{$in:de}
},{isDeleted:{$in:de}},{deletedAt:{$nin:[null,""]}}]};if("delivered"===t){const e=["delivered","success","completed","done"];return{$or:[{status:{$in:e}},{lifecycleStatus:{$in:e}
},{deliveryStatus:{$in:e}}]}}return"assigned"===t?{$or:[{status:{$in:["assigned","assigned_delivery","waiting"]}},{lifecycleStatus:{$in:["assigned","assigned_delivery","waiting"]}
},{mergeStatus:{$in:["merged","mastered","grouped"]}},{masterOrderId:{$nin:[null,""]}},{masterOrderCode:{$nin:[null,""]}}]}:{$or:[{status:t},{lifecycleStatus:t}]}}
function Re(e=""){const t=String(e||"").trim().toLowerCase();return t?"merged"===t?{$or:[{mergeStatus:{$in:["merged","mastered","grouped"]}},{masterOrderId:{$nin:[null,""]}},{
masterOrderCode:{$nin:[null,""]}}]}:"unmerged"===t?{$and:[{mergeStatus:{$nin:["merged","mastered","grouped"]}},{masterOrderId:{$in:[null,""]}},{masterOrderCode:{$in:[null,""]}}]}:{
mergeStatus:t}:null}function $e(e=""){const t=String(e||"").trim().toLowerCase();return t?"delivered"===t?{deliveryStatus:{$in:["delivered","success","completed","done"]}
}:"failed"===t?{deliveryStatus:{$in:["failed","fail","not_delivered","undelivered"]}}:"cancelled"===t?{deliveryStatus:{$in:se}}:"pending"===t?{deliveryStatus:{
$nin:[...se,"delivered","success","completed","done","failed","fail","not_delivered","undelivered"]}}:{deliveryStatus:t}:null}function Be(e=""){
const t=String(e||"").trim().toLowerCase();return t?"confirmed"===t?{$or:[{accountingConfirmed:!0},{accountingStatus:{$in:["confirmed","locked","posted"]}},{arStatus:{
$in:["confirmed","locked","posted"]}}]}:"pending"===t?{$and:[{accountingConfirmed:{$ne:!0}},{accountingStatus:{$nin:["confirmed","locked","posted"]}},{arStatus:{
$nin:["confirmed","locked","posted"]}}]}:{accountingStatus:t}:null}async function qe(e={}){const t=S.normalizeQueryDateRange(e,{defaultToday:!0
}),a=Math.max(Number(t.__internalMaxLimit||0),0),n=S.getPagination(t,a?{maxLimit:a,defaultLimit:Math.min(a,500)
}:{}),i=String(t.q||t.keyword||t.search||"").trim(),s=r.toDateOnly(t.dateFrom||t.fromDate||t.from),d=r.toDateOnly(t.dateTo||t.toDate||t.to),c=String(t.dateType||t.filterDateType||"orderDate").trim(),u="1"===String(t.includeCancelled||"0")||"cancelled"===String(t.status||"").toLowerCase(),l=String(t.source||t.orderSource||"").trim(),m=O.normalizeOrderSource(l),f={}
;if(s||d){const e={};s&&(e.$gte=s),d&&(e.$lte=d);const t=[{orderDate:e},{date:e},{createdDate:e}],r=[{deliveryDate:e}];f.$or="deliveryDate"===c?r:"all"===c?[...t,...r,{createdAt:e
}]:t}if(u||ce(f),i){const e=S.buildRegex(i);we(f).push({$or:[{code:e},{id:e},{orderCode:e},{salesOrderCode:e},{customerCode:e},{customerName:e},{customerPhone:e},{salesStaffCode:e
},{salesStaffName:e},{deliveryStaffCode:e},{deliveryStaffName:e},{masterOrderCode:e},{masterOrderId:e}]})}
const p=b(t.salesStaffCode||t.salesmanCode||t.nvbhCode||t.maNVBH),g=String(t.salesStaffText||t.salesStaffName||t.salesmanName||"").trim();if(p)f.salesStaffCode=p;else if(g){
const e=S.buildRegex(g);we(f).push({$or:[{salesStaffCode:e},{salesStaffName:e}]})}const y=b(t.deliveryStaffCode||t.nvghCode||t.deliveryCode);y&&(f.deliveryStaffCode=y)
;const v=[Pe(m,l),Me(t.status||t.lifecycleStatus),Re(t.mergeStatus),$e(t.deliveryStatus),Be(t.accountingStatus)].filter(Boolean);return v.length&&we(f).push(...v),
(await o.findAll(f,{projection:Ne,sort:{createdAt:-1,code:-1},skip:n.skip,limit:n.limit})).map(te)}async function ke(e={},t={}){
const a=Date.now(),n=await Q(e),i=await Z(e),s=E(e)?T(_(e)):U(e)?D:N,d=await j(await F(e.items,s,e),s);if(!d.length)return{error:"Đơn bán chưa có sản phẩm",status:400}
;const c=f(e.totalAmount||d.reduce((e,t)=>e+f(t.amount),0)),u=f(e.paidAmount||e.paid||0),l=String(e.code||e.orderCode||e.salesOrderCode||e.documentCode||L()).trim(),m=String(e.id||l).trim(),S=r.toDateOnly(e.orderDate||e.date||r.todayVN()),g=r.toDateOnly(e.deliveryDate||S),v=K(e,n,i),C=String(t.role||"").trim().toLowerCase(),A=!["admin","accountant"].includes(C)||k(e.vatInvoiceRequired,!0),I=A?"default":"manual",h=String(t.username||t.name||t.fullName||t.code||e.updatedBy||e.userName||"").trim(),P={
...e,id:m,code:l,orderCode:String(e.orderCode||l).trim(),salesOrderCode:String(e.salesOrderCode||l).trim(),date:S,orderDate:S,documentDate:S,deliveryDate:g,
customerId:n?.id||e.customerId||e.customerCode||"",customerCode:n?.code||e.customerCode||"",customerName:n?.name||e.customerName||"",customerPhone:n?.phone||e.customerPhone||"",
customerAddress:n?.address||e.customerAddress||"",staffId:v.salesStaffId,staffCode:v.salesStaffCode,staffName:v.salesStaffName,salesStaffId:v.salesStaffId,
salesStaffCode:v.salesStaffCode,salesStaffName:v.salesStaffName,salesmanCode:e.salesmanCode||v.salesStaffCode,salesmanName:e.salesmanName||v.salesStaffName,saleMethod:s,saleMode:s,
pricingMode:s,orderPricingMode:s,isPromotionSale:s===N,priceLocked:s===D,promotionCalculated:s===N,items:d,totalAmount:c,paidAmount:u,debtAmount:f(e.debtAmount??Math.max(0,c-u)),
isChildOrder:!1!==e.isChildOrder,masterOrderId:e.masterOrderId||"",masterOrderCode:e.masterOrderCode||"",mergeStatus:e.mergeStatus||"unmerged",
deliveryStatus:e.deliveryStatus||"pending",status:e.status||"pending",lifecycleStatus:e.lifecycleStatus||e.status||"pending",accountingStatus:e.accountingStatus||"pending",
vatInvoiceRequired:A,vatInvoiceDecisionSource:I,vatInvoiceNote:A?"":String(e.vatInvoiceNote||e.noteVat||"").trim(),vatInvoiceUpdatedAt:"manual"===I?r.nowIso():"",
vatInvoiceUpdatedBy:"manual"===I?h||"system":"",arStatus:e.arStatus||"pending",arBalance:0,createdAt:e.createdAt||r.nowIso(),updatedAt:r.nowIso()}
;Object.assign(P,O.lifecyclePatch(P,{source:e.source||e.orderSource||"sales_app"})),Object.assign(P,y(P));const M=G(P,e.createdBy||e.userName||e.staffName||"create_order")
;return await p.withMongoTransaction(async e=>{await o.upsert({...M,hasReturn:Boolean(M.hasReturn),returnOrderId:M.returnOrderId||"",returnOrderCode:M.returnOrderCode||"",
returnAmount:f(M.returnAmount||0)},{session:e}),await Y(M,{session:e})}),w("DEBUG_ORDER_FLOW","[CREATE_ORDER_DONE]",{ms:Date.now()-a,code:M.code,itemCount:d.length,stockPosted:!0
}),{salesOrder:te(M)}}function be(e={}){return String(e.productCode||e.code||e.sku||e.productId||e.id||"").trim().toUpperCase()}function Le(e={}){
return f(e.stockQuantity??e.deliveredQuantity??e.quantity??e.qty??e.totalQty??0)}function Te(e={},t=""){return{...e,
productCode:t||e.productCode||e.code||e.sku||e.productId||e.id||"",productId:e.productId||e.id||t||e.productCode||e.code||"",productName:e.productName||e.name||""}}
function _e(e=[]){const t=new Map;for(const r of Array.isArray(e)?e:[]){const e=be(r);if(!e)continue;const o=t.get(e)||{qty:0,item:Te(r,e)};o.qty+=Le(r),o.item={...o.item,
...Te(r,e)},t.set(e,o)}return t}function Ee(e=[],t=[]){const r=_e(e),o=_e(t),a=new Set([...r.keys(),...o.keys()]),n=[],i=[];for(const e of a){const t=r.get(e)||{qty:0,item:{
productCode:e}},a=o.get(e)||{qty:0,item:t.item||{productCode:e}},s=f(a.qty)-f(t.qty);if(s>0)n.push({...Te(a.item,e),quantity:s,qty:s,stockQuantity:s});else if(s<0){
const r=Math.abs(s);i.push({...Te(t.item,e),quantity:r,qty:r,stockQuantity:r})}}return{outItems:n,inItems:i,hasDelta:n.length>0||i.length>0}}async function Ue(e,t={}){
const a=await o.findByIdOrCode(e);if(!a)return{error:"Không tìm thấy đơn bán",status:404};if(a.masterOrderId||"merged"===a.mergeStatus)return{
error:"Đơn đã gộp, không nên sửa trực tiếp đơn con",status:400}
;const n=E(t),i=!n&&(H(a)||H(t)),s=n?T(_(t)):i?D:T(a.saleMethod||a.saleMode||a.pricingMode||a.orderPricingMode||N),d=t.items?await j(await F(t.items,s,{...a,...t,saleMode:s
}),s):a.items,c=f(t.totalAmount??(d||[]).reduce((e,t)=>e+f(t.amount),0)),u=f(t.paidAmount??a.paidAmount??0),m=r.toDateOnly(t.orderDate||t.date||a.orderDate||a.date||r.todayVN()),S=r.toDateOnly(t.deliveryDate||a.deliveryDate||m),g=K(t,null,null,a),C=y({
...a,...t,date:m,orderDate:m,documentDate:m,deliveryDate:S,saleMethod:s,saleMode:s,pricingMode:s,orderPricingMode:s,isPromotionSale:s===N,priceLocked:i||s===D,
promotionCalculated:!i&&s===N,items:d,totalAmount:c,paidAmount:u,debtAmount:f(t.debtAmount??Math.max(0,c-u)),vatInvoiceRequired:!1!==a.vatInvoiceRequired,
vatInvoiceDecisionSource:a.vatInvoiceDecisionSource||"default",vatInvoiceNote:String(a.vatInvoiceNote||""),vatInvoiceUpdatedAt:String(a.vatInvoiceUpdatedAt||""),
vatInvoiceUpdatedBy:String(a.vatInvoiceUpdatedBy||""),salesStaffId:g.salesStaffId,salesStaffCode:g.salesStaffCode,salesStaffName:g.salesStaffName,
salesmanCode:a.salesmanCode||g.salesStaffCode,salesmanName:a.salesmanName||g.salesStaffName,staffId:g.salesStaffId,staffCode:g.salesStaffCode,staffName:g.salesStaffName,
...O.lifecyclePatch({...a,...t,items:d,totalAmount:c,paidAmount:u},a),updatedAt:r.nowIso()});let I=C;return await p.withMongoTransaction(async e=>{
const r=W(a),n=!0===t.postImmediately||r,i=n?G(C,t.updatedBy||t.userName||"update_order"):C;if(I=i,await o.upsert(i,{session:e}),await A.syncReturnDraftWithSalesOrder(i,{session:e
}),r&&n){const t=Ee(a.items,i.items);if(t.hasDelta){const r=l("SOEDIT");t.inItems.length&&await v.postSaleEditDelta(i,t.inItems,"IN",{session:e,commandId:`${r}:IN`}),
t.outItems.length&&await v.postSaleEditDelta(i,t.outItems,"OUT",{session:e,commandId:`${r}:OUT`})}}else!r&&n&&await Y(i,{session:e})}),{salesOrder:te(I)}}
async function Ve(e,t={},a={}){const n=await o.findByIdOrCode(e);if(!n)return{error:"Không tìm thấy đơn bán",status:404};if("boolean"!=typeof t.vatInvoiceRequired)return{
error:"Thiết lập hóa đơn VAT không hợp lệ",status:400};const i=r.nowIso(),s={vatInvoiceRequired:t.vatInvoiceRequired,vatInvoiceDecisionSource:"manual",
vatInvoiceNote:String(t.note||t.vatInvoiceNote||"").trim(),vatInvoiceUpdatedAt:i,vatInvoiceUpdatedBy:String(a.username||a.name||a.fullName||a.code||"system").trim(),updatedAt:i}
;return{salesOrder:te(await o.patchByIdentity(n.id||n.code||e,s)||{...n,...s})}}async function xe(e,t={}){const a=await o.findByIdOrCode(e);if(!a)return{
error:"Không tìm thấy đơn bán",status:404};const n=await A.cancelReturnDraftForSalesOrder(a,{dryRun:!0});if(n&&n.error)return n;const i=r.nowIso(),s=W(a),d={status:"cancelled",
deliveryStatus:"cancelled",cancelReason:String(t.reason||t.cancelReason||"").trim(),cancelledAt:i,updatedAt:i,...s?{stockPosted:!1,stockReversedAt:i}:{}};let c={...a,...d}
;return await p.withMongoTransaction(async t=>{s&&await J(a,{session:t}),await ee(a,{session:t}),await A.cancelReturnDraftForSalesOrder(a,{session:t})
;const r=await o.patchByIdentity(a.id||a.code||e,d,{session:t});r&&(c=r)}),(c.masterOrderId||c.masterOrderCode)&&await je(c.masterOrderId||c.masterOrderCode),{salesOrder:te(c)}}
async function He(e,t={}){const a=await o.findByIdOrCode(e);if(!a)return{error:"Không tìm thấy đơn bán",status:404};const n=await A.cancelReturnDraftForSalesOrder(a,{dryRun:!0})
;if(n&&n.error)return n;const i=W(a),s={...a,status:"void",deliveryStatus:"void",deleted:!0,isDeleted:!0,deletedAt:r.nowIso(),
deleteReason:String(t.reason||t.deleteReason||"").trim(),updatedAt:r.nowIso()};return await p.withMongoTransaction(async e=>{await o.upsert(s,{session:e}),
await A.cancelReturnDraftForSalesOrder(a,{session:e}),i&&await J(a,{session:e}),await ee(a,{session:e})}),
(s.masterOrderId||s.masterOrderCode)&&await je(s.masterOrderId||s.masterOrderCode),{hardDeleted:!1,salesOrder:te(s)}}function ze(e={}){
return[e.id,e.code,e.orderNo,e.orderCode,e._id].map(e=>String(e||"").trim()).filter(Boolean)}function Fe(e={}){const t=String(e.status||"").toLowerCase()
;return["cancelled","canceled","void","deleted","removed"].includes(t)||Boolean(e.deletedAt)}function Qe(e={}){
return new Set((Array.isArray(e.childOrderIds)?e.childOrderIds:[]).map(e=>String(e?.id||e?.code||e?._id||e||"").trim()).filter(Boolean))}async function Ze(e={}){const t=Qe(e)
;if(!t.size)return[];const r=await o.findManyByIdentity(Array.from(t)),a=new Map;for(const e of r){if(Fe(e))continue;const r=ze(e).some(e=>t.has(e));if(!r)continue
;const o=String(e.id||e.code||e._id||"").trim();o&&a.set(o,e)}return Array.from(a.values())}function Ke(e=[]){
const r=e.filter(e=>!Fe(e)),o=r.length,a=r.reduce((e,t)=>e+(Array.isArray(t.items)?t.items:[]).reduce((e,t)=>e+f(t.quantity??t.qty??t.totalQuantity??0),0),0),n=r.reduce((e,t)=>e+f(t.totalAmount),0),i=r.reduce((e,t)=>e+f(t.paidAmount),0),s=r.reduce((e,r)=>e+t.calculateDeliveryDebt(r),0)
;return{orderCount:o,totalOrders:o,totalQuantity:a,totalAmount:n,paidAmount:i,debtAmount:s,totalDebt:s}}async function je(e,t={}){const o=await a.findByIdOrCode(e)
;if(!o)return null;const n=await Ze(o),i=n.map(e=>e.id||e.code).filter(Boolean),s={...o,childOrderIds:i,children:[],...Ke(n),updatedAt:r.nowIso()};return await a.upsert(s,t),s}
module.exports={listOrders:qe,searchOrders:he,getOrder:re,createOrder:ke,updateOrder:Ue,updateVatInvoiceSetting:Ve,cancelOrder:xe,deleteOrder:He,getMasterChildren:Ze,
summarizeOrders:Ke,syncMasterOrderSummary:je,applySalesOrderPosting:Y,reverseSalesOrderPosting:J,toClient:te};
