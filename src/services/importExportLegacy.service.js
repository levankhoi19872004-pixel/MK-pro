/* GENERATED FILE — edit src/services/importExportLegacy.service.source/part-01.jsfrag, src/services/importExportLegacy.service.source/part-02.jsfrag, src/services/importExportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{createWorkbook:o,appendAoaSheet:n,writeWorkbook:t}=require("../utils/excelWriter.util"),a=require("./excelImportService"),r=require("./import-template/LegacyImportTemplateAdapter"),i=require("../repositories/exportRepository"),u=require("../models/SalesOrder"),c=require("../models/ReturnOrder"),s=require("../models/Customer"),d=require("../models/Product"),h=require("./excel/ProductExcelEnrichmentService"),{INVOICE_TYPES:T,normalizeInvoiceType:l,resolveInvoiceType:m,isActiveInvoiceOrder:g}=require("./invoiceExportClassifier"),p=require("../models"),f=require("./reportService"),y=require("./reports/ReportCenterService"),{LEGACY_EXPORT_TYPE_TO_REPORT_CODE:S,reportCodeForLegacyExport:C}=require("./reports/ReportLegacyExportMap"),{pickSalesStaffCode:N,pickSalesStaffName:D,pickDeliveryStaffCode:M,pickDeliveryStaffName:A}=require("../domain/staff/staffIdentity"),{normalizePickingZone:v,pickingZoneFrom:H,pickingZoneLabel:K,PICKING_ZONES:b}=require("../utils/pickingZone.util"),P=require("./sseInvoiceExport.service"),k=require("./invoiceExportQuery.service"),V=require("./invoiceNetSales.service")
;function x(e={}){const o={...e};return delete o._id,delete o.__v,o}function R(e){return null==e?"":Array.isArray(e)||"object"==typeof e?JSON.stringify(e):e}function G(e=[]){
const o=e.map(x),n=new Set;o.forEach(e=>Object.keys(e).forEach(e=>n.add(e)));const t=Array.from(n),a=o.map(e=>t.map(o=>R(e[o])));return{headers:t,body:a}}function w(e=""){
return"products"===L(e).toLowerCase()?["productCode","code","sku","barcode"]:h.PRODUCT_CODE_KEYS}async function B({type:e,rows:a}){const r=w(e),i=await h.enrichRows(a,{
productCodeKeys:r,packingKey:"Quy cách",salePriceKey:"Giá bán"}),{headers:u,body:c}=G(i.rows),s=o();n(s,"Export",[u,...c]);const d=h.documentProductLines(a);if(d.length){
const e=(await h.enrichRows(d,{packingKey:"Quy cách",salePriceKey:"Giá bán"})).rows.map(e=>({MaChungTu:e.documentCode,MaSP:Z(e),SanPham:W(e),"Quy cách":e["Quy cách"],
"Giá bán":e["Giá bán"],SoLuong:Y(e),GiaSauKM:_(e.finalPrice??e.priceAfterPromotion??e.discountedPrice??""),ThanhTien:ne(e)
})),o=["MaChungTu","MaSP","SanPham","Quy cách","Giá bán","SoLuong","GiaSauKM","ThanhTien"];n(s,"ChiTietSanPham",[o,...e.map(e=>o.map(o=>e[o]??""))])}
return n(s,"ThongTin",[["Loại dữ liệu",e],["Số dòng",a.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc sản phẩm","Nếu có sản phẩm: Quy cách là số lượng đóng gói; Giá bán lấy từ danh mục sản phẩm. Đơn con giữ thêm Giá sau KM."]]),
t(s)}
const O=.08,{extractCustomerTaxProfile:E}=require("../utils/customerTaxProfile.util"),{extractCustomerBusinessProfile:Q}=require("../utils/customerBusinessProfile.util"),I=["STT","NgayHoaDon","MaKhachHang","TenKhachHang","TenNguoiMua","MaSoThue","DiaChiKhachHang","DienThoaiKhachHang","SoTaiKhoan","NganHang","HinhThucTT","MaSanPham","SanPham","DonViTinh","Extra1SP","Extra2SP","SoLuong","DonGia","TyLeChietKhau","SoTienChietKhau","ThanhTien","TienBan","ThueSuat","TienThueSanPham","TienThue","TongCong","TinhChatHangHoa","DonViTienTe","TyGia","Fkey","Extra1","Extra2","EmailKhachHang","VungDuLieu","Extra3","Extra4","Extra5","Extra6","Extra7","Extra8","Extra9","Extra10","Extra11","Extra12","LDDNBo","HDSo","HVTNXHang","TNVChuyen","PTVChuyen","HDKTNgay","HDKTSo","CCCDan","Extra13","Extra14","mau_01"]
;function L(e){return String(e??"").trim()}function _(e,o=0){const n=Number(String(e??"").replace(/,/g,""));return Number.isFinite(n)?n:o}function q(e,o=2){const n=10**o
;return Math.round(_(e)*n)/n}function j(o){return e.toDateOnly(o||"")||L(o).slice(0,10)}function $(e,o={}){
const n=j(e),t=j(o.dateFrom||o.from||o.fromDate||""),a=j(o.dateTo||o.to||o.toDate||"");return!(t&&n<t||a&&n>a)}function F(e={}){return g(e)}function X(e={}){
return[e.id,e._id,e.code,e.orderCode,e.documentCode,e.salesOrderId,e.salesOrderCode,e.externalOrderCode,e.invoiceCode,e.refCode].map(L).filter(Boolean)}function U(e={}){
return L(e.code||e.orderCode||e.salesOrderCode||e.documentCode||e.id||e._id)}function Z(e={}){return L(e.productCode||e.code||e.sku||e.barcode||e.productId||e.id)}function W(e={}){
return L(e.productName||e.name||e.itemName||e.productTitle||"")}function z(e={},o={}){return L(e.unit||e.baseUnit||e.dvt||e.uom||o.unit||o.baseUnit||"")}function Y(e={}){
return _(e.quantity??e.qty??e.totalQty??e.qtySale??e.saleQty??0)}function J(e={}){return _(e.returnQty??e.qtyReturn??e.returnQuantity??e.returnedQty??0)}function ee(e={}){
return L(e.lineKey||e.orderLineId||e.salesOrderItemId||e.itemId||e._id||"")}function oe(e={}){
return _(e.finalPrice??e.priceAfterPromotion??e.promoPrice??e.price??e.salePrice??e.unitPrice??e.sellPrice??0)}function ne(e={}){
return _(e.amount??e.totalAmount??e.lineAmount??e.money??0)||Y(e)*oe(e)}function te(e,o){return`${L(e)}@@${L(o)}`}function ae(e={}){const o=oe(e);return o?String(q(o,6)):""}
function re(e,o,n="",t=""){return[L(e),L(o),L(n),L(t)].join("@@")}function ie(e={}){return L(e.code||e.id||e.returnOrderCode||e.documentCode||e._id)}function ue(e={}){
return L(e.id||e._id||e.code||e.returnOrderCode||e.documentCode)}function ce(e={}){
const o=e.updatedAt||e.modifiedAt||e.createdAt||e.date||e.documentDate||"",n=o?new Date(o).getTime():0;return Number.isFinite(n)?n:0}function se(){return{status:{
$nin:["void","cancelled","canceled","deleted","removed"]},returnStatus:{$nin:["void","cancelled","canceled","deleted","removed"]}}}function de(e,o,n,t={}){if(!o||!n)return
;e.set(o,_(e.get(o))+n),e.__sourceMap||(e.__sourceMap=new Map);const a=e.__sourceMap.get(o)||{codes:new Set,ids:new Set,sourceRows:[]};t.code&&a.codes.add(t.code),
t.id&&a.ids.add(t.id),t.sourceRow&&a.sourceRows.push(t.sourceRow),e.__sourceMap.set(o,a)}function he(e,o){const n=e&&e.__sourceMap;if(!n)return{ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const t=n.get(o);if(!t)return{ReturnOrderCode:"",ReturnOrderId:"",ReturnQtySource:""}
;const a=Array.from(t.codes||[]).filter(Boolean),r=Array.from(t.ids||[]).filter(Boolean),i=Array.from(t.sourceRows||[]).filter(Boolean);return{ReturnOrderCode:a.join(", "),
ReturnOrderId:r.join(", "),ReturnQtySource:i.join(" | ")}}function Te(e=[]){const o=new Map,n=new Map;for(const o of e||[]){if(!F(o))continue
;const e=ie(o),t=ue(o),a=ce(o),r=Array.from(new Set([o.salesOrderId,o.orderId,o.sourceOrderId,o.deliveryOrderId,o.salesOrderCode,o.orderCode,o.sourceOrderCode,o.deliveryOrderCode,o.originalOrderCode].map(L).filter(Boolean)))
;if(!r.length)continue;const i=L(o.salesOrderCode||o.orderCode||o.salesOrderId||o.orderId||r[0]);for(const u of Array.isArray(o.items)?o.items:[]){const o=Z(u);if(!o)continue
;const c=J(u);if(!c)continue;const s=ee(u),d=ae(u),h=`${e||t||"RETURN_ORDER"}:${i}:${o}:${c}`,T=[e||t,i,o,s||"",d||""].map(L).join("@@"),l={roKeys:r,pcode:o,qty:c,lineKey:s,
priceKey:d,roCode:e,roId:t,updatedMs:a,sourceRow:h},m=n.get(T);(!m||a>=m.updatedMs)&&n.set(T,l)}}for(const e of n.values()){
const{roKeys:n,pcode:t,qty:a,lineKey:r,priceKey:i,roCode:u,roId:c,sourceRow:s}=e,d={code:u,id:c,sourceRow:s}
;for(const e of n)de(o,r&&i?re(e,t,r,i):r?re(e,t,r,""):i?re(e,t,"",i):te(e,t),a,d)}return o}function le(e,o={},n={}){const t=Z(n);if(!t)return{qty:0,ReturnOrderCode:"",
ReturnOrderId:"",ReturnQtySource:""};const a=ee(n),r=ae(n);let i={qty:0,key:""};for(const n of X(o)){
const o=[a&&r?re(n,t,a,r):"",a?re(n,t,a,""):"",r?re(n,t,"",r):"",te(n,t)].filter(Boolean);for(const n of o){const o=_(e.get(n));if(o>i.qty&&(i={qty:o,key:n}),o)break}}return{
qty:i.qty,...he(e,i.key)}}function me(e,o={},n={}){return le(e,o,n).qty}function ge(e={}){return L(e.customerCode||e.customerId||e.customerName||e.customerPhone||"")}
function pe(e=[]){const o=new Map;for(const n of e||[])[n.code,n.customerCode,n.id,n._id,n.name,n.customerName,n.phone,n.mobile].map(L).filter(Boolean).forEach(e=>o.set(e,n))
;return o}function fe(e=[]){const o=new Map;for(const n of e||[])[n.code,n.productCode,n.sku,n.barcode,n.id,n._id].map(L).filter(Boolean).forEach(e=>o.set(e,n));return o}
function ye(e={},o=new Map){
const n=o.get(L(e.customerCode))||o.get(L(e.customerId))||o.get(L(e.customerName))||{},t=E(e),a=E(n),r=Q(e),i=Q(n),u=L(e.customerName||n.name||n.customerName),c=L(r.businessName||i.businessName)
;return{code:L(e.customerCode||n.code||n.customerCode||e.customerId||n.id),name:c||u,buyer:L(e.buyerName||e.contactName||n.buyerName||n.representative||n.contactName||u),
taxCode:L(t.taxCode||a.taxCode),address:L(t.taxInvoiceAddress||a.taxInvoiceAddress||e.customerAddress||e.address||n.address||n.deliveryAddress),
phone:L(e.customerPhone||e.phone||n.phone||n.mobile),bankAccount:L(n.bankAccount||n.accountNumber||e.bankAccount),bankName:L(n.bankName||e.bankName),
email:L(n.email||e.customerEmail||e.email)}}function Se(e={}){const o=L(e.paymentMethod||e.paymentType||e.method||e.hinhThucTT||"");if(o)return o
;const n=_(e.cashAmount||e.collectedCashAmount),t=_(e.bankAmount||e.transferAmount||e.collectedBankAmount);return n&&t?"TM/CK":t?"CK":"TM/CK"}
function Ce({orders:o,returnOrders:n,customers:t,products:a,query:r={}}){const i=pe(t),u=fe(a),c=[],s=[],d=[];let l=0
;const g=(o||[]).filter(F).filter(e=>m(e)===T.VAT).filter(e=>k.matchesInvoiceExportFilters(e,r,{invoiceGroup:T.VAT})).filter(e=>{if(!r.customerCode&&!r.customerId)return!0
;const o=L(r.customerCode||r.customerId);return[e.customerCode,e.customerId,e.customerName].map(L).includes(o)
}).sort((e,o)=>L(e.orderDate||e.date||e.documentDate||e.createdAt).localeCompare(L(o.orderDate||o.date||o.documentDate||o.createdAt))||U(e).localeCompare(U(o))),p=V.buildNetSaleDataset({
orders:g,returnOrders:n,isEligibleReturnOrder:k.isEligibleReturnOrder});for(const o of p.orders){
const n=o.order,t=[],a=ye(n,i),r=U(n),T=j(n.orderDate||n.date||n.documentDate||n.createdAt||e.todayVN());for(const e of o.lines){
const o=e.item,n=e.productCode,a=u.get(n)||{},i=W(o)||L(a.name||a.productName),c=e.soldQty,s=e.returnedQty,T=e.netQty,l=oe(o)||(c?ne(o)/c:0),m=V.sourceSummary(e);if(!n||T<=0){
n||d.push({code:"MISSING_PRODUCT_CODE",orderCode:r,message:"Dòng bán thiếu productCode nên không thể đưa vào dataset hóa đơn."});continue}const g=q(l/1.08,6),p=q(T*g,2);t.push({
productCode:n,productName:i,unit:z(o,a),catalogPackingQty:h.catalogPackingQty(a),catalogSalePrice:h.catalogSalePrice(a),soldQty:c,returnQty:s,safeReturnQty:s,invoiceQty:T,
priceInclVat:l,unitPriceBeforeVat:g,lineAmountBeforeVat:p,returnOrderCode:m.ReturnOrderCode,returnOrderId:m.ReturnOrderId,returnQtySource:m.ReturnQtySource})}
if(!t.length||o.fullyReturned)continue;l+=1;const m=q(t.reduce((e,o)=>e+o.lineAmountBeforeVat,0),2),g=q(m*O,2),p=Math.round(m+g);p<=0||t.forEach((e,o)=>{const t=0===o;c.push({
STT:t?l:"",NgayHoaDon:t?T:"",MaKhachHang:t?a.code:"",TenKhachHang:t?a.name:"",TenNguoiMua:t?a.buyer:"",MaSoThue:t?a.taxCode:"",DiaChiKhachHang:t?a.address:"",
DienThoaiKhachHang:t?a.phone:"",SoTaiKhoan:t?a.bankAccount:"",NganHang:t?a.bankName:"",HinhThucTT:t?Se(n):"",MaSanPham:e.productCode,SanPham:e.productName,DonViTinh:e.unit,
Extra1SP:e.catalogPackingQty,Extra2SP:e.catalogSalePrice,SoLuong:e.invoiceQty,DonGia:e.unitPriceBeforeVat,TyLeChietKhau:"",SoTienChietKhau:"",ThanhTien:e.lineAmountBeforeVat,
TienBan:t?m:"",ThueSuat:t?8:"",TienThueSanPham:"",TienThue:t?g:"",TongCong:t?p:"",TinhChatHangHoa:0,DonViTienTe:t?"VND":"",TyGia:"",Fkey:r,Extra1:"",Extra2:"",
EmailKhachHang:t?a.email:"",VungDuLieu:"",Extra3:"",Extra4:"",Extra5:"",Extra6:"",Extra7:"",Extra8:"",Extra9:"",Extra10:"",Extra11:"",Extra12:"",LDDNBo:"",HDSo:"",HVTNXHang:"",
TNVChuyen:"",PTVChuyen:"",HDKTNgay:"",HDKTSo:"",CCCDan:""}),s.push({MaDon:r,MaKhachHang:a.code,TenKhachHang:a.name,MaSoThue:a.taxCode,DiaChiHoaDon:a.address,
MaSanPham:e.productCode,SanPham:e.productName,"Quy cách":e.catalogPackingQty,"Giá bán":e.catalogSalePrice,SoLuongBan:e.soldQty,SoLuongTra:e.returnQty,
SoLuongTraAnToan:e.safeReturnQty,SoLuongXuatHoaDon:e.invoiceQty,GiaSauKhuyenMaiCoVAT:e.priceInclVat,DonGiaTruocVAT:e.unitPriceBeforeVat,ThanhTienTruocVAT:e.lineAmountBeforeVat,
ReturnOrderCode:e.returnOrderCode,ReturnOrderId:e.returnOrderId,ReturnQtySource:e.returnQtySource,LyDoBoDong:""})})}return{rows:c,auditRows:s,warnings:[...p.warnings,...d]}}
async function Ne(o={},n={}){const t=k.normalizeExportQuery(o,{invoiceGroup:T.VAT
}),a=t.dateFrom||"0000-01-01",r=t.dateTo||"9999-12-31",{orders:i,returnOrders:u,customers:c,products:s}=await k.loadInvoiceExportData({query:o,invoiceGroup:T.VAT,currentUser:n
}),{rows:d,auditRows:h,warnings:l=[]}=Ce({orders:i,returnOrders:u,customers:c,products:s,query:o});if(!d.length)return{
error:"Không có đơn VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",status:404,code:"INVOICE_EXPORT_NO_DATA"}
;const m=d.reduce((e,o)=>(""!==o.TienBan&&(e.invoiceCount+=1,e.amountBeforeVat+=_(o.TienBan),e.vatAmount+=_(o.TienThue),e.totalAmount+=_(o.TongCong)),e.lineCount+=o.MaSanPham?1:0,
e),{invoiceCount:0,lineCount:0,amountBeforeVat:0,vatAmount:0,totalAmount:0}),{buildVnptTt78WorkbookFromTemplate:g}=require("./invoice/VnptTt78TemplateExportService"),p=await g({
rows:d,auditRows:h,
auditHeaders:["MaDon","MaKhachHang","TenKhachHang","MaSoThue","DiaChiHoaDon","MaSanPham","SanPham","Quy cách","Giá bán","SoLuongBan","SoLuongTra","SoLuongTraAnToan","SoLuongXuatHoaDon","GiaSauKhuyenMaiCoVAT","DonGiaTruocVAT","ThanhTienTruocVAT","ReturnOrderCode","ReturnOrderId","ReturnQtySource","LyDoBoDong"],
summary:m,dateFrom:a,dateTo:r,warnings:l}),f="0000-01-01"===a?"all":a,y="9999-12-31"===r?e.todayVN():r;return{buffer:p,rows:d.length,orderCount:m.invoiceCount,
warningCount:l.length,warnings:l.slice(0,100),fileName:`Hoa_don_VAT_TT78_${f}_${y}.xlsx`}}function De(e={}){
return[L(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH),L(e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName)].filter(Boolean).join(" - ")
}function Me(e={}){return L(e.orderSourceName||e.orderSource||e.source||e.sourceType||e.importSource||"")}async function Ae(a={},r={}){const i=k.normalizeExportQuery(a,{
invoiceGroup:T.NON_VAT}),u=i.dateFrom||"0000-01-01",c=i.dateTo||"9999-12-31",{orders:s,returnOrders:d,customers:l,products:g}=await k.loadInvoiceExportData({query:a,
invoiceGroup:T.NON_VAT,currentUser:r}),p=(s||[]).filter(F).filter(e=>m(e)===T.NON_VAT).filter(e=>k.matchesInvoiceExportFilters(e,a,{invoiceGroup:T.NON_VAT
})),f=Te(d),y=pe(l),S=fe(g),C=[],N=[];let D=0,M=0,A=0;p.forEach((e,o)=>{const n=ye(e,y),t=U(e);let a=0,r=0;for(const o of Array.isArray(e.items)?e.items:[]){
const n=Z(o),i=S.get(n)||{},u=Y(o),c=Math.min(u,me(f,e,o)),s=Math.max(0,u-c),d=oe(o)||(u?ne(o)/u:0),T=q(s*d,2);a+=q(c*d,2),r+=T,N.push({"Mã đơn":t,"Mã sản phẩm":n,
"Tên sản phẩm":W(o)||L(i.name||i.productName),"Quy cách":h.catalogPackingQty(i),"Giá bán":h.catalogSalePrice(i),"Số lượng bán":u,"Số lượng trả":c,"Số lượng còn lại":s,"Đơn giá":d,
"Thành tiền":T})}const i=_(e.totalAmount||e.grandTotal||0),u=_(e.paidAmount||e.paymentAmount||0),c=_(e.debtAmount??Math.max(0,i-u));D+=i,M+=a,A+=r,C.push({STT:o+1,
"Ngày bán":j(e.orderDate||e.date||e.documentDate||e.createdAt),"Mã đơn":t,"Mã khách hàng":n.code,"Tên khách hàng":n.name,NVBH:De(e),"Nguồn đơn":Me(e),"Giá trị đơn":i,
"Tiền đã thu":u,"Công nợ":c,"Lý do không xuất":L(e.vatInvoiceNote),"Người thay đổi":L(e.vatInvoiceUpdatedBy),"Thời gian thay đổi":L(e.vatInvoiceUpdatedAt)})})
;const v=N.filter(e=>Number(e["Số lượng còn lại"])>0);if(!C.length||!v.length)return{error:"Không có đơn không VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",
status:404,code:"INVOICE_EXPORT_NO_DATA"};const H=o()
;Pe(H,"DanhSachDon",["STT","Ngày bán","Mã đơn","Mã khách hàng","Tên khách hàng","NVBH","Nguồn đơn","Giá trị đơn","Tiền đã thu","Công nợ","Lý do không xuất","Người thay đổi","Thời gian thay đổi"],C),
Pe(H,"ChiTietHang",["Mã đơn","Mã sản phẩm","Tên sản phẩm","Quy cách","Giá bán","Số lượng bán","Số lượng trả","Số lượng còn lại","Đơn giá","Thành tiền"],N),
n(H,"ThongTin",[["Từ ngày","0000-01-01"===u?"":u],["Đến ngày","9999-12-31"===c?"":c],["Số đơn không xuất hóa đơn",C.length],["Tổng giá trị đơn",q(D,2)],["Tổng hàng trả",q(M,2)],["Giá trị còn lại",q(A,2)]])
;const K=t(H),b="0000-01-01"===u?"all":u,P="9999-12-31"===c?e.todayVN():c,V=b===P?b:`${b}_${P}`;return{buffer:K,rows:v.length,orderCount:C.length,
fileName:`Hoa_don_khong_VAT_${V}.xlsx`}}
const ve=["sales-report","delivery-report","return-report","debt-report","ar-ledger-detail","stock-report","inventory-movement-report","stock-card-report","fund-report","salesman-report","deliveryman-report","customer-sales-report","product-sales-report","product-info-report","customer-info-report","user-info-report"]
;function He(e={}){return{from:j(e.dateFrom||e.from||e.fromDate||""),to:j(e.dateTo||e.to||e.toDate||"")}}function Ke(e={},o=["date","createdAt"]){const{from:n,to:t}=He(e)
;return n||t?{$or:o.map(e=>({[e]:{...n?{$gte:n}:{},...t?{$lte:"createdAt"===e?`${t}T23:59:59.999Z`:t}:{}}}))}:{}}function be(e={}){
return Math.min(Math.max(Number(e.limit||1e5),1),2e5)}function Pe(e,o,t,a){const r=a.map(e=>t.map(o=>e[o]??""));n(e,String(o||"BaoCao").slice(0,31),[t,...r])}function ke(e=""){
return{"stock-report":"Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.",
"inventory-movement-report":"Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.",
"stock-card-report":"Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.",
"sales-report":"Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.",
"return-report":"Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.","debt-report":"Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.",
"ar-ledger-detail":"Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.","fund-report":"Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.",
"delivery-report":"Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.",
"product-info-report":"Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.",
"customer-info-report":"Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán."
}[e]||"Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống."}async function Ve(a,r,i,u,c={},s=null){const d=await h.enrichRows(u,{packingKey:"Quy cách",
salePriceKey:"Giá bán"}),T=[...i];d.hasProducts&&(T.includes("Quy cách")||T.push("Quy cách"),T.includes("Giá bán")||T.push("Giá bán"));const l=o();if(s){
const e=[s.service,s.serviceMethod].filter(Boolean).join(".")
;n(l,"THÔNG TIN NGUỒN",[["Trường","Giá trị"],["Mã báo cáo",s.reportCode||""],["Service",e],["Nguồn chính",(s.primaryCollections||[]).join(", ")],["Quy tắc SSoT",s.ssotRule||s.sourceLabel||""],["Xem và xuất cùng nguồn",s.viewAndExportSameSource?"Có":"Không"],["Trạng thái nguồn",s.sourceStatus||"OK"]])
}Pe(l,r,T,d.rows);const{from:m,to:g}=He(c)
;n(l,"ThongTin",[["Mẫu báo cáo",r],["Từ ngày",m],["Đến ngày",g],["Số dòng",d.rows.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc nghiệp vụ",ke(a)]])
;const p=String(a||"report").replace(/[^a-zA-Z0-9_-]/g,"-"),f=`${m||"all"}_${g||e.todayVN()}`;return{buffer:t(l),rows:d.rows.length,fileName:`${p}_${f}.xlsx`}}function xe(e={}){
return Array.isArray(e.items)?e.items:[]}function Re(e={}){return xe(e).reduce((e,o)=>e+Y(o),0)||_(e.totalQuantity||e.quantity||0)}function Ge(e={},o={}){
return _(e.originalPrice??e.basePrice??e.listPrice??o.salePrice??e.salePrice??e.price??e.unitPrice??0)}function we(e={},o={}){return Y(e)*Ge(e,o)}function Be(e={}){
return _(e.finalAmount??e.amount??e.totalAmount??e.lineAmount??0)||Y(e)*oe(e)}function Oe(e={},o=new Map){
return xe(e).reduce((e,n)=>e+we(n,o.get(Z(n))||{}),0)||_(e.beforePromoAmount||e.grossAmount||e.totalBeforeDiscount||e.totalAmount||0)}function Ee(e={}){
return _(e.afterPromoAmount||e.totalAfterPromotion||e.totalAmount||e.amount||0)}function Qe(e={},o="sales"){return L("delivery"===o?A(e):D(e))}function Ie(e={},o="sales"){
return L("delivery"===o?M(e):N(e))}async function Le(){const e=await d.find({}).select("code name salePrice conversionRate baseUnit unit brand category").lean()
;return new Map(e.map(e=>[L(e.code),e]))}async function _e(e={}){const o=((await f.salesReport({...e,full:"1",export:"1"})).sales||[]).map((e,o)=>({STT:o+1,Ngay:e.date,
MaDon:e.code,Nguon:e.source,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,
SoLuongBan:e.saleQuantity,SoLuongKhuyenMai:e.promoQuantity,DoanhSoTruocKM:Math.round(_(e.beforePromoAmount)),DoanhSoThucTe:Math.round(_(e.actualAmount)),
ChietKhauKM:Math.round(_(e.promotionDiscountAmount)),GiaTriHangKM:Math.round(_(e.promotionValue)),DaThuTheoAR:Math.round(_(e.receiptAmount)),
TraHangTheoAR:Math.round(_(e.returnAmount)),DieuChinhCongNo:Math.round(_(e.adjustmentAmount)),ConNoTheoAR:Math.round(_(e.debtAmount)),TrangThaiGiaoHang:e.deliveryStatus,
TrangThaiKeToan:e.accountingStatus}));return Ve("sales-report","BaoCaoBanHang",Object.keys(o[0]||{STT:"",Ngay:"",MaDon:"",Nguon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",
MaNVGH:"",NVGH:"",SoLuongBan:"",SoLuongKhuyenMai:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DieuChinhCongNo:"",
ConNoTheoAR:"",TrangThaiGiaoHang:"",TrangThaiKeToan:""}),o,e)}async function qe(e={}){const o=((await f.deliveryReport({...e,full:"1",export:"1"})).delivery||[]).map((e,o)=>({
STT:o+1,NgayGiao:e.deliveryDate,MaDonTong:e.code,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoDonDangGan:e.assignedOrderCount,SoDonDaGiao:e.orderCount,
TongTienDonCon:Math.round(_(e.totalAmount)),DoanhSoDaXacNhan:Math.round(_(e.accountingConfirmedAmount)),TienThuTheoQuy:Math.round(_(e.collectedAmount)),TrangThai:e.status,
LechSoDonSnapshot:_(e.dataQuality?.snapshotOrderCountDifference),LechTienSnapshot:Math.round(_(e.dataQuality?.snapshotAmountDifference))}))
;return Ve("delivery-report","BaoCaoGiaoHang",Object.keys(o[0]||{STT:"",NgayGiao:"",MaDonTong:"",MaNVGH:"",NVGH:"",SoDonDangGan:"",SoDonDaGiao:"",TongTienDonCon:"",
DoanhSoDaXacNhan:"",TienThuTheoQuy:"",TrangThai:"",LechSoDonSnapshot:"",LechTienSnapshot:""}),o,e)}async function je(e={}){const o=((await f.returnReport({...e,full:"1",export:"1"
})).returns||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaTraHang:e.code,MaDon:e.salesOrderCode,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,
NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,GiaTriTra:Math.round(_(e.amount)),GiaTriChungTu:Math.round(_(e.documentAmount)),
GiaTriARReturn:Math.round(_(e.arAmount)),TrangThaiNhapKho:e.warehouseReceiveStatus,TrangThaiTraHang:e.returnState,TrangThaiKeToan:e.accountingStatus}))
;return Ve("return-report","BaoCaoTraHang",Object.keys(o[0]||{STT:"",Ngay:"",MaTraHang:"",MaDon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",GiaTriTra:"",
GiaTriChungTu:"",GiaTriARReturn:"",TrangThaiNhapKho:"",TrangThaiTraHang:"",TrangThaiKeToan:""}),o,e)}async function $e(e={}){const o=((await f.periodDebtReport({...e,full:"1",
export:"1",includePaid:"1"})).debts||[]).map((e,o)=>({STT:o+1,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,DuDauKy:Math.round(_(e.openingBalance)),PhatSinhNo:Math.round(_(e.debitInPeriod)),DaThu:Math.round(_(e.receiptInPeriod)),
TraHang:Math.round(_(e.returnInPeriod)),ChietKhauDieuChinh:Math.round(_(e.adjustmentInPeriod)+_(e.otherCreditInPeriod)),TongPhatSinhCo:Math.round(_(e.totalCreditInPeriod)),
DuCuoiKy:Math.round(_(e.closingBalance))}));return Ve("debt-report","BaoCaoCongNo",Object.keys(o[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",
DuDauKy:"",PhatSinhNo:"",DaThu:"",TraHang:"",ChietKhauDieuChinh:"",TongPhatSinhCo:"",DuCuoiKy:""}),o,e)}async function Fe(e={}){const o=((await f.arLedgerDetailReport({...e,
full:"1",export:"1"})).ledger||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaKhachHang:e.customerCode,KhachHang:e.customerName,ChungTu:e.documentCode,Loai:e.type,DienGiai:e.description,
DuTruocGiaoDich:Math.round(_(e.openingBalance)),No:Math.round(_(e.debit)),Co:Math.round(_(e.credit)),PhanLoaiCo:e.creditCategory,DuSauGiaoDich:Math.round(_(e.closingBalance))}))
;return Ve("ar-ledger-detail","SoCongNoChiTiet",Object.keys(o[0]||{STT:"",Ngay:"",MaKhachHang:"",KhachHang:"",ChungTu:"",Loai:"",DienGiai:"",DuTruocGiaoDich:"",No:"",Co:"",
PhanLoaiCo:"",DuSauGiaoDich:""}),o,e)}async function Xe(e={}){const o=((await f.stockReport({...e,full:"1",export:"1"})).stock||[]).map((e,o)=>({STT:o+1,
MaSP:L(e.productCode||e.code||e.productId),SanPham:L(e.productName||e.name),DonViTinh:L(e.unit||e.baseUnit),TonVatLy:_(e.onHand??e.quantity??e.qty),DaGiuCho:_(e.reservedQty),
TonKhaDung:_(e.availableQty)}));return Ve("stock-report","TonKhoHienTai",Object.keys(o[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonVatLy:"",DaGiuCho:"",TonKhaDung:""}),o,{})}
async function Ue(e={}){const o=((await f.inventoryMovementReport({...e,full:"1",export:"1",mode:"movement"})).stock||[]).map((e,o)=>({STT:o+1,MaSP:e.productCode,
SanPham:e.productName,DonViTinh:e.unit,TonDauKy:_(e.openingQty),NhapMua:_(e.importQty),HangTraNhapKho:_(e.returnQty),NhapKhac:_(e.otherInQty),TongNhap:_(e.inQty),
XuatBan:_(e.saleQty),XuatDaoChungTu:_(e.reversalOutQty),XuatKhac:_(e.otherOutQty),TongXuat:_(e.outQty),DieuChinhRong:_(e.adjustmentQty),TonCuoiKy:_(e.endingQty),
NguonTonCuoi:e.endingSource,TonCuoiTheoLedger:_(e.ledgerEndingQty),ChenhLechDoiSoat:_(e.reconciliationDifference)}))
;return Ve("inventory-movement-report","NhapXuatTon",Object.keys(o[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonDauKy:"",NhapMua:"",HangTraNhapKho:"",NhapKhac:"",TongNhap:"",
XuatBan:"",XuatDaoChungTu:"",XuatKhac:"",TongXuat:"",DieuChinhRong:"",TonCuoiKy:"",NguonTonCuoi:"",TonCuoiTheoLedger:"",ChenhLechDoiSoat:""}),o,e)}async function Ze(e={}){
const o=((await f.stockCardReport({...e,full:"1",export:"1"})).transactions||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaSP:e.productCode,SanPham:e.productName,ChungTu:e.refCode,
Loai:e.type,PhanLoai:e.category,TonTruocGiaoDich:_(e.openingQty),Nhap:_(e.inQty),Xuat:_(e.outQty),TonSauGiaoDich:_(e.balanceQty),GhiChu:e.note}))
;return Ve("stock-card-report","TheKho",Object.keys(o[0]||{STT:"",Ngay:"",MaSP:"",SanPham:"",ChungTu:"",Loai:"",PhanLoai:"",TonTruocGiaoDich:"",Nhap:"",Xuat:"",TonSauGiaoDich:"",
GhiChu:""}),o,e)}async function We(e={}){const o=((await f.financeReport({...e,full:"1",export:"1"})).fundLedger||[]).map((e,o)=>({STT:o+1,Ngay:e.date,ChungTu:e.code,Loai:e.type,
LoaiQuy:e.fundType,TaiKhoanQuy:e.account,NguoiLienQuan:e.counterparty,TonDauDong:Math.round(_(e.openingBalance)),Thu:Math.round(_(e.inAmount)),Chi:Math.round(_(e.outAmount)),
TonCuoiDong:Math.round(_(e.endingBalance)),GhiChu:e.note}));return Ve("fund-report","BaoCaoQuyTien",Object.keys(o[0]||{STT:"",Ngay:"",ChungTu:"",Loai:"",LoaiQuy:"",TaiKhoanQuy:"",
NguoiLienQuan:"",TonDauDong:"",Thu:"",Chi:"",TonCuoiDong:"",GhiChu:""}),o,e)}async function ze(e={}){const o=((await f.salesReport({...e,full:"1",export:"1"
})).bySalesman||[]).map((e,o)=>({STT:o+1,MaNVBH:e.salesmanCode,NVBH:e.salesmanName,SoDon:e.orderCount,SoKhachHang:e.customerCount,DoanhSoTruocKM:Math.round(_(e.beforePromoAmount)),
DoanhSoThucTe:Math.round(_(e.actualAmount)),GiaTriHangKM:Math.round(_(e.promotionValue)),DaThuTheoAR:Math.round(_(e.receiptAmount)),TraHangTheoAR:Math.round(_(e.returnAmount)),
ConNoTheoAR:Math.round(_(e.debtAmount))}));return Ve("salesman-report","BaoCaoNVBH",Object.keys(o[0]||{STT:"",MaNVBH:"",NVBH:"",SoDon:"",SoKhachHang:"",DoanhSoTruocKM:"",
DoanhSoThucTe:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",ConNoTheoAR:""}),o,e)}async function Ye(e={}){const o=((await f.deliveryReport({...e,full:"1",export:"1"
})).byStaff||[]).map((e,o)=>({STT:o+1,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoChuyen:e.tripCount,SoDonDaGiao:e.orderCount,TongTienDonCon:Math.round(_(e.totalAmount)),
DoanhSoDaXacNhan:Math.round(_(e.accountingConfirmedAmount)),ThuTienTheoQuy:Math.round(_(e.collectedAmount))}));return Ve("deliveryman-report","BaoCaoNVGH",Object.keys(o[0]||{
STT:"",MaNVGH:"",NVGH:"",SoChuyen:"",SoDonDaGiao:"",TongTienDonCon:"",DoanhSoDaXacNhan:"",ThuTienTheoQuy:""}),o,e)}async function Je(e={}){const o=await f.salesReport({...e,
full:"1",export:"1"}),n=await f.periodDebtReport({...e,full:"1",export:"1",includePaid:"1"}),t=new Map((n.debts||[]).map(e=>[L(e.customerCode||e.customerName),e])),a=new Map
;(o.sales||[]).forEach(e=>{const o=L(e.customerCode||e.customerName),n=a.get(o)||{MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
SoDon:0,DoanhSoTruocKM:0,DoanhSoThucTe:0,GiaTriHangKM:0,DaThuTheoAR:0,TraHangTheoAR:0};n.SoDon+=1,n.DoanhSoTruocKM+=_(e.beforePromoAmount),n.DoanhSoThucTe+=_(e.actualAmount),
n.GiaTriHangKM+=_(e.promotionValue),n.DaThuTheoAR+=_(e.receiptAmount),n.TraHangTheoAR+=_(e.returnAmount),a.set(o,n)});const r=Array.from(a.entries()).map(([e,o],n)=>{
const a=t.get(e)||{};return{STT:n+1,...o,DoanhSoTruocKM:Math.round(o.DoanhSoTruocKM),DoanhSoThucTe:Math.round(o.DoanhSoThucTe),GiaTriHangKM:Math.round(o.GiaTriHangKM),
DaThuTheoAR:Math.round(o.DaThuTheoAR),TraHangTheoAR:Math.round(o.TraHangTheoAR),DuDauKy:Math.round(_(a.openingBalance)),DuCuoiKy:Math.round(_(a.closingBalance))}})
;return Ve("customer-sales-report","DoanhSoKhachHang",Object.keys(r[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",SoDon:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",
GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DuDauKy:"",DuCuoiKy:""}),r,e)}async function eo(e={}){const o=await f.salesReport({...e,full:"1",export:"1"}),n=new Map
;(o.sales||[]).forEach(e=>(e.items||[]).forEach(e=>{const o=L(e.productCode||e.productName),t=n.get(o)||{MaSP:e.productCode,SanPham:e.productName,NhanHang:e.brand,SoLuongBan:0,
DoanhSoTruocKM:0,DoanhSoThucTe:0};t.SoLuongBan+=_(e.quantity),t.DoanhSoTruocKM+=_(e.catalogAmount),t.DoanhSoThucTe+=_(e.actualAmount),n.set(o,t)}))
;const t=Array.from(n.values()).reduce((e,o)=>e+o.DoanhSoThucTe,0)||1,a=Array.from(n.values()).map((e,o)=>({STT:o+1,...e,SoLuongBan:e.SoLuongBan,
DoanhSoTruocKM:Math.round(e.DoanhSoTruocKM),DoanhSoThucTe:Math.round(e.DoanhSoThucTe),ChietKhauKM:Math.round(e.DoanhSoTruocKM-e.DoanhSoThucTe),
TyTrong:`${q(e.DoanhSoThucTe/t*100,2)}%`}));return Ve("product-sales-report","DoanhSoSanPham",Object.keys(a[0]||{STT:"",MaSP:"",SanPham:"",NhanHang:"",SoLuongBan:"",
DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",TyTrong:""}),a,e)}
const oo=new Set(["password","passwordHash","hash","salt","token","tokens","accessToken","refreshToken","secret","apiKey","session","sessions","resetPasswordToken","verificationToken"])
;function no(e={},o=[]){for(const n of o){const o=L(e[n]);if(o)return o}return""}function to(e){return!0===e?"Hoạt động":!1===e?"Ngưng hoạt động":L(e)}function ao(e={},o=[],n=[]){
const t=new Set([...o,...n,"_id","__v","searchText"]),a={};return Object.keys(e||{}).forEach(o=>{if(t.has(o))return;const n=e[o];null!=n&&""!==n&&(a[o]=n)}),
Object.keys(a).length?JSON.stringify(a):""}function ro(e={},o=0,n=new Map){const t=no(e,["code","productCode","sku","id"]),a=n.get(L(t).toUpperCase())||{};return{STT:o+1,MaSP:t,
TenSP:no(e,["name","productName","title"]),Barcode:no(e,["barcode","barCode"]),NhanHang:no(e,["brand","brandName"]),NganhHang:no(e,["category","categoryName","groupName"]),
DonVi:no(e,["unit","baseUnit","uom"]),DonViCoSo:no(e,["baseUnit","unit"]),QuyDoi:_(e.conversionRate||e.ratio||1),
"Quy cách":Math.max(1,_(e.conversionRate||e.packingQty||e.unitsPerCase||1)),"Giá bán":Math.round(_(e.salePrice||e.price||e.sellPrice)),
GiaVon:Math.round(_(e.costPrice||e.cost||e.purchasePrice)),TonVatLy:_(a.onHand??a.quantity??a.qty),DaGiuCho:_(a.reservedQty),TonKhaDung:_(a.availableQty),
KhuBocHang:K(v(H(e),b.HC)),TrangThai:to(e.isActive??e.status),NgayTao:j(e.createdAt),NgayCapNhat:j(e.updatedAt),
ThongTinKhac:ao(e,["code","productCode","sku","name","productName","barcode","brand","category","unit","baseUnit","conversionRate","packing","salePrice","costPrice","pickingZone","warehouseCode","warehouseName","defaultWarehouse","isActive","status","createdAt","updatedAt"])
}}async function io(e={}){const[o,n]=await Promise.all([d.find({}).sort({code:1,name:1}).limit(be(e)).lean(),f.stockReport({full:"1",export:"1"
})]),t=new Map((n.stock||n.items||[]).map(e=>[L(e.productCode||e.code).toUpperCase(),e])),a=o.map((e,o)=>ro(e,o,t))
;return Ve("product-info-report","ThongTinSanPham",Object.keys(a[0]||ro({},-1,t)),a,e)}function uo(e={}){return[e.customerCode,e.customerId,e.customerName].map(L).filter(Boolean)}
async function co(){const o=await f.periodDebtReport({dateFrom:"0000-01-01",dateTo:e.todayVN(),full:"1",export:"1",includePaid:"1"}),n=new Map
;return(o.debts||o.items||[]).forEach(e=>{const o=_(e.closingBalance);uo(e).forEach(e=>n.set(e,o))}),n}async function so(o={}){
const n=e.todayVN(),t=L(o.monthStart||o.monthFrom||`${n.slice(0,7)}-01`),a=L(o.monthEnd||o.monthTo||n),r=await f.salesReport({dateFrom:t,dateTo:a,full:"1",export:"1"}),i=new Map
;return(r.sales||r.items||[]).forEach(e=>{const o=_(e.actualAmount);[e.customerCode,e.customerId,e.customerName].map(L).filter(Boolean).forEach(e=>{i.set(e,_(i.get(e))+o)})}),i}
function ho(e,o=[]){for(const n of o.map(L).filter(Boolean))if(e.has(n))return _(e.get(n));return 0}function To(e={},o=0,n=new Map,t=new Map){
const a=E(e),r=Q(e),i=[e.code,e.customerCode,e.id,e._id,e.name,e.customerName];return{STT:o+1,MaKH:no(e,["code","customerCode","id"]),TenKH:no(e,["name","customerName"]),
TenHoKinhDoanh:r.businessName,SDT:no(e,["phone","mobile","customerPhone","tel"]),DiaChi:no(e,["address","customerAddress","fullAddress"]),MaSoThue:a.taxCode,
DiaChiHoaDonThue:a.taxInvoiceAddress,Tuyen:no(e,["route","routeName","line"]),KhuVuc:no(e,["area","areaName","region","province"]),
MaNVBH:no(e,["staffCode","salesStaffCode","salesmanCode"]),NVBHPhuTrach:no(e,["staffName","salesStaffName","salesmanName"]),MaNVGH:no(e,["deliveryStaffCode","shipperCode"]),
NVGHPhuTrach:no(e,["deliveryStaffName","shipperName"]),CongNoHienTai:Math.round(ho(n,i)),DoanhSoThang:Math.round(ho(t,i)),TrangThai:to(e.isActive??e.status),NgayTao:j(e.createdAt),
NgayCapNhat:j(e.updatedAt),
ThongTinKhac:ao(e,["code","customerCode","name","customerName","businessName","customerBusinessName","householdBusinessName","taxBusinessName","invoiceBusinessName","tenHoKinhDoanh","phone","mobile","customerPhone","address","customerAddress","taxCode","customerTaxCode","taxNumber","vatNumber","vatCode","mst","taxInvoiceAddress","customerTaxInvoiceAddress","invoiceAddress","vatInvoiceAddress","billingAddress","route","area","region","staffCode","staffName","salesStaffCode","salesStaffName","deliveryStaffCode","deliveryStaffName","isActive","status","createdAt","updatedAt"])
}}async function lo(e={}){const[o,n,t]=await Promise.all([s.find({}).sort({code:1,name:1
}).limit(be(e)).lean(),co(),so(e)]),a=o.map((e,o)=>To(e,o,n,t)).sort((e,o)=>_(o.CongNoHienTai)-_(e.CongNoHienTai)||L(e.MaKH).localeCompare(L(o.MaKH)));return a.forEach((e,o)=>{
e.STT=o+1}),Ve("customer-info-report","ThongTinKhachHang",Object.keys(a[0]||To({},-1)),a,e)}function mo(e={}){const o={};return Object.keys(e||{}).forEach(n=>{
if(oo.has(n)||n.startsWith("_")||["__v","searchText"].includes(n))return
;if(["username","fullName","name","code","staffCode","role","roles","phone","email","isActive","status","permissions","area","route","lastLoginAt","lastLogin","createdAt","updatedAt"].includes(n))return
;const t=e[n];null!=t&&""!==t&&(o[n]=t)}),Object.keys(o).length?JSON.stringify(o):""}function go(e={},o=0){return{STT:o+1,TenDangNhap:no(e,["username","loginName"]),
HoTen:no(e,["fullName","name","displayName"]),MaNhanVien:no(e,["staffCode","code","employeeCode"]),VaiTro:Array.isArray(e.roles)?e.roles.join(", "):no(e,["role","roles"]),
SDT:no(e,["phone","mobile"]),Email:no(e,["email"]),TrangThai:to(e.isActive??e.status),
QuyenTruyCap:Array.isArray(e.permissions)?e.permissions.join(", "):L(e.permissions||e.permission||""),KhuVucTuyen:no(e,["area","route","region"]),NgayTao:j(e.createdAt),
NgayCapNhat:j(e.updatedAt),LanDangNhapGanNhat:j(e.lastLoginAt||e.lastLogin||e.lastSeenAt),ThongTinKhac:mo(e)}}async function po(e={}){
const o=p.users,n=(await o.find({}).select("-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken").sort({
role:1,code:1,username:1}).limit(be(e)).lean()).map(go);return Ve("user-info-report","ThongTinTaiKhoan",Object.keys(n[0]||go({},-1)),n,e)}async function fo(e){return a.preview(e)}
async function yo(e){return a.commit(e)}async function So(){return a.logs()}function Co(){return r.getBuiltInTemplates()}async function No(e){return r.buildBuiltInTemplateFile(e)}
function Do(e){return r.getFields(e)}async function Mo(){return r.listCustomTemplates()}async function Ao(e){return r.saveCustomTemplate(e)}async function vo(e){
return r.deleteCustomTemplate(e)}async function Ho(e){return r.buildCustomTemplateFile(e)}function Ko(e={}){return(e.definition?.columns||[]).map(e=>Array.isArray(e)?{key:e[0],
label:e[1]||e[0]}:{key:e.key,label:e.label||e.key}).filter(e=>L(e.key))}async function bo(e,o={},n={}){const t=L(o.__legacyExportType||""),a=await y.run(e,{...o,__exportAll:!0,
__legacyBridge:t?{legacyExportType:t,mappedReportCode:e,bridgedToReportCenter:!0}:null},n),r=Ko(a),i=r.map(e=>e.label),u=(a.rows||[]).map((e,o)=>{const n={STT:o+1}
;for(const o of r)n[o.label]=e[o.key]??"";return n});return Ve(e,L(a.definition?.title||e).slice(0,31)||"BaoCao",["STT",...i],u,o,a.sourceNote)}function Po(){
return[...new Set([...i.getExportTypes(),"invoice-orders","vatInvoiceTT78","vat-non-invoice-orders","sse-invoice-orders","sse-invoice-errors",...Object.keys(S)])].sort()}
async function ko(o,n={},t={}){const a=String(o||"").trim();if(["sse-invoice-orders","sseInvoiceOrders"].includes(a))return P.buildSseInvoiceWorkbook(n,t)
;if(["sse-invoice-errors","sseInvoiceErrors"].includes(a))return P.buildSseErrorReportWorkbook(n,t);if(["invoice-orders","invoiceOrders"].includes(a)){const e=l(n.invoiceType)
;return e?e===T.VAT?Ne(n,t):Ae(n,t):{error:"invoiceType chỉ nhận VAT hoặc NON_VAT",status:400}}
if(["vatInvoiceTT78","vat-invoice-tt78","hoa-don-vat-tt78"].includes(a))return Ne(n,t);if(["vat-non-invoice-orders","vatNonInvoiceOrders"].includes(a))return Ae(n,t);const r=C(a)
;if(r)return bo(r,{...n,__legacyExportType:a},t);const u=await i.findForExport(o,n);if(!u)return{error:"Loại dữ liệu export không hợp lệ",status:400};const c=await B({type:o,rows:u
}),s=String(o||"data").replace(/[^a-zA-Z0-9_-]/g,"-");return{buffer:c,rows:u.length,fileName:`${s}-export-${e.todayVN()}.xlsx`}}module.exports={previewImport:fo,commitImport:yo,
getImportLogs:So,getBuiltInTemplates:Co,buildBuiltInTemplateFile:No,getFields:Do,listCustomTemplates:Mo,saveCustomTemplate:Ao,deleteCustomTemplate:vo,buildCustomTemplateFile:Ho,
getExportTypes:Po,exportToExcel:ko};
