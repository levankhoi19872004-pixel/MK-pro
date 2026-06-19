/* GENERATED FILE — edit services/printDataBuilder.legacy.source/part-01.jsfrag, services/printDataBuilder.legacy.source/part-02.jsfrag, services/printDataBuilder.legacy.source/part-03.jsfrag and run npm run build:source-bundles. */
const{calculateCartonUnit:o}=require("../src/utils/common.util"),{normalizePickingZone:t,pickingZoneFrom:e,legacyPrintGroupCode:r,pickingZoneLabel:n,PICKING_ZONES:a}=require("../src/utils/pickingZone.util")
;function i(o){if(null==o||""===o)return 0;if("number"==typeof o)return Number.isFinite(o)?o:0;const t=String(o).trim();let e=t
;t.includes(",")?e=t.replace(/\./g,"").replace(",","."):/^-?\d{1,3}(\.\d{3})+$/.test(t)&&(e=t.replace(/\./g,""));const r=Number(e);return Number.isFinite(r)?r:0}function s(o){
return Math.round(i(o)).toLocaleString("vi-VN")}function u(o){if(!o)return(new Date).toLocaleDateString("vi-VN");const t=new Date(o)
;return Number.isNaN(t.getTime())?String(o||""):t.toLocaleDateString("vi-VN")}function c(o){if(!o)return(new Date).toLocaleString("vi-VN");const t=new Date(o)
;return Number.isNaN(t.getTime())?String(o||""):t.toLocaleString("vi-VN")}const m=["Không","Một","Hai","Ba","Bốn","Năm","Sáu","Bảy","Tám","Chín"];function d(o,t){
const e=Math.floor(o/100),r=Math.floor(o%100/10),n=o%10,a=[];return(e>0||t)&&a.push(`${m[e]} Trăm`),r>1?(a.push(`${m[r]} Mươi`),
1===n?a.push("Mốt"):5===n?a.push("Lăm"):n>0&&a.push(m[n])):1===r?(a.push("Mười"),5===n?a.push("Lăm"):n>0&&a.push(m[n])):n>0&&((e>0||t)&&a.push("Lẻ"),a.push(m[n])),a.join(" ")}
function p(o){let t=Math.round(Math.abs(i(o)));if(0===t)return"Không Đồng";const e=["","Nghìn","Triệu","Tỷ","Nghìn Tỷ","Triệu Tỷ"],r=[];for(;t>0;)r.push(t%1e3),t=Math.floor(t/1e3)
;const n=[];for(let o=r.length-1;o>=0;o-=1){const t=r[o];if(0===t)continue;const a=o<r.length-1&&t<100;n.push(`${d(t,a)} ${e[o]}`.trim())}
return`${n.join(" ").replace(/\s+/g," ")} Đồng`}function f(t,e){const r=o(t,e);return{cases:r.cartons,units:r.units,display:r.display}}function l(...o){
return o.find(o=>null!=o&&""!==o)??""}function A(...o){for(const t of o){const o=i(t);if(o>0)return o}return 0}function y(o){
return i(l(o.qty,o.quantity,o.soLuong,o.totalQty,o.totalQuantity))}function C(o){
return i(l(o.conversionRateAtOrder,o.packingQtyAtOrder,o.packingQty,o.conversionRate,o.unitsPerCase,o.qtyPerCase,o.packSize,o.product?.conversionRate,o.productSnapshot?.conversionRate,1))||1
}function T(o){return String(o||"").trim().toUpperCase()}function h(o){return String(o||"").trim().toUpperCase().replace(/\s+/g,"")}function P(o){
return String(o||"").trim().toUpperCase()}function g(o){return Math.round(i(o))}function N(o,t){const e=T(o.code).localeCompare(T(t.code),"vi",{numeric:!0});if(0!==e)return e
;const r=g(o.price)-g(t.price);return 0!==r?r:String(o.name||"").localeCompare(String(t.name||""),"vi",{sensitivity:"base",numeric:!0})}function x(o,t){
const e=String(o.name||o.productName||"").localeCompare(String(t.name||t.productName||""),"vi",{sensitivity:"base",numeric:!0});if(0!==e)return e
;const r=T(o.code||o.productCode).localeCompare(T(t.code||t.productCode),"vi",{numeric:!0});return 0!==r?r:g(o.price)-g(t.price)}function S(o){
return i(l(o.catalogSalePriceAtOrder,o.priceAfterTaxBeforePromotion,o.catalogSalePrice,o.product?.salePrice,o.productSnapshot?.salePrice,o.salePrice,o.giaBan,o.price,o.unitPrice,0))
}function v(o){return S(o)}function O(o){return i(l(o.discountPercent,o.promotionDiscountPercent,o.ckPercent,o.percent,o.rate,o.promotion?.discountPercent,0))}function D(o){
return i(l(o.discount,o.discountAmount,o.ck,o.ckAmount,0))}function M(o){
return null==o?"":Array.isArray(o)?o.map(M).filter(Boolean).join("; "):"object"==typeof o?l(o.description,o.name,o.title,o.content,o.note,o.ruleName,o.programName,o.promotionName,o.dienGiai,o.noiDung):String(o||"").trim()
}function b(o={}){
const t=[],e=[o.promotions,o.promotionRows,o.promotionDetails,o.appliedPromotions,o.appliedPromotionRows,o.discountRows,o.discounts,o.productPromotions,o.productSnapshot?.promotions,o.productSnapshot?.promotionRows,o.product?.promotions,o.product?.promotionRows]
;for(const o of e)Array.isArray(o)&&t.push(...o)
;const r=[o.promotion,o.promotionInfo,o.promotionDetail,o.appliedPromotion,o.discountInfo,o.productSnapshot?.promotion,o.product?.promotion];for(const o of r)o&&t.push(o)
;const n=l(o.promotionDescription,o.promotionName,o.promotionText,o.promotionContent,o.promotionNote,o.promoDescription,o.promoName,o.dienGiaiKhuyenMai,o.noiDungKhuyenMai,o.productSnapshot?.promotionDescription,o.productSnapshot?.promotionName,o.productSnapshot?.promotionText,o.product?.promotionDescription,o.product?.promotionName,o.product?.promotionText),a=l(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM,o.productSnapshot?.promotionCode,o.product?.promotionCode)
;return t.length||!n&&!a||t.push({code:a,promotionCode:a,description:n,name:n,discountPercent:o.discountPercent,percent:o.discountPercent,discountBeforeTax:o.discountBeforeTax,
beforeTax:o.discountBeforeTax,discountAfterTax:o.discountAfterTax||o.discount||o.discountAmount,afterTax:o.discountAfterTax||o.discount||o.discountAmount}),t}function R(o={},t={}){
const e=b(o),r=l(t.productCode,t.code,o.productCode,o.code,o.sku,o.maHang),n=l(t.productName,t.name,o.productName,o.name,o.tenHang),a=t.isPromo?"KM":"Bán",s=i(l(t.qty,t.quantity,o.qty,o.quantity,o.totalQty)),u=i(l(t.gsvAmount,t.lineAmount,t.amount,o.gsvAmount,o.amount)),c=Math.round(u/1.08),m=i(l(t.discountPercent,o.discountPercent,o.percent,o.rate)),d=i(l(o.discountAfterTax,o.afterTax,o.discountAmount,o.discount,t.discount,0)),p=i(l(o.discountBeforeTax,o.beforeTax,d?Math.round(d/1.08):0))
;!e.length&&(m>0||d>0||t.isPromo)&&e.push({code:l(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM),
description:t.isPromo?`Hàng khuyến mại theo dòng ${r} - ${n}`:`Chiết khấu/khuyến mại theo dòng ${r} - ${n}`,discountPercent:m,discountBeforeTax:p,discountAfterTax:d})
;const f=e.map(o=>{
const e=l(o.promotionCode,o.code,o.ctkmCode,o.maCTKM,o.programCode),u=M(o)||(t.isPromo?`Hàng khuyến mại theo dòng ${r} - ${n}`:`Khuyến mại theo dòng ${r} - ${n}`);return{
productCode:r,productName:n,lineType:a,quantity:s,promotionCode:e,code:e,description:u,name:u,qualifiedAmount:c,basisAmount:c,
discountPercent:i(l(o.discountPercent,o.percent,o.tyLe,o.rate,m)),percent:i(l(o.discountPercent,o.percent,o.tyLe,o.rate,m)),
discountBeforeTax:i(l(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue,p)),beforeTax:i(l(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue,p)),
discountAfterTax:i(l(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount,d)),
afterTax:i(l(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount,d))}}),A=new Set;return f.filter(o=>{
const t=[o.productCode,o.lineType,o.promotionCode,o.description,o.discountAfterTax,o.discountPercent].join("|");return!A.has(t)&&(A.add(t),
o.description||o.promotionCode||o.discountAfterTax||o.discountPercent)})}function B(o=[]){const t=[];for(const e of o){const o=Array.isArray(e.promotionRows)?e.promotionRows:[]
;for(const r of o)t.push({productCode:e.productCode||r.productCode,productName:e.productName||r.productName,lineType:e.isPromotionGift||e.isPromo?"KM":r.lineType||"Bán",
quantity:e.quantity||r.quantity,promotionCode:r.promotionCode||r.code||e.promotionCode||"",code:r.promotionCode||r.code||e.promotionCode||"",description:r.description||r.name||"",
qualifiedAmount:i(r.qualifiedAmount||r.basisAmount),basisAmount:i(r.qualifiedAmount||r.basisAmount),discountPercent:i(r.discountPercent||r.percent),
percent:i(r.discountPercent||r.percent),discountBeforeTax:i(r.discountBeforeTax||r.beforeTax),beforeTax:i(r.discountBeforeTax||r.beforeTax),
discountAfterTax:i(r.discountAfterTax||r.afterTax),afterTax:i(r.discountAfterTax||r.afterTax)})}return q(t)}function q(o=[]){const t=new Map;for(const e of o){
const o=[e.productCode||"",e.lineType||"",e.promotionCode||e.code||"",e.description||e.name||"",e.discountPercent||0].join("|"),r=t.get(o)
;r?(r.qualifiedAmount=i(r.qualifiedAmount)+i(e.qualifiedAmount),r.basisAmount=r.qualifiedAmount,r.discountBeforeTax=i(r.discountBeforeTax)+i(e.discountBeforeTax),
r.beforeTax=r.discountBeforeTax,r.discountAfterTax=i(r.discountAfterTax)+i(e.discountAfterTax),r.afterTax=r.discountAfterTax,r.quantity=i(r.quantity)+i(e.quantity)):t.set(o,{...e})
}return Array.from(t.values())}function H(o){return i(l(o.tax,o.vat,o.taxAmount,o.vatAmount,0))}function I(o,s,u=null){
const c=t(e(o),a.HC),m=r(c),d=n(c),p=y(o),A=C(o),T=S(o),h=i(l(o.preTaxPriceAtOrder,o.priceBeforeTaxBeforePromotion,o.listPriceBeforeVat,o.priceBeforeTax,o.priceBeforeVat,Math.round(T/1.08))),P=O(o),g=i(l(o.priceAfterTaxAfterPromotion,o.priceAfterPromotion,o.priceAfterVatAfterDiscount,o.netPrice,o.priceAfterDiscount,o.finalPrice,o.orderPrice,o.manualPrice,0)),N=P>0?Math.floor(T*(1-P/100)):g||T,x=D(o),v=String(l(o.lineType,o.type,o.kind,o.itemType,o.isPromo?"PROMO":"SALE")||"SALE").toUpperCase(),M="PROMO"===v||"PROMOTION"===v||"KM"===v||!0===o.isPromo,b=M?"PROMO":"RETURN"===v?"RETURN":"IMPORT"===v?"IMPORT":"SALE",B="PROMO"===b?"Xuất khuyến mại":"RETURN"===b?"Hàng trả nhập kho":"IMPORT"===b?"Hàng nhập kho":"Hàng bán",q=M?0:Math.round((N-N/1.08)*p),H=M?0:i(l(o.vatAmountAtOrder,o.vatAmount,o.taxAmount,o.tax,q)),I=M?0:Math.round(N*p),w=M?0:i(l(o.lineAmountAtOrder,o.lineAmount,o.amount,I)),Q=f(p,A),k=R(o,{
code:l(o.code,o.productCode,o.sku,o.maHang),productCode:l(o.productCode,o.code,o.sku,o.maHang),name:l(o.name,o.productName,o.tenHang,o.productSnapshot?.name,o.product?.name),
productName:l(o.productName,o.name,o.tenHang,o.productSnapshot?.name,o.product?.name),qty:p,quantity:p,gsvAmount:Math.round(p*T),amount:w,discount:x,discountPercent:P,isPromo:M})
;return{stt:s+1,code:l(o.code,o.productCode,o.sku,o.maHang),productCode:l(o.productCode,o.code,o.sku,o.maHang),
name:l(o.name,o.productName,o.tenHang,o.productSnapshot?.name,o.product?.name),productName:l(o.productName,o.name,o.tenHang,o.productSnapshot?.name,o.product?.name),
unit:l(o.unit,o.dvt,o.uom,o.productSnapshot?.unit,o.product?.unit,"Cái"),pack:A,conversionRate:A,qty:p,quantity:p,cartonQty:Q.cases,caseQty:Q.cases,unitQty:Q.units,
caseDisplay:`${Q.cases}/${Q.units}`,price:T,salePrice:T,catalogSalePrice:T,priceBeforeTax:h,priceBeforeVat:h,listPriceBeforeVat:h,priceAfterTaxBeforePromotion:T,
priceAfterVatBeforeDiscount:T,listPriceAfterVat:T,discountPercent:P,priceAfterPromotion:N,priceAfterDiscount:N,priceAfterVatAfterDiscount:N,gsvAmount:Math.round(p*T),nivAmount:w,
discount:x,tax:H,vatAmount:H,amount:w,lineAmount:w,lineType:b,isPromo:M,lineTypeName:B,note:o.note||"",sourceOrderCode:u?l(u.code,u.orderCode,u.id):"",pickingZone:c,
warehouseCode:m,warehouseName:d,sourceOrderCodes:Array.isArray(o.sourceOrderCodes)?o.sourceOrderCodes:[],
promotionCode:l(o.promotionCode,o.promoCode,o.ctkmCode,o.maCTKM,k[0]?.promotionCode),
promotionDescription:l(o.promotionDescription,o.promotionName,o.promotionText,k[0]?.description),promotionRows:k}}function w(o){
const t=Array.isArray(o.items)?o.items:[],e=Array.isArray(o.lines)?o.lines:[],r=t.length?t:e;if(r.length)return r.map((o,t)=>I(o,t))
;const n=Array.isArray(o.children)?o.children:[],a=[];return n.forEach(o=>{(Array.isArray(o.items)?o.items:[]).forEach(t=>a.push({item:t,child:o}))}),
a.map((o,t)=>I(o.item,t,o.child))}function Q(o){
return(Array.isArray(o.promotions)?o.promotions:Array.isArray(o.promotionRows)?o.promotionRows:Array.isArray(o.discounts)?o.discounts:[]).map((o,t)=>{
const e=l(o.code,o.promotionCode,o.ctkmCode,o.maCTKM),r=l(o.description,o.name,o.title,o.promotionName,o.tenCTKM),n=i(l(o.qualifiedAmount,o.basisAmount,o.baseAmount,o.giaTriHangHoa,o.amount)),a=i(l(o.discountPercent,o.percent,o.tyLe,o.rate)),s=i(l(o.discountBeforeTax,o.beforeTax,o.amountBeforeTax,o.tienCKTruocThue)),u=i(l(o.discountAfterTax,o.afterTax,o.amountAfterTax,o.tienCKSauThue,o.discountAmount))
;return{stt:t+1,code:e,promotionCode:e,name:r,description:r,basisAmount:n,qualifiedAmount:n,percent:a,discountPercent:a,beforeTax:s,discountBeforeTax:s,afterTax:u,
discountAfterTax:u,type:l(o.type,o.kind,o.loai)}})}function k(o){
return(Array.isArray(o.offsets)?o.offsets:Array.isArray(o.displayRewards)?o.displayRewards:Array.isArray(o.rewardRows)?o.rewardRows:Array.isArray(o.displayRewardRows)?o.displayRewardRows:Array.isArray(o.deductions)?o.deductions:Array.isArray(o.offsetRows)?o.offsetRows:[]).map((o,t)=>{
const e=l(o.programCode,o.code,o.rewardCode,o.displayCode,o.cttbCode,o.maCTTrungBay,o.maCT),r=l(o.description,o.name,o.title,o.programName,o.noiDung,o.content),n=l(o.month,o.displayMonth,o.thangTrungBay),a=i(l(o.offsetAmount,o.cashAmount,o.debtOffsetAmount,o.canTruNo,o.amount))
;return{stt:t+1,code:e,programCode:e,name:r,description:r,month:n,goodsAmount:i(l(o.goodsAmount,o.goodsRewardAmount,o.hangHoa,o.chiTraHangHoa)),
quantityText:l(o.quantityText,o.caseUnitText,o.cartonUnitText,o.soLuongThungLe),offsetAmount:a}})}function K(o=[],t={}){const e=new Map,r=new Map;for(const t of o){
const o=String(t.warehouseCode||"KHO_HC").trim()||"KHO_HC",n=String(t.warehouseName||("KHO_PC"===o?"KHO PC":"KHO HC")).trim();e.has(o)||(e.set(o,{code:o,name:n,items:[],
saleItems:[],promoItems:[],returnItems:[],importItems:[],totalQty:0,saleQty:0,promoQty:0,totalAmount:0}),r.set(o,new Map))
;const a=e.get(o),s=r.get(o),u=t.isPromo||"PROMO"===t.lineType?"PROMO":"SALE",c=T(l(t.code,t.productCode)),m=h(t.pack),d=P(t.unit),p="PROMO"===u?0:g(t.price)
;"1"===process.env.PRINT_DEBUG_MERGE&&console.log("[printDataBuilder.buildWarehouseGroups] source item",{code:t.code,name:t.name,unit:t.unit,pack:t.pack,price:t.price,
normalizedCode:c,normalizedUnit:d,normalizedPack:m,normalizedPrice:p});const A=[o,u,c,p].join("|");let y=s.get(A);y||(y={...t,code:c||t.code,productCode:c||t.productCode||t.code,
unit:t.unit||d,pack:i(t.pack)||i(m)||1,price:p,salePrice:p,__mergeKey:A,qty:0,amount:0,sourceOrderCodes:[]},s.set(A,y),a.items.push(y),
"PROMO"===u?a.promoItems.push(y):"RETURN"===u?a.returnItems.push(y):"IMPORT"===u?a.importItems.push(y):a.saleItems.push(y)),y.qty+=i(t.qty),y.quantity=y.qty,y.amount+=i(t.amount),
y.lineAmount=y.amount;const C=f(y.qty,y.pack);y.caseQty=C.cases,y.cartonQty=C.cases,y.unitQty=C.units,y.caseDisplay=C.display,
t.sourceOrderCode&&!y.sourceOrderCodes.includes(t.sourceOrderCode)&&y.sourceOrderCodes.push(t.sourceOrderCode)
;for(const o of t.sourceOrderCodes||[])o&&!y.sourceOrderCodes.includes(o)&&y.sourceOrderCodes.push(o);a.totalQty+=i(t.qty),"PROMO"===u?a.promoQty+=i(t.qty):a.saleQty+=i(t.qty),
a.totalAmount+=i(t.amount)}const n=t.sortByProductName?x:N;for(const o of e.values())o.saleItems.sort(n),o.promoItems.sort(n),o.returnItems.sort(n),o.importItems.sort(n),
o.items=[...o.saleItems,...o.promoItems,...o.returnItems,...o.importItems],o.items.forEach((o,t)=>{o.stt=t+1,delete o.__mergeKey});const a=["KHO_HC","KHO_PC"]
;return Array.from(e.values()).sort((o,t)=>{const e=a.indexOf(o.code),r=a.indexOf(t.code);return-1!==e||-1!==r?(-1===e?99:e)-(-1===r?99:r):o.name.localeCompare(t.name,"vi")})}
function V(o){const[t,e]=String(o||"0/0").split("/");return{cartonQty:i(t),csSuUnitQty:i(e)}}function _(o,t){
const e=V(o.csSu||o.quantityCsSu||o.caseDisplay),r=i(l(o.quantity,o.qty,o.totalQty,o.csSuUnitQty,o.unitQty)),n=Math.max(1,i(l(o.conversionRate,o.pack,o.packingQty,o.unitsPerCase,o.qtyPerCase,1))||1),a=A(o.priceAfterTaxBeforePromotion,o.priceAfterVatBeforeDiscount,o.listPriceAfterVat,o.catalogSalePriceAtOrder,o.salePrice,o.price,o.unitPrice),s=A(o.preTaxPriceAtOrder,o.priceBeforeTaxBeforePromotion,o.priceBeforeTax,o.priceBeforeVat,o.listPriceBeforeVat,Math.round(a/1.08)),u=i(o.discountPercent),c=A(o.priceAfterTaxAfterPromotion,o.finalPriceAtOrder,o.finalPrice,o.priceAfterPromotion,o.priceAfterVatAfterDiscount,o.priceAfterDiscount,u>0?Math.round(a*(1-u/100)):a),m=A(o.lineAmountAtOrder,o.lineAmount,o.amount,Math.round(r*c)),d=Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType)?0:A(o.vatAmountAtOrder,o.vatAmount,o.tax,o.taxAmount,m>0?Math.round(m-m/1.08):0,Math.round((c-c/1.08)*r))
;return{lineNo:o.lineNo||o.stt||t+1,productCode:String(l(o.productCode,o.code,o.sku,o.maHang)).trim(),productName:String(l(o.productName,o.name,o.tenHang)).trim(),conversionRate:n,
quantityCsSu:o.csSu||o.quantityCsSu||o.caseDisplay||`${e.cartonQty}/${e.csSuUnitQty}`,cartonQty:i(l(o.cartonQty,o.caseQty,e.cartonQty)),
unitQtyFromCsSu:i(l(o.unitQtyFromCsSu,o.unitQty,e.csSuUnitQty)),unitQty:i(l(o.unitQty,e.csSuUnitQty)),csSuUnitQty:i(l(o.csSuUnitQty,o.unitQty,e.csSuUnitQty)),quantity:r,
priceBeforeTaxBeforePromotion:s,priceBeforeTax:s,priceAfterTaxBeforePromotion:a,catalogSalePrice:a,priceAfterTaxAfterPromotion:c,priceAfterPromotion:c,discountPercent:u,
vatAmount:d,lineAmount:m,isPromotionGift:Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType),promotionCode:o.promotionCode||"",
promotionRows:Array.isArray(o.promotionRows)?o.promotionRows:R(o,{productCode:String(l(o.productCode,o.code,o.sku,o.maHang)).trim(),
productName:String(l(o.productName,o.name,o.tenHang)).trim(),quantity:r,qty:r,gsvAmount:r*a,lineAmount:m,discountPercent:u,
isPromo:Boolean(o.isPromotionGift||o.isPromo||"PROMO"===o.lineType)})}}function E(o={}){return{productCode:String(o.productCode||o.maHang||"").trim(),
productName:String(o.productName||o.tenHang||"").trim(),lineType:o.lineType||o.type||"",quantity:i(o.quantity||o.qty),promotionCode:String(o.promotionCode||o.code||"").trim(),
code:String(o.promotionCode||o.code||"").trim(),description:String(o.description||o.name||"").trim(),qualifiedAmount:i(o.qualifiedAmount||o.basisAmount),
basisAmount:i(o.qualifiedAmount||o.basisAmount),discountPercent:i(o.discountPercent||o.percent),percent:i(o.discountPercent||o.percent),
discountBeforeTax:i(o.discountBeforeTax||o.beforeTax),beforeTax:i(o.discountBeforeTax||o.beforeTax),discountAfterTax:i(o.discountAfterTax||o.afterTax),
afterTax:i(o.discountAfterTax||o.afterTax)}}function L(o={}){return{programCode:String(o.programCode||o.code||"").trim(),description:String(o.description||o.name||"").trim(),
displayMonth:o.displayMonth||o.month||"",month:o.month||o.displayMonth||"",goodsAmount:i(o.goodsAmount),quantityText:o.quantityText||o.quantity||"",offsetAmount:i(o.offsetAmount)}}
function U(o={}){
const t=Array.isArray(o.items)?o.items:[],e=Array.isArray(o.promotions)?o.promotions:[],r=Array.isArray(o.offsets)?o.offsets:[],n=t.reduce((o,t)=>o+i(t.quantity),0),a=t.reduce((o,t)=>o+i(t.lineAmount),0),s=t.reduce((o,t)=>o+i(t.quantity)*i(t.priceAfterTaxBeforePromotion),0),u=t.reduce((o,t)=>o+i(t.vatAmount),0),c=void 0!==o.totalPromotionAmount?i(o.totalPromotionAmount):e.reduce((o,t)=>o+i(t.discountAfterTax),0),m=void 0!==o.totalOffsetAmount?i(o.totalOffsetAmount):r.reduce((o,t)=>o+i(t.offsetAmount),0),d=i(o.nppDiscountAmount||o.summary?.nppDiscountAmount)
;return{totalQty:n,totalVatAmount:u,goodsAmountAfterPromotion:a,grossAmountBeforePromotion:s,totalPromotionAmount:c,promotionAmount:c,totalOffsetAmount:m,displayRewardOffset:m,
nppDiscountAmount:d,payableAmount:void 0!==o.payableAmount?i(o.payableAmount):a-m-d,promotionRate:s>0?Number(((c+d)/s*100).toFixed(2)):0}}function $(o={}){
const t=Array.isArray(o.items)?o.items:[],e=Array.isArray(o.promotions)?o.promotions:[],r=Array.isArray(o.offsets)?o.offsets:[],n=e.length+r.length,a=Math.max(1,Math.ceil(t.length/24)),i=n>4||t.length>18||r.length>0,s=n>0&&i?1:0
;return{pagesPerCopy:a+s,copies:["Liên 1","Liên 2"],showPromotionHeaderOnFirstPage:s>0,itemPageSize:24,itemPageCount:a,detailRows:n,firstPageItems:t.slice(0,24),
detailPagePromotions:e,detailPageOffsets:r}}function G(o={}){
const t=[],e=[["header.invoiceCode",o.header?.invoiceCode],["header.orderCode",o.header?.orderCode],["customer.customerCode",o.customer?.customerCode],["customer.customerName",o.customer?.customerName],["salesStaff.staffCode",o.salesStaff?.staffCode],["items",Array.isArray(o.items)&&o.items.length]]
;for(const[o,r]of e)r||t.push(`Thiếu ${o}`)
;const r=U(o),n=o.summary||{},a=[["totalQty",n.totalQty,r.totalQty],["goodsAmountAfterPromotion",n.goodsAmountAfterPromotion,r.goodsAmountAfterPromotion],["grossAmountBeforePromotion",n.grossAmountBeforePromotion,r.grossAmountBeforePromotion],["payableAmount",n.payableAmount,r.payableAmount]]
;for(const[o,e,r]of a)Math.abs(i(e)-i(r))>1&&t.push(`${o} lệch: ${e} != ${r}`);return{ok:0===t.length,errors:t}}function W(o={}){
const t=Array.isArray(o.items)?o.items.map(_):[],e=Array.isArray(o.promotions)?o.promotions.map(E):[],r=B(t),n=r.length?r:e,a=Array.isArray(o.offsets)?o.offsets.map(L):[],s={
documentType:"DELIVERY_PAYMENT_INVOICE",title:"PHIẾU GIAO NHẬN VÀ THANH TOÁN",header:{invoiceCode:o.invoiceCode||o.header?.invoiceCode||"",
orderCode:o.orderCode||o.header?.orderCode||"",orderDateTime:o.orderDateTime||o.header?.orderDateTime||"",invoiceType:o.invoiceType||o.header?.invoiceType||"Từ NVTT",
paymentTerm:o.paymentTerm||o.header?.paymentTerm||"đáo hạn trong 7 ngày",truckNo:o.truckNo||o.header?.truckNo||"",taxCode:o.taxCode||o.header?.taxCode||""},distributor:{
code:o.distributorCode||o.distributor?.code||"",name:o.distributorName||o.distributor?.name||"",phone:o.distributorPhone||o.distributor?.phone||"",
address:o.distributorAddress||o.distributor?.address||""},customer:{customerCode:o.customerCode||o.customer?.customerCode||o.customer?.code||"",
customerName:o.customerName||o.customer?.customerName||o.customer?.name||"",phone:o.customerPhone||o.customer?.phone||"",
deliveryAddress:o.deliveryAddress||o.customer?.deliveryAddress||o.customer?.address||""},salesStaff:{staffCode:o.salesStaffCode||o.salesStaff?.staffCode||o.salesStaff?.code||"",
staffName:o.salesStaffName||o.salesStaff?.staffName||o.salesStaff?.name||"",phone:o.salesStaffPhone||o.salesStaff?.phone||""},items:t,promotions:n,offsets:a,summary:{
amountInWords:o.amountInWords||o.summary?.amountInWords||"",nppDiscountAmount:i(o.nppDiscountAmount||o.summary?.nppDiscountAmount)}};return s.summary={...s.summary,...U({...s,
totalPromotionAmount:o.totalPromotionAmount,totalOffsetAmount:o.totalOffsetAmount,nppDiscountAmount:o.nppDiscountAmount,payableAmount:o.payableAmount})},s.pagination=$(s),
s.validation=G(s),s}function Y(o={},t={}){const e=w(o),r=Q(o),n=k(o),a=K(e,{sortByProductName:"PRODUCT_NAME_ASC"===o.itemSort||String(o.printMode||"").startsWith("MASTER_")
}),m=i(l(o.totalQuantity,o.totalQty,o.summary?.totalQty,e.reduce((o,t)=>o+t.qty,0))),d=i(l(o.grossAmountBeforePromotion,o.totalGrossAmount,o.grossAmount,o.summary?.grossAmountBeforePromotion,o.goodsAmount,o.subTotal,o.subtotal,e.reduce((o,t)=>o+t.gsvAmount,0))),f=i(l(o.goodsAmountAfterPromotion,o.netAmount,o.summary?.goodsAmountAfterPromotion,o.totalAmount,o.grandTotal,e.reduce((o,t)=>o+t.amount,0))),A=i(l(o.promotionValue,o.totalPromotionValue,o.totalPromotionAmount,o.totalDiscountAmount,o.promotionAmount,o.discountAmount,o.summary?.promotionAmount,r.reduce((o,t)=>o+(t.afterTax||t.beforeTax||0),0))),y=i(l(o.displayRewardTotal,o.totalDisplayReward,o.rewardAmount,o.offsetAmount,o.summary?.displayRewardOffset,n.reduce((o,t)=>o+t.offsetAmount,0))),C=i(l(o.nppDiscountAmount,o.summary?.nppDiscountAmount,0)),T=i(l(o.discount,o.discountAmount,o.totalDiscount,A)),h=i(l(o.tax,o.vat,o.taxAmount,e.reduce((o,t)=>o+t.tax,0))),P=f,g=d,N=i(l(o.paidAmount,o.paid,o.collectedAmount,o.cashReceived)),x=i(l(o.payableAmount,o.mustPay,o.summary?.payableAmount,P-y)),S=i(l(o.debtAmount,o.debt,Math.max(x-N,0))),v=i(l(o.promotionRate,o.summary?.promotionRate,g?(A+C)/g*100:0)),O=W({
...o,invoiceCode:l(o.invoiceCode,o.invoiceNo,o.soHoaDon,o.documentCode,o.code),orderCode:l(o.customerOrderCode,o.soDonHang,o.orderCode,o.documentCode,o.code),
orderDateTime:c(l(o.orderDateTime,o.orderDate,o.documentDate,o.date,o.createdAt)),invoiceType:l(o.invoiceType,o.invoiceTypeName,o.orderSourceName,"Từ NVTT"),
paymentTerm:l(o.terms,o.paymentTerms,o.paymentTerm,"đáo hạn trong 7 ngày"),truckNo:l(o.vehicleNo,o.truckNo,o.soXeTai),taxCode:l(o.customerTaxCode,o.customer?.taxCode,o.mst),
distributor:{code:l(o.distributor?.code,t.companyCode,process.env.PRINT_COMPANY_CODE,"3293"),
name:l(o.distributor?.name,t.companyName,process.env.PRINT_COMPANY_NAME,"Công Ty TNHH MTV Minh Khai"),
address:l(o.distributor?.address,t.companyAddress,process.env.PRINT_COMPANY_ADDRESS,"Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình"),
phone:l(o.distributor?.phone,t.companyPhone,process.env.PRINT_COMPANY_PHONE,"")},customer:{customerCode:l(o.customerCode,o.customer?.code,o.customerId),
customerName:l(o.customerName,o.customer?.name,o.supplier,o.supplierName),deliveryAddress:l(o.customerAddress,o.customer?.address,o.address),
phone:l(o.customerPhone,o.customer?.phone,o.phone),taxCode:l(o.customerTaxCode,o.customer?.taxCode,o.mst)},salesStaff:{
staffCode:l(o.salesStaffCode,o.salesPersonCode,o.salesmanCode,o.nvbhCode,o.maNVBH,o.salesCode,o.salesStaffId),
staffName:l(o.salesStaffName,o.salesPersonName,o.salesmanName,o.nvbhName,o.maNVBHName,o.salesName,o.createdBy),phone:l(o.staffPhone,o.salesStaffPhone,o.salesPhone)},items:e,
promotions:r,offsets:n,totalPromotionAmount:A,totalOffsetAmount:y,nppDiscountAmount:C,payableAmount:x,
amountInWords:l(o.amountInWords,o.summary?.amountInWords,o.totalAmountText)||p(x||P)});return{company:{
code:l(o.distributor?.code,t.companyCode,process.env.PRINT_COMPANY_CODE,"3293"),
name:l(o.distributor?.name,t.companyName,process.env.PRINT_COMPANY_NAME,"Công Ty TNHH MTV Minh Khai"),
address:l(o.distributor?.address,t.companyAddress,process.env.PRINT_COMPANY_ADDRESS,"Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình"),
phone:l(o.distributor?.phone,t.companyPhone,process.env.PRINT_COMPANY_PHONE,""),taxCode:t.taxCode||process.env.PRINT_COMPANY_TAX||""},document:{id:o.id||o._id||"",
code:l(o.code,o.orderCode,o.refCode,o.id,o._id),invoiceCode:l(o.invoiceCode,o.invoiceNo,o.soHoaDon,o.documentCode,o.code),
customerOrderCode:l(o.customerOrderCode,o.soDonHang,o.orderCode,o.documentCode,o.code),
date:u(l(o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt)),
dateTime:c(l(o.orderDateTime,o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt)),
rawDate:l(o.orderDate,o.deliveryDate,o.importDate,o.returnDate,o.documentDate,o.date,o.createdAt),type:l(o.invoiceType,o.type,o.orderType,o.orderSourceName,"NVTT"),note:o.note||"",
terms:l(o.terms,o.paymentTerms,"đáo hạn trong 7 ngày"),page:t.page||"1 / 1",vehicleNo:l(o.vehicleNo,o.truckNo,o.soXeTai),printMode:o.printMode||"",
title:o.printContract?.document?.title||o.printTitle||"",sourceCodes:Array.isArray(o.sourceCodes)?o.sourceCodes:o.printContract?.document?.sourceCodes||[],
masterOrderCodes:Array.isArray(o.masterOrderCodes)?o.masterOrderCodes:[],selectedMasterOrderCount:o.selectedMasterOrderCount||0},customer:{
code:l(o.customerCode,o.customer?.code,o.customerId),name:l(o.customerName,o.customer?.name,o.supplier,o.supplierName),address:l(o.customerAddress,o.customer?.address,o.address),
phone:l(o.customerPhone,o.customer?.phone,o.phone),taxCode:l(o.customerTaxCode,o.customer?.taxCode,o.mst)},staff:{
code:l(o.salesStaffCode,o.salesPersonCode,o.salesmanCode,o.nvbhCode,o.maNVBH,o.salesCode,o.salesStaffId),
name:l(o.salesStaffName,o.salesPersonName,o.salesmanName,o.nvbhName,o.maNVBHName,o.salesName,o.createdBy),phone:l(o.staffPhone,o.salesStaffPhone,o.salesPhone)},delivery:{
code:l(o.deliveryStaffCode,o.deliveryCode),name:l(o.deliveryStaffName,o.deliveryName),phone:l(o.deliveryPhone,o.deliveryStaffPhone),route:l(o.route,o.routeName,o.tuyen)},items:e,
promotions:r,displayRewards:n,warehouseGroups:a,masterKpis:Array.isArray(o.masterKpis)?o.masterKpis:[],masterKpiTotals:o.masterKpiTotals||{},totals:{totalQty:m,goodsAmount:g,
totalAmount:P,goodsAmountAfterPromotion:f,grossAmountBeforePromotion:d,promotionAmount:A,displayRewardOffset:y,nppDiscountAmount:C,promotionRate:v,discount:T,tax:h,paid:N,
payable:x,debt:S,orderCount:i(l(o.orderCount,o.totalOrders,Array.isArray(o.children)?o.children.length:0)),promotionValue:A,displayRewardTotal:y,
totalAmountText:l(o.amountInWords,o.summary?.amountInWords,o.totalAmountText)||p(x||P)},meta:{printedAt:(new Date).toLocaleString("vi-VN"),printedBy:t.printedBy||"",
copyLabel:t.copyLabel||"Liên 1"},erpInvoiceV46:O,printContract:o.printContract||null,printProfile:o.printProfile||o.printContract?.profile||"",formatMoney:s}}module.exports={
buildPrintData:Y,buildDeliveryInvoicePayload:W,calculateDeliveryInvoiceSummary:U,paginateDeliveryInvoice:$,validateAgainstDmsSample:G,formatMoney:s,formatDate:u,formatDateTime:c,
numberToVietnameseWords:p};
