/* GENERATED FILE — edit src/services/importExportLegacy.service.source/part-01.jsfrag, src/services/importExportLegacy.service.source/part-02.jsfrag, src/services/importExportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{createWorkbook:n,appendAoaSheet:o,writeWorkbook:t}=require("../utils/excelWriter.util"),a=require("./excelImportService"),r=require("./import-template/LegacyImportTemplateAdapter"),i=require("../repositories/exportRepository"),u=require("../models/SalesOrder"),c=require("../models/ReturnOrder"),s=require("../models/Customer"),d=require("../models/Product"),h=require("./excel/ProductExcelEnrichmentService"),{INVOICE_TYPES:T,normalizeInvoiceType:l,resolveInvoiceType:m,isActiveInvoiceOrder:g}=require("./invoiceExportClassifier"),p=require("../models"),f=require("./reportService"),y=require("./reports/ReportCenterService"),{LEGACY_EXPORT_TYPE_TO_REPORT_CODE:S,reportCodeForLegacyExport:C}=require("./reports/ReportLegacyExportMap"),{pickSalesStaffCode:N,pickSalesStaffName:D,pickDeliveryStaffCode:M,pickDeliveryStaffName:A}=require("../domain/staff/staffIdentity"),{normalizePickingZone:v,pickingZoneFrom:H,pickingZoneLabel:K,PICKING_ZONES:b}=require("../utils/pickingZone.util"),P=require("./sseInvoiceExport.service"),k=require("./invoiceExportQuery.service"),V=require("./invoiceNetSales.service")
;function x(e={}){const n={...e};return delete n._id,delete n.__v,n}function R(e){return null==e?"":Array.isArray(e)||"object"==typeof e?JSON.stringify(e):e}function O(e=[]){
const n=e.map(x),o=new Set;n.forEach(e=>Object.keys(e).forEach(e=>o.add(e)));const t=Array.from(o),a=n.map(e=>t.map(n=>R(e[n])));return{headers:t,body:a}}function G(e=""){
return"products"===L(e).toLowerCase()?["productCode","code","sku","barcode"]:h.PRODUCT_CODE_KEYS}async function B({type:e,rows:a}){const r=G(e),i=await h.enrichRows(a,{
productCodeKeys:r,packingKey:"Quy cách",salePriceKey:"Giá bán"}),{headers:u,body:c}=O(i.rows),s=n();o(s,"Export",[u,...c]);const d=h.documentProductLines(a);if(d.length){
const e=(await h.enrichRows(d,{packingKey:"Quy cách",salePriceKey:"Giá bán"})).rows.map(e=>({MaChungTu:e.documentCode,MaSP:Z(e),SanPham:W(e),"Quy cách":e["Quy cách"],
"Giá bán":e["Giá bán"],SoLuong:Y(e),GiaSauKM:_(e.finalPrice??e.priceAfterPromotion??e.discountedPrice??""),ThanhTien:oe(e)
})),n=["MaChungTu","MaSP","SanPham","Quy cách","Giá bán","SoLuong","GiaSauKM","ThanhTien"];o(s,"ChiTietSanPham",[n,...e.map(e=>n.map(n=>e[n]??""))])}
return o(s,"ThongTin",[["Loại dữ liệu",e],["Số dòng",a.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc sản phẩm","Nếu có sản phẩm: Quy cách là số lượng đóng gói; Giá bán lấy từ danh mục sản phẩm. Đơn con giữ thêm Giá sau KM."]]),
t(s)}
const w=.08,{extractCustomerTaxProfile:Q}=require("../utils/customerTaxProfile.util"),{extractCustomerBusinessProfile:E}=require("../utils/customerBusinessProfile.util"),I=["STT","NgayHoaDon","MaKhachHang","TenKhachHang","TenNguoiMua","MaSoThue","DiaChiKhachHang","DienThoaiKhachHang","SoTaiKhoan","NganHang","HinhThucTT","MaSanPham","SanPham","DonViTinh","Extra1SP","Extra2SP","SoLuong","DonGia","TyLeChietKhauHienThi","SoTienChietKhau","ThanhTien","TienBan","ThueSuat","TienThueSanPham","TienThue","TongCong","TinhChatHangHoa","DonViTienTe","TyGia","Fkey","Extra1","Extra2","EmailKhachHang","VungDuLieu","Extra3","Extra4","Extra5","Extra6","Extra7","Extra8","Extra9","Extra10","Extra11","Extra12","LOONo","HDSe","xVTNXHan","NVChuan","PTChuyenKhoan","HDKTTu","CCCDan"]
;function L(e){return String(e??"").trim()}function _(e,n=0){const o=Number(String(e??"").replace(/,/g,""));return Number.isFinite(o)?o:n}function q(e,n=2){const o=10**n
;return Math.round(_(e)*o)/o}function j(n){return e.toDateOnly(n||"")||L(n).slice(0,10)}function $(e,n={}){
const o=j(e),t=j(n.dateFrom||n.from||n.fromDate||""),a=j(n.dateTo||n.to||n.toDate||"");return!(t&&o<t||a&&o>a)}function F(e={}){return g(e)}function X(e={}){
return[e.id,e._id,e.code,e.orderCode,e.documentCode,e.salesOrderId,e.salesOrderCode,e.externalOrderCode,e.invoiceCode,e.refCode].map(L).filter(Boolean)}function U(e={}){
return L(e.code||e.orderCode||e.salesOrderCode||e.documentCode||e.id||e._id)}function Z(e={}){return L(e.productCode||e.code||e.sku||e.barcode||e.productId||e.id)}function W(e={}){
return L(e.productName||e.name||e.itemName||e.productTitle||"")}function z(e={},n={}){return L(e.unit||e.baseUnit||e.dvt||e.uom||n.unit||n.baseUnit||"")}function Y(e={}){
return _(e.quantity??e.qty??e.totalQty??e.qtySale??e.saleQty??0)}function J(e={}){return _(e.returnQty??e.qtyReturn??e.returnQuantity??e.returnedQty??0)}function ee(e={}){
return L(e.lineKey||e.orderLineId||e.salesOrderItemId||e.itemId||e._id||"")}function ne(e={}){
return _(e.finalPrice??e.priceAfterPromotion??e.promoPrice??e.price??e.salePrice??e.unitPrice??e.sellPrice??0)}function oe(e={}){
return _(e.amount??e.totalAmount??e.lineAmount??e.money??0)||Y(e)*ne(e)}function te(e,n){return`${L(e)}@@${L(n)}`}function ae(e={}){const n=ne(e);return n?String(q(n,6)):""}
function re(e,n,o="",t=""){return[L(e),L(n),L(o),L(t)].join("@@")}function ie(e={}){return L(e.code||e.id||e.returnOrderCode||e.documentCode||e._id)}function ue(e={}){
return L(e.id||e._id||e.code||e.returnOrderCode||e.documentCode)}function ce(e={}){
const n=e.updatedAt||e.modifiedAt||e.createdAt||e.date||e.documentDate||"",o=n?new Date(n).getTime():0;return Number.isFinite(o)?o:0}function se(){return{status:{
$nin:["void","cancelled","canceled","deleted","removed"]},returnStatus:{$nin:["void","cancelled","canceled","deleted","removed"]}}}function de(e,n,o,t={}){if(!n||!o)return
;e.set(n,_(e.get(n))+o),e.__sourceMap||(e.__sourceMap=new Map);const a=e.__sourceMap.get(n)||{codes:new Set,ids:new Set,sourceRows:[]};t.code&&a.codes.add(t.code),
t.id&&a.ids.add(t.id),t.sourceRow&&a.sourceRows.push(t.sourceRow),e.__sourceMap.set(n,a)}function he(e,n){const o=e&&e.__sourceMap;if(!o)return{ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const t=o.get(n);if(!t)return{ReturnOrderCode:"",ReturnOrderId:"",ReturnQtySource:""}
;const a=Array.from(t.codes||[]).filter(Boolean),r=Array.from(t.ids||[]).filter(Boolean),i=Array.from(t.sourceRows||[]).filter(Boolean);return{ReturnOrderCode:a.join(", "),
ReturnOrderId:r.join(", "),ReturnQtySource:i.join(" | ")}}function Te(e=[]){const n=new Map,o=new Map;for(const n of e||[]){if(!F(n))continue
;const e=ie(n),t=ue(n),a=ce(n),r=Array.from(new Set([n.salesOrderId,n.orderId,n.sourceOrderId,n.deliveryOrderId,n.salesOrderCode,n.orderCode,n.sourceOrderCode,n.deliveryOrderCode,n.originalOrderCode].map(L).filter(Boolean)))
;if(!r.length)continue;const i=L(n.salesOrderCode||n.orderCode||n.salesOrderId||n.orderId||r[0]);for(const u of Array.isArray(n.items)?n.items:[]){const n=Z(u);if(!n)continue
;const c=J(u);if(!c)continue;const s=ee(u),d=ae(u),h=`${e||t||"RETURN_ORDER"}:${i}:${n}:${c}`,T=[e||t,i,n,s||"",d||""].map(L).join("@@"),l={roKeys:r,pcode:n,qty:c,lineKey:s,
priceKey:d,roCode:e,roId:t,updatedMs:a,sourceRow:h},m=o.get(T);(!m||a>=m.updatedMs)&&o.set(T,l)}}for(const e of o.values()){
const{roKeys:o,pcode:t,qty:a,lineKey:r,priceKey:i,roCode:u,roId:c,sourceRow:s}=e,d={code:u,id:c,sourceRow:s}
;for(const e of o)de(n,r&&i?re(e,t,r,i):r?re(e,t,r,""):i?re(e,t,"",i):te(e,t),a,d)}return n}function le(e,n={},o={}){const t=Z(o);if(!t)return{qty:0,ReturnOrderCode:"",
ReturnOrderId:"",ReturnQtySource:""};const a=ee(o),r=ae(o);let i={qty:0,key:""};for(const o of X(n)){
const n=[a&&r?re(o,t,a,r):"",a?re(o,t,a,""):"",r?re(o,t,"",r):"",te(o,t)].filter(Boolean);for(const o of n){const n=_(e.get(o));if(n>i.qty&&(i={qty:n,key:o}),n)break}}return{
qty:i.qty,...he(e,i.key)}}function me(e,n={},o={}){return le(e,n,o).qty}function ge(e={}){return L(e.customerCode||e.customerId||e.customerName||e.customerPhone||"")}
function pe(e=[]){const n=new Map;for(const o of e||[])[o.code,o.customerCode,o.id,o._id,o.name,o.customerName,o.phone,o.mobile].map(L).filter(Boolean).forEach(e=>n.set(e,o))
;return n}function fe(e=[]){const n=new Map;for(const o of e||[])[o.code,o.productCode,o.sku,o.barcode,o.id,o._id].map(L).filter(Boolean).forEach(e=>n.set(e,o));return n}
function ye(e={},n=new Map){
const o=n.get(L(e.customerCode))||n.get(L(e.customerId))||n.get(L(e.customerName))||{},t=Q(e),a=Q(o),r=E(e),i=E(o),u=L(e.customerName||o.name||o.customerName),c=L(r.businessName||i.businessName)
;return{code:L(e.customerCode||o.code||o.customerCode||e.customerId||o.id),name:c||u,buyer:L(e.buyerName||e.contactName||o.buyerName||o.representative||o.contactName||u),
taxCode:L(t.taxCode||a.taxCode),address:L(t.taxInvoiceAddress||a.taxInvoiceAddress||e.customerAddress||e.address||o.address||o.deliveryAddress),
phone:L(e.customerPhone||e.phone||o.phone||o.mobile),bankAccount:L(o.bankAccount||o.accountNumber||e.bankAccount),bankName:L(o.bankName||e.bankName),
email:L(o.email||e.customerEmail||e.email)}}function Se(e={}){const n=L(e.paymentMethod||e.paymentType||e.method||e.hinhThucTT||"");if(n)return n
;const o=_(e.cashAmount||e.collectedCashAmount),t=_(e.bankAmount||e.transferAmount||e.collectedBankAmount);return o&&t?"TM/CK":t?"CK":"TM/CK"}
function Ce({orders:n,returnOrders:o,customers:t,products:a,query:r={}}){const i=pe(t),u=fe(a),c=[],s=[],d=[];let l=0
;const g=(n||[]).filter(F).filter(e=>m(e)===T.VAT).filter(e=>k.matchesInvoiceExportFilters(e,r,{invoiceGroup:T.VAT})).filter(e=>{if(!r.customerCode&&!r.customerId)return!0
;const n=L(r.customerCode||r.customerId);return[e.customerCode,e.customerId,e.customerName].map(L).includes(n)
}).sort((e,n)=>L(e.orderDate||e.date||e.documentDate||e.createdAt).localeCompare(L(n.orderDate||n.date||n.documentDate||n.createdAt))||U(e).localeCompare(U(n))),p=V.buildNetSaleDataset({
orders:g,returnOrders:o,isEligibleReturnOrder:k.isEligibleReturnOrder});for(const n of p.orders){
const o=n.order,t=[],a=ye(o,i),r=U(o),T=j(o.orderDate||o.date||o.documentDate||o.createdAt||e.todayVN());for(const e of n.lines){
const n=e.item,o=e.productCode,a=u.get(o)||{},i=W(n)||L(a.name||a.productName),c=e.soldQty,s=e.returnedQty,T=e.netQty,l=ne(n)||(c?oe(n)/c:0),m=V.sourceSummary(e);if(!o||T<=0){
o||d.push({code:"MISSING_PRODUCT_CODE",orderCode:r,message:"Dòng bán thiếu productCode nên không thể đưa vào dataset hóa đơn."});continue}const g=q(l/1.08,6),p=q(T*g,2);t.push({
productCode:o,productName:i,unit:z(n,a),catalogPackingQty:h.catalogPackingQty(a),catalogSalePrice:h.catalogSalePrice(a),soldQty:c,returnQty:s,safeReturnQty:s,invoiceQty:T,
priceInclVat:l,unitPriceBeforeVat:g,lineAmountBeforeVat:p,returnOrderCode:m.ReturnOrderCode,returnOrderId:m.ReturnOrderId,returnQtySource:m.ReturnQtySource})}
if(!t.length||n.fullyReturned)continue;l+=1;const m=q(t.reduce((e,n)=>e+n.lineAmountBeforeVat,0),2),g=q(m*w,2),p=Math.round(m+g);p<=0||t.forEach((e,n)=>{const t=0===n;c.push({
STT:t?l:"",NgayHoaDon:t?T:"",MaKhachHang:t?a.code:"",TenKhachHang:t?a.name:"",TenNguoiMua:t?a.buyer:"",MaSoThue:t?a.taxCode:"",DiaChiKhachHang:t?a.address:"",
DienThoaiKhachHang:t?a.phone:"",SoTaiKhoan:t?a.bankAccount:"",NganHang:t?a.bankName:"",HinhThucTT:t?Se(o):"",MaSanPham:e.productCode,SanPham:e.productName,DonViTinh:e.unit,
Extra1SP:e.catalogPackingQty,Extra2SP:e.catalogSalePrice,SoLuong:e.invoiceQty,DonGia:e.unitPriceBeforeVat,TyLeChietKhauHienThi:"",SoTienChietKhau:"",
ThanhTien:e.lineAmountBeforeVat,TienBan:t?m:"",ThueSuat:t?8:"",TienThueSanPham:"",TienThue:t?g:"",TongCong:t?p:"",TinhChatHangHoa:0,DonViTienTe:t?"VND":"",TyGia:"",Fkey:t?r:"",
Extra1:"",Extra2:"",EmailKhachHang:t?a.email:"",VungDuLieu:"",Extra3:"",Extra4:"",Extra5:"",Extra6:"",Extra7:"",Extra8:"",Extra9:"",Extra10:"",Extra11:"",Extra12:"",LOONo:"",
HDSe:"",xVTNXHan:"",NVChuan:"",PTChuyenKhoan:"",HDKTTu:"",CCCDan:""}),s.push({MaDon:r,MaKhachHang:a.code,TenKhachHang:a.name,MaSoThue:a.taxCode,DiaChiHoaDon:a.address,
MaSanPham:e.productCode,SanPham:e.productName,"Quy cách":e.catalogPackingQty,"Giá bán":e.catalogSalePrice,SoLuongBan:e.soldQty,SoLuongTra:e.returnQty,
SoLuongTraAnToan:e.safeReturnQty,SoLuongXuatHoaDon:e.invoiceQty,GiaSauKhuyenMaiCoVAT:e.priceInclVat,DonGiaTruocVAT:e.unitPriceBeforeVat,ThanhTienTruocVAT:e.lineAmountBeforeVat,
ReturnOrderCode:e.returnOrderCode,ReturnOrderId:e.returnOrderId,ReturnQtySource:e.returnQtySource,LyDoBoDong:""})})}return{rows:c,auditRows:s,warnings:[...p.warnings,...d]}}
async function Ne(a={},r={}){const i=k.normalizeExportQuery(a,{invoiceGroup:T.VAT
}),u=i.dateFrom||"0000-01-01",c=i.dateTo||"9999-12-31",{orders:s,returnOrders:d,customers:h,products:l}=await k.loadInvoiceExportData({query:a,invoiceGroup:T.VAT,currentUser:r
}),{rows:m,auditRows:g,warnings:p=[]}=Ce({orders:s,returnOrders:d,customers:h,products:l,query:a});if(!m.length)return{
error:"Không có đơn VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",status:404,code:"INVOICE_EXPORT_NO_DATA"};const f=n(),y=[I,...m.map(e=>I.map(n=>e[n]??""))]
;o(f,"Sheet1",y,{autoFilter:!0})
;const S=["MaDon","MaKhachHang","TenKhachHang","MaSoThue","DiaChiHoaDon","MaSanPham","SanPham","Quy cách","Giá bán","SoLuongBan","SoLuongTra","SoLuongTraAnToan","SoLuongXuatHoaDon","GiaSauKhuyenMaiCoVAT","DonGiaTruocVAT","ThanhTienTruocVAT","ReturnOrderCode","ReturnOrderId","ReturnQtySource","LyDoBoDong"]
;o(f,"DoiChieu",[S,...g.map(e=>S.map(n=>e[n]??""))]);const C=m.reduce((e,n)=>(""!==n.TienBan&&(e.invoiceCount+=1,e.amountBeforeVat+=_(n.TienBan),e.vatAmount+=_(n.TienThue),
e.totalAmount+=_(n.TongCong)),e.lineCount+=n.MaSanPham?1:0,e),{invoiceCount:0,lineCount:0,amountBeforeVat:0,vatAmount:0,totalAmount:0})
;o(f,"ThongTin",[["Mẫu","TT78 - Sheet1"],["Từ ngày","0000-01-01"===u?"":u],["Đến ngày","9999-12-31"===c?"":c],["Số hóa đơn",C.invoiceCount],["Số dòng sản phẩm",C.lineCount],["Tiền bán trước thuế",q(C.amountBeforeVat,2)],["Tiền thuế 8%",q(C.vatAmount,2)],["Tổng cộng",Math.round(C.totalAmount)],["Quy tắc","Số lượng xuất HĐ = số lượng bán - số lượng trả; Đơn giá = giá sau khuyến mại trên đơn / 1.08"]])
;const N=t(f),D="0000-01-01"===u?"all":u,M="9999-12-31"===c?e.todayVN():c;return{buffer:N,rows:m.length,orderCount:C.invoiceCount,warningCount:p.length,warnings:p.slice(0,100),
fileName:`Hoa_don_VAT_TT78_${D}_${M}.xlsx`}}function De(e={}){
return[L(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH),L(e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName)].filter(Boolean).join(" - ")
}function Me(e={}){return L(e.orderSourceName||e.orderSource||e.source||e.sourceType||e.importSource||"")}async function Ae(a={},r={}){const i=k.normalizeExportQuery(a,{
invoiceGroup:T.NON_VAT}),u=i.dateFrom||"0000-01-01",c=i.dateTo||"9999-12-31",{orders:s,returnOrders:d,customers:l,products:g}=await k.loadInvoiceExportData({query:a,
invoiceGroup:T.NON_VAT,currentUser:r}),p=(s||[]).filter(F).filter(e=>m(e)===T.NON_VAT).filter(e=>k.matchesInvoiceExportFilters(e,a,{invoiceGroup:T.NON_VAT
})),f=Te(d),y=pe(l),S=fe(g),C=[],N=[];let D=0,M=0,A=0;p.forEach((e,n)=>{const o=ye(e,y),t=U(e);let a=0,r=0;for(const n of Array.isArray(e.items)?e.items:[]){
const o=Z(n),i=S.get(o)||{},u=Y(n),c=Math.min(u,me(f,e,n)),s=Math.max(0,u-c),d=ne(n)||(u?oe(n)/u:0),T=q(s*d,2);a+=q(c*d,2),r+=T,N.push({"Mã đơn":t,"Mã sản phẩm":o,
"Tên sản phẩm":W(n)||L(i.name||i.productName),"Quy cách":h.catalogPackingQty(i),"Giá bán":h.catalogSalePrice(i),"Số lượng bán":u,"Số lượng trả":c,"Số lượng còn lại":s,"Đơn giá":d,
"Thành tiền":T})}const i=_(e.totalAmount||e.grandTotal||0),u=_(e.paidAmount||e.paymentAmount||0),c=_(e.debtAmount??Math.max(0,i-u));D+=i,M+=a,A+=r,C.push({STT:n+1,
"Ngày bán":j(e.orderDate||e.date||e.documentDate||e.createdAt),"Mã đơn":t,"Mã khách hàng":o.code,"Tên khách hàng":o.name,NVBH:De(e),"Nguồn đơn":Me(e),"Giá trị đơn":i,
"Tiền đã thu":u,"Công nợ":c,"Lý do không xuất":L(e.vatInvoiceNote),"Người thay đổi":L(e.vatInvoiceUpdatedBy),"Thời gian thay đổi":L(e.vatInvoiceUpdatedAt)})})
;const v=N.filter(e=>Number(e["Số lượng còn lại"])>0);if(!C.length||!v.length)return{error:"Không có đơn không VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",
status:404,code:"INVOICE_EXPORT_NO_DATA"};const H=n()
;Pe(H,"DanhSachDon",["STT","Ngày bán","Mã đơn","Mã khách hàng","Tên khách hàng","NVBH","Nguồn đơn","Giá trị đơn","Tiền đã thu","Công nợ","Lý do không xuất","Người thay đổi","Thời gian thay đổi"],C),
Pe(H,"ChiTietHang",["Mã đơn","Mã sản phẩm","Tên sản phẩm","Quy cách","Giá bán","Số lượng bán","Số lượng trả","Số lượng còn lại","Đơn giá","Thành tiền"],N),
o(H,"ThongTin",[["Từ ngày","0000-01-01"===u?"":u],["Đến ngày","9999-12-31"===c?"":c],["Số đơn không xuất hóa đơn",C.length],["Tổng giá trị đơn",q(D,2)],["Tổng hàng trả",q(M,2)],["Giá trị còn lại",q(A,2)]])
;const K=t(H),b="0000-01-01"===u?"all":u,P="9999-12-31"===c?e.todayVN():c,V=b===P?b:`${b}_${P}`;return{buffer:K,rows:v.length,orderCount:C.length,
fileName:`Hoa_don_khong_VAT_${V}.xlsx`}}
const ve=["sales-report","delivery-report","return-report","debt-report","ar-ledger-detail","stock-report","inventory-movement-report","stock-card-report","fund-report","salesman-report","deliveryman-report","customer-sales-report","product-sales-report","product-info-report","customer-info-report","user-info-report"]
;function He(e={}){return{from:j(e.dateFrom||e.from||e.fromDate||""),to:j(e.dateTo||e.to||e.toDate||"")}}function Ke(e={},n=["date","createdAt"]){const{from:o,to:t}=He(e)
;return o||t?{$or:n.map(e=>({[e]:{...o?{$gte:o}:{},...t?{$lte:"createdAt"===e?`${t}T23:59:59.999Z`:t}:{}}}))}:{}}function be(e={}){
return Math.min(Math.max(Number(e.limit||1e5),1),2e5)}function Pe(e,n,t,a){const r=a.map(e=>t.map(n=>e[n]??""));o(e,String(n||"BaoCao").slice(0,31),[t,...r])}function ke(e=""){
return{"stock-report":"Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.",
"inventory-movement-report":"Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.",
"stock-card-report":"Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.",
"sales-report":"Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.",
"return-report":"Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.","debt-report":"Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.",
"ar-ledger-detail":"Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.","fund-report":"Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.",
"delivery-report":"Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.",
"product-info-report":"Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.",
"customer-info-report":"Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán."
}[e]||"Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống."}async function Ve(a,r,i,u,c={}){const s=await h.enrichRows(u,{packingKey:"Quy cách",salePriceKey:"Giá bán"
}),d=[...i];s.hasProducts&&(d.includes("Quy cách")||d.push("Quy cách"),d.includes("Giá bán")||d.push("Giá bán"));const T=n();Pe(T,r,d,s.rows);const{from:l,to:m}=He(c)
;o(T,"ThongTin",[["Mẫu báo cáo",r],["Từ ngày",l],["Đến ngày",m],["Số dòng",s.rows.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc nghiệp vụ",ke(a)]])
;const g=String(a||"report").replace(/[^a-zA-Z0-9_-]/g,"-"),p=`${l||"all"}_${m||e.todayVN()}`;return{buffer:t(T),rows:s.rows.length,fileName:`${g}_${p}.xlsx`}}function xe(e={}){
return Array.isArray(e.items)?e.items:[]}function Re(e={}){return xe(e).reduce((e,n)=>e+Y(n),0)||_(e.totalQuantity||e.quantity||0)}function Oe(e={},n={}){
return _(e.originalPrice??e.basePrice??e.listPrice??n.salePrice??e.salePrice??e.price??e.unitPrice??0)}function Ge(e={},n={}){return Y(e)*Oe(e,n)}function Be(e={}){
return _(e.finalAmount??e.amount??e.totalAmount??e.lineAmount??0)||Y(e)*ne(e)}function we(e={},n=new Map){
return xe(e).reduce((e,o)=>e+Ge(o,n.get(Z(o))||{}),0)||_(e.beforePromoAmount||e.grossAmount||e.totalBeforeDiscount||e.totalAmount||0)}function Qe(e={}){
return _(e.afterPromoAmount||e.totalAfterPromotion||e.totalAmount||e.amount||0)}function Ee(e={},n="sales"){return L("delivery"===n?A(e):D(e))}function Ie(e={},n="sales"){
return L("delivery"===n?M(e):N(e))}async function Le(){const e=await d.find({}).select("code name salePrice conversionRate baseUnit unit brand category").lean()
;return new Map(e.map(e=>[L(e.code),e]))}async function _e(e={}){const n=((await f.salesReport({...e,full:"1",export:"1"})).sales||[]).map((e,n)=>({STT:n+1,Ngay:e.date,
MaDon:e.code,Nguon:e.source,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,
SoLuongBan:e.saleQuantity,SoLuongKhuyenMai:e.promoQuantity,DoanhSoTruocKM:Math.round(_(e.beforePromoAmount)),DoanhSoThucTe:Math.round(_(e.actualAmount)),
ChietKhauKM:Math.round(_(e.promotionDiscountAmount)),GiaTriHangKM:Math.round(_(e.promotionValue)),DaThuTheoAR:Math.round(_(e.receiptAmount)),
TraHangTheoAR:Math.round(_(e.returnAmount)),DieuChinhCongNo:Math.round(_(e.adjustmentAmount)),ConNoTheoAR:Math.round(_(e.debtAmount)),TrangThaiGiaoHang:e.deliveryStatus,
TrangThaiKeToan:e.accountingStatus}));return Ve("sales-report","BaoCaoBanHang",Object.keys(n[0]||{STT:"",Ngay:"",MaDon:"",Nguon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",
MaNVGH:"",NVGH:"",SoLuongBan:"",SoLuongKhuyenMai:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DieuChinhCongNo:"",
ConNoTheoAR:"",TrangThaiGiaoHang:"",TrangThaiKeToan:""}),n,e)}async function qe(e={}){const n=((await f.deliveryReport({...e,full:"1",export:"1"})).delivery||[]).map((e,n)=>({
STT:n+1,NgayGiao:e.deliveryDate,MaDonTong:e.code,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoDonDangGan:e.assignedOrderCount,SoDonDaGiao:e.orderCount,
TongTienDonCon:Math.round(_(e.totalAmount)),DoanhSoDaXacNhan:Math.round(_(e.accountingConfirmedAmount)),TienThuTheoQuy:Math.round(_(e.collectedAmount)),TrangThai:e.status,
LechSoDonSnapshot:_(e.dataQuality?.snapshotOrderCountDifference),LechTienSnapshot:Math.round(_(e.dataQuality?.snapshotAmountDifference))}))
;return Ve("delivery-report","BaoCaoGiaoHang",Object.keys(n[0]||{STT:"",NgayGiao:"",MaDonTong:"",MaNVGH:"",NVGH:"",SoDonDangGan:"",SoDonDaGiao:"",TongTienDonCon:"",
DoanhSoDaXacNhan:"",TienThuTheoQuy:"",TrangThai:"",LechSoDonSnapshot:"",LechTienSnapshot:""}),n,e)}async function je(e={}){const n=((await f.returnReport({...e,full:"1",export:"1"
})).returns||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaTraHang:e.code,MaDon:e.salesOrderCode,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,
NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,GiaTriTra:Math.round(_(e.amount)),GiaTriChungTu:Math.round(_(e.documentAmount)),
GiaTriARReturn:Math.round(_(e.arAmount)),TrangThaiNhapKho:e.warehouseReceiveStatus,TrangThaiTraHang:e.returnState,TrangThaiKeToan:e.accountingStatus}))
;return Ve("return-report","BaoCaoTraHang",Object.keys(n[0]||{STT:"",Ngay:"",MaTraHang:"",MaDon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",GiaTriTra:"",
GiaTriChungTu:"",GiaTriARReturn:"",TrangThaiNhapKho:"",TrangThaiTraHang:"",TrangThaiKeToan:""}),n,e)}async function $e(e={}){const n=((await f.periodDebtReport({...e,full:"1",
export:"1",includePaid:"1"})).debts||[]).map((e,n)=>({STT:n+1,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,DuDauKy:Math.round(_(e.openingBalance)),PhatSinhNo:Math.round(_(e.debitInPeriod)),DaThu:Math.round(_(e.receiptInPeriod)),
TraHang:Math.round(_(e.returnInPeriod)),ChietKhauDieuChinh:Math.round(_(e.adjustmentInPeriod)+_(e.otherCreditInPeriod)),TongPhatSinhCo:Math.round(_(e.totalCreditInPeriod)),
DuCuoiKy:Math.round(_(e.closingBalance))}));return Ve("debt-report","BaoCaoCongNo",Object.keys(n[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",
DuDauKy:"",PhatSinhNo:"",DaThu:"",TraHang:"",ChietKhauDieuChinh:"",TongPhatSinhCo:"",DuCuoiKy:""}),n,e)}async function Fe(e={}){const n=((await f.arLedgerDetailReport({...e,
full:"1",export:"1"})).ledger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaKhachHang:e.customerCode,KhachHang:e.customerName,ChungTu:e.documentCode,Loai:e.type,DienGiai:e.description,
DuTruocGiaoDich:Math.round(_(e.openingBalance)),No:Math.round(_(e.debit)),Co:Math.round(_(e.credit)),PhanLoaiCo:e.creditCategory,DuSauGiaoDich:Math.round(_(e.closingBalance))}))
;return Ve("ar-ledger-detail","SoCongNoChiTiet",Object.keys(n[0]||{STT:"",Ngay:"",MaKhachHang:"",KhachHang:"",ChungTu:"",Loai:"",DienGiai:"",DuTruocGiaoDich:"",No:"",Co:"",
PhanLoaiCo:"",DuSauGiaoDich:""}),n,e)}async function Xe(e={}){const n=((await f.stockReport({...e,full:"1",export:"1"})).stock||[]).map((e,n)=>({STT:n+1,
MaSP:L(e.productCode||e.code||e.productId),SanPham:L(e.productName||e.name),DonViTinh:L(e.unit||e.baseUnit),TonVatLy:_(e.onHand??e.quantity??e.qty),DaGiuCho:_(e.reservedQty),
TonKhaDung:_(e.availableQty)}));return Ve("stock-report","TonKhoHienTai",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonVatLy:"",DaGiuCho:"",TonKhaDung:""}),n,{})}
async function Ue(e={}){const n=((await f.inventoryMovementReport({...e,full:"1",export:"1",mode:"movement"})).stock||[]).map((e,n)=>({STT:n+1,MaSP:e.productCode,
SanPham:e.productName,DonViTinh:e.unit,TonDauKy:_(e.openingQty),NhapMua:_(e.importQty),HangTraNhapKho:_(e.returnQty),NhapKhac:_(e.otherInQty),TongNhap:_(e.inQty),
XuatBan:_(e.saleQty),XuatDaoChungTu:_(e.reversalOutQty),XuatKhac:_(e.otherOutQty),TongXuat:_(e.outQty),DieuChinhRong:_(e.adjustmentQty),TonCuoiKy:_(e.endingQty),
NguonTonCuoi:e.endingSource,TonCuoiTheoLedger:_(e.ledgerEndingQty),ChenhLechDoiSoat:_(e.reconciliationDifference)}))
;return Ve("inventory-movement-report","NhapXuatTon",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonDauKy:"",NhapMua:"",HangTraNhapKho:"",NhapKhac:"",TongNhap:"",
XuatBan:"",XuatDaoChungTu:"",XuatKhac:"",TongXuat:"",DieuChinhRong:"",TonCuoiKy:"",NguonTonCuoi:"",TonCuoiTheoLedger:"",ChenhLechDoiSoat:""}),n,e)}async function Ze(e={}){
const n=((await f.stockCardReport({...e,full:"1",export:"1"})).transactions||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaSP:e.productCode,SanPham:e.productName,ChungTu:e.refCode,
Loai:e.type,PhanLoai:e.category,TonTruocGiaoDich:_(e.openingQty),Nhap:_(e.inQty),Xuat:_(e.outQty),TonSauGiaoDich:_(e.balanceQty),GhiChu:e.note}))
;return Ve("stock-card-report","TheKho",Object.keys(n[0]||{STT:"",Ngay:"",MaSP:"",SanPham:"",ChungTu:"",Loai:"",PhanLoai:"",TonTruocGiaoDich:"",Nhap:"",Xuat:"",TonSauGiaoDich:"",
GhiChu:""}),n,e)}async function We(e={}){const n=((await f.financeReport({...e,full:"1",export:"1"})).fundLedger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,ChungTu:e.code,Loai:e.type,
LoaiQuy:e.fundType,TaiKhoanQuy:e.account,NguoiLienQuan:e.counterparty,TonDauDong:Math.round(_(e.openingBalance)),Thu:Math.round(_(e.inAmount)),Chi:Math.round(_(e.outAmount)),
TonCuoiDong:Math.round(_(e.endingBalance)),GhiChu:e.note}));return Ve("fund-report","BaoCaoQuyTien",Object.keys(n[0]||{STT:"",Ngay:"",ChungTu:"",Loai:"",LoaiQuy:"",TaiKhoanQuy:"",
NguoiLienQuan:"",TonDauDong:"",Thu:"",Chi:"",TonCuoiDong:"",GhiChu:""}),n,e)}async function ze(e={}){const n=((await f.salesReport({...e,full:"1",export:"1"
})).bySalesman||[]).map((e,n)=>({STT:n+1,MaNVBH:e.salesmanCode,NVBH:e.salesmanName,SoDon:e.orderCount,SoKhachHang:e.customerCount,DoanhSoTruocKM:Math.round(_(e.beforePromoAmount)),
DoanhSoThucTe:Math.round(_(e.actualAmount)),GiaTriHangKM:Math.round(_(e.promotionValue)),DaThuTheoAR:Math.round(_(e.receiptAmount)),TraHangTheoAR:Math.round(_(e.returnAmount)),
ConNoTheoAR:Math.round(_(e.debtAmount))}));return Ve("salesman-report","BaoCaoNVBH",Object.keys(n[0]||{STT:"",MaNVBH:"",NVBH:"",SoDon:"",SoKhachHang:"",DoanhSoTruocKM:"",
DoanhSoThucTe:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",ConNoTheoAR:""}),n,e)}async function Ye(e={}){const n=((await f.deliveryReport({...e,full:"1",export:"1"
})).byStaff||[]).map((e,n)=>({STT:n+1,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoChuyen:e.tripCount,SoDonDaGiao:e.orderCount,TongTienDonCon:Math.round(_(e.totalAmount)),
DoanhSoDaXacNhan:Math.round(_(e.accountingConfirmedAmount)),ThuTienTheoQuy:Math.round(_(e.collectedAmount))}));return Ve("deliveryman-report","BaoCaoNVGH",Object.keys(n[0]||{
STT:"",MaNVGH:"",NVGH:"",SoChuyen:"",SoDonDaGiao:"",TongTienDonCon:"",DoanhSoDaXacNhan:"",ThuTienTheoQuy:""}),n,e)}async function Je(e={}){const n=await f.salesReport({...e,
full:"1",export:"1"}),o=await f.periodDebtReport({...e,full:"1",export:"1",includePaid:"1"}),t=new Map((o.debts||[]).map(e=>[L(e.customerCode||e.customerName),e])),a=new Map
;(n.sales||[]).forEach(e=>{const n=L(e.customerCode||e.customerName),o=a.get(n)||{MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
SoDon:0,DoanhSoTruocKM:0,DoanhSoThucTe:0,GiaTriHangKM:0,DaThuTheoAR:0,TraHangTheoAR:0};o.SoDon+=1,o.DoanhSoTruocKM+=_(e.beforePromoAmount),o.DoanhSoThucTe+=_(e.actualAmount),
o.GiaTriHangKM+=_(e.promotionValue),o.DaThuTheoAR+=_(e.receiptAmount),o.TraHangTheoAR+=_(e.returnAmount),a.set(n,o)});const r=Array.from(a.entries()).map(([e,n],o)=>{
const a=t.get(e)||{};return{STT:o+1,...n,DoanhSoTruocKM:Math.round(n.DoanhSoTruocKM),DoanhSoThucTe:Math.round(n.DoanhSoThucTe),GiaTriHangKM:Math.round(n.GiaTriHangKM),
DaThuTheoAR:Math.round(n.DaThuTheoAR),TraHangTheoAR:Math.round(n.TraHangTheoAR),DuDauKy:Math.round(_(a.openingBalance)),DuCuoiKy:Math.round(_(a.closingBalance))}})
;return Ve("customer-sales-report","DoanhSoKhachHang",Object.keys(r[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",SoDon:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",
GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DuDauKy:"",DuCuoiKy:""}),r,e)}async function en(e={}){const n=await f.salesReport({...e,full:"1",export:"1"}),o=new Map
;(n.sales||[]).forEach(e=>(e.items||[]).forEach(e=>{const n=L(e.productCode||e.productName),t=o.get(n)||{MaSP:e.productCode,SanPham:e.productName,NhanHang:e.brand,SoLuongBan:0,
DoanhSoTruocKM:0,DoanhSoThucTe:0};t.SoLuongBan+=_(e.quantity),t.DoanhSoTruocKM+=_(e.catalogAmount),t.DoanhSoThucTe+=_(e.actualAmount),o.set(n,t)}))
;const t=Array.from(o.values()).reduce((e,n)=>e+n.DoanhSoThucTe,0)||1,a=Array.from(o.values()).map((e,n)=>({STT:n+1,...e,SoLuongBan:e.SoLuongBan,
DoanhSoTruocKM:Math.round(e.DoanhSoTruocKM),DoanhSoThucTe:Math.round(e.DoanhSoThucTe),ChietKhauKM:Math.round(e.DoanhSoTruocKM-e.DoanhSoThucTe),
TyTrong:`${q(e.DoanhSoThucTe/t*100,2)}%`}));return Ve("product-sales-report","DoanhSoSanPham",Object.keys(a[0]||{STT:"",MaSP:"",SanPham:"",NhanHang:"",SoLuongBan:"",
DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",TyTrong:""}),a,e)}
const nn=new Set(["password","passwordHash","hash","salt","token","tokens","accessToken","refreshToken","secret","apiKey","session","sessions","resetPasswordToken","verificationToken"])
;function on(e={},n=[]){for(const o of n){const n=L(e[o]);if(n)return n}return""}function tn(e){return!0===e?"Hoạt động":!1===e?"Ngưng hoạt động":L(e)}function an(e={},n=[],o=[]){
const t=new Set([...n,...o,"_id","__v","searchText"]),a={};return Object.keys(e||{}).forEach(n=>{if(t.has(n))return;const o=e[n];null!=o&&""!==o&&(a[n]=o)}),
Object.keys(a).length?JSON.stringify(a):""}function rn(e={},n=0,o=new Map){const t=on(e,["code","productCode","sku","id"]),a=o.get(L(t).toUpperCase())||{};return{STT:n+1,MaSP:t,
TenSP:on(e,["name","productName","title"]),Barcode:on(e,["barcode","barCode"]),NhanHang:on(e,["brand","brandName"]),NganhHang:on(e,["category","categoryName","groupName"]),
DonVi:on(e,["unit","baseUnit","uom"]),DonViCoSo:on(e,["baseUnit","unit"]),QuyDoi:_(e.conversionRate||e.ratio||1),
"Quy cách":Math.max(1,_(e.conversionRate||e.packingQty||e.unitsPerCase||1)),"Giá bán":Math.round(_(e.salePrice||e.price||e.sellPrice)),
GiaVon:Math.round(_(e.costPrice||e.cost||e.purchasePrice)),TonVatLy:_(a.onHand??a.quantity??a.qty),DaGiuCho:_(a.reservedQty),TonKhaDung:_(a.availableQty),
KhuBocHang:K(v(H(e),b.HC)),TrangThai:tn(e.isActive??e.status),NgayTao:j(e.createdAt),NgayCapNhat:j(e.updatedAt),
ThongTinKhac:an(e,["code","productCode","sku","name","productName","barcode","brand","category","unit","baseUnit","conversionRate","packing","salePrice","costPrice","pickingZone","warehouseCode","warehouseName","defaultWarehouse","isActive","status","createdAt","updatedAt"])
}}async function un(e={}){const[n,o]=await Promise.all([d.find({}).sort({code:1,name:1}).limit(be(e)).lean(),f.stockReport({full:"1",export:"1"
})]),t=new Map((o.stock||o.items||[]).map(e=>[L(e.productCode||e.code).toUpperCase(),e])),a=n.map((e,n)=>rn(e,n,t))
;return Ve("product-info-report","ThongTinSanPham",Object.keys(a[0]||rn({},-1,t)),a,e)}function cn(e={}){return[e.customerCode,e.customerId,e.customerName].map(L).filter(Boolean)}
async function sn(){const n=await f.periodDebtReport({dateFrom:"0000-01-01",dateTo:e.todayVN(),full:"1",export:"1",includePaid:"1"}),o=new Map
;return(n.debts||n.items||[]).forEach(e=>{const n=_(e.closingBalance);cn(e).forEach(e=>o.set(e,n))}),o}async function dn(n={}){
const o=e.todayVN(),t=L(n.monthStart||n.monthFrom||`${o.slice(0,7)}-01`),a=L(n.monthEnd||n.monthTo||o),r=await f.salesReport({dateFrom:t,dateTo:a,full:"1",export:"1"}),i=new Map
;return(r.sales||r.items||[]).forEach(e=>{const n=_(e.actualAmount);[e.customerCode,e.customerId,e.customerName].map(L).filter(Boolean).forEach(e=>{i.set(e,_(i.get(e))+n)})}),i}
function hn(e,n=[]){for(const o of n.map(L).filter(Boolean))if(e.has(o))return _(e.get(o));return 0}function Tn(e={},n=0,o=new Map,t=new Map){
const a=Q(e),r=E(e),i=[e.code,e.customerCode,e.id,e._id,e.name,e.customerName];return{STT:n+1,MaKH:on(e,["code","customerCode","id"]),TenKH:on(e,["name","customerName"]),
TenHoKinhDoanh:r.businessName,SDT:on(e,["phone","mobile","customerPhone","tel"]),DiaChi:on(e,["address","customerAddress","fullAddress"]),MaSoThue:a.taxCode,
DiaChiHoaDonThue:a.taxInvoiceAddress,Tuyen:on(e,["route","routeName","line"]),KhuVuc:on(e,["area","areaName","region","province"]),
MaNVBH:on(e,["staffCode","salesStaffCode","salesmanCode"]),NVBHPhuTrach:on(e,["staffName","salesStaffName","salesmanName"]),MaNVGH:on(e,["deliveryStaffCode","shipperCode"]),
NVGHPhuTrach:on(e,["deliveryStaffName","shipperName"]),CongNoHienTai:Math.round(hn(o,i)),DoanhSoThang:Math.round(hn(t,i)),TrangThai:tn(e.isActive??e.status),NgayTao:j(e.createdAt),
NgayCapNhat:j(e.updatedAt),
ThongTinKhac:an(e,["code","customerCode","name","customerName","businessName","customerBusinessName","householdBusinessName","taxBusinessName","invoiceBusinessName","tenHoKinhDoanh","phone","mobile","customerPhone","address","customerAddress","taxCode","customerTaxCode","taxNumber","vatNumber","vatCode","mst","taxInvoiceAddress","customerTaxInvoiceAddress","invoiceAddress","vatInvoiceAddress","billingAddress","route","area","region","staffCode","staffName","salesStaffCode","salesStaffName","deliveryStaffCode","deliveryStaffName","isActive","status","createdAt","updatedAt"])
}}async function ln(e={}){const[n,o,t]=await Promise.all([s.find({}).sort({code:1,name:1
}).limit(be(e)).lean(),sn(),dn(e)]),a=n.map((e,n)=>Tn(e,n,o,t)).sort((e,n)=>_(n.CongNoHienTai)-_(e.CongNoHienTai)||L(e.MaKH).localeCompare(L(n.MaKH)));return a.forEach((e,n)=>{
e.STT=n+1}),Ve("customer-info-report","ThongTinKhachHang",Object.keys(a[0]||Tn({},-1)),a,e)}function mn(e={}){const n={};return Object.keys(e||{}).forEach(o=>{
if(nn.has(o)||o.startsWith("_")||["__v","searchText"].includes(o))return
;if(["username","fullName","name","code","staffCode","role","roles","phone","email","isActive","status","permissions","area","route","lastLoginAt","lastLogin","createdAt","updatedAt"].includes(o))return
;const t=e[o];null!=t&&""!==t&&(n[o]=t)}),Object.keys(n).length?JSON.stringify(n):""}function gn(e={},n=0){return{STT:n+1,TenDangNhap:on(e,["username","loginName"]),
HoTen:on(e,["fullName","name","displayName"]),MaNhanVien:on(e,["staffCode","code","employeeCode"]),VaiTro:Array.isArray(e.roles)?e.roles.join(", "):on(e,["role","roles"]),
SDT:on(e,["phone","mobile"]),Email:on(e,["email"]),TrangThai:tn(e.isActive??e.status),
QuyenTruyCap:Array.isArray(e.permissions)?e.permissions.join(", "):L(e.permissions||e.permission||""),KhuVucTuyen:on(e,["area","route","region"]),NgayTao:j(e.createdAt),
NgayCapNhat:j(e.updatedAt),LanDangNhapGanNhat:j(e.lastLoginAt||e.lastLogin||e.lastSeenAt),ThongTinKhac:mn(e)}}async function pn(e={}){
const n=p.users,o=(await n.find({}).select("-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken").sort({
role:1,code:1,username:1}).limit(be(e)).lean()).map(gn);return Ve("user-info-report","ThongTinTaiKhoan",Object.keys(o[0]||gn({},-1)),o,e)}async function fn(e){return a.preview(e)}
async function yn(e){return a.commit(e)}async function Sn(){return a.logs()}function Cn(){return r.getBuiltInTemplates()}async function Nn(e){return r.buildBuiltInTemplateFile(e)}
function Dn(e){return r.getFields(e)}async function Mn(){return r.listCustomTemplates()}async function An(e){return r.saveCustomTemplate(e)}async function vn(e){
return r.deleteCustomTemplate(e)}async function Hn(e){return r.buildCustomTemplateFile(e)}function Kn(e={}){return(e.definition?.columns||[]).map(e=>Array.isArray(e)?{key:e[0],
label:e[1]||e[0]}:{key:e.key,label:e.label||e.key}).filter(e=>L(e.key))}async function bn(e,n={},o={}){const t=await y.run(e,{...n,__exportAll:!0
},o),a=Kn(t),r=a.map(e=>e.label),i=(t.rows||[]).map((e,n)=>{const o={STT:n+1};for(const n of a)o[n.label]=e[n.key]??"";return o})
;return Ve(e,L(t.definition?.title||e).slice(0,31)||"BaoCao",["STT",...r],i,n)}function Pn(){
return[...new Set([...i.getExportTypes(),"invoice-orders","vatInvoiceTT78","vat-non-invoice-orders","sse-invoice-orders","sse-invoice-errors",...Object.keys(S)])].sort()}
async function kn(n,o={},t={}){const a=String(n||"").trim();if(["sse-invoice-orders","sseInvoiceOrders"].includes(a))return P.buildSseInvoiceWorkbook(o,t)
;if(["sse-invoice-errors","sseInvoiceErrors"].includes(a))return P.buildSseErrorReportWorkbook(o,t);if(["invoice-orders","invoiceOrders"].includes(a)){const e=l(o.invoiceType)
;return e?e===T.VAT?Ne(o,t):Ae(o,t):{error:"invoiceType chỉ nhận VAT hoặc NON_VAT",status:400}}
if(["vatInvoiceTT78","vat-invoice-tt78","hoa-don-vat-tt78"].includes(a))return Ne(o,t);if(["vat-non-invoice-orders","vatNonInvoiceOrders"].includes(a))return Ae(o,t);const r=C(a)
;if(r)return bn(r,o,t);const u=await i.findForExport(n,o);if(!u)return{error:"Loại dữ liệu export không hợp lệ",status:400};const c=await B({type:n,rows:u
}),s=String(n||"data").replace(/[^a-zA-Z0-9_-]/g,"-");return{buffer:c,rows:u.length,fileName:`${s}-export-${e.todayVN()}.xlsx`}}module.exports={previewImport:fn,commitImport:yn,
getImportLogs:Sn,getBuiltInTemplates:Cn,buildBuiltInTemplateFile:Nn,getFields:Dn,listCustomTemplates:Mn,saveCustomTemplate:An,deleteCustomTemplate:vn,buildCustomTemplateFile:Hn,
getExportTypes:Pn,exportToExcel:kn};
