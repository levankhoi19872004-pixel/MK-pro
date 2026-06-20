/* GENERATED FILE — edit src/services/mobile/sales.service.source/part-01.jsfrag, src/services/mobile/sales.service.source/part-01b.jsfrag, src/services/mobile/sales.service.source/part-02.jsfrag, src/services/mobile/sales.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const{canonicalizeOperationalStaff:e}=require("../../utils/canonicalStaffWrite.util"),t=require("../../utils/date.util"),{withMongoTransaction:o}=require("../../utils/transaction.util"),{createMobileSalesRepository:n}=require("../../repositories/mobile/sales.repository"),r=require("../../models/SalesOrder"),a=require("../../models/Customer"),s=require("../../models/Product"),i=require("../../models/ReturnOrder"),d=require("../../models/MobileLog"),c=require("../../domain/posting/InventoryPostingService"),u=require("../../domain/lifecycle/SalesOrderDeletionService"),l=require("../inventoryStock.service"),m=require("../internalSaleAllocation.service"),{createStepTimer:p,getIdempotencyKey:g,readIdempotentResult:f,rememberIdempotentResult:h}=require("../../utils/mobilePerformance.util"),y=require("../promotionService"),C=require("../DebtReadService"),{PROMOTION:S}=require("../../constants/pricingModes"),A=require("../../utils/orderStatus.util"),{normalizeText:b,toNumber:N}=require("../../utils/common.util"),{buildPersistentKey:v,findRequest:O,beginRequest:I,completeRequest:P}=require("../requestIdempotency.service"),{buildInventoryEditMovements:$,normalizeProductCode:w}=require("../../utils/orderItemDelta.util"),{customerOwnershipFilterForSalesUser:_,combineFilters:q}=require("../../domain/staff/customerOwnership"),{parseMobilePagination:k,buildPagination:M}=require("./mobilePagination.util")
;function D(e={}){return l.quantityOf(e)}function R(e={}){return String(e.code||e.productCode||e.sku||"").trim()}function T(e=[]){
return Array.from(new Set((Array.isArray(e)?e:[e]).map(e=>String(e||"").trim()).filter(Boolean)))}function Q(e=""){const t=String(e||"").trim()
;return t?T([t,t.toUpperCase(),t.toLowerCase()]):[]}function E(e){const t=T([e]);return t.length?{$or:[{id:{$in:t}},{code:{$in:t}},{orderCode:{$in:t}},{salesOrderCode:{$in:t}},{
documentCode:{$in:t}},{invoiceCode:{$in:t}}]}:null}function U(e={}){return String(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.maNVBH||e.staffCode||e.code||"").trim()}
function B(e={}){return String(e.salesStaffName||e.salesmanName||e.nvbhName||e.maNVBHName||e.fullName||e.name||"").trim()}function L(e={}){const t=Q(U(e));if(t.length)return{$or:[{
salesStaffCode:{$in:t}},{salesPersonCode:{$in:t}},{salesmanCode:{$in:t}},{nvbhCode:{$in:t}},{maNVBH:{$in:t}},{"salesStaff.code":{$in:t}}]};const o=Q(B(e));return o.length?{$or:[{
salesStaffName:{$in:o}},{salesPersonName:{$in:o}},{salesmanName:{$in:o}},{nvbhName:{$in:o}},{maNVBHName:{$in:o}},{"salesStaff.name":{$in:o}},{"salesStaff.fullName":{$in:o}}]}:null}
const x=["cancelled","canceled","void","deleted","removed"],K=[!0,"true",1,"1","yes","YES","y","Y"];function V(){return{$and:[{status:{$nin:x}},{lifecycleStatus:{$nin:x}},{
deliveryStatus:{$nin:x}},{deleted:{$nin:K}},{isDeleted:{$nin:K}},{deletedAt:{$in:[null,""]}}]}}function H(e={}){const t=e.customer||{}
;return T([t.id,t._id,t.customerId,t.code,t.customerCode,e.customerId,e.customerCode])}async function z(e={},t={},o=null){const n=T(H(e).flatMap(Q));if(!n.length)return null
;const r={isActive:{$ne:!1},$or:[{id:{$in:n}},{code:{$in:n}},{customerCode:{$in:n}},{phone:{$in:n}}]},s=_(t)
;let i=a.findOne(q(r,s)).select("id code customerCode name customerName phone address area route isActive salesStaffCode salesStaffName salesmanCode salesmanName assignedSalesStaffCode assignedSalesStaffName nvbhCode nvbhName maNVBH tenNVBH staffCode staffName")
;return o&&"function"==typeof i.session&&(i=i.session(o)),i.lean()}function F(e={}){return String(e.productCode||e.code||e.sku||e.productId||"").trim()}function j(e=[]){
const t=new Map;for(const o of e||[])for(const e of T([o.id,o._id,o.code,o.productCode,o.sku,o.barcode]))t.set(e,o),t.set(e.toUpperCase(),o),t.set(e.toLowerCase(),o);return t}
async function Z(e=[]){const t=T((e||[]).map(F).flatMap(Q));return t.length?s.find({isActive:{$ne:!1},$or:[{id:{$in:t}},{code:{$in:t}},{productCode:{$in:t}},{sku:{$in:t}},{
barcode:{$in:t}}]
}).select("id code productCode sku barcode name productName unit baseUnit conversionRate packing brand category groupName productGroup salePrice price isActive").lean():[]}
function Y(e={}){const t=T([e.id,e._id,e.salesOrderId,e.orderId]),o=T([e.code,e.orderCode,e.salesOrderCode]),n=[];return t.length&&n.push({salesOrderId:{$in:t}},{orderId:{$in:t}},{
sourceOrderId:{$in:t}},{deliveryOrderId:{$in:t}}),o.length&&n.push({salesOrderCode:{$in:o}},{orderCode:{$in:o}},{sourceOrderCode:{$in:o}},{deliveryOrderCode:{$in:o}}),n.length?{
status:{$nin:["cancelled","canceled","void","deleted"]},$or:n}:null}function G(e={}){
return(Array.isArray(e.items)?e.items:[]).some(e=>N(e.returnQty??e.qtyReturn??e.returnQuantity??e.quantity??e.qty)>0)||N(e.totalReturnAmount??e.totalAmount??e.amount??e.debtReduction)>0
}function W(e={}){const t=String(e.status||e.returnStatus||"").toLowerCase(),o=String(e.returnMergeStatus||"").toLowerCase(),n=String(e.warehouseReceiveStatus||"").toLowerCase()
;return Boolean(e.masterReturnOrderId||e.masterReturnOrderCode)||"merged"===o||["received","posted","completed"].includes(t)||["received","posted","completed"].includes(n)}
function X(e={}){
const o=String(e.status||"").trim().toLowerCase(),n=String(e.lifecycleStatus||"").trim().toLowerCase(),r=String(e.deliveryStatus||"").trim().toLowerCase(),a=String(e.accountingStatus||e.arStatus||"").trim().toLowerCase(),s=String(e.mergeStatus||"unmerged").trim().toLowerCase()
;if(x.includes(o)||x.includes(n)||x.includes(r)||K.includes(e.deleted)||K.includes(e.isDeleted)||e.deletedAt)return"Đơn đã hủy hoặc đã xóa, không thể chỉnh sửa"
;if(e.masterOrderId||e.masterOrderCode||e.masterOrderNo||"merged"===s)return"Đơn đã gộp đơn tổng, app bán hàng không được sửa"
;if(!0===e.accountingConfirmed||["confirmed","posted","locked","accounting_confirmed"].includes(a))return"Đơn đã xác nhận kế toán, không thể chỉnh sửa trên app bán hàng"
;if(["delivered","completed","accounting_confirmed"].includes(r)||["delivered","completed","accounting_confirmed"].includes(n))return"Đơn đã giao hoặc đã hoàn tất, không thể chỉnh sửa trên app bán hàng"
;const i=t.toDateOnly(e.date||e.orderDate||"");return i&&i!==t.todayVN()?"App bán hàng chỉ cho chỉnh sửa đơn trong ngày hiện tại":""}function J(e={}){return!X(e)}function ee(e=[]){
const t=new Map;for(const o of Array.isArray(e)?e:[]){const e=w(o.productCode||o.code||o.sku||o.productId)
;e&&("INTERNAL_APP_QUOTA"!==String(o.saleAllocationType||"").toUpperCase()&&!String(o.internalSaleAllocationId||"").trim()&&N(o.allocationConsumedQty??o.quotaConsumedQty)<=0||t.set(e,o))
}return t}function te(e=[],t=[],o=new Map,n=new Map){const r=ee(t),a=new Map(Array.from(n.entries()).map(([e,t])=>[e,Math.max(0,N(t))]));return(Array.isArray(e)?e:[]).map(e=>{
const t=w(e.productCode||e.code||e.sku||e.productId),n=o.get(t)||null,s=r.get(t)||{},i=Math.max(0,N(e.quantity??e.qty)),d=Math.max(0,N(a.get(t))),c=Math.min(i,d)
;a.set(t,Math.max(0,d-c));const u={...e};return delete u.saleAllocationType,delete u.internalSaleAllocationId,delete u.allocationSnapshotDate,delete u.allocationConsumedQty,
delete u.quotaConsumedQty,c<=0?u:{...u,saleAllocationType:"INTERNAL_APP_QUOTA",internalSaleAllocationId:String(n?.id||n?._id||s.internalSaleAllocationId||""),
allocationSnapshotDate:String(n?.snapshotDate||s.allocationSnapshotDate||""),allocationConsumedQty:c}})}function oe(e=[],t=[]){const o=ee(t),n=new Map
;for(const[e,t]of o.entries())n.set(e,Math.max(0,N(t.allocationConsumedQty??t.quotaConsumedQty??t.quantity??t.qty)));return(Array.isArray(e)?e:[]).map(e=>{
const t=w(e.productCode||e.code||e.sku||e.productId),r=o.get(t)||null,a=Math.max(0,N(e.quantity??e.qty)),s=Math.max(0,N(n.get(t))),i=Math.min(a,s);n.set(t,Math.max(0,s-i))
;const d={...e};return delete d.saleAllocationType,delete d.internalSaleAllocationId,delete d.allocationSnapshotDate,delete d.allocationConsumedQty,delete d.quotaConsumedQty,
!r||i<=0?d:{...d,saleAllocationType:"INTERNAL_APP_QUOTA",internalSaleAllocationId:String(r.internalSaleAllocationId||""),
allocationSnapshotDate:String(r.allocationSnapshotDate||""),allocationConsumedQty:i}})}function ne(e=[],t=new Map){
const o=(Array.isArray(e)?e:[]).filter(e=>"INTERNAL_APP_QUOTA"===String(e.saleAllocationType||"").toUpperCase()).map(e=>({...e,
quantity:e.allocationConsumedQty??e.quotaConsumedQty??e.quantity??e.qty})),n=m.aggregateItems(o);return Array.from(n.entries()).map(([o,n])=>{
const r=t.get(o)||{},a=(Array.isArray(e)?e:[]).find(e=>w(e.productCode||e.code||e.sku||e.productId)===o)||{};return{
allocationId:String(r.id||r._id||a.internalSaleAllocationId||""),productCode:o,snapshotDate:String(r.snapshotDate||a.allocationSnapshotDate||""),quantity:N(n)}})}
async function re(e=[]){const t=(e||[]).map(R).filter(Boolean),o=await l.getAvailableStocks(t),n=new Map;for(const t of e||[]){const e=R(t)
;e&&n.set(e,Number(o[l.normalizeProductCode(e)]||o[e]||0))}return n}async function ae(e={}){const t=await l.getAvailableStock(R(e));return Number(t.availableQty||0)}
function se(e,t){return{statusCode:e,body:{ok:!1,success:!1,message:t}}}function ie(e=[]){return(Array.isArray(e)?e:[]).find(e=>e&&"object"==typeof e)||{}}function de(e=[]){
const t=ie(e);return{promotionId:String(t.promotionId||t.id||t._id||t.programId||t.ruleId||"").trim(),
promotionCode:String(t.promotionCode||t.code||t.programCode||t.ruleCode||"").trim(),
promotionName:String(t.promotionName||t.name||t.programName||t.ruleName||t.description||"").trim()}}function ce(a){n(a)
;const{normalizeText:s,toNumber:b,formatCaseLooseQty:N,buildProductLineMeta:_,makeId:q,buildSalesCode:D,buildCashCode:R,updateSalesOrderWithRepost:T,writeMobileLog:Q}=a
;function x(e={}){return U(e)}function K(e={}){return B(e)}async function ee(e=[]){const t=Array.isArray(e)?e:[];if(!t.length)return{error:"Đơn mobile chưa có sản phẩm",status:400}
;const o=await Z(t),n=j(o),r=[],a=new Map;for(const e of t){const t=F(e),o=n.get(t)||n.get(String(t).toUpperCase())||n.get(String(t).toLowerCase());if(!o)return{
error:`Không tìm thấy sản phẩm: ${e.productCode||e.code||""}`,status:400};const s=b(e.quantity??e.qty??0);if(s<=0)return{
error:`Số lượng phải lớn hơn 0: ${o.code||o.productCode||""}`,status:400};const i=b(o.salePrice??o.price??0),d=String(o.code||o.productCode||o.sku||"").trim();r.push({
productId:o.id||String(o._id||d||""),productCode:d,productName:o.name||o.productName||"",..._(o),quantity:s,grossPrice:i,catalogSalePrice:i,salePrice:i,price:i,
amount:Math.round(s*i)}),a.set(d,o)}const s=await y.calculatePromotions(r),i=new Map((s.lines||[]).map(e=>[String(e.productCode||"").trim(),e]));return{items:r.map(e=>{
const t=i.get(String(e.productCode||"").trim())||{},o=b(t.catalogSalePrice??e.grossPrice??e.salePrice),n=Math.round(e.quantity*o),r=b(t.directDiscountAmount||0),a=b(t.groupDiscountAmount||0),s=Math.min(n,r+a),d=Math.max(0,n-s),c=e.quantity>0?Math.round(d/e.quantity):0,u=Array.isArray(t.promotionRows)?t.promotionRows:[],l=de(u)
;return{...e,originalPrice:o,grossPrice:o,catalogSalePrice:o,grossAmount:n,directDiscountPercent:b(t.directDiscountPercent||0),groupDiscountPercent:b(t.groupDiscountPercent||0),
discountPercent:n>0?s/n*100:0,directDiscountAmount:r,groupDiscountAmount:a,discountAmount:s,promotionAmount:s,totalDiscountAmount:s,finalPrice:c,unitPrice:c,salePrice:c,price:c,
preTaxPriceAtOrder:Math.round(o/1.08),vatAmountAtOrder:Math.round((c-c/1.08)*e.quantity),lineAmountAtOrder:d,amount:d,netAmount:d,saleMethod:S,saleMode:S,pricingMode:S,
priceLocked:!0,lockedPrice:!0,lockedPromotion:!0,promotionCalculated:!0,promotionRows:u,appliedPromotionRows:u,productSnapshot:{...e.productSnapshot||{},salePrice:o,
conversionRate:e.conversionRateAtOrder||e.conversionRate||1,
pickingZone:e.pickingZoneAtOrder||e.productSnapshot?.pickingZone||("KHO_PC"===(e.warehouseCodeAtOrder||e.warehouseCode)?"PC":"HC"),
warehouseCode:e.warehouseCodeAtOrder||e.warehouseCode||"KHO_HC",defaultWarehouse:e.warehouseCodeAtOrder||e.warehouseCode||"KHO_HC"},...l}}),products:o,productByCode:a}}
function ae(e={}){return[String(e.productCode||e.code||e.productId||"").trim(),String(e.unit||e.baseUnit||"").trim(),String(b(e.salePrice??e.price??e.unitPrice??0))].join("|")}
return{createSalesOrder:async function({body:n={},mobileUser:a}){
const s=H(n),i=g(n,["sales-create",a&&(a.id||a.code),n.customerCode||s[0]||"",Array.isArray(n.items)?n.items.length:0]),u=f(i);if(u)return u
;const y=a&&(a.staffCode||a.code||a.id||"mobile-sales"),C=v("mobile.sales.create",y,i),A=await O(C);if(A&&"completed"===A.status&&A.response)return h(i,A.response)
;if(A&&"processing"===A.status)return se(409,"Yêu cầu tạo đơn trùng đang được xử lý");const $=p("sales.createOrder");let w,_=null;try{w=await o(async o=>{$("start")
;const s=await z(n,a,o),u=Array.isArray(n.items)?n.items:[],p=b(n.paidAmount),g=t.todayVN();if(!s)return se(403,"Khách hàng không thuộc phạm vi nhân viên bán hàng")
;if(!u.length)return se(400,"Đơn mobile chưa có sản phẩm");$("load_customer_direct");const f=await ee(u);if(f.error)return se(f.status||400,f.error)
;const{items:h,productByCode:C}=f;$("prepare_items_server_authoritative",{products:C.size});const A=await re(Array.from(C.values()));$("batch_stock_check",{products:C.size})
;const v=new Map;for(const e of h){const t=String(e.productCode||"").trim();v.set(t,b(v.get(t))+b(e.quantity))}for(const[e,t]of v.entries()){const o=C.get(e),n=A.get(e)||0
;if(n<t)return se(400,`Không đủ tồn mở bán: ${e}. Tồn ${N(n,o?.conversionRate||1)}, cần ${N(t,o?.conversionRate||1)}`)}
const O=h.reduce((e,t)=>e+t.quantity,0),w=h.reduce((e,t)=>e+b(t.grossAmount),0),k=h.reduce((e,t)=>e+b(t.discountAmount),0),M=h.reduce((e,t)=>e+t.amount,0),D=Array.from(new Set(h.map(e=>e.promotionCode).filter(Boolean)))
;if(p>M)return se(400,"Tiền thu không được lớn hơn tổng đơn");const R=q("SO"),T={id:R,code:String(n.code||n.orderCode||R).trim(),date:g,customerId:s.id||String(s._id||s.code||""),
customerCode:s.code||s.customerCode||"",customerName:s.name||s.customerName||"",customerPhone:s.phone||"",customerAddress:s.address||"",salesStaffCode:x(a),salesStaffName:K(a),
salesmanCode:x(a),salesmanName:K(a),staffCode:"",staffName:"",source:"mobile_sales_app",orderSource:"NVBH",orderSourceName:"Từ NVBH",vatInvoiceRequired:!0,
vatInvoiceDecisionSource:"default",vatInvoiceNote:"",vatInvoiceUpdatedAt:"",vatInvoiceUpdatedBy:"",saleMethod:S,saleMode:S,pricingMode:S,orderPricingMode:S,isPromotionSale:!0,
promotionCalculated:!0,isChildOrder:!0,masterOrderId:"",mergeStatus:"unmerged",note:String(n.note||"Tạo từ mobile app").trim(),items:h,totalQuantity:O,grossAmount:w,
totalGrossAmount:w,grossAmountBeforePromotion:w,discountAmount:k,totalDiscountAmount:k,promotionAmount:k,totalPromotionAmount:k,netAmount:M,goodsAmountAfterPromotion:M,
promotionCodes:D,priceLocked:!0,lockedPrice:!0,lockedPromotion:!0,totalAmount:M,paidAmount:p,debtAmount:M-p,salesCollectionPendingAccounting:p>0,salesCollectionAmount:p,
salesCollectionMethod:String(n.paymentMethod||n.collectionMethod||"cash").trim().toLowerCase(),salesCollectionSource:p>0?"mobile_sales_pending_accounting":"",
salesCollectionStaffCode:x(a),salesCollectionStaffName:K(a),status:"pending",lifecycleStatus:"pending",orderDate:g,deliveryStatus:"pending",accountingStatus:"pending",
stockPosted:!0,stockPostedAt:(new Date).toISOString(),stockPostedBy:a.code||a.name||"mobile_sales",createdAt:(new Date).toISOString()},Q=await I({scope:"mobile.sales.create",
actorCode:y,requestKey:i},{session:o});if(Q.replay)return Q.response;$("idempotency_begin");const E=await m.consumeForOrder({orderId:R,orderCode:T.code,items:h,actorCode:x(a),
actorName:K(a)},{session:o});T.items=h.map(e=>{const t=E.get(l.normalizeProductCode(e.productCode));return t?{...e,saleAllocationType:"INTERNAL_APP_QUOTA",
internalSaleAllocationId:String(t.id||t._id||""),allocationSnapshotDate:String(t.snapshotDate||""),allocationConsumedQty:b(e.quantity)}:e}),T.usesInternalSaleQuota=E.size>0,
T.internalSaleAllocationRefs=Array.from(E.values()).map(e=>({allocationId:String(e.id||e._id||""),productCode:String(e.productCode||""),snapshotDate:String(e.snapshotDate||""),
quantity:b(h.filter(t=>l.normalizeProductCode(t.productCode)===l.normalizeProductCode(e.productCode)).reduce((e,t)=>e+b(t.quantity),0))})),$("consume_internal_sale_quota",{
products:E.size});const U=e(T),B=(await r.create([U],{session:o}))[0],L=B&&"function"==typeof B.toObject?B.toObject():B;$("create_sales_order_direct"),await c.postSaleOut(L,{
session:o}),$("post_inventory_sale_out"),await d.create([{id:q("ML"),action:"mobile_create_sales_order",actorCode:a.code||a.staffCode||"",actorName:a.fullName||a.name||"",
refType:"salesOrder",refId:U.id,refCode:U.code,note:`Tạo đơn ${U.code} từ mobile`,createdAt:(new Date).toISOString()}],{session:o}),$("save_operational_documents_direct"),_=L
;const V={statusCode:201,body:{ok:!0,source:"mobile-sales-route-direct",message:"Đã gửi đơn mobile về hệ thống tổng",salesOrder:L}};return await P(Q.key,V,{session:o}),
$("idempotency_complete"),V})}catch(e){if(e&&"INSUFFICIENT_STOCK"===e.code){const t=se(400,e.message||"Không đủ tồn kho");return h(i,t)}if(e&&"DMS_APP_QUOTA_EXCEEDED"===e.code){
const t=se(409,e.message||"Số lượng bán vượt hạn mức theo tồn DMS mới nhất");return t.body.productCode=e.productCode||"",t.body.availableQuota=b(e.availableQuota),
t.body.requiredQty=b(e.requiredQty),h(i,t)}throw e}const k=w||{statusCode:201,body:{ok:!0,salesOrder:_}};return $("done"),h(i,k)},
getSalesOrder:async function({params:e={},mobileUser:t}){const o=E(e.id),n=L(t);if(!o||!n)return se(404,"Không tìm thấy đơn bán");const a=await r.findOne({$and:[o,n]}).lean()
;if(!a)return se(404,"Không tìm thấy đơn bán");let s=X(a);if(!s){const e=Y(a);if(e){const t=await i.findOne(e).lean()
;t&&(G(t)||W(t))&&(s="Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng")}}return{body:{ok:!0,source:"mobile-sales-route-direct",order:{...a,canEdit:!s,
editLockReason:s}}}},updateSalesOrder:async function({params:e={},body:n={},mobileUser:a}){const s=g(n,["sales-update",a&&(a.id||a.code),e.id]),u=f(s);if(u)return u
;const l=String(a&&(a.staffCode||a.code||a.id||"mobile-sales")),y=K(a),C=v("mobile.sales.update",l,s),A=await O(C);if(A&&"completed"===A.status&&A.response)return h(s,A.response)
;if(A&&"processing"===A.status)return se(409,"Yêu cầu sửa đơn trùng đang được xử lý");const N=p("sales.updateOrder");N("start");const _=E(e.id),k=L(a)
;if(!_||!k)return h(s,se(404,"Không tìm thấy đơn bán"));const M=await r.findOne({$and:[_,k,V()]}).lean();if(!M)return h(s,se(404,"Không tìm thấy đơn bán"));const D=X(M)
;if(D)return h(s,se(409,D));const R=Y(M),T=R?await i.findOne(R).lean():null
;if(T&&(G(T)||W(T)))return h(s,se(409,"Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng"));const Q=Array.isArray(n.items)?n.items:null,U=H(n).length?n:{
customerId:M.customerId,customerCode:M.customerCode},B=await z(U,a);if(!B)return h(s,se(403,"Khách hàng không thuộc phạm vi nhân viên bán hàng"))
;const F=(new Date).toISOString(),j={customerId:B.id||String(B._id||B.code||M.customerId||""),customerCode:B.code||B.customerCode||M.customerCode||"",
customerName:B.name||B.customerName||M.customerName||"",customerPhone:B.phone||M.customerPhone||"",customerAddress:B.address||M.customerAddress||"",
note:String(n.note??M.note??"").trim(),salesStaffCode:x(a),salesStaffName:y,salesmanCode:x(a),salesmanName:y,vatInvoiceRequired:!1!==M.vatInvoiceRequired,
vatInvoiceDecisionSource:M.vatInvoiceDecisionSource||"default",vatInvoiceNote:String(M.vatInvoiceNote||""),vatInvoiceUpdatedAt:String(M.vatInvoiceUpdatedAt||""),
vatInvoiceUpdatedBy:String(M.vatInvoiceUpdatedBy||""),updatedAt:F};if(Q){const e=await ee(Q);if(e.error)return h(s,se(e.status||400,e.error))
;const t=e.items,o=t.find(e=>b(e.quantity)<=0||!w(e.productCode||e.code||e.sku||e.productId))
;if(o)return h(s,se(400,`Sản phẩm hoặc số lượng không hợp lệ: ${o.productCode||o.code||o.productName||""}`))
;const r=t.reduce((e,t)=>e+b(t.quantity),0),a=t.reduce((e,t)=>e+b(t.grossAmount),0),i=t.reduce((e,t)=>e+b(t.discountAmount),0),d=t.reduce((e,t)=>e+b(t.amount),0),c=b(n.paidAmount??M.paidAmount??0)
;if(c>d)return h(s,se(400,"Tiền thu không được lớn hơn tổng đơn"));Object.assign(j,{items:t,totalQuantity:r,grossAmount:a,totalGrossAmount:a,grossAmountBeforePromotion:a,
discountAmount:i,totalDiscountAmount:i,promotionAmount:i,totalPromotionAmount:i,netAmount:d,goodsAmountAfterPromotion:d,totalAmount:d,paidAmount:c,debtAmount:d-c,
promotionCodes:Array.from(new Set(t.map(e=>e.promotionCode).filter(Boolean))),saleMethod:S,saleMode:S,pricingMode:S,orderPricingMode:S,isPromotionSale:!0,promotionCalculated:!0,
priceLocked:!0,lockedPrice:!0,lockedPromotion:!0})}try{const e=await o(async e=>{const o=await r.findOne({$and:[_,k,V()]}).session(e).lean();if(!o){
const e=new Error("Không tìm thấy đơn bán hoặc đơn đã thay đổi trạng thái");throw e.status=404,e}const n=X(o);if(n){const e=new Error(n);throw e.status=409,e}
const a=Y(o),u=a?await i.findOne(a).session(e).lean():null;if(u&&(G(u)||W(u))){const e=new Error("Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng")
;throw e.status=409,e}const p=await I({scope:"mobile.sales.update",actorCode:l,requestKey:s},{session:e});if(p.replay)return p.response;const g={...j},f=!0===o.stockPosted
;if(Q&&f){const t=m.isQuotaEnabled();let n=j.items||[],r=new Map;if(t){const t=await m.adjustForOrderEdit({orderId:o.id||o._id||o.code,orderCode:o.code||o.id,
previousItems:o.items||[],nextItems:j.items||[],commandId:s,actorCode:l,actorName:y},{session:e});r=t.allocations,n=te(j.items||[],o.items||[],t.allocations,t.consumedQtyByCode)
}else n=oe(j.items||[],o.items||[]);g.items=n,g.usesInternalSaleQuota=n.some(e=>"INTERNAL_APP_QUOTA"===String(e.saleAllocationType||"").toUpperCase()),
g.internalSaleAllocationRefs=g.usesInternalSaleQuota?ne(n,r):[];const a=$(o.items||[],n);a.incoming.length&&await c.postSaleEditDelta(o,a.incoming,"IN",{session:e,commandId:s}),
a.outgoing.length&&await c.postSaleEditDelta(o,a.outgoing,"OUT",{session:e,commandId:s}),N("adjust_stock_and_quota",{incomingProducts:a.incoming.length,
outgoingProducts:a.outgoing.length})}const h=b(o.version),C=h>0?{version:h}:{$or:[{version:0},{version:{$exists:!1}},{version:null}]},S={$and:[_,k,V(),C,{$or:[{masterOrderId:{
$exists:!1}},{masterOrderId:null},{masterOrderId:""}]},{$or:[{masterOrderCode:{$exists:!1}},{masterOrderCode:null},{masterOrderCode:""}]},{$or:[{masterOrderNo:{$exists:!1}},{
masterOrderNo:null},{masterOrderNo:""}]},{mergeStatus:{$ne:"merged"}}]},A=await r.findOneAndUpdate(S,{$set:{...g,stockPosted:f,stockPostedAt:o.stockPostedAt||F,
stockPostedBy:o.stockPostedBy||l,lastMobileEditRequestKey:s,lastMobileEditedAt:F,lastMobileEditedBy:l},$inc:{version:1}},{new:!0,lean:!0,session:e});if(!A){
const e=new Error("Đơn vừa được thay đổi ở nơi khác. Vui lòng tải lại rồi sửa lại");throw e.status=409,e.code="ORDER_CONCURRENT_UPDATE",e}if(u&&!G(u)&&!W(u)){
const o=function(e={},o=null){const n=new Map((Array.isArray(o?.items)?o.items:[]).map(e=>[String(e.lineKey||ae(e)),e])),r=(Array.isArray(e.items)?e.items:[]).map(e=>{
const t=b(e.salePrice??e.price??e.unitPrice??0),o=b(e.quantity??e.qty??0),r=ae({...e,salePrice:t}),a=n.get(r)||{},s=b(a.returnQty??a.qtyReturn??a.quantity??0);return{...a,
productId:e.productId||e.productCode||"",productCode:e.productCode||e.code||e.productId||"",productName:e.productName||e.name||"",unit:e.unit||e.baseUnit||"",soldQty:o,price:t,
salePrice:t,soldAmount:Math.round(o*t),returnQty:s,qtyReturn:s,returnQuantity:s,quantity:s,qty:s,returnAmount:Math.round(s*t),amount:Math.round(s*t),lineKey:r}
}),a=r.reduce((e,t)=>e+b(t.soldAmount),0),s=r.reduce((e,t)=>e+b(t.returnAmount),0),i=s>0?"waiting_receive":"draft";return{...o||{},
id:o?.id||`RO-${String(e.code||e.id||q("RO")).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,
code:o?.code||`RO-${String(e.code||e.id||q("RO")).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,date:e.deliveryDate||e.date||t.todayVN(),documentDate:e.date||t.todayVN(),
salesOrderId:e.id||"",salesOrderCode:e.code||"",orderId:e.id||"",orderCode:e.code||"",customerId:e.customerId||"",customerCode:e.customerCode||"",customerName:e.customerName||"",
salesStaffCode:e.salesStaffCode||e.staffCode||"",salesStaffName:e.salesStaffName||e.staffName||"",staffCode:e.salesStaffCode||e.staffCode||"",
staffName:e.salesStaffName||e.staffName||"",masterOrderId:e.masterOrderId||"",masterOrderCode:e.masterOrderCode||"",deliveryStaffId:e.deliveryStaffId||"",
deliveryStaffCode:e.deliveryStaffCode||"",deliveryStaffName:e.deliveryStaffName||"",deliveryDate:e.deliveryDate||e.date||t.todayVN(),items:r,totalSoldAmount:a,totalReturnAmount:s,
totalQuantity:r.reduce((e,t)=>e+b(t.returnQty),0),totalAmount:s,amount:s,debtReduction:s,status:i,returnStatus:i,returnState:i,returnMergeStatus:o?.returnMergeStatus||"unmerged",
warehouseReceiveStatus:"waiting_receive"===i?"waiting_receive":"draft",source:o?.source||"sales_order_draft",createdFrom:o?.createdFrom||"sales_order",
accountingStatus:"waiting_receive"===i?"pending":"draft",accountingConfirmed:Boolean(o?.accountingConfirmed),createdAt:o?.createdAt||(new Date).toISOString(),
updatedAt:(new Date).toISOString()}}(A,u),{_id:n,__v:r,...a}=o;await i.updateOne({_id:u._id},{$set:a},{session:e})}await d.create([{id:q("ML"),action:"mobile_edit_sales_order",
actorCode:l,actorName:y,refType:"salesOrder",refId:A.id,refCode:A.code,note:`Sửa đơn ${A.code} từ mobile; tồn và hạn mức được điều chỉnh theo chênh lệch`,createdAt:F}],{session:e})
;const v={body:{ok:!0,source:"mobile-sales-route-direct",message:`Đã sửa đơn ${A.code}`,salesOrder:{...A,canEdit:!0,editLockReason:""}}};return await P(p.key,v,{session:e}),v})
;return N("done"),h(s,e)}catch(e){if(e&&"INSUFFICIENT_STOCK"===e.code)return h(s,se(409,e.message||"Không đủ tồn kho để tăng số lượng đơn"))
;if(e&&"DMS_APP_QUOTA_EXCEEDED"===e.code){const t=se(409,e.message||"Số lượng sửa tăng vượt hạn mức theo tồn DMS mới nhất");return t.body.productCode=e.productCode||"",
t.body.availableQuota=b(e.availableQuota),t.body.requiredQty=b(e.requiredQty),h(s,t)}return h(s,se(e.status||500,e.message||"Không sửa được đơn mobile"))}},
deleteSalesOrder:async function({params:e={},mobileUser:t}){const o=L(t);if(!o)return se(403,"Không xác định được nhân viên bán hàng");const n=await u.deleteSalesOrder(e.id,{
source:"mobile-sales-app",actorCode:t.code||t.staffCode||"",actorName:t.fullName||t.name||"",ownerFilter:o});return n.error?se(n.status||400,n.error):{body:{ok:!0,
source:"mobile-sales-delete-service",message:n.message||`Đã xóa đơn ${n.salesOrder?.code||""}`,mode:n.mode,hardDeleted:!0,salesOrder:n.salesOrder,order:n.salesOrder}}},
listSalesOrders:async function({query:e={},mobileUser:o}){
const n=t.toDateOnly(e.date||t.todayVN()),a="0"!==String(e.mine||"1"),s=String(e.q||"").trim(),{page:i,limit:d,skip:c}=k(e,{defaultLimit:30,maxLimit:100}),u=[V()];if(n&&u.push({
$or:[{date:n},{orderDate:n}]}),a){const e=L(o);if(!e)return{body:{ok:!0,source:"mobile-sales-paged",date:n,items:[],summary:{totalAmount:0,paidAmount:0,debtAmount:0,orderCount:0},
pagination:M({page:i,limit:d,totalRows:0})}};u.push(e)}if(s){const e=new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i");u.push({$or:[{code:e},{orderCode:e},{salesOrderCode:e
},{customerCode:e},{customerName:e},{customerPhone:e},{customerAddress:e}]})}const l=1===u.length?u[0]:{$and:u},m=e=>({$convert:{input:e,to:"double",onError:0,onNull:0}}),p=m({
$ifNull:["$totalAmount",{$ifNull:["$amount","$grandTotal"]}]}),g=m({$ifNull:["$paidAmount","$paymentAmount"]}),f=m({$ifNull:["$debtAmount",{$subtract:[p,g]}]}),h={$cond:[{$gt:[f,0]
},f,0]},y=await r.aggregate([{$match:l},{$facet:{rows:[{$sort:{createdAt:-1,orderDate:-1,date:-1,_id:-1}},{$skip:c},{$limit:d},{$project:{id:1,code:1,date:1,orderDate:1,
customerId:1,customerCode:1,customerName:1,customerPhone:1,customerAddress:1,salesStaffCode:1,salesStaffName:1,salesPersonCode:1,salesPersonName:1,salesmanCode:1,salesmanName:1,
nvbhCode:1,nvbhName:1,maNVBH:1,maNVBHName:1,totalAmount:1,amount:1,grandTotal:1,paidAmount:1,paymentAmount:1,debtAmount:1,status:1,lifecycleStatus:1,deliveryStatus:1,
accountingStatus:1,accountingConfirmed:1,arStatus:1,deleted:1,isDeleted:1,deletedAt:1,deleteMode:1,deleteReason:1,masterOrderId:1,masterOrderCode:1,masterOrderNo:1,mergeStatus:1,
stockPosted:1,stockPostedAt:1,items:1,note:1,createdAt:1,updatedAt:1,version:1}}],totals:[{$group:{_id:null,orderCount:{$sum:1},totalAmount:{$sum:p},paidAmount:{$sum:g},
debtAmount:{$sum:h}}}]}}]).allowDiskUse(!0).exec(),C=y?.[0]||{},S=C.totals?.[0]||{};return{body:{ok:!0,source:"mobile-sales-paged",date:n,items:(C.rows||[]).map(e=>({
id:e.id||String(e._id||""),code:e.code,date:e.date||e.orderDate,customerName:e.customerName,totalAmount:b(e.totalAmount??e.amount??e.grandTotal),
paidAmount:b(e.paidAmount??e.paymentAmount),debtAmount:Math.max(0,b(e.debtAmount??b(e.totalAmount??e.amount??e.grandTotal)-b(e.paidAmount??e.paymentAmount))),status:e.status,
lifecycleStatus:e.lifecycleStatus||e.status||"",deliveryStatus:e.deliveryStatus||"pending",deleted:Boolean(e.deleted),isDeleted:Boolean(e.isDeleted),deletedAt:e.deletedAt||"",
deleteMode:e.deleteMode||"",deleteReason:e.deleteReason||"",masterOrderId:e.masterOrderId||"",masterOrderCode:e.masterOrderCode||"",mergeStatus:e.mergeStatus||"unmerged",
canEdit:J(e),editLockReason:X(e),stockPosted:!0===e.stockPosted,customerId:e.customerId,customerCode:e.customerCode,customerPhone:e.customerPhone,customerAddress:e.customerAddress,
salesStaffCode:e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH||"",
salesStaffName:e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName||"",salesPersonCode:e.salesPersonCode||"",salesPersonName:e.salesPersonName||"",
salesmanCode:e.salesmanCode||"",salesmanName:e.salesmanName||"",nvbhCode:e.nvbhCode||"",nvbhName:e.nvbhName||"",maNVBH:e.maNVBH||"",maNVBHName:e.maNVBHName||"",items:e.items||[],
note:e.note||"",createdAt:e.createdAt})).filter(e=>A.isOrderVisibleInHistory(e)),summary:{totalAmount:b(S.totalAmount),paidAmount:b(S.paidAmount),debtAmount:b(S.debtAmount),
orderCount:b(S.orderCount)},pagination:M({page:i,limit:d,totalRows:S.orderCount||0})}}},listDebts:async function({query:e={},mobileUser:t}={}){const o={...e,collectorType:"sales",
page:e.page||1,limit:e.limit||30,includePaid:e.includePaid||"0",includePendingCollections:e.includePendingCollections??"1"};if("sales"===String(t?.role||"")){const e=x(t),n=K(t)
;e?o.salesStaffCode=e:n&&(o.salesStaffName=n)}return{body:await C.getMobileCustomerDebts(o)}}}}module.exports={createMobileSalesService:ce};
