/* GENERATED FILE — edit src/services/importExportLegacy.service.source/part-01.jsfrag, src/services/importExportLegacy.service.source/part-02.jsfrag, src/services/importExportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{createWorkbook:o,appendAoaSheet:n,writeWorkbook:t}=require("../utils/excelWriter.util"),a=require("./excelImportService"),r=require("./import-template/LegacyImportTemplateAdapter"),i=require("../repositories/exportRepository"),u=require("../models/SalesOrder"),c=require("../models/ReturnOrder"),s=require("../models/Customer"),d=require("../models/Product"),h=require("./excel/ProductExcelEnrichmentService"),{INVOICE_TYPES:T,normalizeInvoiceType:l,resolveInvoiceType:m,isActiveInvoiceOrder:g}=require("./invoiceExportClassifier"),p=require("../models"),f=require("./reportService"),y=require("./reports/ReportCenterService"),{LEGACY_EXPORT_TYPE_TO_REPORT_CODE:S,reportCodeForLegacyExport:C}=require("./reports/ReportLegacyExportMap"),{pickSalesStaffCode:N,pickSalesStaffName:D,pickDeliveryStaffCode:M,pickDeliveryStaffName:A}=require("../domain/staff/staffIdentity"),{normalizePickingZone:v,pickingZoneFrom:H,pickingZoneLabel:K,PICKING_ZONES:b}=require("../utils/pickingZone.util"),P=require("./sseInvoiceExport.service"),k=require("./invoiceExportQuery.service"),V=require("./invoiceNetSales.service"),x=require("./invoice/VnptTt78TemplateExportService")
;function R(e={}){const o={...e};return delete o._id,delete o.__v,o}function G(e){return null==e?"":Array.isArray(e)||"object"==typeof e?JSON.stringify(e):e}function w(e=[]){
const o=e.map(R),n=new Set;o.forEach(e=>Object.keys(e).forEach(e=>n.add(e)));const t=Array.from(n),a=o.map(e=>t.map(o=>G(e[o])));return{headers:t,body:a}}function B(e=""){
return"products"===_(e).toLowerCase()?["productCode","code","sku","barcode"]:h.PRODUCT_CODE_KEYS}async function O({type:e,rows:a}){const r=B(e),i=await h.enrichRows(a,{
productCodeKeys:r,packingKey:"Quy cách",salePriceKey:"Giá bán"}),{headers:u,body:c}=w(i.rows),s=o();n(s,"Export",[u,...c]);const d=h.documentProductLines(a);if(d.length){
const e=(await h.enrichRows(d,{packingKey:"Quy cách",salePriceKey:"Giá bán"})).rows.map(e=>({MaChungTu:e.documentCode,MaSP:W(e),SanPham:z(e),"Quy cách":e["Quy cách"],
"Giá bán":e["Giá bán"],SoLuong:J(e),GiaSauKM:q(e.finalPrice??e.priceAfterPromotion??e.discountedPrice??""),ThanhTien:te(e)
})),o=["MaChungTu","MaSP","SanPham","Quy cách","Giá bán","SoLuong","GiaSauKM","ThanhTien"];n(s,"ChiTietSanPham",[o,...e.map(e=>o.map(o=>e[o]??""))])}
return n(s,"ThongTin",[["Loại dữ liệu",e],["Số dòng",a.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc sản phẩm","Nếu có sản phẩm: Quy cách là số lượng đóng gói; Giá bán lấy từ danh mục sản phẩm. Đơn con giữ thêm Giá sau KM."]]),
t(s)}
const E=.08,{extractCustomerTaxProfile:Q}=require("../utils/customerTaxProfile.util"),{extractCustomerBusinessProfile:I}=require("../utils/customerBusinessProfile.util"),L=["STT","NgayHoaDon","MaKhachHang","TenKhachHang","TenNguoiMua","MaSoThue","DiaChiKhachHang","DienThoaiKhachHang","SoTaiKhoan","NganHang","HinhThucTT","MaSanPham","SanPham","DonViTinh","Extra1SP","Extra2SP","SoLuong","DonGia","TyLeChietKhau","SoTienChietKhau","ThanhTien","TienBan","ThueSuat","TienThueSanPham","TienThue","TongCong","TinhChatHangHoa","DonViTienTe","TyGia","Fkey","Extra1","Extra2","EmailKhachHang","VungDuLieu","Extra3","Extra4","Extra5","Extra6","Extra7","Extra8","Extra9","Extra10","Extra11","Extra12","LDDNBo","HDSo","HVTNXHang","TNVChuyen","PTVChuyen","HDKTNgay","HDKTSo","CCCDan","Extra13","Extra14","mau_01"]
;function _(e){return String(e??"").trim()}function q(e,o=0){const n=Number(String(e??"").replace(/,/g,""));return Number.isFinite(n)?n:o}function j(e,o=2){const n=10**o
;return Math.round(q(e)*n)/n}function $(o){return e.toDateOnly(o||"")||_(o).slice(0,10)}function F(e,o={}){
const n=$(e),t=$(o.dateFrom||o.from||o.fromDate||""),a=$(o.dateTo||o.to||o.toDate||"");return!(t&&n<t||a&&n>a)}function X(e={}){return g(e)}function U(e={}){
return[e.id,e._id,e.code,e.orderCode,e.documentCode,e.salesOrderId,e.salesOrderCode,e.externalOrderCode,e.invoiceCode,e.refCode].map(_).filter(Boolean)}function Z(e={}){
return _(e.code||e.orderCode||e.salesOrderCode||e.documentCode||e.id||e._id)}function W(e={}){return _(e.productCode||e.code||e.sku||e.barcode||e.productId||e.id)}function z(e={}){
return _(e.productName||e.name||e.itemName||e.productTitle||"")}function Y(e={},o={}){return _(e.unit||e.baseUnit||e.dvt||e.uom||o.unit||o.baseUnit||"")}function J(e={}){
return q(e.quantity??e.qty??e.totalQty??e.qtySale??e.saleQty??0)}function ee(e={}){return q(e.returnQty??e.qtyReturn??e.returnQuantity??e.returnedQty??0)}function oe(e={}){
return _(e.lineKey||e.orderLineId||e.salesOrderItemId||e.itemId||e._id||"")}function ne(e={}){
return q(e.finalPrice??e.priceAfterPromotion??e.promoPrice??e.price??e.salePrice??e.unitPrice??e.sellPrice??0)}function te(e={}){
return q(e.amount??e.totalAmount??e.lineAmount??e.money??0)||J(e)*ne(e)}function ae(e,o){return`${_(e)}@@${_(o)}`}function re(e={}){const o=ne(e);return o?String(j(o,6)):""}
function ie(e,o,n="",t=""){return[_(e),_(o),_(n),_(t)].join("@@")}function ue(e={}){return _(e.code||e.id||e.returnOrderCode||e.documentCode||e._id)}function ce(e={}){
return _(e.id||e._id||e.code||e.returnOrderCode||e.documentCode)}function se(e={}){
const o=e.updatedAt||e.modifiedAt||e.createdAt||e.date||e.documentDate||"",n=o?new Date(o).getTime():0;return Number.isFinite(n)?n:0}function de(){return{status:{
$nin:["void","cancelled","canceled","deleted","removed"]},returnStatus:{$nin:["void","cancelled","canceled","deleted","removed"]}}}function he(e,o,n,t={}){if(!o||!n)return
;e.set(o,q(e.get(o))+n),e.__sourceMap||(e.__sourceMap=new Map);const a=e.__sourceMap.get(o)||{codes:new Set,ids:new Set,sourceRows:[]};t.code&&a.codes.add(t.code),
t.id&&a.ids.add(t.id),t.sourceRow&&a.sourceRows.push(t.sourceRow),e.__sourceMap.set(o,a)}function Te(e,o){const n=e&&e.__sourceMap;if(!n)return{ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const t=n.get(o);if(!t)return{ReturnOrderCode:"",ReturnOrderId:"",ReturnQtySource:""}
;const a=Array.from(t.codes||[]).filter(Boolean),r=Array.from(t.ids||[]).filter(Boolean),i=Array.from(t.sourceRows||[]).filter(Boolean);return{ReturnOrderCode:a.join(", "),
ReturnOrderId:r.join(", "),ReturnQtySource:i.join(" | ")}}function le(e=[]){const o=new Map,n=new Map;for(const o of e||[]){if(!X(o))continue
;const e=ue(o),t=ce(o),a=se(o),r=Array.from(new Set([o.salesOrderId,o.orderId,o.sourceOrderId,o.deliveryOrderId,o.salesOrderCode,o.orderCode,o.sourceOrderCode,o.deliveryOrderCode,o.originalOrderCode].map(_).filter(Boolean)))
;if(!r.length)continue;const i=_(o.salesOrderCode||o.orderCode||o.salesOrderId||o.orderId||r[0]);for(const u of Array.isArray(o.items)?o.items:[]){const o=W(u);if(!o)continue
;const c=ee(u);if(!c)continue;const s=oe(u),d=re(u),h=`${e||t||"RETURN_ORDER"}:${i}:${o}:${c}`,T=[e||t,i,o,s||"",d||""].map(_).join("@@"),l={roKeys:r,pcode:o,qty:c,lineKey:s,
priceKey:d,roCode:e,roId:t,updatedMs:a,sourceRow:h},m=n.get(T);(!m||a>=m.updatedMs)&&n.set(T,l)}}for(const e of n.values()){
const{roKeys:n,pcode:t,qty:a,lineKey:r,priceKey:i,roCode:u,roId:c,sourceRow:s}=e,d={code:u,id:c,sourceRow:s}
;for(const e of n)he(o,r&&i?ie(e,t,r,i):r?ie(e,t,r,""):i?ie(e,t,"",i):ae(e,t),a,d)}return o}function me(e,o={},n={}){const t=W(n);if(!t)return{qty:0,ReturnOrderCode:"",
ReturnOrderId:"",ReturnQtySource:""};const a=oe(n),r=re(n);let i={qty:0,key:""};for(const n of U(o)){
const o=[a&&r?ie(n,t,a,r):"",a?ie(n,t,a,""):"",r?ie(n,t,"",r):"",ae(n,t)].filter(Boolean);for(const n of o){const o=q(e.get(n));if(o>i.qty&&(i={qty:o,key:n}),o)break}}return{
qty:i.qty,...Te(e,i.key)}}function ge(e,o={},n={}){return me(e,o,n).qty}function pe(e={}){return _(e.customerCode||e.customerId||e.customerName||e.customerPhone||"")}
function fe(e=[]){const o=new Map;for(const n of e||[])[n.code,n.customerCode,n.id,n._id,n.name,n.customerName,n.phone,n.mobile].map(_).filter(Boolean).forEach(e=>o.set(e,n))
;return o}function ye(e=[]){const o=new Map;for(const n of e||[])[n.code,n.productCode,n.sku,n.barcode,n.id,n._id].map(_).filter(Boolean).forEach(e=>o.set(e,n));return o}
function Se(e={},o=new Map){
const n=o.get(_(e.customerCode))||o.get(_(e.customerId))||o.get(_(e.customerName))||{},t=Q(e),a=Q(n),r=I(e),i=I(n),u=_(e.customerName||n.name||n.customerName),c=_(r.businessName||i.businessName)
;return{code:_(e.customerCode||n.code||n.customerCode||e.customerId||n.id),name:c||u,buyer:_(e.buyerName||e.contactName||n.buyerName||n.representative||n.contactName||u),
taxCode:_(t.taxCode||a.taxCode),address:_(t.taxInvoiceAddress||a.taxInvoiceAddress||e.customerAddress||e.address||n.address||n.deliveryAddress),
phone:_(e.customerPhone||e.phone||n.phone||n.mobile),bankAccount:_(n.bankAccount||n.accountNumber||e.bankAccount),bankName:_(n.bankName||e.bankName),
email:_(n.email||e.customerEmail||e.email)}}function Ce(e={}){const o=_(e.paymentMethod||e.paymentType||e.method||e.hinhThucTT||"");if(o)return o
;const n=q(e.cashAmount||e.collectedCashAmount),t=q(e.bankAmount||e.transferAmount||e.collectedBankAmount);return n&&t?"TM/CK":t?"CK":"TM/CK"}
function Ne({orders:o,returnOrders:n,customers:t,products:a,query:r={}}){const i=fe(t),u=ye(a),c=[],s=[],d=[];let l=0
;const g=(o||[]).filter(X).filter(e=>m(e)===T.VAT).filter(e=>k.matchesInvoiceExportFilters(e,r,{invoiceGroup:T.VAT})).filter(e=>{if(!r.customerCode&&!r.customerId)return!0
;const o=_(r.customerCode||r.customerId);return[e.customerCode,e.customerId,e.customerName].map(_).includes(o)
}).sort((e,o)=>_(e.orderDate||e.date||e.documentDate||e.createdAt).localeCompare(_(o.orderDate||o.date||o.documentDate||o.createdAt))||Z(e).localeCompare(Z(o))),p=V.buildNetSaleDataset({
orders:g,returnOrders:n,isEligibleReturnOrder:k.isEligibleReturnOrder});for(const o of p.orders){
const n=o.order,t=[],a=Se(n,i),r=Z(n),T=$(n.orderDate||n.date||n.documentDate||n.createdAt||e.todayVN());for(const e of o.lines){
const o=e.item,n=e.productCode,a=u.get(n)||{},i=z(o)||_(a.name||a.productName),c=e.soldQty,s=e.returnedQty,T=e.netQty,l=ne(o)||(c?te(o)/c:0),m=V.sourceSummary(e);if(!n||T<=0){
n||d.push({code:"MISSING_PRODUCT_CODE",orderCode:r,message:"Dòng bán thiếu productCode nên không thể đưa vào dataset hóa đơn."});continue}const g=j(l/1.08,6),p=j(T*g,2);t.push({
productCode:n,productName:i,unit:Y(o,a),catalogPackingQty:h.catalogPackingQty(a),catalogSalePrice:h.catalogSalePrice(a),soldQty:c,returnQty:s,safeReturnQty:s,invoiceQty:T,
priceInclVat:l,unitPriceBeforeVat:g,lineAmountBeforeVat:p,returnOrderCode:m.ReturnOrderCode,returnOrderId:m.ReturnOrderId,returnQtySource:m.ReturnQtySource})}
if(!t.length||o.fullyReturned)continue;l+=1;const m=j(t.reduce((e,o)=>e+o.lineAmountBeforeVat,0),2),g=j(m*E,2),p=Math.round(m+g);p<=0||t.forEach((e,o)=>{const t=0===o;c.push({
STT:t?l:"",NgayHoaDon:t?T:"",MaKhachHang:t?a.code:"",TenKhachHang:t?a.name:"",TenNguoiMua:t?a.buyer:"",MaSoThue:t?a.taxCode:"",DiaChiKhachHang:t?a.address:"",
DienThoaiKhachHang:t?a.phone:"",SoTaiKhoan:t?a.bankAccount:"",NganHang:t?a.bankName:"",HinhThucTT:t?Ce(n):"",MaSanPham:e.productCode,SanPham:e.productName,DonViTinh:e.unit,
Extra1SP:e.catalogPackingQty,Extra2SP:e.catalogSalePrice,SoLuong:e.invoiceQty,DonGia:e.unitPriceBeforeVat,TyLeChietKhau:"",SoTienChietKhau:"",ThanhTien:e.lineAmountBeforeVat,
TienBan:t?m:"",ThueSuat:t?8:"",TienThueSanPham:"",TienThue:t?g:"",TongCong:t?p:"",TinhChatHangHoa:0,DonViTienTe:t?"VND":"",TyGia:"",Fkey:r,Extra1:"",Extra2:"",
EmailKhachHang:t?a.email:"",VungDuLieu:"",Extra3:"",Extra4:"",Extra5:"",Extra6:"",Extra7:"",Extra8:"",Extra9:"",Extra10:"",Extra11:"",Extra12:"",LDDNBo:"",HDSo:"",HVTNXHang:"",
TNVChuyen:"",PTVChuyen:"",HDKTNgay:"",HDKTSo:"",CCCDan:""}),s.push({MaDon:r,MaKhachHang:a.code,TenKhachHang:a.name,MaSoThue:a.taxCode,DiaChiHoaDon:a.address,
MaSanPham:e.productCode,SanPham:e.productName,"Quy cách":e.catalogPackingQty,"Giá bán":e.catalogSalePrice,SoLuongBan:e.soldQty,SoLuongTra:e.returnQty,
SoLuongTraAnToan:e.safeReturnQty,SoLuongXuatHoaDon:e.invoiceQty,GiaSauKhuyenMaiCoVAT:e.priceInclVat,DonGiaTruocVAT:e.unitPriceBeforeVat,ThanhTienTruocVAT:e.lineAmountBeforeVat,
ReturnOrderCode:e.returnOrderCode,ReturnOrderId:e.returnOrderId,ReturnQtySource:e.returnQtySource,LyDoBoDong:""})})}return{rows:c,auditRows:s,warnings:[...p.warnings,...d]}}
async function De(o={},n={}){const t=k.normalizeExportQuery(o,{invoiceGroup:T.VAT
}),a=t.dateFrom||"0000-01-01",r=t.dateTo||"9999-12-31",{orders:i,returnOrders:u,customers:c,products:s}=await k.loadInvoiceExportData({query:o,invoiceGroup:T.VAT,currentUser:n
}),{rows:d,auditRows:h,warnings:l=[]}=Ne({orders:i,returnOrders:u,customers:c,products:s,query:o});if(!d.length)return{
error:"Không có đơn VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",status:404,code:"INVOICE_EXPORT_NO_DATA"}
;const m=d.reduce((e,o)=>(""!==o.TienBan&&(e.invoiceCount+=1,e.amountBeforeVat+=q(o.TienBan),e.vatAmount+=q(o.TienThue),e.totalAmount+=q(o.TongCong)),e.lineCount+=o.MaSanPham?1:0,
e),{invoiceCount:0,lineCount:0,amountBeforeVat:0,vatAmount:0,totalAmount:0}),g=await x.buildVnptTt78WorkbookFromTemplate({rows:d,auditRows:h,
auditHeaders:["MaDon","MaKhachHang","TenKhachHang","MaSoThue","DiaChiHoaDon","MaSanPham","SanPham","Quy cách","Giá bán","SoLuongBan","SoLuongTra","SoLuongTraAnToan","SoLuongXuatHoaDon","GiaSauKhuyenMaiCoVAT","DonGiaTruocVAT","ThanhTienTruocVAT","ReturnOrderCode","ReturnOrderId","ReturnQtySource","LyDoBoDong"],
summary:m,dateFrom:a,dateTo:r,warnings:l}),p="0000-01-01"===a?"all":a,f="9999-12-31"===r?e.todayVN():r;return{buffer:g,rows:d.length,orderCount:m.invoiceCount,
warningCount:l.length,warnings:l.slice(0,100),fileName:`Hoa_don_VAT_TT78_${p}_${f}.xlsx`}}function Me(e={}){
return[_(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH),_(e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName)].filter(Boolean).join(" - ")
}function Ae(e={}){return _(e.orderSourceName||e.orderSource||e.source||e.sourceType||e.importSource||"")}async function ve(a={},r={}){const i=k.normalizeExportQuery(a,{
invoiceGroup:T.NON_VAT}),u=i.dateFrom||"0000-01-01",c=i.dateTo||"9999-12-31",{orders:s,returnOrders:d,customers:l,products:g}=await k.loadInvoiceExportData({query:a,
invoiceGroup:T.NON_VAT,currentUser:r}),p=(s||[]).filter(X).filter(e=>m(e)===T.NON_VAT).filter(e=>k.matchesInvoiceExportFilters(e,a,{invoiceGroup:T.NON_VAT
})),f=le(d),y=fe(l),S=ye(g),C=[],N=[];let D=0,M=0,A=0;p.forEach((e,o)=>{const n=Se(e,y),t=Z(e);let a=0,r=0;for(const o of Array.isArray(e.items)?e.items:[]){
const n=W(o),i=S.get(n)||{},u=J(o),c=Math.min(u,ge(f,e,o)),s=Math.max(0,u-c),d=ne(o)||(u?te(o)/u:0),T=j(s*d,2);a+=j(c*d,2),r+=T,N.push({"Mã đơn":t,"Mã sản phẩm":n,
"Tên sản phẩm":z(o)||_(i.name||i.productName),"Quy cách":h.catalogPackingQty(i),"Giá bán":h.catalogSalePrice(i),"Số lượng bán":u,"Số lượng trả":c,"Số lượng còn lại":s,"Đơn giá":d,
"Thành tiền":T})}const i=q(e.totalAmount||e.grandTotal||0),u=q(e.paidAmount||e.paymentAmount||0),c=q(e.debtAmount??Math.max(0,i-u));D+=i,M+=a,A+=r,C.push({STT:o+1,
"Ngày bán":$(e.orderDate||e.date||e.documentDate||e.createdAt),"Mã đơn":t,"Mã khách hàng":n.code,"Tên khách hàng":n.name,NVBH:Me(e),"Nguồn đơn":Ae(e),"Giá trị đơn":i,
"Tiền đã thu":u,"Công nợ":c,"Lý do không xuất":_(e.vatInvoiceNote),"Người thay đổi":_(e.vatInvoiceUpdatedBy),"Thời gian thay đổi":_(e.vatInvoiceUpdatedAt)})})
;const v=N.filter(e=>Number(e["Số lượng còn lại"])>0);if(!C.length||!v.length)return{error:"Không có đơn không VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",
status:404,code:"INVOICE_EXPORT_NO_DATA"};const H=o()
;ke(H,"DanhSachDon",["STT","Ngày bán","Mã đơn","Mã khách hàng","Tên khách hàng","NVBH","Nguồn đơn","Giá trị đơn","Tiền đã thu","Công nợ","Lý do không xuất","Người thay đổi","Thời gian thay đổi"],C),
ke(H,"ChiTietHang",["Mã đơn","Mã sản phẩm","Tên sản phẩm","Quy cách","Giá bán","Số lượng bán","Số lượng trả","Số lượng còn lại","Đơn giá","Thành tiền"],N),
n(H,"ThongTin",[["Từ ngày","0000-01-01"===u?"":u],["Đến ngày","9999-12-31"===c?"":c],["Số đơn không xuất hóa đơn",C.length],["Tổng giá trị đơn",j(D,2)],["Tổng hàng trả",j(M,2)],["Giá trị còn lại",j(A,2)]])
;const K=t(H),b="0000-01-01"===u?"all":u,P="9999-12-31"===c?e.todayVN():c,V=b===P?b:`${b}_${P}`;return{buffer:K,rows:v.length,orderCount:C.length,
fileName:`Hoa_don_khong_VAT_${V}.xlsx`}}
const He=["sales-report","delivery-report","return-report","debt-report","ar-ledger-detail","stock-report","inventory-movement-report","stock-card-report","fund-report","salesman-report","deliveryman-report","customer-sales-report","product-sales-report","product-info-report","customer-info-report","user-info-report"]
;function Ke(e={}){return{from:$(e.dateFrom||e.from||e.fromDate||""),to:$(e.dateTo||e.to||e.toDate||"")}}function be(e={},o=["date","createdAt"]){const{from:n,to:t}=Ke(e)
;return n||t?{$or:o.map(e=>({[e]:{...n?{$gte:n}:{},...t?{$lte:"createdAt"===e?`${t}T23:59:59.999Z`:t}:{}}}))}:{}}function Pe(e={}){
return Math.min(Math.max(Number(e.limit||1e5),1),2e5)}function ke(e,o,t,a){const r=a.map(e=>t.map(o=>e[o]??""));n(e,String(o||"BaoCao").slice(0,31),[t,...r])}function Ve(e=""){
return{"stock-report":"Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.",
"inventory-movement-report":"Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.",
"stock-card-report":"Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.",
"sales-report":"Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.",
"return-report":"Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.","debt-report":"Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.",
"ar-ledger-detail":"Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.","fund-report":"Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.",
"delivery-report":"Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.",
"product-info-report":"Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.",
"customer-info-report":"Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán."
}[e]||"Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống."}async function xe(a,r,i,u,c={},s=null){const d=await h.enrichRows(u,{packingKey:"Quy cách",
salePriceKey:"Giá bán"}),T=[...i];d.hasProducts&&(T.includes("Quy cách")||T.push("Quy cách"),T.includes("Giá bán")||T.push("Giá bán"));const l=o();if(s){
const e=[s.service,s.serviceMethod].filter(Boolean).join(".")
;n(l,"THÔNG TIN NGUỒN",[["Trường","Giá trị"],["Mã báo cáo",s.reportCode||""],["Service",e],["Nguồn chính",(s.primaryCollections||[]).join(", ")],["Quy tắc SSoT",s.ssotRule||s.sourceLabel||""],["Xem và xuất cùng nguồn",s.viewAndExportSameSource?"Có":"Không"],["Trạng thái nguồn",s.sourceStatus||"OK"]])
}ke(l,r,T,d.rows);const{from:m,to:g}=Ke(c)
;n(l,"ThongTin",[["Mẫu báo cáo",r],["Từ ngày",m],["Đến ngày",g],["Số dòng",d.rows.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc nghiệp vụ",Ve(a)]])
;const p=String(a||"report").replace(/[^a-zA-Z0-9_-]/g,"-"),f=`${m||"all"}_${g||e.todayVN()}`;return{buffer:t(l),rows:d.rows.length,fileName:`${p}_${f}.xlsx`}}function Re(e={}){
return Array.isArray(e.items)?e.items:[]}function Ge(e={}){return Re(e).reduce((e,o)=>e+J(o),0)||q(e.totalQuantity||e.quantity||0)}function we(e={},o={}){
return q(e.originalPrice??e.basePrice??e.listPrice??o.salePrice??e.salePrice??e.price??e.unitPrice??0)}function Be(e={},o={}){return J(e)*we(e,o)}function Oe(e={}){
return q(e.finalAmount??e.amount??e.totalAmount??e.lineAmount??0)||J(e)*ne(e)}function Ee(e={},o=new Map){
return Re(e).reduce((e,n)=>e+Be(n,o.get(W(n))||{}),0)||q(e.beforePromoAmount||e.grossAmount||e.totalBeforeDiscount||e.totalAmount||0)}function Qe(e={}){
return q(e.afterPromoAmount||e.totalAfterPromotion||e.totalAmount||e.amount||0)}function Ie(e={},o="sales"){return _("delivery"===o?A(e):D(e))}function Le(e={},o="sales"){
return _("delivery"===o?M(e):N(e))}async function _e(){const e=await d.find({}).select("code name salePrice conversionRate baseUnit unit brand category").lean()
;return new Map(e.map(e=>[_(e.code),e]))}async function qe(e={}){const o=((await f.salesReport({...e,full:"1",export:"1"})).sales||[]).map((e,o)=>({STT:o+1,Ngay:e.date,
MaDon:e.code,Nguon:e.source,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,
SoLuongBan:e.saleQuantity,SoLuongKhuyenMai:e.promoQuantity,DoanhSoTruocKM:Math.round(q(e.beforePromoAmount)),DoanhSoThucTe:Math.round(q(e.actualAmount)),
ChietKhauKM:Math.round(q(e.promotionDiscountAmount)),GiaTriHangKM:Math.round(q(e.promotionValue)),DaThuTheoAR:Math.round(q(e.receiptAmount)),
TraHangTheoAR:Math.round(q(e.returnAmount)),DieuChinhCongNo:Math.round(q(e.adjustmentAmount)),ConNoTheoAR:Math.round(q(e.debtAmount)),TrangThaiGiaoHang:e.deliveryStatus,
TrangThaiKeToan:e.accountingStatus}));return xe("sales-report","BaoCaoBanHang",Object.keys(o[0]||{STT:"",Ngay:"",MaDon:"",Nguon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",
MaNVGH:"",NVGH:"",SoLuongBan:"",SoLuongKhuyenMai:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DieuChinhCongNo:"",
ConNoTheoAR:"",TrangThaiGiaoHang:"",TrangThaiKeToan:""}),o,e)}async function je(e={}){const o=((await f.deliveryReport({...e,full:"1",export:"1"})).delivery||[]).map((e,o)=>({
STT:o+1,NgayGiao:e.deliveryDate,MaDonTong:e.code,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoDonDangGan:e.assignedOrderCount,SoDonDaGiao:e.orderCount,
TongTienDonCon:Math.round(q(e.totalAmount)),DoanhSoDaXacNhan:Math.round(q(e.accountingConfirmedAmount)),TienThuTheoQuy:Math.round(q(e.collectedAmount)),TrangThai:e.status,
LechSoDonSnapshot:q(e.dataQuality?.snapshotOrderCountDifference),LechTienSnapshot:Math.round(q(e.dataQuality?.snapshotAmountDifference))}))
;return xe("delivery-report","BaoCaoGiaoHang",Object.keys(o[0]||{STT:"",NgayGiao:"",MaDonTong:"",MaNVGH:"",NVGH:"",SoDonDangGan:"",SoDonDaGiao:"",TongTienDonCon:"",
DoanhSoDaXacNhan:"",TienThuTheoQuy:"",TrangThai:"",LechSoDonSnapshot:"",LechTienSnapshot:""}),o,e)}async function $e(e={}){const o=((await f.returnReport({...e,full:"1",export:"1"
})).returns||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaTraHang:e.code,MaDon:e.salesOrderCode,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,
NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,GiaTriTra:Math.round(q(e.amount)),GiaTriChungTu:Math.round(q(e.documentAmount)),
GiaTriARReturn:Math.round(q(e.arAmount)),TrangThaiNhapKho:e.warehouseReceiveStatus,TrangThaiTraHang:e.returnState,TrangThaiKeToan:e.accountingStatus}))
;return xe("return-report","BaoCaoTraHang",Object.keys(o[0]||{STT:"",Ngay:"",MaTraHang:"",MaDon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",GiaTriTra:"",
GiaTriChungTu:"",GiaTriARReturn:"",TrangThaiNhapKho:"",TrangThaiTraHang:"",TrangThaiKeToan:""}),o,e)}async function Fe(e={}){const o=((await f.periodDebtReport({...e,full:"1",
export:"1",includePaid:"1"})).debts||[]).map((e,o)=>({STT:o+1,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,DuDauKy:Math.round(q(e.openingBalance)),PhatSinhNo:Math.round(q(e.debitInPeriod)),DaThu:Math.round(q(e.receiptInPeriod)),
TraHang:Math.round(q(e.returnInPeriod)),ChietKhauDieuChinh:Math.round(q(e.adjustmentInPeriod)+q(e.otherCreditInPeriod)),TongPhatSinhCo:Math.round(q(e.totalCreditInPeriod)),
DuCuoiKy:Math.round(q(e.closingBalance))}));return xe("debt-report","BaoCaoCongNo",Object.keys(o[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",
DuDauKy:"",PhatSinhNo:"",DaThu:"",TraHang:"",ChietKhauDieuChinh:"",TongPhatSinhCo:"",DuCuoiKy:""}),o,e)}async function Xe(e={}){const o=((await f.arLedgerDetailReport({...e,
full:"1",export:"1"})).ledger||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaKhachHang:e.customerCode,KhachHang:e.customerName,ChungTu:e.documentCode,Loai:e.type,DienGiai:e.description,
DuTruocGiaoDich:Math.round(q(e.openingBalance)),No:Math.round(q(e.debit)),Co:Math.round(q(e.credit)),PhanLoaiCo:e.creditCategory,DuSauGiaoDich:Math.round(q(e.closingBalance))}))
;return xe("ar-ledger-detail","SoCongNoChiTiet",Object.keys(o[0]||{STT:"",Ngay:"",MaKhachHang:"",KhachHang:"",ChungTu:"",Loai:"",DienGiai:"",DuTruocGiaoDich:"",No:"",Co:"",
PhanLoaiCo:"",DuSauGiaoDich:""}),o,e)}async function Ue(e={}){const o=((await f.stockReport({...e,full:"1",export:"1"})).stock||[]).map((e,o)=>({STT:o+1,
MaSP:_(e.productCode||e.code||e.productId),SanPham:_(e.productName||e.name),DonViTinh:_(e.unit||e.baseUnit),TonVatLy:q(e.onHand??e.quantity??e.qty),DaGiuCho:q(e.reservedQty),
TonKhaDung:q(e.availableQty)}));return xe("stock-report","TonKhoHienTai",Object.keys(o[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonVatLy:"",DaGiuCho:"",TonKhaDung:""}),o,{})}
async function Ze(e={}){const o=((await f.inventoryMovementReport({...e,full:"1",export:"1",mode:"movement"})).stock||[]).map((e,o)=>({STT:o+1,MaSP:e.productCode,
SanPham:e.productName,DonViTinh:e.unit,TonDauKy:q(e.openingQty),NhapMua:q(e.importQty),HangTraNhapKho:q(e.returnQty),NhapKhac:q(e.otherInQty),TongNhap:q(e.inQty),
XuatBan:q(e.saleQty),XuatDaoChungTu:q(e.reversalOutQty),XuatKhac:q(e.otherOutQty),TongXuat:q(e.outQty),DieuChinhRong:q(e.adjustmentQty),TonCuoiKy:q(e.endingQty),
NguonTonCuoi:e.endingSource,TonCuoiTheoLedger:q(e.ledgerEndingQty),ChenhLechDoiSoat:q(e.reconciliationDifference)}))
;return xe("inventory-movement-report","NhapXuatTon",Object.keys(o[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonDauKy:"",NhapMua:"",HangTraNhapKho:"",NhapKhac:"",TongNhap:"",
XuatBan:"",XuatDaoChungTu:"",XuatKhac:"",TongXuat:"",DieuChinhRong:"",TonCuoiKy:"",NguonTonCuoi:"",TonCuoiTheoLedger:"",ChenhLechDoiSoat:""}),o,e)}async function We(e={}){
const o=((await f.stockCardReport({...e,full:"1",export:"1"})).transactions||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaSP:e.productCode,SanPham:e.productName,ChungTu:e.refCode,
Loai:e.type,PhanLoai:e.category,TonTruocGiaoDich:q(e.openingQty),Nhap:q(e.inQty),Xuat:q(e.outQty),TonSauGiaoDich:q(e.balanceQty),GhiChu:e.note}))
;return xe("stock-card-report","TheKho",Object.keys(o[0]||{STT:"",Ngay:"",MaSP:"",SanPham:"",ChungTu:"",Loai:"",PhanLoai:"",TonTruocGiaoDich:"",Nhap:"",Xuat:"",TonSauGiaoDich:"",
GhiChu:""}),o,e)}async function ze(e={}){const o=((await f.financeReport({...e,full:"1",export:"1"})).fundLedger||[]).map((e,o)=>({STT:o+1,Ngay:e.date,ChungTu:e.code,Loai:e.type,
LoaiQuy:e.fundType,TaiKhoanQuy:e.account,NguoiLienQuan:e.counterparty,TonDauDong:Math.round(q(e.openingBalance)),Thu:Math.round(q(e.inAmount)),Chi:Math.round(q(e.outAmount)),
TonCuoiDong:Math.round(q(e.endingBalance)),GhiChu:e.note}));return xe("fund-report","BaoCaoQuyTien",Object.keys(o[0]||{STT:"",Ngay:"",ChungTu:"",Loai:"",LoaiQuy:"",TaiKhoanQuy:"",
NguoiLienQuan:"",TonDauDong:"",Thu:"",Chi:"",TonCuoiDong:"",GhiChu:""}),o,e)}async function Ye(e={}){const o=((await f.salesReport({...e,full:"1",export:"1"
})).bySalesman||[]).map((e,o)=>({STT:o+1,MaNVBH:e.salesmanCode,NVBH:e.salesmanName,SoDon:e.orderCount,SoKhachHang:e.customerCount,DoanhSoTruocKM:Math.round(q(e.beforePromoAmount)),
DoanhSoThucTe:Math.round(q(e.actualAmount)),GiaTriHangKM:Math.round(q(e.promotionValue)),DaThuTheoAR:Math.round(q(e.receiptAmount)),TraHangTheoAR:Math.round(q(e.returnAmount)),
ConNoTheoAR:Math.round(q(e.debtAmount))}));return xe("salesman-report","BaoCaoNVBH",Object.keys(o[0]||{STT:"",MaNVBH:"",NVBH:"",SoDon:"",SoKhachHang:"",DoanhSoTruocKM:"",
DoanhSoThucTe:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",ConNoTheoAR:""}),o,e)}async function Je(e={}){const o=((await f.deliveryReport({...e,full:"1",export:"1"
})).byStaff||[]).map((e,o)=>({STT:o+1,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoChuyen:e.tripCount,SoDonDaGiao:e.orderCount,TongTienDonCon:Math.round(q(e.totalAmount)),
DoanhSoDaXacNhan:Math.round(q(e.accountingConfirmedAmount)),ThuTienTheoQuy:Math.round(q(e.collectedAmount))}));return xe("deliveryman-report","BaoCaoNVGH",Object.keys(o[0]||{
STT:"",MaNVGH:"",NVGH:"",SoChuyen:"",SoDonDaGiao:"",TongTienDonCon:"",DoanhSoDaXacNhan:"",ThuTienTheoQuy:""}),o,e)}async function eo(e={}){const o=await f.salesReport({...e,
full:"1",export:"1"}),n=await f.periodDebtReport({...e,full:"1",export:"1",includePaid:"1"}),t=new Map((n.debts||[]).map(e=>[_(e.customerCode||e.customerName),e])),a=new Map
;(o.sales||[]).forEach(e=>{const o=_(e.customerCode||e.customerName),n=a.get(o)||{MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
SoDon:0,DoanhSoTruocKM:0,DoanhSoThucTe:0,GiaTriHangKM:0,DaThuTheoAR:0,TraHangTheoAR:0};n.SoDon+=1,n.DoanhSoTruocKM+=q(e.beforePromoAmount),n.DoanhSoThucTe+=q(e.actualAmount),
n.GiaTriHangKM+=q(e.promotionValue),n.DaThuTheoAR+=q(e.receiptAmount),n.TraHangTheoAR+=q(e.returnAmount),a.set(o,n)});const r=Array.from(a.entries()).map(([e,o],n)=>{
const a=t.get(e)||{};return{STT:n+1,...o,DoanhSoTruocKM:Math.round(o.DoanhSoTruocKM),DoanhSoThucTe:Math.round(o.DoanhSoThucTe),GiaTriHangKM:Math.round(o.GiaTriHangKM),
DaThuTheoAR:Math.round(o.DaThuTheoAR),TraHangTheoAR:Math.round(o.TraHangTheoAR),DuDauKy:Math.round(q(a.openingBalance)),DuCuoiKy:Math.round(q(a.closingBalance))}})
;return xe("customer-sales-report","DoanhSoKhachHang",Object.keys(r[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",SoDon:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",
GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DuDauKy:"",DuCuoiKy:""}),r,e)}async function oo(e={}){const o=await f.salesReport({...e,full:"1",export:"1"}),n=new Map
;(o.sales||[]).forEach(e=>(e.items||[]).forEach(e=>{const o=_(e.productCode||e.productName),t=n.get(o)||{MaSP:e.productCode,SanPham:e.productName,NhanHang:e.brand,SoLuongBan:0,
DoanhSoTruocKM:0,DoanhSoThucTe:0};t.SoLuongBan+=q(e.quantity),t.DoanhSoTruocKM+=q(e.catalogAmount),t.DoanhSoThucTe+=q(e.actualAmount),n.set(o,t)}))
;const t=Array.from(n.values()).reduce((e,o)=>e+o.DoanhSoThucTe,0)||1,a=Array.from(n.values()).map((e,o)=>({STT:o+1,...e,SoLuongBan:e.SoLuongBan,
DoanhSoTruocKM:Math.round(e.DoanhSoTruocKM),DoanhSoThucTe:Math.round(e.DoanhSoThucTe),ChietKhauKM:Math.round(e.DoanhSoTruocKM-e.DoanhSoThucTe),
TyTrong:`${j(e.DoanhSoThucTe/t*100,2)}%`}));return xe("product-sales-report","DoanhSoSanPham",Object.keys(a[0]||{STT:"",MaSP:"",SanPham:"",NhanHang:"",SoLuongBan:"",
DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",TyTrong:""}),a,e)}
const no=new Set(["password","passwordHash","hash","salt","token","tokens","accessToken","refreshToken","secret","apiKey","session","sessions","resetPasswordToken","verificationToken"])
;function to(e={},o=[]){for(const n of o){const o=_(e[n]);if(o)return o}return""}function ao(e){return!0===e?"Hoạt động":!1===e?"Ngưng hoạt động":_(e)}function ro(e={},o=[],n=[]){
const t=new Set([...o,...n,"_id","__v","searchText"]),a={};return Object.keys(e||{}).forEach(o=>{if(t.has(o))return;const n=e[o];null!=n&&""!==n&&(a[o]=n)}),
Object.keys(a).length?JSON.stringify(a):""}function io(e={},o=0,n=new Map){const t=to(e,["code","productCode","sku","id"]),a=n.get(_(t).toUpperCase())||{};return{STT:o+1,MaSP:t,
TenSP:to(e,["name","productName","title"]),Barcode:to(e,["barcode","barCode"]),NhanHang:to(e,["brand","brandName"]),NganhHang:to(e,["category","categoryName","groupName"]),
DonVi:to(e,["unit","baseUnit","uom"]),DonViCoSo:to(e,["baseUnit","unit"]),QuyDoi:q(e.conversionRate||e.ratio||1),
"Quy cách":Math.max(1,q(e.conversionRate||e.packingQty||e.unitsPerCase||1)),"Giá bán":Math.round(q(e.salePrice||e.price||e.sellPrice)),
GiaVon:Math.round(q(e.costPrice||e.cost||e.purchasePrice)),TonVatLy:q(a.onHand??a.quantity??a.qty),DaGiuCho:q(a.reservedQty),TonKhaDung:q(a.availableQty),
KhuBocHang:K(v(H(e),b.HC)),TrangThai:ao(e.isActive??e.status),NgayTao:$(e.createdAt),NgayCapNhat:$(e.updatedAt),
ThongTinKhac:ro(e,["code","productCode","sku","name","productName","barcode","brand","category","unit","baseUnit","conversionRate","packing","salePrice","costPrice","pickingZone","warehouseCode","warehouseName","defaultWarehouse","isActive","status","createdAt","updatedAt"])
}}async function uo(e={}){const[o,n]=await Promise.all([d.find({}).sort({code:1,name:1}).limit(Pe(e)).lean(),f.stockReport({full:"1",export:"1"
})]),t=new Map((n.stock||n.items||[]).map(e=>[_(e.productCode||e.code).toUpperCase(),e])),a=o.map((e,o)=>io(e,o,t))
;return xe("product-info-report","ThongTinSanPham",Object.keys(a[0]||io({},-1,t)),a,e)}function co(e={}){return[e.customerCode,e.customerId,e.customerName].map(_).filter(Boolean)}
async function so(){const o=await f.periodDebtReport({dateFrom:"0000-01-01",dateTo:e.todayVN(),full:"1",export:"1",includePaid:"1"}),n=new Map
;return(o.debts||o.items||[]).forEach(e=>{const o=q(e.closingBalance);co(e).forEach(e=>n.set(e,o))}),n}async function ho(o={}){
const n=e.todayVN(),t=_(o.monthStart||o.monthFrom||`${n.slice(0,7)}-01`),a=_(o.monthEnd||o.monthTo||n),r=await f.salesReport({dateFrom:t,dateTo:a,full:"1",export:"1"}),i=new Map
;return(r.sales||r.items||[]).forEach(e=>{const o=q(e.actualAmount);[e.customerCode,e.customerId,e.customerName].map(_).filter(Boolean).forEach(e=>{i.set(e,q(i.get(e))+o)})}),i}
function To(e,o=[]){for(const n of o.map(_).filter(Boolean))if(e.has(n))return q(e.get(n));return 0}function lo(e={},o=0,n=new Map,t=new Map){
const a=Q(e),r=I(e),i=[e.code,e.customerCode,e.id,e._id,e.name,e.customerName];return{STT:o+1,MaKH:to(e,["code","customerCode","id"]),TenKH:to(e,["name","customerName"]),
TenHoKinhDoanh:r.businessName,SDT:to(e,["phone","mobile","customerPhone","tel"]),DiaChi:to(e,["address","customerAddress","fullAddress"]),MaSoThue:a.taxCode,
DiaChiHoaDonThue:a.taxInvoiceAddress,Tuyen:to(e,["route","routeName","line"]),KhuVuc:to(e,["area","areaName","region","province"]),
MaNVBH:to(e,["staffCode","salesStaffCode","salesmanCode"]),NVBHPhuTrach:to(e,["staffName","salesStaffName","salesmanName"]),MaNVGH:to(e,["deliveryStaffCode","shipperCode"]),
NVGHPhuTrach:to(e,["deliveryStaffName","shipperName"]),CongNoHienTai:Math.round(To(n,i)),DoanhSoThang:Math.round(To(t,i)),TrangThai:ao(e.isActive??e.status),NgayTao:$(e.createdAt),
NgayCapNhat:$(e.updatedAt),
ThongTinKhac:ro(e,["code","customerCode","name","customerName","businessName","customerBusinessName","householdBusinessName","taxBusinessName","invoiceBusinessName","tenHoKinhDoanh","phone","mobile","customerPhone","address","customerAddress","taxCode","customerTaxCode","taxNumber","vatNumber","vatCode","mst","taxInvoiceAddress","customerTaxInvoiceAddress","invoiceAddress","vatInvoiceAddress","billingAddress","route","area","region","staffCode","staffName","salesStaffCode","salesStaffName","deliveryStaffCode","deliveryStaffName","isActive","status","createdAt","updatedAt"])
}}async function mo(e={}){const[o,n,t]=await Promise.all([s.find({}).sort({code:1,name:1
}).limit(Pe(e)).lean(),so(),ho(e)]),a=o.map((e,o)=>lo(e,o,n,t)).sort((e,o)=>q(o.CongNoHienTai)-q(e.CongNoHienTai)||_(e.MaKH).localeCompare(_(o.MaKH)));return a.forEach((e,o)=>{
e.STT=o+1}),xe("customer-info-report","ThongTinKhachHang",Object.keys(a[0]||lo({},-1)),a,e)}function go(e={}){const o={};return Object.keys(e||{}).forEach(n=>{
if(no.has(n)||n.startsWith("_")||["__v","searchText"].includes(n))return
;if(["username","fullName","name","code","staffCode","role","roles","phone","email","isActive","status","permissions","area","route","lastLoginAt","lastLogin","createdAt","updatedAt"].includes(n))return
;const t=e[n];null!=t&&""!==t&&(o[n]=t)}),Object.keys(o).length?JSON.stringify(o):""}function po(e={},o=0){return{STT:o+1,TenDangNhap:to(e,["username","loginName"]),
HoTen:to(e,["fullName","name","displayName"]),MaNhanVien:to(e,["staffCode","code","employeeCode"]),VaiTro:Array.isArray(e.roles)?e.roles.join(", "):to(e,["role","roles"]),
SDT:to(e,["phone","mobile"]),Email:to(e,["email"]),TrangThai:ao(e.isActive??e.status),
QuyenTruyCap:Array.isArray(e.permissions)?e.permissions.join(", "):_(e.permissions||e.permission||""),KhuVucTuyen:to(e,["area","route","region"]),NgayTao:$(e.createdAt),
NgayCapNhat:$(e.updatedAt),LanDangNhapGanNhat:$(e.lastLoginAt||e.lastLogin||e.lastSeenAt),ThongTinKhac:go(e)}}async function fo(e={}){
const o=p.users,n=(await o.find({}).select("-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken").sort({
role:1,code:1,username:1}).limit(Pe(e)).lean()).map(po);return xe("user-info-report","ThongTinTaiKhoan",Object.keys(n[0]||po({},-1)),n,e)}async function yo(e){return a.preview(e)}
async function So(e){return a.commit(e)}async function Co(){return a.logs()}function No(){return r.getBuiltInTemplates()}async function Do(e){return r.buildBuiltInTemplateFile(e)}
function Mo(e){return r.getFields(e)}async function Ao(){return r.listCustomTemplates()}async function vo(e){return r.saveCustomTemplate(e)}async function Ho(e){
return r.deleteCustomTemplate(e)}async function Ko(e){return r.buildCustomTemplateFile(e)}function bo(e={}){return(e.definition?.columns||[]).map(e=>Array.isArray(e)?{key:e[0],
label:e[1]||e[0]}:{key:e.key,label:e.label||e.key}).filter(e=>_(e.key))}async function Po(e,o={},n={}){const t=_(o.__legacyExportType||""),a=await y.run(e,{...o,__exportAll:!0,
__legacyBridge:t?{legacyExportType:t,mappedReportCode:e,bridgedToReportCenter:!0}:null},n),r=bo(a),i=r.map(e=>e.label),u=(a.rows||[]).map((e,o)=>{const n={STT:o+1}
;for(const o of r)n[o.label]=e[o.key]??"";return n});return xe(e,_(a.definition?.title||e).slice(0,31)||"BaoCao",["STT",...i],u,o,a.sourceNote)}function ko(){
return[...new Set([...i.getExportTypes(),"invoice-orders","vatInvoiceTT78","vat-non-invoice-orders","sse-invoice-orders","sse-invoice-errors",...Object.keys(S)])].sort()}
async function Vo(o,n={},t={}){const a=String(o||"").trim();if(["sse-invoice-orders","sseInvoiceOrders"].includes(a))return P.buildSseInvoiceWorkbook(n,t)
;if(["sse-invoice-errors","sseInvoiceErrors"].includes(a))return P.buildSseErrorReportWorkbook(n,t);if(["invoice-orders","invoiceOrders"].includes(a)){const e=l(n.invoiceType)
;return e?e===T.VAT?De(n,t):ve(n,t):{error:"invoiceType chỉ nhận VAT hoặc NON_VAT",status:400}}
if(["vatInvoiceTT78","vat-invoice-tt78","hoa-don-vat-tt78"].includes(a))return De(n,t);if(["vat-non-invoice-orders","vatNonInvoiceOrders"].includes(a))return ve(n,t);const r=C(a)
;if(r)return Po(r,{...n,__legacyExportType:a},t);const u=await i.findForExport(o,n);if(!u)return{error:"Loại dữ liệu export không hợp lệ",status:400};const c=await O({type:o,rows:u
}),s=String(o||"data").replace(/[^a-zA-Z0-9_-]/g,"-");return{buffer:c,rows:u.length,fileName:`${s}-export-${e.todayVN()}.xlsx`}}module.exports={previewImport:yo,commitImport:So,
getImportLogs:Co,getBuiltInTemplates:No,buildBuiltInTemplateFile:Do,getFields:Mo,listCustomTemplates:Ao,saveCustomTemplate:vo,deleteCustomTemplate:Ho,buildCustomTemplateFile:Ko,
getExportTypes:ko,exportToExcel:Vo};
