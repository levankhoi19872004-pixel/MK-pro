/* GENERATED FILE — edit public/js/app/admin/08d-import-excel.source/part-01.jsfrag, public/js/app/admin/08d-import-excel.source/part-01b.jsfrag, public/js/app/admin/08d-import-excel.source/part-02.jsfrag, public/js/app/admin/08d-import-excel.source/part-02b.jsfrag, public/js/app/admin/08d-import-excel.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict";const SELECTIVE_UPDATE_IMPORT_TYPES=new Set(["products","customers","users"]);const IMPORT_SESSION_ROWS_PAGE_SIZE=500;const IMPORT_SESSION_ROWS_MAX=2e4
;const PROMOTION_CATALOG_IMPORT_TYPES=new Set(["promotionProductRules","promotionGroupItems"])
;const IMPORT_SHORTAGE_REVIEW_RECOVERABLE_CODES=new Set(["IMPORT_SHORTAGE_REVIEW_REQUIRED","IMPORT_SHORTAGE_REVIEW_INCOMPLETE","IMPORT_SHORTAGE_REVIEW_STALE","IMPORT_SHORTAGE_REVIEW_INVALID_MODE"])
;let importPreviewProgramGroups=[];let importSelectedProgramCodeSet=new Set;let currentImportSource="none";let currentImportSourceLabel=""
;function normalizeImportBusinessType(type=importDataType?.value){const rawType=String(type||"").trim();if(rawType==="salesOrdersS3")return"salesOrders";return rawType}
function isSalesOrderImportType(type=importDataType?.value){return normalizeImportBusinessType(type)==="salesOrders"}function isImportShortageReviewRecoverableCode(code){
return IMPORT_SHORTAGE_REVIEW_RECOVERABLE_CODES.has(String(code||"").trim())}function normalizeImportSourceName(source){const value=String(source||"").trim().toLowerCase()
;if(value==="paste"||value==="clipboard-paste"||value==="excel-paste")return"paste";if(value==="file"||value==="excel-file"||value==="import-session-status")return"file"
;return value||"none"}function inferImportPreviewSource(result={}){const explicit=normalizeImportSourceName(result.source||result.importSource||result.sourceType)
;if(explicit==="paste")return"paste";const names=[...Array.isArray(result.fileNames)?result.fileNames:[],result.fileName].filter(Boolean).map(v=>String(v).toLowerCase())
;if(names.some(name=>name.includes("clipboard-paste")||name.includes("dán trực tiếp")))return"paste";if(names.length)return"file";if(currentImportSource==="paste")return"paste"
;return"file"}function getImportSourceLabel(source,result={}){if(source==="paste")return"Dán trực tiếp từ Excel"
;const names=Array.isArray(result.fileNames)&&result.fileNames.length?result.fileNames:Array.from(importExcelFile&&importExcelFile.files||[]).map(file=>file&&file.name).filter(Boolean)
;return names.length?`File Excel: ${names.join(", ")}`:"File Excel"}function renderImportSourceNotice(message="",isError=false){
let target=document.getElementById("importPreviewSourceNotice");if(!target&&importDataMessage&&importDataMessage.parentNode){target=document.createElement("p")
;target.id="importPreviewSourceNotice";target.className="message import-source-notice";importDataMessage.parentNode.insertBefore(target,importDataMessage.nextSibling)}
if(!target)return;target.textContent=message||"Vui lòng chọn file Excel hoặc dán trực tiếp dữ liệu từ Excel.";target.classList.toggle("error",Boolean(isError))}
function setCurrentImportSource(source,label=""){currentImportSource=normalizeImportSourceName(source);currentImportSourceLabel=label||""
;window.__currentImportSource=currentImportSource;window.__currentImportSourceLabel=currentImportSourceLabel
;if(currentImportSource==="file"||currentImportSource==="paste")renderImportSourceNotice(`Nguồn dữ liệu: ${currentImportSourceLabel||getImportSourceLabel(currentImportSource,{})}`);else renderImportSourceNotice("Vui lòng chọn file Excel hoặc dán trực tiếp dữ liệu từ Excel.")
}function hasImportPreviewReady(){return Boolean(importPreviewSessionId&&Array.isArray(importPreviewRows)&&importPreviewRows.length)}
function clearImportPreviewState({message:message="Vui lòng chọn file Excel hoặc dán trực tiếp dữ liệu từ Excel."}={}){importPreviewRows=[];importPreviewSessionId=""
;importSelectedRowKeySet=new Set;if(typeof resetImportShortageReviewState==="function")resetImportShortageReviewState();importPreviewProgramGroups=[]
;importSelectedProgramCodeSet=new Set;window.__importPreviewRows=importPreviewRows;window.__importPreviewProgramGroups=importPreviewProgramGroups
;window.__importPreviewSessionId=importPreviewSessionId;setCurrentImportSource("none","")
;if(importPreviewTable)importPreviewTable.innerHTML=`<tr><td colspan="5">${escapeImportHtml(message)}</td></tr>`;if(commitImportButton){
const hasFile=Boolean(importExcelFile&&importExcelFile.files&&importExcelFile.files.length);commitImportButton.disabled=!hasFile
;commitImportButton.textContent=hasFile?"Xem trước dữ liệu import":"Import các dòng đã chọn"}resetImportPreviewMessage()}function isPromotionCatalogImportType(type){
return PROMOTION_CATALOG_IMPORT_TYPES.has(String(type||importDataType?.value||"").trim())}function isPromotionProductRuleImportType(type){
return String(type||importDataType?.value||"").trim()==="promotionProductRules"}function getSelectedImportMode(){const type=importDataType?importDataType.value:""
;if(!SELECTIVE_UPDATE_IMPORT_TYPES.has(type))return"create";return importDataMode&&importDataMode.value==="update"?"update":"create"}function syncImportModeAvailability(){
const supported=SELECTIVE_UPDATE_IMPORT_TYPES.has(importDataType?importDataType.value:"");if(importModeLabel)importModeLabel.hidden=!supported
;if(importModeHelp)importModeHelp.hidden=!supported;if(importDataMode){importDataMode.disabled=!supported;if(!supported)importDataMode.value="create"}}
function resetImportPreviewForModeChange(){clearImportPreviewState({message:"Vui lòng chọn file Excel hoặc dán trực tiếp dữ liệu từ Excel rồi bấm xem trước."})}
function formatSelectiveUpdateChanges(row){const changes=Array.isArray(row&&row.changes)?row.changes:[];if(!changes.length)return""
;return changes.map(change=>`${change.label||change.field}: ${change.oldValue??""} → ${change.newValue??""}`).join(" | ")}function resetImportPreviewMessage(){
if(importDataMessage)showMessage(importDataMessage,"")}function getImportRowSelectKey(row,index){
const code=String(row?.documentCode||row?.orderCode||row?.code||row?.username||"").trim();return code||`ROW_${index}`}function getImportRowSourceNumber(row,index){
const value=Number(row?.rowNo||row?.sourceRowNo||row?.__rowNo||row?.rowNumber||index+1);return Number.isFinite(value)&&value>0?value:0}function importRowWarningList(row){
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
function syncImportInlineSelection(){const root=importPreviewTable||document.querySelector(".import-preview-wrap");if(!root)return
;root.querySelectorAll(".import-row-check:not(.import-modal-row-check)").forEach(cb=>{const index=Number(cb.dataset.index);const row=importPreviewRows[index]
;const key=getImportRowSelectKey(row,index);if(!isImportRowSelectable(row)){importSelectedRowKeySet.delete(key);cb.checked=false;return}
if(cb.checked)importSelectedRowKeySet.add(key);else importSelectedRowKeySet.delete(key)})
;if(typeof invalidateImportShortageReviewState==="function")invalidateImportShortageReviewState();syncImportSelectedCount()}function bindImportInlinePreviewChecks(){
const root=importPreviewTable||document.querySelector(".import-preview-wrap");if(!root)return;root.querySelectorAll(".import-row-check:not(.import-modal-row-check)").forEach(cb=>{
const index=Number(cb.dataset.index);const row=importPreviewRows[index];cb.checked=isImportRowSelectable(row)&&importSelectedRowKeySet.has(getImportRowSelectKey(row,index))
;cb.disabled=!isImportRowSelectable(row);cb.onchange=syncImportInlineSelection})}function getSelectedImportRows(){const groupedRows=getSelectedImportProgramRows()
;if(groupedRows)return groupedRows;return importPreviewRows.filter((row,index)=>isImportRowSelectable(row)&&importSelectedRowKeySet.has(getImportRowSelectKey(row,index)))}
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
;return`${shortageHtml}${lineHtml}${errorHtml}`}
