/* GENERATED FILE — edit services/printDataBuilder.legacy.source/part-01.jsfrag, services/printDataBuilder.legacy.source/part-02.jsfrag, services/printDataBuilder.legacy.source/part-03.jsfrag and run npm run build:source-bundles. */
const{calculateCartonUnit:o}=require("../src/utils/common.util"),{normalizePickingZone:e,pickingZoneFrom:t,legacyPrintGroupCode:r,pickingZoneLabel:n,PICKING_ZONES:a}=require("../src/utils/pickingZone.util"),{toNumber:i,formatMoney:s,formatDate:u,formatDateTime:m,numberToVietnameseWords:c}=require("./print/PrintFormatService")
;function d(e,t){const r=o(e,t);return{cases:r.cartons,units:r.units,display:r.display}}function p(...o){return o.find(o=>null!=o&&""!==o)??""}function f(...o){for(const e of o){
const o=i(e);if(o>0)return o}return 0}function l(o){return i(p(o.qty,o.quantity,o.soLuong,o.totalQty,o.totalQuantity))}function A(o){
return i(p(o.conversionRateAtOrder,o.packingQtyAtOrder,o.packingQty,o.conversionRate,o.unitsPerCase,o.qtyPerCase,o.packSize,o.product?.conversionRate,o.productSnapshot?.conversionRate,1))||1
}function y(o){return String(o||"").trim().toUpperCase()}function C(o){return String(o||"").trim().toUpperCase().replace(/\s+/g,"")}function T(o){
return String(o||"").trim().toUpperCase()}function P(o){return Math.round(i(o))}function h(o,e){const t=y(o.code).localeCompare(y(e.code),"vi",{numeric:!0});if(0!==t)return t
;const r=P(o.price)-P(e.price);return 0!==r?r:String(o.name||"").localeCompare(String(e.name||""),"vi",{sensitivity:"base",numeric:!0})}function g(o,e){
const t=String(o.name||o.productName||"").localeCompare(String(e.name||e.productName||""),"vi",{sensitivity:"base",numeric:!0});if(0!==t)return t
;const r=y(o.code||o.productCode).localeCompare(y(e.code||e.productCode),"vi",{numeric:!0});return 0!==r?r:P(o.price)-P(e.price)}function x(o){
return i(p(o.catalogSalePriceAtOrder,o.priceAfterTaxBeforePromotion,o.catalogSalePrice,o.product?.salePrice,o.productSnapshot?.salePrice,o.salePrice,o.giaBan,o.price,o.unitPrice,0))
}function N(o){return x(o)}function S(o){return i(p(o.discountPercent,o.promotionDiscountPercent,o.ckPercent,o.percent,o.rate,o.promotion?.discountPercent,0))}function O(o){
return i(p(o.discount,o.discountAmount,o.ck,o.ckAmount,0))}function v(o){
return null==o?"":Array.isArray(o)?o.map(v).filter(Boolean).join("; "):"object"==typeof o?p(o.description,o.name,o.title,o.content,o.note,o.ruleName,o.programName,o.promotionName,o.dienGiai,o.noiDung):String(o||"").trim()
}function D(o={}){
const e=[],t=[o.promotions,o.promotionRows,o.promotionDetails,o.appliedPromotions,o.appliedPromotionRows,o.discountRows,o.discounts,o.productPromotions,o.productSnapshot?.promotions,o.productSnapshot?.promotionRows,o.product?.promotions,o.product?.promotionRows]
;for(const o of t)Array.isArray(o)&&e.push(...o)
;const r=[o.promotion,o.promotionInfo,o.promotionDetail,o.appliedPromotion,o.discountInfo,o.productSnapshot?.promotion,o.product?.promotion];for(const o of r)o&&e.push(o)
;const n=p(o.promotionDescription,o.promotionName,o.promotionText,o.promotionContent,o.promotionNote,o.promoDescription,o.promoName,o.dienGiaiKhuyenMai,o.noiDungKhuyenMai,o.productSnapshot?.promotionDescription,o.productSnapshot?.promotionName,o.productSnapshot?.promotionText,o.product?.promotionDescription,o.product?.promotionName,o.product?.promotionText),a=p(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM,o.productSnapshot?.promotionCode,o.product?.promotionCode)
;return e.length||!n&&!a||e.push({code:a,promotionCode:a,description:n,name:n,discountPercent:o.discountPercent,percent:o.discountPercent,discountBeforeTax:o.discountBeforeTax,
beforeTax:o.discountBeforeTax,discountAfterTax:o.discountAfterTax||o.discount||o.discountAmount,afterTax:o.discountAfterTax||o.discount||o.discountAmount}),e}function R(o={},e={}){
const t=D(o),r=p(e.productCode,e.code,o.productCode,o.code,o.sku,o.maHang),n=p(e.productName,e.name,o.productName,o.name,o.tenHang),a=e.isPromo?"KM":"Bán",s=i(p(e.qty,e.quantity,o.qty,o.quantity,o.totalQty)),u=i(p(e.gsvAmount,e.lineAmount,e.amount,o.gsvAmount,o.amount)),m=Math.round(u/1.08),c=i(p(e.discountPercent,o.discountPercent,o.percent,o.rate)),d=i(p(o.discountAfterTax,o.afterTax,o.discountAmount,o.discount,e.discount,0)),f=i(p(o.discountBeforeTax,o.beforeTax,d?Math.round(d/1.08):0))
;!t.length&&(c>0||d>0||e.isPromo)&&t.push({code:p(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM),
description:e.isPromo?`Hàng khuyến mại theo dòng ${r} - ${n}`:`Chiết khấu/khuyến mại theo dòng ${r} - ${n}`,discountPercent:c,discountBeforeTax:f,discountAfterTax:d})
;const l=t.map(o=>{
const t=p(o.promotionCode,o.code,o.ctkmCode,o.maCTKM,o.programCode),u=v(o)||(e.isPromo?`Hàng khuyến mại theo dòng ${r} - ${n}`:`Khuyến mại theo dòng ${r} - ${n}`);return{
productCode:r,productName:n,lineType:a,quantity:s,promotionCode:t,code:t,description:u,name:u,qualifiedAmount:m,basisAmount:m,
discountPercent:i(p(o.discountPercent,o.percent,o.tyLe,o.rate,c)),percent:i(p(o.discountPercent,o.percent,o.tyLe,o.rate,c)),
discountBeforeTax:i(p(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue,f)),beforeTax:i(p(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue,f)),
discountAfterTax:i(p(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount,d)),
afterTax:i(p(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount,d))}}),A=new Set;return l.filter(o=>{
const e=[o.productCode,o.lineType,o.promotionCode,o.description,o.discountAfterTax,o.discountPercent].join("|");return!A.has(e)&&(A.add(e),
o.description||o.promotionCode||o.discountAfterTax||o.discountPercent)})}function b(o=[]){const e=[];for(const t of o){const o=Array.isArray(t.promotionRows)?t.promotionRows:[]
;for(const r of o)e.push({productCode:t.productCode||r.productCode,productName:t.productName||r.productName,lineType:t.isPromotionGift||t.isPromo?"KM":r.lineType||"Bán",
quantity:t.quantity||r.quantity,promotionCode:r.promotionCode||r.code||t.promotionCode||"",code:r.promotionCode||r.code||t.promotionCode||"",description:r.description||r.name||"",
qualifiedAmount:i(r.qualifiedAmount||r.basisAmount),basisAmount:i(r.qualifiedAmount||r.basisAmount),discountPercent:i(r.discountPercent||r.percent),
percent:i(r.discountPercent||r.percent),discountBeforeTax:i(r.discountBeforeTax||r.beforeTax),beforeTax:i(r.discountBeforeTax||r.beforeTax),
discountAfterTax:i(r.discountAfterTax||r.afterTax),afterTax:i(r.discountAfterTax||r.afterTax)})}return M(e)}function M(o=[]){const e=new Map;for(const t of o){
const o=[t.productCode||"",t.lineType||"",t.promotionCode||t.code||"",t.description||t.name||"",t.discountPercent||0].join("|"),r=e.get(o)
;r?(r.qualifiedAmount=i(r.qualifiedAmount)+i(t.qualifiedAmount),r.basisAmount=r.qualifiedAmount,r.discountBeforeTax=i(r.discountBeforeTax)+i(t.discountBeforeTax),
r.beforeTax=r.discountBeforeTax,r.discountAfterTax=i(r.discountAfterTax)+i(t.discountAfterTax),r.afterTax=r.discountAfterTax,r.quantity=i(r.quantity)+i(t.quantity)):e.set(o,{...t})
}return Array.from(e.values())}function B(o){return i(p(o.tax,o.vat,o.taxAmount,o.vatAmount,0))}function q(o,s,u=null){
const m=e(t(o),a.HC),c=r(m),f=n(m),y=l(o),C=A(o),T=x(o),P=i(p(o.preTaxPriceAtOrder,o.priceBeforeTaxBeforePromotion,o.listPriceBeforeVat,o.priceBeforeTax,o.priceBeforeVat,Math.round(T/1.08))),h=S(o),g=i(p(o.priceAfterTaxAfterPromotion,o.priceAfterPromotion,o.priceAfterVatAfterDiscount,o.netPrice,o.priceAfterDiscount,o.finalPrice,o.orderPrice,o.manualPrice,0)),N=h>0?Math.floor(T*(1-h/100)):g||T,v=O(o),D=String(p(o.lineType,o.type,o.kind,o.itemType,o.isPromo?"PROMO":"SALE")||"SALE").toUpperCase(),b="PROMO"===D||"PROMOTION"===D||"KM"===D||!0===o.isPromo,M=b?"PROMO":"RETURN"===D?"RETURN":"IMPORT"===D?"IMPORT":"SALE",B="PROMO"===M?"Xuất khuyến mại":"RETURN"===M?"Hàng trả nhập kho":"IMPORT"===M?"Hàng nhập kho":"Hàng bán",q=b?0:Math.round((N-N/1.08)*y),H=b?0:i(p(o.vatAmountAtOrder,o.vatAmount,o.taxAmount,o.tax,q)),I=b?0:Math.round(N*y),Q=b?0:i(p(o.lineAmountAtOrder,o.lineAmount,o.amount,I)),k=d(y,C),w=R(o,{
code:p(o.code,o.productCode,o.sku,o.maHang),productCode:p(o.productCode,o.code,o.sku,o.maHang),name:p(o.name,o.productName,o.tenHang,o.productSnapshot?.name,o.product?.name),
productName:p(o.productName,o.name,o.tenHang,o.productSnapshot?.name,o.product?.name),qty:y,quantity:y,gsvAmount:Math.round(y*T),amount:Q,discount:v,discountPercent:h,isPromo:b})
;return{stt:s+1,code:p(o.code,o.productCode,o.sku,o.maHang),productCode:p(o.productCode,o.code,o.sku,o.maHang),
name:p(o.name,o.productName,o.tenHang,o.productSnapshot?.name,o.product?.name),productName:p(o.productName,o.name,o.tenHang,o.productSnapshot?.name,o.product?.name),
unit:p(o.unit,o.dvt,o.uom,o.productSnapshot?.unit,o.product?.unit,"Cái"),pack:C,conversionRate:C,qty:y,quantity:y,cartonQty:k.cases,caseQty:k.cases,unitQty:k.units,
caseDisplay:`${k.cases}/${k.units}`,price:T,salePrice:T,catalogSalePrice:T,priceBeforeTax:P,priceBeforeVat:P,listPriceBeforeVat:P,priceAfterTaxBeforePromotion:T,
priceAfterVatBeforeDiscount:T,listPriceAfterVat:T,discountPercent:h,priceAfterPromotion:N,priceAfterDiscount:N,priceAfterVatAfterDiscount:N,gsvAmount:Math.round(y*T),nivAmount:Q,
discount:v,tax:H,vatAmount:H,amount:Q,lineAmount:Q,lineType:M,isPromo:b,lineTypeName:B,note:o.note||"",sourceOrderCode:u?p(u.code,u.orderCode,u.id):"",pickingZone:m,
warehouseCode:c,warehouseName:f,sourceOrderCodes:Array.isArray(o.sourceOrderCodes)?o.sourceOrderCodes:[],
promotionCode:p(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM,w[0]?.promotionCode),
promotionDescription:p(o.promotionDescription,o.promotionName,o.promotionText,w[0]?.description),promotionRows:w}}function H(o){
const e=Array.isArray(o.items)?o.items:[],t=Array.isArray(o.lines)?o.lines:[],r=e.length?e:t;if(r.length)return r.map((o,e)=>q(o,e))
;const n=Array.isArray(o.children)?o.children:[],a=[];return n.forEach(o=>{(Array.isArray(o.items)?o.items:[]).forEach(e=>a.push({item:e,child:o}))}),
a.map((o,e)=>q(o.item,e,o.child))}function I(o){
return(Array.isArray(o.promotions)?o.promotions:Array.isArray(o.promotionRows)?o.promotionRows:Array.isArray(o.discounts)?o.discounts:[]).map((o,e)=>{
const t=p(o.code,o.promotionCode,o.ctkmCode,o.maCTKM),r=p(o.description,o.name,o.title,o.promotionName,o.tenCTKM),n=i(p(o.qualifiedAmount,o.basisAmount,o.baseAmount,o.giaTriHangHoa,o.amount)),a=i(p(o.discountPercent,o.percent,o.tyLe,o.rate)),s=i(p(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue)),u=i(p(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount))
;return{stt:e+1,code:t,promotionCode:t,name:r,description:r,basisAmount:n,qualifiedAmount:n,percent:a,discountPercent:a,beforeTax:s,discountBeforeTax:s,afterTax:u,
discountAfterTax:u,type:p(o.type,o.kind,o.loai)}})}function Q(o){
return(Array.isArray(o.offsets)?o.offsets:Array.isArray(o.displayRewards)?o.displayRewards:Array.isArray(o.rewardRows)?o.rewardRows:Array.isArray(o.displayRewardRows)?o.displayRewardRows:Array.isArray(o.deductions)?o.deductions:Array.isArray(o.offsetRows)?o.offsetRows:[]).map((o,e)=>{
const t=p(o.programCode,o.code,o.rewardCode,o.displayCode,o.cttbCode,o.maCTTrungBay,o.maCT),r=p(o.description,o.name,o.title,o.programName,o.noiDung,o.content),n=p(o.month,o.displayMonth,o.thangTrungBay),a=i(p(o.offsetAmount,o.cashAmount,o.debtOffsetAmount,o.canTruNo,o.amount))
;return{stt:e+1,code:t,programCode:t,name:r,description:r,month:n,goodsAmount:i(p(o.goodsAmount,o.goodsRewardAmount,o.hangHoa,o.chiTraHangHoa)),
quantityText:p(o.quantityText,o.caseUnitText,o.cartonUnitText,o.soLuongThungLe),offsetAmount:a}})}function k(o=[],e={}){const t=new Map,r=new Map;for(const e of o){
const o=String(e.warehouseCode||"KHO_HC").trim()||"KHO_HC",n=String(e.warehouseName||("KHO_PC"===o?"KHO PC":"KHO HC")).trim();t.has(o)||(t.set(o,{code:o,name:n,items:[],
saleItems:[],promoItems:[],returnItems:[],importItems:[],totalQty:0,saleQty:0,promoQty:0,totalAmount:0}),r.set(o,new Map))
;const a=t.get(o),s=r.get(o),u=e.isPromo||"PROMO"===e.lineType?"PROMO":"SALE",m=y(p(e.code,e.productCode)),c=C(e.pack),f=T(e.unit),l="PROMO"===u?0:P(e.price)
;"1"===process.env.PRINT_DEBUG_MERGE&&console.log("[printDataBuilder.buildWarehouseGroups] source item",{code:e.code,name:e.name,unit:e.unit,pack:e.pack,price:e.price,
normalizedCode:m,normalizedUnit:f,normalizedPack:c,normalizedPrice:l});const A=[o,u,m,l].join("|");let h=s.get(A);h||(h={...e,code:m||e.code,productCode:m||e.productCode||e.code,
unit:e.unit||f,pack:i(e.pack)||i(c)||1,price:l,salePrice:l,__mergeKey:A,qty:0,amount:0,sourceOrderCodes:[]},s.set(A,h),a.items.push(h),
"PROMO"===u?a.promoItems.push(h):"RETURN"===u?a.returnItems.push(h):"IMPORT"===u?a.importItems.push(h):a.saleItems.push(h)),h.qty+=i(e.qty),h.quantity=h.qty,h.amount+=i(e.amount),
h.lineAmount=h.amount;const g=d(h.qty,h.pack);h.caseQty=g.cases,h.cartonQty=g.cases,h.unitQty=g.units,h.caseDisplay=g.display,
e.sourceOrderCode&&!h.sourceOrderCodes.includes(e.sourceOrderCode)&&h.sourceOrderCodes.push(e.sourceOrderCode)
;for(const o of e.sourceOrderCodes||[])o&&!h.sourceOrderCodes.includes(o)&&h.sourceOrderCodes.push(o);a.totalQty+=i(e.qty),"PROMO"===u?a.promoQty+=i(e.qty):a.saleQty+=i(e.qty),
a.totalAmount+=i(e.amount)}const n=e.sortByProductName?g:h;for(const o of t.values())o.saleItems.sort(n),o.promoItems.sort(n),o.returnItems.sort(n),o.importItems.sort(n),
o.items=[...o.saleItems,...o.promoItems,...o.returnItems,...o.importItems],o.items.forEach((o,e)=>{o.stt=e+1,delete o.__mergeKey});const a=["KHO_HC","KHO_PC"]
;return Array.from(t.values()).sort((o,e)=>{const t=a.indexOf(o.code),r=a.indexOf(e.code);return-1!==t||-1!==r?(-1===t?99:t)-(-1===r?99:r):o.name.localeCompare(e.name,"vi")})}
function w(o){const[e,t]=String(o||"0/0").split("/");return{cartonQty:i(e),csSuUnitQty:i(t)}}function K(o,e){
const t=w(o.csSu||o.quantityCsSu||o.caseDisplay),r=i(p(o.quantity,o.qty,o.totalQty,o.csSuUnitQty,o.unitQty)),n=Math.max(1,i(p(o.conversionRate,o.pack,o.packingQty,o.unitsPerCase,o.qtyPerCase,1))||1),a=f(o.priceAfterTaxBeforePromotion,o.priceAfterVatBeforeDiscount,o.listPriceAfterVat,o.catalogSalePriceAtOrder,o.salePrice,o.price,o.unitPrice),s=f(o.preTaxPriceAtOrder,o.priceBeforeTaxBeforePromotion,o.priceBeforeTax,o.priceBeforeVat,o.listPriceBeforeVat,Math.round(a/1.08)),u=i(o.discountPercent),m=f(o.priceAfterTaxAfterPromotion,o.finalPriceAtOrder,o.finalPrice,o.priceAfterPromotion,o.priceAfterVatAfterDiscount,o.priceAfterDiscount,u>0?Math.round(a*(1-u/100)):a),c=f(o.lineAmountAtOrder,o.lineAmount,o.amount,Math.round(r*m)),d=Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType)?0:f(o.vatAmountAtOrder,o.vatAmount,o.tax,o.taxAmount,c>0?Math.round(c-c/1.08):0,Math.round((m-m/1.08)*r))
;return{lineNo:o.lineNo||o.stt||e+1,productCode:String(p(o.productCode,o.code,o.sku,o.maHang)).trim(),productName:String(p(o.productName,o.name,o.tenHang)).trim(),conversionRate:n,
quantityCsSu:o.csSu||o.quantityCsSu||o.caseDisplay||`${t.cartonQty}/${t.csSuUnitQty}`,cartonQty:i(p(o.cartonQty,o.caseQty,t.cartonQty)),
unitQtyFromCsSu:i(p(o.unitQtyFromCsSu,o.unitQty,t.csSuUnitQty)),unitQty:i(p(o.unitQty,t.csSuUnitQty)),csSuUnitQty:i(p(o.csSuUnitQty,o.unitQty,t.csSuUnitQty)),quantity:r,
priceBeforeTaxBeforePromotion:s,priceBeforeTax:s,priceAfterTaxBeforePromotion:a,catalogSalePrice:a,priceAfterTaxAfterPromotion:m,priceAfterPromotion:m,discountPercent:u,
vatAmount:d,lineAmount:c,isPromotionGift:Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType),promotionCode:o.promotionCode||"",
promotionRows:Array.isArray(o.promotionRows)?o.promotionRows:R(o,{productCode:String(p(o.productCode,o.code,o.sku,o.maHang)).trim(),
productName:String(p(o.productName,o.name,o.tenHang)).trim(),quantity:r,qty:r,gsvAmount:r*a,lineAmount:c,discountPercent:u,
isPromo:Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType)})}}function _(o={}){return{productCode:String(o.productCode||o.maHang||"").trim(),
productName:String(o.productName||o.tenHang||"").trim(),lineType:o.lineType||o.type||"",quantity:i(o.quantity||o.qty),promotionCode:String(o.promotionCode||o.code||"").trim(),
code:String(o.promotionCode||o.code||"").trim(),description:String(o.description||o.name||"").trim(),qualifiedAmount:i(o.qualifiedAmount||o.basisAmount),
basisAmount:i(o.qualifiedAmount||o.basisAmount),discountPercent:i(o.discountPercent||o.percent),percent:i(o.discountPercent||o.percent),
discountBeforeTax:i(o.discountBeforeTax||o.beforeTax),beforeTax:i(o.discountBeforeTax||o.beforeTax),discountAfterTax:i(o.discountAfterTax||o.afterTax),
afterTax:i(o.discountAfterTax||o.afterTax)}}function V(o={}){return{programCode:String(o.programCode||o.code||"").trim(),description:String(o.description||o.name||"").trim(),
displayMonth:o.displayMonth||o.month||"",month:o.month||o.displayMonth||"",goodsAmount:i(o.goodsAmount),quantityText:o.quantityText||o.quantity||"",offsetAmount:i(o.offsetAmount)}}
function E(o={}){
const e=Array.isArray(o.items)?o.items:[],t=Array.isArray(o.promotions)?o.promotions:[],r=Array.isArray(o.offsets)?o.offsets:[],n=e.reduce((o,e)=>o+i(e.quantity),0),a=e.reduce((o,e)=>o+i(e.lineAmount),0),s=e.reduce((o,e)=>o+i(e.quantity)*i(e.priceAfterTaxBeforePromotion),0),u=e.reduce((o,e)=>o+i(e.vatAmount),0),m=void 0!==o.totalPromotionAmount?i(o.totalPromotionAmount):t.reduce((o,e)=>o+i(e.discountAfterTax),0),c=void 0!==o.totalOffsetAmount?i(o.totalOffsetAmount):r.reduce((o,e)=>o+i(e.offsetAmount),0),d=i(o.nppDiscountAmount||o.summary?.nppDiscountAmount)
;return{totalQty:n,totalVatAmount:u,goodsAmountAfterPromotion:a,grossAmountBeforePromotion:s,totalPromotionAmount:m,promotionAmount:m,totalOffsetAmount:c,displayRewardOffset:c,
nppDiscountAmount:d,payableAmount:void 0!==o.payableAmount?i(o.payableAmount):a-c-d,promotionRate:s>0?Number(((m+d)/s*100).toFixed(2)):0}}function U(o={}){
const e=Array.isArray(o.items)?o.items:[],t=Array.isArray(o.promotions)?o.promotions:[],r=Array.isArray(o.offsets)?o.offsets:[],n=t.length+r.length,a=Math.max(1,Math.ceil(e.length/24)),i=n>4||e.length>18||r.length>0,s=n>0&&i?1:0
;return{pagesPerCopy:a+s,copies:["Liên 1","Liên 2"],showPromotionHeaderOnFirstPage:s>0,itemPageSize:24,itemPageCount:a,detailRows:n,firstPageItems:e.slice(0,24),
detailPagePromotions:t,detailPageOffsets:r}}function L(o={}){
const e=[],t=[["header.invoiceCode",o.header?.invoiceCode],["header.orderCode",o.header?.orderCode],["customer.customerCode",o.customer?.customerCode],["customer.customerName",o.customer?.customerName],["salesStaff.staffCode",o.salesStaff?.staffCode],["items",Array.isArray(o.items)&&o.items.length]]
;for(const[o,r]of t)r||e.push(`Thiếu ${o}`)
;const r=E(o),n=o.summary||{},a=[["totalQty",n.totalQty,r.totalQty],["goodsAmountAfterPromotion",n.goodsAmountAfterPromotion,r.goodsAmountAfterPromotion],["grossAmountBeforePromotion",n.grossAmountBeforePromotion,r.grossAmountBeforePromotion],["payableAmount",n.payableAmount,r.payableAmount]]
;for(const[o,t,r]of a)Math.abs(i(t)-i(r))>1&&e.push(`${o} lệch: ${t} != ${r}`);return{ok:0===e.length,errors:e}}function $(o={}){
const e=Array.isArray(o.items)?o.items.map(K):[],t=Array.isArray(o.promotions)?o.promotions.map(_):[],r=b(e),n=r.length?r:t,a=Array.isArray(o.offsets)?o.offsets.map(V):[],s={
documentType:"DELIVERY_PAYMENT_INVOICE",title:"PHIẾU GIAO NHẬN VÀ THANH TOÁN",header:{invoiceCode:o.invoiceCode||o.header?.invoiceCode||"",
orderCode:o.orderCode||o.header?.orderCode||"",orderDateTime:o.orderDateTime||o.header?.orderDateTime||"",invoiceType:o.invoiceType||o.header?.invoiceType||"Từ NVTT",
paymentTerm:o.paymentTerm||o.header?.paymentTerm||"đáo hạn trong 7 ngày",truckNo:o.truckNo||o.header?.truckNo||"",taxCode:o.taxCode||o.header?.taxCode||""},distributor:{
code:o.distributorCode||o.distributor?.code||"",name:o.distributorName||o.distributor?.name||"",phone:o.distributorPhone||o.distributor?.phone||"",
address:o.distributorAddress||o.distributor?.address||""},customer:{customerCode:o.customerCode||o.customer?.customerCode||o.customer?.code||"",
customerName:o.customerName||o.customer?.customerName||o.customer?.name||"",phone:o.customerPhone||o.customer?.phone||"",
deliveryAddress:o.deliveryAddress||o.customer?.deliveryAddress||o.customer?.address||""},salesStaff:{staffCode:o.salesStaffCode||o.salesStaff?.staffCode||o.salesStaff?.code||"",
staffName:o.salesStaffName||o.salesStaff?.staffName||o.salesStaff?.name||"",phone:o.salesStaffPhone||o.salesStaff?.phone||""},items:e,promotions:n,offsets:a,summary:{
amountInWords:o.amountInWords||o.summary?.amountInWords||"",nppDiscountAmount:i(o.nppDiscountAmount||o.summary?.nppDiscountAmount)}};return s.summary={...s.summary,...E({...s,
totalPromotionAmount:o.totalPromotionAmount,totalOffsetAmount:o.totalOffsetAmount,nppDiscountAmount:o.nppDiscountAmount,payableAmount:o.payableAmount})},s.pagination=U(s),
s.validation=L(s),s}function G(o={},e={}){const t=H(o),r=I(o),n=Q(o),a=k(t,{sortByProductName:"PRODUCT_NAME_ASC"===o.itemSort||String(o.printMode||"").startsWith("MASTER_")
}),d=i(p(o.totalQuantity,o.totalQty,o.summary?.totalQty,t.reduce((o,e)=>o+e.qty,0))),f=i(p(o.grossAmountBeforePromotion,o.totalGrossAmount,o.grossAmount,o.summary?.grossAmountBeforePromotion,o.goodsAmount,o.subTotal,o.subtotal,t.reduce((o,e)=>o+e.gsvAmount,0))),l=i(p(o.goodsAmountAfterPromotion,o.netAmount,o.summary?.goodsAmountAfterPromotion,o.totalAmount,o.grandTotal,t.reduce((o,e)=>o+e.amount,0))),A=i(p(o.promotionValue,o.totalPromotionValue,o.totalPromotionAmount,o.totalDiscountAmount,o.promotionAmount,o.discountAmount,o.summary?.promotionAmount,r.reduce((o,e)=>o+(e.afterTax||e.beforeTax||0),0))),y=i(p(o.displayRewardTotal,o.totalDisplayReward,o.rewardAmount,o.offsetAmount,o.summary?.displayRewardOffset,n.reduce((o,e)=>o+e.offsetAmount,0))),C=i(p(o.nppDiscountAmount,o.summary?.nppDiscountAmount,0)),T=i(p(o.discount,o.discountAmount,o.totalDiscount,A)),P=i(p(o.tax,o.vat,o.taxAmount,t.reduce((o,e)=>o+e.tax,0))),h=l,g=f,x=i(p(o.paidAmount,o.paid,o.collectedAmount,o.cashReceived)),N=i(p(o.payableAmount,o.mustPay,o.summary?.payableAmount,h-y)),S=i(p(o.debtAmount,o.debt,Math.max(N-x,0))),O=i(p(o.promotionRate,o.summary?.promotionRate,g?(A+C)/g*100:0)),v=$({
...o,invoiceCode:p(o.invoiceCode,o.invoiceNo,o.soHoaDon,o.documentCode,o.code),orderCode:p(o.customerOrderCode,o.soDonHang,o.orderCode,o.documentCode,o.code),
orderDateTime:m(p(o.orderDateTime,o.orderDate,o.documentDate,o.date,o.createdAt)),invoiceType:p(o.invoiceType,o.invoiceTypeName,o.orderSourceName,"Từ NVTT"),
paymentTerm:p(o.terms,o.paymentTerms,o.paymentTerm,"đáo hạn trong 7 ngày"),truckNo:p(o.vehicleNo,o.truckNo,o.soXeTai),taxCode:p(o.customerTaxCode,o.customer?.taxCode,o.mst),
distributor:{code:p(o.distributor?.code,e.companyCode,process.env.PRINT_COMPANY_CODE,"3293"),
name:p(o.distributor?.name,e.companyName,process.env.PRINT_COMPANY_NAME,"Công Ty TNHH MTV Minh Khai"),
address:p(o.distributor?.address,e.companyAddress,process.env.PRINT_COMPANY_ADDRESS,"Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình"),
phone:p(o.distributor?.phone,e.companyPhone,process.env.PRINT_COMPANY_PHONE,"")},customer:{customerCode:p(o.customerCode,o.customer?.code,o.customerId),
customerName:p(o.customerName,o.customer?.name,o.supplier,o.supplierName),deliveryAddress:p(o.customerAddress,o.customer?.address,o.address),
phone:p(o.customerPhone,o.customer?.phone,o.phone),taxCode:p(o.customerTaxCode,o.customer?.taxCode,o.mst)},salesStaff:{
staffCode:p(o.salesStaffCode,o.salesPersonCode,o.salesmanCode,o.nvbhCode,o.maNVBH,o.salesCode,o.salesStaffId),
staffName:p(o.salesStaffName,o.salesPersonName,o.salesmanName,o.nvbhName,o.maNVBHName,o.salesName,o.createdBy),phone:p(o.staffPhone,o.salesStaffPhone,o.salesPhone)},items:t,
promotions:r,offsets:n,totalPromotionAmount:A,totalOffsetAmount:y,nppDiscountAmount:C,payableAmount:N,
amountInWords:p(o.amountInWords,o.summary?.amountInWords,o.totalAmountText)||c(N||h)});return{company:{
code:p(o.distributor?.code,e.companyCode,process.env.PRINT_COMPANY_CODE,"3293"),
name:p(o.distributor?.name,e.companyName,process.env.PRINT_COMPANY_NAME,"Công Ty TNHH MTV Minh Khai"),
address:p(o.distributor?.address,e.companyAddress,process.env.PRINT_COMPANY_ADDRESS,"Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình"),
phone:p(o.distributor?.phone,e.companyPhone,process.env.PRINT_COMPANY_PHONE,""),taxCode:e.taxCode||process.env.PRINT_COMPANY_TAX||""},document:{id:o.id||o._id||"",
code:p(o.code,o.orderCode,o.refCode,o.id,o._id),invoiceCode:p(o.invoiceCode,o.invoiceNo,o.soHoaDon,o.documentCode,o.code),
customerOrderCode:p(o.customerOrderCode,o.soDonHang,o.orderCode,o.documentCode,o.code),
date:u(p(o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt)),
dateTime:m(p(o.orderDateTime,o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt)),
rawDate:p(o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt),type:p(o.invoiceType,o.type,o.orderType,o.orderSourceName,"NVTT"),note:o.note||"",
terms:p(o.terms,o.paymentTerms,"đáo hạn trong 7 ngày"),page:e.page||"1 / 1",vehicleNo:p(o.vehicleNo,o.truckNo,o.soXeTai),printMode:o.printMode||"",
title:o.printContract?.document?.title||o.printTitle||"",sourceCodes:Array.isArray(o.sourceCodes)?o.sourceCodes:o.printContract?.document?.sourceCodes||[],
masterOrderCodes:Array.isArray(o.masterOrderCodes)?o.masterOrderCodes:[],selectedMasterOrderCount:o.selectedMasterOrderCount||0},customer:{
code:p(o.customerCode,o.customer?.code,o.customerId),name:p(o.customerName,o.customer?.name,o.supplier,o.supplierName),address:p(o.customerAddress,o.customer?.address,o.address),
phone:p(o.customerPhone,o.customer?.phone,o.phone),taxCode:p(o.customerTaxCode,o.customer?.taxCode,o.mst)},staff:{
code:p(o.salesStaffCode,o.salesPersonCode,o.salesmanCode,o.nvbhCode,o.maNVBH,o.salesCode,o.salesStaffId),
name:p(o.salesStaffName,o.salesPersonName,o.salesmanName,o.nvbhName,o.maNVBHName,o.salesName,o.createdBy),phone:p(o.staffPhone,o.salesStaffPhone,o.salesPhone)},delivery:{
code:p(o.deliveryStaffCode,o.deliveryCode),name:p(o.deliveryStaffName,o.deliveryName),phone:p(o.deliveryPhone,o.deliveryStaffPhone),route:p(o.route,o.routeName,o.tuyen)},items:t,
promotions:r,displayRewards:n,warehouseGroups:a,masterKpis:Array.isArray(o.masterKpis)?o.masterKpis:[],masterKpiTotals:o.masterKpiTotals||{},totals:{totalQty:d,goodsAmount:g,
totalAmount:h,goodsAmountAfterPromotion:l,grossAmountBeforePromotion:f,promotionAmount:A,displayRewardOffset:y,nppDiscountAmount:C,promotionRate:O,discount:T,tax:P,paid:x,
payable:N,debt:S,orderCount:i(p(o.orderCount,o.totalOrders,Array.isArray(o.children)?o.children.length:0)),promotionValue:A,displayRewardTotal:y,
totalAmountText:p(o.amountInWords,o.summary?.amountInWords,o.totalAmountText)||c(N||h)},meta:{printedAt:(new Date).toLocaleString("vi-VN"),printedBy:e.printedBy||"",
copyLabel:e.copyLabel||"Liên 1"},erpInvoiceV46:v,printContract:o.printContract||null,printProfile:o.printProfile||o.printContract?.profile||"",formatMoney:s}}module.exports={
buildPrintData:G,buildDeliveryInvoicePayload:$,calculateDeliveryInvoiceSummary:E,paginateDeliveryInvoice:U,validateAgainstDmsSample:L,formatMoney:s,formatDate:u,formatDateTime:m,
numberToVietnameseWords:c};
