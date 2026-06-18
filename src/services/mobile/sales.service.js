/* GENERATED FILE — edit src/services/mobile/sales.service.source/part-01.jsfrag, src/services/mobile/sales.service.source/part-02.jsfrag, src/services/mobile/sales.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const{canonicalizeOperationalStaff:e}=require("../../utils/canonicalStaffWrite.util"),t=require("../../utils/date.util"),{withMongoTransaction:o}=require("../../utils/transaction.util"),{createMobileSalesRepository:n}=require("../../repositories/mobile/sales.repository"),r=require("../../models/SalesOrder"),a=require("../../models/Customer"),s=require("../../models/Product"),i=require("../../models/ReturnOrder"),d=require("../../models/MobileLog"),c=require("../../domain/posting/InventoryPostingService"),u=require("../../domain/lifecycle/SalesOrderDeletionService"),l=require("../inventoryStock.service"),m=require("../internalSaleAllocation.service"),{createStepTimer:p,getIdempotencyKey:g,readIdempotentResult:f,rememberIdempotentResult:y}=require("../../utils/mobilePerformance.util"),h=require("../promotionService"),C=require("../DebtReadService"),{PROMOTION:S}=require("../../constants/pricingModes"),A=require("../../utils/orderStatus.util"),{normalizeText:N,toNumber:b}=require("../../utils/common.util"),{buildPersistentKey:v,findRequest:P,beginRequest:O,completeRequest:I}=require("../requestIdempotency.service"),{buildInventoryEditMovements:w,normalizeProductCode:_}=require("../../utils/orderItemDelta.util")
;function q(e={}){return l.quantityOf(e)}function $(e={}){return String(e.code||e.productCode||e.sku||"").trim()}function D(e=[]){
return Array.from(new Set((Array.isArray(e)?e:[e]).map(e=>String(e||"").trim()).filter(Boolean)))}function M(e=""){const t=String(e||"").trim()
;return t?D([t,t.toUpperCase(),t.toLowerCase()]):[]}function k(e){const t=D([e]);return t.length?{$or:[{id:{$in:t}},{code:{$in:t}},{orderCode:{$in:t}},{salesOrderCode:{$in:t}},{
documentCode:{$in:t}},{invoiceCode:{$in:t}}]}:null}function R(e={}){return String(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.maNVBH||e.staffCode||e.code||"").trim()}
function Q(e={}){return String(e.salesStaffName||e.salesmanName||e.nvbhName||e.maNVBHName||e.fullName||e.name||"").trim()}function T(e={}){const t=M(R(e));if(t.length)return{$or:[{
salesStaffCode:{$in:t}},{salesPersonCode:{$in:t}},{salesmanCode:{$in:t}},{nvbhCode:{$in:t}},{maNVBH:{$in:t}},{"salesStaff.code":{$in:t}}]};const o=M(Q(e));return o.length?{$or:[{
salesStaffName:{$in:o}},{salesPersonName:{$in:o}},{salesmanName:{$in:o}},{nvbhName:{$in:o}},{maNVBHName:{$in:o}},{"salesStaff.name":{$in:o}},{"salesStaff.fullName":{$in:o}}]}:null}
const E=["cancelled","canceled","void","deleted","removed"],U=[!0,"true",1,"1","yes","YES","y","Y"];function B(){return{$and:[{status:{$nin:E}},{lifecycleStatus:{$nin:E}},{
deliveryStatus:{$nin:E}},{deleted:{$nin:U}},{isDeleted:{$nin:U}},{deletedAt:{$in:[null,""]}}]}}function L(e={}){const t=e.customer||{}
;return D([t.id,t._id,t.customerId,t.code,t.customerCode,e.customerId,e.customerCode])}async function x(e={}){const t=D(L(e).flatMap(M));return t.length?a.findOne({isActive:{$ne:!1
},$or:[{id:{$in:t}},{code:{$in:t}},{customerCode:{$in:t}},{phone:{$in:t}}]}).select("id code customerCode name customerName phone address area route isActive").lean():null}
function K(e={}){return String(e.productCode||e.code||e.sku||e.productId||"").trim()}function V(e=[]){const t=new Map
;for(const o of e||[])for(const e of D([o.id,o._id,o.code,o.productCode,o.sku,o.barcode]))t.set(e,o),t.set(e.toUpperCase(),o),t.set(e.toLowerCase(),o);return t}
async function H(e=[]){const t=D((e||[]).map(K).flatMap(M));return t.length?s.find({isActive:{$ne:!1},$or:[{id:{$in:t}},{code:{$in:t}},{productCode:{$in:t}},{sku:{$in:t}},{
barcode:{$in:t}}]
}).select("id code productCode sku barcode name productName unit baseUnit conversionRate packing brand category groupName productGroup salePrice price isActive").lean():[]}
function z(e={}){const t=D([e.id,e._id,e.salesOrderId,e.orderId]),o=D([e.code,e.orderCode,e.salesOrderCode]),n=[];return t.length&&n.push({salesOrderId:{$in:t}},{orderId:{$in:t}},{
sourceOrderId:{$in:t}},{deliveryOrderId:{$in:t}}),o.length&&n.push({salesOrderCode:{$in:o}},{orderCode:{$in:o}},{sourceOrderCode:{$in:o}},{deliveryOrderCode:{$in:o}}),n.length?{
status:{$nin:["cancelled","canceled","void","deleted"]},$or:n}:null}function F(e={}){
return(Array.isArray(e.items)?e.items:[]).some(e=>b(e.returnQty??e.qtyReturn??e.returnQuantity??e.quantity??e.qty)>0)||b(e.totalReturnAmount??e.totalAmount??e.amount??e.debtReduction)>0
}function j(e={}){const t=String(e.status||e.returnStatus||"").toLowerCase(),o=String(e.returnMergeStatus||"").toLowerCase(),n=String(e.warehouseReceiveStatus||"").toLowerCase()
;return Boolean(e.masterReturnOrderId||e.masterReturnOrderCode)||"merged"===o||["received","posted","completed"].includes(t)||["received","posted","completed"].includes(n)}
function Z(e={}){
const o=String(e.status||"").trim().toLowerCase(),n=String(e.lifecycleStatus||"").trim().toLowerCase(),r=String(e.deliveryStatus||"").trim().toLowerCase(),a=String(e.accountingStatus||e.arStatus||"").trim().toLowerCase(),s=String(e.mergeStatus||"unmerged").trim().toLowerCase()
;if(E.includes(o)||E.includes(n)||E.includes(r)||U.includes(e.deleted)||U.includes(e.isDeleted)||e.deletedAt)return"Đơn đã hủy hoặc đã xóa, không thể chỉnh sửa"
;if(e.masterOrderId||e.masterOrderCode||e.masterOrderNo||"merged"===s)return"Đơn đã gộp đơn tổng, app bán hàng không được sửa"
;if(!0===e.accountingConfirmed||["confirmed","posted","locked","accounting_confirmed"].includes(a))return"Đơn đã xác nhận kế toán, không thể chỉnh sửa trên app bán hàng"
;if(["delivered","completed","accounting_confirmed"].includes(r)||["delivered","completed","accounting_confirmed"].includes(n))return"Đơn đã giao hoặc đã hoàn tất, không thể chỉnh sửa trên app bán hàng"
;const i=t.toDateOnly(e.date||e.orderDate||"");return i&&i!==t.todayVN()?"App bán hàng chỉ cho chỉnh sửa đơn trong ngày hiện tại":""}function Y(e={}){return!Z(e)}function G(e=[]){
const t=new Map;for(const o of Array.isArray(e)?e:[]){const e=_(o.productCode||o.code||o.sku||o.productId)
;e&&("INTERNAL_APP_QUOTA"!==String(o.saleAllocationType||"").toUpperCase()&&!String(o.internalSaleAllocationId||"").trim()&&b(o.allocationConsumedQty??o.quotaConsumedQty)<=0||t.set(e,o))
}return t}function W(e=[],t=[],o=new Map,n=new Map){const r=G(t),a=new Map(Array.from(n.entries()).map(([e,t])=>[e,Math.max(0,b(t))]));return(Array.isArray(e)?e:[]).map(e=>{
const t=_(e.productCode||e.code||e.sku||e.productId),n=o.get(t)||null,s=r.get(t)||{},i=Math.max(0,b(e.quantity??e.qty)),d=Math.max(0,b(a.get(t))),c=Math.min(i,d)
;a.set(t,Math.max(0,d-c));const u={...e};return delete u.saleAllocationType,delete u.internalSaleAllocationId,delete u.allocationSnapshotDate,delete u.allocationConsumedQty,
delete u.quotaConsumedQty,c<=0?u:{...u,saleAllocationType:"INTERNAL_APP_QUOTA",internalSaleAllocationId:String(n?.id||n?._id||s.internalSaleAllocationId||""),
allocationSnapshotDate:String(n?.snapshotDate||s.allocationSnapshotDate||""),allocationConsumedQty:c}})}function X(e=[],t=[]){const o=G(t),n=new Map
;for(const[e,t]of o.entries())n.set(e,Math.max(0,b(t.allocationConsumedQty??t.quotaConsumedQty??t.quantity??t.qty)));return(Array.isArray(e)?e:[]).map(e=>{
const t=_(e.productCode||e.code||e.sku||e.productId),r=o.get(t)||null,a=Math.max(0,b(e.quantity??e.qty)),s=Math.max(0,b(n.get(t))),i=Math.min(a,s);n.set(t,Math.max(0,s-i))
;const d={...e};return delete d.saleAllocationType,delete d.internalSaleAllocationId,delete d.allocationSnapshotDate,delete d.allocationConsumedQty,delete d.quotaConsumedQty,
!r||i<=0?d:{...d,saleAllocationType:"INTERNAL_APP_QUOTA",internalSaleAllocationId:String(r.internalSaleAllocationId||""),
allocationSnapshotDate:String(r.allocationSnapshotDate||""),allocationConsumedQty:i}})}function J(e=[],t=new Map){
const o=(Array.isArray(e)?e:[]).filter(e=>"INTERNAL_APP_QUOTA"===String(e.saleAllocationType||"").toUpperCase()).map(e=>({...e,
quantity:e.allocationConsumedQty??e.quotaConsumedQty??e.quantity??e.qty})),n=m.aggregateItems(o);return Array.from(n.entries()).map(([o,n])=>{
const r=t.get(o)||{},a=(Array.isArray(e)?e:[]).find(e=>_(e.productCode||e.code||e.sku||e.productId)===o)||{};return{
allocationId:String(r.id||r._id||a.internalSaleAllocationId||""),productCode:o,snapshotDate:String(r.snapshotDate||a.allocationSnapshotDate||""),quantity:b(n)}})}
async function ee(e=[]){const t=(e||[]).map($).filter(Boolean),o=await l.getAvailableStocks(t),n=new Map;for(const t of e||[]){const e=$(t)
;e&&n.set(e,Number(o[l.normalizeProductCode(e)]||o[e]||0))}return n}async function te(e={}){const t=await l.getAvailableStock($(e));return Number(t.availableQty||0)}
function oe(e,t){return{statusCode:e,body:{ok:!1,success:!1,message:t}}}function ne(e=[]){return(Array.isArray(e)?e:[]).find(e=>e&&"object"==typeof e)||{}}function re(e=[]){
const t=ne(e);return{promotionId:String(t.promotionId||t.id||t._id||t.programId||t.ruleId||"").trim(),
promotionCode:String(t.promotionCode||t.code||t.programCode||t.ruleCode||"").trim(),
promotionName:String(t.promotionName||t.name||t.programName||t.ruleName||t.description||"").trim()}}function ae(a){n(a)
;const{normalizeText:s,toNumber:N,formatCaseLooseQty:b,buildProductLineMeta:q,makeId:$,buildSalesCode:D,buildCashCode:M,updateSalesOrderWithRepost:E,writeMobileLog:U}=a
;function G(e={}){return R(e)}function te(e={}){return Q(e)}function ne(e={}){
return[String(e.productCode||e.code||e.productId||"").trim(),String(e.unit||e.baseUnit||"").trim(),String(N(e.salePrice??e.price??e.unitPrice??0))].join("|")}return{
createSalesOrder:async function({body:n={},mobileUser:a}){
const s=L(n),i=g(n,["sales-create",a&&(a.id||a.code),n.customerCode||s[0]||"",Array.isArray(n.items)?n.items.length:0]),u=f(i);if(u)return u
;const C=a&&(a.staffCode||a.code||a.id||"mobile-sales"),A=v("mobile.sales.create",C,i),w=await P(A);if(w&&"completed"===w.status&&w.response)return y(i,w.response)
;if(w&&"processing"===w.status)return oe(409,"Yêu cầu tạo đơn trùng đang được xử lý");const _=p("sales.createOrder");let D,M=null;try{D=await o(async o=>{_("start")
;const s=await x(n),u=Array.isArray(n.items)?n.items:[],p=N(n.paidAmount),g=t.todayVN();if(!s)return oe(400,"Không tìm thấy khách hàng")
;if(!u.length)return oe(400,"Đơn mobile chưa có sản phẩm");_("load_customer_direct");const f=V(await H(u)),y=[],A=new Map;for(const e of u){
const t=K(e),o=f.get(t)||f.get(String(t).toUpperCase())||f.get(String(t).toLowerCase());if(!o)return oe(400,`Không tìm thấy sản phẩm: ${e.productCode||e.code||""}`)
;const n=N(e.quantity||e.qty),r=N(e.salePrice||e.price||o.salePrice||o.price);if(n<=0)return oe(400,`Số lượng phải lớn hơn 0: ${o.code}`);y.push({rawItem:e,product:o,quantity:n,
salePrice:r}),A.set(String(o.code||o.productCode||o.id||"").trim(),o)}_("prepare_items_direct",{products:A.size});const v=await ee(Array.from(A.values()));_("batch_stock_check",{
products:A.size});const P=[];for(const e of y){const{product:t,quantity:o,salePrice:n}=e,r=String(t.code||t.productCode||t.id||"").trim(),a=v.get(r)||0
;if(a<o)return oe(400,`Không đủ tồn mở bán: ${t.code}. Tồn ${b(a,t.conversionRate||1)}, cần ${b(o,t.conversionRate||1)}`);P.push({productId:t.id||String(t._id||t.code||""),
productCode:t.code||t.productCode||t.sku||"",productName:t.name||t.productName||"",...q(t),quantity:o,grossPrice:n,catalogSalePrice:n,salePrice:n,price:n,amount:o*n})}
const w=await h.calculatePromotions(P),D=new Map((w.lines||[]).map(e=>[String(e.productCode||"").trim(),e])),k=P.map(e=>{
const t=D.get(String(e.productCode||"").trim())||{},o=N(t.catalogSalePrice||e.grossPrice||e.salePrice),n=Math.round(e.quantity*o),r=N(t.directDiscountAmount||0),a=N(t.groupDiscountAmount||0),s=Math.min(n,r+a),i=Math.max(0,n-s),d=e.quantity>0?Math.round(i/e.quantity):0,c=Array.isArray(t.promotionRows)?t.promotionRows:[],u=re(c)
;return{...e,originalPrice:o,grossPrice:o,catalogSalePrice:o,grossAmount:n,directDiscountPercent:N(t.directDiscountPercent||0),groupDiscountPercent:N(t.groupDiscountPercent||0),
discountPercent:n>0?s/n*100:0,directDiscountAmount:r,groupDiscountAmount:a,discountAmount:s,promotionAmount:s,totalDiscountAmount:s,finalPrice:d,unitPrice:d,salePrice:d,price:d,
preTaxPriceAtOrder:Math.round(o/1.08),vatAmountAtOrder:Math.round((d-d/1.08)*e.quantity),lineAmountAtOrder:i,amount:i,netAmount:i,saleMethod:S,saleMode:S,pricingMode:S,
priceLocked:!0,lockedPrice:!0,lockedPromotion:!0,promotionCalculated:!0,promotionRows:c,appliedPromotionRows:c,productSnapshot:{...e.productSnapshot||{},salePrice:o,
conversionRate:e.conversionRateAtOrder||e.conversionRate||1,
pickingZone:e.pickingZoneAtOrder||e.productSnapshot?.pickingZone||("KHO_PC"===(e.warehouseCodeAtOrder||e.warehouseCode)?"PC":"HC"),
warehouseCode:e.warehouseCodeAtOrder||e.warehouseCode||"KHO_HC",defaultWarehouse:e.warehouseCodeAtOrder||e.warehouseCode||"KHO_HC"},...u}
}),R=k.reduce((e,t)=>e+t.quantity,0),Q=k.reduce((e,t)=>e+N(t.grossAmount),0),T=k.reduce((e,t)=>e+N(t.discountAmount),0),E=k.reduce((e,t)=>e+t.amount,0),U=Array.from(new Set(k.map(e=>e.promotionCode).filter(Boolean)))
;if(p>E)return oe(400,"Tiền thu không được lớn hơn tổng đơn");const B=$("SO"),L={id:B,code:String(n.code||n.orderCode||B).trim(),date:g,customerId:s.id||String(s._id||s.code||""),
customerCode:s.code||s.customerCode||"",customerName:s.name||s.customerName||"",customerPhone:s.phone||"",customerAddress:s.address||"",salesStaffCode:G(a),salesStaffName:te(a),
salesmanCode:G(a),salesmanName:te(a),staffCode:"",staffName:"",source:"mobile_sales_app",orderSource:"NVBH",orderSourceName:"Từ NVBH",vatInvoiceRequired:!0,
vatInvoiceDecisionSource:"default",vatInvoiceNote:"",vatInvoiceUpdatedAt:"",vatInvoiceUpdatedBy:"",saleMethod:S,saleMode:S,pricingMode:S,orderPricingMode:S,isPromotionSale:!0,
promotionCalculated:!0,isChildOrder:!0,masterOrderId:"",mergeStatus:"unmerged",note:String(n.note||"Tạo từ mobile app").trim(),items:k,totalQuantity:R,grossAmount:Q,
totalGrossAmount:Q,grossAmountBeforePromotion:Q,discountAmount:T,totalDiscountAmount:T,promotionAmount:T,totalPromotionAmount:T,netAmount:E,goodsAmountAfterPromotion:E,
promotionCodes:U,priceLocked:!0,lockedPrice:!0,lockedPromotion:!0,totalAmount:E,paidAmount:p,debtAmount:E-p,salesCollectionPendingAccounting:p>0,salesCollectionAmount:p,
salesCollectionMethod:String(n.paymentMethod||n.collectionMethod||"cash").trim().toLowerCase(),salesCollectionSource:p>0?"mobile_sales_pending_accounting":"",
salesCollectionStaffCode:G(a),salesCollectionStaffName:te(a),status:"pending",lifecycleStatus:"pending",orderDate:g,deliveryStatus:"pending",accountingStatus:"pending",
stockPosted:!0,stockPostedAt:(new Date).toISOString(),stockPostedBy:a.code||a.name||"mobile_sales",createdAt:(new Date).toISOString()},z=await O({scope:"mobile.sales.create",
actorCode:C,requestKey:i},{session:o});if(z.replay)return z.response;_("idempotency_begin");const F=await m.consumeForOrder({orderId:B,orderCode:L.code,items:k,actorCode:G(a),
actorName:te(a)},{session:o});L.items=k.map(e=>{const t=F.get(l.normalizeProductCode(e.productCode));return t?{...e,saleAllocationType:"INTERNAL_APP_QUOTA",
internalSaleAllocationId:String(t.id||t._id||""),allocationSnapshotDate:String(t.snapshotDate||""),allocationConsumedQty:N(e.quantity)}:e}),L.usesInternalSaleQuota=F.size>0,
L.internalSaleAllocationRefs=Array.from(F.values()).map(e=>({allocationId:String(e.id||e._id||""),productCode:String(e.productCode||""),snapshotDate:String(e.snapshotDate||""),
quantity:N(k.filter(t=>l.normalizeProductCode(t.productCode)===l.normalizeProductCode(e.productCode)).reduce((e,t)=>e+N(t.quantity),0))})),_("consume_internal_sale_quota",{
products:F.size});const j=e(L),Z=(await r.create([j],{session:o}))[0],Y=Z&&"function"==typeof Z.toObject?Z.toObject():Z;_("create_sales_order_direct"),await c.postSaleOut(Y,{
session:o}),_("post_inventory_sale_out"),await d.create([{id:$("ML"),action:"mobile_create_sales_order",actorCode:a.code||a.staffCode||"",actorName:a.fullName||a.name||"",
refType:"salesOrder",refId:j.id,refCode:j.code,note:`Tạo đơn ${j.code} từ mobile`,createdAt:(new Date).toISOString()}],{session:o}),_("save_operational_documents_direct"),M=Y
;const W={statusCode:201,body:{ok:!0,source:"mobile-sales-route-direct",message:"Đã gửi đơn mobile về hệ thống tổng",salesOrder:Y}};return await I(z.key,W,{session:o}),
_("idempotency_complete"),W})}catch(e){if(e&&"INSUFFICIENT_STOCK"===e.code){const t=oe(400,e.message||"Không đủ tồn kho");return y(i,t)}if(e&&"DMS_APP_QUOTA_EXCEEDED"===e.code){
const t=oe(409,e.message||"Số lượng bán vượt hạn mức theo tồn DMS mới nhất");return t.body.productCode=e.productCode||"",t.body.availableQuota=N(e.availableQuota),
t.body.requiredQty=N(e.requiredQty),y(i,t)}throw e}const k=D||{statusCode:201,body:{ok:!0,salesOrder:M}};return _("done"),y(i,k)},
getSalesOrder:async function({params:e={},mobileUser:t}){const o=k(e.id),n=T(t);if(!o||!n)return oe(404,"Không tìm thấy đơn bán");const a=await r.findOne({$and:[o,n]}).lean()
;if(!a)return oe(404,"Không tìm thấy đơn bán");let s=Z(a);if(!s){const e=z(a);if(e){const t=await i.findOne(e).lean()
;t&&(F(t)||j(t))&&(s="Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng")}}return{body:{ok:!0,source:"mobile-sales-route-direct",order:{...a,canEdit:!s,
editLockReason:s}}}},updateSalesOrder:async function({params:e={},body:n={},mobileUser:a}){const s=g(n,["sales-update",a&&(a.id||a.code),e.id]),u=f(s);if(u)return u
;const l=String(a&&(a.staffCode||a.code||a.id||"mobile-sales")),h=te(a),C=v("mobile.sales.update",l,s),S=await P(C);if(S&&"completed"===S.status&&S.response)return y(s,S.response)
;if(S&&"processing"===S.status)return oe(409,"Yêu cầu sửa đơn trùng đang được xử lý");const A=p("sales.updateOrder");A("start");const b=k(e.id),q=T(a)
;if(!b||!q)return y(s,oe(404,"Không tìm thấy đơn bán"));const D=await r.findOne({$and:[b,q,B()]}).lean();if(!D)return y(s,oe(404,"Không tìm thấy đơn bán"));const M=Z(D)
;if(M)return y(s,oe(409,M));const R=z(D),Q=R?await i.findOne(R).lean():null
;if(Q&&(F(Q)||j(Q)))return y(s,oe(409,"Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng"))
;const E=n.customer||{},U=Array.isArray(n.items)?n.items:null,L=(new Date).toISOString(),x={customerId:E.id||E.customerId||n.customerId||D.customerId,
customerCode:E.code||E.customerCode||n.customerCode||D.customerCode,customerName:E.name||E.customerName||n.customerName||D.customerName,note:String(n.note??D.note??"").trim(),
salesStaffCode:G(a),salesStaffName:h,salesmanCode:G(a),salesmanName:h,vatInvoiceRequired:!1!==D.vatInvoiceRequired,vatInvoiceDecisionSource:D.vatInvoiceDecisionSource||"default",
vatInvoiceNote:String(D.vatInvoiceNote||""),vatInvoiceUpdatedAt:String(D.vatInvoiceUpdatedAt||""),vatInvoiceUpdatedBy:String(D.vatInvoiceUpdatedBy||""),updatedAt:L};if(U){
const e=U.map((e={})=>{
const t=N(e.quantity??e.qty??0),o=N(e.salePrice??e.unitPrice??e.finalPrice??e.price??0),n=N(e.grossPrice??e.originalPrice??e.catalogSalePrice??o),r=Math.round(N(e.grossAmount??t*n)),a=N(e.discountAmount??e.promotionAmount??e.totalDiscountAmount??Math.max(0,r-N(e.amount??t*o))),s=Math.max(0,Math.round(N(e.amount??t*o)))
;return{...e,quantity:t,qty:t,grossPrice:n,grossAmount:r,discountAmount:a,promotionAmount:N(e.promotionAmount??a),totalDiscountAmount:N(e.totalDiscountAmount??a),salePrice:o,
unitPrice:N(e.unitPrice??o),finalPrice:N(e.finalPrice??e.unitPrice??o),price:N(e.price??o),amount:s,netAmount:N(e.netAmount??s)}
}),t=e.find(e=>N(e.quantity)<=0||!_(e.productCode||e.code||e.sku||e.productId))
;if(t)return y(s,oe(400,`Sản phẩm hoặc số lượng không hợp lệ: ${t.productCode||t.code||t.productName||""}`))
;const o=e.reduce((e,t)=>e+N(t.quantity),0),r=e.reduce((e,t)=>e+N(t.grossAmount??N(t.quantity)*N(t.grossPrice)),0),a=e.reduce((e,t)=>e+N(t.discountAmount??t.promotionAmount??t.totalDiscountAmount),0),i=e.reduce((e,t)=>e+N(t.amount),0),d=N(n.paidAmount??D.paidAmount??0)
;if(d>i)return y(s,oe(400,"Tiền thu không được lớn hơn tổng đơn"));Object.assign(x,{items:e,totalQuantity:o,grossAmount:r,totalGrossAmount:r,grossAmountBeforePromotion:r,
discountAmount:a,totalDiscountAmount:a,promotionAmount:a,totalPromotionAmount:a,netAmount:i,goodsAmountAfterPromotion:i,totalAmount:i,paidAmount:d,debtAmount:i-d,
promotionCodes:Array.from(new Set(e.map(e=>e.promotionCode).filter(Boolean)))})}try{const e=await o(async e=>{const o=await r.findOne({$and:[b,q,B()]}).session(e).lean();if(!o){
const e=new Error("Không tìm thấy đơn bán hoặc đơn đã thay đổi trạng thái");throw e.status=404,e}const n=Z(o);if(n){const e=new Error(n);throw e.status=409,e}
const a=z(o),u=a?await i.findOne(a).session(e).lean():null;if(u&&(F(u)||j(u))){const e=new Error("Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng")
;throw e.status=409,e}const p=await O({scope:"mobile.sales.update",actorCode:l,requestKey:s},{session:e});if(p.replay)return p.response;const g={...x},f=!0===o.stockPosted
;if(U&&f){const t=m.isQuotaEnabled();let n=x.items||[],r=new Map;if(t){const t=await m.adjustForOrderEdit({orderId:o.id||o._id||o.code,orderCode:o.code||o.id,
previousItems:o.items||[],nextItems:x.items||[],commandId:s,actorCode:l,actorName:h},{session:e});r=t.allocations,n=W(x.items||[],o.items||[],t.allocations,t.consumedQtyByCode)
}else n=X(x.items||[],o.items||[]);g.items=n,g.usesInternalSaleQuota=n.some(e=>"INTERNAL_APP_QUOTA"===String(e.saleAllocationType||"").toUpperCase()),
g.internalSaleAllocationRefs=g.usesInternalSaleQuota?J(n,r):[];const a=w(o.items||[],n);a.incoming.length&&await c.postSaleEditDelta(o,a.incoming,"IN",{session:e,commandId:s}),
a.outgoing.length&&await c.postSaleEditDelta(o,a.outgoing,"OUT",{session:e,commandId:s}),A("adjust_stock_and_quota",{incomingProducts:a.incoming.length,
outgoingProducts:a.outgoing.length})}const y=N(o.version),C=y>0?{version:y}:{$or:[{version:0},{version:{$exists:!1}},{version:null}]},S={$and:[b,q,B(),C,{$or:[{masterOrderId:{
$exists:!1}},{masterOrderId:null},{masterOrderId:""}]},{$or:[{masterOrderCode:{$exists:!1}},{masterOrderCode:null},{masterOrderCode:""}]},{$or:[{masterOrderNo:{$exists:!1}},{
masterOrderNo:null},{masterOrderNo:""}]},{mergeStatus:{$ne:"merged"}}]},v=await r.findOneAndUpdate(S,{$set:{...g,stockPosted:f,stockPostedAt:o.stockPostedAt||L,
stockPostedBy:o.stockPostedBy||l,lastMobileEditRequestKey:s,lastMobileEditedAt:L,lastMobileEditedBy:l},$inc:{version:1}},{new:!0,lean:!0,session:e});if(!v){
const e=new Error("Đơn vừa được thay đổi ở nơi khác. Vui lòng tải lại rồi sửa lại");throw e.status=409,e.code="ORDER_CONCURRENT_UPDATE",e}if(u&&!F(u)&&!j(u)){
const o=function(e={},o=null){const n=new Map((Array.isArray(o?.items)?o.items:[]).map(e=>[String(e.lineKey||ne(e)),e])),r=(Array.isArray(e.items)?e.items:[]).map(e=>{
const t=N(e.salePrice??e.price??e.unitPrice??0),o=N(e.quantity??e.qty??0),r=ne({...e,salePrice:t}),a=n.get(r)||{},s=N(a.returnQty??a.qtyReturn??a.quantity??0);return{...a,
productId:e.productId||e.productCode||"",productCode:e.productCode||e.code||e.productId||"",productName:e.productName||e.name||"",unit:e.unit||e.baseUnit||"",soldQty:o,price:t,
salePrice:t,soldAmount:Math.round(o*t),returnQty:s,qtyReturn:s,returnQuantity:s,quantity:s,qty:s,returnAmount:Math.round(s*t),amount:Math.round(s*t),lineKey:r}
}),a=r.reduce((e,t)=>e+N(t.soldAmount),0),s=r.reduce((e,t)=>e+N(t.returnAmount),0),i=s>0?"waiting_receive":"draft";return{...o||{},
id:o?.id||`RO-${String(e.code||e.id||$("RO")).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,
code:o?.code||`RO-${String(e.code||e.id||$("RO")).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,date:e.deliveryDate||e.date||t.todayVN(),documentDate:e.date||t.todayVN(),
salesOrderId:e.id||"",salesOrderCode:e.code||"",orderId:e.id||"",orderCode:e.code||"",customerId:e.customerId||"",customerCode:e.customerCode||"",customerName:e.customerName||"",
salesStaffCode:e.salesStaffCode||e.staffCode||"",salesStaffName:e.salesStaffName||e.staffName||"",staffCode:e.salesStaffCode||e.staffCode||"",
staffName:e.salesStaffName||e.staffName||"",masterOrderId:e.masterOrderId||"",masterOrderCode:e.masterOrderCode||"",deliveryStaffId:e.deliveryStaffId||"",
deliveryStaffCode:e.deliveryStaffCode||"",deliveryStaffName:e.deliveryStaffName||"",deliveryDate:e.deliveryDate||e.date||t.todayVN(),items:r,totalSoldAmount:a,totalReturnAmount:s,
totalQuantity:r.reduce((e,t)=>e+N(t.returnQty),0),totalAmount:s,amount:s,debtReduction:s,status:i,returnStatus:i,returnState:i,returnMergeStatus:o?.returnMergeStatus||"unmerged",
warehouseReceiveStatus:"waiting_receive"===i?"waiting_receive":"draft",source:o?.source||"sales_order_draft",createdFrom:o?.createdFrom||"sales_order",
accountingStatus:"waiting_receive"===i?"pending":"draft",accountingConfirmed:Boolean(o?.accountingConfirmed),createdAt:o?.createdAt||(new Date).toISOString(),
updatedAt:(new Date).toISOString()}}(v,u),{_id:n,__v:r,...a}=o;await i.updateOne({_id:u._id},{$set:a},{session:e})}await d.create([{id:$("ML"),action:"mobile_edit_sales_order",
actorCode:l,actorName:h,refType:"salesOrder",refId:v.id,refCode:v.code,note:`Sửa đơn ${v.code} từ mobile; tồn và hạn mức được điều chỉnh theo chênh lệch`,createdAt:L}],{session:e})
;const P={body:{ok:!0,source:"mobile-sales-route-direct",message:`Đã sửa đơn ${v.code}`,salesOrder:{...v,canEdit:!0,editLockReason:""}}};return await I(p.key,P,{session:e}),P})
;return A("done"),y(s,e)}catch(e){if(e&&"INSUFFICIENT_STOCK"===e.code)return y(s,oe(409,e.message||"Không đủ tồn kho để tăng số lượng đơn"))
;if(e&&"DMS_APP_QUOTA_EXCEEDED"===e.code){const t=oe(409,e.message||"Số lượng sửa tăng vượt hạn mức theo tồn DMS mới nhất");return t.body.productCode=e.productCode||"",
t.body.availableQuota=N(e.availableQuota),t.body.requiredQty=N(e.requiredQty),y(s,t)}return y(s,oe(e.status||500,e.message||"Không sửa được đơn mobile"))}},
deleteSalesOrder:async function({params:e={},mobileUser:t}){const o=T(t);if(!o)return oe(403,"Không xác định được nhân viên bán hàng");const n=await u.deleteSalesOrder(e.id,{
source:"mobile-sales-app",actorCode:t.code||t.staffCode||"",actorName:t.fullName||t.name||"",ownerFilter:o});return n.error?oe(n.status||400,n.error):{body:{ok:!0,
source:"mobile-sales-delete-service",message:n.message||`Đã xóa đơn ${n.salesOrder?.code||""}`,mode:n.mode,hardDeleted:!0,salesOrder:n.salesOrder,order:n.salesOrder}}},
listSalesOrders:async function({query:e={},mobileUser:o}){const n=t.toDateOnly(e.date||t.todayVN()),a="0"!==String(e.mine||"1"),s=String(e.q||"").trim(),i=[B()];if(n&&i.push({
$or:[{date:n},{orderDate:n}]}),a){const e=T(o);if(!e)return{body:{ok:!0,source:"mobile-sales-route-direct",date:n,items:[]}};i.push(e)}if(s){
const e=new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i");i.push({$or:[{code:e},{orderCode:e},{salesOrderCode:e},{customerCode:e},{customerName:e},{customerPhone:e},{
customerAddress:e}]})}return{body:{ok:!0,source:"mobile-sales-route-direct",date:n,items:(await r.find(1===i.length?i[0]:{$and:i
}).select("id code date orderDate customerId customerCode customerName customerPhone customerAddress salesStaffCode salesStaffName salesPersonCode salesPersonName salesmanCode salesmanName nvbhCode nvbhName maNVBH maNVBHName totalAmount paidAmount debtAmount status lifecycleStatus deliveryStatus accountingStatus accountingConfirmed arStatus deleted isDeleted deletedAt deleteMode deleteReason masterOrderId masterOrderCode masterOrderNo mergeStatus stockPosted stockPostedAt items note createdAt updatedAt version").sort({
createdAt:-1,date:-1}).limit(100).lean()).map(e=>({id:e.id,code:e.code,date:e.date||e.orderDate,customerName:e.customerName,totalAmount:N(e.totalAmount),paidAmount:N(e.paidAmount),
debtAmount:N(e.debtAmount),status:e.status,lifecycleStatus:e.lifecycleStatus||e.status||"",deliveryStatus:e.deliveryStatus||"pending",deleted:Boolean(e.deleted),
isDeleted:Boolean(e.isDeleted),deletedAt:e.deletedAt||"",deleteMode:e.deleteMode||"",deleteReason:e.deleteReason||"",masterOrderId:e.masterOrderId||"",
masterOrderCode:e.masterOrderCode||"",mergeStatus:e.mergeStatus||"unmerged",canEdit:Y(e),editLockReason:Z(e),stockPosted:!0===e.stockPosted,customerId:e.customerId,
customerCode:e.customerCode,customerPhone:e.customerPhone,customerAddress:e.customerAddress,
salesStaffCode:e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH||"",
salesStaffName:e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName||"",salesPersonCode:e.salesPersonCode||"",salesPersonName:e.salesPersonName||"",
salesmanCode:e.salesmanCode||"",salesmanName:e.salesmanName||"",nvbhCode:e.nvbhCode||"",nvbhName:e.nvbhName||"",maNVBH:e.maNVBH||"",maNVBHName:e.maNVBHName||"",items:e.items||[],
note:e.note||"",createdAt:e.createdAt})).filter(e=>A.isOrderVisibleInHistory(e))}}},listDebts:async function({query:e={},mobileUser:t}={}){const o={...e,collectorType:"sales",
limit:e.limit||100,includePaid:e.includePaid||"0",includePendingCollections:e.includePendingCollections??"1"};if("sales"===String(t?.role||"")){const e=G(t),n=te(t);o.salesman=e||n
}return{body:await C.getCustomerDebts(o)}}}}module.exports={createMobileSalesService:ae};
