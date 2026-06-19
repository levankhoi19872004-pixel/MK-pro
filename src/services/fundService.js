/* GENERATED FILE — edit src/services/fundService.source/part-01.jsfrag, src/services/fundService.source/part-02.jsfrag, src/services/fundService.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{makeId:t,normalizeText:n,toNumber:r}=require("../utils/common.util"),{withMongoTransaction:o}=require("../utils/transaction.util"),i=require("../repositories/fundLedgerRepository"),s=require("../repositories/deliveryCashSubmissionRepository"),a=require("../repositories/expenseVoucherRepository"),d=require("../repositories/fundTransferRepository"),u=require("../repositories/deliveryCashShortageRepository"),c=require("../repositories/deliveryShortageRepaymentRepository"),m=require("./auditService")
;function f(){return require("./master-order/masterOrderDelivery.service")}const{pickDeliveryStaffCode:h}=require("../domain/staff/staffIdentity");function l(t){
return e.toDateOnly(t||e.todayVN())}function p(e){return Math.max(0,Math.round(r(e)))}function y(e={}){
return!["void","cancelled","canceled","deleted"].includes(String(e.status||"").toLowerCase())}function g(e){return"bank"===String(e||"cash").toLowerCase()?"bank":"cash"}
function S(e){return"out"===String(e||"in").toLowerCase()?"out":"in"}function C(e,t){return(String(e||"").trim()||String(t||"cash")).toUpperCase()}function A(e){
return String(e||"").trim().toUpperCase()}function b(e={}){
const t=g(e.fundType),n=S(e.direction),r=C(e.account,t),o=String(e.sourceType||"MANUAL_FUND").trim()||"MANUAL_FUND",i=String(e.sourceId||e.sourceCode||e.referenceId||e.referenceCode||e.refId||e.refCode||e.id||e.code||"").trim()
;return i?[o,i,t,n,r].map(A).join("|"):""}function w(e,t=[]){const n=t.reduce((e,t)=>{const n=String(t.code||"").match(/(\d+)$/);return Math.max(e,n?Number(n[1]):0)},0)
;return`${e}${String(n+1).padStart(5,"0")}`}async function T(){return w("FL",await i.findAll())}async function v(){return w("PC",await a.findAll())}async function I(){
return w("CQ",await d.findAll())}function B(e,t){return`NQGH-${String(l(e)).replace(/-/g,"")}-${String(t||"NO_NVGH").trim().replace(/[^a-zA-Z0-9_-]/g,"").slice(0,24)||"NO_NVGH"}`}
function k(e,t){const n="bank"===g(t)?"TK":"TM";return`DCSH-${String(e||"").trim()}-${n}`}function N(e={},t){
return`NQBU-${String(l(t)).replace(/-/g,"")}-${String(e.deliveryStaffCode||"NVGH").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,20)||"NVGH"}-${String(Date.now()).slice(-7)+String(Math.floor(100*Math.random())).padStart(2,"0")}`
}const D={cash:{collected_not_remitted:{responsibleType:"delivery_staff",status:"open"},customer_not_paid:{responsibleType:"customer",status:"customer_outstanding"},
approved_expense:{responsibleType:"adjustment",status:"adjusted",requireNote:!0},pending_review:{responsibleType:"pending",status:"disputed",requireNote:!0}},bank:{
pending_bank_reconciliation:{responsibleType:"pending",status:"pending_reconciliation"},delivery_staff_liability:{responsibleType:"delivery_staff",status:"open"},
customer_not_paid:{responsibleType:"customer",status:"customer_outstanding"},approved_adjustment:{responsibleType:"adjustment",status:"adjusted",requireNote:!0}}};function E(e){
return Math.max(0,-Math.round(r(e)))}function _(e={},t){
return(e.shortageResolution&&"object"==typeof e.shortageResolution?e.shortageResolution[t]:null)||e[`${t}ShortageResolution`]||null}function q(e={},t,n){if(n<=0)return null
;const r=_(e,t),o="string"==typeof r?{reasonType:r}:r||{},i=String(o.reasonType||o.reason||"").trim(),s=D[t]?.[i];if(!s)return{
error:"bank"===t?"Cần chọn cách xử lý khoản thiếu chuyển khoản trước khi xác nhận":"Cần chọn cách xử lý khoản thiếu tiền mặt trước khi xác nhận",fundType:t,shortageAmount:n}
;const a=String(o.note||e.shortageNote||"").trim();if(s.requireNote&&!a)return{error:"Cần nhập ghi chú giải trình cho cách xử lý khoản thiếu đã chọn",fundType:t,shortageAmount:n}
;const d="adjustment"===s.responsibleType?n:0;return{fundType:t,reasonType:i,responsibleType:s.responsibleType,status:s.status,originalShortageAmount:n,settledAmount:0,
adjustedAmount:d,outstandingAmount:Math.max(0,n-d),note:a}}function $(e={},t={}){const n={
cash:E(t.differenceCashAmount??e.differenceCashAmount??p(t.submittedCashAmount??e.submittedCashAmount)-p(e.reportCashAmount)),
bank:E(t.differenceBankAmount??e.differenceBankAmount??p(t.submittedBankAmount??e.submittedBankAmount)-p(e.reportBankAmount))},r=[],o=[];for(const e of["cash","bank"]){
if(n[e]<=0)continue;const i=q(t,e,n[e]);i?.error?o.push(i):r.push(i)}return o.length?{error:o.map(e=>e.error).join(". "),status:422,requiresShortageResolution:!0,shortages:o}:{
plans:r,amounts:n}}function R(t={},n={},r=""){const o=e.nowIso();return{id:k(t.code,n.fundType),code:k(t.code,n.fundType),sourceSubmissionId:String(t.id||"").trim(),
sourceSubmissionCode:String(t.code||"").trim(),deliveryDate:String(t.deliveryDate||"").trim(),deliveryStaffCode:String(t.deliveryStaffCode||"").trim(),
deliveryStaffName:String(t.deliveryStaffName||"").trim(),fundType:g(n.fundType),reasonType:String(n.reasonType||"").trim(),responsibleType:String(n.responsibleType||"").trim(),
originalShortageAmount:p(n.originalShortageAmount),settledAmount:p(n.settledAmount),adjustedAmount:p(n.adjustedAmount),pendingRepaymentAmount:0,
outstandingAmount:p(n.outstandingAmount),status:String(n.status||"open").trim(),note:String(n.note||"").trim(),classifiedBy:String(r||"").trim(),classifiedAt:o,
createdBy:String(r||"").trim(),createdAt:o,updatedAt:o}}async function F(e,t=[],n="",r={}){const o=[];for(const i of t){
const t=await u.findBySourceAndFundType(e.id,e.code,i.fundType,r);if(t){o.push(t);continue}const s=R(e,i,n);await u.upsert(s,r),o.push(s)}return o}function L(e,t){
return String(e||t||"").trim()}function O(e,t){
return!t||[e.code,e.sourceCode,e.sourceType,e.deliveryStaffCode,e.deliveryStaffName,e.customerCode,e.customerName,e.staffName,e.note,e.status].some(e=>n(e).includes(t))}
function P(e=[]){
const t=e.filter(y),n=t.filter(e=>"cash"===e.fundType&&"in"===e.direction).reduce((e,t)=>e+r(t.amount),0),o=t.filter(e=>"cash"===e.fundType&&"out"===e.direction).reduce((e,t)=>e+r(t.amount),0),i=t.filter(e=>"bank"===e.fundType&&"in"===e.direction).reduce((e,t)=>e+r(t.amount),0),s=t.filter(e=>"bank"===e.fundType&&"out"===e.direction).reduce((e,t)=>e+r(t.amount),0)
;return{cashIn:n,cashOut:o,cashBalance:n-o,bankIn:i,bankOut:s,bankBalance:i-s,totalIn:n+i,totalOut:o+s,totalBalance:n+i-o-s}}async function x(e={}){const t={status:{
$nin:["void","cancelled","canceled","deleted"]}};e.fundType&&"all"!==e.fundType&&(t.fundType=String(e.fundType)),e.direction&&"all"!==e.direction&&(t.direction=String(e.direction))
;const n=e.dateFrom?l(e.dateFrom):"",o=e.dateTo?l(e.dateTo):"";(n||o)&&(t.date={...n?{$gte:n}:{},...o?{$lte:o}:{}});const s=String(e.q||e.search||"").trim();if(s){
const e=s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),n=new RegExp(e,"i")
;t.$or=["code","sourceCode","sourceType","deliveryStaffCode","deliveryStaffName","customerCode","customerName","staffName","note","status"].map(e=>({[e]:n}))}
const a=Math.max(Number(e.page||1),1),d=Math.min(Math.max(Number(e.limit||50),1),200),u=(a-1)*d,c=(await i.aggregate([{$match:t},{$facet:{rows:[{$sort:{date:-1,createdAt:-1,code:-1
}},{$skip:u},{$limit:d}],totals:[{$group:{_id:{fundType:"$fundType",direction:"$direction"},amount:{$sum:{$ifNull:["$amount",0]}},count:{$sum:1}}}],count:[{$count:"total"}]}
}]))[0]||{rows:[],totals:[],count:[]},m=(c.totals||[]).map(e=>({fundType:e._id?.fundType,direction:e._id?.direction,amount:r(e.amount),count:r(e.count)})),f=P(m.map(e=>({
fundType:e.fundType,direction:e.direction,amount:e.amount,status:"posted"}))),h=r(c.count?.[0]?.total);return{fundLedgers:c.rows||[],items:c.rows||[],summary:{...f,groups:m},meta:{
page:a,limit:d,total:h,totalPages:Math.ceil(h/d),hasMore:u+(c.rows||[]).length<h}}}async function M(e,t,n,r,o="",s=""){const a=b({sourceType:e,sourceCode:t,sourceId:o,fundType:n,
direction:r,account:s});if(a){const e=await i.findByIdempotencyKey(a);if(e)return e}const d={fundType:n,direction:r,$or:[{sourceType:e,sourceCode:t},{referenceType:e,
referenceCode:t}]};return s&&(d.account=s),o&&d.$or.push({sourceType:e,sourceId:o},{referenceType:e,referenceId:o}),(await i.findAll(d,{limit:1}))[0]||null}
async function H(n={},r={}){const o=p(n.amount);if(o<=0)return null
;const s=g(n.fundType),a=S(n.direction),d=C(n.account,s),u=String(n.sourceType||"MANUAL_FUND").trim(),c=String(n.sourceId||n.refId||n.referenceId||"").trim(),m=String(n.sourceCode||n.refCode||n.referenceCode||"").trim(),f=String(n.idempotencyKey||b({
...n,sourceType:u,sourceId:c,sourceCode:m,fundType:s,direction:a,account:d})).trim();if(!f)throw new Error("Thiếu sourceId/sourceCode để tạo idempotencyKey cho fund ledger")
;const h=await i.findByIdempotencyKey(f,r);if(h)return{ok:!0,skipped:!0,ledger:h,reason:"DUPLICATE_FUND_LEDGER"};const y={id:String(n.id||t("FL")).trim(),
code:String(n.code||await T()).trim(),date:l(n.date),fundType:s,direction:a,account:d,idempotencyKey:f,amount:o,sourceType:u,sourceId:c,sourceCode:m,
refType:String(n.refType||u).trim(),refId:String(n.refId||c).trim(),refCode:String(n.refCode||m).trim(),referenceType:String(n.referenceType||n.refType||u).trim(),
referenceId:String(n.referenceId||n.refId||c).trim(),referenceCode:String(n.referenceCode||n.refCode||m).trim(),deliveryDate:String(n.deliveryDate||"").trim(),
deliveryStaffCode:String(n.deliveryStaffCode||"").trim(),deliveryStaffName:String(n.deliveryStaffName||"").trim(),customerCode:String(n.customerCode||"").trim(),
customerName:String(n.customerName||"").trim(),staffCode:String(n.staffCode||"").trim(),staffName:String(n.staffName||"").trim(),note:String(n.note||"").trim(),
status:String(n.status||"posted").trim(),createdBy:String(n.createdBy||"").trim(),createdAt:n.createdAt||e.nowIso(),updatedAt:e.nowIso()};try{return await i.upsert(y,r),y}catch(e){
if(e&&(11e3===e.code||String(e.message||"").includes("duplicate key"))){const e=await i.findByIdempotencyKey(f,r);if(e)return{ok:!0,skipped:!0,ledger:e,
reason:"DUPLICATE_FUND_LEDGER"}}throw e}}function V(e,t=[]){for(const n of t){const t=r(e[n]);if(t>0)return t}return 0}async function U(r={}){
const o=l(r.deliveryDate||r.date),i=String(h(r)||r.delivery||"").trim();if(!i)return{error:"Thiếu nhân viên giao hàng để tạo phiếu nộp quỹ",status:400}
;const s=f(),a="function"==typeof s.listDeliveryTodayOrdersCompact?s.listDeliveryTodayOrdersCompact:s.listDeliveryToday,d=await a({date:o,delivery:i,deliveryStaffCode:i,page:1,
limit:5e3}),u=n(i),c=(d.orders||d.rows||[]).filter(e=>n(h(e)||e.deliveryStaffCode)===u);if(!c.length)return{error:"Không có đơn giao để tạo phiếu nộp quỹ",status:404}
;const m=c.find(e=>e.deliveryStaffName)?.deliveryStaffName||i,y=c.reduce((e,t)=>e+V(t,["cashAmount","cashCollected"]),0),g=c.reduce((e,t)=>e+V(t,["bankAmount","bankCollected","transferAmount"]),0),S=c.reduce((e,t)=>e+V(t,["oldDebtCashCollected","debtCashCollected","arCashCollected"]),0),C=c.reduce((e,t)=>e+V(t,["oldDebtBankCollected","debtBankCollected","arBankCollected"]),0),A=y+S,b=g+C,w=B(o,i),T=p(r.submittedCashAmount??A),v=p(r.submittedBankAmount??b)
;return{draft:{id:String(r.id||t("NQGH")).trim(),code:w,deliveryDate:o,deliveryStaffCode:i,deliveryStaffName:m,reportCashAmount:A,reportBankAmount:b,reportCurrentOrderCashAmount:y,
reportCurrentOrderBankAmount:g,reportOldDebtCashAmount:S,reportOldDebtBankAmount:C,submittedCashAmount:T,submittedBankAmount:v,differenceCashAmount:T-A,differenceBankAmount:v-b,
orderCodes:c.map(e=>e.orderCode||e.code||"").filter(Boolean),orderIds:c.map(e=>e.id||"").filter(Boolean),status:String(r.status||"pending").trim(),
matchStatus:T===A&&v===b?"matched":"mismatch",fundPosted:!1,note:String(r.note||"").trim(),createdBy:String(r.createdBy||"").trim(),createdAt:e.nowIso(),updatedAt:e.nowIso()},
orders:c,deliverySummary:d.summary||d.kpi||{}}}async function G(e={}){const t=await U(e);if(t.error)return t;const n=t.draft,r=await s.findByIdOrCode(n.code)
;return r&&!["cancelled","canceled","void","deleted"].includes(String(r.status||"").toLowerCase())?{error:`Đã có phiếu nộp quỹ ${r.code} cho ngày/NVGH này`,status:409,submission:r
}:(await s.upsert(n),{submission:n,orders:t.orders})}async function j(e={}){const t={};(e.deliveryDate||e.date)&&(t.deliveryDate=l(e.deliveryDate||e.date)),
(h(e)||e.delivery)&&(t.deliveryStaffCode=String(h(e)||e.delivery).trim());let r=await s.findAll(t,{sort:{deliveryDate:-1,createdAt:-1,code:-1},limit:e.limit||500})
;const o=n(e.q||e.search||"");if(o&&(r=r.filter(e=>O(e,o))),!r.length)return{submissions:[]}
;const i=r.map(e=>String(e.id||"").trim()).filter(Boolean),a=r.map(e=>String(e.code||"").trim()).filter(Boolean),d=[];i.length&&d.push({sourceSubmissionId:{$in:i}}),
a.length&&d.push({sourceSubmissionCode:{$in:a}});const c=d.length?await u.findAll({$or:d},{limit:Math.min(1e3,3*r.length)}):[],m=new Map;for(const e of c){
const t=[L(e.sourceSubmissionId,""),L("",e.sourceSubmissionCode)].filter(Boolean);for(const n of t)m.has(n)||m.set(n,{}),m.get(n)[g(e.fundType)]=e}return r=r.map(e=>{
const t=m.get(L(e.id,""))||m.get(L("",e.code))||{};return{...e,cashShortage:t.cash||null,bankShortage:t.bank||null}}),{submissions:r}}function K(e={}){
return["confirmed","matched","posted"].includes(String(e.status||"").toLowerCase())||!0===e.fundPosted}function Y(e){return{error:`${e} đã xác nhận, không được sửa nghiệp vụ`,
status:409}}function Q(e={},t={}){const n=String(e.id||"").trim(),r=String(t.id||"").trim();if(n&&r)return n===r;const o=String(e.code||"").trim(),i=String(t.code||"").trim()
;return Boolean(o&&i&&o===i)}async function z(t,n={}){const r=await s.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu nộp quỹ",status:404}
;if(K(r))return Y("Phiếu nộp quỹ")
;const o=p(n.submittedCashAmount??r.submittedCashAmount??r.reportCashAmount),i=p(n.submittedBankAmount??r.submittedBankAmount??r.reportBankAmount),a=n.deliveryDate??n.date??r.deliveryDate,d=String(h(n)||n.delivery||r.deliveryStaffCode||"").trim(),u=await U({
...r,...n,id:r.id,deliveryDate:a,deliveryStaffCode:d,submittedCashAmount:o,submittedBankAmount:i,status:"pending",note:String(n.note??r.note??"").trim(),
createdBy:r.createdBy||n.createdBy||""});if(u.error)return u;const c=u.draft;if(String(c.code||"")!==String(r.code||"")){const e=await s.findByIdOrCode(c.code)
;if(e&&!Q(r,e))return{error:`Đã có phiếu nộp quỹ ${c.code} cho ngày/NVGH này`,status:409,submission:e}}const m={...r,...c,id:r.id||c.id,createdBy:r.createdBy||c.createdBy||"",
createdAt:r.createdAt||c.createdAt,status:"pending",fundPosted:!1,postedAt:"",confirmedAt:"",confirmedBy:"",updatedAt:e.nowIso()},f=await s.patchByIdOrCode(t,m);return f?{
submission:f,orders:u.orders,message:"Đã cập nhật phiếu nộp quỹ và đồng bộ lại số báo cáo theo ngày/NVGH"}:{error:"Phiếu nộp quỹ đã thay đổi hoặc không còn tồn tại",status:409}}
async function X(e={}){const t={};if(e.dateFrom||e.dateTo){const n=e.dateFrom?l(e.dateFrom):"",r=e.dateTo?l(e.dateTo):"";t.date={...n?{$gte:n}:{},...r?{$lte:r}:{}}}
e.fundType&&"all"!==e.fundType&&(t.fundType=String(e.fundType));let r=await a.findAll(t,{sort:{date:-1,createdAt:-1,code:-1},limit:e.limit||500});const o=n(e.q||e.search||"")
;return o&&(r=r.filter(e=>[e.code,e.expenseType,e.receiverName,e.note,e.status].some(e=>n(e).includes(o)))),{vouchers:r}}async function Z(e={}){const t={};if(e.dateFrom||e.dateTo){
const n=e.dateFrom?l(e.dateFrom):"",r=e.dateTo?l(e.dateTo):"";t.date={...n?{$gte:n}:{},...r?{$lte:r}:{}}}let r=await d.findAll(t,{sort:{date:-1,createdAt:-1,code:-1},
limit:e.limit||500});const o=n(e.q||e.search||"");return o&&(r=r.filter(e=>[e.code,e.fromFund,e.toFund,e.bankName,e.note,e.status].some(e=>n(e).includes(o)))),{transfers:r}}
async function J(t,n={}){const r=await s.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu nộp quỹ",status:404}
;if(["cancelled","canceled","void","deleted"].includes(String(r.status||"").toLowerCase()))return{error:"Phiếu nộp quỹ đã hủy",status:400}
;if(r.fundPosted||"confirmed"===String(r.status||"").toLowerCase())return{submission:r,ledgers:[],message:"Phiếu đã ghi sổ quỹ trước đó"}
;const i=p(n.submittedCashAmount??r.submittedCashAmount??r.reportCashAmount),a=p(n.submittedBankAmount??r.submittedBankAmount??r.reportBankAmount),d=i-p(r.reportCashAmount),u=a-p(r.reportBankAmount),c=String(n.confirmedBy||n.updatedBy||n.actorCode||"").trim(),f=$({
...r,submittedCashAmount:i,submittedBankAmount:a,differenceCashAmount:d,differenceBankAmount:u},{...n,submittedCashAmount:i,submittedBankAmount:a,differenceCashAmount:d,
differenceBankAmount:u});if(f.error)return f;const h={...r,submittedCashAmount:i,submittedBankAmount:a,differenceCashAmount:d,differenceBankAmount:u,
matchStatus:0===d&&0===u?"matched":"mismatch",status:"confirmed",fundPosted:!0,postedAt:e.nowIso(),confirmedAt:e.nowIso(),confirmedBy:c,
shortageClassifiedAt:f.plans.length?e.nowIso():"",shortageClassifiedBy:f.plans.length?c:"",note:String(n.note??r.note??"").trim(),updatedAt:e.nowIso()},l=[];let y=[]
;return await o(async e=>{await s.upsert(h,{session:e}),i>0&&l.push(await H({date:h.deliveryDate,fundType:"cash",direction:"in",amount:i,sourceType:"DELIVERY_CASH_SUBMISSION",
sourceId:h.id,sourceCode:h.code,deliveryDate:h.deliveryDate,deliveryStaffCode:h.deliveryStaffCode,deliveryStaffName:h.deliveryStaffName,createdBy:c,
note:`NVGH ${h.deliveryStaffName||h.deliveryStaffCode} nộp tiền mặt giao hàng ngày ${h.deliveryDate}`},{session:e})),a>0&&l.push(await H({date:h.deliveryDate,fundType:"bank",
direction:"in",amount:a,sourceType:"DELIVERY_CASH_SUBMISSION",sourceId:h.id,sourceCode:h.code,deliveryDate:h.deliveryDate,deliveryStaffCode:h.deliveryStaffCode,
deliveryStaffName:h.deliveryStaffName,createdBy:c,note:`NVGH ${h.deliveryStaffName||h.deliveryStaffCode} đối soát chuyển khoản giao hàng ngày ${h.deliveryDate}`},{session:e})),
y=await F(h,f.plans,c,{session:e})}),await m.log("DELIVERY_CASH_SUBMISSION_CONFIRMED",{refType:"DELIVERY_CASH_SUBMISSION",refId:h.id,refCode:h.code,user:c,summary:{
submittedCashAmount:i,submittedBankAmount:a,differenceCashAmount:d,differenceBankAmount:u,shortageCodes:y.map(e=>e.code)},note:`Xác nhận phiếu nộp quỹ ${h.code}`}),{submission:h,
ledgers:l.filter(Boolean),shortages:y,message:"Đã xác nhận phiếu nộp quỹ, ghi fundLedgers và quản lý khoản thiếu"}}async function W(t,n={}){const r=await s.findByIdOrCode(t)
;if(!r)return{error:"Không tìm thấy phiếu nộp quỹ",status:404};if(!r.fundPosted&&"confirmed"!==String(r.status||"").toLowerCase())return{
error:"Chỉ phân loại bổ sung cho phiếu đã xác nhận",status:409};const i=$(r,n);if(i.error)return i;if(!i.plans.length)return{error:"Phiếu không có khoản thiếu cần phân loại",
status:400};const a=String(n.classifiedBy||n.updatedBy||n.actorCode||"").trim();let d=[];const u={...r,shortageClassifiedAt:e.nowIso(),shortageClassifiedBy:a,updatedAt:e.nowIso()}
;return await o(async e=>{d=await F(u,i.plans,a,{session:e}),await s.patchByIdOrCode(t,{shortageClassifiedAt:u.shortageClassifiedAt,shortageClassifiedBy:u.shortageClassifiedBy,
updatedAt:u.updatedAt},{session:e})}),await m.log("DELIVERY_CASH_SHORTAGE_CLASSIFIED",{refType:"DELIVERY_CASH_SUBMISSION",refId:r.id,refCode:r.code,user:a,summary:{
shortageCodes:d.map(e=>e.code)},note:`Phân loại khoản thiếu cho phiếu ${r.code}`}),{submission:u,shortages:d,message:"Đã lưu phân loại khoản thiếu của phiếu đã xác nhận"}}
async function ee(e){const t=await u.findByIdOrCode(e);if(!t)return{error:"Không tìm thấy khoản thiếu quỹ",status:404};const n=await c.findAll({$or:[{shortageId:t.id},{
shortageCode:t.code}]},{sort:{createdAt:-1,code:-1},limit:500}),r=n.filter(e=>"pending"===String(e.status||"").toLowerCase()).reduce((e,t)=>e+p(t.amount),0);return{shortage:t,
repayments:n,summary:{originalShortageAmount:p(t.originalShortageAmount),settledAmount:p(t.settledAmount),adjustedAmount:p(t.adjustedAmount),
outstandingAmount:p(t.outstandingAmount),pendingAmount:r,availableToRepay:Math.max(0,p(t.outstandingAmount)-r)}}}async function te(n,r={}){const i=p(r.amount);if(i<=0)return{
error:"Số tiền nộp bù phải lớn hơn 0",status:400};const s=String(r.createdBy||r.actorCode||"").trim();let a=null,d=null;return await o(async o=>{if(d=await u.findByIdOrCode(n,{
session:o}),!d)throw Object.assign(new Error("Không tìm thấy khoản thiếu quỹ"),{status:404})
;if("delivery_staff"!==String(d.responsibleType||""))throw Object.assign(new Error("Khoản thiếu này không được ghi nhận là công nợ của NVGH"),{status:409})
;if(!["open","partial"].includes(String(d.status||"").toLowerCase())||p(d.outstandingAmount)<=0)throw Object.assign(new Error("Khoản thiếu đã tất toán hoặc không còn được phép nộp bù"),{
status:409});const m=await u.reservePendingRepayment(d.id||d.code,i,e.nowIso(),{session:o});if(!m){const e=(await c.findAll({$or:[{shortageId:d.id},{shortageCode:d.code}],
status:"pending"},{session:o,limit:500})).reduce((e,t)=>e+p(t.amount),0),t=Math.max(0,p(d.outstandingAmount)-e)
;throw Object.assign(new Error(`Số tiền nộp bù vượt số còn có thể lập phiếu (${t})`),{status:409})}d=m;const f=e.nowIso();a={id:t("DSR"),code:N(d,r.repaymentDate||r.date),
shortageId:d.id,shortageCode:d.code,sourceSubmissionId:d.sourceSubmissionId,sourceSubmissionCode:d.sourceSubmissionCode,deliveryDate:d.deliveryDate,
deliveryStaffCode:d.deliveryStaffCode,deliveryStaffName:d.deliveryStaffName,repaymentDate:l(r.repaymentDate||r.date),fundType:g(r.fundType||r.paymentMethod),amount:i,
status:"pending",fundPosted:!1,note:String(r.note||"").trim(),createdBy:s,createdAt:f,updatedAt:f},await c.upsert(a,{session:o})}),
await m.log("DELIVERY_SHORTAGE_REPAYMENT_CREATED",{refType:"DELIVERY_CASH_SHORTAGE",refId:d.id,refCode:d.code,user:s,summary:a,note:`Tạo phiếu nộp bù ${a.code}`}),{shortage:d,
repayment:a,message:"Đã tạo phiếu nộp bù, chờ kế toán xác nhận ghi quỹ"}}async function ne(t,n={}){let r=await c.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu nộp bù",
status:404};if(r.fundPosted||"confirmed"===String(r.status||"").toLowerCase()){const e=await u.findByIdOrCode(r.shortageId||r.shortageCode);return{repayment:r,shortage:e,
ledger:null,message:"Phiếu nộp bù đã ghi quỹ trước đó"}}if("pending"!==String(r.status||"").toLowerCase())return{error:"Phiếu nộp bù không ở trạng thái chờ xác nhận",status:409}
;const i=p(r.amount);if(i<=0)return{error:"Số tiền nộp bù không hợp lệ",status:400};const s=String(n.confirmedBy||n.updatedBy||n.actorCode||"").trim();let a=null,d=null
;return await o(async n=>{const o=await c.findByIdOrCode(t,{session:n})
;if(!o||o.fundPosted||"pending"!==String(o.status||""))throw Object.assign(new Error("Phiếu nộp bù đã được xử lý bởi phiên khác"),{status:409})
;if(a=await u.applyConfirmedRepayment(o.shortageId||o.shortageCode,i,e.nowIso(),{session:n}),
!a)throw Object.assign(new Error("Số tiền nộp bù vượt khoản còn thiếu hoặc khoản thiếu đã khóa"),{status:409});const m=e.nowIso();if(r=await c.markConfirmedIfPending(t,{
status:"confirmed",fundPosted:!0,postedAt:m,confirmedAt:m,confirmedBy:s,updatedAt:m},{session:n}),!r)throw Object.assign(new Error("Phiếu nộp bù đã được xác nhận trước đó"),{
status:409});d=await H({date:r.repaymentDate,fundType:r.fundType,direction:"in",amount:i,sourceType:"DELIVERY_SHORTAGE_REPAYMENT",sourceId:r.id,sourceCode:r.code,
deliveryDate:r.deliveryDate,deliveryStaffCode:r.deliveryStaffCode,deliveryStaffName:r.deliveryStaffName,createdBy:s,
note:r.note||`NVGH ${r.deliveryStaffName||r.deliveryStaffCode} nộp bù thiếu quỹ ${r.shortageCode}`},{session:n})}),await m.log("DELIVERY_SHORTAGE_REPAYMENT_CONFIRMED",{
refType:"DELIVERY_CASH_SHORTAGE",refId:a.id,refCode:a.code,user:s,summary:{repaymentCode:r.code,amount:i,outstandingAmount:a.outstandingAmount},
note:`Xác nhận phiếu nộp bù ${r.code}`}),{repayment:r,shortage:a,ledger:d,message:"Đã xác nhận nộp bù, tăng quỹ và giảm công nợ thiếu quỹ NVGH"}}async function re(n={}){
const r=p(n.amount);if(r<=0)return{error:"Số tiền chi phải lớn hơn 0",status:400};const o={id:String(n.id||t("PC")).trim(),code:String(n.code||await v()).trim(),date:l(n.date),
fundType:"bank"===String(n.fundType||"cash").toLowerCase()?"bank":"cash",amount:r,expenseType:String(n.expenseType||"other").trim(),receiverName:String(n.receiverName||"").trim(),
note:String(n.note||"").trim(),status:"pending",fundPosted:!1,createdBy:String(n.createdBy||"").trim(),createdAt:e.nowIso(),updatedAt:e.nowIso()};return await a.upsert(o),{
voucher:o,message:"Đã tạo phiếu chi, chờ xác nhận ghi sổ quỹ"}}async function oe(t,n={}){const r=await a.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu chi",status:404}
;if(K(r))return Y("Phiếu chi");const o=p(n.amount??r.amount);if(o<=0)return{error:"Số tiền chi phải lớn hơn 0",status:400};const i={...r,date:l(n.date||r.date),
fundType:"bank"===String(n.fundType||r.fundType||"cash").toLowerCase()?"bank":"cash",amount:o,expenseType:String(n.expenseType??r.expenseType??"other").trim(),
receiverName:String(n.receiverName??r.receiverName??"").trim(),note:String(n.note??r.note??"").trim(),status:"pending",updatedAt:e.nowIso()};return await a.upsert(i),{voucher:i,
message:"Đã cập nhật phiếu chi"}}async function ie(t,n={}){const r=await a.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu chi",status:404}
;if(["cancelled","canceled","void","deleted"].includes(String(r.status||"").toLowerCase()))return{error:"Phiếu chi đã hủy",status:400}
;if(r.fundPosted||"confirmed"===String(r.status||"").toLowerCase())return{voucher:r,ledger:null,message:"Phiếu chi đã ghi sổ quỹ trước đó"};const i=p(r.amount);if(i<=0)return{
error:"Số tiền chi phải lớn hơn 0",status:400};const s={...r,status:"confirmed",fundPosted:!0,postedAt:e.nowIso(),confirmedAt:e.nowIso(),
confirmedBy:String(n.confirmedBy||n.updatedBy||"").trim(),updatedAt:e.nowIso()};let d=null;return await o(async e=>{d=await H({date:s.date,fundType:s.fundType,direction:"out",
amount:i,sourceType:"EXPENSE_VOUCHER",sourceId:s.id,sourceCode:s.code,referenceType:"EXPENSE_VOUCHER",referenceId:s.id,referenceCode:s.code,note:s.note||`Phiếu chi ${s.code}`},{
session:e}),await a.upsert(s,{session:e})}),{voucher:s,ledger:d,message:"Đã xác nhận phiếu chi và ghi fundLedgers"}}async function se(n={}){const r=p(n.amount);if(r<=0)return{
error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400}
;const o="bank"===String(n.fromFund||"cash").toLowerCase()?"bank":"cash",i="cash"===String(n.toFund||"bank").toLowerCase()?"cash":"bank";if(o===i)return{
error:"Quỹ nguồn và quỹ đích không được trùng nhau",status:400};const s={id:String(n.id||t("CQ")).trim(),code:String(n.code||await I()).trim(),date:l(n.date),fromFund:o,toFund:i,
amount:r,bankName:String(n.bankName||"").trim(),accountNumber:String(n.accountNumber||"").trim(),note:String(n.note||"").trim(),status:"pending",fundPosted:!1,
createdBy:String(n.createdBy||"").trim(),createdAt:e.nowIso(),updatedAt:e.nowIso()};return await d.upsert(s),{transfer:s,message:"Đã tạo phiếu chuyển quỹ, chờ xác nhận ghi sổ quỹ"}
}async function ae(t,n={}){const r=await d.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu chuyển quỹ",status:404};if(K(r))return Y("Phiếu chuyển quỹ")
;const o=p(n.amount??r.amount);if(o<=0)return{error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400}
;const i="bank"===String(n.fromFund||r.fromFund||"cash").toLowerCase()?"bank":"cash",s="cash"===String(n.toFund||r.toFund||"bank").toLowerCase()?"cash":"bank";if(i===s)return{
error:"Quỹ nguồn và quỹ đích không được trùng nhau",status:400};const a={...r,date:l(n.date||r.date),fromFund:i,toFund:s,amount:o,
bankName:String(n.bankName??r.bankName??"").trim(),accountNumber:String(n.accountNumber??r.accountNumber??"").trim(),note:String(n.note??r.note??"").trim(),status:"pending",
updatedAt:e.nowIso()};return await d.upsert(a),{transfer:a,message:"Đã cập nhật phiếu chuyển quỹ"}}async function de(t,n={}){const r=await d.findByIdOrCode(t);if(!r)return{
error:"Không tìm thấy phiếu chuyển quỹ",status:404};if(["cancelled","canceled","void","deleted"].includes(String(r.status||"").toLowerCase()))return{
error:"Phiếu chuyển quỹ đã hủy",status:400};if(r.fundPosted||"confirmed"===String(r.status||"").toLowerCase())return{transfer:r,ledgers:[],
message:"Phiếu chuyển quỹ đã ghi sổ quỹ trước đó"};const i=p(r.amount);if(i<=0)return{error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400};const s={...r,status:"confirmed",
fundPosted:!0,postedAt:e.nowIso(),confirmedAt:e.nowIso(),confirmedBy:String(n.confirmedBy||n.updatedBy||"").trim(),updatedAt:e.nowIso()},a=[];return await o(async e=>{
a.push(await H({date:s.date,fundType:s.fromFund,direction:"out",amount:i,sourceType:"FUND_TRANSFER",sourceId:s.id,sourceCode:s.code,referenceType:"FUND_TRANSFER",referenceId:s.id,
referenceCode:s.code,note:s.note||`Chuyển quỹ ${s.fromFund} sang ${s.toFund}`},{session:e})),a.push(await H({date:s.date,fundType:s.toFund,direction:"in",amount:i,
sourceType:"FUND_TRANSFER",sourceId:s.id,sourceCode:s.code,referenceType:"FUND_TRANSFER",referenceId:s.id,referenceCode:s.code,note:s.note||`Nhận chuyển quỹ từ ${s.fromFund}`},{
session:e})),await d.upsert(s,{session:e})}),{transfer:s,ledgers:a.filter(Boolean),message:"Đã xác nhận chuyển quỹ và ghi fundLedgers"}}module.exports={listFundLedgers:x,
summarizeFundLedgers:P,buildDeliverySubmissionDraft:U,createDeliveryCashSubmission:G,listDeliveryCashSubmissions:j,listExpenseVouchers:X,listFundTransfers:Z,
confirmDeliveryCashSubmission:J,classifyConfirmedDeliveryShortages:W,getDeliveryCashShortageHistory:ee,createDeliveryShortageRepayment:te,confirmDeliveryShortageRepayment:ne,
updateDeliveryCashSubmission:z,createExpenseVoucher:re,updateExpenseVoucher:oe,confirmExpenseVoucher:ie,createFundTransfer:se,updateFundTransfer:ae,confirmFundTransfer:de,
postFundLedger:H,buildFundLedgerIdempotencyKey:b};
