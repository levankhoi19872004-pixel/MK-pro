/* GENERATED FILE — edit src/services/fundService.source/part-01.jsfrag, src/services/fundService.source/part-02.jsfrag, src/services/fundService.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{makeId:t,normalizeText:r,toNumber:n}=require("../utils/common.util"),{withMongoTransaction:o}=require("../utils/transaction.util"),i=require("../repositories/fundLedgerRepository"),a=require("../repositories/deliveryCashSubmissionRepository"),s=require("../repositories/expenseVoucherRepository"),d=require("../repositories/fundTransferRepository"),u=require("../repositories/deliveryCashShortageRepository"),c=require("../repositories/deliveryShortageRepaymentRepository"),m=require("./auditService")
;function f(){return require("./master-order/masterOrderDelivery.service")}const{pickDeliveryStaffCode:l}=require("../domain/staff/staffIdentity");function p(t){
return e.toDateOnly(t||e.todayVN())}function h(e){return Math.max(0,Math.round(n(e)))}function y(e={}){
return!["void","voided","cancelled","canceled","deleted","removed","reversed","superseded"].includes(String(e.status||"").toLowerCase())}function g(e){
return"bank"===String(e||"cash").toLowerCase()?"bank":"cash"}function S(e){return"out"===String(e||"in").toLowerCase()?"out":"in"}function C(e,t){
return(String(e||"").trim()||String(t||"cash")).toUpperCase()}function A(e){return String(e||"").trim().toUpperCase()}function v(e={}){
const t=g(e.fundType),r=S(e.direction),n=C(e.account,t),o=String(e.sourceType||"MANUAL_FUND").trim()||"MANUAL_FUND",i=String(e.sourceId||e.sourceCode||e.referenceId||e.referenceCode||e.refId||e.refCode||e.id||e.code||"").trim()
;return i?[o,i,t,r,n].map(A).join("|"):""}function T(e="",t=""){return"FUND_TRANSFER"===A(e)?"TRANSFER":"out"===S(t)?"EXPENSE":"RECEIPT"}function b(e="",t=""){const r=T(e,t)
;return"TRANSFER"===r?"fund_transfer":"EXPENSE"===r?"fund_expense":"fund_receipt"}function w(e,t=[]){const r=t.reduce((e,t)=>{const r=String(t.code||"").match(/(\d+)$/)
;return Math.max(e,r?Number(r[1]):0)},0);return`${e}${String(r+1).padStart(5,"0")}`}async function I(){return w("FL",await i.findAll({code:{$regex:"^FL\\d+$"}},{projection:"code",
sort:{code:-1},limit:1}))}async function N(){return w("PC",await s.findAll())}async function B(){return w("CQ",await d.findAll())}function k(e,t){
return`NQGH-${String(p(e)).replace(/-/g,"")}-${String(t||"NO_NVGH").trim().replace(/[^a-zA-Z0-9_-]/g,"").slice(0,24)||"NO_NVGH"}`}function R(e,t){const r="bank"===g(t)?"TK":"TM"
;return`DCSH-${String(e||"").trim()}-${r}`}function D(e={},t){
return`NQBU-${String(p(t)).replace(/-/g,"")}-${String(e.deliveryStaffCode||"NVGH").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,20)||"NVGH"}-${String(Date.now()).slice(-7)+String(Math.floor(100*Math.random())).padStart(2,"0")}`
}const E={cash:{collected_not_remitted:{responsibleType:"delivery_staff",status:"open"},customer_not_paid:{responsibleType:"customer",status:"customer_outstanding"},
approved_expense:{responsibleType:"adjustment",status:"adjusted",requireNote:!0},pending_review:{responsibleType:"pending",status:"disputed",requireNote:!0}},bank:{
pending_bank_reconciliation:{responsibleType:"pending",status:"pending_reconciliation"},delivery_staff_liability:{responsibleType:"delivery_staff",status:"open"},
customer_not_paid:{responsibleType:"customer",status:"customer_outstanding"},approved_adjustment:{responsibleType:"adjustment",status:"adjusted",requireNote:!0}}};function _(e){
return Math.max(0,-Math.round(n(e)))}function q(e={},t){
return(e.shortageResolution&&"object"==typeof e.shortageResolution?e.shortageResolution[t]:null)||e[`${t}ShortageResolution`]||null}function $(e={},t,r){if(r<=0)return null
;const n=q(e,t),o="string"==typeof n?{reasonType:n}:n||{},i=String(o.reasonType||o.reason||"").trim(),a=E[t]?.[i];if(!a)return{
error:"bank"===t?"Cần chọn cách xử lý khoản thiếu chuyển khoản trước khi xác nhận":"Cần chọn cách xử lý khoản thiếu tiền mặt trước khi xác nhận",fundType:t,shortageAmount:r}
;const s=String(o.note||e.shortageNote||"").trim();if(a.requireNote&&!s)return{error:"Cần nhập ghi chú giải trình cho cách xử lý khoản thiếu đã chọn",fundType:t,shortageAmount:r}
;const d="adjustment"===a.responsibleType?r:0;return{fundType:t,reasonType:i,responsibleType:a.responsibleType,status:a.status,originalShortageAmount:r,settledAmount:0,
adjustedAmount:d,outstandingAmount:Math.max(0,r-d),note:s}}function F(e={},t={}){const r={
cash:_(t.differenceCashAmount??e.differenceCashAmount??h(t.submittedCashAmount??e.submittedCashAmount)-h(e.reportCashAmount)),
bank:_(t.differenceBankAmount??e.differenceBankAmount??h(t.submittedBankAmount??e.submittedBankAmount)-h(e.reportBankAmount))},n=[],o=[];for(const e of["cash","bank"]){
if(r[e]<=0)continue;const i=$(t,e,r[e]);i?.error?o.push(i):n.push(i)}return o.length?{error:o.map(e=>e.error).join(". "),status:422,requiresShortageResolution:!0,shortages:o}:{
plans:n,amounts:r}}function L(t={},r={},n=""){const o=e.nowIso();return{id:R(t.code,r.fundType),code:R(t.code,r.fundType),sourceSubmissionId:String(t.id||"").trim(),
sourceSubmissionCode:String(t.code||"").trim(),deliveryDate:String(t.deliveryDate||"").trim(),deliveryStaffCode:String(t.deliveryStaffCode||"").trim(),
deliveryStaffName:String(t.deliveryStaffName||"").trim(),fundType:g(r.fundType),reasonType:String(r.reasonType||"").trim(),responsibleType:String(r.responsibleType||"").trim(),
originalShortageAmount:h(r.originalShortageAmount),settledAmount:h(r.settledAmount),adjustedAmount:h(r.adjustedAmount),pendingRepaymentAmount:0,
outstandingAmount:h(r.outstandingAmount),status:String(r.status||"open").trim(),note:String(r.note||"").trim(),classifiedBy:String(n||"").trim(),classifiedAt:o,
createdBy:String(n||"").trim(),createdAt:o,updatedAt:o}}async function O(e,t=[],r="",n={}){const o=[];for(const i of t){
const t=await u.findBySourceAndFundType(e.id,e.code,i.fundType,n);if(t){o.push(t);continue}const a=L(e,i,r);await u.upsert(a,n),o.push(a)}return o}function P(e,t){
return String(e||t||"").trim()}function x(e,t){
return!t||[e.code,e.sourceCode,e.sourceType,e.deliveryStaffCode,e.deliveryStaffName,e.customerCode,e.customerName,e.staffName,e.note,e.status].some(e=>r(e).includes(t))}
function M(e=[]){
const t=e.filter(y),r=t.filter(e=>"cash"===e.fundType&&"in"===e.direction).reduce((e,t)=>e+n(t.amount),0),o=t.filter(e=>"cash"===e.fundType&&"out"===e.direction).reduce((e,t)=>e+n(t.amount),0),i=t.filter(e=>"bank"===e.fundType&&"in"===e.direction).reduce((e,t)=>e+n(t.amount),0),a=t.filter(e=>"bank"===e.fundType&&"out"===e.direction).reduce((e,t)=>e+n(t.amount),0)
;return{cashIn:r,cashOut:o,cashBalance:r-o,bankIn:i,bankOut:a,bankBalance:i-a,totalIn:r+i,totalOut:o+a,totalBalance:r+i-o-a}}async function H(e={}){const t={status:{
$nin:["void","cancelled","canceled","deleted"]}};e.fundType&&"all"!==e.fundType&&(t.fundType=String(e.fundType)),e.direction&&"all"!==e.direction&&(t.direction=String(e.direction))
;const r=e.dateFrom?p(e.dateFrom):"",o=e.dateTo?p(e.dateTo):"";(r||o)&&(t.date={...r?{$gte:r}:{},...o?{$lte:o}:{}});const a=String(e.q||e.search||"").trim();if(a){
const e=a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),r=new RegExp(e,"i")
;t.$or=["code","sourceCode","sourceType","deliveryStaffCode","deliveryStaffName","customerCode","customerName","staffName","note","status"].map(e=>({[e]:r}))}
const s=Math.max(Number(e.page||1),1),d=Math.min(Math.max(Number(e.limit||50),1),200),u=(s-1)*d,c=(await i.aggregate([{$match:t},{$facet:{rows:[{$sort:{date:-1,createdAt:-1,code:-1
}},{$skip:u},{$limit:d}],totals:[{$group:{_id:{fundType:"$fundType",direction:"$direction"},amount:{$sum:{$ifNull:["$amount",0]}},count:{$sum:1}}}],count:[{$count:"total"}]}
}]))[0]||{rows:[],totals:[],count:[]},m=(c.totals||[]).map(e=>({fundType:e._id?.fundType,direction:e._id?.direction,amount:n(e.amount),count:n(e.count)})),f=M(m.map(e=>({
fundType:e.fundType,direction:e.direction,amount:e.amount,status:"posted"}))),l=n(c.count?.[0]?.total);return{fundLedgers:c.rows||[],items:c.rows||[],summary:{...f,groups:m},meta:{
page:s,limit:d,total:l,totalPages:Math.ceil(l/d),hasMore:u+(c.rows||[]).length<l}}}async function V(e,t,r,n,o="",a=""){const s=v({sourceType:e,sourceCode:t,sourceId:o,fundType:r,
direction:n,account:a});if(s){const e=await i.findByIdempotencyKey(s);if(e)return e}const d={fundType:r,direction:n,$or:[{sourceType:e,sourceCode:t},{referenceType:e,
referenceCode:t}]};return a&&(d.account=a),o&&d.$or.push({sourceType:e,sourceId:o},{referenceType:e,referenceId:o}),(await i.findAll(d,{limit:1}))[0]||null}
async function U(r={},n={}){const o=h(r.amount);if(o<=0)return null
;const a=g(r.fundType),s=S(r.direction),d=C(r.account,a),u=String(r.sourceType||"MANUAL_FUND").trim(),c=String(r.sourceId||r.refId||r.referenceId||"").trim(),m=String(r.sourceCode||r.refCode||r.referenceCode||"").trim(),f=String(r.idempotencyKey||v({
...r,sourceType:u,sourceId:c,sourceCode:m,fundType:a,direction:s,account:d})).trim();if(!f)throw new Error("Thiếu sourceId/sourceCode để tạo idempotencyKey cho fund ledger")
;const l=await i.findByIdempotencyKey(f,n);if(l)return{ok:!0,skipped:!0,ledger:l,reason:"DUPLICATE_FUND_LEDGER"};const y={id:String(r.id||t("FL")).trim(),
code:String(r.code||await I()).trim(),date:p(r.date),fundType:a,direction:s,account:d,category:String(r.category||T(u,s)).trim(),type:String(r.type||b(u,s)).trim(),
idempotencyKey:f,amount:o,sourceType:u,sourceId:c,sourceCode:m,refType:String(r.refType||u).trim(),refId:String(r.refId||c).trim(),refCode:String(r.refCode||m).trim(),
referenceType:String(r.referenceType||r.refType||u).trim(),referenceId:String(r.referenceId||r.refId||c).trim(),referenceCode:String(r.referenceCode||r.refCode||m).trim(),
deliveryDate:String(r.deliveryDate||"").trim(),deliveryStaffCode:String(r.deliveryStaffCode||"").trim(),deliveryStaffName:String(r.deliveryStaffName||"").trim(),
salesStaffCode:String(r.salesStaffCode||"").trim(),salesStaffName:String(r.salesStaffName||"").trim(),customerCode:String(r.customerCode||"").trim(),
customerName:String(r.customerName||"").trim(),staffCode:String(r.staffCode||"").trim(),staffName:String(r.staffName||"").trim(),staffRole:String(r.staffRole||"").trim(),
collectorType:String(r.collectorType||"").trim(),collectorCode:String(r.collectorCode||"").trim(),collectorName:String(r.collectorName||"").trim(),
receiverCode:String(r.receiverCode||"").trim(),receiverName:String(r.receiverName||"").trim(),receiverRole:String(r.receiverRole||"").trim(),
supplierCode:String(r.supplierCode||"").trim(),supplierName:String(r.supplierName||"").trim(),payerCode:String(r.payerCode||"").trim(),payerName:String(r.payerName||"").trim(),
payerRole:String(r.payerRole||"").trim(),depositorCode:String(r.depositorCode||"").trim(),depositorName:String(r.depositorName||"").trim(),
depositorRole:String(r.depositorRole||"").trim(),counterpartyCode:String(r.counterpartyCode||"").trim(),counterpartyName:String(r.counterpartyName||"").trim(),
counterpartyRole:String(r.counterpartyRole||"").trim(),isReversal:!0===r.isReversal,reversalOf:String(r.reversalOf||"").trim(),
originalSourceId:String(r.originalSourceId||"").trim(),note:String(r.note||"").trim(),status:String(r.status||"posted").trim(),accountingConfirmed:!1!==r.accountingConfirmed,
accountingStatus:String(r.accountingStatus||"confirmed").trim(),createdBy:String(r.createdBy||"").trim(),createdAt:r.createdAt||e.nowIso(),updatedAt:e.nowIso()};try{
return await i.upsert(y,n),y}catch(e){if(e&&(11e3===e.code||String(e.message||"").includes("duplicate key"))){const e=await i.findByIdempotencyKey(f,n);if(e)return{ok:!0,
skipped:!0,ledger:e,reason:"DUPLICATE_FUND_LEDGER"}}throw e}}function j(e,t=[]){for(const r of t){const t=n(e[r]);if(t>0)return t}return 0}async function G(n={}){
const o=p(n.deliveryDate||n.date),i=String(l(n)||n.delivery||"").trim();if(!i)return{error:"Thiếu nhân viên giao hàng để tạo phiếu nộp quỹ",status:400}
;const a=f(),s="function"==typeof a.listDeliveryTodayOrdersCompact?a.listDeliveryTodayOrdersCompact:a.listDeliveryToday,d=await s({date:o,delivery:i,deliveryStaffCode:i,page:1,
limit:5e3}),u=r(i),c=(d.orders||d.rows||[]).filter(e=>r(l(e)||e.deliveryStaffCode)===u);if(!c.length)return{error:"Không có đơn giao để tạo phiếu nộp quỹ",status:404}
;const m=c.find(e=>e.deliveryStaffName)?.deliveryStaffName||i,y=c.reduce((e,t)=>e+j(t,["cashAmount","cashCollected"]),0),g=c.reduce((e,t)=>e+j(t,["bankAmount","bankCollected","transferAmount"]),0),S=c.reduce((e,t)=>e+j(t,["oldDebtCashCollected","debtCashCollected","arCashCollected"]),0),C=c.reduce((e,t)=>e+j(t,["oldDebtBankCollected","debtBankCollected","arBankCollected"]),0),A=y+S,v=g+C,T=k(o,i),b=h(n.submittedCashAmount??A),w=h(n.submittedBankAmount??v)
;return{draft:{id:String(n.id||t("NQGH")).trim(),code:T,deliveryDate:o,deliveryStaffCode:i,deliveryStaffName:m,reportCashAmount:A,reportBankAmount:v,reportCurrentOrderCashAmount:y,
reportCurrentOrderBankAmount:g,reportOldDebtCashAmount:S,reportOldDebtBankAmount:C,submittedCashAmount:b,submittedBankAmount:w,differenceCashAmount:b-A,differenceBankAmount:w-v,
orderCodes:c.map(e=>e.orderCode||e.code||"").filter(Boolean),orderIds:c.map(e=>e.id||"").filter(Boolean),status:String(n.status||"pending").trim(),
matchStatus:b===A&&w===v?"matched":"mismatch",fundPosted:!1,note:String(n.note||"").trim(),createdBy:String(n.createdBy||"").trim(),createdAt:e.nowIso(),updatedAt:e.nowIso()},
orders:c,deliverySummary:d.summary||d.kpi||{}}}async function K(e={}){const t=await G(e);if(t.error)return t;const r=t.draft,n=await a.findByIdOrCode(r.code)
;return n&&!["cancelled","canceled","void","deleted"].includes(String(n.status||"").toLowerCase())?{error:`Đã có phiếu nộp quỹ ${n.code} cho ngày/NVGH này`,status:409,submission:n
}:(await a.upsert(r),{submission:r,orders:t.orders})}async function Y(e={}){const t={};(e.deliveryDate||e.date)&&(t.deliveryDate=p(e.deliveryDate||e.date)),
(l(e)||e.delivery)&&(t.deliveryStaffCode=String(l(e)||e.delivery).trim());let n=await a.findAll(t,{sort:{deliveryDate:-1,createdAt:-1,code:-1},limit:e.limit||500})
;const o=r(e.q||e.search||"");if(o&&(n=n.filter(e=>x(e,o))),!n.length)return{submissions:[]}
;const i=n.map(e=>String(e.id||"").trim()).filter(Boolean),s=n.map(e=>String(e.code||"").trim()).filter(Boolean),d=[];i.length&&d.push({sourceSubmissionId:{$in:i}}),
s.length&&d.push({sourceSubmissionCode:{$in:s}});const c=d.length?await u.findAll({$or:d},{limit:Math.min(1e3,3*n.length)}):[],m=new Map;for(const e of c){
const t=[P(e.sourceSubmissionId,""),P("",e.sourceSubmissionCode)].filter(Boolean);for(const r of t)m.has(r)||m.set(r,{}),m.get(r)[g(e.fundType)]=e}return n=n.map(e=>{
const t=m.get(P(e.id,""))||m.get(P("",e.code))||{};return{...e,cashShortage:t.cash||null,bankShortage:t.bank||null}}),{submissions:n}}function Q(e={}){
return["confirmed","matched","posted"].includes(String(e.status||"").toLowerCase())||!0===e.fundPosted}function X(e){return{error:`${e} đã xác nhận, không được sửa nghiệp vụ`,
status:409}}function z(e={},t={}){const r=String(e.id||"").trim(),n=String(t.id||"").trim();if(r&&n)return r===n;const o=String(e.code||"").trim(),i=String(t.code||"").trim()
;return Boolean(o&&i&&o===i)}async function Z(t,r={}){const n=await a.findByIdOrCode(t);if(!n)return{error:"Không tìm thấy phiếu nộp quỹ",status:404}
;if(Q(n))return X("Phiếu nộp quỹ")
;const o=h(r.submittedCashAmount??n.submittedCashAmount??n.reportCashAmount),i=h(r.submittedBankAmount??n.submittedBankAmount??n.reportBankAmount),s=r.deliveryDate??r.date??n.deliveryDate,d=String(l(r)||r.delivery||n.deliveryStaffCode||"").trim(),u=await G({
...n,...r,id:n.id,deliveryDate:s,deliveryStaffCode:d,submittedCashAmount:o,submittedBankAmount:i,status:"pending",note:String(r.note??n.note??"").trim(),
createdBy:n.createdBy||r.createdBy||""});if(u.error)return u;const c=u.draft;if(String(c.code||"")!==String(n.code||"")){const e=await a.findByIdOrCode(c.code)
;if(e&&!z(n,e))return{error:`Đã có phiếu nộp quỹ ${c.code} cho ngày/NVGH này`,status:409,submission:e}}const m={...n,...c,id:n.id||c.id,createdBy:n.createdBy||c.createdBy||"",
createdAt:n.createdAt||c.createdAt,status:"pending",fundPosted:!1,postedAt:"",confirmedAt:"",confirmedBy:"",updatedAt:e.nowIso()},f=await a.patchByIdOrCode(t,m);return f?{
submission:f,orders:u.orders,message:"Đã cập nhật phiếu nộp quỹ và đồng bộ lại số báo cáo theo ngày/NVGH"}:{error:"Phiếu nộp quỹ đã thay đổi hoặc không còn tồn tại",status:409}}
async function J(e={}){const t={};if(e.dateFrom||e.dateTo){const r=e.dateFrom?p(e.dateFrom):"",n=e.dateTo?p(e.dateTo):"";t.date={...r?{$gte:r}:{},...n?{$lte:n}:{}}}
e.fundType&&"all"!==e.fundType&&(t.fundType=String(e.fundType));let n=await s.findAll(t,{sort:{date:-1,createdAt:-1,code:-1},limit:e.limit||500});const o=r(e.q||e.search||"")
;return o&&(n=n.filter(e=>[e.code,e.expenseType,e.receiverCode,e.receiverName,e.receiverRole,e.note,e.status].some(e=>r(e).includes(o)))),{vouchers:n}}async function W(e={}){
const t={};if(e.dateFrom||e.dateTo){const r=e.dateFrom?p(e.dateFrom):"",n=e.dateTo?p(e.dateTo):"";t.date={...r?{$gte:r}:{},...n?{$lte:n}:{}}}let n=await d.findAll(t,{sort:{date:-1,
createdAt:-1,code:-1},limit:e.limit||500});const o=r(e.q||e.search||"")
;return o&&(n=n.filter(e=>[e.code,e.fromFund,e.toFund,e.bankName,e.note,e.status].some(e=>r(e).includes(o)))),{transfers:n}}async function ee(t,r={}){
const n=await a.findByIdOrCode(t);if(!n)return{error:"Không tìm thấy phiếu nộp quỹ",status:404}
;if(["cancelled","canceled","void","deleted"].includes(String(n.status||"").toLowerCase()))return{error:"Phiếu nộp quỹ đã hủy",status:400}
;if(n.fundPosted||"confirmed"===String(n.status||"").toLowerCase())return{submission:n,ledgers:[],message:"Phiếu đã ghi sổ quỹ trước đó"}
;const i=h(r.submittedCashAmount??n.submittedCashAmount??n.reportCashAmount),s=h(r.submittedBankAmount??n.submittedBankAmount??n.reportBankAmount),d=i-h(n.reportCashAmount),u=s-h(n.reportBankAmount),c=String(r.confirmedBy||r.updatedBy||r.actorCode||"").trim(),f=F({
...n,submittedCashAmount:i,submittedBankAmount:s,differenceCashAmount:d,differenceBankAmount:u},{...r,submittedCashAmount:i,submittedBankAmount:s,differenceCashAmount:d,
differenceBankAmount:u});if(f.error)return f;const l={...n,submittedCashAmount:i,submittedBankAmount:s,differenceCashAmount:d,differenceBankAmount:u,
matchStatus:0===d&&0===u?"matched":"mismatch",status:"confirmed",fundPosted:!0,postedAt:e.nowIso(),confirmedAt:e.nowIso(),confirmedBy:c,
shortageClassifiedAt:f.plans.length?e.nowIso():"",shortageClassifiedBy:f.plans.length?c:"",note:String(r.note??n.note??"").trim(),updatedAt:e.nowIso()},p=[];let y=[]
;return await o(async e=>{await a.upsert(l,{session:e}),i>0&&p.push(await U({date:l.deliveryDate,fundType:"cash",direction:"in",amount:i,sourceType:"DELIVERY_CASH_SUBMISSION",
sourceId:l.id,sourceCode:l.code,deliveryDate:l.deliveryDate,deliveryStaffCode:l.deliveryStaffCode,deliveryStaffName:l.deliveryStaffName,createdBy:c,
note:`NVGH ${l.deliveryStaffName||l.deliveryStaffCode} nộp tiền mặt giao hàng ngày ${l.deliveryDate}`},{session:e})),s>0&&p.push(await U({date:l.deliveryDate,fundType:"bank",
direction:"in",amount:s,sourceType:"DELIVERY_CASH_SUBMISSION",sourceId:l.id,sourceCode:l.code,deliveryDate:l.deliveryDate,deliveryStaffCode:l.deliveryStaffCode,
deliveryStaffName:l.deliveryStaffName,createdBy:c,note:`NVGH ${l.deliveryStaffName||l.deliveryStaffCode} đối soát chuyển khoản giao hàng ngày ${l.deliveryDate}`},{session:e})),
y=await O(l,f.plans,c,{session:e})}),await m.log("DELIVERY_CASH_SUBMISSION_CONFIRMED",{refType:"DELIVERY_CASH_SUBMISSION",refId:l.id,refCode:l.code,user:c,summary:{
submittedCashAmount:i,submittedBankAmount:s,differenceCashAmount:d,differenceBankAmount:u,shortageCodes:y.map(e=>e.code)},note:`Xác nhận phiếu nộp quỹ ${l.code}`}),{submission:l,
ledgers:p.filter(Boolean),shortages:y,message:"Đã xác nhận phiếu nộp quỹ, ghi fundLedgers và quản lý khoản thiếu"}}async function te(t,r={}){const n=await a.findByIdOrCode(t)
;if(!n)return{error:"Không tìm thấy phiếu nộp quỹ",status:404};if(!n.fundPosted&&"confirmed"!==String(n.status||"").toLowerCase())return{
error:"Chỉ phân loại bổ sung cho phiếu đã xác nhận",status:409};const i=F(n,r);if(i.error)return i;if(!i.plans.length)return{error:"Phiếu không có khoản thiếu cần phân loại",
status:400};const s=String(r.classifiedBy||r.updatedBy||r.actorCode||"").trim();let d=[];const u={...n,shortageClassifiedAt:e.nowIso(),shortageClassifiedBy:s,updatedAt:e.nowIso()}
;return await o(async e=>{d=await O(u,i.plans,s,{session:e}),await a.patchByIdOrCode(t,{shortageClassifiedAt:u.shortageClassifiedAt,shortageClassifiedBy:u.shortageClassifiedBy,
updatedAt:u.updatedAt},{session:e})}),await m.log("DELIVERY_CASH_SHORTAGE_CLASSIFIED",{refType:"DELIVERY_CASH_SUBMISSION",refId:n.id,refCode:n.code,user:s,summary:{
shortageCodes:d.map(e=>e.code)},note:`Phân loại khoản thiếu cho phiếu ${n.code}`}),{submission:u,shortages:d,message:"Đã lưu phân loại khoản thiếu của phiếu đã xác nhận"}}
async function re(e){const t=await u.findByIdOrCode(e);if(!t)return{error:"Không tìm thấy khoản thiếu quỹ",status:404};const r=await c.findAll({$or:[{shortageId:t.id},{
shortageCode:t.code}]},{sort:{createdAt:-1,code:-1},limit:500}),n=r.filter(e=>"pending"===String(e.status||"").toLowerCase()).reduce((e,t)=>e+h(t.amount),0);return{shortage:t,
repayments:r,summary:{originalShortageAmount:h(t.originalShortageAmount),settledAmount:h(t.settledAmount),adjustedAmount:h(t.adjustedAmount),
outstandingAmount:h(t.outstandingAmount),pendingAmount:n,availableToRepay:Math.max(0,h(t.outstandingAmount)-n)}}}async function ne(r,n={}){const i=h(n.amount);if(i<=0)return{
error:"Số tiền nộp bù phải lớn hơn 0",status:400};const a=String(n.createdBy||n.actorCode||"").trim();let s=null,d=null;return await o(async o=>{if(d=await u.findByIdOrCode(r,{
session:o}),!d)throw Object.assign(new Error("Không tìm thấy khoản thiếu quỹ"),{status:404})
;if("delivery_staff"!==String(d.responsibleType||""))throw Object.assign(new Error("Khoản thiếu này không được ghi nhận là công nợ của NVGH"),{status:409})
;if(!["open","partial"].includes(String(d.status||"").toLowerCase())||h(d.outstandingAmount)<=0)throw Object.assign(new Error("Khoản thiếu đã tất toán hoặc không còn được phép nộp bù"),{
status:409});const m=await u.reservePendingRepayment(d.id||d.code,i,e.nowIso(),{session:o});if(!m){const e=(await c.findAll({$or:[{shortageId:d.id},{shortageCode:d.code}],
status:"pending"},{session:o,limit:500})).reduce((e,t)=>e+h(t.amount),0),t=Math.max(0,h(d.outstandingAmount)-e)
;throw Object.assign(new Error(`Số tiền nộp bù vượt số còn có thể lập phiếu (${t})`),{status:409})}d=m;const f=e.nowIso();s={id:t("DSR"),code:D(d,n.repaymentDate||n.date),
shortageId:d.id,shortageCode:d.code,sourceSubmissionId:d.sourceSubmissionId,sourceSubmissionCode:d.sourceSubmissionCode,deliveryDate:d.deliveryDate,
deliveryStaffCode:d.deliveryStaffCode,deliveryStaffName:d.deliveryStaffName,repaymentDate:p(n.repaymentDate||n.date),fundType:g(n.fundType||n.paymentMethod),amount:i,
status:"pending",fundPosted:!1,note:String(n.note||"").trim(),createdBy:a,createdAt:f,updatedAt:f},await c.upsert(s,{session:o})}),
await m.log("DELIVERY_SHORTAGE_REPAYMENT_CREATED",{refType:"DELIVERY_CASH_SHORTAGE",refId:d.id,refCode:d.code,user:a,summary:s,note:`Tạo phiếu nộp bù ${s.code}`}),{shortage:d,
repayment:s,message:"Đã tạo phiếu nộp bù, chờ kế toán xác nhận ghi quỹ"}}async function oe(t,r={}){let n=await c.findByIdOrCode(t);if(!n)return{error:"Không tìm thấy phiếu nộp bù",
status:404};if(n.fundPosted||"confirmed"===String(n.status||"").toLowerCase()){const e=await u.findByIdOrCode(n.shortageId||n.shortageCode);return{repayment:n,shortage:e,
ledger:null,message:"Phiếu nộp bù đã ghi quỹ trước đó"}}if("pending"!==String(n.status||"").toLowerCase())return{error:"Phiếu nộp bù không ở trạng thái chờ xác nhận",status:409}
;const i=h(n.amount);if(i<=0)return{error:"Số tiền nộp bù không hợp lệ",status:400};const a=String(r.confirmedBy||r.updatedBy||r.actorCode||"").trim();let s=null,d=null
;return await o(async r=>{const o=await c.findByIdOrCode(t,{session:r})
;if(!o||o.fundPosted||"pending"!==String(o.status||""))throw Object.assign(new Error("Phiếu nộp bù đã được xử lý bởi phiên khác"),{status:409})
;if(s=await u.applyConfirmedRepayment(o.shortageId||o.shortageCode,i,e.nowIso(),{session:r}),
!s)throw Object.assign(new Error("Số tiền nộp bù vượt khoản còn thiếu hoặc khoản thiếu đã khóa"),{status:409});const m=e.nowIso();if(n=await c.markConfirmedIfPending(t,{
status:"confirmed",fundPosted:!0,postedAt:m,confirmedAt:m,confirmedBy:a,updatedAt:m},{session:r}),!n)throw Object.assign(new Error("Phiếu nộp bù đã được xác nhận trước đó"),{
status:409});d=await U({date:n.repaymentDate,fundType:n.fundType,direction:"in",amount:i,sourceType:"DELIVERY_SHORTAGE_REPAYMENT",sourceId:n.id,sourceCode:n.code,
deliveryDate:n.deliveryDate,deliveryStaffCode:n.deliveryStaffCode,deliveryStaffName:n.deliveryStaffName,createdBy:a,
note:n.note||`NVGH ${n.deliveryStaffName||n.deliveryStaffCode} nộp bù thiếu quỹ ${n.shortageCode}`},{session:r})}),await m.log("DELIVERY_SHORTAGE_REPAYMENT_CONFIRMED",{
refType:"DELIVERY_CASH_SHORTAGE",refId:s.id,refCode:s.code,user:a,summary:{repaymentCode:n.code,amount:i,outstandingAmount:s.outstandingAmount},
note:`Xác nhận phiếu nộp bù ${n.code}`}),{repayment:n,shortage:s,ledger:d,message:"Đã xác nhận nộp bù, tăng quỹ và giảm công nợ thiếu quỹ NVGH"}}async function ie(r={}){
const n=h(r.amount);if(n<=0)return{error:"Số tiền chi phải lớn hơn 0",status:400};const o={id:String(r.id||t("PC")).trim(),code:String(r.code||await N()).trim(),date:p(r.date),
fundType:"bank"===String(r.fundType||"cash").toLowerCase()?"bank":"cash",amount:n,expenseType:String(r.expenseType||"other").trim(),receiverCode:String(r.receiverCode||"").trim(),
receiverName:String(r.receiverName||"").trim(),receiverRole:String(r.receiverRole||"").trim(),note:String(r.note||"").trim(),status:"pending",fundPosted:!1,
createdBy:String(r.createdBy||"").trim(),createdAt:e.nowIso(),updatedAt:e.nowIso()};return await s.upsert(o),{voucher:o,message:"Đã tạo phiếu chi, chờ xác nhận ghi sổ quỹ"}}
async function ae(t,r={}){const n=await s.findByIdOrCode(t);if(!n)return{error:"Không tìm thấy phiếu chi",status:404};if(Q(n))return X("Phiếu chi");const o=h(r.amount??n.amount)
;if(o<=0)return{error:"Số tiền chi phải lớn hơn 0",status:400};const i={...n,date:p(r.date||n.date),
fundType:"bank"===String(r.fundType||n.fundType||"cash").toLowerCase()?"bank":"cash",amount:o,expenseType:String(r.expenseType??n.expenseType??"other").trim(),
receiverCode:String(r.receiverCode??n.receiverCode??"").trim(),receiverName:String(r.receiverName??n.receiverName??"").trim(),
receiverRole:String(r.receiverRole??n.receiverRole??"").trim(),note:String(r.note??n.note??"").trim(),status:"pending",updatedAt:e.nowIso()};return await s.upsert(i),{voucher:i,
message:"Đã cập nhật phiếu chi"}}async function se(t,r={}){const n=await s.findByIdOrCode(t);if(!n)return{error:"Không tìm thấy phiếu chi",status:404}
;if(["cancelled","canceled","void","deleted"].includes(String(n.status||"").toLowerCase()))return{error:"Phiếu chi đã hủy",status:400}
;if(n.fundPosted||"confirmed"===String(n.status||"").toLowerCase())return{voucher:n,ledger:null,message:"Phiếu chi đã ghi sổ quỹ trước đó"};const i=h(n.amount);if(i<=0)return{
error:"Số tiền chi phải lớn hơn 0",status:400};const a={...n,status:"confirmed",fundPosted:!0,postedAt:e.nowIso(),confirmedAt:e.nowIso(),
confirmedBy:String(r.confirmedBy||r.updatedBy||"").trim(),updatedAt:e.nowIso()};let d=null;return await o(async e=>{d=await U({date:a.date,fundType:a.fundType,direction:"out",
amount:i,sourceType:"EXPENSE_VOUCHER",sourceId:a.id,sourceCode:a.code,referenceType:"EXPENSE_VOUCHER",referenceId:a.id,referenceCode:a.code,receiverCode:a.receiverCode,
receiverName:a.receiverName,receiverRole:a.receiverRole,note:a.note||`Phiếu chi ${a.code}`},{session:e}),await s.upsert(a,{session:e})}),{voucher:a,ledger:d,
message:"Đã xác nhận phiếu chi và ghi fundLedgers"}}async function de(r={}){const n=h(r.amount);if(n<=0)return{error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400}
;const o="bank"===String(r.fromFund||"cash").toLowerCase()?"bank":"cash",i="cash"===String(r.toFund||"bank").toLowerCase()?"cash":"bank";if(o===i)return{
error:"Quỹ nguồn và quỹ đích không được trùng nhau",status:400};const a={id:String(r.id||t("CQ")).trim(),code:String(r.code||await B()).trim(),date:p(r.date),fromFund:o,toFund:i,
amount:n,bankName:String(r.bankName||"").trim(),accountNumber:String(r.accountNumber||"").trim(),note:String(r.note||"").trim(),status:"pending",fundPosted:!1,
createdBy:String(r.createdBy||"").trim(),createdAt:e.nowIso(),updatedAt:e.nowIso()};return await d.upsert(a),{transfer:a,message:"Đã tạo phiếu chuyển quỹ, chờ xác nhận ghi sổ quỹ"}
}async function ue(t,r={}){const n=await d.findByIdOrCode(t);if(!n)return{error:"Không tìm thấy phiếu chuyển quỹ",status:404};if(Q(n))return X("Phiếu chuyển quỹ")
;const o=h(r.amount??n.amount);if(o<=0)return{error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400}
;const i="bank"===String(r.fromFund||n.fromFund||"cash").toLowerCase()?"bank":"cash",a="cash"===String(r.toFund||n.toFund||"bank").toLowerCase()?"cash":"bank";if(i===a)return{
error:"Quỹ nguồn và quỹ đích không được trùng nhau",status:400};const s={...n,date:p(r.date||n.date),fromFund:i,toFund:a,amount:o,
bankName:String(r.bankName??n.bankName??"").trim(),accountNumber:String(r.accountNumber??n.accountNumber??"").trim(),note:String(r.note??n.note??"").trim(),status:"pending",
updatedAt:e.nowIso()};return await d.upsert(s),{transfer:s,message:"Đã cập nhật phiếu chuyển quỹ"}}async function ce(t,r={}){const n=await d.findByIdOrCode(t);if(!n)return{
error:"Không tìm thấy phiếu chuyển quỹ",status:404};if(["cancelled","canceled","void","deleted"].includes(String(n.status||"").toLowerCase()))return{
error:"Phiếu chuyển quỹ đã hủy",status:400};if(n.fundPosted||"confirmed"===String(n.status||"").toLowerCase())return{transfer:n,ledgers:[],
message:"Phiếu chuyển quỹ đã ghi sổ quỹ trước đó"};const i=h(n.amount);if(i<=0)return{error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400};const a={...n,status:"confirmed",
fundPosted:!0,postedAt:e.nowIso(),confirmedAt:e.nowIso(),confirmedBy:String(r.confirmedBy||r.updatedBy||"").trim(),updatedAt:e.nowIso()},s=[];return await o(async e=>{
s.push(await U({date:a.date,fundType:a.fromFund,direction:"out",amount:i,sourceType:"FUND_TRANSFER",sourceId:a.id,sourceCode:a.code,referenceType:"FUND_TRANSFER",referenceId:a.id,
referenceCode:a.code,note:a.note||`Chuyển quỹ ${a.fromFund} sang ${a.toFund}`},{session:e})),s.push(await U({date:a.date,fundType:a.toFund,direction:"in",amount:i,
sourceType:"FUND_TRANSFER",sourceId:a.id,sourceCode:a.code,referenceType:"FUND_TRANSFER",referenceId:a.id,referenceCode:a.code,note:a.note||`Nhận chuyển quỹ từ ${a.fromFund}`},{
session:e})),await d.upsert(a,{session:e})}),{transfer:a,ledgers:s.filter(Boolean),message:"Đã xác nhận chuyển quỹ và ghi fundLedgers"}}module.exports={listFundLedgers:H,
summarizeFundLedgers:M,buildDeliverySubmissionDraft:G,createDeliveryCashSubmission:K,listDeliveryCashSubmissions:Y,listExpenseVouchers:J,listFundTransfers:W,
confirmDeliveryCashSubmission:ee,classifyConfirmedDeliveryShortages:te,getDeliveryCashShortageHistory:re,createDeliveryShortageRepayment:ne,confirmDeliveryShortageRepayment:oe,
updateDeliveryCashSubmission:Z,createExpenseVoucher:ie,updateExpenseVoucher:ae,confirmExpenseVoucher:se,createFundTransfer:de,updateFundTransfer:ue,confirmFundTransfer:ce,
postFundLedger:U,buildFundLedgerIdempotencyKey:v,fundLedgerCategory:T,fundLedgerType:b};
