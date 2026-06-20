/* GENERATED FILE — edit services/printDataBuilder.legacy.source/part-01.jsfrag, services/printDataBuilder.legacy.source/part-02.jsfrag, services/printDataBuilder.legacy.source/part-03.jsfrag and run npm run build:source-bundles. */
const{calculateCartonUnit:o}=require("../src/utils/common.util"),{getCompanyProfile:e}=require("../src/config/company-profile.config"),{normalizePickingZone:t,pickingZoneFrom:r,legacyPrintGroupCode:n,pickingZoneLabel:a,PICKING_ZONES:i}=require("../src/utils/pickingZone.util"),{toNumber:s,formatMoney:u,formatDate:m,formatDateTime:d,numberToVietnameseWords:c}=require("./print/PrintFormatService")
;function p(e,t){const r=o(e,t);return{cases:r.cartons,units:r.units,display:r.display}}function f(...o){return o.find(o=>null!=o&&""!==o)??""}function l(...o){for(const e of o){
const o=s(e);if(o>0)return o}return 0}function y(o){return s(f(o.qty,o.quantity,o.soLuong,o.totalQty,o.totalQuantity))}function A(o){
return s(f(o.conversionRateAtOrder,o.packingQtyAtOrder,o.packingQty,o.conversionRate,o.unitsPerCase,o.qtyPerCase,o.packSize,o.product?.conversionRate,o.productSnapshot?.conversionRate,1))||1
}function C(o){return String(o||"").trim().toUpperCase()}function T(o){return String(o||"").trim().toUpperCase().replace(/\s+/g,"")}function P(o){
return String(o||"").trim().toUpperCase()}function h(o){return Math.round(s(o))}function g(o,e){const t=C(o.code).localeCompare(C(e.code),"vi",{numeric:!0});if(0!==t)return t
;const r=h(o.price)-h(e.price);return 0!==r?r:String(o.name||"").localeCompare(String(e.name||""),"vi",{sensitivity:"base",numeric:!0})}function x(o,e){
const t=String(o.name||o.productName||"").localeCompare(String(e.name||e.productName||""),"vi",{sensitivity:"base",numeric:!0});if(0!==t)return t
;const r=C(o.code||o.productCode).localeCompare(C(e.code||e.productCode),"vi",{numeric:!0});return 0!==r?r:h(o.price)-h(e.price)}function N(o){
return s(f(o.catalogSalePriceAtOrder,o.priceAfterTaxBeforePromotion,o.catalogSalePrice,o.product?.salePrice,o.productSnapshot?.salePrice,o.salePrice,o.giaBan,o.price,o.unitPrice,0))
}function S(o){return N(o)}function v(o){return s(f(o.discountPercent,o.promotionDiscountPercent,o.ckPercent,o.percent,o.rate,o.promotion?.discountPercent,0))}function O(o){
return s(f(o.discount,o.discountAmount,o.ck,o.ckAmount,0))}function b(o){
return null==o?"":Array.isArray(o)?o.map(b).filter(Boolean).join("; "):"object"==typeof o?f(o.description,o.name,o.title,o.content,o.note,o.ruleName,o.programName,o.promotionName,o.dienGiai,o.noiDung):String(o||"").trim()
}function D(o={}){
const e=[],t=[o.promotions,o.promotionRows,o.promotionDetails,o.appliedPromotions,o.appliedPromotionRows,o.discountRows,o.discounts,o.productPromotions,o.productSnapshot?.promotions,o.productSnapshot?.promotionRows,o.product?.promotions,o.product?.promotionRows]
;for(const o of t)Array.isArray(o)&&e.push(...o)
;const r=[o.promotion,o.promotionInfo,o.promotionDetail,o.appliedPromotion,o.discountInfo,o.productSnapshot?.promotion,o.product?.promotion];for(const o of r)o&&e.push(o)
;const n=f(o.promotionDescription,o.promotionName,o.promotionText,o.promotionContent,o.promotionNote,o.promoDescription,o.promoName,o.dienGiaiKhuyenMai,o.noiDungKhuyenMai,o.productSnapshot?.promotionDescription,o.productSnapshot?.promotionName,o.productSnapshot?.promotionText,o.product?.promotionDescription,o.product?.promotionName,o.product?.promotionText),a=f(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM,o.productSnapshot?.promotionCode,o.product?.promotionCode)
;return e.length||!n&&!a||e.push({code:a,promotionCode:a,description:n,name:n,discountPercent:o.discountPercent,percent:o.discountPercent,discountBeforeTax:o.discountBeforeTax,
beforeTax:o.discountBeforeTax,discountAfterTax:o.discountAfterTax||o.discount||o.discountAmount,afterTax:o.discountAfterTax||o.discount||o.discountAmount}),e}function B(o={},e={}){
const t=D(o),r=f(e.productCode,e.code,o.productCode,o.code,o.sku,o.maHang),n=f(e.productName,e.name,o.productName,o.name,o.tenHang),a=e.isPromo?"KM":"Bán",i=s(f(e.qty,e.quantity,o.qty,o.quantity,o.totalQty)),u=s(f(e.gsvAmount,e.lineAmount,e.amount,o.gsvAmount,o.amount)),m=Math.round(u/1.08),d=s(f(e.discountPercent,o.discountPercent,o.percent,o.rate)),c=s(f(o.discountAfterTax,o.afterTax,o.discountAmount,o.discount,e.discount,0)),p=s(f(o.discountBeforeTax,o.beforeTax,c?Math.round(c/1.08):0))
;!t.length&&(d>0||c>0||e.isPromo)&&t.push({code:f(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM),
description:e.isPromo?`Hàng khuyến mại theo dòng ${r} - ${n}`:`Chiết khấu/khuyến mại theo dòng ${r} - ${n}`,discountPercent:d,discountBeforeTax:p,discountAfterTax:c})
;const l=t.map(o=>{
const t=f(o.promotionCode,o.code,o.ctkmCode,o.maCTKM,o.programCode),u=b(o)||(e.isPromo?`Hàng khuyến mại theo dòng ${r} - ${n}`:`Khuyến mại theo dòng ${r} - ${n}`);return{
productCode:r,productName:n,lineType:a,quantity:i,promotionCode:t,code:t,description:u,name:u,qualifiedAmount:m,basisAmount:m,
discountPercent:s(f(o.discountPercent,o.percent,o.tyLe,o.rate,d)),percent:s(f(o.discountPercent,o.percent,o.tyLe,o.rate,d)),
discountBeforeTax:s(f(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue,p)),beforeTax:s(f(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue,p)),
discountAfterTax:s(f(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount,c)),
afterTax:s(f(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount,c))}}),y=new Set;return l.filter(o=>{
const e=[o.productCode,o.lineType,o.promotionCode,o.description,o.discountAfterTax,o.discountPercent].join("|");return!y.has(e)&&(y.add(e),
o.description||o.promotionCode||o.discountAfterTax||o.discountPercent)})}function R(o=[]){const e=[];for(const t of o){const o=Array.isArray(t.promotionRows)?t.promotionRows:[]
;for(const r of o)e.push({productCode:t.productCode||r.productCode,productName:t.productName||r.productName,lineType:t.isPromotionGift||t.isPromo?"KM":r.lineType||"Bán",
quantity:t.quantity||r.quantity,promotionCode:r.promotionCode||r.code||t.promotionCode||"",code:r.promotionCode||r.code||t.promotionCode||"",description:r.description||r.name||"",
qualifiedAmount:s(r.qualifiedAmount||r.basisAmount),basisAmount:s(r.qualifiedAmount||r.basisAmount),discountPercent:s(r.discountPercent||r.percent),
percent:s(r.discountPercent||r.percent),discountBeforeTax:s(r.discountBeforeTax||r.beforeTax),beforeTax:s(r.discountBeforeTax||r.beforeTax),
discountAfterTax:s(r.discountAfterTax||r.afterTax),afterTax:s(r.discountAfterTax||r.afterTax)})}return M(e)}function M(o=[]){const e=new Map;for(const t of o){
const o=[t.productCode||"",t.lineType||"",t.promotionCode||t.code||"",t.description||t.name||"",t.discountPercent||0].join("|"),r=e.get(o)
;r?(r.qualifiedAmount=s(r.qualifiedAmount)+s(t.qualifiedAmount),r.basisAmount=r.qualifiedAmount,r.discountBeforeTax=s(r.discountBeforeTax)+s(t.discountBeforeTax),
r.beforeTax=r.discountBeforeTax,r.discountAfterTax=s(r.discountAfterTax)+s(t.discountAfterTax),r.afterTax=r.discountAfterTax,r.quantity=s(r.quantity)+s(t.quantity)):e.set(o,{...t})
}return Array.from(e.values())}function q(o){return s(f(o.tax,o.vat,o.taxAmount,o.vatAmount,0))}function H(o,e,u=null){
const m=t(r(o),i.HC),d=n(m),c=a(m),l=y(o),C=A(o),T=N(o),P=s(f(o.preTaxPriceAtOrder,o.priceBeforeTaxBeforePromotion,o.listPriceBeforeVat,o.priceBeforeTax,o.priceBeforeVat,Math.round(T/1.08))),h=v(o),g=s(f(o.priceAfterTaxAfterPromotion,o.priceAfterPromotion,o.priceAfterVatAfterDiscount,o.netPrice,o.priceAfterDiscount,o.finalPrice,o.orderPrice,o.manualPrice,0)),x=h>0?Math.floor(T*(1-h/100)):g||T,S=O(o),b=String(f(o.lineType,o.type,o.kind,o.itemType,o.isPromo?"PROMO":"SALE")||"SALE").toUpperCase(),D="PROMO"===b||"PROMOTION"===b||"KM"===b||!0===o.isPromo,R=D?"PROMO":"RETURN"===b?"RETURN":"IMPORT"===b?"IMPORT":"SALE",M="PROMO"===R?"Xuất khuyến mại":"RETURN"===R?"Hàng trả nhập kho":"IMPORT"===R?"Hàng nhập kho":"Hàng bán",q=D?0:Math.round((x-x/1.08)*l),H=D?0:s(f(o.vatAmountAtOrder,o.vatAmount,o.taxAmount,o.tax,q)),k=D?0:Math.round(x*l),w=D?0:s(f(o.lineAmountAtOrder,o.lineAmount,o.amount,k)),I=p(l,C),Q=B(o,{
code:f(o.code,o.productCode,o.sku,o.maHang),productCode:f(o.productCode,o.code,o.sku,o.maHang),name:f(o.name,o.productName,o.tenHang,o.productSnapshot?.name,o.product?.name),
productName:f(o.productName,o.name,o.tenHang,o.productSnapshot?.name,o.product?.name),qty:l,quantity:l,gsvAmount:Math.round(l*T),amount:w,discount:S,discountPercent:h,isPromo:D})
;return{stt:e+1,code:f(o.code,o.productCode,o.sku,o.maHang),productCode:f(o.productCode,o.code,o.sku,o.maHang),
name:f(o.name,o.productName,o.tenHang,o.productSnapshot?.name,o.product?.name),productName:f(o.productName,o.name,o.tenHang,o.productSnapshot?.name,o.product?.name),
unit:f(o.unit,o.dvt,o.uom,o.productSnapshot?.unit,o.product?.unit,"Cái"),pack:C,conversionRate:C,qty:l,quantity:l,cartonQty:I.cases,caseQty:I.cases,unitQty:I.units,
caseDisplay:`${I.cases}/${I.units}`,price:T,salePrice:T,catalogSalePrice:T,priceBeforeTax:P,priceBeforeVat:P,listPriceBeforeVat:P,priceAfterTaxBeforePromotion:T,
priceAfterVatBeforeDiscount:T,listPriceAfterVat:T,discountPercent:h,priceAfterPromotion:x,priceAfterDiscount:x,priceAfterVatAfterDiscount:x,gsvAmount:Math.round(l*T),nivAmount:w,
discount:S,tax:H,vatAmount:H,amount:w,lineAmount:w,lineType:R,isPromo:D,lineTypeName:M,note:o.note||"",sourceOrderCode:u?f(u.code,u.orderCode,u.id):"",pickingZone:m,
warehouseCode:d,warehouseName:c,sourceOrderCodes:Array.isArray(o.sourceOrderCodes)?o.sourceOrderCodes:[],
promotionCode:f(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM,Q[0]?.promotionCode),
promotionDescription:f(o.promotionDescription,o.promotionName,o.promotionText,Q[0]?.description),promotionRows:Q}}function k(o){
const e=Array.isArray(o.items)?o.items:[],t=Array.isArray(o.lines)?o.lines:[],r=e.length?e:t;if(r.length)return r.map((o,e)=>H(o,e))
;const n=Array.isArray(o.children)?o.children:[],a=[];return n.forEach(o=>{(Array.isArray(o.items)?o.items:[]).forEach(e=>a.push({item:e,child:o}))}),
a.map((o,e)=>H(o.item,e,o.child))}function w(o){
return(Array.isArray(o.promotions)?o.promotions:Array.isArray(o.promotionRows)?o.promotionRows:Array.isArray(o.discounts)?o.discounts:[]).map((o,e)=>{
const t=f(o.code,o.promotionCode,o.ctkmCode,o.maCTKM),r=f(o.description,o.name,o.title,o.promotionName,o.tenCTKM),n=s(f(o.qualifiedAmount,o.basisAmount,o.baseAmount,o.giaTriHangHoa,o.amount)),a=s(f(o.discountPercent,o.percent,o.tyLe,o.rate)),i=s(f(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue)),u=s(f(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount))
;return{stt:e+1,code:t,promotionCode:t,name:r,description:r,basisAmount:n,qualifiedAmount:n,percent:a,discountPercent:a,beforeTax:i,discountBeforeTax:i,afterTax:u,
discountAfterTax:u,type:f(o.type,o.kind,o.loai)}})}function I(o){
return(Array.isArray(o.offsets)?o.offsets:Array.isArray(o.displayRewards)?o.displayRewards:Array.isArray(o.rewardRows)?o.rewardRows:Array.isArray(o.displayRewardRows)?o.displayRewardRows:Array.isArray(o.deductions)?o.deductions:Array.isArray(o.offsetRows)?o.offsetRows:[]).map((o,e)=>{
const t=f(o.programCode,o.code,o.rewardCode,o.displayCode,o.cttbCode,o.maCTTrungBay,o.maCT),r=f(o.description,o.name,o.title,o.programName,o.noiDung,o.content),n=f(o.month,o.displayMonth,o.thangTrungBay),a=s(f(o.offsetAmount,o.cashAmount,o.debtOffsetAmount,o.canTruNo,o.amount))
;return{stt:e+1,code:t,programCode:t,name:r,description:r,month:n,goodsAmount:s(f(o.goodsAmount,o.goodsRewardAmount,o.hangHoa,o.chiTraHangHoa)),
quantityText:f(o.quantityText,o.caseUnitText,o.cartonUnitText,o.soLuongThungLe),offsetAmount:a}})}function Q(o=[],e={}){const t=new Map,r=new Map;for(const e of o){
const o=String(e.warehouseCode||"KHO_HC").trim()||"KHO_HC",n=String(e.warehouseName||("KHO_PC"===o?"KHO PC":"KHO HC")).trim();t.has(o)||(t.set(o,{code:o,name:n,items:[],
saleItems:[],promoItems:[],returnItems:[],importItems:[],totalQty:0,saleQty:0,promoQty:0,totalAmount:0}),r.set(o,new Map))
;const a=t.get(o),i=r.get(o),u=e.isPromo||"PROMO"===e.lineType?"PROMO":"SALE",m=C(f(e.code,e.productCode)),d=T(e.pack),c=P(e.unit),l="PROMO"===u?0:h(e.price)
;"1"===process.env.PRINT_DEBUG_MERGE&&console.log("[printDataBuilder.buildWarehouseGroups] source item",{code:e.code,name:e.name,unit:e.unit,pack:e.pack,price:e.price,
normalizedCode:m,normalizedUnit:c,normalizedPack:d,normalizedPrice:l});const y=[o,u,m,l].join("|");let A=i.get(y);A||(A={...e,code:m||e.code,productCode:m||e.productCode||e.code,
unit:e.unit||c,pack:s(e.pack)||s(d)||1,price:l,salePrice:l,__mergeKey:y,qty:0,amount:0,sourceOrderCodes:[]},i.set(y,A),a.items.push(A),
"PROMO"===u?a.promoItems.push(A):"RETURN"===u?a.returnItems.push(A):"IMPORT"===u?a.importItems.push(A):a.saleItems.push(A)),A.qty+=s(e.qty),A.quantity=A.qty,A.amount+=s(e.amount),
A.lineAmount=A.amount;const g=p(A.qty,A.pack);A.caseQty=g.cases,A.cartonQty=g.cases,A.unitQty=g.units,A.caseDisplay=g.display,
e.sourceOrderCode&&!A.sourceOrderCodes.includes(e.sourceOrderCode)&&A.sourceOrderCodes.push(e.sourceOrderCode)
;for(const o of e.sourceOrderCodes||[])o&&!A.sourceOrderCodes.includes(o)&&A.sourceOrderCodes.push(o);a.totalQty+=s(e.qty),"PROMO"===u?a.promoQty+=s(e.qty):a.saleQty+=s(e.qty),
a.totalAmount+=s(e.amount)}const n=e.sortByProductName?x:g;for(const o of t.values())o.saleItems.sort(n),o.promoItems.sort(n),o.returnItems.sort(n),o.importItems.sort(n),
o.items=[...o.saleItems,...o.promoItems,...o.returnItems,...o.importItems],o.items.forEach((o,e)=>{o.stt=e+1,delete o.__mergeKey});const a=["KHO_HC","KHO_PC"]
;return Array.from(t.values()).sort((o,e)=>{const t=a.indexOf(o.code),r=a.indexOf(e.code);return-1!==t||-1!==r?(-1===t?99:t)-(-1===r?99:r):o.name.localeCompare(e.name,"vi")})}
function K(o){const[e,t]=String(o||"0/0").split("/");return{cartonQty:s(e),csSuUnitQty:s(t)}}function V(o,e){
const t=K(o.csSu||o.quantityCsSu||o.caseDisplay),r=s(f(o.quantity,o.qty,o.totalQty,o.csSuUnitQty,o.unitQty)),n=Math.max(1,s(f(o.conversionRate,o.pack,o.packingQty,o.unitsPerCase,o.qtyPerCase,1))||1),a=l(o.priceAfterTaxBeforePromotion,o.priceAfterVatBeforeDiscount,o.listPriceAfterVat,o.catalogSalePriceAtOrder,o.salePrice,o.price,o.unitPrice),i=l(o.preTaxPriceAtOrder,o.priceBeforeTaxBeforePromotion,o.priceBeforeTax,o.priceBeforeVat,o.listPriceBeforeVat,Math.round(a/1.08)),u=s(o.discountPercent),m=l(o.priceAfterTaxAfterPromotion,o.finalPriceAtOrder,o.finalPrice,o.priceAfterPromotion,o.priceAfterVatAfterDiscount,o.priceAfterDiscount,u>0?Math.round(a*(1-u/100)):a),d=l(o.lineAmountAtOrder,o.lineAmount,o.amount,Math.round(r*m)),c=Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType)?0:l(o.vatAmountAtOrder,o.vatAmount,o.tax,o.taxAmount,d>0?Math.round(d-d/1.08):0,Math.round((m-m/1.08)*r))
;return{lineNo:o.lineNo||o.stt||e+1,productCode:String(f(o.productCode,o.code,o.sku,o.maHang)).trim(),productName:String(f(o.productName,o.name,o.tenHang)).trim(),conversionRate:n,
quantityCsSu:o.csSu||o.quantityCsSu||o.caseDisplay||`${t.cartonQty}/${t.csSuUnitQty}`,cartonQty:s(f(o.cartonQty,o.caseQty,t.cartonQty)),
unitQtyFromCsSu:s(f(o.unitQtyFromCsSu,o.unitQty,t.csSuUnitQty)),unitQty:s(f(o.unitQty,t.csSuUnitQty)),csSuUnitQty:s(f(o.csSuUnitQty,o.unitQty,t.csSuUnitQty)),quantity:r,
priceBeforeTaxBeforePromotion:i,priceBeforeTax:i,priceAfterTaxBeforePromotion:a,catalogSalePrice:a,priceAfterTaxAfterPromotion:m,priceAfterPromotion:m,discountPercent:u,
vatAmount:c,lineAmount:d,isPromotionGift:Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType),promotionCode:o.promotionCode||"",
promotionRows:Array.isArray(o.promotionRows)?o.promotionRows:B(o,{productCode:String(f(o.productCode,o.code,o.sku,o.maHang)).trim(),
productName:String(f(o.productName,o.name,o.tenHang)).trim(),quantity:r,qty:r,gsvAmount:r*a,lineAmount:d,discountPercent:u,
isPromo:Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType)})}}function U(o={}){return{productCode:String(o.productCode||o.maHang||"").trim(),
productName:String(o.productName||o.tenHang||"").trim(),lineType:o.lineType||o.type||"",quantity:s(o.quantity||o.qty),promotionCode:String(o.promotionCode||o.code||"").trim(),
code:String(o.promotionCode||o.code||"").trim(),description:String(o.description||o.name||"").trim(),qualifiedAmount:s(o.qualifiedAmount||o.basisAmount),
basisAmount:s(o.qualifiedAmount||o.basisAmount),discountPercent:s(o.discountPercent||o.percent),percent:s(o.discountPercent||o.percent),
discountBeforeTax:s(o.discountBeforeTax||o.beforeTax),beforeTax:s(o.discountBeforeTax||o.beforeTax),discountAfterTax:s(o.discountAfterTax||o.afterTax),
afterTax:s(o.discountAfterTax||o.afterTax)}}function E(o={}){return{programCode:String(o.programCode||o.code||"").trim(),description:String(o.description||o.name||"").trim(),
displayMonth:o.displayMonth||o.month||"",month:o.month||o.displayMonth||"",goodsAmount:s(o.goodsAmount),quantityText:o.quantityText||o.quantity||"",offsetAmount:s(o.offsetAmount)}}
function _(o={}){
const e=Array.isArray(o.items)?o.items:[],t=Array.isArray(o.promotions)?o.promotions:[],r=Array.isArray(o.offsets)?o.offsets:[],n=e.reduce((o,e)=>o+s(e.quantity),0),a=e.reduce((o,e)=>o+s(e.lineAmount),0),i=e.reduce((o,e)=>o+s(e.quantity)*s(e.priceAfterTaxBeforePromotion),0),u=e.reduce((o,e)=>o+s(e.vatAmount),0),m=void 0!==o.totalPromotionAmount?s(o.totalPromotionAmount):t.reduce((o,e)=>o+s(e.discountAfterTax),0),d=void 0!==o.totalOffsetAmount?s(o.totalOffsetAmount):r.reduce((o,e)=>o+s(e.offsetAmount),0),c=s(o.nppDiscountAmount||o.summary?.nppDiscountAmount)
;return{totalQty:n,totalVatAmount:u,goodsAmountAfterPromotion:a,grossAmountBeforePromotion:i,totalPromotionAmount:m,promotionAmount:m,totalOffsetAmount:d,displayRewardOffset:d,
nppDiscountAmount:c,payableAmount:void 0!==o.payableAmount?s(o.payableAmount):a-d-c,promotionRate:i>0?Number(((m+c)/i*100).toFixed(2)):0}}function L(o={}){
const e=Array.isArray(o.items)?o.items:[],t=Array.isArray(o.promotions)?o.promotions:[],r=Array.isArray(o.offsets)?o.offsets:[],n=t.length+r.length,a=Math.max(1,Math.ceil(e.length/24)),i=n>4||e.length>18||r.length>0,s=n>0&&i?1:0
;return{pagesPerCopy:a+s,copies:["Liên 1","Liên 2"],showPromotionHeaderOnFirstPage:s>0,itemPageSize:24,itemPageCount:a,detailRows:n,firstPageItems:e.slice(0,24),
detailPagePromotions:t,detailPageOffsets:r}}function $(o={}){
const e=[],t=[["header.invoiceCode",o.header?.invoiceCode],["header.orderCode",o.header?.orderCode],["customer.customerCode",o.customer?.customerCode],["customer.customerName",o.customer?.customerName],["salesStaff.staffCode",o.salesStaff?.staffCode],["items",Array.isArray(o.items)&&o.items.length]]
;for(const[o,r]of t)r||e.push(`Thiếu ${o}`)
;const r=_(o),n=o.summary||{},a=[["totalQty",n.totalQty,r.totalQty],["goodsAmountAfterPromotion",n.goodsAmountAfterPromotion,r.goodsAmountAfterPromotion],["grossAmountBeforePromotion",n.grossAmountBeforePromotion,r.grossAmountBeforePromotion],["payableAmount",n.payableAmount,r.payableAmount]]
;for(const[o,t,r]of a)Math.abs(s(t)-s(r))>1&&e.push(`${o} lệch: ${t} != ${r}`);return{ok:0===e.length,errors:e}}function G(o={}){
const e=Array.isArray(o.items)?o.items.map(V):[],t=Array.isArray(o.promotions)?o.promotions.map(U):[],r=R(e),n=r.length?r:t,a=Array.isArray(o.offsets)?o.offsets.map(E):[],i={
documentType:"DELIVERY_PAYMENT_INVOICE",title:"PHIẾU GIAO NHẬN VÀ THANH TOÁN",header:{invoiceCode:o.invoiceCode||o.header?.invoiceCode||"",
orderCode:o.orderCode||o.header?.orderCode||"",orderDateTime:o.orderDateTime||o.header?.orderDateTime||"",invoiceType:o.invoiceType||o.header?.invoiceType||"Từ NVTT",
paymentTerm:o.paymentTerm||o.header?.paymentTerm||"đáo hạn trong 7 ngày",truckNo:o.truckNo||o.header?.truckNo||"",taxCode:o.taxCode||o.header?.taxCode||""},distributor:{
code:o.distributorCode||o.distributor?.code||"",name:o.distributorName||o.distributor?.name||"",phone:o.distributorPhone||o.distributor?.phone||"",
address:o.distributorAddress||o.distributor?.address||""},customer:{customerCode:o.customerCode||o.customer?.customerCode||o.customer?.code||"",
customerName:o.customerName||o.customer?.customerName||o.customer?.name||"",phone:o.customerPhone||o.customer?.phone||"",
deliveryAddress:o.deliveryAddress||o.customer?.deliveryAddress||o.customer?.address||""},salesStaff:{staffCode:o.salesStaffCode||o.salesStaff?.staffCode||o.salesStaff?.code||"",
staffName:o.salesStaffName||o.salesStaff?.staffName||o.salesStaff?.name||"",phone:o.salesStaffPhone||o.salesStaff?.phone||""},items:e,promotions:n,offsets:a,summary:{
amountInWords:o.amountInWords||o.summary?.amountInWords||"",nppDiscountAmount:s(o.nppDiscountAmount||o.summary?.nppDiscountAmount)}};return i.summary={...i.summary,..._({...i,
totalPromotionAmount:o.totalPromotionAmount,totalOffsetAmount:o.totalOffsetAmount,nppDiscountAmount:o.nppDiscountAmount,payableAmount:o.payableAmount})},i.pagination=L(i),
i.validation=$(i),i}function W(o={},t={}){const r=e(),n=k(o),a=w(o),i=I(o),p=Q(n,{sortByProductName:"PRODUCT_NAME_ASC"===o.itemSort||String(o.printMode||"").startsWith("MASTER_")
}),l=s(f(o.totalQuantity,o.totalQty,o.summary?.totalQty,n.reduce((o,e)=>o+e.qty,0))),y=s(f(o.grossAmountBeforePromotion,o.totalGrossAmount,o.grossAmount,o.summary?.grossAmountBeforePromotion,o.goodsAmount,o.subTotal,o.subtotal,n.reduce((o,e)=>o+e.gsvAmount,0))),A=s(f(o.goodsAmountAfterPromotion,o.netAmount,o.summary?.goodsAmountAfterPromotion,o.totalAmount,o.grandTotal,n.reduce((o,e)=>o+e.amount,0))),C=s(f(o.promotionValue,o.totalPromotionValue,o.totalPromotionAmount,o.totalDiscountAmount,o.promotionAmount,o.discountAmount,o.summary?.promotionAmount,a.reduce((o,e)=>o+(e.afterTax||e.beforeTax||0),0))),T=s(f(o.displayRewardTotal,o.totalDisplayReward,o.rewardAmount,o.offsetAmount,o.summary?.displayRewardOffset,i.reduce((o,e)=>o+e.offsetAmount,0))),P=s(f(o.nppDiscountAmount,o.summary?.nppDiscountAmount,0)),h=s(f(o.discount,o.discountAmount,o.totalDiscount,C)),g=s(f(o.tax,o.vat,o.taxAmount,n.reduce((o,e)=>o+e.tax,0))),x=A,N=y,S=s(f(o.paidAmount,o.paid,o.collectedAmount,o.cashReceived)),v=s(f(o.payableAmount,o.mustPay,o.summary?.payableAmount,x-T)),O=s(f(o.debtAmount,o.debt,Math.max(v-S,0))),b=s(f(o.promotionRate,o.summary?.promotionRate,N?(C+P)/N*100:0)),D=G({
...o,invoiceCode:f(o.invoiceCode,o.invoiceNo,o.soHoaDon,o.documentCode,o.code),orderCode:f(o.customerOrderCode,o.soDonHang,o.orderCode,o.documentCode,o.code),
orderDateTime:d(f(o.orderDateTime,o.orderDate,o.documentDate,o.date,o.createdAt)),invoiceType:f(o.invoiceType,o.invoiceTypeName,o.orderSourceName,"Từ NVTT"),
paymentTerm:f(o.terms,o.paymentTerms,o.paymentTerm,"đáo hạn trong 7 ngày"),truckNo:f(o.vehicleNo,o.truckNo,o.soXeTai),taxCode:f(o.customerTaxCode,o.customer?.taxCode,o.mst),
distributor:{code:f(o.distributor?.code,t.companyCode,r.code),name:f(o.distributor?.name,t.companyName,r.name),address:f(o.distributor?.address,t.companyAddress,r.address),
phone:f(o.distributor?.phone,t.companyPhone,r.phone)},customer:{customerCode:f(o.customerCode,o.customer?.code,o.customerId),
customerName:f(o.customerName,o.customer?.name,o.supplier,o.supplierName),deliveryAddress:f(o.customerAddress,o.customer?.address,o.address),
phone:f(o.customerPhone,o.customer?.phone,o.phone),taxCode:f(o.customerTaxCode,o.customer?.taxCode,o.mst)},salesStaff:{
staffCode:f(o.salesStaffCode,o.salesPersonCode,o.salesmanCode,o.nvbhCode,o.maNVBH,o.salesCode,o.salesStaffId),
staffName:f(o.salesStaffName,o.salesPersonName,o.salesmanName,o.nvbhName,o.maNVBHName,o.salesName,o.createdBy),phone:f(o.staffPhone,o.salesStaffPhone,o.salesPhone)},items:n,
promotions:a,offsets:i,totalPromotionAmount:C,totalOffsetAmount:T,nppDiscountAmount:P,payableAmount:v,
amountInWords:f(o.amountInWords,o.summary?.amountInWords,o.totalAmountText)||c(v||x)});return{company:{code:f(o.distributor?.code,t.companyCode,r.code),
name:f(o.distributor?.name,t.companyName,r.name),address:f(o.distributor?.address,t.companyAddress,r.address),phone:f(o.distributor?.phone,t.companyPhone,r.phone),
taxCode:t.taxCode||r.taxCode},document:{id:o.id||o._id||"",code:f(o.code,o.orderCode,o.refCode,o.id,o._id),
invoiceCode:f(o.invoiceCode,o.invoiceNo,o.soHoaDon,o.documentCode,o.code),customerOrderCode:f(o.customerOrderCode,o.soDonHang,o.orderCode,o.documentCode,o.code),
date:m(f(o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt)),
dateTime:d(f(o.orderDateTime,o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt)),
rawDate:f(o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt),type:f(o.invoiceType,o.type,o.orderType,o.orderSourceName,"NVTT"),note:o.note||"",
terms:f(o.terms,o.paymentTerms,"đáo hạn trong 7 ngày"),page:t.page||"1 / 1",vehicleNo:f(o.vehicleNo,o.truckNo,o.soXeTai),printMode:o.printMode||"",
title:o.printContract?.document?.title||o.printTitle||"",sourceCodes:Array.isArray(o.sourceCodes)?o.sourceCodes:o.printContract?.document?.sourceCodes||[],
masterOrderCodes:Array.isArray(o.masterOrderCodes)?o.masterOrderCodes:[],selectedMasterOrderCount:o.selectedMasterOrderCount||0},customer:{
code:f(o.customerCode,o.customer?.code,o.customerId),name:f(o.customerName,o.customer?.name,o.supplier,o.supplierName),address:f(o.customerAddress,o.customer?.address,o.address),
phone:f(o.customerPhone,o.customer?.phone,o.phone),taxCode:f(o.customerTaxCode,o.customer?.taxCode,o.mst)},staff:{
code:f(o.salesStaffCode,o.salesPersonCode,o.salesmanCode,o.nvbhCode,o.maNVBH,o.salesCode,o.salesStaffId),
name:f(o.salesStaffName,o.salesPersonName,o.salesmanName,o.nvbhName,o.maNVBHName,o.salesName,o.createdBy),phone:f(o.staffPhone,o.salesStaffPhone,o.salesPhone)},delivery:{
code:f(o.deliveryStaffCode,o.deliveryCode),name:f(o.deliveryStaffName,o.deliveryName),phone:f(o.deliveryPhone,o.deliveryStaffPhone),route:f(o.route,o.routeName,o.tuyen)},items:n,
promotions:a,displayRewards:i,warehouseGroups:p,masterKpis:Array.isArray(o.masterKpis)?o.masterKpis:[],masterKpiTotals:o.masterKpiTotals||{},totals:{totalQty:l,goodsAmount:N,
totalAmount:x,goodsAmountAfterPromotion:A,grossAmountBeforePromotion:y,promotionAmount:C,displayRewardOffset:T,nppDiscountAmount:P,promotionRate:b,discount:h,tax:g,paid:S,
payable:v,debt:O,orderCount:s(f(o.orderCount,o.totalOrders,Array.isArray(o.children)?o.children.length:0)),promotionValue:C,displayRewardTotal:T,
totalAmountText:f(o.amountInWords,o.summary?.amountInWords,o.totalAmountText)||c(v||x)},meta:{printedAt:(new Date).toLocaleString("vi-VN"),printedBy:t.printedBy||"",
copyLabel:t.copyLabel||"Liên 1"},erpInvoiceV46:D,printContract:o.printContract||null,printProfile:o.printProfile||o.printContract?.profile||"",formatMoney:u}}module.exports={
buildPrintData:W,buildDeliveryInvoicePayload:G,calculateDeliveryInvoiceSummary:_,paginateDeliveryInvoice:L,validateAgainstDmsSample:$,formatMoney:u,formatDate:m,formatDateTime:d,
numberToVietnameseWords:c};
