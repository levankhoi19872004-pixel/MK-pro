/* GENERATED FILE — edit src/services/importExportLegacy.service.source/part-01.jsfrag, src/services/importExportLegacy.service.source/part-02.jsfrag, src/services/importExportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{createWorkbook:n,appendAoaSheet:o,writeWorkbook:t}=require("../utils/excelWriter.util"),a=require("./excelImportService"),r=require("./import-template/LegacyImportTemplateAdapter"),i=require("../repositories/exportRepository"),u=require("../models/SalesOrder"),c=require("../models/ReturnOrder"),s=require("../models/Customer"),d=require("../models/Product"),h=require("./excel/ProductExcelEnrichmentService"),{INVOICE_TYPES:T,normalizeInvoiceType:m,resolveInvoiceType:l,isActiveInvoiceOrder:g}=require("./invoiceExportClassifier"),p=require("../models"),f=require("./reportService"),{pickSalesStaffCode:y,pickSalesStaffName:S,pickDeliveryStaffCode:C,pickDeliveryStaffName:N}=require("../domain/staff/staffIdentity"),{normalizePickingZone:D,pickingZoneFrom:M,pickingZoneLabel:A,PICKING_ZONES:v}=require("../utils/pickingZone.util"),H=require("./sseInvoiceExport.service"),K=require("./invoiceExportQuery.service"),b=require("./invoiceNetSales.service")
;function P(e={}){const n={...e};return delete n._id,delete n.__v,n}function k(e){return null==e?"":Array.isArray(e)||"object"==typeof e?JSON.stringify(e):e}function V(e=[]){
const n=e.map(P),o=new Set;n.forEach(e=>Object.keys(e).forEach(e=>o.add(e)));const t=Array.from(o),a=n.map(e=>t.map(n=>k(e[n])));return{headers:t,body:a}}function x(e=""){
return"products"===Q(e).toLowerCase()?["productCode","code","sku","barcode"]:h.PRODUCT_CODE_KEYS}async function G({type:e,rows:a}){const r=x(e),i=await h.enrichRows(a,{
productCodeKeys:r,packingKey:"Quy cách",salePriceKey:"Giá bán"}),{headers:u,body:c}=V(i.rows),s=n();o(s,"Export",[u,...c]);const d=h.documentProductLines(a);if(d.length){
const e=(await h.enrichRows(d,{packingKey:"Quy cách",salePriceKey:"Giá bán"})).rows.map(e=>({MaChungTu:e.documentCode,MaSP:F(e),SanPham:X(e),"Quy cách":e["Quy cách"],
"Giá bán":e["Giá bán"],SoLuong:Z(e),GiaSauKM:I(e.finalPrice??e.priceAfterPromotion??e.discountedPrice??""),ThanhTien:Y(e)
})),n=["MaChungTu","MaSP","SanPham","Quy cách","Giá bán","SoLuong","GiaSauKM","ThanhTien"];o(s,"ChiTietSanPham",[n,...e.map(e=>n.map(n=>e[n]??""))])}
return o(s,"ThongTin",[["Loại dữ liệu",e],["Số dòng",a.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc sản phẩm","Nếu có sản phẩm: Quy cách là số lượng đóng gói; Giá bán lấy từ danh mục sản phẩm. Đơn con giữ thêm Giá sau KM."]]),
t(s)}
const R=.08,{extractCustomerTaxProfile:O}=require("../utils/customerTaxProfile.util"),{extractCustomerBusinessProfile:B}=require("../utils/customerBusinessProfile.util"),w=["STT","NgayHoaDon","MaKhachHang","TenKhachHang","TenNguoiMua","MaSoThue","DiaChiKhachHang","DienThoaiKhachHang","SoTaiKhoan","NganHang","HinhThucTT","MaSanPham","SanPham","DonViTinh","Extra1SP","Extra2SP","SoLuong","DonGia","TyLeChietKhauHienThi","SoTienChietKhau","ThanhTien","TienBan","ThueSuat","TienThueSanPham","TienThue","TongCong","TinhChatHangHoa","DonViTienTe","TyGia","Fkey","Extra1","Extra2","EmailKhachHang","VungDuLieu","Extra3","Extra4","Extra5","Extra6","Extra7","Extra8","Extra9","Extra10","Extra11","Extra12","LOONo","HDSe","xVTNXHan","NVChuan","PTChuyenKhoan","HDKTTu","CCCDan"]
;function Q(e){return String(e??"").trim()}function I(e,n=0){const o=Number(String(e??"").replace(/,/g,""));return Number.isFinite(o)?o:n}function E(e,n=2){const o=10**n
;return Math.round(I(e)*o)/o}function L(n){return e.toDateOnly(n||"")||Q(n).slice(0,10)}function _(e,n={}){
const o=L(e),t=L(n.dateFrom||n.from||n.fromDate||""),a=L(n.dateTo||n.to||n.toDate||"");return!(t&&o<t||a&&o>a)}function q(e={}){return g(e)}function j(e={}){
return[e.id,e._id,e.code,e.orderCode,e.documentCode,e.salesOrderId,e.salesOrderCode,e.externalOrderCode,e.invoiceCode,e.refCode].map(Q).filter(Boolean)}function $(e={}){
return Q(e.code||e.orderCode||e.salesOrderCode||e.documentCode||e.id||e._id)}function F(e={}){return Q(e.productCode||e.code||e.sku||e.barcode||e.productId||e.id)}function X(e={}){
return Q(e.productName||e.name||e.itemName||e.productTitle||"")}function U(e={},n={}){return Q(e.unit||e.baseUnit||e.dvt||e.uom||n.unit||n.baseUnit||"")}function Z(e={}){
return I(e.quantity??e.qty??e.totalQty??e.qtySale??e.saleQty??0)}function W(e={}){return I(e.returnQty??e.qtyReturn??e.returnQuantity??e.returnedQty??0)}function z(e={}){
return Q(e.lineKey||e.orderLineId||e.salesOrderItemId||e.itemId||e._id||"")}function J(e={}){
return I(e.finalPrice??e.priceAfterPromotion??e.promoPrice??e.price??e.salePrice??e.unitPrice??e.sellPrice??0)}function Y(e={}){
return I(e.amount??e.totalAmount??e.lineAmount??e.money??0)||Z(e)*J(e)}function ee(e,n){return`${Q(e)}@@${Q(n)}`}function ne(e={}){const n=J(e);return n?String(E(n,6)):""}
function oe(e,n,o="",t=""){return[Q(e),Q(n),Q(o),Q(t)].join("@@")}function te(e={}){return Q(e.code||e.id||e.returnOrderCode||e.documentCode||e._id)}function ae(e={}){
return Q(e.id||e._id||e.code||e.returnOrderCode||e.documentCode)}function re(e={}){
const n=e.updatedAt||e.modifiedAt||e.createdAt||e.date||e.documentDate||"",o=n?new Date(n).getTime():0;return Number.isFinite(o)?o:0}function ie(){return{status:{
$nin:["void","cancelled","canceled","deleted","removed"]},returnStatus:{$nin:["void","cancelled","canceled","deleted","removed"]}}}function ue(e,n,o,t={}){if(!n||!o)return
;e.set(n,I(e.get(n))+o),e.__sourceMap||(e.__sourceMap=new Map);const a=e.__sourceMap.get(n)||{codes:new Set,ids:new Set,sourceRows:[]};t.code&&a.codes.add(t.code),
t.id&&a.ids.add(t.id),t.sourceRow&&a.sourceRows.push(t.sourceRow),e.__sourceMap.set(n,a)}function ce(e,n){const o=e&&e.__sourceMap;if(!o)return{ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const t=o.get(n);if(!t)return{ReturnOrderCode:"",ReturnOrderId:"",ReturnQtySource:""}
;const a=Array.from(t.codes||[]).filter(Boolean),r=Array.from(t.ids||[]).filter(Boolean),i=Array.from(t.sourceRows||[]).filter(Boolean);return{ReturnOrderCode:a.join(", "),
ReturnOrderId:r.join(", "),ReturnQtySource:i.join(" | ")}}function se(e=[]){const n=new Map,o=new Map;for(const n of e||[]){if(!q(n))continue
;const e=te(n),t=ae(n),a=re(n),r=Array.from(new Set([n.salesOrderId,n.orderId,n.sourceOrderId,n.deliveryOrderId,n.salesOrderCode,n.orderCode,n.sourceOrderCode,n.deliveryOrderCode,n.originalOrderCode].map(Q).filter(Boolean)))
;if(!r.length)continue;const i=Q(n.salesOrderCode||n.orderCode||n.salesOrderId||n.orderId||r[0]);for(const u of Array.isArray(n.items)?n.items:[]){const n=F(u);if(!n)continue
;const c=W(u);if(!c)continue;const s=z(u),d=ne(u),h=`${e||t||"RETURN_ORDER"}:${i}:${n}:${c}`,T=[e||t,i,n,s||"",d||""].map(Q).join("@@"),m={roKeys:r,pcode:n,qty:c,lineKey:s,
priceKey:d,roCode:e,roId:t,updatedMs:a,sourceRow:h},l=o.get(T);(!l||a>=l.updatedMs)&&o.set(T,m)}}for(const e of o.values()){
const{roKeys:o,pcode:t,qty:a,lineKey:r,priceKey:i,roCode:u,roId:c,sourceRow:s}=e,d={code:u,id:c,sourceRow:s}
;for(const e of o)ue(n,r&&i?oe(e,t,r,i):r?oe(e,t,r,""):i?oe(e,t,"",i):ee(e,t),a,d)}return n}function de(e,n={},o={}){const t=F(o);if(!t)return{qty:0,ReturnOrderCode:"",
ReturnOrderId:"",ReturnQtySource:""};const a=z(o),r=ne(o);let i={qty:0,key:""};for(const o of j(n)){
const n=[a&&r?oe(o,t,a,r):"",a?oe(o,t,a,""):"",r?oe(o,t,"",r):"",ee(o,t)].filter(Boolean);for(const o of n){const n=I(e.get(o));if(n>i.qty&&(i={qty:n,key:o}),n)break}}return{
qty:i.qty,...ce(e,i.key)}}function he(e,n={},o={}){return de(e,n,o).qty}function Te(e={}){return Q(e.customerCode||e.customerId||e.customerName||e.customerPhone||"")}
function me(e=[]){const n=new Map;for(const o of e||[])[o.code,o.customerCode,o.id,o._id,o.name,o.customerName,o.phone,o.mobile].map(Q).filter(Boolean).forEach(e=>n.set(e,o))
;return n}function le(e=[]){const n=new Map;for(const o of e||[])[o.code,o.productCode,o.sku,o.barcode,o.id,o._id].map(Q).filter(Boolean).forEach(e=>n.set(e,o));return n}
function ge(e={},n=new Map){
const o=n.get(Q(e.customerCode))||n.get(Q(e.customerId))||n.get(Q(e.customerName))||{},t=O(e),a=O(o),r=B(e),i=B(o),u=Q(e.customerName||o.name||o.customerName),c=Q(r.businessName||i.businessName)
;return{code:Q(e.customerCode||o.code||o.customerCode||e.customerId||o.id),name:c||u,buyer:Q(e.buyerName||e.contactName||o.buyerName||o.representative||o.contactName||u),
taxCode:Q(t.taxCode||a.taxCode),address:Q(t.taxInvoiceAddress||a.taxInvoiceAddress||e.customerAddress||e.address||o.address||o.deliveryAddress),
phone:Q(e.customerPhone||e.phone||o.phone||o.mobile),bankAccount:Q(o.bankAccount||o.accountNumber||e.bankAccount),bankName:Q(o.bankName||e.bankName),
email:Q(o.email||e.customerEmail||e.email)}}function pe(e={}){const n=Q(e.paymentMethod||e.paymentType||e.method||e.hinhThucTT||"");if(n)return n
;const o=I(e.cashAmount||e.collectedCashAmount),t=I(e.bankAmount||e.transferAmount||e.collectedBankAmount);return o&&t?"TM/CK":t?"CK":"TM/CK"}
function fe({orders:n,returnOrders:o,customers:t,products:a,query:r={}}){const i=me(t),u=le(a),c=[],s=[],d=[];let m=0
;const g=(n||[]).filter(q).filter(e=>l(e)===T.VAT).filter(e=>K.matchesInvoiceExportFilters(e,r,{invoiceGroup:T.VAT})).filter(e=>{if(!r.customerCode&&!r.customerId)return!0
;const n=Q(r.customerCode||r.customerId);return[e.customerCode,e.customerId,e.customerName].map(Q).includes(n)
}).sort((e,n)=>Q(e.orderDate||e.date||e.documentDate||e.createdAt).localeCompare(Q(n.orderDate||n.date||n.documentDate||n.createdAt))||$(e).localeCompare($(n))),p=b.buildNetSaleDataset({
orders:g,returnOrders:o,isEligibleReturnOrder:K.isEligibleReturnOrder});for(const n of p.orders){
const o=n.order,t=[],a=ge(o,i),r=$(o),T=L(o.orderDate||o.date||o.documentDate||o.createdAt||e.todayVN());for(const e of n.lines){
const n=e.item,o=e.productCode,a=u.get(o)||{},i=X(n)||Q(a.name||a.productName),c=e.soldQty,s=e.returnedQty,T=e.netQty,m=J(n)||(c?Y(n)/c:0),l=b.sourceSummary(e);if(!o||T<=0){
o||d.push({code:"MISSING_PRODUCT_CODE",orderCode:r,message:"Dòng bán thiếu productCode nên không thể đưa vào dataset hóa đơn."});continue}const g=E(m/1.08,6),p=E(T*g,2);t.push({
productCode:o,productName:i,unit:U(n,a),catalogPackingQty:h.catalogPackingQty(a),catalogSalePrice:h.catalogSalePrice(a),soldQty:c,returnQty:s,safeReturnQty:s,invoiceQty:T,
priceInclVat:m,unitPriceBeforeVat:g,lineAmountBeforeVat:p,returnOrderCode:l.ReturnOrderCode,returnOrderId:l.ReturnOrderId,returnQtySource:l.ReturnQtySource})}
if(!t.length||n.fullyReturned)continue;m+=1;const l=E(t.reduce((e,n)=>e+n.lineAmountBeforeVat,0),2),g=E(l*R,2),p=Math.round(l+g);p<=0||t.forEach((e,n)=>{const t=0===n;c.push({
STT:t?m:"",NgayHoaDon:t?T:"",MaKhachHang:t?a.code:"",TenKhachHang:t?a.name:"",TenNguoiMua:t?a.buyer:"",MaSoThue:t?a.taxCode:"",DiaChiKhachHang:t?a.address:"",
DienThoaiKhachHang:t?a.phone:"",SoTaiKhoan:t?a.bankAccount:"",NganHang:t?a.bankName:"",HinhThucTT:t?pe(o):"",MaSanPham:e.productCode,SanPham:e.productName,DonViTinh:e.unit,
Extra1SP:e.catalogPackingQty,Extra2SP:e.catalogSalePrice,SoLuong:e.invoiceQty,DonGia:e.unitPriceBeforeVat,TyLeChietKhauHienThi:"",SoTienChietKhau:"",
ThanhTien:e.lineAmountBeforeVat,TienBan:t?l:"",ThueSuat:t?8:"",TienThueSanPham:"",TienThue:t?g:"",TongCong:t?p:"",TinhChatHangHoa:0,DonViTienTe:t?"VND":"",TyGia:"",Fkey:t?r:"",
Extra1:"",Extra2:"",EmailKhachHang:t?a.email:"",VungDuLieu:"",Extra3:"",Extra4:"",Extra5:"",Extra6:"",Extra7:"",Extra8:"",Extra9:"",Extra10:"",Extra11:"",Extra12:"",LOONo:"",
HDSe:"",xVTNXHan:"",NVChuan:"",PTChuyenKhoan:"",HDKTTu:"",CCCDan:""}),s.push({MaDon:r,MaKhachHang:a.code,TenKhachHang:a.name,MaSoThue:a.taxCode,DiaChiHoaDon:a.address,
MaSanPham:e.productCode,SanPham:e.productName,"Quy cách":e.catalogPackingQty,"Giá bán":e.catalogSalePrice,SoLuongBan:e.soldQty,SoLuongTra:e.returnQty,
SoLuongTraAnToan:e.safeReturnQty,SoLuongXuatHoaDon:e.invoiceQty,GiaSauKhuyenMaiCoVAT:e.priceInclVat,DonGiaTruocVAT:e.unitPriceBeforeVat,ThanhTienTruocVAT:e.lineAmountBeforeVat,
ReturnOrderCode:e.returnOrderCode,ReturnOrderId:e.returnOrderId,ReturnQtySource:e.returnQtySource,LyDoBoDong:""})})}return{rows:c,auditRows:s,warnings:[...p.warnings,...d]}}
async function ye(a={},r={}){const i=K.normalizeExportQuery(a,{invoiceGroup:T.VAT
}),u=i.dateFrom||"0000-01-01",c=i.dateTo||"9999-12-31",{orders:s,returnOrders:d,customers:h,products:m}=await K.loadInvoiceExportData({query:a,invoiceGroup:T.VAT,currentUser:r
}),{rows:l,auditRows:g,warnings:p=[]}=fe({orders:s,returnOrders:d,customers:h,products:m,query:a});if(!l.length)return{
error:"Không có đơn VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",status:404,code:"INVOICE_EXPORT_NO_DATA"};const f=n(),y=[w,...l.map(e=>w.map(n=>e[n]??""))]
;o(f,"Sheet1",y,{autoFilter:!0})
;const S=["MaDon","MaKhachHang","TenKhachHang","MaSoThue","DiaChiHoaDon","MaSanPham","SanPham","Quy cách","Giá bán","SoLuongBan","SoLuongTra","SoLuongTraAnToan","SoLuongXuatHoaDon","GiaSauKhuyenMaiCoVAT","DonGiaTruocVAT","ThanhTienTruocVAT","ReturnOrderCode","ReturnOrderId","ReturnQtySource","LyDoBoDong"]
;o(f,"DoiChieu",[S,...g.map(e=>S.map(n=>e[n]??""))]);const C=l.reduce((e,n)=>(""!==n.TienBan&&(e.invoiceCount+=1,e.amountBeforeVat+=I(n.TienBan),e.vatAmount+=I(n.TienThue),
e.totalAmount+=I(n.TongCong)),e.lineCount+=n.MaSanPham?1:0,e),{invoiceCount:0,lineCount:0,amountBeforeVat:0,vatAmount:0,totalAmount:0})
;o(f,"ThongTin",[["Mẫu","TT78 - Sheet1"],["Từ ngày","0000-01-01"===u?"":u],["Đến ngày","9999-12-31"===c?"":c],["Số hóa đơn",C.invoiceCount],["Số dòng sản phẩm",C.lineCount],["Tiền bán trước thuế",E(C.amountBeforeVat,2)],["Tiền thuế 8%",E(C.vatAmount,2)],["Tổng cộng",Math.round(C.totalAmount)],["Quy tắc","Số lượng xuất HĐ = số lượng bán - số lượng trả; Đơn giá = giá sau khuyến mại trên đơn / 1.08"]])
;const N=t(f),D="0000-01-01"===u?"all":u,M="9999-12-31"===c?e.todayVN():c;return{buffer:N,rows:l.length,orderCount:C.invoiceCount,warningCount:p.length,warnings:p.slice(0,100),
fileName:`Hoa_don_VAT_TT78_${D}_${M}.xlsx`}}function Se(e={}){
return[Q(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH),Q(e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName)].filter(Boolean).join(" - ")
}function Ce(e={}){return Q(e.orderSourceName||e.orderSource||e.source||e.sourceType||e.importSource||"")}async function Ne(a={},r={}){const i=K.normalizeExportQuery(a,{
invoiceGroup:T.NON_VAT}),u=i.dateFrom||"0000-01-01",c=i.dateTo||"9999-12-31",{orders:s,returnOrders:d,customers:m,products:g}=await K.loadInvoiceExportData({query:a,
invoiceGroup:T.NON_VAT,currentUser:r}),p=(s||[]).filter(q).filter(e=>l(e)===T.NON_VAT).filter(e=>K.matchesInvoiceExportFilters(e,a,{invoiceGroup:T.NON_VAT
})),f=se(d),y=me(m),S=le(g),C=[],N=[];let D=0,M=0,A=0;p.forEach((e,n)=>{const o=ge(e,y),t=$(e);let a=0,r=0;for(const n of Array.isArray(e.items)?e.items:[]){
const o=F(n),i=S.get(o)||{},u=Z(n),c=Math.min(u,he(f,e,n)),s=Math.max(0,u-c),d=J(n)||(u?Y(n)/u:0),T=E(s*d,2);a+=E(c*d,2),r+=T,N.push({"Mã đơn":t,"Mã sản phẩm":o,
"Tên sản phẩm":X(n)||Q(i.name||i.productName),"Quy cách":h.catalogPackingQty(i),"Giá bán":h.catalogSalePrice(i),"Số lượng bán":u,"Số lượng trả":c,"Số lượng còn lại":s,"Đơn giá":d,
"Thành tiền":T})}const i=I(e.totalAmount||e.grandTotal||0),u=I(e.paidAmount||e.paymentAmount||0),c=I(e.debtAmount??Math.max(0,i-u));D+=i,M+=a,A+=r,C.push({STT:n+1,
"Ngày bán":L(e.orderDate||e.date||e.documentDate||e.createdAt),"Mã đơn":t,"Mã khách hàng":o.code,"Tên khách hàng":o.name,NVBH:Se(e),"Nguồn đơn":Ce(e),"Giá trị đơn":i,
"Tiền đã thu":u,"Công nợ":c,"Lý do không xuất":Q(e.vatInvoiceNote),"Người thay đổi":Q(e.vatInvoiceUpdatedBy),"Thời gian thay đổi":Q(e.vatInvoiceUpdatedAt)})})
;const v=N.filter(e=>Number(e["Số lượng còn lại"])>0);if(!C.length||!v.length)return{error:"Không có đơn không VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",
status:404,code:"INVOICE_EXPORT_NO_DATA"};const H=n()
;He(H,"DanhSachDon",["STT","Ngày bán","Mã đơn","Mã khách hàng","Tên khách hàng","NVBH","Nguồn đơn","Giá trị đơn","Tiền đã thu","Công nợ","Lý do không xuất","Người thay đổi","Thời gian thay đổi"],C),
He(H,"ChiTietHang",["Mã đơn","Mã sản phẩm","Tên sản phẩm","Quy cách","Giá bán","Số lượng bán","Số lượng trả","Số lượng còn lại","Đơn giá","Thành tiền"],N),
o(H,"ThongTin",[["Từ ngày","0000-01-01"===u?"":u],["Đến ngày","9999-12-31"===c?"":c],["Số đơn không xuất hóa đơn",C.length],["Tổng giá trị đơn",E(D,2)],["Tổng hàng trả",E(M,2)],["Giá trị còn lại",E(A,2)]])
;const b=t(H),P="0000-01-01"===u?"all":u,k="9999-12-31"===c?e.todayVN():c,V=P===k?P:`${P}_${k}`;return{buffer:b,rows:v.length,orderCount:C.length,
fileName:`Hoa_don_khong_VAT_${V}.xlsx`}}
const De=["sales-report","delivery-report","return-report","debt-report","ar-ledger-detail","stock-report","inventory-movement-report","stock-card-report","fund-report","salesman-report","deliveryman-report","customer-sales-report","product-sales-report","product-info-report","customer-info-report","user-info-report"]
;function Me(e={}){return{from:L(e.dateFrom||e.from||e.fromDate||""),to:L(e.dateTo||e.to||e.toDate||"")}}function Ae(e={},n=["date","createdAt"]){const{from:o,to:t}=Me(e)
;return o||t?{$or:n.map(e=>({[e]:{...o?{$gte:o}:{},...t?{$lte:"createdAt"===e?`${t}T23:59:59.999Z`:t}:{}}}))}:{}}function ve(e={}){
return Math.min(Math.max(Number(e.limit||1e5),1),2e5)}function He(e,n,t,a){const r=a.map(e=>t.map(n=>e[n]??""));o(e,String(n||"BaoCao").slice(0,31),[t,...r])}function Ke(e=""){
return{"stock-report":"Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.",
"inventory-movement-report":"Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.",
"stock-card-report":"Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.",
"sales-report":"Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.",
"return-report":"Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.","debt-report":"Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.",
"ar-ledger-detail":"Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.","fund-report":"Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.",
"delivery-report":"Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.",
"product-info-report":"Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.",
"customer-info-report":"Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán."
}[e]||"Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống."}async function be(a,r,i,u,c={}){const s=await h.enrichRows(u,{packingKey:"Quy cách",salePriceKey:"Giá bán"
}),d=[...i];s.hasProducts&&(d.includes("Quy cách")||d.push("Quy cách"),d.includes("Giá bán")||d.push("Giá bán"));const T=n();He(T,r,d,s.rows);const{from:m,to:l}=Me(c)
;o(T,"ThongTin",[["Mẫu báo cáo",r],["Từ ngày",m],["Đến ngày",l],["Số dòng",s.rows.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc nghiệp vụ",Ke(a)]])
;const g=String(a||"report").replace(/[^a-zA-Z0-9_-]/g,"-"),p=`${m||"all"}_${l||e.todayVN()}`;return{buffer:t(T),rows:s.rows.length,fileName:`${g}_${p}.xlsx`}}function Pe(e={}){
return Array.isArray(e.items)?e.items:[]}function ke(e={}){return Pe(e).reduce((e,n)=>e+Z(n),0)||I(e.totalQuantity||e.quantity||0)}function Ve(e={},n={}){
return I(e.originalPrice??e.basePrice??e.listPrice??n.salePrice??e.salePrice??e.price??e.unitPrice??0)}function xe(e={},n={}){return Z(e)*Ve(e,n)}function Ge(e={}){
return I(e.finalAmount??e.amount??e.totalAmount??e.lineAmount??0)||Z(e)*J(e)}function Re(e={},n=new Map){
return Pe(e).reduce((e,o)=>e+xe(o,n.get(F(o))||{}),0)||I(e.beforePromoAmount||e.grossAmount||e.totalBeforeDiscount||e.totalAmount||0)}function Oe(e={}){
return I(e.afterPromoAmount||e.totalAfterPromotion||e.totalAmount||e.amount||0)}function Be(e={},n="sales"){return Q("delivery"===n?N(e):S(e))}function we(e={},n="sales"){
return Q("delivery"===n?C(e):y(e))}async function Qe(){const e=await d.find({}).select("code name salePrice conversionRate baseUnit unit brand category").lean()
;return new Map(e.map(e=>[Q(e.code),e]))}async function Ie(e={}){const n=((await f.salesReport({...e,full:"1",export:"1"})).sales||[]).map((e,n)=>({STT:n+1,Ngay:e.date,
MaDon:e.code,Nguon:e.source,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,
SoLuongBan:e.saleQuantity,SoLuongKhuyenMai:e.promoQuantity,DoanhSoTruocKM:Math.round(I(e.beforePromoAmount)),DoanhSoThucTe:Math.round(I(e.actualAmount)),
ChietKhauKM:Math.round(I(e.promotionDiscountAmount)),GiaTriHangKM:Math.round(I(e.promotionValue)),DaThuTheoAR:Math.round(I(e.receiptAmount)),
TraHangTheoAR:Math.round(I(e.returnAmount)),DieuChinhCongNo:Math.round(I(e.adjustmentAmount)),ConNoTheoAR:Math.round(I(e.debtAmount)),TrangThaiGiaoHang:e.deliveryStatus,
TrangThaiKeToan:e.accountingStatus}));return be("sales-report","BaoCaoBanHang",Object.keys(n[0]||{STT:"",Ngay:"",MaDon:"",Nguon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",
MaNVGH:"",NVGH:"",SoLuongBan:"",SoLuongKhuyenMai:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DieuChinhCongNo:"",
ConNoTheoAR:"",TrangThaiGiaoHang:"",TrangThaiKeToan:""}),n,e)}async function Ee(e={}){const n=((await f.deliveryReport({...e,full:"1",export:"1"})).delivery||[]).map((e,n)=>({
STT:n+1,NgayGiao:e.deliveryDate,MaDonTong:e.code,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoDonDangGan:e.assignedOrderCount,SoDonDaGiao:e.orderCount,
TongTienDonCon:Math.round(I(e.totalAmount)),DoanhSoDaXacNhan:Math.round(I(e.accountingConfirmedAmount)),TienThuTheoQuy:Math.round(I(e.collectedAmount)),TrangThai:e.status,
LechSoDonSnapshot:I(e.dataQuality?.snapshotOrderCountDifference),LechTienSnapshot:Math.round(I(e.dataQuality?.snapshotAmountDifference))}))
;return be("delivery-report","BaoCaoGiaoHang",Object.keys(n[0]||{STT:"",NgayGiao:"",MaDonTong:"",MaNVGH:"",NVGH:"",SoDonDangGan:"",SoDonDaGiao:"",TongTienDonCon:"",
DoanhSoDaXacNhan:"",TienThuTheoQuy:"",TrangThai:"",LechSoDonSnapshot:"",LechTienSnapshot:""}),n,e)}async function Le(e={}){const n=((await f.returnReport({...e,full:"1",export:"1"
})).returns||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaTraHang:e.code,MaDon:e.salesOrderCode,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,
NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,GiaTriTra:Math.round(I(e.amount)),GiaTriChungTu:Math.round(I(e.documentAmount)),
GiaTriARReturn:Math.round(I(e.arAmount)),TrangThaiNhapKho:e.warehouseReceiveStatus,TrangThaiTraHang:e.returnState,TrangThaiKeToan:e.accountingStatus}))
;return be("return-report","BaoCaoTraHang",Object.keys(n[0]||{STT:"",Ngay:"",MaTraHang:"",MaDon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",GiaTriTra:"",
GiaTriChungTu:"",GiaTriARReturn:"",TrangThaiNhapKho:"",TrangThaiTraHang:"",TrangThaiKeToan:""}),n,e)}async function _e(e={}){const n=((await f.periodDebtReport({...e,full:"1",
export:"1",includePaid:"1"})).debts||[]).map((e,n)=>({STT:n+1,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,DuDauKy:Math.round(I(e.openingBalance)),PhatSinhNo:Math.round(I(e.debitInPeriod)),DaThu:Math.round(I(e.receiptInPeriod)),
TraHang:Math.round(I(e.returnInPeriod)),ChietKhauDieuChinh:Math.round(I(e.adjustmentInPeriod)+I(e.otherCreditInPeriod)),TongPhatSinhCo:Math.round(I(e.totalCreditInPeriod)),
DuCuoiKy:Math.round(I(e.closingBalance))}));return be("debt-report","BaoCaoCongNo",Object.keys(n[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",
DuDauKy:"",PhatSinhNo:"",DaThu:"",TraHang:"",ChietKhauDieuChinh:"",TongPhatSinhCo:"",DuCuoiKy:""}),n,e)}async function qe(e={}){const n=((await f.arLedgerDetailReport({...e,
full:"1",export:"1"})).ledger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaKhachHang:e.customerCode,KhachHang:e.customerName,ChungTu:e.documentCode,Loai:e.type,DienGiai:e.description,
DuTruocGiaoDich:Math.round(I(e.openingBalance)),No:Math.round(I(e.debit)),Co:Math.round(I(e.credit)),PhanLoaiCo:e.creditCategory,DuSauGiaoDich:Math.round(I(e.closingBalance))}))
;return be("ar-ledger-detail","SoCongNoChiTiet",Object.keys(n[0]||{STT:"",Ngay:"",MaKhachHang:"",KhachHang:"",ChungTu:"",Loai:"",DienGiai:"",DuTruocGiaoDich:"",No:"",Co:"",
PhanLoaiCo:"",DuSauGiaoDich:""}),n,e)}async function je(e={}){const n=((await f.stockReport({...e,full:"1",export:"1"})).stock||[]).map((e,n)=>({STT:n+1,
MaSP:Q(e.productCode||e.code||e.productId),SanPham:Q(e.productName||e.name),DonViTinh:Q(e.unit||e.baseUnit),TonVatLy:I(e.onHand??e.quantity??e.qty),DaGiuCho:I(e.reservedQty),
TonKhaDung:I(e.availableQty)}));return be("stock-report","TonKhoHienTai",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonVatLy:"",DaGiuCho:"",TonKhaDung:""}),n,{})}
async function $e(e={}){const n=((await f.inventoryMovementReport({...e,full:"1",export:"1",mode:"movement"})).stock||[]).map((e,n)=>({STT:n+1,MaSP:e.productCode,
SanPham:e.productName,DonViTinh:e.unit,TonDauKy:I(e.openingQty),NhapMua:I(e.importQty),HangTraNhapKho:I(e.returnQty),NhapKhac:I(e.otherInQty),TongNhap:I(e.inQty),
XuatBan:I(e.saleQty),XuatDaoChungTu:I(e.reversalOutQty),XuatKhac:I(e.otherOutQty),TongXuat:I(e.outQty),DieuChinhRong:I(e.adjustmentQty),TonCuoiKy:I(e.endingQty),
NguonTonCuoi:e.endingSource,TonCuoiTheoLedger:I(e.ledgerEndingQty),ChenhLechDoiSoat:I(e.reconciliationDifference)}))
;return be("inventory-movement-report","NhapXuatTon",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonDauKy:"",NhapMua:"",HangTraNhapKho:"",NhapKhac:"",TongNhap:"",
XuatBan:"",XuatDaoChungTu:"",XuatKhac:"",TongXuat:"",DieuChinhRong:"",TonCuoiKy:"",NguonTonCuoi:"",TonCuoiTheoLedger:"",ChenhLechDoiSoat:""}),n,e)}async function Fe(e={}){
const n=((await f.stockCardReport({...e,full:"1",export:"1"})).transactions||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaSP:e.productCode,SanPham:e.productName,ChungTu:e.refCode,
Loai:e.type,PhanLoai:e.category,TonTruocGiaoDich:I(e.openingQty),Nhap:I(e.inQty),Xuat:I(e.outQty),TonSauGiaoDich:I(e.balanceQty),GhiChu:e.note}))
;return be("stock-card-report","TheKho",Object.keys(n[0]||{STT:"",Ngay:"",MaSP:"",SanPham:"",ChungTu:"",Loai:"",PhanLoai:"",TonTruocGiaoDich:"",Nhap:"",Xuat:"",TonSauGiaoDich:"",
GhiChu:""}),n,e)}async function Xe(e={}){const n=((await f.financeReport({...e,full:"1",export:"1"})).fundLedger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,ChungTu:e.code,Loai:e.type,
LoaiQuy:e.fundType,TaiKhoanQuy:e.account,NguoiLienQuan:e.counterparty,TonDauDong:Math.round(I(e.openingBalance)),Thu:Math.round(I(e.inAmount)),Chi:Math.round(I(e.outAmount)),
TonCuoiDong:Math.round(I(e.endingBalance)),GhiChu:e.note}));return be("fund-report","BaoCaoQuyTien",Object.keys(n[0]||{STT:"",Ngay:"",ChungTu:"",Loai:"",LoaiQuy:"",TaiKhoanQuy:"",
NguoiLienQuan:"",TonDauDong:"",Thu:"",Chi:"",TonCuoiDong:"",GhiChu:""}),n,e)}async function Ue(e={}){const n=((await f.salesReport({...e,full:"1",export:"1"
})).bySalesman||[]).map((e,n)=>({STT:n+1,MaNVBH:e.salesmanCode,NVBH:e.salesmanName,SoDon:e.orderCount,SoKhachHang:e.customerCount,DoanhSoTruocKM:Math.round(I(e.beforePromoAmount)),
DoanhSoThucTe:Math.round(I(e.actualAmount)),GiaTriHangKM:Math.round(I(e.promotionValue)),DaThuTheoAR:Math.round(I(e.receiptAmount)),TraHangTheoAR:Math.round(I(e.returnAmount)),
ConNoTheoAR:Math.round(I(e.debtAmount))}));return be("salesman-report","BaoCaoNVBH",Object.keys(n[0]||{STT:"",MaNVBH:"",NVBH:"",SoDon:"",SoKhachHang:"",DoanhSoTruocKM:"",
DoanhSoThucTe:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",ConNoTheoAR:""}),n,e)}async function Ze(e={}){const n=((await f.deliveryReport({...e,full:"1",export:"1"
})).byStaff||[]).map((e,n)=>({STT:n+1,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoChuyen:e.tripCount,SoDonDaGiao:e.orderCount,TongTienDonCon:Math.round(I(e.totalAmount)),
DoanhSoDaXacNhan:Math.round(I(e.accountingConfirmedAmount)),ThuTienTheoQuy:Math.round(I(e.collectedAmount))}));return be("deliveryman-report","BaoCaoNVGH",Object.keys(n[0]||{
STT:"",MaNVGH:"",NVGH:"",SoChuyen:"",SoDonDaGiao:"",TongTienDonCon:"",DoanhSoDaXacNhan:"",ThuTienTheoQuy:""}),n,e)}async function We(e={}){const n=await f.salesReport({...e,
full:"1",export:"1"}),o=await f.periodDebtReport({...e,full:"1",export:"1",includePaid:"1"}),t=new Map((o.debts||[]).map(e=>[Q(e.customerCode||e.customerName),e])),a=new Map
;(n.sales||[]).forEach(e=>{const n=Q(e.customerCode||e.customerName),o=a.get(n)||{MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
SoDon:0,DoanhSoTruocKM:0,DoanhSoThucTe:0,GiaTriHangKM:0,DaThuTheoAR:0,TraHangTheoAR:0};o.SoDon+=1,o.DoanhSoTruocKM+=I(e.beforePromoAmount),o.DoanhSoThucTe+=I(e.actualAmount),
o.GiaTriHangKM+=I(e.promotionValue),o.DaThuTheoAR+=I(e.receiptAmount),o.TraHangTheoAR+=I(e.returnAmount),a.set(n,o)});const r=Array.from(a.entries()).map(([e,n],o)=>{
const a=t.get(e)||{};return{STT:o+1,...n,DoanhSoTruocKM:Math.round(n.DoanhSoTruocKM),DoanhSoThucTe:Math.round(n.DoanhSoThucTe),GiaTriHangKM:Math.round(n.GiaTriHangKM),
DaThuTheoAR:Math.round(n.DaThuTheoAR),TraHangTheoAR:Math.round(n.TraHangTheoAR),DuDauKy:Math.round(I(a.openingBalance)),DuCuoiKy:Math.round(I(a.closingBalance))}})
;return be("customer-sales-report","DoanhSoKhachHang",Object.keys(r[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",SoDon:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",
GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DuDauKy:"",DuCuoiKy:""}),r,e)}async function ze(e={}){const n=await f.salesReport({...e,full:"1",export:"1"}),o=new Map
;(n.sales||[]).forEach(e=>(e.items||[]).forEach(e=>{const n=Q(e.productCode||e.productName),t=o.get(n)||{MaSP:e.productCode,SanPham:e.productName,NhanHang:e.brand,SoLuongBan:0,
DoanhSoTruocKM:0,DoanhSoThucTe:0};t.SoLuongBan+=I(e.quantity),t.DoanhSoTruocKM+=I(e.catalogAmount),t.DoanhSoThucTe+=I(e.actualAmount),o.set(n,t)}))
;const t=Array.from(o.values()).reduce((e,n)=>e+n.DoanhSoThucTe,0)||1,a=Array.from(o.values()).map((e,n)=>({STT:n+1,...e,SoLuongBan:e.SoLuongBan,
DoanhSoTruocKM:Math.round(e.DoanhSoTruocKM),DoanhSoThucTe:Math.round(e.DoanhSoThucTe),ChietKhauKM:Math.round(e.DoanhSoTruocKM-e.DoanhSoThucTe),
TyTrong:`${E(e.DoanhSoThucTe/t*100,2)}%`}));return be("product-sales-report","DoanhSoSanPham",Object.keys(a[0]||{STT:"",MaSP:"",SanPham:"",NhanHang:"",SoLuongBan:"",
DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",TyTrong:""}),a,e)}
const Je=new Set(["password","passwordHash","hash","salt","token","tokens","accessToken","refreshToken","secret","apiKey","session","sessions","resetPasswordToken","verificationToken"])
;function Ye(e={},n=[]){for(const o of n){const n=Q(e[o]);if(n)return n}return""}function en(e){return!0===e?"Hoạt động":!1===e?"Ngưng hoạt động":Q(e)}function nn(e={},n=[],o=[]){
const t=new Set([...n,...o,"_id","__v","searchText"]),a={};return Object.keys(e||{}).forEach(n=>{if(t.has(n))return;const o=e[n];null!=o&&""!==o&&(a[n]=o)}),
Object.keys(a).length?JSON.stringify(a):""}function on(e={},n=0,o=new Map){const t=Ye(e,["code","productCode","sku","id"]),a=o.get(Q(t).toUpperCase())||{};return{STT:n+1,MaSP:t,
TenSP:Ye(e,["name","productName","title"]),Barcode:Ye(e,["barcode","barCode"]),NhanHang:Ye(e,["brand","brandName"]),NganhHang:Ye(e,["category","categoryName","groupName"]),
DonVi:Ye(e,["unit","baseUnit","uom"]),DonViCoSo:Ye(e,["baseUnit","unit"]),QuyDoi:I(e.conversionRate||e.ratio||1),
"Quy cách":Math.max(1,I(e.conversionRate||e.packingQty||e.unitsPerCase||1)),"Giá bán":Math.round(I(e.salePrice||e.price||e.sellPrice)),
GiaVon:Math.round(I(e.costPrice||e.cost||e.purchasePrice)),TonVatLy:I(a.onHand??a.quantity??a.qty),DaGiuCho:I(a.reservedQty),TonKhaDung:I(a.availableQty),
KhuBocHang:A(D(M(e),v.HC)),TrangThai:en(e.isActive??e.status),NgayTao:L(e.createdAt),NgayCapNhat:L(e.updatedAt),
ThongTinKhac:nn(e,["code","productCode","sku","name","productName","barcode","brand","category","unit","baseUnit","conversionRate","packing","salePrice","costPrice","pickingZone","warehouseCode","warehouseName","defaultWarehouse","isActive","status","createdAt","updatedAt"])
}}async function tn(e={}){const[n,o]=await Promise.all([d.find({}).sort({code:1,name:1}).limit(ve(e)).lean(),f.stockReport({full:"1",export:"1"
})]),t=new Map((o.stock||o.items||[]).map(e=>[Q(e.productCode||e.code).toUpperCase(),e])),a=n.map((e,n)=>on(e,n,t))
;return be("product-info-report","ThongTinSanPham",Object.keys(a[0]||on({},-1,t)),a,e)}function an(e={}){return[e.customerCode,e.customerId,e.customerName].map(Q).filter(Boolean)}
async function rn(){const n=await f.periodDebtReport({dateFrom:"0000-01-01",dateTo:e.todayVN(),full:"1",export:"1",includePaid:"1"}),o=new Map
;return(n.debts||n.items||[]).forEach(e=>{const n=I(e.closingBalance);an(e).forEach(e=>o.set(e,n))}),o}async function un(n={}){
const o=e.todayVN(),t=Q(n.monthStart||n.monthFrom||`${o.slice(0,7)}-01`),a=Q(n.monthEnd||n.monthTo||o),r=await f.salesReport({dateFrom:t,dateTo:a,full:"1",export:"1"}),i=new Map
;return(r.sales||r.items||[]).forEach(e=>{const n=I(e.actualAmount);[e.customerCode,e.customerId,e.customerName].map(Q).filter(Boolean).forEach(e=>{i.set(e,I(i.get(e))+n)})}),i}
function cn(e,n=[]){for(const o of n.map(Q).filter(Boolean))if(e.has(o))return I(e.get(o));return 0}function sn(e={},n=0,o=new Map,t=new Map){
const a=O(e),r=B(e),i=[e.code,e.customerCode,e.id,e._id,e.name,e.customerName];return{STT:n+1,MaKH:Ye(e,["code","customerCode","id"]),TenKH:Ye(e,["name","customerName"]),
TenHoKinhDoanh:r.businessName,SDT:Ye(e,["phone","mobile","customerPhone","tel"]),DiaChi:Ye(e,["address","customerAddress","fullAddress"]),MaSoThue:a.taxCode,
DiaChiHoaDonThue:a.taxInvoiceAddress,Tuyen:Ye(e,["route","routeName","line"]),KhuVuc:Ye(e,["area","areaName","region","province"]),
MaNVBH:Ye(e,["staffCode","salesStaffCode","salesmanCode"]),NVBHPhuTrach:Ye(e,["staffName","salesStaffName","salesmanName"]),MaNVGH:Ye(e,["deliveryStaffCode","shipperCode"]),
NVGHPhuTrach:Ye(e,["deliveryStaffName","shipperName"]),CongNoHienTai:Math.round(cn(o,i)),DoanhSoThang:Math.round(cn(t,i)),TrangThai:en(e.isActive??e.status),NgayTao:L(e.createdAt),
NgayCapNhat:L(e.updatedAt),
ThongTinKhac:nn(e,["code","customerCode","name","customerName","businessName","customerBusinessName","householdBusinessName","taxBusinessName","invoiceBusinessName","tenHoKinhDoanh","phone","mobile","customerPhone","address","customerAddress","taxCode","customerTaxCode","taxNumber","vatNumber","vatCode","mst","taxInvoiceAddress","customerTaxInvoiceAddress","invoiceAddress","vatInvoiceAddress","billingAddress","route","area","region","staffCode","staffName","salesStaffCode","salesStaffName","deliveryStaffCode","deliveryStaffName","isActive","status","createdAt","updatedAt"])
}}async function dn(e={}){const[n,o,t]=await Promise.all([s.find({}).sort({code:1,name:1
}).limit(ve(e)).lean(),rn(),un(e)]),a=n.map((e,n)=>sn(e,n,o,t)).sort((e,n)=>I(n.CongNoHienTai)-I(e.CongNoHienTai)||Q(e.MaKH).localeCompare(Q(n.MaKH)));return a.forEach((e,n)=>{
e.STT=n+1}),be("customer-info-report","ThongTinKhachHang",Object.keys(a[0]||sn({},-1)),a,e)}function hn(e={}){const n={};return Object.keys(e||{}).forEach(o=>{
if(Je.has(o)||o.startsWith("_")||["__v","searchText"].includes(o))return
;if(["username","fullName","name","code","staffCode","role","roles","phone","email","isActive","status","permissions","area","route","lastLoginAt","lastLogin","createdAt","updatedAt"].includes(o))return
;const t=e[o];null!=t&&""!==t&&(n[o]=t)}),Object.keys(n).length?JSON.stringify(n):""}function Tn(e={},n=0){return{STT:n+1,TenDangNhap:Ye(e,["username","loginName"]),
HoTen:Ye(e,["fullName","name","displayName"]),MaNhanVien:Ye(e,["staffCode","code","employeeCode"]),VaiTro:Array.isArray(e.roles)?e.roles.join(", "):Ye(e,["role","roles"]),
SDT:Ye(e,["phone","mobile"]),Email:Ye(e,["email"]),TrangThai:en(e.isActive??e.status),
QuyenTruyCap:Array.isArray(e.permissions)?e.permissions.join(", "):Q(e.permissions||e.permission||""),KhuVucTuyen:Ye(e,["area","route","region"]),NgayTao:L(e.createdAt),
NgayCapNhat:L(e.updatedAt),LanDangNhapGanNhat:L(e.lastLoginAt||e.lastLogin||e.lastSeenAt),ThongTinKhac:hn(e)}}async function mn(e={}){
const n=p.users,o=(await n.find({}).select("-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken").sort({
role:1,code:1,username:1}).limit(ve(e)).lean()).map(Tn);return be("user-info-report","ThongTinTaiKhoan",Object.keys(o[0]||Tn({},-1)),o,e)}const ln={"sales-report":Ie,
"delivery-report":Ee,"return-report":Le,"debt-report":_e,"ar-ledger-detail":qe,"stock-report":je,"inventory-movement-report":$e,"stock-card-report":Fe,"fund-report":Xe,
"salesman-report":Ue,"deliveryman-report":Ze,"customer-sales-report":We,"product-sales-report":ze,"product-info-report":tn,"customer-info-report":dn,"user-info-report":mn}
;async function gn(e){return a.preview(e)}async function pn(e){return a.commit(e)}async function fn(){return a.logs()}function yn(){return r.getBuiltInTemplates()}
async function Sn(e){return r.buildBuiltInTemplateFile(e)}function Cn(e){return r.getFields(e)}async function Nn(){return r.listCustomTemplates()}async function Dn(e){
return r.saveCustomTemplate(e)}async function Mn(e){return r.deleteCustomTemplate(e)}async function An(e){return r.buildCustomTemplateFile(e)}function vn(){
return[...new Set([...i.getExportTypes(),"invoice-orders","vatInvoiceTT78","vat-non-invoice-orders","sse-invoice-orders","sse-invoice-errors",...De])].sort()}
async function Hn(n,o={},t={}){const a=String(n||"").trim();if(["sse-invoice-orders","sseInvoiceOrders"].includes(a))return H.buildSseInvoiceWorkbook(o,t)
;if(["sse-invoice-errors","sseInvoiceErrors"].includes(a))return H.buildSseErrorReportWorkbook(o,t);if(["invoice-orders","invoiceOrders"].includes(a)){const e=m(o.invoiceType)
;return e?e===T.VAT?ye(o,t):Ne(o,t):{error:"invoiceType chỉ nhận VAT hoặc NON_VAT",status:400}}
if(["vatInvoiceTT78","vat-invoice-tt78","hoa-don-vat-tt78"].includes(a))return ye(o,t);if(["vat-non-invoice-orders","vatNonInvoiceOrders"].includes(a))return Ne(o,t)
;if(ln[a])return ln[a](o);const r=await i.findForExport(n,o);if(!r)return{error:"Loại dữ liệu export không hợp lệ",status:400};const u=await G({type:n,rows:r
}),c=String(n||"data").replace(/[^a-zA-Z0-9_-]/g,"-");return{buffer:u,rows:r.length,fileName:`${c}-export-${e.todayVN()}.xlsx`}}module.exports={previewImport:gn,commitImport:pn,
getImportLogs:fn,getBuiltInTemplates:yn,buildBuiltInTemplateFile:Sn,getFields:Cn,listCustomTemplates:Nn,saveCustomTemplate:Dn,deleteCustomTemplate:Mn,buildCustomTemplateFile:An,
getExportTypes:vn,exportToExcel:Hn};
