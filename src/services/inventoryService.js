/* GENERATED FILE — edit src/services/inventoryService.source/part-01.jsfrag, src/services/inventoryService.source/part-02.jsfrag, src/services/inventoryService.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),t=require("../models/InventoryLegacy"),o=require("../models/Product"),r=require("../models/StockTransaction"),n=require("../models/ImportOrder"),d=require("../models/SalesOrder"),a=require("../models/ReturnOrder"),{makeId:i,toNumber:u,normalizeText:c}=require("../utils/common.util"),{STOCK_WAREHOUSE_CODE:s,STOCK_WAREHOUSE_NAME:p}=require("../constants/business.constants"),y=require("./inventoryStock.service"),{assertDestructiveInventoryOperation:l}=require("../utils/inventoryMaintenance.util"),m=require("../domain/reconciliation/InventoryRebuildService")
;function f(t){return e.toDateOnly(t||e.todayVN())}function C(e={}){return!["void","cancelled","canceled","deleted"].includes(String(e.status||"").toLowerCase())}function I(){
return s||"MAIN"}function h(){return p||"Kho chính"}function w(e){return"IN"===String(e||"").trim().toUpperCase()?"IN":"OUT"}function S(e={}){
return String(e.sourceType||e.refType||e.type||"").trim().toUpperCase()||"STOCK_MOVEMENT"}
function g({sourceType:e,sourceId:t,sourceCode:o,productCode:r,productId:n,warehouseCode:d,warehouseId:a,direction:i,type:u}={}){
const c=String(t||o||"").trim(),s=String(r||n||"").trim(),p=String(d||a||I()).trim(),y=String(u||i||"").trim().toUpperCase()
;return[String(e||"").trim().toUpperCase(),c,s,p,y].join("|")}function N(e){return e&&(11e3===e.code||String(e.message||"").includes("E11000"))}function T(e,t){
return e&&"function"==typeof e.session?e.session(t||null):e}async function v(e,t=null){if(!e)return null;const o=T(r.findOne({idempotencyKey:e}),t)
;return"function"==typeof o?.lean?o.lean():o}function A(e={}){return String(e.productCode||e.code||e.productId||e.id||"").trim()}function b(e={}){
return u(e.stockQuantity??e.deliveredQuantity??e.quantity??e.qty??e.totalQty??e.returnQuantity??e.returnQty)}function O(e=""){return String(e||"").trim().toUpperCase()}
function Q(e=""){const t=String(e||"").trim();return/^\d+$/.test(t)?Number(t):null}function q(e={}){return u(e.onHand??e.quantity??e.qty??e.availableQty)}
function k({canonicalProductCode:t="",canonicalWarehouseCode:o=I(),now:r=e.nowIso(),reason:n="MERGED_TO_MAIN_CURRENT_STOCK"}={}){return{$set:{qty:0,quantity:0,onHand:0,
availableQty:0,reservedQty:0,status:"merged",inventoryStatus:"merged_to_main",mergedToProductCode:String(t||"").trim(),mergedToWarehouseCode:String(o||I()).trim(),mergedAt:r,
mergeReason:n,updatedAt:r}}}async function E(e={},o={},r=null){return e&&Object.keys(e).length?T(t.updateMany(e,k(o)),r):{acknowledged:!0,matchedCount:0,modifiedCount:0}}
function _(e=[]){const t=new Map;for(const o of Array.isArray(e)?e:[]){const e=O(o.productCode||o.code||o.sku||o.productId||o.id);if(!e)continue
;const r=Math.abs(u(o.stockQuantity??o.deliveredQuantity??o.quantity??o.qty??o.totalQty??o.returnQuantity??o.returnQty));if(r<=0)continue;t.has(e)||t.set(e,{...o,productCode:e,
productId:String(o.productId||o.id||e).trim(),productName:String(o.productName||o.name||"").trim(),quantity:0});const n=t.get(e);n.quantity+=r,n.qty=n.quantity}
return Array.from(t.values())}async function M(e={}){const t=A(e);return t?o.findOne({$or:[{code:t},{id:t},{_id:/^[a-f0-9]{24}$/i.test(t)?t:void 0
}].filter(e=>void 0!==Object.values(e)[0])}):null}async function $(e={}){const o=String(e.productCode||e.code||e.productId||"").trim(),r=String(e.productId||e.id||o||"").trim()
;if(!o&&!r)return null;const n=I();return t.findOne({$or:[o?{productCode:o,warehouseCode:n}:null,r?{productId:r,warehouseCode:n}:null].filter(Boolean)})}
async function R({productCode:o,productId:r,session:n=null}={}){const d=O(o||""),a=String(r||"").trim(),c=Q(d),s=Q(a),p=[d?{productCode:d}:null,null!==c?{productCode:c}:null,a?{
productId:a}:null,null!==s?{productId:s}:null,d?{code:d}:null,null!==c?{code:c}:null,a?{sku:a}:null,null!==s?{sku:s}:null].filter(Boolean);if(!p.length)return null;const y=t.find({
$or:p}),l=await T(y,n).lean();if(!l.length)return null
;const m=I(),f=l.reduce((e,t)=>e+q(t),0),C=l.reduce((e,t)=>e+u(t.reservedQty??t.reserved??0),0),w=l.find(e=>String(e.warehouseCode||"").trim()===m)||l[0]||{},S=e.nowIso(),g={
id:w.id||i("IV"),productId:String(w.productId||a||d).trim(),productCode:O(w.productCode||d||a),productName:String(w.productName||w.name||"").trim(),warehouseId:m,warehouseCode:m,
warehouseName:h(),qty:f,quantity:f,onHand:f,reservedQty:C,availableQty:f-C,updatedAt:S,lastTransactionAt:w.lastTransactionAt||S}
;if(1===l.length&&String(w.warehouseCode||"").trim()===m){const e=w._id?{_id:w._id}:{productCode:g.productCode,warehouseCode:m};return await T(t.updateOne(e,{$set:g}),n),{...w,...g
}}await E({$or:p},{canonicalProductCode:g.productCode,canonicalWarehouseCode:m,now:S},n);const N={...w,_id:void 0,...g};return await T(t.updateOne({productCode:g.productCode,
warehouseCode:m},{$set:N,$setOnInsert:{id:N.id||i("IV")}},{upsert:!0}),n),N}async function U({productCode:e,productId:t,productName:o,requiredQty:r=0,session:n=null}={}){
const d=String(e||t||"").trim(),a=I(),i=Math.abs(u(r));if(!d||i<=0)return{ok:!0,availableQty:0,requiredQty:i};const c=await y.getAvailableStock(e||t),s=u(c.availableQty);if(s<i){
const e=new Error(`Không đủ tồn kho: mã SP ${d}${o?` - ${o}`:""}, tồn hiện tại ${s}, cần xuất ${i}`);throw e.code="INSUFFICIENT_STOCK",e.productCode=d,e.warehouseCode=a,
e.availableQty=s,e.requiredQty=i,e}return{ok:!0,availableQty:s,requiredQty:i}}
async function D({productId:e,productCode:o,productName:r,direction:n,absQty:d,movementQty:a,warehouseId:u,warehouseCode:c,warehouseName:s,postedAt:p,session:y}={}){const l={
productCode:o,warehouseCode:c};"OUT"===n&&(l.availableQty={$gte:d});const m={$inc:{qty:a,quantity:a,onHand:a,availableQty:a},$set:{productId:e,productCode:o,productName:r,
warehouseId:u,warehouseCode:c,warehouseName:s,lastTransactionAt:p,updatedAt:p},$setOnInsert:{id:i("IV"),reservedQty:0}},f={new:!0,upsert:"IN"===n,session:y}
;let C=await t.findOneAndUpdate(l,m,f);if(C||"OUT"!==n||(await R({productCode:o,productId:e,session:y}),C=await t.findOneAndUpdate(l,m,f)),!C){
const e=new Error(`Không đủ tồn kho mã ${o}`);throw e.code="INSUFFICIENT_STOCK",e.productCode=o,e.warehouseCode=c,e.requiredQty=d,e}return C}async function K(t={},o={},n={}){
const d=n.session,a=_(Array.isArray(t.items)?t.items:[]),c=I(),s=I(),p=h(),l=w(o.direction),m="IN"===l?1:-1,C=String(o.type||("IN"===l?"IMPORT":"SALE")).trim().toUpperCase(),T=S({
...o,type:C
}),A=String(o.refId||o.sourceId||t.id||t._id||t.code||"").trim(),Q=String(o.refCode||o.sourceCode||t.code||t.orderCode||t.id||"").trim(),q=f(o.date||t.date||t.orderDate||t.documentDate||t.createdAt),k=e.nowIso(),E=[]
;if("OUT"===l&&!d&&!0!==n.allowUnsafeNoSession){const e=new Error("Atomic inventory OUT posting cần Mongo session để rollback StockTransaction + Inventory cùng nhau")
;throw e.code="INVENTORY_SESSION_REQUIRED",e}for(const e of a){const n=b(e);if(!n)continue
;const a=await M(e),y=O(e.productCode||e.code||a?.code||e.productId),f=String(e.productId||a?.id||a?._id||y).trim();if(!y&&!f)continue
;const I=String(e.productName||e.name||a?.name||"").trim(),h=Math.abs(n),w=h*m,S=g({sourceType:T,sourceId:A,sourceCode:Q,productCode:y,productId:f,warehouseCode:c,warehouseId:s,
direction:l,type:C}),_=await v(S,d);if(_){E.push({..._,skipped:!0,reason:"DUPLICATE_STOCK_MOVEMENT"});continue}let $;await R({productCode:y,productId:f,session:d});try{
$=(await r.create([{id:i("ST"),idempotencyKey:S,sourceType:T,sourceId:A,sourceCode:Q,date:q,productId:f,productCode:y,productName:I,warehouseId:s,warehouseCode:c,warehouseName:p,
type:C,direction:l,quantity:w,qty:w,inQty:"IN"===l?h:0,outQty:"OUT"===l?h:0,balanceQty:0,refType:T,refId:A,refCode:Q,reversedFrom:o.reversedFrom||o.originalMovementId||"",
note:o.note||t.note||"",createdAt:k,updatedAt:k}],{session:d}))[0]}catch(e){if(!N(e))throw e;const t=await v(S,d);E.push({...t||{idempotencyKey:S},skipped:!0,
reason:"DUPLICATE_STOCK_MOVEMENT"});continue}const U=await D({productId:f,productCode:y,productName:I,direction:l,absQty:h,movementQty:w,warehouseId:s,warehouseCode:c,
warehouseName:p,postedAt:k,session:d}),K=u(U.quantity??U.qty??U.onHand??U.availableQty);$&&"function"==typeof $.save?($.balanceQty=K,$.updatedAt=k,await $.save({session:d
})):$&&($.balanceQty=K),E.push($)}return E.length&&y.invalidateInventorySummaryCache&&y.invalidateInventorySummaryCache(),E}function P(e=[]){const t=[]
;for(const o of Array.isArray(e)?e:[]){
const e=String(o.id||o._id||o.code||"").trim(),r=String(o.code||o.id||o._id||"").trim(),n=f(o.date||o.orderDate||o.createdAt),d=_(Array.isArray(o.items)?o.items:[])
;for(const a of d){const d=Math.abs(b(a)),i=O(a.productCode||a.code||a.sku||a.productId||a.id),u=String(a.productId||a.id||i).trim();if(!i||d<=0)continue
;const c=String(a.productName||a.name||"").trim(),s=g({sourceType:"SALES_ORDER",sourceId:e,sourceCode:r,productCode:i,productId:u,warehouseCode:I(),warehouseId:I(),direction:"OUT",
type:"SALE"});t.push({order:o,sourceId:e,sourceCode:r,txDate:n,productId:u,productCode:i,productName:c,absQty:d,idempotencyKey:s})}}return t}function L(e,t,o){const r=O(t)
;r&&o&&!e.has(r)&&e.set(r,o)}function F(e=[]){return Array.from(new Set(e.map(e=>String(e||"").trim()).filter(e=>/^\d+$/.test(e)).map(Number)))}async function B(o=[],r=null){
const n=new Map,d=new Map;for(const e of o){const t=O(e.productCode);t&&(n.has(t)||n.set(t,{productCode:t,productId:String(e.productId||t).trim(),
productName:String(e.productName||"").trim()}),L(d,t,t),L(d,e.productId,t),/^\d+$/.test(t)&&L(d,String(Number(t)),t),
/^\d+$/.test(String(e.productId||"").trim())&&L(d,String(Number(e.productId)),t))}const a=Array.from(d.keys());if(!a.length)return{normalized:0,productCodes:[]}
;const c=F(a),s=[...a,...c],p=t.find({$or:[{productCode:{$in:s}},{productId:{$in:s}},{code:{$in:s}},{sku:{$in:s}}]}),y=await T(p,r).lean(),l=new Map;for(const e of y||[]){
const t=[e.productCode,e.productId,e.code,e.sku].map(O).filter(Boolean).map(e=>d.get(e)).find(Boolean);t&&(l.has(t)||l.set(t,[]),l.get(t).push(e))}
const m=e.nowIso(),f=I(),C=h(),w=[];for(const[e,t]of n.entries()){const o=l.get(e)||[];if(!o.length)continue
;const r=o.reduce((e,t)=>e+q(t),0),n=o.reduce((e,t)=>e+u(t.reservedQty??t.reserved??0),0),d=o.find(e=>String(e.warehouseCode||"").trim()===f),a=d||o[0]||{},c={id:a.id||i("IV"),
productId:String(t.productId||a.productId||e).trim(),productCode:e,productName:String(t.productName||a.productName||a.name||"").trim(),warehouseId:f,warehouseCode:f,
warehouseName:C,qty:r,quantity:r,onHand:r,reservedQty:n,availableQty:r-n,updatedAt:m,lastTransactionAt:a.lastTransactionAt||m};if(1===o.length&&d&&O(d.productCode)===e){w.push({
updateOne:{filter:{_id:d._id},update:{$set:c}}});continue}const s=o.map(e=>e._id).filter(Boolean),p=s.length?{_id:{$in:s}}:{$or:o.map(e=>({productCode:e.productCode,
warehouseCode:e.warehouseCode}))};w.push({updateMany:{filter:p,update:k({canonicalProductCode:e,canonicalWarehouseCode:f,now:m})}}),w.push({updateOne:{filter:{productCode:e,
warehouseCode:f},update:{$set:c},upsert:!0}})}return w.length&&await t.bulkWrite(w,{ordered:!0,session:r}),{normalized:n.size,productCodes:Array.from(n.keys())}}
async function H(o=[],n={}){const d=n.session;if(!d&&!0!==n.allowUnsafeNoSession){const e=new Error("Bulk sales inventory OUT cần Mongo session để đảm bảo atomic")
;throw e.code="INVENTORY_SESSION_REQUIRED",e}const a=P(o);if(!a.length)return[];const c=a.map(e=>e.idempotencyKey).filter(Boolean),s=r.find({idempotencyKey:{$in:c}
}).select("id idempotencyKey productCode productId quantity qty inQty outQty refType refId refCode sourceType sourceId sourceCode type direction date balanceQty createdAt updatedAt").lean(),p=await T(s,d),l=new Set((p||[]).map(e=>e.idempotencyKey).filter(Boolean)),m=a.filter(e=>!l.has(e.idempotencyKey))
;if(!m.length)return(p||[]).map(e=>({...e,skipped:!0,reason:"DUPLICATE_STOCK_MOVEMENT"}));await B(m,d);const f=Array.from(new Set(m.map(e=>e.productCode))),C=t.find({productCode:{
$in:f},warehouseCode:I()}).lean(),w=await T(C,d),S=new Map((w||[]).map(e=>[O(e.productCode),e])),g=new Map,N=new Map
;for(const e of m)g.set(e.productCode,u(g.get(e.productCode))+e.absQty),N.has(e.productCode)||N.set(e.productCode,e);for(const[e,t]of g.entries()){
const o=S.get(e),r=u(o?.availableQty??o?.quantity??o?.qty??o?.onHand);if(!o||r<t){
const o=N.get(e)||{},n=new Error(`Không đủ tồn kho: mã SP ${e}${o.productName?` - ${o.productName}`:""}, tồn hiện tại ${r}, cần xuất ${t}`);throw n.code="INSUFFICIENT_STOCK",
n.productCode=e,n.warehouseCode=I(),n.availableQty=r,n.requiredQty=t,n}}const v=new Map;for(const e of f){const t=S.get(e)||{}
;v.set(e,u(t.quantity??t.qty??t.onHand??t.availableQty))}const A=e.nowIso(),b=m.map(e=>{const t=u(v.get(e.productCode))-e.absQty;return v.set(e.productCode,t),{id:i("ST"),
idempotencyKey:e.idempotencyKey,sourceType:"SALES_ORDER",sourceId:e.sourceId,sourceCode:e.sourceCode,date:e.txDate,productId:e.productId,productCode:e.productCode,
productName:e.productName,warehouseId:I(),warehouseCode:I(),warehouseName:h(),type:"SALE",direction:"OUT",quantity:-e.absQty,qty:-e.absQty,inQty:0,outQty:e.absQty,balanceQty:t,
refType:"SALES_ORDER",refId:e.sourceId,refCode:e.sourceCode,reversedFrom:"",note:"Xuất kho theo đơn bán",createdAt:A,updatedAt:A}}),Q=await r.insertMany(b,{ordered:!0,session:d
}),q=Array.from(g.entries()).map(([e,t])=>{const o=N.get(e)||{};return{updateOne:{filter:{productCode:e,warehouseCode:I(),availableQty:{$gte:t}},update:{$inc:{qty:-t,quantity:-t,
onHand:-t,availableQty:-t},$set:{productId:String(o.productId||e).trim(),productCode:e,productName:String(o.productName||"").trim(),warehouseId:I(),warehouseCode:I(),
warehouseName:h(),lastTransactionAt:A,updatedAt:A}}}}});if(q.length){const e=await t.bulkWrite(q,{ordered:!0,session:d})
;if(Number(e?.matchedCount??e?.nMatched??e?.result?.nMatched??0)!==q.length){const e=new Error("Tồn kho thay đổi trong lúc import. Hệ thống đã rollback chunk để tránh âm kho.")
;throw e.code="INVENTORY_CONCURRENT_UPDATE",e}}return y.invalidateInventorySummaryCache&&y.invalidateInventorySummaryCache(),[...(p||[]).map(e=>({...e,skipped:!0,
reason:"DUPLICATE_STOCK_MOVEMENT"})),...Q]}async function V(e={},t={},o={}){const r="IN"===t.direction?"OUT":"IN";return K(e,{...t,direction:r,
type:t.reverseType||`${t.type||"ADJUST"}_REVERSAL`,note:t.note||`Đảo bút toán ${t.type||""}`.trim()},o)}async function W(e={}){const o={warehouseCode:I()}
;e.productCode&&(o.productCode=e.productCode);const r=await t.find(o).sort({productCode:1}).lean(),n=new Map;for(const e of r){const t=String(e.productCode||e.productId||"").trim()
;if(!t)continue;const o=u(e.onHand??e.quantity??e.qty??e.availableQty);n.has(t)||n.set(t,{...e,warehouseId:I(),warehouseCode:I(),warehouseName:h(),qty:0,quantity:0,onHand:0,
availableQty:0});const r=n.get(t);r.qty+=o,r.quantity+=o,r.onHand+=o,r.availableQty+=o,
(e.updatedAt||e.createdAt||"")>(r.updatedAt||r.createdAt||"")&&(r.updatedAt=e.updatedAt||e.createdAt||r.updatedAt)}return Array.from(n.values())}async function z(t={}){const o={}
;t.productCode&&(o.productCode=t.productCode),(t.dateFrom||t.dateTo||t.date)&&(o.date={},t.dateFrom&&(o.date.$gte=e.toDateOnly(t.dateFrom)),
t.dateTo&&(o.date.$lte=e.toDateOnly(t.dateTo)),t.date&&(o.date=e.toDateOnly(t.date)));const n=c(t.q||t.search||t.keyword);let d=await r.find(o).sort({date:1,createdAt:1,
productCode:1}).lean();return n&&(d=d.filter(e=>[e.productCode,e.productName,e.refCode,e.refType,e.type].some(e=>c(e).includes(n)))),d}function x(e={},t=null){
const o=String(e.productCode||e.code||e.sku||t?.code||e.productId||"").trim();return{productId:String(e.productId||t?.id||t?._id||o).trim(),productCode:o,
productName:String(e.productName||e.name||t?.name||"").trim()}}async function G(e={}){const t=A(e);return t?o.findOne({$or:[{code:t},{sku:t},{productCode:t},{id:t
},...t.match(/^[a-f0-9]{24}$/i)?[{_id:t}]:[]]}).lean():null}
function j({date:t,productId:o,productCode:r,productName:n,quantity:d,type:a,direction:c,refType:s,refId:p,refCode:y,note:l=""}){
const m=u(d),C=w(c||(m>=0?"IN":"OUT")),N=String(a||C).trim().toUpperCase(),T=S({refType:s,type:N}),v=g({sourceType:T,sourceId:p,sourceCode:y,productCode:r,productId:o,
warehouseCode:I(),warehouseId:I(),direction:C,type:N});return{id:i("ST"),idempotencyKey:v,sourceType:T,sourceId:String(p||"").trim(),sourceCode:String(y||p||"").trim(),date:f(t),
productId:String(o||r||"").trim(),productCode:String(r||o||"").trim(),productName:String(n||"").trim(),warehouseId:I(),warehouseCode:I(),warehouseName:h(),type:N,direction:C,
quantity:m,qty:m,inQty:"IN"===C?Math.abs(m):0,outQty:"OUT"===C?Math.abs(m):0,balanceQty:0,refType:T,refId:String(p||"").trim(),refCode:String(y||p||"").trim(),note:l,
createdAt:e.nowIso(),updatedAt:e.nowIso()}}function Y(e={}){return[e.productCode,e.code,e.sku,e.productId,e.id,e.barcode].map(e=>String(e||"").trim()).filter(Boolean)}
function J(e,t,o){const r=String(t||"").trim().toLowerCase();r&&!e.has(r)&&e.set(r,o)}async function X(e=[],t=null){
const r=Array.from(new Set((Array.isArray(e)?e:[]).flatMap(Y).map(e=>String(e||"").trim()).filter(Boolean))),n=new Map;if(!r.length)return n;const d=o.find({$or:[{code:{$in:r}},{
sku:{$in:r}},{productCode:{$in:r}},{barcode:{$in:r}},{id:{$in:r}}]
}).select("id code sku productCode barcode name productName unit baseUnit conversionRate packing costPrice warehouseCode warehouseName printGroup printGroupName"),a=await T(d,t).lean()
;for(const e of a||[])[e.code,e.sku,e.productCode,e.barcode,e.id,e._id,e._id?String(e._id):""].forEach(t=>J(n,t,e));return n}function Z(e={},t=new Map){for(const o of Y(e)){
const e=t.get(String(o||"").trim().toLowerCase());if(e)return e}return null}async function ee(o={},n={},d={}){const a=d.session,u=_(Array.isArray(o.items)?o.items:[])
;if(!u.length)return[];const c=I(),s=I(),p=h(),l=String(n.type||"IMPORT").trim().toUpperCase(),m=S({...n,type:l
}),C=String(n.refId||n.sourceId||o.id||o._id||o.code||"").trim(),w=String(n.refCode||n.sourceCode||o.code||o.orderCode||o.id||"").trim(),N=f(n.date||o.date||o.orderDate||o.documentDate||o.createdAt),v=e.nowIso(),A=await X(u,a),Q=[]
;for(const e of u){const t=b(e);if(!t)continue;const r=Z(e,A),d=O(e.productCode||e.code||e.sku||r?.code||r?.productCode||e.productId),a=String(e.productId||r?.id||r?._id||d).trim()
;if(!d&&!a)continue;const u=String(e.productName||e.name||r?.name||r?.productName||"").trim(),y=Math.abs(t);if(y<=0)continue;const f=g({sourceType:m,sourceId:C,sourceCode:w,
productCode:d,productId:a,warehouseCode:c,warehouseId:s,direction:"IN",type:l});Q.push({id:i("ST"),idempotencyKey:f,sourceType:m,sourceId:C,sourceCode:w,date:N,productId:a,
productCode:d,productName:u,warehouseId:s,warehouseCode:c,warehouseName:p,type:l,direction:"IN",quantity:y,qty:y,inQty:y,outQty:0,balanceQty:0,refType:m,refId:C,refCode:w,
reversedFrom:n.reversedFrom||n.originalMovementId||"",note:n.note||o.note||"Nhập kho",createdAt:v,updatedAt:v})}if(!Q.length)return[]
;const q=Q.map(e=>e.idempotencyKey).filter(Boolean),k=r.find({idempotencyKey:{$in:q}
}).select("id idempotencyKey productCode productId quantity qty inQty outQty refType refId refCode sourceType sourceId sourceCode type direction date createdAt updatedAt").lean(),E=await T(k,a),M=new Set((E||[]).map(e=>e.idempotencyKey).filter(Boolean)),$=Q.filter(e=>!M.has(e.idempotencyKey))
;let R=[];if($.length){R=await r.insertMany($,{ordered:!1,session:a});const e=$.map(e=>({updateOne:{filter:{productCode:e.productCode,warehouseCode:e.warehouseCode},update:{$inc:{
qty:e.inQty,quantity:e.inQty,onHand:e.inQty,availableQty:e.inQty},$set:{productId:e.productId,productCode:e.productCode,productName:e.productName,warehouseId:e.warehouseId,
warehouseCode:e.warehouseCode,warehouseName:e.warehouseName,lastTransactionAt:v,updatedAt:v},$setOnInsert:{id:i("IV"),reservedQty:0}},upsert:!0}}));e.length&&await t.bulkWrite(e,{
ordered:!1,session:a}),y.invalidateInventorySummaryCache&&y.invalidateInventorySummaryCache()}return[...(E||[]).map(e=>({...e,skipped:!0,reason:"DUPLICATE_STOCK_MOVEMENT"})),...R]}
async function te(e={}){l(e,"Rebuild inventories từ stockTransactions");const t=await m.rebuildInventoryFromTransactions(e)
;y.invalidateInventorySummaryCache&&y.invalidateInventorySummaryCache();const o=await W();return Object.defineProperty(o,"rebuildMeta",{value:t,enumerable:!1}),o}
async function oe(){const e=[],t=await o.find({isActive:{$ne:!1}}).lean();for(const o of t){
const t=u(o.openingStock??o.availableStock??o.stockQuantity??o.availableQty??o.stock??o.quantity??o.qty??o.tonKho??o.tonDau);if(t<=0)continue
;const r=String(o.code||o.sku||o.productCode||o.id||o._id||"").trim();r&&e.push(j({date:o.createdAt||"2000-01-01",productId:o.id||o._id||r,productCode:r,
productName:o.name||o.productName||"",quantity:t,type:"OPENING",direction:"IN",refType:"PRODUCT_OPENING_STOCK",refId:o.id||o._id||r,refCode:r,
note:"Migrate tồn legacy từ products sang stockTransactions"}))}const r=await n.find({}).lean();for(const t of r.filter(C)){const o=Array.isArray(t.items)?t.items:[]
;for(const r of o){const o=Math.abs(b(r));if(o<=0)continue;const n=await G(r),{productId:d,productCode:a,productName:i}=x(r,n);a&&e.push(j({date:t.date||t.importDate||t.createdAt,
productId:d,productCode:a,productName:i,quantity:o,type:"IMPORT",direction:"IN",refType:"IMPORT_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,note:"Rebuild từ phiếu nhập"
}))}}const i=await d.find({}).lean();for(const t of i.filter(C)){const o=Array.isArray(t.items)?t.items:[];for(const r of o){const o=Math.abs(b(r));if(o<=0)continue
;const n=await G(r),{productId:d,productCode:a,productName:i}=x(r,n);a&&e.push(j({date:t.date||t.orderDate||t.createdAt,productId:d,productCode:a,productName:i,quantity:-o,
type:"SALE",direction:"OUT",refType:"mobile_sales_app"===t.source?"MOBILE_SALES_ORDER":"SALES_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,note:"Rebuild từ đơn bán"}))}}
const c=await a.find({}).lean();for(const t of c.filter(C)){const o=Array.isArray(t.items)?t.items:[];for(const r of o){const o=Math.abs(b(r));if(o<=0)continue
;const n=await G(r),{productId:d,productCode:a,productName:i}=x(r,n);a&&e.push(j({date:t.date||t.returnDate||t.createdAt,productId:d,productCode:a,productName:i,quantity:o,
type:"RETURN",direction:"IN",refType:"RETURN_ORDER",refId:t.id||t._id||t.code,refCode:t.code||t.id,note:"Rebuild từ phiếu trả hàng"}))}}return e}async function re(e={}){
l(e,"Rebuild stock ledger");const t=!0===e.resetTransactions,n=await r.countDocuments({});let d=0,a=null;if(t||0===n){const t=await oe();a=await m.replaceStockTransactions(t,e),
d=t.length}const i=await te(e);return await o.updateMany({},{$unset:{openingStock:1,availableStock:1,stockQuantity:1,availableQty:1,stock:1,quantity:1,qty:1,tonKho:1,tonDau:1}}),{
resetTransactions:t,transactionCount:await r.countDocuments({}),createdTransactions:d,transactionRebuild:a,inventoryRebuild:i.rebuildMeta||null,inventoryRows:i.length,
totalAvailableQty:i.reduce((e,t)=>e+u(t.availableQty??t.quantity??t.qty),0)}}async function ne(t={}){l(t,"Chuẩn hóa tồn về một kho");const o=e.nowIso(),n=await r.updateMany({},{
$set:{warehouseId:I(),warehouseCode:I(),warehouseName:h(),updatedAt:o}}),d=await te(t);return{normalized:!0,inventoryRows:d.length,transactionRows:await r.countDocuments({}),
modifiedTransactions:n.modifiedCount??n.nModified??0,inventoryRebuild:d.rebuildMeta||null}}module.exports={postStockMovement:K,postStockMovementBulkImportIn:ee,
postStockMovementBulkSalesOut:H,assertStockAvailableBeforeOut:U,reverseStockMovement:V,getCurrentStock:W,getStockTransactions:z,rebuildCurrentInventoryFromTransactions:te,
rebuildSnapshotsFromTransactions:te,rebuildStockLedgerFromDocuments:re,normalizeOneWarehouse:ne,normalizeProductInventoryToMain:R,buildStockMovementIdempotencyKey:g,isActive:C};
