/* GENERATED FILE — edit services/printDataBuilder.legacy.source/part-01.jsfrag, services/printDataBuilder.legacy.source/part-02.jsfrag, services/printDataBuilder.legacy.source/part-03.jsfrag and run npm run build:source-bundles. */
const{calculateCartonUnit:o}=require("../src/utils/common.util"),{getCompanyProfile:t}=require("../src/config/company-profile.config"),{normalizePickingZone:e,pickingZoneFrom:r,legacyPrintGroupCode:n,pickingZoneLabel:a,PICKING_ZONES:i}=require("../src/utils/pickingZone.util"),{toNumber:s,formatMoney:u,formatDate:m,formatDateTime:d,numberToVietnameseWords:c}=require("./print/PrintFormatService")
;function p(t,e){const r=o(t,e);return{cases:r.cartons,units:r.units,display:r.display}}function f(...o){return o.find(o=>null!=o&&""!==o)??""}function A(...o){for(const t of o){
const o=s(t);if(o>0)return o}return 0}function l(o){return s(f(o.qty,o.quantity,o.soLuong,o.totalQty,o.totalQuantity))}function y(o){
return s(f(o.conversionRateAtOrder,o.packingQtyAtOrder,o.packingQty,o.conversionRate,o.unitsPerCase,o.qtyPerCase,o.packSize,o.product?.conversionRate,o.productSnapshot?.conversionRate,1))||1
}function T(o){return String(o||"").trim().toUpperCase()}function C(o){return String(o||"").trim().toUpperCase().replace(/\s+/g,"")}function P(o){
return String(o||"").trim().toUpperCase()}function h(o){return Math.round(s(o))}function g(o,t){const e=T(o.code).localeCompare(T(t.code),"vi",{numeric:!0});if(0!==e)return e
;const r=h(o.price)-h(t.price);return 0!==r?r:String(o.name||"").localeCompare(String(t.name||""),"vi",{sensitivity:"base",numeric:!0})}function x(o,t){
const e=String(o.name||o.productName||"").localeCompare(String(t.name||t.productName||""),"vi",{sensitivity:"base",numeric:!0});if(0!==e)return e
;const r=T(o.code||o.productCode).localeCompare(T(t.code||t.productCode),"vi",{numeric:!0});return 0!==r?r:h(o.price)-h(t.price)}function N(o){
return s(f(o.catalogSalePriceAtOrder,o.priceAfterTaxBeforePromotion,o.catalogSalePrice,o.product?.salePrice,o.productSnapshot?.salePrice,o.salePrice,o.giaBan,o.price,o.unitPrice,0))
}function S(o){return N(o)}function O(o){return s(f(o.discountPercent,o.promotionDiscountPercent,o.ckPercent,o.percent,o.rate,o.promotion?.discountPercent,0))}function v(o){
return s(f(o.discount,o.discountAmount,o.ck,o.ckAmount,0))}function b(o){
return null==o?"":Array.isArray(o)?o.map(b).filter(Boolean).join("; "):"object"==typeof o?f(o.description,o.name,o.title,o.content,o.note,o.ruleName,o.programName,o.promotionName,o.dienGiai,o.noiDung):String(o||"").trim()
}function D(o={}){
const t=[],e=[o.promotions,o.promotionRows,o.promotionDetails,o.appliedPromotions,o.appliedPromotionRows,o.discountRows,o.discounts,o.productPromotions,o.productSnapshot?.promotions,o.productSnapshot?.promotionRows,o.product?.promotions,o.product?.promotionRows]
;for(const o of e)Array.isArray(o)&&t.push(...o)
;const r=[o.promotion,o.promotionInfo,o.promotionDetail,o.appliedPromotion,o.discountInfo,o.productSnapshot?.promotion,o.product?.promotion];for(const o of r)o&&t.push(o)
;const n=f(o.promotionDescription,o.promotionName,o.promotionText,o.promotionContent,o.promotionNote,o.promoDescription,o.promoName,o.dienGiaiKhuyenMai,o.noiDungKhuyenMai,o.productSnapshot?.promotionDescription,o.productSnapshot?.promotionName,o.productSnapshot?.promotionText,o.product?.promotionDescription,o.product?.promotionName,o.product?.promotionText),a=f(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM,o.productSnapshot?.promotionCode,o.product?.promotionCode)
;return t.length||!n&&!a||t.push({code:a,promotionCode:a,description:n,name:n,discountPercent:o.discountPercent,percent:o.discountPercent,discountBeforeTax:o.discountBeforeTax,
beforeTax:o.discountBeforeTax,discountAfterTax:o.discountAfterTax||o.discount||o.discountAmount,afterTax:o.discountAfterTax||o.discount||o.discountAmount}),t}function B(o={},t={}){
const e=D(o),r=f(t.productCode,t.code,o.productCode,o.code,o.sku,o.maHang),n=f(t.productName,t.name,o.productName,o.name,o.tenHang),a=t.isPromo?"KM":"Bán",i=s(f(t.qty,t.quantity,o.qty,o.quantity,o.totalQty)),u=s(f(t.gsvAmount,t.lineAmount,t.amount,o.gsvAmount,o.amount)),m=Math.round(u/1.08),d=s(f(t.discountPercent,o.discountPercent,o.percent,o.rate)),c=s(f(o.discountAfterTax,o.afterTax,o.discountAmount,o.discount,t.discount,0)),p=s(f(o.discountBeforeTax,o.beforeTax,c?Math.round(c/1.08):0))
;!e.length&&(d>0||c>0||t.isPromo)&&e.push({code:f(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM),
description:t.isPromo?`Hàng khuyến mại theo dòng ${r} - ${n}`:`Chiết khấu/khuyến mại theo dòng ${r} - ${n}`,discountPercent:d,discountBeforeTax:p,discountAfterTax:c})
;const A=e.map(o=>{
const e=f(o.promotionCode,o.code,o.ctkmCode,o.maCTKM,o.programCode),u=b(o)||(t.isPromo?`Hàng khuyến mại theo dòng ${r} - ${n}`:`Khuyến mại theo dòng ${r} - ${n}`);return{
productCode:r,productName:n,lineType:a,quantity:i,promotionCode:e,code:e,description:u,name:u,qualifiedAmount:m,basisAmount:m,
discountPercent:s(f(o.discountPercent,o.percent,o.tyLe,o.rate,d)),percent:s(f(o.discountPercent,o.percent,o.tyLe,o.rate,d)),
discountBeforeTax:s(f(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue,p)),beforeTax:s(f(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue,p)),
discountAfterTax:s(f(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount,c)),
afterTax:s(f(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount,c))}}),l=new Set;return A.filter(o=>{
const t=[o.productCode,o.lineType,o.promotionCode,o.description,o.discountAfterTax,o.discountPercent].join("|");return!l.has(t)&&(l.add(t),
o.description||o.promotionCode||o.discountAfterTax||o.discountPercent)})}function R(o=[]){const t=[];for(const e of o){const o=Array.isArray(e.promotionRows)?e.promotionRows:[]
;for(const r of o)t.push({productCode:e.productCode||r.productCode,productName:e.productName||r.productName,lineType:e.isPromotionGift||e.isPromo?"KM":r.lineType||"Bán",
quantity:e.quantity||r.quantity,promotionCode:r.promotionCode||r.code||e.promotionCode||"",code:r.promotionCode||r.code||e.promotionCode||"",description:r.description||r.name||"",
qualifiedAmount:s(r.qualifiedAmount||r.basisAmount),basisAmount:s(r.qualifiedAmount||r.basisAmount),discountPercent:s(r.discountPercent||r.percent),
percent:s(r.discountPercent||r.percent),discountBeforeTax:s(r.discountBeforeTax||r.beforeTax),beforeTax:s(r.discountBeforeTax||r.beforeTax),
discountAfterTax:s(r.discountAfterTax||r.afterTax),afterTax:s(r.discountAfterTax||r.afterTax)})}return M(t)}function M(o=[]){const t=new Map;for(const e of o){
const o=[e.productCode||"",e.lineType||"",e.promotionCode||e.code||"",e.description||e.name||"",e.discountPercent||0].join("|"),r=t.get(o)
;r?(r.qualifiedAmount=s(r.qualifiedAmount)+s(e.qualifiedAmount),r.basisAmount=r.qualifiedAmount,r.discountBeforeTax=s(r.discountBeforeTax)+s(e.discountBeforeTax),
r.beforeTax=r.discountBeforeTax,r.discountAfterTax=s(r.discountAfterTax)+s(e.discountAfterTax),r.afterTax=r.discountAfterTax,r.quantity=s(r.quantity)+s(e.quantity)):t.set(o,{...e})
}return Array.from(t.values())}function q(o){return s(f(o.tax,o.vat,o.taxAmount,o.vatAmount,0))}function k(o,t,u=null){
const m=e(r(o),i.HC),d=n(m),c=a(m),A=l(o),T=y(o),C=String(f(o.lineType,o.type,o.kind,o.itemType,o.isPromo?"PROMO":"SALE")||"SALE").toUpperCase(),P="PROMO"===C||"PROMOTION"===C||"KM"===C||!0===o.isPromo||!0===o.isPromotionItem,h=P?0:N(o),g=P?0:s(f(o.preTaxPriceAtOrder,o.priceBeforeTaxBeforePromotion,o.listPriceBeforeVat,o.priceBeforeTax,o.priceBeforeVat,Math.round(h/1.08))),x=P?0:O(o),S=P?0:s(f(o.priceAfterTaxAfterPromotion,o.priceAfterPromotion,o.priceAfterVatAfterDiscount,o.netPrice,o.priceAfterDiscount,o.finalPrice,o.orderPrice,o.manualPrice,0)),b=P?0:x>0?Math.floor(h*(1-x/100)):S||h,D=P?0:v(o),R=P?"PROMO":"RETURN"===C?"RETURN":"IMPORT"===C?"IMPORT":"SALE",M="PROMO"===R?"Xuất khuyến mại":"RETURN"===R?"Hàng trả nhập kho":"IMPORT"===R?"Hàng nhập kho":"Hàng bán",q=P?0:Math.round((b-b/1.08)*A),k=P?0:s(f(o.vatAmountAtOrder,o.vatAmount,o.taxAmount,o.tax,q)),I=P?0:Math.round(b*A),H=P?0:s(f(o.lineAmountAtOrder,o.lineAmount,o.amount,I)),w=p(A,T),Q=B(o,{
code:f(o.code,o.productCode,o.sku,o.maHang),productCode:f(o.productCode,o.code,o.sku,o.maHang),name:f(o.name,o.productName,o.tenHang,o.productSnapshot?.name,o.product?.name),
productName:f(o.productName,o.name,o.tenHang,o.productSnapshot?.name,o.product?.name),qty:A,quantity:A,gsvAmount:Math.round(A*h),amount:H,discount:D,discountPercent:x,isPromo:P})
;return{stt:t+1,code:f(o.code,o.productCode,o.sku,o.maHang),productCode:f(o.productCode,o.code,o.sku,o.maHang),
name:f(o.name,o.productName,o.tenHang,o.productSnapshot?.name,o.product?.name),productName:f(o.productName,o.name,o.tenHang,o.productSnapshot?.name,o.product?.name),
unit:f(o.unit,o.dvt,o.uom,o.productSnapshot?.unit,o.product?.unit,"Cái"),pack:T,conversionRate:T,qty:A,quantity:A,cartonQty:w.cases,caseQty:w.cases,unitQty:w.units,
caseDisplay:`${w.cases}/${w.units}`,price:h,salePrice:h,catalogSalePrice:h,priceBeforeTax:g,priceBeforeVat:g,listPriceBeforeVat:g,priceAfterTaxBeforePromotion:h,
priceAfterVatBeforeDiscount:h,listPriceAfterVat:h,discountPercent:x,priceAfterPromotion:b,priceAfterDiscount:b,priceAfterVatAfterDiscount:b,gsvAmount:Math.round(A*h),nivAmount:H,
discount:D,tax:k,vatAmount:k,amount:H,lineAmount:H,lineType:R,isPromo:P,isPromotionItem:P,lineTypeName:M,note:o.note||"",sourceOrderCode:u?f(u.code,u.orderCode,u.id):"",
pickingZone:m,warehouseCode:d,warehouseName:c,sourceOrderCodes:Array.isArray(o.sourceOrderCodes)?o.sourceOrderCodes:[],
promotionCode:f(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM,Q[0]?.promotionCode),
promotionDescription:f(o.promotionDescription,o.promotionName,o.promotionText,Q[0]?.description),promotionRows:Q}}function I(o){
const t=Array.isArray(o.items)?o.items:[],e=Array.isArray(o.lines)?o.lines:[],r=t.length?t:e;if(r.length)return r.map((o,t)=>k(o,t))
;const n=Array.isArray(o.children)?o.children:[],a=[];return n.forEach(o=>{(Array.isArray(o.items)?o.items:[]).forEach(t=>a.push({item:t,child:o}))}),
a.map((o,t)=>k(o.item,t,o.child))}function H(o){
return(Array.isArray(o.promotions)?o.promotions:Array.isArray(o.promotionRows)?o.promotionRows:Array.isArray(o.discounts)?o.discounts:[]).map((o,t)=>{
const e=f(o.code,o.promotionCode,o.ctkmCode,o.maCTKM),r=f(o.description,o.name,o.title,o.promotionName,o.tenCTKM),n=s(f(o.qualifiedAmount,o.basisAmount,o.baseAmount,o.giaTriHangHoa,o.amount)),a=s(f(o.discountPercent,o.percent,o.tyLe,o.rate)),i=s(f(o.discountBeforeTax,o.beforeTax,o.ckBeforeTax,o.discountAmountBeforeTax,o.amountBeforeTax,o.tienCKTruocThue)),u=s(f(o.discountAfterTax,o.afterTax,o.ckAfterTax,o.discountAmountAfterTax,o.amountAfterTax,o.tienCKSauThue,o.promotionAfterTax,o.discountAmount))
;return{stt:t+1,code:e,promotionCode:e,name:r,description:r,basisAmount:n,qualifiedAmount:n,percent:a,discountPercent:a,beforeTax:i,discountBeforeTax:i,afterTax:u,
discountAfterTax:u,type:f(o.type,o.kind,o.loai)}})}function w(o){
return(Array.isArray(o.offsets)?o.offsets:Array.isArray(o.displayRewards)?o.displayRewards:Array.isArray(o.rewardRows)?o.rewardRows:Array.isArray(o.displayRewardRows)?o.displayRewardRows:Array.isArray(o.deductions)?o.deductions:Array.isArray(o.offsetRows)?o.offsetRows:[]).map((o,t)=>{
const e=f(o.programCode,o.code,o.rewardCode,o.displayCode,o.cttbCode,o.maCTTrungBay,o.maCT),r=f(o.description,o.name,o.title,o.programName,o.noiDung,o.content),n=f(o.month,o.displayMonth,o.thangTrungBay),a=s(f(o.offsetAmount,o.cashAmount,o.debtOffsetAmount,o.canTruNo,o.amount))
;return{stt:t+1,code:e,programCode:e,name:r,description:r,month:n,goodsAmount:s(f(o.goodsAmount,o.goodsRewardAmount,o.hangHoa,o.chiTraHangHoa)),
quantityText:f(o.quantityText,o.caseUnitText,o.cartonUnitText,o.soLuongThungLe),offsetAmount:a}})}function Q(o=[],t={}){const e=new Map,r=new Map;for(const t of o){
const o=String(t.warehouseCode||"KHO_HC").trim()||"KHO_HC",n=String(t.warehouseName||("KHO_PC"===o?"KHO PC":"KHO HC")).trim();e.has(o)||(e.set(o,{code:o,name:n,items:[],
saleItems:[],promoItems:[],returnItems:[],importItems:[],totalQty:0,saleQty:0,promoQty:0,totalAmount:0}),r.set(o,new Map))
;const a=e.get(o),i=r.get(o),u=t.isPromo||"PROMO"===t.lineType?"PROMO":"SALE",m=T(f(t.code,t.productCode)),d=C(t.pack),c=P(t.unit),A="PROMO"===u?0:h(t.price)
;"1"===process.env.PRINT_DEBUG_MERGE&&console.log("[printDataBuilder.buildWarehouseGroups] source item",{code:t.code,name:t.name,unit:t.unit,pack:t.pack,price:t.price,
normalizedCode:m,normalizedUnit:c,normalizedPack:d,normalizedPrice:A});const l=[o,u,m,A].join("|");let y=i.get(l);y||(y={...t,code:m||t.code,productCode:m||t.productCode||t.code,
unit:t.unit||c,pack:s(t.pack)||s(d)||1,price:A,salePrice:A,__mergeKey:l,qty:0,amount:0,sourceOrderCodes:[]},i.set(l,y),a.items.push(y),
"PROMO"===u?a.promoItems.push(y):"RETURN"===u?a.returnItems.push(y):"IMPORT"===u?a.importItems.push(y):a.saleItems.push(y)),y.qty+=s(t.qty),y.quantity=y.qty,y.amount+=s(t.amount),
y.lineAmount=y.amount;const g=p(y.qty,y.pack);y.caseQty=g.cases,y.cartonQty=g.cases,y.unitQty=g.units,y.caseDisplay=g.display,
t.sourceOrderCode&&!y.sourceOrderCodes.includes(t.sourceOrderCode)&&y.sourceOrderCodes.push(t.sourceOrderCode)
;for(const o of t.sourceOrderCodes||[])o&&!y.sourceOrderCodes.includes(o)&&y.sourceOrderCodes.push(o);a.totalQty+=s(t.qty),"PROMO"===u?a.promoQty+=s(t.qty):a.saleQty+=s(t.qty),
a.totalAmount+=s(t.amount)}const n=t.sortByProductName?x:g;for(const o of e.values())o.saleItems.sort(n),o.promoItems.sort(n),o.returnItems.sort(n),o.importItems.sort(n),
o.items=[...o.saleItems,...o.promoItems,...o.returnItems,...o.importItems],o.items.forEach((o,t)=>{o.stt=t+1,delete o.__mergeKey});const a=["KHO_HC","KHO_PC"]
;return Array.from(e.values()).sort((o,t)=>{const e=a.indexOf(o.code),r=a.indexOf(t.code);return-1!==e||-1!==r?(-1===e?99:e)-(-1===r?99:r):o.name.localeCompare(t.name,"vi")})}
function V(o){const[t,e]=String(o||"0/0").split("/");return{cartonQty:s(t),csSuUnitQty:s(e)}}function K(o,t){
const e=V(o.csSu||o.quantityCsSu||o.caseDisplay),r=s(f(o.quantity,o.qty,o.totalQty,o.csSuUnitQty,o.unitQty)),n=Math.max(1,s(f(o.conversionRate,o.pack,o.packingQty,o.unitsPerCase,o.qtyPerCase,1))||1),a=String(f(o.lineType,o.type,o.kind,o.itemType,o.isPromo?"PROMO":"")||"").toUpperCase(),i=Boolean(o.isPromotionGift||o.isPromotionItem||o.isPromo||"PROMO"===a||"PROMOTION"===a||"KM"===a),u=i?0:A(o.priceAfterTaxBeforePromotion,o.priceAfterVatBeforeDiscount,o.listPriceAfterVat,o.catalogSalePriceAtOrder,o.salePrice,o.price,o.unitPrice),m=i?0:A(o.preTaxPriceAtOrder,o.priceBeforeTaxBeforePromotion,o.priceBeforeTax,o.priceBeforeVat,o.listPriceBeforeVat,Math.round(u/1.08)),d=i?0:s(o.discountPercent),c=i?0:A(o.priceAfterTaxAfterPromotion,o.finalPriceAtOrder,o.finalPrice,o.priceAfterPromotion,o.priceAfterVatAfterDiscount,o.priceAfterDiscount,d>0?Math.round(u*(1-d/100)):u),p=i?0:A(o.lineAmountAtOrder,o.lineAmount,o.amount,Math.round(r*c)),l=i?0:A(o.vatAmountAtOrder,o.vatAmount,o.tax,o.taxAmount,p>0?Math.round(p-p/1.08):0,Math.round((c-c/1.08)*r))
;return{lineNo:o.lineNo||o.stt||t+1,productCode:String(f(o.productCode,o.code,o.sku,o.maHang)).trim(),productName:String(f(o.productName,o.name,o.tenHang)).trim(),conversionRate:n,
quantityCsSu:o.csSu||o.quantityCsSu||o.caseDisplay||`${e.cartonQty}/${e.csSuUnitQty}`,cartonQty:s(f(o.cartonQty,o.caseQty,e.cartonQty)),
unitQtyFromCsSu:s(f(o.unitQtyFromCsSu,o.unitQty,e.csSuUnitQty)),unitQty:s(f(o.unitQty,e.csSuUnitQty)),csSuUnitQty:s(f(o.csSuUnitQty,o.unitQty,e.csSuUnitQty)),quantity:r,
priceBeforeTaxBeforePromotion:m,priceBeforeTax:m,priceAfterTaxBeforePromotion:u,catalogSalePrice:u,priceAfterTaxAfterPromotion:c,priceAfterPromotion:c,discountPercent:d,
vatAmount:l,lineAmount:p,isPromotionGift:i,isPromotionItem:i,promotionCode:o.promotionCode||"",promotionRows:Array.isArray(o.promotionRows)?o.promotionRows:B(o,{
productCode:String(f(o.productCode,o.code,o.sku,o.maHang)).trim(),productName:String(f(o.productName,o.name,o.tenHang)).trim(),quantity:r,qty:r,gsvAmount:r*u,lineAmount:p,
discountPercent:d,isPromo:i})}}function U(o={}){return{productCode:String(o.productCode||o.maHang||"").trim(),productName:String(o.productName||o.tenHang||"").trim(),
lineType:o.lineType||o.type||"",quantity:s(o.quantity||o.qty),promotionCode:String(o.promotionCode||o.code||"").trim(),code:String(o.promotionCode||o.code||"").trim(),
description:String(o.description||o.name||"").trim(),qualifiedAmount:s(o.qualifiedAmount||o.basisAmount),basisAmount:s(o.qualifiedAmount||o.basisAmount),
discountPercent:s(o.discountPercent||o.percent),percent:s(o.discountPercent||o.percent),
discountBeforeTax:s(o.discountBeforeTax||o.beforeTax||o.ckBeforeTax||o.discountAmountBeforeTax||o.amountBeforeTax),
beforeTax:s(o.discountBeforeTax||o.beforeTax||o.ckBeforeTax||o.discountAmountBeforeTax||o.amountBeforeTax),
discountAfterTax:s(o.discountAfterTax||o.afterTax||o.ckAfterTax||o.discountAmountAfterTax||o.amountAfterTax||o.promotionAfterTax||o.discountAmount),
afterTax:s(o.discountAfterTax||o.afterTax||o.ckAfterTax||o.discountAmountAfterTax||o.amountAfterTax||o.promotionAfterTax||o.discountAmount),
goodsPromotionAmount:s(o.goodsPromotionAmount||o.promotionGoodsAmount||o.freeGoodsValue||o.giftValue||o.giftAmount||o.goodsAmount)}}function G(o=[]){
return o.reduce((o,t)=>o+s(t.discountAfterTax||t.afterTax||t.ckAfterTax||t.discountAmountAfterTax||t.amountAfterTax||t.promotionAfterTax||t.discountAmount),0)}function E(o=[]){
return o.reduce((o,t)=>o+s(t.goodsPromotionAmount||t.promotionGoodsAmount||t.freeGoodsValue||t.giftValue||t.giftAmount||t.goodsAmount),0)}function _(o={}){return{
programCode:String(o.programCode||o.code||"").trim(),description:String(o.description||o.name||"").trim(),displayMonth:o.displayMonth||o.month||"",
month:o.month||o.displayMonth||"",goodsAmount:s(o.goodsAmount),quantityText:o.quantityText||o.quantity||"",offsetAmount:s(o.offsetAmount)}}function L(o={}){
const t=Array.isArray(o.items)?o.items:[],e=Array.isArray(o.promotions)?o.promotions:[],r=Array.isArray(o.offsets)?o.offsets:[],n=t.reduce((o,t)=>o+s(t.quantity),0),a=t.reduce((o,t)=>o+s(t.lineAmount),0),i=t.reduce((o,t)=>o+s(t.quantity)*s(t.priceAfterTaxBeforePromotion),0),u=t.reduce((o,t)=>o+s(t.vatAmount),0),m=G(e),d=s(o.totalGoodsPromotionAmount||o.goodsPromotionAmount||o.summary?.totalGoodsPromotionAmount||o.summary?.goodsPromotionAmount)||E(e),c=d+m,p=void 0!==o.totalPromotionAmount?s(o.totalPromotionAmount):s(o.summary?.totalPromotionAmount||o.summary?.promotionAmount),f=c>0?c:p,A=void 0!==o.totalOffsetAmount?s(o.totalOffsetAmount):r.reduce((o,t)=>o+s(t.offsetAmount),0),l=s(o.nppDiscountAmount||o.summary?.nppDiscountAmount)
;return{totalQty:n,totalVatAmount:u,goodsAmountAfterPromotion:a,grossAmountBeforePromotion:i,totalPromotionAmount:f,promotionAmount:m,totalMoneyPromotionAmount:m,
totalGoodsPromotionAmount:d,totalOffsetAmount:A,displayRewardOffset:A,nppDiscountAmount:l,payableAmount:void 0!==o.payableAmount?s(o.payableAmount):a-A-l,
promotionRate:i>0?Number(((f+l)/i*100).toFixed(2)):0}}function $(o={}){
const t=Array.isArray(o.items)?o.items:[],e=Array.isArray(o.promotions)?o.promotions:[],r=Array.isArray(o.offsets)?o.offsets:[],n=e.length+r.length,a=Math.max(1,Math.ceil(t.length/24)),i=n>4||t.length>18||r.length>0,s=n>0&&i?1:0
;return{pagesPerCopy:a+s,copies:["Liên 1","Liên 2"],showPromotionHeaderOnFirstPage:s>0,itemPageSize:24,itemPageCount:a,detailRows:n,firstPageItems:t.slice(0,24),
detailPagePromotions:e,detailPageOffsets:r}}function W(o={}){
const t=[],e=[["header.invoiceCode",o.header?.invoiceCode],["header.orderCode",o.header?.orderCode],["customer.customerCode",o.customer?.customerCode],["customer.customerName",o.customer?.customerName],["salesStaff.staffCode",o.salesStaff?.staffCode],["items",Array.isArray(o.items)&&o.items.length]]
;for(const[o,r]of e)r||t.push(`Thiếu ${o}`)
;const r=L(o),n=o.summary||{},a=[["totalQty",n.totalQty,r.totalQty],["goodsAmountAfterPromotion",n.goodsAmountAfterPromotion,r.goodsAmountAfterPromotion],["grossAmountBeforePromotion",n.grossAmountBeforePromotion,r.grossAmountBeforePromotion],["payableAmount",n.payableAmount,r.payableAmount]]
;for(const[o,e,r]of a)Math.abs(s(e)-s(r))>1&&t.push(`${o} lệch: ${e} != ${r}`);return{ok:0===t.length,errors:t}}function z(o={}){
const t=Array.isArray(o.items)?o.items.map(K):[],e=Array.isArray(o.promotions)?o.promotions.map(U):[],r=R(t),n=r.length?r:e,a=Array.isArray(o.offsets)?o.offsets.map(_):[],i={
documentType:"DELIVERY_PAYMENT_INVOICE",title:"PHIẾU GIAO NHẬN VÀ THANH TOÁN",header:{invoiceCode:o.invoiceCode||o.header?.invoiceCode||"",
orderCode:o.orderCode||o.header?.orderCode||"",orderDateTime:o.orderDateTime||o.header?.orderDateTime||"",invoiceType:o.invoiceType||o.header?.invoiceType||"Từ NVTT",
paymentTerm:o.paymentTerm||o.header?.paymentTerm||"đáo hạn trong 7 ngày",truckNo:o.truckNo||o.header?.truckNo||"",taxCode:o.taxCode||o.header?.taxCode||""},distributor:{
code:o.distributorCode||o.distributor?.code||"",name:o.distributorName||o.distributor?.name||"",phone:o.distributorPhone||o.distributor?.phone||"",
address:o.distributorAddress||o.distributor?.address||""},customer:{customerCode:o.customerCode||o.customer?.customerCode||o.customer?.code||"",
customerName:o.customerName||o.customer?.customerName||o.customer?.name||"",phone:o.customerPhone||o.customer?.phone||"",
deliveryAddress:o.deliveryAddress||o.customer?.deliveryAddress||o.customer?.address||""},salesStaff:{staffCode:o.salesStaffCode||o.salesStaff?.staffCode||o.salesStaff?.code||"",
staffName:o.salesStaffName||o.salesStaff?.staffName||o.salesStaff?.name||"",phone:o.salesStaffPhone||o.salesStaff?.phone||""},items:t,promotions:n,offsets:a,summary:{
amountInWords:o.amountInWords||o.summary?.amountInWords||"",nppDiscountAmount:s(o.nppDiscountAmount||o.summary?.nppDiscountAmount)}};return i.summary={...i.summary,...L({...i,
totalPromotionAmount:o.totalPromotionAmount,totalOffsetAmount:o.totalOffsetAmount,nppDiscountAmount:o.nppDiscountAmount,payableAmount:o.payableAmount})},i.pagination=$(i),
i.validation=W(i),i}function F(o={},e={}){const r=t(),n=I(o),a=H(o),i=w(o),p=Q(n,{sortByProductName:"PRODUCT_NAME_ASC"===o.itemSort||String(o.printMode||"").startsWith("MASTER_")
}),A=s(f(o.totalQuantity,o.totalQty,o.summary?.totalQty,n.reduce((o,t)=>o+t.qty,0))),l=s(f(o.grossAmountBeforePromotion,o.totalGrossAmount,o.grossAmount,o.summary?.grossAmountBeforePromotion,o.goodsAmount,o.subTotal,o.subtotal,n.reduce((o,t)=>o+t.gsvAmount,0))),y=s(f(o.goodsAmountAfterPromotion,o.netAmount,o.summary?.goodsAmountAfterPromotion,o.totalAmount,o.grandTotal,n.reduce((o,t)=>o+t.amount,0))),T=G(a),C=s(f(o.totalGoodsPromotionAmount,o.goodsPromotionAmount,o.summary?.totalGoodsPromotionAmount,o.summary?.goodsPromotionAmount,E(a)))+T,P=s(f(o.promotionValue,o.totalPromotionValue,o.totalPromotionAmount,o.totalDiscountAmount,o.promotionAmount,o.discountAmount,o.summary?.promotionAmount)),h=C>0?C:P,g=s(f(o.displayRewardTotal,o.totalDisplayReward,o.rewardAmount,o.offsetAmount,o.summary?.displayRewardOffset,i.reduce((o,t)=>o+t.offsetAmount,0))),x=s(f(o.nppDiscountAmount,o.summary?.nppDiscountAmount,0)),N=s(f(o.discount,o.discountAmount,o.totalDiscount,h)),S=s(f(o.tax,o.vat,o.taxAmount,n.reduce((o,t)=>o+t.tax,0))),O=y,v=l,b=s(f(o.paidAmount,o.paid,o.collectedAmount,o.cashReceived)),D=s(f(o.payableAmount,o.mustPay,o.summary?.payableAmount,O-g)),B=s(f(o.debtAmount,o.debt,Math.max(D-b,0))),R=s(f(o.promotionRate,o.summary?.promotionRate,v?(h+x)/v*100:0)),M=z({
...o,invoiceCode:f(o.invoiceCode,o.invoiceNo,o.soHoaDon,o.documentCode,o.code),orderCode:f(o.customerOrderCode,o.soDonHang,o.orderCode,o.documentCode,o.code),
orderDateTime:d(f(o.orderDateTime,o.orderDate,o.documentDate,o.date,o.createdAt)),invoiceType:f(o.invoiceType,o.invoiceTypeName,o.orderSourceName,"Từ NVTT"),
paymentTerm:f(o.terms,o.paymentTerms,o.paymentTerm,"đáo hạn trong 7 ngày"),truckNo:f(o.vehicleNo,o.truckNo,o.soXeTai),taxCode:f(o.customerTaxCode,o.customer?.taxCode,o.mst),
distributor:{code:f(o.distributor?.code,e.companyCode,r.code),name:f(o.distributor?.name,e.companyName,r.name),address:f(o.distributor?.address,e.companyAddress,r.address),
phone:f(o.distributor?.phone,e.companyPhone,r.phone)},customer:{customerCode:f(o.customerCode,o.customer?.code,o.customerId),
customerName:f(o.customerName,o.customer?.name,o.supplier,o.supplierName),deliveryAddress:f(o.customerAddress,o.customer?.address,o.address),
phone:f(o.customerPhone,o.customer?.phone,o.phone),taxCode:f(o.customerTaxCode,o.customer?.taxCode,o.mst)},salesStaff:{
staffCode:f(o.salesStaffCode,o.salesPersonCode,o.salesmanCode,o.nvbhCode,o.maNVBH,o.salesCode,o.salesStaffId),
staffName:f(o.salesStaffName,o.salesPersonName,o.salesmanName,o.nvbhName,o.maNVBHName,o.salesName,o.createdBy),phone:f(o.staffPhone,o.salesStaffPhone,o.salesPhone)},items:n,
promotions:a,offsets:i,totalPromotionAmount:h,totalOffsetAmount:g,nppDiscountAmount:x,payableAmount:D,
amountInWords:f(o.amountInWords,o.summary?.amountInWords,o.totalAmountText)||c(D||O)});return{company:{code:f(o.distributor?.code,e.companyCode,r.code),
name:f(o.distributor?.name,e.companyName,r.name),address:f(o.distributor?.address,e.companyAddress,r.address),phone:f(o.distributor?.phone,e.companyPhone,r.phone),
taxCode:e.taxCode||r.taxCode},document:{id:o.id||o._id||"",code:f(o.code,o.orderCode,o.refCode,o.id,o._id),
invoiceCode:f(o.invoiceCode,o.invoiceNo,o.soHoaDon,o.documentCode,o.code),customerOrderCode:f(o.customerOrderCode,o.soDonHang,o.orderCode,o.documentCode,o.code),
date:m(f(o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt)),
dateTime:d(f(o.orderDateTime,o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt)),
rawDate:f(o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt),type:f(o.invoiceType,o.type,o.orderType,o.orderSourceName,"NVTT"),note:o.note||"",
terms:f(o.terms,o.paymentTerms,"đáo hạn trong 7 ngày"),page:e.page||"1 / 1",vehicleNo:f(o.vehicleNo,o.truckNo,o.soXeTai),printMode:o.printMode||"",
title:o.printContract?.document?.title||o.printTitle||"",sourceCodes:Array.isArray(o.sourceCodes)?o.sourceCodes:o.printContract?.document?.sourceCodes||[],
masterOrderCodes:Array.isArray(o.masterOrderCodes)?o.masterOrderCodes:[],selectedMasterOrderCount:o.selectedMasterOrderCount||0},customer:{
code:f(o.customerCode,o.customer?.code,o.customerId),name:f(o.customerName,o.customer?.name,o.supplier,o.supplierName),address:f(o.customerAddress,o.customer?.address,o.address),
phone:f(o.customerPhone,o.customer?.phone,o.phone),taxCode:f(o.customerTaxCode,o.customer?.taxCode,o.mst)},staff:{
code:f(o.salesStaffCode,o.salesPersonCode,o.salesmanCode,o.nvbhCode,o.maNVBH,o.salesCode,o.salesStaffId),
name:f(o.salesStaffName,o.salesPersonName,o.salesmanName,o.nvbhName,o.maNVBHName,o.salesName,o.createdBy),phone:f(o.staffPhone,o.salesStaffPhone,o.salesPhone)},delivery:{
code:f(o.deliveryStaffCode,o.deliveryCode),name:f(o.deliveryStaffName,o.deliveryName),phone:f(o.deliveryPhone,o.deliveryStaffPhone),route:f(o.route,o.routeName,o.tuyen)},items:n,
promotions:a,displayRewards:i,warehouseGroups:p,masterKpis:Array.isArray(o.masterKpis)?o.masterKpis:[],masterKpiTotals:o.masterKpiTotals||{},totals:{totalQty:A,goodsAmount:v,
totalAmount:O,goodsAmountAfterPromotion:y,grossAmountBeforePromotion:l,promotionAmount:h,displayRewardOffset:g,nppDiscountAmount:x,promotionRate:R,discount:N,tax:S,paid:b,
payable:D,debt:B,orderCount:s(f(o.orderCount,o.totalOrders,Array.isArray(o.children)?o.children.length:0)),promotionValue:h,displayRewardTotal:g,
totalAmountText:f(o.amountInWords,o.summary?.amountInWords,o.totalAmountText)||c(D||O)},meta:{printedAt:(new Date).toLocaleString("vi-VN"),printedBy:e.printedBy||"",
copyLabel:e.copyLabel||"Liên 1"},erpInvoiceV46:M,printContract:o.printContract||null,printProfile:o.printProfile||o.printContract?.profile||"",formatMoney:u}}module.exports={
buildPrintData:F,buildDeliveryInvoicePayload:z,calculateDeliveryInvoiceSummary:L,paginateDeliveryInvoice:$,validateAgainstDmsSample:W,formatMoney:u,formatDate:m,formatDateTime:d,
numberToVietnameseWords:c};
