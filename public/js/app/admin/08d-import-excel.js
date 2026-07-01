/* GENERATED FILE — edit public/js/app/admin/08d-import-excel.source/part-01.jsfrag, public/js/app/admin/08d-import-excel.source/part-02.jsfrag, public/js/app/admin/08d-import-excel.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict";const SELECTIVE_UPDATE_IMPORT_TYPES=new Set(["products","customers","users"]);const IMPORT_SESSION_ROWS_PAGE_SIZE=500;const IMPORT_SESSION_ROWS_MAX=2e4
;function getSelectedImportMode(){const type=importDataType?importDataType.value:"";if(!SELECTIVE_UPDATE_IMPORT_TYPES.has(type))return"create"
;return importDataMode&&importDataMode.value==="update"?"update":"create"}function syncImportModeAvailability(){
const supported=SELECTIVE_UPDATE_IMPORT_TYPES.has(importDataType?importDataType.value:"");if(importModeLabel)importModeLabel.hidden=!supported
;if(importModeHelp)importModeHelp.hidden=!supported;if(importDataMode){importDataMode.disabled=!supported;if(!supported)importDataMode.value="create"}}
function resetImportPreviewForModeChange(){importPreviewRows=[];importPreviewSessionId="";importSelectedRowKeySet=new Set;window.__importPreviewRows=importPreviewRows
;window.__importPreviewSessionId=importPreviewSessionId;if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="5">Chọn file rồi bấm xem trước.</td></tr>'
;if(commitImportButton){commitImportButton.disabled=!(importExcelFile&&importExcelFile.files&&importExcelFile.files.length)
;commitImportButton.textContent="Xem trước dữ liệu import"}resetImportPreviewMessage()}function formatSelectiveUpdateChanges(row){
const changes=Array.isArray(row&&row.changes)?row.changes:[];if(!changes.length)return""
;return changes.map(change=>`${change.label||change.field}: ${change.oldValue??""} → ${change.newValue??""}`).join(" | ")}function resetImportPreviewMessage(){
if(importDataMessage)showMessage(importDataMessage,"")}function getImportRowSelectKey(row,index){
const code=String(row?.documentCode||row?.orderCode||row?.code||row?.username||"").trim();return code||`ROW_${index}`}function importRowWarningList(row){
return Array.isArray(row&&row.warnings)?row.warnings.filter(Boolean).map(String):[]}function importRowErrorList(row){
return Array.isArray(row&&row.errors)?row.errors.filter(Boolean).map(String):[]}function importRowHasMissingCatalogProduct(row){if(!row)return false
;const productCode=String(row.productCode||"").trim();const warningText=importRowWarningList(row).join(" | ").toLowerCase()
;return row.missingProduct===true||productCode&&row.productMatched===false||warningText.includes("mã sản phẩm chưa có trong danh mục")}
function normalizeImportPreviewRowValidity(row){if(!row||typeof row!=="object")return row;const next={...row};let errors=importRowErrorList(next)
;let warnings=importRowWarningList(next);const missingProduct=importRowHasMissingCatalogProduct(next);if(missingProduct&&!errors.includes("Mã sản phẩm chưa có trong danh mục")){
errors.push("Mã sản phẩm chưa có trong danh mục")}if(missingProduct){warnings=warnings.filter(w=>String(w).trim()!=="Mã sản phẩm chưa có trong danh mục")}
const invalid=next.valid===false||String(next.status||"").toLowerCase()==="invalid"||String(next.status||"").toLowerCase()==="error"||errors.length>0||missingProduct
;next.errors=errors;next.warnings=warnings;if(invalid){next.valid=false;next.canImport=false;next.status="invalid"
;next.statusText=next.statusText&&next.statusText!=="Hợp lệ"?next.statusText:"Lỗi"}else{next.valid=next.valid!==false;next.status=next.status||"valid"
;next.statusText=next.statusText||"Hợp lệ"}return next}function isImportRowSelectable(row){
return Boolean(row&&row.valid!==false&&row.canImport!==false&&!importRowHasMissingCatalogProduct(row)&&importRowErrorList(row).length===0)}function initImportSelectedRows(rows=[]){
importSelectedRowKeySet=new Set;rows.forEach((row,index)=>{if(isImportRowSelectable(row))importSelectedRowKeySet.add(getImportRowSelectKey(row,index))})}
function syncImportInlineSelection(){document.querySelectorAll(".import-row-check").forEach(cb=>{const index=Number(cb.dataset.index);const row=importPreviewRows[index]
;const key=getImportRowSelectKey(row,index);if(!isImportRowSelectable(row)){importSelectedRowKeySet.delete(key);cb.checked=false;return}
if(cb.checked)importSelectedRowKeySet.add(key);else importSelectedRowKeySet.delete(key)});syncImportSelectedCount()}function bindImportInlinePreviewChecks(){
document.querySelectorAll(".import-row-check").forEach(cb=>{const index=Number(cb.dataset.index);const row=importPreviewRows[index]
;cb.checked=isImportRowSelectable(row)&&importSelectedRowKeySet.has(getImportRowSelectKey(row,index));cb.disabled=!isImportRowSelectable(row);cb.onchange=syncImportInlineSelection
})}function getSelectedImportRows(){return importPreviewRows.filter((row,index)=>isImportRowSelectable(row)&&importSelectedRowKeySet.has(getImportRowSelectKey(row,index)))}
function escapeImportHtml(value){return String(value??"").replace(/[&<>'\"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]))}function importRowToText(row){
if(row&&row.previewMode==="order"){const customer=row.customerName||row.supplier||"";const total=row.totalAmount!==undefined?money(row.totalAmount):""
;const status=row.statusText||(row.valid?"Hợp lệ":"Lỗi")
;const shortage=row.hasShortage?` | Vượt tồn: ${displayImportAggregateQty(row.shortageQuantity||0)} | Cắt: ${money(row.shortageAmount||0)}`:""
;const sourceFile=row.sourceFile||row.fileName||""
;return`Mã đơn: ${row.documentCode||""} | Khách/NCC: ${customer} | Số dòng: ${row.lineCount||0} | Giá trị: ${total} | File: ${sourceFile||"-"} | Trạng thái: ${status}${shortage}`}
if(row&&(row.programCode||row.productCode)&&(row.source==="excel-import"||row.missingProduct!==undefined||row.productMatched!==undefined)){
return[`Dòng: ${row.sourceRowNo||row.rowNo||""}`,`File: ${row.sourceFile||row.fileName||"-"}`,`Mã nhóm/CTKM: ${row.programCode||row.groupCode||""}`,`Mã sản phẩm: ${row.productCode||""}`,`Tên sản phẩm: ${row.productName||""}`].filter(Boolean).join(" | ")
}
const skip=["valid","errors","warnings","rowNo","sourceRowNo","sourceFile","fileName","source","raw","__importRows","__adjustedRows","lineDetails","shortageReport","detailErrors","password","changes","changeCount","importMode","canImport","action","status","statusText","productMatched","missingProduct"]
;const base=Object.keys(row).filter(k=>!skip.includes(k)).map(k=>`${k}: ${row[k]??""}`).join(" | ");const changes=formatSelectiveUpdateChanges(row)
;return[base,changes?`Thay đổi: ${changes}`:""].filter(Boolean).join(" | ")}function getImportRowMainFields(row){if(row&&row.previewMode==="order"){return[{key:"Mã đơn",
value:row.documentCode||""},{key:"File nguồn",value:row.sourceFile||row.fileName||""},{key:"Mã NVBH",value:row.salesStaffCode||row.salesmanCode||""},{key:"NVBH",
value:row.salesStaffName||row.salesmanName||""},{key:row.supplier?"Nhà cung cấp":"Mã KH",value:row.supplier||row.customerCode||""},{key:"Tên KH/NCC",
value:row.customerName||row.supplier||""},{key:"Số dòng hàng",value:row.lineCount||0},{key:"Giá trị đơn",value:money(row.totalAmount||0)},{key:"Trạng thái",
value:row.statusText||(row.valid?"Hợp lệ":"Lỗi")},...row.hasShortage?[{key:"SL vượt tồn",value:displayImportAggregateQty(row.shortageQuantity||0)},{key:"Giá trị bị cắt",
value:money(row.shortageAmount||0)}]:[]]}
const fields=["documentCode","date","customerCode","customerName","productCode","productName","quantity","stockQuantity","soldQuantity","salePrice","amount","salesStaffCode","salesStaffName","salesmanCode","salesmanName","note"]
;return fields.filter(k=>row[k]!==undefined&&row[k]!==null&&row[k]!=="").map(k=>({key:k,value:row[k]}))}function renderImportOrderDetailHtml(row){
const errors=(row.detailErrors||[]).flatMap(d=>(d.errors||[]).map(e=>`Dòng ${d.rowNo||""} - ${d.productCode||""}: ${e}`));const shortages=row.shortageReport||[]
;const lines=row.lineDetails||[]
;const shortageHtml=shortages.length?`\n    <div class="import-preview-shortage">\n      <b>Báo cáo hàng bị cắt do vượt tồn</b>\n      <div class="muted">Tồn được phân bổ tuần tự theo thứ tự đơn trong file. Đơn đứng trước giữ hàng trước.</div>\n      <div class="import-shortage-table">\n        <div class="import-shortage-head">Mã SP</div><div class="import-shortage-head">Tên SP</div><div class="import-shortage-head">SL đặt</div><div class="import-shortage-head">Tồn</div><div class="import-shortage-head">SL nhập</div><div class="import-shortage-head">SL cắt</div><div class="import-shortage-head">Giá trị cắt</div>\n        ${shortages.map(s=>`\n          <div>${escapeImportHtml(s.productCode||"")}</div>\n          <div>${escapeImportHtml(s.productName||"")}</div>\n          <div>${displayImportQtyTL(s.requestedQuantity||0,s)}</div>\n          <div>\n            <b>${displayImportQtyTL(s.availableQuantity||0,s)}</b>\n            <small class="import-stock-trace-small">Đầu: ${displayImportQtyTL(s.initialAvailableQuantity??s.availableQuantity??0,s)} · Đã giữ: ${displayImportQtyTL(s.allocatedBeforeQuantity||0,s)}</small>\n          </div>\n          <div>${displayImportQtyTL(s.importQuantity||0,s)}</div>\n          <div>${displayImportQtyTL(s.missingQuantity||0,s)}</div>\n          <div>${money(s.cutAmount||0)}</div>\n        `).join("")}\n      </div>\n    </div>`:""
;const lineHtml=lines.length?`\n    <details class="import-preview-lines">\n      <summary>Xem chi tiết ${formatNumber(lines.length)} dòng hàng</summary>\n      <div class="import-line-list">\n        ${lines.slice(0,80).map(l=>`\n          <div class="import-line-item ${Number(l.missingQuantity||0)>0?"shortage":""}">\n            <b>${escapeImportHtml(l.productCode||"")}</b>\n            <span>${escapeImportHtml(l.productName||"")}</span>\n            <span>SL: ${displayImportQtyTL(l.requestedQuantity||l.quantity||0,l)}</span>\n            ${l.availableQuantity!==undefined?`<span>Tồn đầu: ${displayImportQtyTL(l.initialAvailableQuantity??l.availableQuantity??0,l)} · Đã giữ trước: ${displayImportQtyTL(l.allocatedBeforeQuantity||0,l)} · Còn: ${displayImportQtyTL(l.availableQuantity||0,l)}</span>`:""}\n            ${Number(l.missingQuantity||0)>0?`<span class="danger-text">Cắt: ${displayImportQtyTL(l.missingQuantity||0,l)}</span>`:""}\n          </div>`).join("")}\n      </div>\n    </details>`:""
;const errorHtml=errors.length?`<div class="import-preview-error"><b>Lỗi chi tiết:</b> ${escapeImportHtml(errors.join("; "))}</div>`:""
;return`${shortageHtml}${lineHtml}${errorHtml}`}function ensureImportPreviewModal(){let modal=document.getElementById("importPreviewModal");if(modal)return modal
;document.body.insertAdjacentHTML("beforeend",`\n    <div id="importPreviewModal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="importPreviewModalTitle">\n      <div class="modal-card import-preview-modal-card">\n        <div class="modal-head">\n          <div>\n            <h3 id="importPreviewModalTitle">Xem trước import</h3>\n            <p class="muted">Kiểm tra tổng quan dữ liệu, dòng hợp lệ và dòng lỗi trước khi ghi vào hệ thống.</p>\n          </div>\n          <button type="button" id="closeImportPreviewModalButton" class="secondary">Đóng</button>\n        </div>\n        <div id="importPreviewModalReport" class="import-preview-report"></div>\n        <div class="button-row import-preview-modal-actions">\n          <button type="button" id="selectAllImportPreviewButton" class="secondary">Chọn tất cả hợp lệ</button>\n          <button type="button" id="clearAllImportPreviewButton" class="secondary">Bỏ chọn</button>\n          <button type="button" id="commitImportFromModalButton">Xác nhận import</button>\n        </div>\n        <div id="importPreviewModalBody" class="import-preview-modal-body"></div>\n      </div>\n    </div>`)
;modal=document.getElementById("importPreviewModal");modal.addEventListener("click",function(event){if(event.target===modal)closeImportPreviewModal()})
;document.addEventListener("keydown",function(event){if(event.key==="Escape")closeImportPreviewModal()});return modal}function normalizeImportPreviewKey(value){
return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"")}function pickImportPreviewValue(source,keys){
if(!source||typeof source!=="object")return"";for(const key of keys){const direct=source[key];if(direct!==undefined&&direct!==null&&String(direct).trim()!=="")return direct}
const normalizedKeys=keys.map(normalizeImportPreviewKey);for(const[k,v]of Object.entries(source)){if(v===undefined||v===null||String(v).trim()==="")continue
;if(normalizedKeys.includes(normalizeImportPreviewKey(k)))return v}return""}function findImportPreviewValue(row,keys){
const pools=[row,row&&row.raw,row&&row.source,row&&row.order,row&&row.meta,row&&row.customer,row&&Array.isArray(row.lineDetails)?row.lineDetails[0]:null,row&&Array.isArray(row.items)?row.items[0]:null,row&&Array.isArray(row.__importRows)?row.__importRows[0]:null]
;for(const pool of pools){const value=pickImportPreviewValue(pool,keys);if(value!==undefined&&value!==null&&String(value).trim()!=="")return String(value).trim()}return""}
function getImportPreviewSalesStaffCode(row){return row.salesStaffCode||row.salesmanCode||""}function getImportPreviewSalesStaffName(row){
return row.salesStaffName||row.salesmanName||""}function normalizeImportStaffCode(value){return String(value||"").trim()}function isImportSalesAccount(user){
const role=String(user&&user.role||"").toLowerCase();return user&&user.isActive!==false&&(!role||role==="sales"||role==="admin"||role==="sale"||role==="seller")}
function findImportSalesAccountByCode(code){const target=normalizeImportStaffCode(code).toLowerCase();if(!target)return null;return(usersCache||[]).find(u=>{
if(!isImportSalesAccount(u))return false
;const keys=[u.code,u.staffCode,u.salesStaffCode,u.salesmanCode,u.employeeCode,u.maNhanVien].map(v=>normalizeImportStaffCode(v).toLowerCase()).filter(Boolean)
;return keys.includes(target)})||null}async function ensureImportUsersCache(){usersCache=Array.isArray(usersCache)?usersCache:[];return usersCache}
function attachImportOrderError(row,message){row.valid=false;row.statusText="Lỗi";row.errors=Array.isArray(row.errors)?row.errors:[]
;if(!row.errors.includes(message))row.errors.push(message);return row}function normalizeImportPreviewSalesStaffFromAccounts(rows=[]){return Array.isArray(rows)?rows:[]}
function getImportStockAllocationTrace(row={}){const remaining=Number(row.availableQuantity??row.availableStock??0)
;const initial=Number(row.initialAvailableQuantity??row.stockAtPreview??remaining);const allocated=Number(row.allocatedBeforeQuantity??Math.max(0,initial-remaining))
;const requested=Number(row.requestedQuantity??row.quantity??0);const imported=Number(row.importQuantity??row.availableQuantityToImport??Math.min(requested,remaining))
;const missing=Number(row.missingQuantity??row.shortageQuantity??Math.max(0,requested-imported));return{initial:initial,allocated:allocated,remaining:remaining,requested:requested,
imported:imported,missing:missing}}function renderImportStockAllocationTrace(row={}){const trace=getImportStockAllocationTrace(row)
;return`Cần ${displayImportQtyTL(trace.requested,row)} · Tồn đầu ${displayImportQtyTL(trace.initial,row)} · Đã giữ cho đơn trước ${displayImportQtyTL(trace.allocated,row)} · Còn trước đơn ${displayImportQtyTL(trace.remaining,row)} · Thiếu ${displayImportQtyTL(trace.missing,row)}`
}function getImportOrderShortageState(row){const shortages=Array.isArray(row.shortageReport)?row.shortageReport.filter(s=>Number(s.missingQuantity||s.shortageQuantity||0)>0):[]
;const lineCount=Number(row.lineCount||(Array.isArray(row.lineDetails)?row.lineDetails.length:0)||0);const valid=!!row.valid;if(!valid){return{type:"error",label:"🔴 Lỗi",count:0,
shortages:shortages}}if(!row.hasShortage||!shortages.length){return{type:"ok",label:"🟢 Đủ tồn",count:0,shortages:shortages}}
const fullShortage=lineCount>0&&shortages.length>=lineCount&&shortages.every(s=>{const requested=Number(s.requestedQuantity||s.quantity||0)
;const imported=Number(s.importQuantity||s.availableQuantityToImport||0);const missing=Number(s.missingQuantity||s.shortageQuantity||0)
;return requested>0&&missing>=requested&&imported<=0});if(fullShortage){return{type:"full-shortage",label:"🔴 Thiếu toàn bộ",count:shortages.length,shortages:shortages}}return{
type:"shortage",label:`🟡 Thiếu ${formatNumber(shortages.length)} mã hàng`,count:shortages.length,shortages:shortages}}function renderImportOrderShortageLines(row,limit=2){
const state=getImportOrderShortageState(row);if(!state.shortages.length)return"";const visible=state.shortages.slice(0,limit);const more=state.shortages.length-visible.length
;return`<div class="import-order-shortage-lines">\n    ${visible.map(s=>`\n      <div class="import-order-shortage-line">↳ <b>${escapeImportHtml(s.productName||s.productCode||"Sản phẩm")}</b> · ${escapeImportHtml(renderImportStockAllocationTrace(s))}</div>\n    `).join("")}\n    ${more>0?`<div class="import-order-shortage-line more">+ ${formatNumber(more)} sản phẩm khác...</div>`:""}\n  </div>`
}function renderImportOrderPreviewSummary(row,index,options={}){const state=getImportOrderShortageState(row);const checked=options.modal?"import-modal-row-check":"import-row-check"
;const showCheckbox=options.inline?false:true;const canCheck=!!row.valid&&row.canImport!==false
;const checkHtml=showCheckbox&&canCheck?`<input class="${checked}" data-index="${index}" type="checkbox" checked />`:""
;const customer=row.customerName||row.customer||row.supplier||row.customerCode||""
;const lineCount=Number(row.lineCount||row.skuCount||row.itemCount||(Array.isArray(row.lineDetails)?row.lineDetails.length:0)||(Array.isArray(row.items)?row.items.length:0)||(Array.isArray(row.__importRows)?row.__importRows.length:0)||0)
;const staffCode=getImportPreviewSalesStaffCode(row);const staffName=getImportPreviewSalesStaffName(row);const code=row.documentCode||row.code||row.orderCode||row.invoiceCode||""
;const total=Number(row.totalAmount??row.amount??row.grossAmount??0);const sourceFile=row.sourceFile||row.fileName||""
;return`\n    <div class="import-order-preview-item ${state.type} ${showCheckbox?"":"no-check"}">\n      ${showCheckbox?`<div class="import-order-preview-check">${checkHtml}</div>`:""}\n      <div class="import-order-preview-content">\n        <div class="import-order-line import-order-preview-line">\n          <strong>${escapeImportHtml(code)}</strong> | ${escapeImportHtml(customer)} | ${money(total)} | ${formatNumber(lineCount)} SP | Mã NVBH: ${escapeImportHtml(staffCode||"-")} | NVBH: ${escapeImportHtml(staffName||"-")} | File: ${escapeImportHtml(sourceFile||"-")} | <span class="import-order-status ${state.type}">${escapeImportHtml(state.label)}</span>\n        </div>\n        ${renderImportOrderShortageLines(row,2)}\n        ${!row.valid&&Array.isArray(row.errors)&&row.errors.length?`<div class="import-preview-error"><b>Lỗi:</b> ${escapeImportHtml(row.errors.join("; "))}</div>`:""}\n      </div>\n    </div>`
}function renderImportPreviewModal(result){const modal=ensureImportPreviewModal();const report=document.getElementById("importPreviewModalReport")
;const body=document.getElementById("importPreviewModalBody");const title=document.getElementById("importPreviewModalTitle");if(!modal||!body)return
;const total=result.total||importPreviewRows.length;const valid=result.valid||0;const invalid=result.invalid||0
;const orderMode=importPreviewRows.some(r=>r&&r.previewMode==="order");const shortageOrders=importPreviewRows.filter(r=>r&&r.hasShortage).length
;const shortageAmount=importPreviewRows.reduce((sum,r)=>sum+Number(r.shortageAmount||0),0)
;if(title)title.textContent=`Xem trước import - ${formatNumber(total)} ${orderMode?"đơn/chứng từ":"dòng"}`;if(report){
report.innerHTML=`\n      <div class="import-report-card"><span>${orderMode?"Tổng đơn":"Tổng dòng"}</span><strong>${formatNumber(total)}</strong></div>\n      <div class="import-report-card success"><span>Hợp lệ</span><strong>${formatNumber(valid)}</strong></div>\n      <div class="import-report-card danger"><span>${orderMode?"Đơn lỗi":"Dòng lỗi"}</span><strong>${formatNumber(invalid)}</strong></div>\n      ${orderMode?`<div class="import-report-card danger"><span>Đơn vượt tồn</span><strong>${formatNumber(shortageOrders)}</strong></div>\n      <div class="import-report-card danger"><span>Giá trị bị cắt</span><strong>${money(shortageAmount)}</strong></div>`:""}\n      <div class="import-report-card"><span>Được chọn</span><strong id="importPreviewSelectedCount">${formatNumber(valid)}</strong></div>`
}if(!importPreviewRows.length){body.innerHTML='<div class="empty-state">Không có dữ liệu xem trước.</div>'}else{body.innerHTML=importPreviewRows.map((row,index)=>{
const fields=getImportRowMainFields(row);const fieldHtml=(fields.length?fields:Object.keys(row).filter(k=>!["valid","errors","rowNo"].includes(k)).slice(0,12).map(k=>({key:k,
value:row[k]}))).map(f=>`\n        <div class="import-preview-field"><span>${escapeImportHtml(f.key)}</span><b>${escapeImportHtml(f.value)}</b></div>`).join("")
;const errors=(row.errors||[]).filter(Boolean)
;return`<article class="import-preview-card ${row.valid?"valid":"invalid"}">\n        <div class="import-preview-card-head">\n          <label class="import-preview-check-wrap">\n            ${row.valid&&row.canImport!==false?`<input class="import-row-check import-modal-row-check" data-index="${index}" type="checkbox" checked />`:""}\n            <span>Dòng ${escapeImportHtml(row.rowNo||"")}</span>\n          </label>\n          <span class="badge ${row.valid?row.hasShortage?"warn":"active":"inactive"}">${escapeImportHtml(row.statusText||(row.valid?"Hợp lệ":"Lỗi"))}</span>\n        </div>\n        ${row.previewMode==="order"?`\n          ${renderImportOrderPreviewSummary(row,index,{
modal:true
})}\n          ${renderImportOrderDetailHtml(row)}\n        `:`\n          <div class="import-preview-grid">${fieldHtml}</div>\n          ${Array.isArray(row.changes)&&row.changes.length?`<div class="import-preview-change"><b>Thay đổi:</b> ${escapeImportHtml(formatSelectiveUpdateChanges(row))}</div>`:""}\n          ${errors.length?`<div class="import-preview-error"><b>Lỗi:</b> ${escapeImportHtml(errors.join("; "))}</div>`:""}\n        `}\n      </article>`
}).join("")}modal.classList.add("show");document.body.classList.add("modal-open");bindImportPreviewModalControls();syncImportSelectedCount()}function closeImportPreviewModal(){
const modal=document.getElementById("importPreviewModal");if(modal)modal.classList.remove("show");document.body.classList.remove("modal-open")}
