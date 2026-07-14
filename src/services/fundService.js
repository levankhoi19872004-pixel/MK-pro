/* GENERATED FILE — edit src/services/fundService.source/part-01.jsfrag, src/services/fundService.source/part-01b.jsfrag, src/services/fundService.source/part-02.jsfrag, src/services/fundService.source/part-02b.jsfrag, src/services/fundService.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{makeId:t,normalizeText:n,toNumber:r}=require("../utils/common.util"),{withMongoTransaction:i}=require("../utils/transaction.util"),o=require("../repositories/fundLedgerRepository"),a=require("../repositories/deliveryCashSubmissionRepository"),s=require("../repositories/expenseVoucherRepository"),d=require("../repositories/fundTransferRepository"),u=require("../repositories/deliveryCashShortageRepository"),c=require("../repositories/deliveryShortageRepaymentRepository"),m=require("./auditService"),f=require("./accounting/FundBalanceReadService"),l=require("./delivery/DeliveryPaymentStateReadService"),{normalizeLines:y,linesFromLegacyAmounts:h,applyLineSummary:g,mergeEditableLines:p,validateLineForConfirmation:S,buildLineIdempotencyKey:C,canonicalLineStatus:A,canonicalMethod:I}=require("../domain/fund/deliveryRemittanceLines")
;function b(){return require("./master-order/masterOrderDelivery.service")}const{pickDeliveryStaffCode:v}=require("../domain/staff/staffIdentity");function w(t,n=e.todayVN()){
return e.toDateOnly(t||n,n)}function k(e){return Math.max(0,Math.round(r(e)))}function T(e={}){
return!["void","voided","cancelled","canceled","deleted","removed","reversed","superseded"].includes(String(e.status||"").toLowerCase())}function N(e){
return"bank"===String(e||"cash").toLowerCase()?"bank":"cash"}function B(e){return"out"===String(e||"in").toLowerCase()?"out":"in"}function D(e,t){
return(String(e||"").trim()||String(t||"cash")).toUpperCase()}function E(e){return String(e||"").trim().toUpperCase()}function L(e={}){
const t=N(e.fundType),n=B(e.direction),r=D(e.account,t),i=String(e.sourceType||"MANUAL_FUND").trim()||"MANUAL_FUND",o=String(e.sourceId||e.sourceCode||e.referenceId||e.referenceCode||e.refId||e.refCode||e.id||e.code||"").trim()
;return o?[i,o,t,n,r].map(E).join("|"):""}function R(e="",t=""){return"FUND_TRANSFER"===E(e)?"TRANSFER":"out"===B(t)?"EXPENSE":"RECEIPT"}function _(e="",t=""){const n=R(e,t)
;return"TRANSFER"===n?"fund_transfer":"EXPENSE"===n?"fund_expense":"fund_receipt"}function q(e,t=[]){const n=t.reduce((e,t)=>{const n=String(t.code||"").match(/(\d+)$/)
;return Math.max(e,n?Number(n[1]):0)},0);return`${e}${String(n+1).padStart(5,"0")}`}async function O(){return q("FL",await o.findAll({code:{$regex:"^FL\\d+$"}},{projection:"code",
sort:{code:-1},limit:1}))}async function F(){return q("PC",await s.findAll())}async function P(){return q("CQ",await d.findAll())}function $(e,t){
return`NQGH-${String(w(e)).replace(/-/g,"")}-${String(t||"NO_NVGH").trim().replace(/[^a-zA-Z0-9_-]/g,"").slice(0,24)||"NO_NVGH"}`}function x(e,t){const n="bank"===N(t)?"TK":"TM"
;return`DCSH-${String(e||"").trim()}-${n}`}function V(e={},t){
return`NQBU-${String(w(t)).replace(/-/g,"")}-${String(e.deliveryStaffCode||"NVGH").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,20)||"NVGH"}-${String(Date.now()).slice(-7)+String(Math.floor(100*Math.random())).padStart(2,"0")}`
}const M={cash:{collected_not_remitted:{responsibleType:"delivery_staff",status:"open"},customer_not_paid:{responsibleType:"customer",status:"customer_outstanding"},
approved_expense:{responsibleType:"adjustment",status:"adjusted",requireNote:!0},pending_review:{responsibleType:"pending",status:"disputed",requireNote:!0}},bank:{
pending_bank_reconciliation:{responsibleType:"pending",status:"pending_reconciliation"},delivery_staff_liability:{responsibleType:"delivery_staff",status:"open"},
customer_not_paid:{responsibleType:"customer",status:"customer_outstanding"},approved_adjustment:{responsibleType:"adjustment",status:"adjusted",requireNote:!0}}};function H(e){
return Math.max(0,-Math.round(r(e)))}function K(e={},t){
return(e.shortageResolution&&"object"==typeof e.shortageResolution?e.shortageResolution[t]:null)||e[`${t}ShortageResolution`]||null}function U(e={},t,n){if(n<=0)return null
;const r=K(e,t),i="string"==typeof r?{reasonType:r}:r||{},o=String(i.reasonType||i.reason||"").trim(),a=M[t]?.[o];if(!a)return{
error:"bank"===t?"Cần chọn cách xử lý khoản thiếu chuyển khoản trước khi xác nhận":"Cần chọn cách xử lý khoản thiếu tiền mặt trước khi xác nhận",fundType:t,shortageAmount:n}
;const s=String(i.note||e.shortageNote||"").trim();if(a.requireNote&&!s)return{error:"Cần nhập ghi chú giải trình cho cách xử lý khoản thiếu đã chọn",fundType:t,shortageAmount:n}
;const d="adjustment"===a.responsibleType?n:0;return{fundType:t,reasonType:o,responsibleType:a.responsibleType,status:a.status,originalShortageAmount:n,settledAmount:0,
adjustedAmount:d,outstandingAmount:Math.max(0,n-d),note:s}}function j(e={},t={}){const n={
cash:H(t.differenceCashAmount??e.differenceCashAmount??k(t.submittedCashAmount??e.submittedCashAmount)-k(e.reportCashAmount)),
bank:H(t.differenceBankAmount??e.differenceBankAmount??k(t.submittedBankAmount??e.submittedBankAmount)-k(e.reportBankAmount))},r=[],i=[];for(const e of["cash","bank"]){
if(n[e]<=0)continue;const o=U(t,e,n[e]);o?.error?i.push(o):r.push(o)}return i.length?{error:i.map(e=>e.error).join(". "),status:422,requiresShortageResolution:!0,shortages:i}:{
plans:r,amounts:n}}function G(t={},n={},r=""){const i=e.nowIso();return{id:x(t.code,n.fundType),code:x(t.code,n.fundType),sourceSubmissionId:String(t.id||"").trim(),
sourceSubmissionCode:String(t.code||"").trim(),deliveryDate:String(t.deliveryDate||"").trim(),deliveryStaffCode:String(t.deliveryStaffCode||"").trim(),
deliveryStaffName:String(t.deliveryStaffName||"").trim(),fundType:N(n.fundType),reasonType:String(n.reasonType||"").trim(),responsibleType:String(n.responsibleType||"").trim(),
originalShortageAmount:k(n.originalShortageAmount),settledAmount:k(n.settledAmount),adjustedAmount:k(n.adjustedAmount),pendingRepaymentAmount:0,
outstandingAmount:k(n.outstandingAmount),status:String(n.status||"open").trim(),note:String(n.note||"").trim(),classifiedBy:String(r||"").trim(),classifiedAt:i,
createdBy:String(r||"").trim(),createdAt:i,updatedAt:i}}async function Y(e,t=[],n="",r={}){const i=[];for(const o of t){
const t=await u.findBySourceAndFundType(e.id,e.code,o.fundType,r);if(t){i.push(t);continue}const a=G(e,o,n);await u.upsert(a,r),i.push(a)}return i}function Q(e,t){
return String(e||t||"").trim()}function X(e,t){
return!t||[e.code,e.sourceCode,e.sourceType,e.deliveryStaffCode,e.deliveryStaffName,e.customerCode,e.customerName,e.staffName,e.note,e.status].some(e=>n(e).includes(t))}
function z(t=[]){const n=t.map(e=>w(e.date||e.createdAt)).filter(Boolean).sort(),r=n[0]||e.todayVN(),i=n[n.length-1]||r;return f.calculateFixture(t,{dateFrom:r,dateTo:i,full:!0
}).summary}async function Z(e={}){return f.listFundLedgers(e)}async function J(e,t,n,r,i="",a=""){const s=L({sourceType:e,sourceCode:t,sourceId:i,fundType:n,direction:r,account:a})
;if(s){const e=await o.findByIdempotencyKey(s);if(e)return e}const d={fundType:n,direction:r,$or:[{sourceType:e,sourceCode:t},{referenceType:e,referenceCode:t}]}
;return a&&(d.account=a),i&&d.$or.push({sourceType:e,sourceId:i},{referenceType:e,referenceId:i}),(await o.findAll(d,{limit:1}))[0]||null}async function W(n={},r={}){
const i=k(n.amount);if(i<=0)return null
;const a=N(n.fundType),s=B(n.direction),d=D(n.account,a),u=String(n.sourceType||"MANUAL_FUND").trim(),c=String(n.sourceId||n.refId||n.referenceId||"").trim(),m=String(n.sourceCode||n.refCode||n.referenceCode||"").trim(),f=String(n.idempotencyKey||L({
...n,sourceType:u,sourceId:c,sourceCode:m,fundType:a,direction:s,account:d})).trim();if(!f)throw new Error("Thiếu sourceId/sourceCode để tạo idempotencyKey cho fund ledger")
;const l=await o.findByIdempotencyKey(f,r);if(l)return{ok:!0,skipped:!0,ledger:l,reason:"DUPLICATE_FUND_LEDGER"};const y={id:String(n.id||t("FL")).trim(),
code:String(n.code||await O()).trim(),date:w(n.date),accountingDate:w(n.accountingDate||n.date),remittanceDate:w(n.remittanceDate||""),fundType:a,direction:s,account:d,
category:String(n.category||R(u,s)).trim(),type:String(n.type||_(u,s)).trim(),idempotencyKey:f,amount:i,sourceType:u,sourceId:c,sourceCode:m,
sourceLineId:String(n.sourceLineId||"").trim(),refType:String(n.refType||u).trim(),refId:String(n.refId||c).trim(),refCode:String(n.refCode||m).trim(),
referenceType:String(n.referenceType||n.refType||u).trim(),referenceId:String(n.referenceId||n.refId||c).trim(),referenceCode:String(n.referenceCode||n.refCode||m).trim(),
deliveryDate:String(n.deliveryDate||"").trim(),bankAccountCode:String(n.bankAccountCode||"").trim(),bankReference:String(n.bankReference||"").trim(),
deliveryStaffCode:String(n.deliveryStaffCode||"").trim(),deliveryStaffName:String(n.deliveryStaffName||"").trim(),salesStaffCode:String(n.salesStaffCode||"").trim(),
salesStaffName:String(n.salesStaffName||"").trim(),customerCode:String(n.customerCode||"").trim(),customerName:String(n.customerName||"").trim(),
staffCode:String(n.staffCode||"").trim(),staffName:String(n.staffName||"").trim(),staffRole:String(n.staffRole||"").trim(),collectorType:String(n.collectorType||"").trim(),
collectorCode:String(n.collectorCode||"").trim(),collectorName:String(n.collectorName||"").trim(),receiverCode:String(n.receiverCode||"").trim(),
receiverName:String(n.receiverName||"").trim(),receiverRole:String(n.receiverRole||"").trim(),supplierCode:String(n.supplierCode||"").trim(),
supplierName:String(n.supplierName||"").trim(),payerCode:String(n.payerCode||"").trim(),payerName:String(n.payerName||"").trim(),payerRole:String(n.payerRole||"").trim(),
depositorCode:String(n.depositorCode||"").trim(),depositorName:String(n.depositorName||"").trim(),depositorRole:String(n.depositorRole||"").trim(),
counterpartyCode:String(n.counterpartyCode||"").trim(),counterpartyName:String(n.counterpartyName||"").trim(),counterpartyRole:String(n.counterpartyRole||"").trim(),
isReversal:!0===n.isReversal,reversalOf:String(n.reversalOf||"").trim(),originalSourceId:String(n.originalSourceId||"").trim(),note:String(n.note||"").trim(),
status:String(n.status||"posted").trim(),accountingConfirmed:!1!==n.accountingConfirmed,accountingStatus:String(n.accountingStatus||"confirmed").trim(),
createdBy:String(n.createdBy||"").trim(),createdAt:n.createdAt||e.nowIso(),updatedAt:e.nowIso()};try{return await o.upsert(y,r),y}catch(e){
if(e&&(11e3===e.code||String(e.message||"").includes("duplicate key"))){const e=await o.findByIdempotencyKey(f,r);if(e)return{ok:!0,skipped:!0,ledger:e,
reason:"DUPLICATE_FUND_LEDGER"}}throw e}}function ee(e,t=[]){for(const n of t){const t=r(e[n]);if(t>0)return t}return 0}async function te(r={}){
const i=w(r.deliveryDate||r.date),o=String(v(r)||r.delivery||"").trim();if(!o)return{error:"Thiếu nhân viên giao hàng để tạo phiếu nộp quỹ",status:400}
;const a=b(),s="function"==typeof a.listDeliveryTodayOrdersCompact?a.listDeliveryTodayOrdersCompact:a.listDeliveryToday,d=await s({date:i,delivery:o,deliveryStaffCode:o,page:1,
limit:5e3}),u=n(o),c=(d.orders||d.rows||[]).filter(e=>n(v(e)||e.deliveryStaffCode)===u);if(!c.length)return{error:"Không có đơn giao để tạo phiếu nộp quỹ",status:404}
;const m=await l.resolvePaymentStatesForOrders(c),f=c.map(e=>{const t=l.stateForOrder(e,m.statesByIdentity);return{...e,cashAmount:k(t.cashAmount),bankAmount:k(t.bankAmount),
rewardAmount:k(t.rewardAmount),bonusAmount:k(t.rewardAmount),deliveryPaymentStateSource:t.source&&t.source.paymentState,latestCorrectionVersion:t.latestCorrectionVersion||0,
paymentAllocationCode:t.paymentAllocationCode||"",stalePaymentAllocationIgnored:!0===t.stalePaymentAllocationIgnored}
}),p=f.find(e=>e.deliveryStaffName)?.deliveryStaffName||o,S=f.reduce((e,t)=>e+k(t.cashAmount),0),C=f.reduce((e,t)=>e+k(t.bankAmount),0),A=f.reduce((e,t)=>e+ee(t,["oldDebtCashCollected","debtCashCollected","arCashCollected"]),0),I=f.reduce((e,t)=>e+ee(t,["oldDebtBankCollected","debtBankCollected","arBankCollected"]),0),T=S+A,N=C+I,B=$(i,o),D=String(r.id||t("NQGH")).trim(),E=w(r.remittanceDate||e.todayVN()),L=Array.isArray(r.remittanceLines)?y(r.remittanceLines,{
submissionIdentity:D||B,makeId:t}):h({submittedCashAmount:r.submittedCashAmount??T,submittedBankAmount:r.submittedBankAmount??N,remittanceDate:E,bankAccountCode:r.bankAccountCode,
bankReference:r.bankReference},{submissionIdentity:D||B,makeId:t,defaultRemittanceDate:E,defaultStatus:"draft"}),R={id:D,code:B,deliveryDate:i,deliveryStaffCode:o,
deliveryStaffName:p,reportCashAmount:T,reportBankAmount:N,reportCurrentOrderCashAmount:S,reportCurrentOrderBankAmount:C,reportOldDebtCashAmount:A,reportOldDebtBankAmount:I,
orderCodes:f.map(e=>e.orderCode||e.code||"").filter(Boolean),orderIds:f.map(e=>e.id||"").filter(Boolean),note:String(r.note||"").trim(),createdBy:String(r.createdBy||"").trim(),
createdAt:r.createdAt||e.nowIso(),updatedAt:e.nowIso()},_=g(R,L,{makeId:t});return _.matchStatus=0===_.differenceCashAmount&&0===_.differenceBankAmount?"matched":"mismatch",
_.status=String(r.status||_.status||"pending").trim(),_.fundPosted=!1,_.hasPostedLines=!1,{draft:_,orders:f,deliverySummary:d.summary||d.kpi||{}}}async function ne(e={}){
const t=await te(e);if(t.error)return t;const n=t.draft,r=await a.findByIdOrCode(n.code)
;return r&&!["cancelled","canceled","void","deleted"].includes(String(r.status||"").toLowerCase())?{error:`Đã có phiếu nộp quỹ ${r.code} cho ngày/NVGH này`,status:409,submission:r
}:(await a.upsert(n),{submission:n,orders:t.orders})}async function re(e={}){const r={};(e.deliveryDate||e.date)&&(r.deliveryDate=w(e.deliveryDate||e.date)),
(v(e)||e.delivery)&&(r.deliveryStaffCode=String(v(e)||e.delivery).trim());let i=await a.findAll(r,{sort:{deliveryDate:-1,createdAt:-1,code:-1},limit:e.limit||500})
;const s=n(e.q||e.search||"");if(s&&(i=i.filter(e=>X(e,s))),!i.length)return{submissions:[]}
;const d=i.map(e=>String(e.id||"").trim()).filter(Boolean),c=i.map(e=>String(e.code||"").trim()).filter(Boolean),m=[];d.length&&m.push({sourceSubmissionId:{$in:d}}),
c.length&&m.push({sourceSubmissionCode:{$in:c}});const f=m.length?await u.findAll({$or:m},{limit:Math.min(1e3,3*i.length)}):[],l=new Map;for(const e of f){
const t=[Q(e.sourceSubmissionId,""),Q("",e.sourceSubmissionCode)].filter(Boolean);for(const n of t)l.has(n)||l.set(n,{}),l.get(n)[N(e.fundType)]=e}const p=[];d.length&&p.push({
sourceId:{$in:d}},{referenceId:{$in:d}}),c.length&&p.push({sourceCode:{$in:c}},{referenceCode:{$in:c}});const S=p.length?await o.findAll({sourceType:"DELIVERY_CASH_SUBMISSION",
$or:p},{limit:Math.min(2e3,8*i.length)}):[],C=new Map
;for(const e of S)for(const t of[e.sourceId,e.sourceCode,e.referenceId,e.referenceCode].map(e=>String(e||"").trim()).filter(Boolean))C.has(t)||C.set(t,[]),C.get(t).push(e)
;return i=i.map(e=>{const n=l.get(Q(e.id,""))||l.get(Q("",e.code))||{},r=y(e.remittanceLines,{submissionIdentity:e.id||e.code,makeId:t
}),i=C.get(String(e.id||"").trim())||C.get(String(e.code||"").trim())||[];let o=r,a=!1;return!o.length&&i.length?(a=!0,o=y(i.map((e,t)=>({
lineId:e.sourceLineId||`LEGACY-${e.id||e.code||t+1}`,method:e.fundType,amount:e.amount,remittanceDate:e.remittanceDate||e.accountingDate||e.date,status:"confirmed",
confirmedAt:e.createdAt,confirmedBy:e.createdBy,fundLedgerId:e.id||e.code,idempotencyKey:e.idempotencyKey,bankAccountCode:e.bankAccountCode||e.account,
bankReference:e.bankReference,legacyDerived:!0})),{submissionIdentity:e.id||e.code,makeId:t})):o.length||e.fundPosted||(a=!0,o=h(e,{submissionIdentity:e.id||e.code,makeId:t,
defaultRemittanceDate:"",defaultStatus:"draft"})),{...g(e,o,{makeId:t,forceStatus:e.status,forceFundPosted:e.fundPosted}),legacyDerived:a,cashShortage:n.cash||null,
bankShortage:n.bank||null}}),{submissions:i}}function ie(e={}){return["confirmed","matched","posted"].includes(String(e.status||"").toLowerCase())||!0===e.fundPosted}
function oe(e){return{error:`${e} đã xác nhận, không được sửa nghiệp vụ`,status:409}}function ae(e={},t={}){const n=String(e.id||"").trim(),r=String(t.id||"").trim()
;if(n&&r)return n===r;const i=String(e.code||"").trim(),o=String(t.code||"").trim();return Boolean(i&&o&&i===o)}function se(e){
const t=w(process.env.FUND_ACCOUNTING_LOCKED_THROUGH_DATE||process.env.ACCOUNTING_LOCKED_THROUGH_DATE||"","");return Boolean(t&&e&&e<=t)}function de(e){return e?e.ledger||e:null}
function ue(e={},n={},{requireExplicitDate:r=!1}={}){if(Array.isArray(e.remittanceLines))return y(e.remittanceLines,{submissionIdentity:n.id||n.code,makeId:t})
;if(Array.isArray(n.remittanceLines)&&n.remittanceLines.length)return y(n.remittanceLines,{submissionIdentity:n.id||n.code,makeId:t});const i=w(e.remittanceDate||"",""),o={...n,
submittedCashAmount:e.submittedCashAmount??n.submittedCashAmount,submittedBankAmount:e.submittedBankAmount??n.submittedBankAmount,remittanceDate:r?i:i||""};return h(o,{
submissionIdentity:n.id||n.code,makeId:t,defaultRemittanceDate:i,defaultStatus:"draft"})}function ce(n={},r=[]){const i=[];for(const o of r){
if(["confirmed","cancelled","reversed"].includes(A(o.status))){i.push(o);continue}const r=S(o,{deliveryDate:n.deliveryDate,today:e.todayVN(),isAccountingDateLocked:se,
submissionIdentity:n.id||n.code,makeId:t});if(r.error)return r;i.push(r.line)}return{lines:i}}async function me(e={},t={},n="",r={}){
const i=I(t.method||t.fundType),o=t.idempotencyKey||C(e,t);if(!o)throw Object.assign(new Error("Không dựng được idempotency key cho dòng nộp quỹ"),{status:422});const a=await W({
date:t.remittanceDate,accountingDate:t.remittanceDate,remittanceDate:t.remittanceDate,deliveryDate:e.deliveryDate,fundType:i,direction:"in",amount:t.amount,
sourceType:"DELIVERY_CASH_SUBMISSION",sourceId:e.id,sourceCode:e.code,sourceLineId:t.lineId,referenceType:"DELIVERY_CASH_SUBMISSION",referenceId:e.id,referenceCode:e.code,
idempotencyKey:o,bankAccountCode:t.bankAccountCode,bankReference:t.bankReference,account:t.bankAccountCode||i,deliveryStaffCode:e.deliveryStaffCode,
deliveryStaffName:e.deliveryStaffName,createdBy:n,
note:"bank"===i?`NVGH ${e.deliveryStaffName||e.deliveryStaffCode} nộp chuyển khoản ngày ${t.remittanceDate} cho chuyến giao ${e.deliveryDate}`:`NVGH ${e.deliveryStaffName||e.deliveryStaffCode} nộp tiền mặt ngày ${t.remittanceDate} cho chuyến giao ${e.deliveryDate}`
},r);return{ledger:de(a),idempotencyKey:o,skipped:Boolean(a&&a.skipped)}}async function fe(n,r={}){const i=await a.findByIdOrCode(n);if(!i)return{
error:"Không tìm thấy phiếu nộp quỹ",status:404};if("confirmed"===String(i.status||"").toLowerCase()||!0===i.fundPosted)return oe("Phiếu nộp quỹ")
;const o=r.deliveryDate??r.date??i.deliveryDate,s=String(v(r)||r.delivery||i.deliveryStaffCode||"").trim(),d=y(i.remittanceLines,{submissionIdentity:i.id||i.code,makeId:t
}).some(e=>"confirmed"===A(e.status)||e.fundLedgerId);if(d&&(w(o)!==w(i.deliveryDate)||String(s)!==String(i.deliveryStaffCode||"")))return{
error:"Phiếu đã có dòng ghi quỹ; không được đổi ngày giao hoặc NVGH",status:409,code:"POSTED_REMITTANCE_IDENTITY_IMMUTABLE"};const u=d?{draft:{...i},orders:[]}:await te({...i,...r,
id:i.id,deliveryDate:o,deliveryStaffCode:s,remittanceLines:Array.isArray(r.remittanceLines)?r.remittanceLines:i.remittanceLines,status:i.status||"pending",
note:String(r.note??i.note??"").trim(),createdBy:i.createdBy||r.createdBy||""});if(u.error)return u;const c=u.draft;if(String(c.code||"")!==String(i.code||"")){
const e=await a.findByIdOrCode(c.code);if(e&&!ae(i,e))return{error:`Đã có phiếu nộp quỹ ${c.code} cho ngày/NVGH này`,status:409,submission:e}}let m
;m=Array.isArray(r.remittanceLines)?y(r.remittanceLines,{submissionIdentity:i.id||i.code,makeId:t
}):void 0!==r.submittedCashAmount||void 0!==r.submittedBankAmount||void 0!==r.remittanceDate?h({submittedCashAmount:r.submittedCashAmount??i.submittedCashAmount,
submittedBankAmount:r.submittedBankAmount??i.submittedBankAmount,remittanceDate:r.remittanceDate||"",bankAccountCode:r.bankAccountCode,bankReference:r.bankReference},{
submissionIdentity:i.id||i.code,makeId:t,defaultRemittanceDate:w(r.remittanceDate||"",""),defaultStatus:"draft"}):y(i.remittanceLines,{submissionIdentity:i.id||i.code,makeId:t})
;const f=p(i.remittanceLines,m,{submissionIdentity:i.id||i.code,makeId:t});if(f.error)return f;const l={...i,...c,id:i.id||c.id,createdBy:i.createdBy||c.createdBy||"",
createdAt:i.createdAt||c.createdAt,note:String(r.note??i.note??"").trim(),updatedAt:e.nowIso()},S=g(l,f.lines,{makeId:t})
;S.matchStatus=0===S.differenceCashAmount&&0===S.differenceBankAmount?"matched":"mismatch",S.postedAt=i.postedAt||"",S.confirmedAt=i.confirmedAt||"",S.confirmedBy=i.confirmedBy||""
;const C=await a.patchByIdOrCode(n,S);return C?{submission:C,orders:u.orders,message:"Đã cập nhật phiếu nộp quỹ và các dòng ngày nộp thực tế"}:{
error:"Phiếu nộp quỹ đã thay đổi hoặc không còn tồn tại",status:409}}async function le(e={}){const t={};if(e.dateFrom||e.dateTo){
const n=e.dateFrom?w(e.dateFrom):"",r=e.dateTo?w(e.dateTo):"";t.date={...n?{$gte:n}:{},...r?{$lte:r}:{}}}e.fundType&&"all"!==e.fundType&&(t.fundType=String(e.fundType))
;let r=await s.findAll(t,{sort:{date:-1,createdAt:-1,code:-1},limit:e.limit||500});const i=n(e.q||e.search||"")
;return i&&(r=r.filter(e=>[e.code,e.expenseType,e.receiverCode,e.receiverName,e.receiverRole,e.note,e.status].some(e=>n(e).includes(i)))),{vouchers:r}}async function ye(e={}){
const t={};if(e.dateFrom||e.dateTo){const n=e.dateFrom?w(e.dateFrom):"",r=e.dateTo?w(e.dateTo):"";t.date={...n?{$gte:n}:{},...r?{$lte:r}:{}}}let r=await d.findAll(t,{sort:{date:-1,
createdAt:-1,code:-1},limit:e.limit||500});const i=n(e.q||e.search||"")
;return i&&(r=r.filter(e=>[e.code,e.fromFund,e.toFund,e.bankName,e.note,e.status].some(e=>n(e).includes(i)))),{transfers:r}}async function he(n,r={}){
const o=await a.findByIdOrCode(n);if(!o)return{error:"Không tìm thấy phiếu nộp quỹ",status:404}
;if(["cancelled","canceled","void","deleted"].includes(String(o.status||"").toLowerCase()))return{error:"Phiếu nộp quỹ đã hủy",status:400}
;if(o.fundPosted||"confirmed"===String(o.status||"").toLowerCase())return{submission:o,ledgers:[],message:"Phiếu đã ghi sổ quỹ trước đó"};const s=ue(r,o,{requireExplicitDate:!0
}),d=Array.isArray(r.remittanceLines)?p(o.remittanceLines,s,{submissionIdentity:o.id||o.code,makeId:t}):{lines:s};if(d.error)return d;if(!d.lines.length)return{
error:"Phiếu chưa có dòng nộp tiền để xác nhận",status:422,code:"REMITTANCE_LINES_REQUIRED"};const u=ce(o,d.lines);if(u.error)return u;const c=g(o,u.lines,{makeId:t
}),f=c.submittedCashAmount-k(o.reportCashAmount),l=c.submittedBankAmount-k(o.reportBankAmount),h=String(r.confirmedBy||r.updatedBy||r.actorCode||"").trim(),C=j({...o,
submittedCashAmount:c.submittedCashAmount,submittedBankAmount:c.submittedBankAmount,differenceCashAmount:f,differenceBankAmount:l},{...r,submittedCashAmount:c.submittedCashAmount,
submittedBankAmount:c.submittedBankAmount,differenceCashAmount:f,differenceBankAmount:l});if(C.error)return C;let I=null;const b=[];let v=[];return await i(async i=>{
const o=await a.findByIdOrCode(n,{session:i});if(!o)throw Object.assign(new Error("Phiếu nộp quỹ không còn tồn tại"),{status:404});const s=y(o.remittanceLines,{
submissionIdentity:o.id||o.code,makeId:t}),d=p(s,u.lines,{submissionIdentity:o.id||o.code,makeId:t});if(d.error)throw Object.assign(new Error(d.error),d);const c=[]
;for(const n of d.lines){if(["cancelled","reversed"].includes(A(n.status))){c.push(n);continue}if("confirmed"===A(n.status)&&n.fundLedgerId){c.push(n);continue}const r=S(n,{
deliveryDate:o.deliveryDate,today:e.todayVN(),isAccountingDateLocked:se,submissionIdentity:o.id||o.code,makeId:t});if(r.error)throw Object.assign(new Error(r.error),r)
;const a=await me(o,r.line,h,{session:i}),s=a.ledger;s&&b.push(s),c.push({...r.line,status:"confirmed",confirmedAt:r.line.confirmedAt||e.nowIso(),confirmedBy:r.line.confirmedBy||h,
fundLedgerId:String(s?.id||s?.code||r.line.fundLedgerId||"").trim(),idempotencyKey:a.idempotencyKey,manualReviewRequired:!1})}const m={...o,note:String(r.note??o.note??"").trim(),
postedAt:o.postedAt||e.nowIso(),confirmedAt:o.confirmedAt||e.nowIso(),confirmedBy:o.confirmedBy||h,shortageClassifiedAt:C.plans.length?e.nowIso():"",
shortageClassifiedBy:C.plans.length?h:"",updatedAt:e.nowIso()};I=g(m,c,{makeId:t,forceStatus:"confirmed",forceFundPosted:!0}),I.matchStatus=0===f&&0===l?"matched":"mismatch",
await a.upsert(I,{session:i}),v=await Y(I,C.plans,h,{session:i})}),await m.log("DELIVERY_CASH_SUBMISSION_CONFIRMED",{refType:"DELIVERY_CASH_SUBMISSION",refId:I.id,refCode:I.code,
user:h,summary:{remittanceLineCount:I.remittanceLines.length,submittedCashAmount:I.submittedCashAmount,submittedBankAmount:I.submittedBankAmount,
totalActualCashAmount:I.totalActualCashAmount,totalActualBankAmount:I.totalActualBankAmount,differenceCashAmount:I.differenceCashAmount,differenceBankAmount:I.differenceBankAmount,
shortageCodes:v.map(e=>e.code)},note:`Xác nhận phiếu nộp quỹ ${I.code} theo ngày thực nhận từng dòng`}),{submission:I,ledgers:b.filter(Boolean),shortages:v,
message:"Đã xác nhận các dòng nộp quỹ theo đúng ngày thực nhận"}}async function ge(n,r,o={}){const s=String(o.confirmedBy||o.updatedBy||o.actorCode||"").trim()
;let d=null,u=null,c=!1;return await i(async i=>{const m=await a.findByIdOrCode(n,{session:i});if(!m)throw Object.assign(new Error("Không tìm thấy phiếu nộp quỹ"),{status:404})
;if(["cancelled","canceled","void","deleted"].includes(String(m.status||"").toLowerCase()))throw Object.assign(new Error("Phiếu nộp quỹ đã hủy"),{status:400})
;const f=y(m.remittanceLines,{submissionIdentity:m.id||m.code,makeId:t}),l=f.findIndex(e=>String(e.lineId)===String(r))
;if(l<0)throw Object.assign(new Error("Không tìm thấy dòng nộp tiền"),{status:404});const h=f[l];if("confirmed"===A(h.status)&&h.fundLedgerId)return d=m,void(c=!0)
;if(["cancelled","reversed"].includes(A(h.status)))throw Object.assign(new Error("Dòng nộp tiền đã hủy hoặc đã đảo, không được xác nhận"),{status:409});const p=S({...h,...o,
lineId:h.lineId},{deliveryDate:m.deliveryDate,today:e.todayVN(),isAccountingDateLocked:se,submissionIdentity:m.id||m.code,makeId:t})
;if(p.error)throw Object.assign(new Error(p.error),p);const C=await me(m,p.line,s,{session:i});u=C.ledger,c=C.skipped,f[l]={...p.line,status:"confirmed",
confirmedAt:h.confirmedAt||e.nowIso(),confirmedBy:h.confirmedBy||s,fundLedgerId:String(u?.id||u?.code||h.fundLedgerId||"").trim(),idempotencyKey:C.idempotencyKey,
manualReviewRequired:!1};const I={...m,updatedAt:e.nowIso()};d=g(I,f,{makeId:t}),d.matchStatus=0===d.differenceCashAmount&&0===d.differenceBankAmount?"matched":"mismatch",
"confirmed"===d.status&&(d.postedAt=d.postedAt||e.nowIso(),d.confirmedAt=d.confirmedAt||e.nowIso(),d.confirmedBy=d.confirmedBy||s),await a.upsert(d,{session:i})}),
await m.log("DELIVERY_REMITTANCE_LINE_CONFIRMED",{refType:"DELIVERY_CASH_SUBMISSION",refId:d?.id,refCode:d?.code,user:s,summary:{lineId:r,fundLedgerId:u?.id||u?.code||"",
idempotent:c},note:`Xác nhận dòng nộp quỹ ${r}`}),{submission:d,line:d?.remittanceLines?.find(e=>String(e.lineId)===String(r))||null,ledger:u,idempotent:c,
message:c?"Dòng nộp tiền đã được ghi quỹ trước đó":"Đã xác nhận dòng nộp tiền theo ngày thực nhận"}}async function pe(t,n={}){const r=await a.findByIdOrCode(t);if(!r)return{
error:"Không tìm thấy phiếu nộp quỹ",status:404};if(!r.fundPosted&&"confirmed"!==String(r.status||"").toLowerCase())return{error:"Chỉ phân loại bổ sung cho phiếu đã xác nhận",
status:409};const o=j(r,n);if(o.error)return o;if(!o.plans.length)return{error:"Phiếu không có khoản thiếu cần phân loại",status:400}
;const s=String(n.classifiedBy||n.updatedBy||n.actorCode||"").trim();let d=[];const u={...r,shortageClassifiedAt:e.nowIso(),shortageClassifiedBy:s,updatedAt:e.nowIso()}
;return await i(async e=>{d=await Y(u,o.plans,s,{session:e}),await a.patchByIdOrCode(t,{shortageClassifiedAt:u.shortageClassifiedAt,shortageClassifiedBy:u.shortageClassifiedBy,
updatedAt:u.updatedAt},{session:e})}),await m.log("DELIVERY_CASH_SHORTAGE_CLASSIFIED",{refType:"DELIVERY_CASH_SUBMISSION",refId:r.id,refCode:r.code,user:s,summary:{
shortageCodes:d.map(e=>e.code)},note:`Phân loại khoản thiếu cho phiếu ${r.code}`}),{submission:u,shortages:d,message:"Đã lưu phân loại khoản thiếu của phiếu đã xác nhận"}}
async function Se(e){const t=await u.findByIdOrCode(e);if(!t)return{error:"Không tìm thấy khoản thiếu quỹ",status:404};const n=await c.findAll({$or:[{shortageId:t.id},{
shortageCode:t.code}]},{sort:{createdAt:-1,code:-1},limit:500}),r=n.filter(e=>"pending"===String(e.status||"").toLowerCase()).reduce((e,t)=>e+k(t.amount),0);return{shortage:t,
repayments:n,summary:{originalShortageAmount:k(t.originalShortageAmount),settledAmount:k(t.settledAmount),adjustedAmount:k(t.adjustedAmount),
outstandingAmount:k(t.outstandingAmount),pendingAmount:r,availableToRepay:Math.max(0,k(t.outstandingAmount)-r)}}}async function Ce(n,r={}){const o=k(r.amount);if(o<=0)return{
error:"Số tiền nộp bù phải lớn hơn 0",status:400};const a=String(r.createdBy||r.actorCode||"").trim();let s=null,d=null;return await i(async i=>{if(d=await u.findByIdOrCode(n,{
session:i}),!d)throw Object.assign(new Error("Không tìm thấy khoản thiếu quỹ"),{status:404})
;if("delivery_staff"!==String(d.responsibleType||""))throw Object.assign(new Error("Khoản thiếu này không được ghi nhận là công nợ của NVGH"),{status:409})
;if(!["open","partial"].includes(String(d.status||"").toLowerCase())||k(d.outstandingAmount)<=0)throw Object.assign(new Error("Khoản thiếu đã tất toán hoặc không còn được phép nộp bù"),{
status:409});const m=await u.reservePendingRepayment(d.id||d.code,o,e.nowIso(),{session:i});if(!m){const e=(await c.findAll({$or:[{shortageId:d.id},{shortageCode:d.code}],
status:"pending"},{session:i,limit:500})).reduce((e,t)=>e+k(t.amount),0),t=Math.max(0,k(d.outstandingAmount)-e)
;throw Object.assign(new Error(`Số tiền nộp bù vượt số còn có thể lập phiếu (${t})`),{status:409})}d=m;const f=e.nowIso();s={id:t("DSR"),code:V(d,r.repaymentDate||r.date),
shortageId:d.id,shortageCode:d.code,sourceSubmissionId:d.sourceSubmissionId,sourceSubmissionCode:d.sourceSubmissionCode,deliveryDate:d.deliveryDate,
deliveryStaffCode:d.deliveryStaffCode,deliveryStaffName:d.deliveryStaffName,repaymentDate:w(r.repaymentDate||r.date),fundType:N(r.fundType||r.paymentMethod),amount:o,
status:"pending",fundPosted:!1,note:String(r.note||"").trim(),createdBy:a,createdAt:f,updatedAt:f},await c.upsert(s,{session:i})}),
await m.log("DELIVERY_SHORTAGE_REPAYMENT_CREATED",{refType:"DELIVERY_CASH_SHORTAGE",refId:d.id,refCode:d.code,user:a,summary:s,note:`Tạo phiếu nộp bù ${s.code}`}),{shortage:d,
repayment:s,message:"Đã tạo phiếu nộp bù, chờ kế toán xác nhận ghi quỹ"}}async function Ae(t,n={}){let r=await c.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu nộp bù",
status:404};if(r.fundPosted||"confirmed"===String(r.status||"").toLowerCase()){const e=await u.findByIdOrCode(r.shortageId||r.shortageCode);return{repayment:r,shortage:e,
ledger:null,message:"Phiếu nộp bù đã ghi quỹ trước đó"}}if("pending"!==String(r.status||"").toLowerCase())return{error:"Phiếu nộp bù không ở trạng thái chờ xác nhận",status:409}
;const o=k(r.amount);if(o<=0)return{error:"Số tiền nộp bù không hợp lệ",status:400};const a=String(n.confirmedBy||n.updatedBy||n.actorCode||"").trim();let s=null,d=null
;return await i(async n=>{const i=await c.findByIdOrCode(t,{session:n})
;if(!i||i.fundPosted||"pending"!==String(i.status||""))throw Object.assign(new Error("Phiếu nộp bù đã được xử lý bởi phiên khác"),{status:409})
;if(s=await u.applyConfirmedRepayment(i.shortageId||i.shortageCode,o,e.nowIso(),{session:n}),
!s)throw Object.assign(new Error("Số tiền nộp bù vượt khoản còn thiếu hoặc khoản thiếu đã khóa"),{status:409});const m=e.nowIso();if(r=await c.markConfirmedIfPending(t,{
status:"confirmed",fundPosted:!0,postedAt:m,confirmedAt:m,confirmedBy:a,updatedAt:m},{session:n}),!r)throw Object.assign(new Error("Phiếu nộp bù đã được xác nhận trước đó"),{
status:409});d=await W({date:r.repaymentDate,fundType:r.fundType,direction:"in",amount:o,sourceType:"DELIVERY_SHORTAGE_REPAYMENT",sourceId:r.id,sourceCode:r.code,
deliveryDate:r.deliveryDate,deliveryStaffCode:r.deliveryStaffCode,deliveryStaffName:r.deliveryStaffName,createdBy:a,
note:r.note||`NVGH ${r.deliveryStaffName||r.deliveryStaffCode} nộp bù thiếu quỹ ${r.shortageCode}`},{session:n})}),await m.log("DELIVERY_SHORTAGE_REPAYMENT_CONFIRMED",{
refType:"DELIVERY_CASH_SHORTAGE",refId:s.id,refCode:s.code,user:a,summary:{repaymentCode:r.code,amount:o,outstandingAmount:s.outstandingAmount},
note:`Xác nhận phiếu nộp bù ${r.code}`}),{repayment:r,shortage:s,ledger:d,message:"Đã xác nhận nộp bù, tăng quỹ và giảm công nợ thiếu quỹ NVGH"}}async function Ie(n={}){
const r=k(n.amount);if(r<=0)return{error:"Số tiền chi phải lớn hơn 0",status:400};const i={id:String(n.id||t("PC")).trim(),code:String(n.code||await F()).trim(),date:w(n.date),
fundType:"bank"===String(n.fundType||"cash").toLowerCase()?"bank":"cash",amount:r,expenseType:String(n.expenseType||"other").trim(),receiverCode:String(n.receiverCode||"").trim(),
receiverName:String(n.receiverName||"").trim(),receiverRole:String(n.receiverRole||"").trim(),note:String(n.note||"").trim(),status:"pending",fundPosted:!1,
createdBy:String(n.createdBy||"").trim(),createdAt:e.nowIso(),updatedAt:e.nowIso()};return await s.upsert(i),{voucher:i,message:"Đã tạo phiếu chi, chờ xác nhận ghi sổ quỹ"}}
async function be(t,n={}){const r=await s.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu chi",status:404};if(ie(r))return oe("Phiếu chi");const i=k(n.amount??r.amount)
;if(i<=0)return{error:"Số tiền chi phải lớn hơn 0",status:400};const o={...r,date:w(n.date||r.date),
fundType:"bank"===String(n.fundType||r.fundType||"cash").toLowerCase()?"bank":"cash",amount:i,expenseType:String(n.expenseType??r.expenseType??"other").trim(),
receiverCode:String(n.receiverCode??r.receiverCode??"").trim(),receiverName:String(n.receiverName??r.receiverName??"").trim(),
receiverRole:String(n.receiverRole??r.receiverRole??"").trim(),note:String(n.note??r.note??"").trim(),status:"pending",updatedAt:e.nowIso()};return await s.upsert(o),{voucher:o,
message:"Đã cập nhật phiếu chi"}}async function ve(t,n={}){const r=await s.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu chi",status:404}
;if(["cancelled","canceled","void","deleted"].includes(String(r.status||"").toLowerCase()))return{error:"Phiếu chi đã hủy",status:400}
;if(r.fundPosted||"confirmed"===String(r.status||"").toLowerCase())return{voucher:r,ledger:null,message:"Phiếu chi đã ghi sổ quỹ trước đó"};const o=k(r.amount);if(o<=0)return{
error:"Số tiền chi phải lớn hơn 0",status:400};const a={...r,status:"confirmed",fundPosted:!0,postedAt:e.nowIso(),confirmedAt:e.nowIso(),
confirmedBy:String(n.confirmedBy||n.updatedBy||"").trim(),updatedAt:e.nowIso()};let d=null;return await i(async e=>{d=await W({date:a.date,fundType:a.fundType,direction:"out",
amount:o,sourceType:"EXPENSE_VOUCHER",sourceId:a.id,sourceCode:a.code,referenceType:"EXPENSE_VOUCHER",referenceId:a.id,referenceCode:a.code,receiverCode:a.receiverCode,
receiverName:a.receiverName,receiverRole:a.receiverRole,note:a.note||`Phiếu chi ${a.code}`},{session:e}),await s.upsert(a,{session:e})}),{voucher:a,ledger:d,
message:"Đã xác nhận phiếu chi và ghi fundLedgers"}}async function we(n={}){const r=k(n.amount);if(r<=0)return{error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400}
;const i="bank"===String(n.fromFund||"cash").toLowerCase()?"bank":"cash",o="cash"===String(n.toFund||"bank").toLowerCase()?"cash":"bank";if(i===o)return{
error:"Quỹ nguồn và quỹ đích không được trùng nhau",status:400};const a={id:String(n.id||t("CQ")).trim(),code:String(n.code||await P()).trim(),date:w(n.date),fromFund:i,toFund:o,
amount:r,bankName:String(n.bankName||"").trim(),accountNumber:String(n.accountNumber||"").trim(),note:String(n.note||"").trim(),status:"pending",fundPosted:!1,
createdBy:String(n.createdBy||"").trim(),createdAt:e.nowIso(),updatedAt:e.nowIso()};return await d.upsert(a),{transfer:a,message:"Đã tạo phiếu chuyển quỹ, chờ xác nhận ghi sổ quỹ"}
}async function ke(t,n={}){const r=await d.findByIdOrCode(t);if(!r)return{error:"Không tìm thấy phiếu chuyển quỹ",status:404};if(ie(r))return oe("Phiếu chuyển quỹ")
;const i=k(n.amount??r.amount);if(i<=0)return{error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400}
;const o="bank"===String(n.fromFund||r.fromFund||"cash").toLowerCase()?"bank":"cash",a="cash"===String(n.toFund||r.toFund||"bank").toLowerCase()?"cash":"bank";if(o===a)return{
error:"Quỹ nguồn và quỹ đích không được trùng nhau",status:400};const s={...r,date:w(n.date||r.date),fromFund:o,toFund:a,amount:i,
bankName:String(n.bankName??r.bankName??"").trim(),accountNumber:String(n.accountNumber??r.accountNumber??"").trim(),note:String(n.note??r.note??"").trim(),status:"pending",
updatedAt:e.nowIso()};return await d.upsert(s),{transfer:s,message:"Đã cập nhật phiếu chuyển quỹ"}}async function Te(t,n={}){const r=await d.findByIdOrCode(t);if(!r)return{
error:"Không tìm thấy phiếu chuyển quỹ",status:404};if(["cancelled","canceled","void","deleted"].includes(String(r.status||"").toLowerCase()))return{
error:"Phiếu chuyển quỹ đã hủy",status:400};if(r.fundPosted||"confirmed"===String(r.status||"").toLowerCase())return{transfer:r,ledgers:[],
message:"Phiếu chuyển quỹ đã ghi sổ quỹ trước đó"};const o=k(r.amount);if(o<=0)return{error:"Số tiền chuyển quỹ phải lớn hơn 0",status:400};const a={...r,status:"confirmed",
fundPosted:!0,postedAt:e.nowIso(),confirmedAt:e.nowIso(),confirmedBy:String(n.confirmedBy||n.updatedBy||"").trim(),updatedAt:e.nowIso()},s=[];return await i(async e=>{
s.push(await W({date:a.date,fundType:a.fromFund,direction:"out",amount:o,sourceType:"FUND_TRANSFER",sourceId:a.id,sourceCode:a.code,referenceType:"FUND_TRANSFER",referenceId:a.id,
referenceCode:a.code,note:a.note||`Chuyển quỹ ${a.fromFund} sang ${a.toFund}`},{session:e})),s.push(await W({date:a.date,fundType:a.toFund,direction:"in",amount:o,
sourceType:"FUND_TRANSFER",sourceId:a.id,sourceCode:a.code,referenceType:"FUND_TRANSFER",referenceId:a.id,referenceCode:a.code,note:a.note||`Nhận chuyển quỹ từ ${a.fromFund}`},{
session:e})),await d.upsert(a,{session:e})}),{transfer:a,ledgers:s.filter(Boolean),message:"Đã xác nhận chuyển quỹ và ghi fundLedgers"}}module.exports={listFundLedgers:Z,
summarizeFundLedgers:z,buildDeliverySubmissionDraft:te,createDeliveryCashSubmission:ne,listDeliveryCashSubmissions:re,listExpenseVouchers:le,listFundTransfers:ye,
confirmDeliveryCashSubmission:he,confirmDeliveryRemittanceLine:ge,classifyConfirmedDeliveryShortages:pe,getDeliveryCashShortageHistory:Se,createDeliveryShortageRepayment:Ce,
confirmDeliveryShortageRepayment:Ae,updateDeliveryCashSubmission:fe,createExpenseVoucher:Ie,updateExpenseVoucher:be,confirmExpenseVoucher:ve,createFundTransfer:we,
updateFundTransfer:ke,confirmFundTransfer:Te,postFundLedger:W,buildFundLedgerIdempotencyKey:L,fundLedgerCategory:R,fundLedgerType:_};
