/* GENERATED FILE — edit public/js/app/admin/08d-import-excel.source/part-01.jsfrag, public/js/app/admin/08d-import-excel.source/part-02.jsfrag, public/js/app/admin/08d-import-excel.source/part-03.jsfrag and run npm run build:source-bundles. */
async function waitForAsyncImportCommit(sessionId,jobId){const deadline=Date.now()+Number(window.IMPORT_COMMIT_UI_TIMEOUT_MS||15*60*1e3);while(Date.now()<deadline){
const response=await fetch(`/api/import/sessions/${encodeURIComponent(sessionId)}`);const payload=await response.json().catch(()=>({}));if(payload.status==="done")return{
...payload.result||{},sessionId:sessionId,importSessionId:sessionId}
;if(payload.status==="failed"||!response.ok&&!["importing","processing"].includes(String(payload.status||"").toLowerCase())){
throw new Error(payload.errorMessage||payload.message||`Import nền thất bại${jobId?` (${jobId})`:""}`)}await new Promise(resolve=>setTimeout(resolve,600))}
throw new Error(`Import quá thời gian chờ${jobId?` (${jobId})`:""}. Vui lòng kiểm tra lại trạng thái phiên import.`)}async function commitImportExcel(){
if(!importDataType||!importExcelFile)return;let stopProgressPolling=()=>{};try{const files=Array.from(importExcelFile.files||[]);if(!files.length){
showMessage(importDataMessage,"Bạn chưa chọn file Excel",true);return}if(!importPreviewRows.length){await previewImportExcel();return}const selectedRows=getSelectedImportRows()
;if(!selectedRows.length){showMessage(importDataMessage,"Bạn chưa chọn đơn/dòng nào để import",true);return}if(commitImportButton){commitImportButton.disabled=true
;commitImportButton.dataset.originalText=commitImportButton.textContent||"Import các đơn đã chọn";commitImportButton.textContent="Đang import..."}
showMessage(importDataMessage,`Đang import ${formatNumber(selectedRows.length)} đơn/dòng đã chọn...`)
;stopProgressPolling=startImportCommitProgressPolling(importPreviewSessionId,selectedRows.length)
;const commitUrl=`/api/import/sessions/${encodeURIComponent(importPreviewSessionId)}/commit`;const res=await fetch(commitUrl,{method:"POST",headers:{
"Content-Type":"application/json"},body:JSON.stringify({type:importDataType.value,importMode:getSelectedImportMode(),importSessionId:importPreviewSessionId,
selectedOrderCodes:selectedRows.map(r=>String(r.documentCode||r.orderCode||r.code||r.username||"").trim()).filter(Boolean),
selectedRowNumbers:selectedRows.map((r,index)=>getImportRowSourceNumber(r,index)).filter(Boolean),
selectedRowKeys:selectedRows.map((r,index)=>getImportRowSelectKey(r,index)).filter(Boolean),shortageMode:importShortageActionMode||"cut"})});let json=await res.json().catch(()=>({
ok:false,message:`API import không trả JSON hợp lệ (HTTP ${res.status})`}));if(!json.ok)throw new Error(json.error||json.message||"Import thất bại");if(json.accepted&&json.jobId){
showMessage(importDataMessage,`Đã tạo job ${json.jobId}. Tác vụ nền đang xử lý...`);json=await waitForAsyncImportCommit(importPreviewSessionId,json.jobId)}
const shortageText=json.shortageReport&&json.shortageReport.length?` · Đã tự cắt ${displayImportAggregateQty(json.shortageSummary?.totalMissingQty||0)} sản phẩm thiếu (${money(json.shortageSummary?.totalCutAmount||0)})`:""
;const durationMs=Number(json.performance&&json.performance.durationMs||0);const performanceText=durationMs>0?` · ${Math.max(.1,durationMs/1e3).toFixed(1)} giây`:""
;const savedReportText=json.shortageReportSaved&&json.shortageReportCode?` · Đã lưu báo cáo ${json.shortageReportCode}`:""
;showMessage(importDataMessage,(json.message||"Import thành công")+shortageText+savedReportText+performanceText);const reportRows=(json.shortageReport||[]).slice(0,80)
;if(importPreviewTable){if(reportRows.length){
importPreviewTable.innerHTML=reportRows.map(r=>`\n          <tr>\n            <td>${escapeImportHtml(r.documentCode||"")}</td>\n            <td>${escapeImportHtml(r.customerName||r.customerCode||"")}</td>\n            <td>${escapeImportHtml(r.productCode||"")}</td>\n            <td>${escapeImportHtml(r.productName||"")}</td>\n            <td>${displayImportQtyTL(r.missingQuantity||0,r)}</td>\n            <td>${money(r.cutAmount||0)}</td>\n          </tr>\n        `).join("")
;if(importPreviewHead)importPreviewHead.innerHTML="<tr><th>Mã đơn</th><th>Khách hàng</th><th>Mã SP</th><th>Tên SP</th><th>SL thiếu</th><th>Giá trị cắt</th></tr>"}else{
importPreviewTable.innerHTML=`<tr><td colspan="6">Import thành công. Không có hàng vượt tồn.</td></tr>`
;if(importPreviewHead)importPreviewHead.innerHTML='<tr><th colspan="6">Báo cáo import</th></tr>'}}importPreviewRows=[];if(commitImportButton){commitImportButton.disabled=true
;commitImportButton.textContent="Import ngay"}if(importDataType.value==="salesOrders"){if(salesOrderSourceFilter)salesOrderSourceFilter.value="DMS"}
await refreshAfterImport(importDataType.value);if(importDataType.value==="salesOrders")await loadImportShortageReports()}catch(err){if(commitImportButton){
commitImportButton.disabled=false;if(commitImportButton.dataset.originalText)commitImportButton.textContent=commitImportButton.dataset.originalText}
showMessage(importDataMessage,err.message,true)}finally{stopProgressPolling()}}let activeImportShortageReport=null;function importShortageStatusLabel(status){
return status==="resolved"?"Đã xử lý":status==="in_review"?"Đang đối soát":"Chưa đối soát"}function importShortageItemStatusLabel(status){
return status==="resolved"?"Đã xử lý":status==="verified"?"Đã kiểm tra":"Chưa kiểm tra"}function formatImportReportDate(value){if(!value)return"";const d=new Date(value)
;if(Number.isNaN(d.getTime()))return String(value)
;return`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}function csvCell(value){const text=String(value==null?"":value);return`"${text.replace(/"/g,'""')}"`}async function loadImportShortageReports(){
const table=document.getElementById("importShortageReportTable");if(!table)return;const status=document.getElementById("importShortageReportStatusFilter")?.value||""
;const search=document.getElementById("importShortageReportSearch")?.value||"";table.innerHTML='<tr><td colspan="9">Đang tải báo cáo...</td></tr>';try{
const params=new URLSearchParams({limit:"200"});if(status)params.set("status",status);if(search)params.set("search",search)
;const res=await fetch(`/api/import/shortage-reports?${params.toString()}`);const json=await res.json()
;if(!json.ok)throw new Error(json.message||"Không tải được báo cáo hàng thiếu");const rows=Array.isArray(json.reports)?json.reports:[]
;table.innerHTML=rows.length?rows.map(report=>`<tr>\n      <td><strong>${escapeHtml(report.code||"")}</strong></td>\n      <td>${escapeHtml(formatImportReportDate(report.importDate||report.createdAt))}</td>\n      <td>${escapeHtml((report.fileNames||[]).join(", ")||"")}</td>\n      <td class="number">${formatNumber(report.orderCount||0)}</td>\n      <td class="number">${formatNumber(report.productCount||0)}</td>\n      <td class="number">${displayImportAggregateQty(report.totalMissingQuantity||0)}</td>\n      <td class="number">${money(report.totalCutAmount||0)}</td>\n      <td><span class="status-badge ${report.status==="resolved"?"success":report.status==="in_review"?"warning":"danger"}">${importShortageStatusLabel(report.status)}</span></td>\n      <td><button type="button" class="secondary view-import-shortage-report" data-id="${escapeHtml(report._id||"")}">Chi tiết</button></td>\n    </tr>`).join(""):'<tr><td colspan="9">Chưa có báo cáo hàng thiếu nào.</td></tr>'
}catch(err){table.innerHTML=`<tr><td colspan="9">${escapeHtml(err.message)}</td></tr>`}}function closeImportShortageReportModal(){
const modal=document.getElementById("importShortageReportModal");if(modal)modal.hidden=true;activeImportShortageReport=null}function renderImportShortageReportDetail(report){
activeImportShortageReport=report;const modal=document.getElementById("importShortageReportModal");const title=document.getElementById("importShortageReportModalTitle")
;const meta=document.getElementById("importShortageReportModalMeta");const summary=document.getElementById("importShortageReportModalSummary")
;const status=document.getElementById("importShortageReportEditStatus");const note=document.getElementById("importShortageReportEditNote")
;const body=document.getElementById("importShortageReportDetailTable");if(title)title.textContent=`Báo cáo hàng thiếu ${report.code||""}`
;if(meta)meta.textContent=`Import ${formatImportReportDate(report.importDate||report.createdAt)} · ${(report.fileNames||[]).join(", ")}`
;if(summary)summary.innerHTML=`<span>Đơn: <strong>${formatNumber(report.orderCount||0)}</strong></span><span>Sản phẩm: <strong>${formatNumber(report.productCount||0)}</strong></span><span>Số lượng thiếu: <strong>${displayImportAggregateQty(report.totalMissingQuantity||0)}</strong></span><span>Giá trị cắt: <strong>${money(report.totalCutAmount||0)}</strong></span>`
;if(status)status.value=report.status||"open";if(note)note.value=report.note||"";if(body){const items=Array.isArray(report.items)?report.items:[]
;body.innerHTML=items.length?items.map(item=>`<tr data-item-id="${escapeHtml(item._id||"")}">\n      <td>${escapeHtml(item.documentCode||"")}</td>\n      <td>${escapeHtml([item.customerCode,item.customerName].filter(Boolean).join(" - "))}</td>\n      <td>${escapeHtml(item.productCode||"")}</td>\n      <td>${escapeHtml(item.productName||"")}</td>\n      <td class="number">${displayImportQtyTL(item.requestedQuantity||0,item)}</td>\n      <td class="number">${displayImportQtyTL(item.availableQuantity||0,item)}</td>\n      <td class="number"><strong>${displayImportQtyTL(item.missingQuantity||0,item)}</strong></td>\n      <td class="number">${money(item.cutAmount||0)}</td>\n      <td><select class="shortage-item-status"><option value="open" ${item.reconciliationStatus==="open"?"selected":""}>Chưa kiểm tra</option><option value="verified" ${item.reconciliationStatus==="verified"?"selected":""}>Đã kiểm tra</option><option value="resolved" ${item.reconciliationStatus==="resolved"?"selected":""}>Đã xử lý</option></select></td>\n      <td><input class="shortage-item-note" value="${escapeHtml(item.reconciliationNote||"")}" placeholder="Ghi chú đối soát" /></td>\n    </tr>`).join(""):'<tr><td colspan="10">Báo cáo không có dòng hàng thiếu.</td></tr>'
}if(modal)modal.hidden=false}async function openImportShortageReport(id){try{const res=await fetch(`/api/import/shortage-reports/${encodeURIComponent(id)}`)
;const json=await res.json();if(!json.ok)throw new Error(json.message||"Không tải được chi tiết báo cáo");renderImportShortageReportDetail(json.report)}catch(err){
showMessage(importDataMessage,err.message,true)}}async function saveImportShortageReport(){if(!activeImportShortageReport?._id)return
;const button=document.getElementById("saveImportShortageReportButton");const rows=Array.from(document.querySelectorAll("#importShortageReportDetailTable tr[data-item-id]"))
;const items=rows.map(row=>({id:row.dataset.itemId,reconciliationStatus:row.querySelector(".shortage-item-status")?.value||"open",
reconciliationNote:row.querySelector(".shortage-item-note")?.value||""}));if(button)button.disabled=true;try{
const res=await fetch(`/api/import/shortage-reports/${encodeURIComponent(activeImportShortageReport._id)}`,{method:"PATCH",headers:{"Content-Type":"application/json",
Prefer:"respond-async"},body:JSON.stringify({status:document.getElementById("importShortageReportEditStatus")?.value||"open",
note:document.getElementById("importShortageReportEditNote")?.value||"",items:items})});const json=await res.json()
;if(!json.ok)throw new Error(json.message||"Không lưu được đối soát");renderImportShortageReportDetail(json.report);await loadImportShortageReports()
;showMessage(importDataMessage,`Đã lưu đối soát báo cáo ${json.report?.code||""}`)}catch(err){showMessage(importDataMessage,err.message,true)}finally{
if(button)button.disabled=false}}function downloadActiveImportShortageReport(){const report=activeImportShortageReport;if(!report)return
;const headers=["Mã báo cáo","Ngày import","Mã đơn","Mã KH","Tên KH","Mã SP","Tên SP","SL yêu cầu","Tồn lúc import","SL thiếu","Giá trị cắt","Trạng thái đối soát","Ghi chú"]
;const lines=[headers.map(csvCell).join(",")]
;(report.items||[]).forEach(item=>lines.push([report.code,formatImportReportDate(report.importDate||report.createdAt),item.documentCode,item.customerCode,item.customerName,item.productCode,item.productName,item.requestedQuantity,item.availableQuantity,item.missingQuantity,item.cutAmount,importShortageItemStatusLabel(item.reconciliationStatus),item.reconciliationNote].map(csvCell).join(",")))
;const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url
;a.download=`${report.code||"bao-cao-hang-thieu"}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}resetButton.addEventListener("click",resetForm)
;if(downloadImportTemplateButton)downloadImportTemplateButton.addEventListener("click",downloadImportTemplate)
;if(previewImportButton)previewImportButton.addEventListener("click",previewImportExcel)
;if(commitImportButton)commitImportButton.addEventListener("click",typeof handleImportExcelAction==="function"?handleImportExcelAction:previewImportExcel)
;if(importExcelFile)importExcelFile.addEventListener("change",()=>{importPreviewRows=[];if(commitImportButton){commitImportButton.disabled=!importExcelFile.files.length
;commitImportButton.textContent="Xem trước đơn import"}if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Chọn file rồi bấm Xem trước đơn import.</td></tr>'
;resetImportPreviewMessage()});if(importDataType)importDataType.addEventListener("change",()=>{syncImportModeAvailability();resetImportPreviewForModeChange()})
;if(importDataMode)importDataMode.addEventListener("change",resetImportPreviewForModeChange);const importShortageReportTable=document.getElementById("importShortageReportTable")
;if(importShortageReportTable)importShortageReportTable.addEventListener("click",event=>{const button=event.target.closest(".view-import-shortage-report")
;if(button)openImportShortageReport(button.dataset.id)});const reloadImportShortageReportsButton=document.getElementById("reloadImportShortageReportsButton")
;if(reloadImportShortageReportsButton)reloadImportShortageReportsButton.addEventListener("click",loadImportShortageReports)
;const importShortageReportStatusFilter=document.getElementById("importShortageReportStatusFilter")
;if(importShortageReportStatusFilter)importShortageReportStatusFilter.addEventListener("change",loadImportShortageReports)
;const importShortageReportSearch=document.getElementById("importShortageReportSearch");if(importShortageReportSearch)importShortageReportSearch.addEventListener("keydown",event=>{
if(event.key==="Enter")loadImportShortageReports()})
;document.querySelectorAll("[data-close-import-shortage-report]").forEach(button=>button.addEventListener("click",closeImportShortageReportModal))
;const saveImportShortageReportButton=document.getElementById("saveImportShortageReportButton")
;if(saveImportShortageReportButton)saveImportShortageReportButton.addEventListener("click",saveImportShortageReport)
;const downloadImportShortageReportButton=document.getElementById("downloadImportShortageReportButton")
;if(downloadImportShortageReportButton)downloadImportShortageReportButton.addEventListener("click",downloadActiveImportShortageReport);loadImportShortageReports()
;syncImportModeAvailability();
