/* GENERATED FILE — edit src/services/mobile/sales.service.source/part-01.jsfrag, src/services/mobile/sales.service.source/part-01b.jsfrag, src/services/mobile/sales.service.source/part-02.jsfrag, src/services/mobile/sales.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const{canonicalizeOperationalStaff:e}=require("../../utils/canonicalStaffWrite.util"),t=require("../../utils/date.util"),{withMongoTransaction:o}=require("../../utils/transaction.util"),{createMobileSalesRepository:r}=require("../../repositories/mobile/sales.repository"),n=require("../../models/SalesOrder"),a=require("../../models/Customer"),s=require("../../models/Product"),i=require("../../models/ReturnOrder"),d=require("../../models/MobileLog"),c=require("../../domain/posting/InventoryPostingService"),u=require("../../domain/lifecycle/SalesOrderDeletionService"),l=require("../inventoryStock.service"),m=require("../internalSaleAllocation.service"),{createStepTimer:p,getIdempotencyKey:g,readIdempotentResult:f,rememberIdempotentResult:h}=require("../../utils/mobilePerformance.util"),C=require("../promotionService"),S=require("../DebtReadService"),y=require("../accounting/arDebtRuntimeView.service"),{PROMOTION:A}=require("../../constants/pricingModes"),b=require("../../utils/orderStatus.util"),{normalizeText:N,toNumber:v}=require("../../utils/common.util"),{buildPersistentKey:O,findRequest:I,beginRequest:P,completeRequest:w}=require("../requestIdempotency.service"),{buildInventoryEditMovements:_,normalizeProductCode:$}=require("../../utils/orderItemDelta.util"),{customerOwnershipFilterForSalesUser:D,combineFilters:q}=require("../../domain/staff/customerOwnership"),{parseMobilePagination:k,buildPagination:M}=require("./mobilePagination.util"),{buildMobileSalesOrderTrackingSummaries:R,decorateMobileSalesOrderForTracking:T}=require("./mobileSalesOrderTracking.service"),E=require("../printDocumentService")
;function Q(e={}){return l.quantityOf(e)}function B(e={}){return String(e.code||e.productCode||e.sku||"").trim()}function U(e=[]){
return Array.from(new Set((Array.isArray(e)?e:[e]).map(e=>String(e||"").trim()).filter(Boolean)))}function L(e=""){const t=String(e||"").trim()
;return t?U([t,t.toUpperCase(),t.toLowerCase()]):[]}function x(e){const t=U([e]);return t.length?{$or:[{id:{$in:t}},{code:{$in:t}},{orderCode:{$in:t}},{salesOrderCode:{$in:t}},{
documentCode:{$in:t}},{invoiceCode:{$in:t}}]}:null}function K(e={}){return String(e.salesStaffCode||e.salesmanCode||e.nvbhCode||e.maNVBH||e.staffCode||e.code||"").trim()}
function V(e={}){return String(e.salesStaffName||e.salesmanName||e.nvbhName||e.maNVBHName||e.fullName||e.name||"").trim()}function H(e={}){const t=L(K(e));if(t.length)return{$or:[{
salesStaffCode:{$in:t}},{salesPersonCode:{$in:t}},{salesmanCode:{$in:t}},{nvbhCode:{$in:t}},{maNVBH:{$in:t}},{"salesStaff.code":{$in:t}}]};const o=L(V(e));return o.length?{$or:[{
salesStaffName:{$in:o}},{salesPersonName:{$in:o}},{salesmanName:{$in:o}},{nvbhName:{$in:o}},{maNVBHName:{$in:o}},{"salesStaff.name":{$in:o}},{"salesStaff.fullName":{$in:o}}]}:null}
const z=["cancelled","canceled","void","deleted","removed"],F=[!0,"true",1,"1","yes","YES","y","Y"];function j(){return{$and:[{status:{$nin:z}},{lifecycleStatus:{$nin:z}},{
deliveryStatus:{$nin:z}},{deleted:{$nin:F}},{isDeleted:{$nin:F}},{deletedAt:{$in:[null,""]}}]}}function G(e={}){const t=e.customer||{}
;return U([t.id,t._id,t.customerId,t.code,t.customerCode,e.customerId,e.customerCode])}async function Z(e={},t={},o=null){const r=U(G(e).flatMap(L));if(!r.length)return null
;const n={isActive:{$ne:!1},$or:[{id:{$in:r}},{code:{$in:r}},{customerCode:{$in:r}},{phone:{$in:r}}]},s=D(t)
;let i=a.findOne(q(n,s)).select("id code customerCode name customerName phone address area route isActive salesStaffCode salesStaffName salesmanCode salesmanName assignedSalesStaffCode assignedSalesStaffName nvbhCode nvbhName maNVBH tenNVBH staffCode staffName")
;return o&&"function"==typeof i.session&&(i=i.session(o)),i.lean()}function Y(e={}){return String(e.productCode||e.code||e.sku||e.productId||"").trim()}function W(e=[]){
const t=new Map;for(const o of e||[])for(const e of U([o.id,o._id,o.code,o.productCode,o.sku,o.barcode]))t.set(e,o),t.set(e.toUpperCase(),o),t.set(e.toLowerCase(),o);return t}
async function X(e=[]){const t=U((e||[]).map(Y).flatMap(L));return t.length?s.find({isActive:{$ne:!1},$or:[{id:{$in:t}},{code:{$in:t}},{productCode:{$in:t}},{sku:{$in:t}},{
barcode:{$in:t}}]
}).select("id code productCode sku barcode name productName unit baseUnit conversionRate packing brand category groupName productGroup salePrice price isActive").lean():[]}
function J(e={}){const t=U([e.id,e._id,e.salesOrderId,e.orderId]),o=U([e.code,e.orderCode,e.salesOrderCode]),r=[];return t.length&&r.push({salesOrderId:{$in:t}},{orderId:{$in:t}},{
sourceOrderId:{$in:t}},{deliveryOrderId:{$in:t}}),o.length&&r.push({salesOrderCode:{$in:o}},{orderCode:{$in:o}},{sourceOrderCode:{$in:o}},{deliveryOrderCode:{$in:o}}),r.length?{
status:{$nin:["cancelled","canceled","void","deleted"]},$or:r}:null}function ee(e={}){
return(Array.isArray(e.items)?e.items:[]).some(e=>v(e.returnQty??e.qtyReturn??e.returnQuantity??e.quantity??e.qty)>0)||v(e.totalReturnAmount??e.totalAmount??e.amount??e.debtReduction)>0
}function te(e={}){const t=String(e.status||e.returnStatus||"").toLowerCase(),o=String(e.returnMergeStatus||"").toLowerCase(),r=String(e.warehouseReceiveStatus||"").toLowerCase()
;return Boolean(e.masterReturnOrderId||e.masterReturnOrderCode)||"merged"===o||["received","posted","completed"].includes(t)||["received","posted","completed"].includes(r)}
function oe(e={}){
const o=String(e.status||"").trim().toLowerCase(),r=String(e.lifecycleStatus||"").trim().toLowerCase(),n=String(e.deliveryStatus||"").trim().toLowerCase(),a=String(e.accountingStatus||e.arStatus||"").trim().toLowerCase(),s=String(e.mergeStatus||"unmerged").trim().toLowerCase()
;if(z.includes(o)||z.includes(r)||z.includes(n)||F.includes(e.deleted)||F.includes(e.isDeleted)||e.deletedAt)return"Đơn đã hủy hoặc đã xóa, không thể chỉnh sửa"
;if(e.masterOrderId||e.masterOrderCode||e.masterOrderNo||"merged"===s)return"Đơn đã gộp đơn tổng, app bán hàng không được sửa"
;if(!0===e.accountingConfirmed||["confirmed","posted","locked","accounting_confirmed"].includes(a))return"Đơn đã xác nhận kế toán, không thể chỉnh sửa trên app bán hàng"
;if(["delivered","completed","accounting_confirmed"].includes(n)||["delivered","completed","accounting_confirmed"].includes(r))return"Đơn đã giao hoặc đã hoàn tất, không thể chỉnh sửa trên app bán hàng"
;const i=t.toDateOnly(e.date||e.orderDate||"");return i&&i!==t.todayVN()?"App bán hàng chỉ cho chỉnh sửa đơn trong ngày hiện tại":""}function re(e={}){return!oe(e)}
function ne(e=[]){const t=new Map;for(const o of Array.isArray(e)?e:[]){const e=$(o.productCode||o.code||o.sku||o.productId)
;e&&("INTERNAL_APP_QUOTA"!==String(o.saleAllocationType||"").toUpperCase()&&!String(o.internalSaleAllocationId||"").trim()&&v(o.allocationConsumedQty??o.quotaConsumedQty)<=0||t.set(e,o))
}return t}function ae(e=[],t=[],o=new Map,r=new Map){const n=ne(t),a=new Map(Array.from(r.entries()).map(([e,t])=>[e,Math.max(0,v(t))]));return(Array.isArray(e)?e:[]).map(e=>{
const t=$(e.productCode||e.code||e.sku||e.productId),r=o.get(t)||null,s=n.get(t)||{},i=Math.max(0,v(e.quantity??e.qty)),d=Math.max(0,v(a.get(t))),c=Math.min(i,d)
;a.set(t,Math.max(0,d-c));const u={...e};return delete u.saleAllocationType,delete u.internalSaleAllocationId,delete u.allocationSnapshotDate,delete u.allocationConsumedQty,
delete u.quotaConsumedQty,c<=0?u:{...u,saleAllocationType:"INTERNAL_APP_QUOTA",internalSaleAllocationId:String(r?.id||r?._id||s.internalSaleAllocationId||""),
allocationSnapshotDate:String(r?.snapshotDate||s.allocationSnapshotDate||""),allocationConsumedQty:c}})}function se(e=[],t=[]){const o=ne(t),r=new Map
;for(const[e,t]of o.entries())r.set(e,Math.max(0,v(t.allocationConsumedQty??t.quotaConsumedQty??t.quantity??t.qty)));return(Array.isArray(e)?e:[]).map(e=>{
const t=$(e.productCode||e.code||e.sku||e.productId),n=o.get(t)||null,a=Math.max(0,v(e.quantity??e.qty)),s=Math.max(0,v(r.get(t))),i=Math.min(a,s);r.set(t,Math.max(0,s-i))
;const d={...e};return delete d.saleAllocationType,delete d.internalSaleAllocationId,delete d.allocationSnapshotDate,delete d.allocationConsumedQty,delete d.quotaConsumedQty,
!n||i<=0?d:{...d,saleAllocationType:"INTERNAL_APP_QUOTA",internalSaleAllocationId:String(n.internalSaleAllocationId||""),
allocationSnapshotDate:String(n.allocationSnapshotDate||""),allocationConsumedQty:i}})}function ie(e=[],t=new Map){
const o=(Array.isArray(e)?e:[]).filter(e=>"INTERNAL_APP_QUOTA"===String(e.saleAllocationType||"").toUpperCase()).map(e=>({...e,
quantity:e.allocationConsumedQty??e.quotaConsumedQty??e.quantity??e.qty})),r=m.aggregateItems(o);return Array.from(r.entries()).map(([o,r])=>{
const n=t.get(o)||{},a=(Array.isArray(e)?e:[]).find(e=>$(e.productCode||e.code||e.sku||e.productId)===o)||{};return{
allocationId:String(n.id||n._id||a.internalSaleAllocationId||""),productCode:o,snapshotDate:String(n.snapshotDate||a.allocationSnapshotDate||""),quantity:v(r)}})}
async function de(e=[]){const t=(e||[]).map(B).filter(Boolean),o=await l.getAvailableStocks(t),r=new Map;for(const t of e||[]){const e=B(t)
;e&&r.set(e,Number(o[l.normalizeProductCode(e)]||o[e]||0))}return r}async function ce(e={}){const t=await l.getAvailableStock(B(e));return Number(t.availableQty||0)}
function ue(e,t){return{statusCode:e,body:{ok:!1,success:!1,message:t}}}function le(e=[]){return(Array.isArray(e)?e:[]).find(e=>e&&"object"==typeof e)||{}}function me(e=[]){
const t=le(e);return{promotionId:String(t.promotionId||t.id||t._id||t.programId||t.ruleId||"").trim(),
promotionCode:String(t.promotionCode||t.code||t.programCode||t.ruleCode||"").trim(),
promotionName:String(t.promotionName||t.name||t.programName||t.ruleName||t.description||"").trim()}}function pe(a){r(a)
;const{normalizeText:s,toNumber:N,formatCaseLooseQty:v,buildProductLineMeta:D,makeId:q,buildSalesCode:Q,buildCashCode:B,updateSalesOrderWithRepost:U,writeMobileLog:L}=a
;function z(e={}){return K(e)}function F(e={}){return V(e)}async function re(e=[],t={}){const o=Array.isArray(e)?e:[];if(!o.length)return{error:"Đơn mobile chưa có sản phẩm",
status:400};const r=await X(o),n=W(r),a=[],s=new Map;for(const e of o){const t=Y(e),o=n.get(t)||n.get(String(t).toUpperCase())||n.get(String(t).toLowerCase());if(!o)return{
error:`Không tìm thấy sản phẩm: ${e.productCode||e.code||""}`,status:400};const r=N(e.quantity??e.qty??0);if(r<=0)return{
error:`Số lượng phải lớn hơn 0: ${o.code||o.productCode||""}`,status:400};const i=N(o.salePrice??o.price??0),d=String(o.code||o.productCode||o.sku||"").trim();a.push({
productId:o.id||String(o._id||d||""),productCode:d,productName:o.name||o.productName||"",...D(o),quantity:r,grossPrice:i,catalogSalePrice:i,salePrice:i,price:i,
amount:Math.round(r*i)}),s.set(d,o)}const i=await C.calculatePromotions(a,t),d=new Map((i.lines||[]).map(e=>[String(e.productCode||"").trim(),e]));return{items:a.map(e=>{
const t=d.get(String(e.productCode||"").trim())||{},o=N(t.catalogSalePrice??e.grossPrice??e.salePrice),r=Math.round(e.quantity*o),n=N(t.directDiscountAmount||0),a=N(t.groupDiscountAmount||0),s=Math.min(r,n+a),i=Math.max(0,r-s),c=e.quantity>0?Math.round(i/e.quantity):0,u=Array.isArray(t.promotionRows)?t.promotionRows:[],l=me(u)
;return{...e,originalPrice:o,grossPrice:o,catalogSalePrice:o,grossAmount:r,directDiscountPercent:N(t.directDiscountPercent||0),groupDiscountPercent:N(t.groupDiscountPercent||0),
discountPercent:r>0?s/r*100:0,directDiscountAmount:n,groupDiscountAmount:a,discountAmount:s,promotionAmount:s,totalDiscountAmount:s,finalPrice:c,unitPrice:c,salePrice:c,price:c,
preTaxPriceAtOrder:Math.round(o/1.08),vatAmountAtOrder:Math.round((c-c/1.08)*e.quantity),lineAmountAtOrder:i,amount:i,netAmount:i,saleMethod:A,saleMode:A,pricingMode:A,
priceLocked:!0,lockedPrice:!0,lockedPromotion:!0,promotionCalculated:!0,promotionRows:u,appliedPromotionRows:u,productSnapshot:{...e.productSnapshot||{},salePrice:o,
conversionRate:e.conversionRateAtOrder||e.conversionRate||1,
pickingZone:e.pickingZoneAtOrder||e.productSnapshot?.pickingZone||("KHO_PC"===(e.warehouseCodeAtOrder||e.warehouseCode)?"PC":"HC"),
warehouseCode:e.warehouseCodeAtOrder||e.warehouseCode||"KHO_HC",defaultWarehouse:e.warehouseCodeAtOrder||e.warehouseCode||"KHO_HC"},...l}}),products:r,productByCode:s}}
function ne(e={}){return[String(e.productCode||e.code||e.productId||"").trim(),String(e.unit||e.baseUnit||"").trim(),String(N(e.salePrice??e.price??e.unitPrice??0))].join("|")}
return{createSalesOrder:async function({body:r={},mobileUser:a}){
const s=G(r),i=g(r,["sales-create",a&&(a.id||a.code),r.customerCode||s[0]||"",Array.isArray(r.items)?r.items.length:0]),u=f(i);if(u)return u
;const C=a&&(a.staffCode||a.code||a.id||"mobile-sales"),S=O("mobile.sales.create",C,i),y=await I(S);if(y&&"completed"===y.status&&y.response)return h(i,y.response)
;if(y&&"processing"===y.status)return ue(409,"Yêu cầu tạo đơn trùng đang được xử lý");const b=p("sales.createOrder");let _,$=null;try{_=await o(async o=>{b("start")
;const s=await Z(r,a,o),u=Array.isArray(r.items)?r.items:[],p=N(r.paidAmount),g=t.todayVN();if(!s)return ue(403,"Khách hàng không thuộc phạm vi nhân viên bán hàng")
;if(!u.length)return ue(400,"Đơn mobile chưa có sản phẩm");b("load_customer_direct");const f=await re(u,{customerCode:s.code||s.customerCode||r.customerCode,date:g})
;if(f.error)return ue(f.status||400,f.error);const{items:h,productByCode:S}=f;b("prepare_items_server_authoritative",{products:S.size});const y=await de(Array.from(S.values()))
;b("batch_stock_check",{products:S.size});const O=new Map;for(const e of h){const t=String(e.productCode||"").trim();O.set(t,N(O.get(t))+N(e.quantity))}
for(const[e,t]of O.entries()){const o=S.get(e),r=y.get(e)||0;if(r<t)return ue(400,`Không đủ tồn mở bán: ${e}. Tồn ${v(r,o?.conversionRate||1)}, cần ${v(t,o?.conversionRate||1)}`)}
const I=h.reduce((e,t)=>e+t.quantity,0),_=h.reduce((e,t)=>e+N(t.grossAmount),0),D=h.reduce((e,t)=>e+N(t.discountAmount),0),k=h.reduce((e,t)=>e+t.amount,0),M=Array.from(new Set(h.map(e=>e.promotionCode).filter(Boolean)))
;if(p>k)return ue(400,"Tiền thu không được lớn hơn tổng đơn");const R=q("SO"),T={id:R,code:String(r.code||r.orderCode||R).trim(),date:g,customerId:s.id||String(s._id||s.code||""),
customerCode:s.code||s.customerCode||"",customerName:s.name||s.customerName||"",customerPhone:s.phone||"",customerAddress:s.address||"",salesStaffCode:z(a),salesStaffName:F(a),
salesmanCode:z(a),salesmanName:F(a),staffCode:"",staffName:"",source:"mobile_sales_app",orderSource:"NVBH",orderSourceName:"Từ NVBH",vatInvoiceRequired:!0,
vatInvoiceDecisionSource:"default",vatInvoiceNote:"",vatInvoiceUpdatedAt:"",vatInvoiceUpdatedBy:"",saleMethod:A,saleMode:A,pricingMode:A,orderPricingMode:A,isPromotionSale:!0,
promotionCalculated:!0,isChildOrder:!0,masterOrderId:"",mergeStatus:"unmerged",note:String(r.note||"Tạo từ mobile app").trim(),items:h,totalQuantity:I,grossAmount:_,
totalGrossAmount:_,grossAmountBeforePromotion:_,discountAmount:D,totalDiscountAmount:D,promotionAmount:D,totalPromotionAmount:D,netAmount:k,goodsAmountAfterPromotion:k,
promotionCodes:M,priceLocked:!0,lockedPrice:!0,lockedPromotion:!0,totalAmount:k,paidAmount:p,debtAmount:0,currentDebtAmount:0,debtSource:"PENDING_ACCOUNTING_NOT_AR_DEBT",
salesCollectionPendingAccounting:p>0,salesCollectionAmount:p,salesCollectionMethod:String(r.paymentMethod||r.collectionMethod||"cash").trim().toLowerCase(),
salesCollectionSource:p>0?"mobile_sales_pending_accounting":"",salesCollectionStaffCode:z(a),salesCollectionStaffName:F(a),status:"pending",lifecycleStatus:"pending",orderDate:g,
deliveryStatus:"pending",accountingStatus:"pending",stockPosted:!0,stockPostedAt:(new Date).toISOString(),stockPostedBy:a.code||a.name||"mobile_sales",
createdAt:(new Date).toISOString()},E=await P({scope:"mobile.sales.create",actorCode:C,requestKey:i},{session:o});if(E.replay)return E.response;b("idempotency_begin")
;const Q=await m.consumeForOrder({orderId:R,orderCode:T.code,items:h,actorCode:z(a),actorName:F(a)},{session:o});T.items=h.map(e=>{
const t=Q.get(l.normalizeProductCode(e.productCode));return t?{...e,saleAllocationType:"INTERNAL_APP_QUOTA",internalSaleAllocationId:String(t.id||t._id||""),
allocationSnapshotDate:String(t.snapshotDate||""),allocationConsumedQty:N(e.quantity)}:e}),T.usesInternalSaleQuota=Q.size>0,
T.internalSaleAllocationRefs=Array.from(Q.values()).map(e=>({allocationId:String(e.id||e._id||""),productCode:String(e.productCode||""),snapshotDate:String(e.snapshotDate||""),
quantity:N(h.filter(t=>l.normalizeProductCode(t.productCode)===l.normalizeProductCode(e.productCode)).reduce((e,t)=>e+N(t.quantity),0))})),b("consume_internal_sale_quota",{
products:Q.size});const B=e(T),U=(await n.create([B],{session:o}))[0],L=U&&"function"==typeof U.toObject?U.toObject():U;b("create_sales_order_direct"),await c.postSaleOut(L,{
session:o}),b("post_inventory_sale_out"),await d.create([{id:q("ML"),action:"mobile_create_sales_order",actorCode:a.code||a.staffCode||"",actorName:a.fullName||a.name||"",
refType:"salesOrder",refId:B.id,refCode:B.code,note:`Tạo đơn ${B.code} từ mobile`,createdAt:(new Date).toISOString()}],{session:o}),b("save_operational_documents_direct"),$=L
;const x={statusCode:201,body:{ok:!0,source:"mobile-sales-route-direct",message:"Đã gửi đơn mobile về hệ thống tổng",salesOrder:L}};return await w(E.key,x,{session:o}),
b("idempotency_complete"),x})}catch(e){if(e&&"INSUFFICIENT_STOCK"===e.code){const t=ue(400,e.message||"Không đủ tồn kho");return h(i,t)}if(e&&"DMS_APP_QUOTA_EXCEEDED"===e.code){
const t=ue(409,e.message||"Số lượng bán vượt hạn mức theo tồn DMS mới nhất");return t.body.productCode=e.productCode||"",t.body.availableQuota=N(e.availableQuota),
t.body.requiredQty=N(e.requiredQty),h(i,t)}throw e}const D=_||{statusCode:201,body:{ok:!0,salesOrder:$}};return b("done"),h(i,D)},
getSalesOrder:async function({params:e={},mobileUser:t}){const o=x(e.id),r=H(t);if(!o||!r)return ue(404,"Không tìm thấy đơn bán");const a=await n.findOne({$and:[o,r]}).lean()
;if(!a)return ue(404,"Không tìm thấy đơn bán");let s=oe(a);if(!s){const e=J(a);if(e){const t=await i.findOne(e).lean()
;t&&(ee(t)||te(t))&&(s="Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng")}}const d=await R([a]);return{body:{ok:!0,source:"mobile-sales-route-direct",
order:T({...a,canEdit:!s,editLockReason:s},d.get(a.id||a.code||e.id))}}},renderSalesOrderPrintHtml:async function({params:e={},mobileUser:t}){const o=x(e.id),r=H(t)
;if(!o||!r)return ue(404,"Không tìm thấy đơn bán");const a=await n.findOne({$and:[o,r,j()]}).lean();if(!a)return ue(404,"Không tìm thấy đơn bán")
;const s=a.id||a.code||a.orderCode||a.salesOrderCode||e.id,i=await E.renderSalesOrder(String(s||"").trim(),{source:"mobile-sales-order-view",readonly:"1"})
;return i.error?ue(i.status||400,i.error):{statusCode:200,contentType:"text/html; charset=utf-8",html:i.html,
filename:`${String(a.code||a.id||"sales-order").replace(/[^a-zA-Z0-9._-]/g,"_")}.html`}},updateSalesOrder:async function({params:e={},body:r={},mobileUser:a}){
const s=g(r,["sales-update",a&&(a.id||a.code),e.id]),u=f(s);if(u)return u
;const l=String(a&&(a.staffCode||a.code||a.id||"mobile-sales")),C=F(a),S=O("mobile.sales.update",l,s),y=await I(S);if(y&&"completed"===y.status&&y.response)return h(s,y.response)
;if(y&&"processing"===y.status)return ue(409,"Yêu cầu sửa đơn trùng đang được xử lý");const b=p("sales.updateOrder");b("start");const v=x(e.id),D=H(a)
;if(!v||!D)return h(s,ue(404,"Không tìm thấy đơn bán"));const k=await n.findOne({$and:[v,D,j()]}).lean();if(!k)return h(s,ue(404,"Không tìm thấy đơn bán"));const M=oe(k)
;if(M)return h(s,ue(409,M));const R=J(k),T=R?await i.findOne(R).lean():null
;if(T&&(ee(T)||te(T)))return h(s,ue(409,"Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng"));const E=Array.isArray(r.items)?r.items:null,Q=G(r).length?r:{
customerId:k.customerId,customerCode:k.customerCode},B=await Z(Q,a);if(!B)return h(s,ue(403,"Khách hàng không thuộc phạm vi nhân viên bán hàng"))
;const U=(new Date).toISOString(),L={customerId:B.id||String(B._id||B.code||k.customerId||""),customerCode:B.code||B.customerCode||k.customerCode||"",
customerName:B.name||B.customerName||k.customerName||"",customerPhone:B.phone||k.customerPhone||"",customerAddress:B.address||k.customerAddress||"",
note:String(r.note??k.note??"").trim(),salesStaffCode:z(a),salesStaffName:C,salesmanCode:z(a),salesmanName:C,vatInvoiceRequired:!1!==k.vatInvoiceRequired,
vatInvoiceDecisionSource:k.vatInvoiceDecisionSource||"default",vatInvoiceNote:String(k.vatInvoiceNote||""),vatInvoiceUpdatedAt:String(k.vatInvoiceUpdatedAt||""),
vatInvoiceUpdatedBy:String(k.vatInvoiceUpdatedBy||""),updatedAt:U};if(E){const e=await re(E,{
customerCode:r.customerCode||r.customer?.code||r.customer?.customerCode||k.customerCode,date:r.date||r.orderDate||k.date||k.orderDate})
;if(e.error)return h(s,ue(e.status||400,e.error));const t=e.items,o=t.find(e=>N(e.quantity)<=0||!$(e.productCode||e.code||e.sku||e.productId))
;if(o)return h(s,ue(400,`Sản phẩm hoặc số lượng không hợp lệ: ${o.productCode||o.code||o.productName||""}`))
;const n=t.reduce((e,t)=>e+N(t.quantity),0),a=t.reduce((e,t)=>e+N(t.grossAmount),0),i=t.reduce((e,t)=>e+N(t.discountAmount),0),d=t.reduce((e,t)=>e+N(t.amount),0),c=N(r.paidAmount??k.paidAmount??0)
;if(c>d)return h(s,ue(400,"Tiền thu không được lớn hơn tổng đơn"));Object.assign(L,{items:t,totalQuantity:n,grossAmount:a,totalGrossAmount:a,grossAmountBeforePromotion:a,
discountAmount:i,totalDiscountAmount:i,promotionAmount:i,totalPromotionAmount:i,netAmount:d,goodsAmountAfterPromotion:d,totalAmount:d,paidAmount:c,debtAmount:0,currentDebtAmount:0,
debtSource:"PENDING_ACCOUNTING_NOT_AR_DEBT",promotionCodes:Array.from(new Set(t.map(e=>e.promotionCode).filter(Boolean))),saleMethod:A,saleMode:A,pricingMode:A,orderPricingMode:A,
isPromotionSale:!0,promotionCalculated:!0,priceLocked:!0,lockedPrice:!0,lockedPromotion:!0})}try{const e=await o(async e=>{const o=await n.findOne({$and:[v,D,j()]
}).session(e).lean();if(!o){const e=new Error("Không tìm thấy đơn bán hoặc đơn đã thay đổi trạng thái");throw e.status=404,e}const r=oe(o);if(r){const e=new Error(r)
;throw e.status=409,e}const a=J(o),u=a?await i.findOne(a).session(e).lean():null;if(u&&(ee(u)||te(u))){
const e=new Error("Đơn đã phát sinh nghiệp vụ trả hàng, không thể chỉnh sửa trên app bán hàng");throw e.status=409,e}const p=await P({scope:"mobile.sales.update",actorCode:l,
requestKey:s},{session:e});if(p.replay)return p.response;const g={...L},f=!0===o.stockPosted;if(E&&f){const t=m.isQuotaEnabled();let r=L.items||[],n=new Map;if(t){
const t=await m.adjustForOrderEdit({orderId:o.id||o._id||o.code,orderCode:o.code||o.id,previousItems:o.items||[],nextItems:L.items||[],commandId:s,actorCode:l,actorName:C},{
session:e});n=t.allocations,r=ae(L.items||[],o.items||[],t.allocations,t.consumedQtyByCode)}else r=se(L.items||[],o.items||[]);g.items=r,
g.usesInternalSaleQuota=r.some(e=>"INTERNAL_APP_QUOTA"===String(e.saleAllocationType||"").toUpperCase()),g.internalSaleAllocationRefs=g.usesInternalSaleQuota?ie(r,n):[]
;const a=_(o.items||[],r);a.incoming.length&&await c.postSaleEditDelta(o,a.incoming,"IN",{session:e,commandId:s}),a.outgoing.length&&await c.postSaleEditDelta(o,a.outgoing,"OUT",{
session:e,commandId:s}),b("adjust_stock_and_quota",{incomingProducts:a.incoming.length,outgoingProducts:a.outgoing.length})}const h=N(o.version),S=h>0?{version:h}:{$or:[{version:0
},{version:{$exists:!1}},{version:null}]},y={$and:[v,D,j(),S,{$or:[{masterOrderId:{$exists:!1}},{masterOrderId:null},{masterOrderId:""}]},{$or:[{masterOrderCode:{$exists:!1}},{
masterOrderCode:null},{masterOrderCode:""}]},{$or:[{masterOrderNo:{$exists:!1}},{masterOrderNo:null},{masterOrderNo:""}]},{mergeStatus:{$ne:"merged"}}]
},A=await n.findOneAndUpdate(y,{$set:{...g,stockPosted:f,stockPostedAt:o.stockPostedAt||U,stockPostedBy:o.stockPostedBy||l,lastMobileEditRequestKey:s,lastMobileEditedAt:U,
lastMobileEditedBy:l},$inc:{version:1}},{new:!0,lean:!0,session:e});if(!A){const e=new Error("Đơn vừa được thay đổi ở nơi khác. Vui lòng tải lại rồi sửa lại");throw e.status=409,
e.code="ORDER_CONCURRENT_UPDATE",e}if(u&&!ee(u)&&!te(u)){const o=function(e={},o=null){
const r=new Map((Array.isArray(o?.items)?o.items:[]).map(e=>[String(e.lineKey||ne(e)),e])),n=(Array.isArray(e.items)?e.items:[]).map(e=>{
const t=N(e.salePrice??e.price??e.unitPrice??0),o=N(e.quantity??e.qty??0),n=ne({...e,salePrice:t}),a=r.get(n)||{},s=N(a.returnQty??a.qtyReturn??a.quantity??0);return{...a,
productId:e.productId||e.productCode||"",productCode:e.productCode||e.code||e.productId||"",productName:e.productName||e.name||"",unit:e.unit||e.baseUnit||"",soldQty:o,price:t,
salePrice:t,soldAmount:Math.round(o*t),returnQty:s,qtyReturn:s,returnQuantity:s,quantity:s,qty:s,returnAmount:Math.round(s*t),amount:Math.round(s*t),lineKey:n}
}),a=n.reduce((e,t)=>e+N(t.soldAmount),0),s=n.reduce((e,t)=>e+N(t.returnAmount),0),i=s>0?"waiting_receive":"draft";return{...o||{},
id:o?.id||`RO-${String(e.code||e.id||q("RO")).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,
code:o?.code||`RO-${String(e.code||e.id||q("RO")).replace(/^RO[-_]?/i,"").replace(/[^a-zA-Z0-9_-]/g,"")}`,date:e.deliveryDate||e.date||t.todayVN(),documentDate:e.date||t.todayVN(),
salesOrderId:e.id||"",salesOrderCode:e.code||"",orderId:e.id||"",orderCode:e.code||"",customerId:e.customerId||"",customerCode:e.customerCode||"",customerName:e.customerName||"",
salesStaffCode:e.salesStaffCode||e.staffCode||"",salesStaffName:e.salesStaffName||e.staffName||"",staffCode:e.salesStaffCode||e.staffCode||"",
staffName:e.salesStaffName||e.staffName||"",masterOrderId:e.masterOrderId||"",masterOrderCode:e.masterOrderCode||"",deliveryStaffId:e.deliveryStaffId||"",
deliveryStaffCode:e.deliveryStaffCode||"",deliveryStaffName:e.deliveryStaffName||"",deliveryDate:e.deliveryDate||e.date||t.todayVN(),items:n,totalSoldAmount:a,totalReturnAmount:s,
totalQuantity:n.reduce((e,t)=>e+N(t.returnQty),0),totalAmount:s,amount:s,debtReduction:s,status:i,returnStatus:i,returnState:i,returnMergeStatus:o?.returnMergeStatus||"unmerged",
warehouseReceiveStatus:"waiting_receive"===i?"waiting_receive":"draft",source:o?.source||"sales_order_draft",createdFrom:o?.createdFrom||"sales_order",
accountingStatus:"waiting_receive"===i?"pending":"draft",accountingConfirmed:Boolean(o?.accountingConfirmed),createdAt:o?.createdAt||(new Date).toISOString(),
updatedAt:(new Date).toISOString()}}(A,u),{_id:r,__v:n,...a}=o;await i.updateOne({_id:u._id},{$set:a},{session:e})}await d.create([{id:q("ML"),action:"mobile_edit_sales_order",
actorCode:l,actorName:C,refType:"salesOrder",refId:A.id,refCode:A.code,note:`Sửa đơn ${A.code} từ mobile; tồn và hạn mức được điều chỉnh theo chênh lệch`,createdAt:U}],{session:e})
;const O={body:{ok:!0,source:"mobile-sales-route-direct",message:`Đã sửa đơn ${A.code}`,salesOrder:{...A,canEdit:!0,editLockReason:""}}};return await w(p.key,O,{session:e}),O})
;return b("done"),h(s,e)}catch(e){if(e&&"INSUFFICIENT_STOCK"===e.code)return h(s,ue(409,e.message||"Không đủ tồn kho để tăng số lượng đơn"))
;if(e&&"DMS_APP_QUOTA_EXCEEDED"===e.code){const t=ue(409,e.message||"Số lượng sửa tăng vượt hạn mức theo tồn DMS mới nhất");return t.body.productCode=e.productCode||"",
t.body.availableQuota=N(e.availableQuota),t.body.requiredQty=N(e.requiredQty),h(s,t)}return h(s,ue(e.status||500,e.message||"Không sửa được đơn mobile"))}},
deleteSalesOrder:async function({params:e={},mobileUser:t}){const o=H(t);if(!o)return ue(403,"Không xác định được nhân viên bán hàng");const r=await u.deleteSalesOrder(e.id,{
source:"mobile-sales-app",actorCode:t.code||t.staffCode||"",actorName:t.fullName||t.name||"",ownerFilter:o});return r.error?ue(r.status||400,r.error):{body:{ok:!0,
source:"mobile-sales-delete-service",message:r.message||`Đã xóa đơn ${r.salesOrder?.code||""}`,mode:r.mode,hardDeleted:!0,salesOrder:r.salesOrder,order:r.salesOrder}}},
listSalesOrders:async function({query:e={},mobileUser:o}){
const r=t.toDateOnly(e.date||t.todayVN()),a="0"!==String(e.mine||"1"),s=String(e.q||"").trim(),{page:i,limit:d,skip:c}=k(e,{defaultLimit:30,maxLimit:100}),u=[j()];if(r&&u.push({
$or:[{date:r},{orderDate:r}]}),a){const e=H(o);if(!e)return{body:{ok:!0,source:"mobile-sales-paged",date:r,items:[],summary:{totalAmount:0,paidAmount:0,debtAmount:0,orderCount:0},
pagination:M({page:i,limit:d,totalRows:0})}};u.push(e)}if(s){const e=new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i");u.push({$or:[{code:e},{orderCode:e},{salesOrderCode:e
},{customerCode:e},{customerName:e},{customerPhone:e},{customerAddress:e}]})}const l=1===u.length?u[0]:{$and:u},m=e=>({$convert:{input:e,to:"double",onError:0,onNull:0}}),p=m({
$ifNull:["$totalAmount",{$ifNull:["$amount","$grandTotal"]}]}),g=m({$ifNull:["$paidAmount","$paymentAmount"]}),f=await n.aggregate([{$match:l},{$facet:{rows:[{$sort:{createdAt:-1,
orderDate:-1,date:-1,_id:-1}},{$skip:c},{$limit:d},{$project:{id:1,code:1,date:1,orderDate:1,customerId:1,customerCode:1,customerName:1,customerPhone:1,customerAddress:1,
salesStaffCode:1,salesStaffName:1,salesPersonCode:1,salesPersonName:1,salesmanCode:1,salesmanName:1,nvbhCode:1,nvbhName:1,maNVBH:1,maNVBHName:1,totalAmount:1,amount:1,grandTotal:1,
paidAmount:1,paymentAmount:1,status:1,lifecycleStatus:1,deliveryStatus:1,accountingStatus:1,accountingConfirmed:1,arStatus:1,deleted:1,isDeleted:1,deletedAt:1,deleteMode:1,
deleteReason:1,masterOrderId:1,masterOrderCode:1,masterOrderNo:1,mergeStatus:1,stockPosted:1,stockPostedAt:1,items:1,note:1,createdAt:1,updatedAt:1,version:1}}],totals:[{$group:{
_id:null,orderCount:{$sum:1},totalAmount:{$sum:p},paidAmount:{$sum:g},debtAmount:{$sum:0}}}]}
}]).allowDiskUse(!0).exec(),h=f?.[0]||{},C=h.totals?.[0]||{},S=(h.rows||[]).filter(e=>b.isOrderVisibleInHistory(e)),A=Array.from(new Set(S.map(e=>String(e.customerCode||"").trim()).filter(Boolean))),[v,O]=await Promise.all([y.getCustomerDebtMap(A,{
status:"all"}),R(S)]),I=S.map(e=>{
const t=v.get(String(e.customerCode||"").trim())||y._internal.emptyCustomerDebt(e.customerCode||""),o=oe(e),r=O.get(e.id||e.code||String(e._id||"")),n={id:e.id||String(e._id||""),
code:e.code,date:e.date||e.orderDate,customerName:e.customerName,totalAmount:N(e.totalAmount??e.amount??e.grandTotal),
paidAmount:r?r.collectedAmount:N(e.paidAmount??e.paymentAmount),debtAmount:r?r.remainingDebt:0,currentDebtAmount:t.currentDebtAmount,customerDebtAmount:t.currentDebtAmount,
debtSource:r?r.source:t.debtSource,customerDebtSource:t.debtSource,status:e.status,lifecycleStatus:e.lifecycleStatus||e.status||"",deliveryStatus:e.deliveryStatus||"pending",
accountingStatus:e.accountingStatus||"",accountingConfirmed:!0===e.accountingConfirmed,deleted:Boolean(e.deleted),isDeleted:Boolean(e.isDeleted),deletedAt:e.deletedAt||"",
deleteMode:e.deleteMode||"",deleteReason:e.deleteReason||"",masterOrderId:e.masterOrderId||"",masterOrderCode:e.masterOrderCode||"",mergeStatus:e.mergeStatus||"unmerged",
canEdit:!o,editLockReason:o,stockPosted:!0===e.stockPosted,customerId:e.customerId,customerCode:e.customerCode,customerPhone:e.customerPhone,customerAddress:e.customerAddress,
salesStaffCode:e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH||"",
salesStaffName:e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName||"",salesPersonCode:e.salesPersonCode||"",salesPersonName:e.salesPersonName||"",
salesmanCode:e.salesmanCode||"",salesmanName:e.salesmanName||"",nvbhCode:e.nvbhCode||"",nvbhName:e.nvbhName||"",maNVBH:e.maNVBH||"",maNVBHName:e.maNVBHName||"",items:e.items||[],
note:e.note||"",createdAt:e.createdAt};return T(n,r)}),P=I.reduce((e,t)=>{const o=t.deliveryTracking?t.deliveryTracking.remainingDebt:t.debtAmount;return e+Number(o||0)},0);return{
body:{ok:!0,source:"mobile-sales-paged",date:r,items:I,summary:{totalAmount:N(C.totalAmount),paidAmount:N(C.paidAmount),debtAmount:P,
debtSource:"MOBILE_SALES_ORDER_TRACKING_DERIVED",orderCount:N(C.orderCount)},pagination:M({page:i,limit:d,totalRows:C.orderCount||0})}}},
listDebts:async function({query:e={},mobileUser:t}={}){const o={...e,collectorType:"sales",page:e.page||1,limit:e.limit||30,includePaid:e.includePaid||"0",
includePendingCollections:e.includePendingCollections??"1"};if("sales"===String(t?.role||"")){const e=z(t),r=F(t);e?o.salesStaffCode=e:r&&(o.salesStaffName=r)}return{
body:await S.getMobileCustomerDebts(o)}}}}module.exports={createMobileSalesService:pe};
