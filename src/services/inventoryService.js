/* GENERATED FILE — edit src/services/inventoryService.source/part-01.jsfrag, src/services/inventoryService.source/part-02.jsfrag, src/services/inventoryService.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),t=require("../models/InventoryLegacy"),o=require("../models/Product"),r=require("../models/StockTransaction"),n=require("../models/ImportOrder"),d=require("../models/SalesOrder"),a=require("../models/ReturnOrder"),{makeId:i,toNumber:u,normalizeText:c}=require("../utils/common.util"),{STOCK_WAREHOUSE_CODE:s,STOCK_WAREHOUSE_NAME:p}=require("../constants/business.constants"),y=require("./inventoryStock.service"),{assertDestructiveInventoryOperation:l}=require("../utils/inventoryMaintenance.util"),m=require("../domain/reconciliation/InventoryRebuildService"),{mainInventoryFilter:f}=require("../domain/inventory/mainInventoryReadPolicy")
;function C(t){return e.toDateOnly(t||e.todayVN())}function I(e={}){return!["void","cancelled","canceled","deleted"].includes(String(e.status||"").toLowerCase())}function h(){
return s||"MAIN"}function w(){return p||"Kho chính"}function S(e){return"IN"===String(e||"").trim().toUpperCase()?"IN":"OUT"}function g(e={}){
return String(e.sourceType||e.refType||e.type||"").trim().toUpperCase()||"STOCK_MOVEMENT"}
function N({sourceType:e,sourceId:t,sourceCode:o,productCode:r,productId:n,warehouseCode:d,warehouseId:a,direction:i,type:u}={}){
const c=String(t||o||"").trim(),s=String(r||n||"").trim(),p=String(d||a||h()).trim(),y=String(u||i||"").trim().toUpperCase()
;return[String(e||"").trim().toUpperCase(),c,s,p,y].join("|")}function T(e){return e&&(11e3===e.code||String(e.message||"").includes("E11000"))}function v(e,t){
return e&&"function"==typeof e.session?e.session(t||null):e}async function A(e,t=null){if(!e)return null;const o=v(r.findOne({idempotencyKey:e}),t)
;return"function"==typeof o?.lean?o.lean():o}function b(e={}){return String(e.productCode||e.code||e.productId||e.id||"").trim()}function O(e={}){
return u(e.stockQuantity??e.deliveredQuantity??e.quantity??e.qty??e.totalQty??e.returnQuantity??e.returnQty)}function Q(e=""){return String(e||"").trim().toUpperCase()}
function q(e=""){const t=String(e||"").trim();return/^\d+$/.test(t)?Number(t):null}function k(e={}){return u(e.onHand??e.quantity??e.qty??e.availableQty)}
function E({canonicalProductCode:t="",canonicalWarehouseCode:o=h(),now:r=e.nowIso(),reason:n="MERGED_TO_MAIN_CURRENT_STOCK"}={}){return{$set:{qty:0,quantity:0,onHand:0,
availableQty:0,reservedQty:0,status:"merged",inventoryStatus:"merged_to_main",mergedToProductCode:String(t||"").trim(),mergedToWarehouseCode:String(o||h()).trim(),mergedAt:r,
mergeReason:n,updatedAt:r}}}async function _(e={},o={},r=null){return e&&Object.keys(e).length?v(t.updateMany(e,E(o)),r):{acknowledged:!0,matchedCount:0,modifiedCount:0}}
function M(e=[]){const t=new Map;for(const o of Array.isArray(e)?e:[]){const e=Q(o.productCode||o.code||o.sku||o.productId||o.id);if(!e)continue
;const r=Math.abs(u(o.stockQuantity??o.deliveredQuantity??o.quantity??o.qty??o.totalQty??o.returnQuantity??o.returnQty));if(r<=0)continue;t.has(e)||t.set(e,{...o,productCode:e,
productId:String(o.productId||o.id||e).trim(),productName:String(o.productName||o.name||"").trim(),quantity:0});const n=t.get(e);n.quantity+=r,n.qty=n.quantity}
return Array.from(t.values())}async function $(e={}){const t=b(e);return t?o.findOne({$or:[{code:t},{id:t},{_id:/^[a-f0-9]{24}$/i.test(t)?t:void 0
}].filter(e=>void 0!==Object.values(e)[0])}):null}async function R(e={}){const o=String(e.productCode||e.code||e.productId||"").trim(),r=String(e.productId||e.id||o||"").trim()
;if(!o&&!r)return null;const n=h();return t.findOne({$or:[o?{productCode:o,warehouseCode:n}:null,r?{productId:r,warehouseCode:n}:null].filter(Boolean)})}
async function U({productCode:o,productId:r,session:n=null}={}){const d=Q(o||""),a=String(r||"").trim(),c=q(d),s=q(a),p=[d?{productCode:d}:null,null!==c?{productCode:c}:null,a?{
productId:a}:null,null!==s?{productId:s}:null,d?{code:d}:null,null!==c?{code:c}:null,a?{sku:a}:null,null!==s?{sku:s}:null].filter(Boolean);if(!p.length)return null;const y=t.find({
$or:p}),l=await v(y,n).lean();if(!l.length)return null
;const m=h(),f=l.reduce((e,t)=>e+k(t),0),C=l.reduce((e,t)=>e+u(t.reservedQty??t.reserved??0),0),I=l.find(e=>String(e.warehouseCode||"").trim()===m)||l[0]||{},S=e.nowIso(),g={
id:I.id||i("IV"),productId:String(I.productId||a||d).trim(),productCode:Q(I.productCode||d||a),productName:String(I.productName||I.name||"").trim(),warehouseId:m,warehouseCode:m,
warehouseName:w(),qty:f,quantity:f,onHand:f,reservedQty:C,availableQty:f-C,updatedAt:S,lastTransactionAt:I.lastTransactionAt||S}
;if(1===l.length&&String(I.warehouseCode||"").trim()===m){const e=I._id?{_id:I._id}:{productCode:g.productCode,warehouseCode:m};return await v(t.updateOne(e,{$set:g}),n),{...I,...g
}}await _({$or:p},{canonicalProductCode:g.productCode,canonicalWarehouseCode:m,now:S},n);const N={...I,_id:void 0,...g};return await v(t.updateOne({productCode:g.productCode,
warehouseCode:m},{$set:N,$setOnInsert:{id:N.id||i("IV")}},{upsert:!0}),n),N}async function D({productCode:e,productId:t,productName:o,requiredQty:r=0,session:n=null}={}){
const d=String(e||t||"").trim(),a=h(),i=Math.abs(u(r));if(!d||i<=0)return{ok:!0,availableQty:0,requiredQty:i};const c=await y.getAvailableStock(e||t),s=u(c.availableQty);if(s<i){
const e=new Error(`Không đủ tồn kho: mã SP ${d}${o?` - ${o}`:""}, tồn hiện tại ${s}, cần xuất ${i}`);throw e.code="INSUFFICIENT_STOCK",e.productCode=d,e.warehouseCode=a,
e.availableQty=s,e.requiredQty=i,e}return{ok:!0,availableQty:s,requiredQty:i}}
async function K({productId:e,productCode:o,productName:r,direction:n,absQty:d,movementQty:a,warehouseId:u,warehouseCode:c,warehouseName:s,postedAt:p,session:y}={}){const l={
productCode:o,warehouseCode:c};"OUT"===n&&(l.availableQty={$gte:d});const m={$inc:{qty:a,quantity:a,onHand:a,availableQty:a},$set:{productId:e,productCode:o,productName:r,
warehouseId:u,warehouseCode:c,warehouseName:s,lastTransactionAt:p,updatedAt:p},$setOnInsert:{id:i("IV"),reservedQty:0}},f={new:!0,upsert:"IN"===n,session:y}
;let C=await t.findOneAndUpdate(l,m,f);if(C||"OUT"!==n||(await U({productCode:o,productId:e,session:y}),C=await t.findOneAndUpdate(l,m,f)),!C){
const e=new Error(`Không đủ tồn kho mã ${o}`);throw e.code="INSUFFICIENT_STOCK",e.productCode=o,e.warehouseCode=c,e.requiredQty=d,e}return C}async function P(t={},o={},n={}){
const d=n.session,a=M(Array.isArray(t.items)?t.items:[]),c=h(),s=h(),p=w(),l=S(o.direction),m="IN"===l?1:-1,f=String(o.type||("IN"===l?"IMPORT":"SALE")).trim().toUpperCase(),I=g({
...o,type:f
}),v=String(o.refId||o.sourceId||t.id||t._id||t.code||"").trim(),b=String(o.refCode||o.sourceCode||t.code||t.orderCode||t.id||"").trim(),q=C(o.date||t.date||t.orderDate||t.documentDate||t.createdAt),k=e.nowIso(),E=[]
;if("OUT"===l&&!d&&!0!==n.allowUnsafeNoSession){const e=new Error("Atomic inventory OUT posting cần Mongo session để rollback StockTransaction + Inventory cùng nhau")
;throw e.code="INVENTORY_SESSION_REQUIRED",e}for(const e of a){const n=O(e);if(!n)continue
;const a=await $(e),y=Q(e.productCode||e.code||a?.code||e.productId),C=String(e.productId||a?.id||a?._id||y).trim();if(!y&&!C)continue
;const h=String(e.productName||e.name||a?.name||"").trim(),w=Math.abs(n),S=w*m,g=N({sourceType:I,sourceId:v,sourceCode:b,productCode:y,productId:C,warehouseCode:c,warehouseId:s,
direction:l,type:f}),_=await A(g,d);if(_){E.push({..._,skipped:!0,reason:"DUPLICATE_STOCK_MOVEMENT"});continue}let M;await U({productCode:y,productId:C,session:d});try{
M=(await r.create([{id:i("ST"),idempotencyKey:g,sourceType:I,sourceId:v,sourceCode:b,date:q,productId:C,productCode:y,productName:h,warehouseId:s,warehouseCode:c,warehouseName:p,
type:f,direction:l,quantity:S,qty:S,inQty:"IN"===l?w:0,outQty:"OUT"===l?w:0,balanceQty:0,refType:I,refId:v,refCode:b,reversedFrom:o.reversedFrom||o.originalMovementId||"",
note:o.note||t.note||"",createdAt:k,updatedAt:k}],{session:d}))[0]}catch(e){if(!T(e))throw e;const t=await A(g,d);E.push({...t||{idempotencyKey:g},skipped:!0,
reason:"DUPLICATE_STOCK_MOVEMENT"});continue}const R=await K({productId:C,productCode:y,productName:h,direction:l,absQty:w,movementQty:S,warehouseId:s,warehouseCode:c,
warehouseName:p,postedAt:k,session:d}),D=u(R.quantity??R.qty??R.onHand??R.availableQty);M&&"function"==typeof M.save?(M.balanceQty=D,M.updatedAt=k,await M.save({session:d
})):M&&(M.balanceQty=D),E.push(M)}return E.length&&y.invalidateInventorySummaryCache&&y.invalidateInventorySummaryCache(),E}function L(e=[]){const t=[]
;for(const o of Array.isArray(e)?e:[]){
const e=String(o.id||o._id||o.code||"").trim(),r=String(o.code||o.id||o._id||"").trim(),n=C(o.date||o.orderDate||o.createdAt),d=M(Array.isArray(o.items)?o.items:[])
;for(const a of d){const d=Math.abs(O(a)),i=Q(a.productCode||a.code||a.sku||a.productId||a.id),u=String(a.productId||a.id||i).trim();if(!i||d<=0)continue
;const c=String(a.productName||a.name||"").trim(),s=N({sourceType:"SALES_ORDER",sourceId:e,sourceCode:r,productCode:i,productId:u,warehouseCode:h(),warehouseId:h(),direction:"OUT",
type:"SALE"});t.push({order:o,sourceId:e,sourceCode:r,txDate:n,productId:u,productCode:i,productName:c,absQty:d,idempotencyKey:s})}}return t}function F(e,t,o){const r=Q(t)
;r&&o&&!e.has(r)&&e.set(r,o)}function B(e=[]){return Array.from(new Set(e.map(e=>String(e||"").trim()).filter(e=>/^\d+$/.test(e)).map(Number)))}async function H(o=[],r=null){
const n=new Map,d=new Map;for(const e of o){const t=Q(e.productCode);t&&(n.has(t)||n.set(t,{productCode:t,productId:String(e.productId||t).trim(),
productName:String(e.productName||"").trim()}),F(d,t,t),F(d,e.productId,t),/^\d+$/.test(t)&&F(d,String(Number(t)),t),
/^\d+$/.test(String(e.productId||"").trim())&&F(d,String(Number(e.productId)),t))}const a=Array.from(d.keys());if(!a.length)return{normalized:0,productCodes:[]}
;const c=B(a),s=[...a,...c],p=t.find({$or:[{productCode:{$in:s}},{productId:{$in:s}},{code:{$in:s}},{sku:{$in:s}}]}),y=await v(p,r).lean(),l=new Map;for(const e of y||[]){
const t=[e.productCode,e.productId,e.code,e.sku].map(Q).filter(Boolean).map(e=>d.get(e)).find(Boolean);t&&(l.has(t)||l.set(t,[]),l.get(t).push(e))}
const m=e.nowIso(),f=h(),C=w(),I=[];for(const[e,t]of n.entries()){const o=l.get(e)||[];if(!o.length)continue
;const r=o.reduce((e,t)=>e+k(t),0),n=o.reduce((e,t)=>e+u(t.reservedQty??t.reserved??0),0),d=o.find(e=>String(e.warehouseCode||"").trim()===f),a=d||o[0]||{},c={id:a.id||i("IV"),
productId:String(t.productId||a.productId||e).trim(),productCode:e,productName:String(t.productName||a.productName||a.name||"").trim(),warehouseId:f,warehouseCode:f,
warehouseName:C,qty:r,quantity:r,onHand:r,reservedQty:n,availableQty:r-n,updatedAt:m,lastTransactionAt:a.lastTransactionAt||m};if(1===o.length&&d&&Q(d.productCode)===e){I.push({
updateOne:{filter:{_id:d._id},update:{$set:c}}});continue}const s=o.map(e=>e._id).filter(Boolean),p=s.length?{_id:{$in:s}}:{$or:o.map(e=>({productCode:e.productCode,
warehouseCode:e.warehouseCode}))};I.push({updateMany:{filter:p,update:E({canonicalProductCode:e,canonicalWarehouseCode:f,now:m})}}),I.push({updateOne:{filter:{productCode:e,
warehouseCode:f},update:{$set:c},upsert:!0}})}return I.length&&await t.bulkWrite(I,{ordered:!0,session:r}),{normalized:n.size,productCodes:Array.from(n.keys())}}
async function V(o=[],n={}){const d=n.session;if(!d&&!0!==n.allowUnsafeNoSession){const e=new Error("Bulk sales inventory OUT cần Mongo session để đảm bảo atomic")
;throw e.code="INVENTORY_SESSION_REQUIRED",e}const a=L(o);if(!a.length)return[];const c=a.map(e=>e.idempotencyKey).filter(Boolean),s=r.find({idempotencyKey:{$in:c}
}).select("id idempotencyKey productCode productId quantity qty inQty outQty refType refId refCode sourceType sourceId sourceCode type direction date balanceQty createdAt updatedAt").lean(),p=await v(s,d),l=new Set((p||[]).map(e=>e.idempotencyKey).filter(Boolean)),m=a.filter(e=>!l.has(e.idempotencyKey))
;if(!m.length)return(p||[]).map(e=>({...e,skipped:!0,reason:"DUPLICATE_STOCK_MOVEMENT"}));await H(m,d);const f=Array.from(new Set(m.map(e=>e.productCode))),C=t.find({productCode:{
$in:f},warehouseCode:h()}).lean(),I=await v(C,d),S=new Map((I||[]).map(e=>[Q(e.productCode),e])),g=new Map,N=new Map
;for(const e of m)g.set(e.productCode,u(g.get(e.productCode))+e.absQty),N.has(e.productCode)||N.set(e.productCode,e);for(const[e,t]of g.entries()){
const o=S.get(e),r=u(o?.availableQty??o?.quantity??o?.qty??o?.onHand);if(!o||r<t){
const o=N.get(e)||{},n=new Error(`Không đủ tồn kho: mã SP ${e}${o.productName?` - ${o.productName}`:""}, tồn hiện tại ${r}, cần xuất ${t}`);throw n.code="INSUFFICIENT_STOCK",
n.productCode=e,n.warehouseCode=h(),n.availableQty=r,n.requiredQty=t,n}}const T=new Map;for(const e of f){const t=S.get(e)||{}
;T.set(e,u(t.quantity??t.qty??t.onHand??t.availableQty))}const A=e.nowIso(),b=m.map(e=>{const t=u(T.get(e.productCode))-e.absQty;return T.set(e.productCode,t),{id:i("ST"),
idempotencyKey:e.idempotencyKey,sourceType:"SALES_ORDER",sourceId:e.sourceId,sourceCode:e.sourceCode,date:e.txDate,productId:e.productId,productCode:e.productCode,
productName:e.productName,warehouseId:h(),warehouseCode:h(),warehouseName:w(),type:"SALE",direction:"OUT",quantity:-e.absQty,qty:-e.absQty,inQty:0,outQty:e.absQty,balanceQty:t,
refType:"SALES_ORDER",refId:e.sourceId,refCode:e.sourceCode,reversedFrom:"",note:"Xuất kho theo đơn bán",createdAt:A,updatedAt:A}}),O=await r.insertMany(b,{ordered:!0,session:d
}),q=Array.from(g.entries()).map(([e,t])=>{const o=N.get(e)||{};return{updateOne:{filter:{productCode:e,warehouseCode:h(),availableQty:{$gte:t}},update:{$inc:{qty:-t,quantity:-t,
onHand:-t,availableQty:-t},$set:{productId:String(o.productId||e).trim(),productCode:e,productName:String(o.productName||"").trim(),warehouseId:h(),warehouseCode:h(),
warehouseName:w(),lastTransactionAt:A,updatedAt:A}}}}});if(q.length){const e=await t.bulkWrite(q,{ordered:!0,session:d})
;if(Number(e?.matchedCount??e?.nMatched??e?.result?.nMatched??0)!==q.length){const e=new Error("Tồn kho thay đổi trong lúc import. Hệ thống đã rollback chunk để tránh âm kho.")
;throw e.code="INVENTORY_CONCURRENT_UPDATE",e}}return y.invalidateInventorySummaryCache&&y.invalidateInventorySummaryCache(),[...(p||[]).map(e=>({...e,skipped:!0,
reason:"DUPLICATE_STOCK_MOVEMENT"})),...O]}async function W(e={},t={},o={}){const r="IN"===t.direction?"OUT":"IN";return P(e,{...t,direction:r,
type:t.reverseType||`${t.type||"ADJUST"}_REVERSAL`,note:t.note||`Đảo bút toán ${t.type||""}`.trim()},o)}async function z(e={}){const o=f()
;e.productCode&&(o.productCode=e.productCode);const r=await t.find(o).sort({productCode:1}).lean(),n=new Map;for(const e of r){const t=String(e.productCode||e.productId||"").trim()
;if(!t)continue;const o=u(e.onHand??e.quantity??e.qty??e.availableQty);n.has(t)||n.set(t,{...e,warehouseId:h(),warehouseCode:h(),warehouseName:w(),qty:0,quantity:0,onHand:0,
availableQty:0});const r=n.get(t);r.qty+=o,r.quantity+=o,r.onHand+=o,r.availableQty+=o,
(e.updatedAt||e.createdAt||"")>(r.updatedAt||r.createdAt||"")&&(r.updatedAt=e.updatedAt||e.createdAt||r.updatedAt)}return Array.from(n.values())}async function x(t={}){const o={}
;t.productCode&&(o.productCode=t.productCode),(t.dateFrom||t.dateTo||t.date)&&(o.date={},t.dateFrom&&(o.date.$gte=e.toDateOnly(t.dateFrom)),
t.dateTo&&(o.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(o.date=e.toDateOnly(t.date)));const n=c(t.q||t.search||t.keyword);let d=await r.find(o).sort({date:1,createdAt:1,
productCode:1}).lean();return n&&(d=d.filter(e=>[e.productCode,e.productName,e.refCode,e.refType,e.type].some(e=>c(e).includes(n)))),d}function G(e={},t=null){
const o=String(e.productCode||e.code||e.sku||t?.code||e.productId||"").trim();return{productId:String(e.productId||t?.id||t?._id||o).trim(),productCode:o,
productName:String(e.productName||e.name||t?.name||"").trim()}}async function j(e={}){const t=b(e);return t?o.findOne({$or:[{code:t},{sku:t},{productCode:t},{id:t
},...t.match(/^[a-f0-9]{24}$/i)?[{_id:t}]:[]]}).lean():null}
function Y({date:t,productId:o,productCode:r,productName:n,quantity:d,type:a,direction:c,refType:s,refId:p,refCode:y,note:l=""}){
const m=u(d),f=S(c||(m>=0?"IN":"OUT")),I=String(a||f).trim().toUpperCase(),T=g({refType:s,type:I}),v=N({sourceType:T,sourceId:p,sourceCode:y,productCode:r,productId:o,
warehouseCode:h(),warehouseId:h(),direction:f,type:I});return{id:i("ST"),idempotencyKey:v,sourceType:T,sourceId:String(p||"").trim(),sourceCode:String(y||p||"").trim(),date:C(t),
productId:String(o||r||"").trim(),productCode:String(r||o||"").trim(),productName:String(n||"").trim(),warehouseId:h(),warehouseCode:h(),warehouseName:w(),type:I,direction:f,
quantity:m,qty:m,inQty:"IN"===f?Math.abs(m):0,outQty:"OUT"===f?Math.abs(m):0,balanceQty:0,refType:T,refId:String(p||"").trim(),refCode:String(y||p||"").trim(),note:l,
createdAt:e.nowIso(),updatedAt:e.nowIso()}}function J(e={}){return[e.productCode,e.code,e.sku,e.productId,e.id,e.barcode].map(e=>String(e||"").trim()).filter(Boolean)}
function X(e,t,o){const r=String(t||"").trim().toLowerCase();r&&!e.has(r)&&e.set(r,o)}async function Z(e=[],t=null){
const r=Array.from(new Set((Array.isArray(e)?e:[]).flatMap(J).map(e=>String(e||"").trim()).filter(Boolean))),n=new Map;if(!r.length)return n;const d=o.find({$or:[{code:{$in:r}},{
sku:{$in:r}},{productCode:{$in:r}},{barcode:{$in:r}},{id:{$in:r}}]
}).select("id code sku productCode barcode name productName unit baseUnit conversionRate packing costPrice warehouseCode warehouseName printGroup printGroupName"),a=await v(d,t).lean()
;for(const e of a||[])[e.code,e.sku,e.productCode,e.barcode,e.id,e._id,e._id?String(e._id):""].forEach(t=>X(n,t,e));return n}function ee(e={},t=new Map){for(const o of J(e)){
const e=t.get(String(o||"").trim().toLowerCase());if(e)return e}return null}async function te(o={},n={},d={}){const a=d.session,u=M(Array.isArray(o.items)?o.items:[])
;if(!u.length)return[];const c=h(),s=h(),p=w(),l=String(n.type||"IMPORT").trim().toUpperCase(),m=g({...n,type:l
}),f=String(n.refId||n.sourceId||o.id||o._id||o.code||"").trim(),I=String(n.refCode||n.sourceCode||o.code||o.orderCode||o.id||"").trim(),S=C(n.date||o.date||o.orderDate||o.documentDate||o.createdAt),T=e.nowIso(),A=await Z(u,a),b=[]
;for(const e of u){const t=O(e);if(!t)continue
;const r=ee(e,A),d=Q(e.productCode||e.code||e.sku||r?.code||r?.productCode||e.productId),a=String(e.productId||r?.id||r?._id||d).trim();if(!d&&!a)continue
;const u=String(e.productName||e.name||r?.name||r?.productName||"").trim(),y=Math.abs(t);if(y<=0)continue;const C=N({sourceType:m,sourceId:f,sourceCode:I,productCode:d,productId:a,
warehouseCode:c,warehouseId:s,direction:"IN",type:l});b.push({id:i("ST"),idempotencyKey:C,sourceType:m,sourceId:f,sourceCode:I,date:S,productId:a,productCode:d,productName:u,
warehouseId:s,warehouseCode:c,warehouseName:p,type:l,direction:"IN",quantity:y,qty:y,inQty:y,outQty:0,balanceQty:0,refType:m,refId:f,refCode:I,
reversedFrom:n.reversedFrom||n.originalMovementId||"",note:n.note||o.note||"Nhập kho",createdAt:T,updatedAt:T})}if(!b.length)return[]
;const q=b.map(e=>e.idempotencyKey).filter(Boolean),k=r.find({idempotencyKey:{$in:q}
}).select("id idempotencyKey productCode productId quantity qty inQty outQty refType refId refCode sourceType sourceId sourceCode type direction date createdAt updatedAt").lean(),E=await v(k,a),_=new Set((E||[]).map(e=>e.idempotencyKey).filter(Boolean)),$=b.filter(e=>!_.has(e.idempotencyKey))
;let R=[];if($.length){R=await r.insertMany($,{ordered:!1,session:a});const e=$.map(e=>({updateOne:{filter:{productCode:e.productCode,warehouseCode:e.warehouseCode},update:{$inc:{
qty:e.inQty,quantity:e.inQty,onHand:e.inQty,availableQty:e.inQty},$set:{productId:e.productId,productCode:e.productCode,productName:e.productName,warehouseId:e.warehouseId,
warehouseCode:e.warehouseCode,warehouseName:e.warehouseName,lastTransactionAt:T,updatedAt:T},$setOnInsert:{id:i("IV"),reservedQty:0}},upsert:!0}}));e.length&&await t.bulkWrite(e,{
ordered:!1,session:a}),y.invalidateInventorySummaryCache&&y.invalidateInventorySummaryCache()}return[...(E||[]).map(e=>({...e,skipped:!0,reason:"DUPLICATE_STOCK_MOVEMENT"})),...R]}
async function oe(e={}){l(e,"Rebuild inventories từ stockTransactions");const t=await m.rebuildInventoryFromTransactions(e)
;y.invalidateInventorySummaryCache&&y.invalidateInventorySummaryCache();const o=await z();return Object.defineProperty(o,"rebuildMeta",{value:t,enumerable:!1}),o}
async function re(){const e=[],t=await o.find({isActive:{$ne:!1}}).lean();for(const o of t){
const t=u(o.openingStock??o.availableStock??o.stockQuantity??o.availableQty??o.stock??o.quantity??o.qty??o.tonKho??o.tonDau);if(t<=0)continue
;const r=String(o.code||o.sku||o.productCode||o.id||o._id||"").trim();r&&e.push(Y({date:o.createdAt||"2000-01-01",productId:o.id||o._id||r,productCode:r,
productName:o.name||o.productName||"",quantity:t,type:"OPENING",direction:"IN",refType:"PRODUCT_OPENING_STOCK",refId:o.id||o._id||r,refCode:r,
note:"Migrate tồn legacy từ products sang stockTransactions"}))}const r=await n.find({}).lean();for(const t of r.filter(I)){const o=Array.isArray(t.items)?t.items:[]
;for(const r of o){const o=Math.abs(O(r));if(o<=0)continue;const n=await j(r),{productId:d,productCode:a,productName:i}=G(r,n);a&&e.push(Y({date:t.date||t.importDate||t.createdAt,
productId:d,productCode:a,productName:i,quantity:o,type:"IMPORT",direction:"IN",refType:"IMPORT_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,note:"Rebuild từ phiếu nhập"
}))}}const i=await d.find({}).lean();for(const t of i.filter(I)){const o=Array.isArray(t.items)?t.items:[];for(const r of o){const o=Math.abs(O(r));if(o<=0)continue
;const n=await j(r),{productId:d,productCode:a,productName:i}=G(r,n);a&&e.push(Y({date:t.date||t.orderDate||t.createdAt,productId:d,productCode:a,productName:i,quantity:-o,
type:"SALE",direction:"OUT",refType:"mobile_sales_app"===t.source?"MOBILE_SALES_ORDER":"SALES_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,note:"Rebuild từ đơn bán"}))}}
const c=await a.find({}).lean();for(const t of c.filter(I)){const o=Array.isArray(t.items)?t.items:[];for(const r of o){const o=Math.abs(O(r));if(o<=0)continue
;const n=await j(r),{productId:d,productCode:a,productName:i}=G(r,n);a&&e.push(Y({date:t.date||t.returnDate||t.createdAt,productId:d,productCode:a,productName:i,quantity:o,
type:"RETURN",direction:"IN",refType:"RETURN_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,note:"Rebuild từ phiếu trả hàng"}))}}return e}async function ne(e={}){
l(e,"Rebuild stock ledger");const t=!0===e.resetTransactions,n=await r.countDocuments({});let d=0,a=null;if(t||0===n){const t=await re();a=await m.replaceStockTransactions(t,e),
d=t.length}const i=await oe(e);return await o.updateMany({},{$unset:{openingStock:1,availableStock:1,stockQuantity:1,availableQty:1,stock:1,quantity:1,qty:1,tonKho:1,tonDau:1}}),{
resetTransactions:t,transactionCount:await r.countDocuments({}),createdTransactions:d,transactionRebuild:a,inventoryRebuild:i.rebuildMeta||null,inventoryRows:i.length,
totalAvailableQty:i.reduce((e,t)=>e+u(t.availableQty??t.quantity??t.qty),0)}}async function de(t={}){l(t,"Chuẩn hóa tồn về một kho");const o=e.nowIso(),n=await r.updateMany({},{
$set:{warehouseId:h(),warehouseCode:h(),warehouseName:w(),updatedAt:o}}),d=await oe(t);return{normalized:!0,inventoryRows:d.length,transactionRows:await r.countDocuments({}),
modifiedTransactions:n.modifiedCount??n.nModified??0,inventoryRebuild:d.rebuildMeta||null}}module.exports={postStockMovement:P,postStockMovementBulkImportIn:te,
postStockMovementBulkSalesOut:V,assertStockAvailableBeforeOut:D,reverseStockMovement:W,getCurrentStock:z,getStockTransactions:x,rebuildCurrentInventoryFromTransactions:oe,
rebuildSnapshotsFromTransactions:oe,rebuildStockLedgerFromDocuments:ne,normalizeOneWarehouse:de,normalizeProductInventoryToMain:U,buildStockMovementIdempotencyKey:N,isActive:I};
