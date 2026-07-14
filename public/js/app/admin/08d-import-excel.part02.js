/* GENERATED FILE — edit public/js/app/admin/08d-import-excel.source/part-01.jsfrag, public/js/app/admin/08d-import-excel.source/part-01b.jsfrag, public/js/app/admin/08d-import-excel.source/part-02.jsfrag, public/js/app/admin/08d-import-excel.source/part-02b.jsfrag, public/js/app/admin/08d-import-excel.source/part-03.jsfrag and run npm run build:source-bundles. */
function getPromotionProgramCode(row){return String(row?.programCode||row?.promotionCode||row?.groupCode||"(Thiếu mã CTKM)").trim()||"(Thiếu mã CTKM)"}
function getPromotionProgramName(row){return String(row?.programName||row?.name||"").trim()}function importProgramGroupStatus(group){if(!group||!group.validRows)return{
label:"Không hợp lệ",type:"inactive"};if(group.invalidRows>0)return{label:"Import partial",type:"warn"};return{label:"Hợp lệ",type:"active"}}
function buildImportProgramGroups(rows=[]){const map=new Map;const groups=[];rows.forEach((row,index)=>{const programCode=getPromotionProgramCode(row);if(!map.has(programCode)){
const group={programCode:programCode,programName:getPromotionProgramName(row),totalRows:0,validRows:0,invalidRows:0,missingProductCount:0,duplicateConflictCount:0,canImport:false,
rows:[],excludedRows:[],selected:false};map.set(programCode,group);groups.push(group)}const group=map.get(programCode)
;if(!group.programName)group.programName=getPromotionProgramName(row);group.totalRows+=1;if(isImportRowSelectable(row)){group.validRows+=1;group.rows.push({row:row,index:index})
}else{group.invalidRows+=1;group.excludedRows.push({row:row,index:index});if(importRowHasMissingCatalogProduct(row))group.missingProductCount+=1
;const errorText=importRowErrorList(row).join(" | ");if(errorText.includes("dữ liệu CK khác nhau"))group.duplicateConflictCount+=1}});groups.forEach(group=>{
group.canImport=group.validRows>0;group.selected=group.canImport;const state=importProgramGroupStatus(group)
;group.status=state.type==="warn"?"partial-valid":state.type==="active"?"valid":"invalid";group.statusText=state.label});return groups}
function initImportProgramGroupSelection(groups=[]){importSelectedProgramCodeSet=new Set;groups.forEach(group=>{
if(group&&group.canImport)importSelectedProgramCodeSet.add(group.programCode)})}function getSelectedImportProgramCodes(){
return Array.from(importSelectedProgramCodeSet||[]).filter(Boolean)}function getSelectedImportProgramRows(){if(!isPromotionProductRuleImportType())return null
;return(importPreviewProgramGroups||[]).filter(group=>group&&group.canImport&&importSelectedProgramCodeSet.has(group.programCode)).flatMap(group=>group.rows||[]).map(item=>item.row).filter(isImportRowSelectable)
}function syncImportProgramSelection(){document.querySelectorAll(".import-program-check").forEach(cb=>{const code=String(cb.dataset.programCode||"")
;const group=(importPreviewProgramGroups||[]).find(item=>item.programCode===code);if(!group||!group.canImport){importSelectedProgramCodeSet.delete(code);cb.checked=false
;cb.disabled=true}else if(cb.checked)importSelectedProgramCodeSet.add(code);else importSelectedProgramCodeSet.delete(code)});syncImportSelectedCount()}
function applyImportProgramFilter(){const mode=String(document.querySelector(".import-program-filter.active")?.dataset.filter||"all")
;const search=String(document.getElementById("importProgramSearch")?.value||"").trim().toLowerCase();document.querySelectorAll(".import-program-row").forEach(row=>{
const status=String(row.dataset.status||"");const haystack=String(row.dataset.search||"").toLowerCase()
;const matchMode=mode==="all"||mode==="valid"&&status==="valid"||mode==="error"&&status!=="valid"||mode==="missing"&&Number(row.dataset.missing||0)>0
;const matchSearch=!search||haystack.includes(search);row.style.display=matchMode&&matchSearch?"":"none"})}function bindImportProgramPreviewControls(){
document.querySelectorAll(".import-program-check").forEach(cb=>{cb.onchange=syncImportProgramSelection});document.querySelectorAll(".import-program-filter").forEach(btn=>{
btn.onclick=()=>{document.querySelectorAll(".import-program-filter").forEach(item=>item.classList.remove("active"));btn.classList.add("active");applyImportProgramFilter()}})
;const search=document.getElementById("importProgramSearch");if(search)search.oninput=applyImportProgramFilter;const openAll=document.getElementById("openAllImportProgramGroups")
;if(openAll)openAll.onclick=()=>document.querySelectorAll(".import-program-details").forEach(item=>{item.open=true})
;const closeAll=document.getElementById("closeAllImportProgramGroups");if(closeAll)closeAll.onclick=()=>document.querySelectorAll(".import-program-details").forEach(item=>{
item.open=false});applyImportProgramFilter()}function renderImportProgramGroupDetails(group){
const validRows=(group.rows||[]).slice(0,30).map(({row:row})=>`<div class="import-program-line valid"><b>${escapeImportHtml(row.productCode||"")}</b> · ${escapeImportHtml(row.productName||"")} · CK: ${escapeImportHtml(row.discountPercent??"")}</div>`).join("")
;const excludedRows=(group.excludedRows||[]).slice(0,20).map(({row:row})=>`<div class="import-program-line invalid"><b>${escapeImportHtml(row.productCode||"")}</b> · ${escapeImportHtml(row.productName||"")} · ${escapeImportHtml(importRowErrorList(row).join("; ")||row.statusText||"Dòng lỗi đã loại")}</div>`).join("")
;const validMore=Math.max(0,(group.rows||[]).length-30);const excludedMore=Math.max(0,(group.excludedRows||[]).length-20)
;return`<details class="import-program-details">\n    <summary>Xem sản phẩm của ${escapeImportHtml(group.programCode)}</summary>\n    <div class="import-program-detail-grid">\n      <div><b>Sản phẩm hợp lệ được import</b>${validRows||'<div class="muted">Không có dòng hợp lệ.</div>'}${validMore?`<div class="muted">Còn ${formatNumber(validMore)} sản phẩm hợp lệ khác.</div>`:""}</div>\n      <div><b>Dòng lỗi đã loại</b>${excludedRows||'<div class="muted">Không có dòng lỗi.</div>'}${excludedMore?`<div class="muted">Còn ${formatNumber(excludedMore)} dòng lỗi khác.</div>`:""}</div>\n    </div>\n  </details>`
}function renderPromotionProductRuleGroupedPreview(total,valid,invalid){if(!importPreviewTable)return;importPreviewProgramGroups=buildImportProgramGroups(importPreviewRows)
;initImportProgramGroupSelection(importPreviewProgramGroups);window.__importPreviewProgramGroups=importPreviewProgramGroups;const totalPrograms=importPreviewProgramGroups.length
;const importablePrograms=importPreviewProgramGroups.filter(group=>group.canImport).length
;const missingProductCount=importPreviewProgramGroups.reduce((sum,group)=>sum+Number(group.missingProductCount||0),0)
;if(importPreviewHead)importPreviewHead.innerHTML='<tr><th style="width:54px">Chọn</th><th>Mã CTKM</th><th>Hợp lệ</th><th>Lỗi bị loại</th><th>Trạng thái</th><th>Chi tiết</th></tr>'
;const toolbar=`<tr><td colspan="6" class="import-program-toolbar-cell">\n    <div class="import-program-toolbar">\n      <b>Gom theo ${formatNumber(totalPrograms)} mã CTKM</b>\n      <button type="button" class="secondary import-program-filter active" data-filter="all">Tất cả</button>\n      <button type="button" class="secondary import-program-filter" data-filter="valid">Chỉ nhóm hợp lệ</button>\n      <button type="button" class="secondary import-program-filter" data-filter="error">Nhóm có lỗi</button>\n      <button type="button" class="secondary import-program-filter" data-filter="missing">Thiếu sản phẩm</button>\n      <button type="button" class="secondary" id="openAllImportProgramGroups">Mở tất cả</button>\n      <button type="button" class="secondary" id="closeAllImportProgramGroups">Thu tất cả</button>\n      <input id="importProgramSearch" type="search" placeholder="Tìm mã CTKM / mã sản phẩm" />\n    </div>\n    <div class="muted">Đã đọc ${formatNumber(total)} dòng thuộc ${formatNumber(totalPrograms)} chương trình: ${formatNumber(valid)} dòng hợp lệ, ${formatNumber(invalid)} dòng lỗi đã loại. ${formatNumber(importablePrograms)} chương trình có dòng hợp lệ đã được chọn sẵn để import.</div>\n    ${missingProductCount?`<div class="muted">Có ${formatNumber(missingProductCount)} dòng thiếu sản phẩm đã bị loại khỏi danh sách import.</div>`:""}\n  </td></tr>`
;const rowsHtml=importPreviewProgramGroups.map(group=>{const state=importProgramGroupStatus(group)
;const searchText=[group.programCode,group.programName,...(group.rows||[]).slice(0,100).map(item=>`${item.row.productCode||""} ${item.row.productName||""}`)].join(" ")
;return`<tr class="import-program-row ${group.canImport?"import-valid":"import-invalid"}" data-program-code="${escapeImportHtml(group.programCode)}" data-status="${escapeImportHtml(group.status)}" data-missing="${Number(group.missingProductCount||0)}" data-search="${escapeImportHtml(searchText)}">\n      <td>${group.canImport?`<input class="import-program-check" data-program-code="${escapeImportHtml(group.programCode)}" type="checkbox" checked />`:`<input class="import-program-check" data-program-code="${escapeImportHtml(group.programCode)}" type="checkbox" disabled title="Chương trình không có dòng hợp lệ" />`}</td>\n      <td><b>${escapeImportHtml(group.programCode)}</b>${group.programName?`<div class="muted">${escapeImportHtml(group.programName)}</div>`:""}</td>\n      <td>${formatNumber(group.validRows)}</td>\n      <td>${formatNumber(group.invalidRows)}</td>\n      <td><span class="badge ${state.type}">${escapeImportHtml(state.label)}</span></td>\n      <td>${renderImportProgramGroupDetails(group)}</td>\n    </tr>`
}).join("");importPreviewTable.innerHTML=toolbar+rowsHtml;bindImportProgramPreviewControls()}function syncImportSelectedCount(){const selected=getSelectedImportRows().length
;const el=document.getElementById("importPreviewSelectedCount");if(el)el.textContent=formatNumber(selected)}function deriveImportPreviewBulkSelectionState(){
const api=window.ScopedBulkSelection;if(api&&typeof api.deriveScopeSelectionState==="function"){return api.deriveScopeSelectionState({visibleRows:importPreviewRows,
selectedKeys:importSelectedRowKeySet,getKey:getImportRowSelectKey,isSelectable:isImportRowSelectable})}
const keys=importPreviewRows.map((row,index)=>isImportRowSelectable(row)?getImportRowSelectKey(row,index):"").filter(Boolean)
;const selectedCount=keys.filter(key=>importSelectedRowKeySet.has(key)).length;const allSelected=Boolean(keys.length&&selectedCount===keys.length);return{selectableKeys:keys,
selectableCount:keys.length,selectedSelectableCount:selectedCount,allSelected:allSelected,buttonLabel:allSelected?"Bỏ chọn tất cả":"Chọn tất cả",disabled:keys.length===0}}
function syncImportPreviewToggleButton(){const button=document.getElementById("toggleAllImportPreviewButton");if(!button)return
;const summary=deriveImportPreviewBulkSelectionState();const api=window.ScopedBulkSelection
;if(api&&typeof api.applyToggleButtonState==="function")api.applyToggleButtonState(button,summary,{entityLabel:"dòng import hợp lệ đang hiển thị"});else{
button.textContent=summary.buttonLabel;button.disabled=summary.disabled;button.setAttribute("aria-disabled",summary.disabled?"true":"false")
;button.setAttribute("aria-pressed",summary.allSelected?"true":"false")}}function syncImportChecksFromModal(){const modal=document.getElementById("importPreviewModal")
;const body=modal&&modal.querySelector("#importPreviewModalBody");if(!body)return;body.querySelectorAll(".import-modal-row-check").forEach(cb=>{const index=Number(cb.dataset.index)
;const row=importPreviewRows[index];const key=getImportRowSelectKey(row,index);if(!isImportRowSelectable(row)){importSelectedRowKeySet.delete(key);cb.checked=false;cb.disabled=true
}else if(cb.checked)importSelectedRowKeySet.add(key);else importSelectedRowKeySet.delete(key)
;const inline=importPreviewTable&&importPreviewTable.querySelector(`.import-row-check[data-index="${cb.dataset.index}"]:not(.import-modal-row-check)`)
;if(inline)inline.checked=cb.checked});if(typeof invalidateImportShortageReviewState==="function")invalidateImportShortageReviewState();syncImportSelectedCount()
;syncImportPreviewToggleButton()}function toggleImportPreviewRows(){const api=window.ScopedBulkSelection;if(api&&typeof api.toggleScopeSelection==="function"){
api.toggleScopeSelection({visibleRows:importPreviewRows,selectedKeys:importSelectedRowKeySet,getKey:getImportRowSelectKey,isSelectable:isImportRowSelectable})}else{
const summary=deriveImportPreviewBulkSelectionState()
;if(summary.allSelected)summary.selectableKeys.forEach(key=>importSelectedRowKeySet.delete(key));else summary.selectableKeys.forEach(key=>importSelectedRowKeySet.add(key))}
const modal=document.getElementById("importPreviewModal");const body=modal&&modal.querySelector("#importPreviewModalBody")
;if(body)body.querySelectorAll(".import-modal-row-check").forEach(cb=>{const index=Number(cb.dataset.index);const row=importPreviewRows[index]
;cb.disabled=!isImportRowSelectable(row);cb.checked=isImportRowSelectable(row)&&importSelectedRowKeySet.has(getImportRowSelectKey(row,index))});syncImportChecksFromModal()}
function bindImportPreviewModalControls(){const modal=document.getElementById("importPreviewModal");const body=modal&&modal.querySelector("#importPreviewModalBody")
;const closeBtn=document.getElementById("closeImportPreviewModalButton");if(closeBtn)closeBtn.onclick=closeImportPreviewModal
;const toggleAll=document.getElementById("toggleAllImportPreviewButton");if(toggleAll)toggleAll.onclick=toggleImportPreviewRows
;const importBtn=document.getElementById("commitImportFromModalButton");if(importBtn)importBtn.onclick=()=>{syncImportChecksFromModal();commitImportExcel()}
;if(body)body.querySelectorAll(".import-modal-row-check").forEach(cb=>cb.onchange=syncImportChecksFromModal);syncImportPreviewToggleButton()}function ensureImportShortageActions(){
let box=document.getElementById("importShortageActions");if(!box){box=document.createElement("div");box.id="importShortageActions";box.className="import-shortage-actions"
;if(importPreviewSummary&&importPreviewSummary.parentNode){importPreviewSummary.parentNode.insertBefore(box,importPreviewSummary)
}else if(importDataMessage&&importDataMessage.parentNode){importDataMessage.parentNode.insertBefore(box,importDataMessage.nextSibling)}}return box}
function renderImportShortageActions(rows=[]){const box=ensureImportShortageActions();if(!box)return;const shortageRows=rows.filter(r=>r&&r.hasShortage)
;if(!isSalesOrderImportType()||!shortageRows.length){box.innerHTML="";box.style.display="none";importShortageActionMode="";return}
const shortageQty=shortageRows.reduce((sum,row)=>sum+Number(row.shortageQuantity||0),0);const shortageAmount=shortageRows.reduce((sum,row)=>sum+Number(row.shortageAmount||0),0)
;box.style.display="flex";importShortageActionMode="";if(commitImportButton)commitImportButton.disabled=false
;box.innerHTML=`\n    <div class="import-shortage-actions-text">\n      <b>Có ${formatNumber(shortageRows.length)} đơn vượt tồn</b>\n      <span>SL thiếu: ${displayImportAggregateQty(shortageQty)} · Cắt: ${money(shortageAmount)}</span>\n    </div>\n    <button type="button" class="secondary" id="reopenImportShortageReviewButton">Mở review</button>`
;const reopen=document.getElementById("reopenImportShortageReviewButton");if(reopen)reopen.onclick=()=>openImportShortageReviewModal({manual:true})
;if(!importShortageReviewState.autoOpened)setTimeout(()=>openImportShortageReviewModal({auto:true}),0)}function renderImportPreview(result){importShortageActionMode=""
;if(typeof resetImportShortageReviewState==="function")resetImportShortageReviewState();const previewSource=inferImportPreviewSource(result||{})
;setCurrentImportSource(previewSource,getImportSourceLabel(previewSource,result||{}));importPreviewSessionId=result.sessionId||result.importSessionId||""
;importPreviewRows=result.rows||[];window.__importPreviewSessionId=importPreviewSessionId;window.__importPreviewRows=importPreviewRows
;if(Array.isArray(result.shortageReport)&&result.shortageReport.length){const byDoc=new Map;result.shortageReport.forEach(item=>{
const key=String(item.documentCode||item.refCode||item.orderCode||item.code||"").trim();if(!key)return;if(!byDoc.has(key))byDoc.set(key,[]);byDoc.get(key).push(item)})
;importPreviewRows=importPreviewRows.map(row=>{const key=String(row.documentCode||row.code||"").trim();const list=byDoc.get(key);if(!list||!list.length)return row
;const q=list.reduce((sum,it)=>sum+Number(it.missingQuantity||it.shortageQuantity||0),0);const a=list.reduce((sum,it)=>sum+Number(it.cutAmount||it.shortageAmount||0),0);return{
...row,hasShortage:true,statusText:row.statusText==="Hợp lệ"?"Vượt tồn":row.statusText,shortageReport:list,shortageCount:list.length,shortageQuantity:q,shortageAmount:a}})}
importPreviewRows=normalizeImportPreviewSalesStaffFromAccounts(importPreviewRows).map(normalizeImportPreviewRowValidity);window.__importPreviewRows=importPreviewRows
;initImportSelectedRows(importPreviewRows);const total=Math.max(importPreviewRows.length,Number(result.total||result.totalRows||0))
;const valid=importPreviewRows.length===total?importPreviewRows.filter(r=>r&&r.valid).length:Number(result.valid||result.validRows||0)
;const selectable=importPreviewRows.filter(isImportRowSelectable).length;const unchanged=importPreviewRows.filter(r=>r&&r.action==="no_change").length
;const invalid=Math.max(0,total-valid);renderImportSourceNote(result);if(importPreviewSummary){const fileCount=Number(result.totalFiles||0)
;const fileText=fileCount>1?`<span>Số file: <strong>${fileCount}</strong></span>`:""
;const updateText=getSelectedImportMode()==="update"?`<span>Có thay đổi: <strong>${selectable}</strong></span><span>Giữ nguyên: <strong>${unchanged}</strong></span>`:""
;importPreviewSummary.innerHTML=`${fileText}<span>Tổng dòng/đơn: <strong>${total}</strong></span>${updateText}<span>Hợp lệ: <strong>${valid}</strong></span><span>Lỗi: <strong>${invalid}</strong></span>`
}if(!importPreviewRows.length){if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Không có dữ liệu import.</td></tr>';if(commitImportButton){
commitImportButton.disabled=true;commitImportButton.textContent="Import các dòng đã chọn"}return}if(isPromotionProductRuleImportType()){
renderPromotionProductRuleGroupedPreview(total,valid,invalid);renderImportShortageActions(importPreviewRows);const selected=getSelectedImportRows().length;if(commitImportButton){
commitImportButton.disabled=selected<=0;commitImportButton.textContent="Import các mã CTKM đã chọn"}syncImportSelectedCount();renderImportWarningModal(result);return}
const orderMode=importPreviewRows.some(r=>r&&r.previewMode==="order");if(importPreviewHead){
importPreviewHead.innerHTML=orderMode?'<tr><th style="width:54px">Chọn</th><th>Danh sách đơn import</th></tr>':"<tr><th>Chọn</th><th>Dòng</th><th>Trạng thái</th><th>Dữ liệu</th><th>Lỗi</th></tr>"
}if(importPreviewTable){const indexedRows=importPreviewRows.map((row,index)=>({row:row,index:index}));const removableErrorRows=indexedRows.filter(x=>!isImportRowSelectable(x.row))
;const shouldHideInvalidRows=isPromotionCatalogImportType()&&removableErrorRows.length>0
;const displayRows=shouldHideInvalidRows?indexedRows.filter(x=>isImportRowSelectable(x.row)):indexedRows
;const displayOrderedRows=shouldHideInvalidRows?displayRows:indexedRows.filter(x=>!x.row.valid).concat(indexedRows.filter(x=>x.row.valid))
;const visibleRows=displayOrderedRows.slice(0,IMPORT_PREVIEW_RENDER_LIMIT);const hiddenCount=Math.max(0,displayOrderedRows.length-visibleRows.length)
;const removedNote=shouldHideInvalidRows?`<tr><td colspan="${orderMode?2:5}" class="muted import-filtered-invalid-note">Đã loại ${formatNumber(removableErrorRows.length)} dòng lỗi sản phẩm khỏi danh sách import. Chỉ hiển thị ${formatNumber(displayRows.length)} dòng hợp lệ và đã chọn sẵn để import.</td></tr>`:""
;const hiddenNote=hiddenCount>0?`<tr><td colspan="${orderMode?2:5}" class="muted">Đang tối ưu tốc độ: chỉ hiển thị ${formatNumber(visibleRows.length)} dòng hợp lệ đầu, còn ${formatNumber(hiddenCount)} dòng hợp lệ vẫn nằm trong phiên preview.</td></tr>`:""
;if(orderMode){
importPreviewTable.innerHTML=removedNote+visibleRows.map(({row:row,index:index})=>`\n        <tr data-import-row-number="${Number(row.rowNo||row.__rowNo||index+1)}" class="${row.valid?"import-valid":"import-invalid"} ${row.hasShortage?"import-shortage-row":""}">\n          <td>${isImportRowSelectable(row)?`<input class="import-row-check" data-index="${index}" type="checkbox" />`:`<input class="import-row-check" data-index="${index}" type="checkbox" disabled title="Dòng lỗi không được import" />`}</td>\n          <td>${renderImportOrderPreviewSummary(row,index,{
inline:true})}</td>\n        </tr>`).join("")+hiddenNote}else{
importPreviewTable.innerHTML=removedNote+visibleRows.map(({row:row,index:index})=>`\n        <tr data-import-row-number="${Number(row.rowNo||row.__rowNo||index+1)}" class="${row.valid?"import-valid":"import-invalid"}">\n          <td>${isImportRowSelectable(row)?`<input class="import-row-check" data-index="${index}" type="checkbox" />`:`<input class="import-row-check" data-index="${index}" type="checkbox" disabled title="Dòng lỗi không được import" />`}</td>\n          <td>${row.rowNo||""}</td>\n          <td><span class="badge ${row.valid?row.hasShortage?"warn":"active":"inactive"}">${escapeImportHtml(row.statusText||(row.valid?"Hợp lệ":"Lỗi"))}</span></td>\n          <td>${escapeImportHtml(importRowToText(row))}</td>\n          <td>${escapeImportHtml([(row.errors||[]).join("; "),(row.warnings||[]).join("; ")].filter(Boolean).join(" | "))}</td>\n        </tr>`).join("")+hiddenNote
}bindImportInlinePreviewChecks()}renderImportShortageActions(importPreviewRows);renderImportWarningModal(result);if(commitImportButton){commitImportButton.disabled=selectable<=0
;commitImportButton.textContent=getSelectedImportMode()==="update"?"Cập nhật các dòng đã chọn":"Import các dòng đã chọn"}}window.renderImportPreviewFromExcel=renderImportPreview;
