/* GENERATED FILE — edit src/services/importExportLegacy.service.source/part-01.jsfrag, src/services/importExportLegacy.service.source/part-02.jsfrag, src/services/importExportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{createWorkbook:n,appendAoaSheet:o,writeWorkbook:t}=require("../utils/excelWriter.util"),a=require("./excelImportService"),r=require("./importTemplateService"),i=require("../repositories/exportRepository"),u=require("../models/SalesOrder"),c=require("../models/ReturnOrder"),s=require("../models/Customer"),d=require("../models/Product"),h=require("./excel/ProductExcelEnrichmentService"),{INVOICE_TYPES:T,normalizeInvoiceType:m,resolveInvoiceType:l,isActiveInvoiceOrder:g,buildInvoiceOrderFilter:f}=require("./invoiceExportClassifier"),p=require("../models"),y=require("./reportService"),{pickSalesStaffCode:S,pickSalesStaffName:C,pickDeliveryStaffCode:N,pickDeliveryStaffName:D}=require("../domain/staff/staffIdentity"),{normalizePickingZone:M,pickingZoneFrom:A,pickingZoneLabel:H,PICKING_ZONES:v}=require("../utils/pickingZone.util"),K=require("./sseInvoiceExport.service")
;function b(e={}){const n={...e};return delete n._id,delete n.__v,n}function P(e){return null==e?"":Array.isArray(e)||"object"==typeof e?JSON.stringify(e):e}function k(e=[]){
const n=e.map(b),o=new Set;n.forEach(e=>Object.keys(e).forEach(e=>o.add(e)));const t=Array.from(o),a=n.map(e=>t.map(n=>P(e[n])));return{headers:t,body:a}}function V(e=""){
return"products"===w(e).toLowerCase()?["productCode","code","sku","barcode"]:h.PRODUCT_CODE_KEYS}async function x({type:e,rows:a}){const r=V(e),i=await h.enrichRows(a,{
productCodeKeys:r,packingKey:"Quy cách",salePriceKey:"Giá bán"}),{headers:u,body:c}=k(i.rows),s=n();o(s,"Export",[u,...c]);const d=h.documentProductLines(a);if(d.length){
const e=(await h.enrichRows(d,{packingKey:"Quy cách",salePriceKey:"Giá bán"})).rows.map(e=>({MaChungTu:e.documentCode,MaSP:$(e),SanPham:F(e),"Quy cách":e["Quy cách"],
"Giá bán":e["Giá bán"],SoLuong:U(e),GiaSauKM:Q(e.finalPrice??e.priceAfterPromotion??e.discountedPrice??""),ThanhTien:J(e)
})),n=["MaChungTu","MaSP","SanPham","Quy cách","Giá bán","SoLuong","GiaSauKM","ThanhTien"];o(s,"ChiTietSanPham",[n,...e.map(e=>n.map(n=>e[n]??""))])}
return o(s,"ThongTin",[["Loại dữ liệu",e],["Số dòng",a.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc sản phẩm","Nếu có sản phẩm: Quy cách là số lượng đóng gói; Giá bán lấy từ danh mục sản phẩm. Đơn con giữ thêm Giá sau KM."]]),
t(s)}
const R=.08,{extractCustomerTaxProfile:B}=require("../utils/customerTaxProfile.util"),{extractCustomerBusinessProfile:G}=require("../utils/customerBusinessProfile.util"),O=["STT","NgayHoaDon","MaKhachHang","TenKhachHang","TenNguoiMua","MaSoThue","DiaChiKhachHang","DienThoaiKhachHang","SoTaiKhoan","NganHang","HinhThucTT","MaSanPham","SanPham","DonViTinh","Extra1SP","Extra2SP","SoLuong","DonGia","TyLeChietKhauHienThi","SoTienChietKhau","ThanhTien","TienBan","ThueSuat","TienThueSanPham","TienThue","TongCong","TinhChatHangHoa","DonViTienTe","TyGia","Fkey","Extra1","Extra2","EmailKhachHang","VungDuLieu","Extra3","Extra4","Extra5","Extra6","Extra7","Extra8","Extra9","Extra10","Extra11","Extra12","LOONo","HDSe","xVTNXHan","NVChuan","PTChuyenKhoan","HDKTTu","CCCDan"]
;function w(e){return String(e??"").trim()}function Q(e,n=0){const o=Number(String(e??"").replace(/,/g,""));return Number.isFinite(o)?o:n}function I(e,n=2){const o=10**n
;return Math.round(Q(e)*o)/o}function L(n){return e.toDateOnly(n||"")||w(n).slice(0,10)}function E(e,n={}){
const o=L(e),t=L(n.dateFrom||n.from||n.fromDate||""),a=L(n.dateTo||n.to||n.toDate||"");return!(t&&o<t||a&&o>a)}function _(e={}){return g(e)}function q(e={}){
return[e.id,e._id,e.code,e.orderCode,e.documentCode,e.salesOrderId,e.salesOrderCode,e.externalOrderCode,e.invoiceCode,e.refCode].map(w).filter(Boolean)}function j(e={}){
return w(e.code||e.orderCode||e.salesOrderCode||e.documentCode||e.id||e._id)}function $(e={}){return w(e.productCode||e.code||e.sku||e.barcode||e.productId||e.id)}function F(e={}){
return w(e.productName||e.name||e.itemName||e.productTitle||"")}function X(e={},n={}){return w(e.unit||e.baseUnit||e.dvt||e.uom||n.unit||n.baseUnit||"")}function U(e={}){
return Q(e.quantity??e.qty??e.totalQty??e.qtySale??e.saleQty??0)}function Z(e={}){return Q(e.returnQty??e.qtyReturn??e.returnQuantity??e.returnedQty??0)}function W(e={}){
return w(e.lineKey||e.orderLineId||e.salesOrderItemId||e.itemId||e._id||"")}function z(e={}){
return Q(e.finalPrice??e.priceAfterPromotion??e.promoPrice??e.price??e.salePrice??e.unitPrice??e.sellPrice??0)}function J(e={}){
return Q(e.amount??e.totalAmount??e.lineAmount??e.money??0)||U(e)*z(e)}function Y(e,n){return`${w(e)}@@${w(n)}`}function ee(e={}){const n=z(e);return n?String(I(n,6)):""}
function ne(e,n,o="",t=""){return[w(e),w(n),w(o),w(t)].join("@@")}function oe(e={}){return w(e.code||e.id||e.returnOrderCode||e.documentCode||e._id)}function te(e={}){
return w(e.id||e._id||e.code||e.returnOrderCode||e.documentCode)}function ae(e={}){
const n=e.updatedAt||e.modifiedAt||e.createdAt||e.date||e.documentDate||"",o=n?new Date(n).getTime():0;return Number.isFinite(o)?o:0}function re(){return{status:{
$nin:["void","cancelled","canceled","deleted","removed"]},returnStatus:{$nin:["void","cancelled","canceled","deleted","removed"]}}}function ie(e,n,o,t={}){if(!n||!o)return
;e.set(n,Q(e.get(n))+o),e.__sourceMap||(e.__sourceMap=new Map);const a=e.__sourceMap.get(n)||{codes:new Set,ids:new Set,sourceRows:[]};t.code&&a.codes.add(t.code),
t.id&&a.ids.add(t.id),t.sourceRow&&a.sourceRows.push(t.sourceRow),e.__sourceMap.set(n,a)}function ue(e,n){const o=e&&e.__sourceMap;if(!o)return{ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const t=o.get(n);if(!t)return{ReturnOrderCode:"",ReturnOrderId:"",ReturnQtySource:""}
;const a=Array.from(t.codes||[]).filter(Boolean),r=Array.from(t.ids||[]).filter(Boolean),i=Array.from(t.sourceRows||[]).filter(Boolean);return{ReturnOrderCode:a.join(", "),
ReturnOrderId:r.join(", "),ReturnQtySource:i.join(" | ")}}function ce(e=[]){const n=new Map,o=new Map;for(const n of e||[]){if(!_(n))continue
;const e=oe(n),t=te(n),a=ae(n),r=Array.from(new Set([n.salesOrderId,n.orderId,n.sourceOrderId,n.deliveryOrderId,n.salesOrderCode,n.orderCode,n.sourceOrderCode,n.deliveryOrderCode,n.originalOrderCode].map(w).filter(Boolean)))
;if(!r.length)continue;const i=w(n.salesOrderCode||n.orderCode||n.salesOrderId||n.orderId||r[0]);for(const u of Array.isArray(n.items)?n.items:[]){const n=$(u);if(!n)continue
;const c=Z(u);if(!c)continue;const s=W(u),d=ee(u),h=`${e||t||"RETURN_ORDER"}:${i}:${n}:${c}`,T=[e||t,i,n,s||"",d||""].map(w).join("@@"),m={roKeys:r,pcode:n,qty:c,lineKey:s,
priceKey:d,roCode:e,roId:t,updatedMs:a,sourceRow:h},l=o.get(T);(!l||a>=l.updatedMs)&&o.set(T,m)}}for(const e of o.values()){
const{roKeys:o,pcode:t,qty:a,lineKey:r,priceKey:i,roCode:u,roId:c,sourceRow:s}=e,d={code:u,id:c,sourceRow:s}
;for(const e of o)ie(n,r&&i?ne(e,t,r,i):r?ne(e,t,r,""):i?ne(e,t,"",i):Y(e,t),a,d)}return n}function se(e,n={},o={}){const t=$(o);if(!t)return{qty:0,ReturnOrderCode:"",
ReturnOrderId:"",ReturnQtySource:""};const a=W(o),r=ee(o);let i={qty:0,key:""};for(const o of q(n)){
const n=[a&&r?ne(o,t,a,r):"",a?ne(o,t,a,""):"",r?ne(o,t,"",r):"",Y(o,t)].filter(Boolean);for(const o of n){const n=Q(e.get(o));if(n>i.qty&&(i={qty:n,key:o}),n)break}}return{
qty:i.qty,...ue(e,i.key)}}function de(e,n={},o={}){return se(e,n,o).qty}function he(e={}){return w(e.customerCode||e.customerId||e.customerName||e.customerPhone||"")}
function Te(e=[]){const n=new Map;for(const o of e||[])[o.code,o.customerCode,o.id,o._id,o.name,o.customerName,o.phone,o.mobile].map(w).filter(Boolean).forEach(e=>n.set(e,o))
;return n}function me(e=[]){const n=new Map;for(const o of e||[])[o.code,o.productCode,o.sku,o.barcode,o.id,o._id].map(w).filter(Boolean).forEach(e=>n.set(e,o));return n}
function le(e={},n=new Map){
const o=n.get(w(e.customerCode))||n.get(w(e.customerId))||n.get(w(e.customerName))||{},t=B(e),a=B(o),r=G(e),i=G(o),u=w(e.customerName||o.name||o.customerName),c=w(r.businessName||i.businessName)
;return{code:w(e.customerCode||o.code||o.customerCode||e.customerId||o.id),name:c||u,buyer:w(e.buyerName||e.contactName||o.buyerName||o.representative||o.contactName||u),
taxCode:w(t.taxCode||a.taxCode),address:w(t.taxInvoiceAddress||a.taxInvoiceAddress||e.customerAddress||e.address||o.address||o.deliveryAddress),
phone:w(e.customerPhone||e.phone||o.phone||o.mobile),bankAccount:w(o.bankAccount||o.accountNumber||e.bankAccount),bankName:w(o.bankName||e.bankName),
email:w(o.email||e.customerEmail||e.email)}}function ge(e={}){const n=w(e.paymentMethod||e.paymentType||e.method||e.hinhThucTT||"");if(n)return n
;const o=Q(e.cashAmount||e.collectedCashAmount),t=Q(e.bankAmount||e.transferAmount||e.collectedBankAmount);return o&&t?"TM/CK":t?"CK":"TM/CK"}
function fe({orders:n,returnOrders:o,customers:t,products:a,query:r={}}){const i=ce(o),u=Te(t),c=me(a),s=[],d=[];let m=0
;const g=(n||[]).filter(_).filter(e=>l(e)===T.VAT).filter(e=>E(e.orderDate||e.date||e.documentDate||e.createdAt,r)).filter(e=>{if(!r.customerCode&&!r.customerId)return!0
;const n=w(r.customerCode||r.customerId);return[e.customerCode,e.customerId,e.customerName].map(w).includes(n)}).filter(e=>{if(!r.salesStaffCode&&!r.salesmanCode)return!0
;const n=w(r.salesStaffCode||r.salesmanCode);return[e.salesStaffCode,e.salesmanCode,e.nvbhCode].map(w).includes(n)
}).sort((e,n)=>w(e.orderDate||e.date||e.documentDate||e.createdAt).localeCompare(w(n.orderDate||n.date||n.documentDate||n.createdAt))||j(e).localeCompare(j(n)));for(const n of g){
const o=[],t=le(n,u),a=j(n),r=L(n.orderDate||n.date||n.documentDate||n.createdAt||e.todayVN());for(const e of Array.isArray(n.items)?n.items:[]){
const r=$(e),u=c.get(r)||{},s=F(e)||w(u.name||u.productName),T=U(e),m=se(i,n,e),l=m.qty,g=Math.min(T,l),f=Math.max(0,T-g),p=z(e)||(T?J(e)/T:0);if(!r||f<=0){d.push({MaDon:a,
MaKhachHang:t.code,TenKhachHang:t.name,MaSanPham:r,SanPham:s,"Quy cách":h.catalogPackingQty(u),"Giá bán":h.catalogSalePrice(u),SoLuongBan:T,SoLuongTra:l,SoLuongTraAnToan:g,
SoLuongXuatHoaDon:f,GiaSauKhuyenMaiCoVAT:p,DonGiaTruocVAT:"",ThanhTienTruocVAT:"",ReturnOrderCode:m.ReturnOrderCode,ReturnOrderId:m.ReturnOrderId,ReturnQtySource:m.ReturnQtySource,
LyDoBoDong:r?"INVOICE_QTY_ZERO":"MISSING_PRODUCT_CODE"});continue}const y=I(p/1.08,6),S=I(f*y,2);o.push({productCode:r,productName:s,unit:X(e,u),
catalogPackingQty:h.catalogPackingQty(u),catalogSalePrice:h.catalogSalePrice(u),soldQty:T,returnQty:l,safeReturnQty:g,invoiceQty:f,priceInclVat:p,unitPriceBeforeVat:y,
lineAmountBeforeVat:S,returnOrderCode:m.ReturnOrderCode,returnOrderId:m.ReturnOrderId,returnQtySource:m.ReturnQtySource})}if(!o.length)continue;m+=1
;const T=I(o.reduce((e,n)=>e+n.lineAmountBeforeVat,0),2),l=I(T*R,2),g=Math.round(T+l);o.forEach((e,o)=>{const a=0===o;s.push({STT:a?m:"",NgayHoaDon:a?r:"",MaKhachHang:a?t.code:"",
TenKhachHang:a?t.name:"",TenNguoiMua:a?t.buyer:"",MaSoThue:a?t.taxCode:"",DiaChiKhachHang:a?t.address:"",DienThoaiKhachHang:a?t.phone:"",SoTaiKhoan:a?t.bankAccount:"",
NganHang:a?t.bankName:"",HinhThucTT:a?ge(n):"",MaSanPham:e.productCode,SanPham:e.productName,DonViTinh:e.unit,Extra1SP:e.catalogPackingQty,Extra2SP:e.catalogSalePrice,
SoLuong:e.invoiceQty,DonGia:e.unitPriceBeforeVat,TyLeChietKhauHienThi:"",SoTienChietKhau:"",ThanhTien:e.lineAmountBeforeVat,TienBan:a?T:"",ThueSuat:a?8:"",TienThueSanPham:"",
TienThue:a?l:"",TongCong:a?g:"",TinhChatHangHoa:0,DonViTienTe:a?"VND":"",TyGia:"",Fkey:a?j(n):"",Extra1:"",Extra2:"",EmailKhachHang:a?t.email:"",VungDuLieu:"",Extra3:"",Extra4:"",
Extra5:"",Extra6:"",Extra7:"",Extra8:"",Extra9:"",Extra10:"",Extra11:"",Extra12:"",LOONo:"",HDSe:"",xVTNXHan:"",NVChuan:"",PTChuyenKhoan:"",HDKTTu:"",CCCDan:""}),d.push({
MaDon:j(n),MaKhachHang:t.code,TenKhachHang:t.name,MaSoThue:t.taxCode,DiaChiHoaDon:t.address,MaSanPham:e.productCode,SanPham:e.productName,"Quy cách":e.catalogPackingQty,
"Giá bán":e.catalogSalePrice,SoLuongBan:e.soldQty,SoLuongTra:e.returnQty,SoLuongTraAnToan:e.safeReturnQty,SoLuongXuatHoaDon:e.invoiceQty,GiaSauKhuyenMaiCoVAT:e.priceInclVat,
DonGiaTruocVAT:e.unitPriceBeforeVat,ThanhTienTruocVAT:e.lineAmountBeforeVat,ReturnOrderCode:e.returnOrderCode,ReturnOrderId:e.returnOrderId,ReturnQtySource:e.returnQtySource,
LyDoBoDong:""})})}return{rows:s,auditRows:d}}async function pe(a={}){
const r=L(a.dateFrom||a.from||a.fromDate||"")||"0000-01-01",i=L(a.dateTo||a.to||a.toDate||"")||"9999-12-31",h=f(a,T.VAT),[m,l,g,p]=await Promise.all([u.find(h).sort({orderDate:1,
date:1,code:1}).limit(Math.min(Math.max(Number(a.limit||2e4),1),1e5)).lean(),c.find(re()).lean(),s.find({}).lean(),d.find({}).lean()]),{rows:y,auditRows:S}=fe({orders:m,
returnOrders:l,customers:g,products:p,query:a}),C=n(),N=[O,...y.map(e=>O.map(n=>e[n]??""))];o(C,"Sheet1",N,{autoFilter:!0})
;const D=["MaDon","MaKhachHang","TenKhachHang","MaSoThue","DiaChiHoaDon","MaSanPham","SanPham","Quy cách","Giá bán","SoLuongBan","SoLuongTra","SoLuongTraAnToan","SoLuongXuatHoaDon","GiaSauKhuyenMaiCoVAT","DonGiaTruocVAT","ThanhTienTruocVAT","ReturnOrderCode","ReturnOrderId","ReturnQtySource","LyDoBoDong"]
;o(C,"DoiChieu",[D,...S.map(e=>D.map(n=>e[n]??""))]);const M=y.reduce((e,n)=>(""!==n.TienBan&&(e.invoiceCount+=1,e.amountBeforeVat+=Q(n.TienBan),e.vatAmount+=Q(n.TienThue),
e.totalAmount+=Q(n.TongCong)),e.lineCount+=n.MaSanPham?1:0,e),{invoiceCount:0,lineCount:0,amountBeforeVat:0,vatAmount:0,totalAmount:0})
;o(C,"ThongTin",[["Mẫu","TT78 - Sheet1"],["Từ ngày","0000-01-01"===r?"":r],["Đến ngày","9999-12-31"===i?"":i],["Số hóa đơn",M.invoiceCount],["Số dòng sản phẩm",M.lineCount],["Tiền bán trước thuế",I(M.amountBeforeVat,2)],["Tiền thuế 8%",I(M.vatAmount,2)],["Tổng cộng",Math.round(M.totalAmount)],["Quy tắc","Số lượng xuất HĐ = số lượng bán - số lượng trả; Đơn giá = giá sau khuyến mại trên đơn / 1.08"]])
;const A=t(C),H="0000-01-01"===r?"all":r,v="9999-12-31"===i?e.todayVN():i;return{buffer:A,rows:y.length,fileName:`Hoa_don_VAT_TT78_${H}_${v}.xlsx`}}function ye(e={}){
return[w(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH),w(e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName)].filter(Boolean).join(" - ")
}function Se(e={}){return w(e.orderSourceName||e.orderSource||e.source||e.sourceType||e.importSource||"")}async function Ce(a={}){
const r=L(a.dateFrom||a.from||a.fromDate||"")||"0000-01-01",i=L(a.dateTo||a.to||a.toDate||"")||"9999-12-31",m=f(a,T.NON_VAT),[g,p,y,S]=await Promise.all([u.find(m).sort({
orderDate:1,date:1,code:1
}).limit(Math.min(Math.max(Number(a.limit||2e4),1),1e5)).lean(),c.find(re()).lean(),s.find({}).lean(),d.find({}).lean()]),C=(g||[]).filter(_).filter(e=>l(e)===T.NON_VAT).filter(e=>E(e.orderDate||e.date||e.documentDate||e.createdAt,a)),N=ce(p),D=Te(y),M=me(S),A=[],H=[]
;let v=0,K=0,b=0;C.forEach((e,n)=>{const o=le(e,D),t=j(e);let a=0,r=0;for(const n of Array.isArray(e.items)?e.items:[]){
const o=$(n),i=M.get(o)||{},u=U(n),c=Math.min(u,de(N,e,n)),s=Math.max(0,u-c),d=z(n)||(u?J(n)/u:0),T=I(s*d,2);a+=I(c*d,2),r+=T,H.push({"Mã đơn":t,"Mã sản phẩm":o,
"Tên sản phẩm":F(n)||w(i.name||i.productName),"Quy cách":h.catalogPackingQty(i),"Giá bán":h.catalogSalePrice(i),"Số lượng bán":u,"Số lượng trả":c,"Số lượng còn lại":s,"Đơn giá":d,
"Thành tiền":T})}const i=Q(e.totalAmount||e.grandTotal||0),u=Q(e.paidAmount||e.paymentAmount||0),c=Q(e.debtAmount??Math.max(0,i-u));v+=i,K+=a,b+=r,A.push({STT:n+1,
"Ngày bán":L(e.orderDate||e.date||e.documentDate||e.createdAt),"Mã đơn":t,"Mã khách hàng":o.code,"Tên khách hàng":o.name,NVBH:ye(e),"Nguồn đơn":Se(e),"Giá trị đơn":i,
"Tiền đã thu":u,"Công nợ":c,"Lý do không xuất":w(e.vatInvoiceNote),"Người thay đổi":w(e.vatInvoiceUpdatedBy),"Thời gian thay đổi":w(e.vatInvoiceUpdatedAt)})});const P=n()
;He(P,"DanhSachDon",["STT","Ngày bán","Mã đơn","Mã khách hàng","Tên khách hàng","NVBH","Nguồn đơn","Giá trị đơn","Tiền đã thu","Công nợ","Lý do không xuất","Người thay đổi","Thời gian thay đổi"],A),
He(P,"ChiTietHang",["Mã đơn","Mã sản phẩm","Tên sản phẩm","Quy cách","Giá bán","Số lượng bán","Số lượng trả","Số lượng còn lại","Đơn giá","Thành tiền"],H),
o(P,"ThongTin",[["Từ ngày","0000-01-01"===r?"":r],["Đến ngày","9999-12-31"===i?"":i],["Số đơn không xuất hóa đơn",A.length],["Tổng giá trị đơn",I(v,2)],["Tổng hàng trả",I(K,2)],["Giá trị còn lại",I(b,2)]])
;const k=t(P),V="0000-01-01"===r?"all":r,x="9999-12-31"===i?e.todayVN():i,R=V===x?V:`${V}_${x}`;return{buffer:k,rows:A.length,fileName:`Hoa_don_khong_VAT_${R}.xlsx`}}
const Ne=["sales-report","delivery-report","return-report","debt-report","ar-ledger-detail","stock-report","inventory-movement-report","stock-card-report","fund-report","salesman-report","deliveryman-report","customer-sales-report","product-sales-report","product-info-report","customer-info-report","user-info-report"]
;function De(e={}){return{from:L(e.dateFrom||e.from||e.fromDate||""),to:L(e.dateTo||e.to||e.toDate||"")}}function Me(e={},n=["date","createdAt"]){const{from:o,to:t}=De(e)
;return o||t?{$or:n.map(e=>({[e]:{...o?{$gte:o}:{},...t?{$lte:"createdAt"===e?`${t}T23:59:59.999Z`:t}:{}}}))}:{}}function Ae(e={}){
return Math.min(Math.max(Number(e.limit||1e5),1),2e5)}function He(e,n,t,a){const r=a.map(e=>t.map(n=>e[n]??""));o(e,String(n||"BaoCao").slice(0,31),[t,...r])}function ve(e=""){
return{"stock-report":"Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.",
"inventory-movement-report":"Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.",
"stock-card-report":"Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.",
"sales-report":"Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.",
"return-report":"Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.","debt-report":"Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.",
"ar-ledger-detail":"Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.","fund-report":"Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.",
"delivery-report":"Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.",
"product-info-report":"Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.",
"customer-info-report":"Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán."
}[e]||"Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống."}async function Ke(a,r,i,u,c={}){const s=await h.enrichRows(u,{packingKey:"Quy cách",salePriceKey:"Giá bán"
}),d=[...i];s.hasProducts&&(d.includes("Quy cách")||d.push("Quy cách"),d.includes("Giá bán")||d.push("Giá bán"));const T=n();He(T,r,d,s.rows);const{from:m,to:l}=De(c)
;o(T,"ThongTin",[["Mẫu báo cáo",r],["Từ ngày",m],["Đến ngày",l],["Số dòng",s.rows.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc nghiệp vụ",ve(a)]])
;const g=String(a||"report").replace(/[^a-zA-Z0-9_-]/g,"-"),f=`${m||"all"}_${l||e.todayVN()}`;return{buffer:t(T),rows:s.rows.length,fileName:`${g}_${f}.xlsx`}}function be(e={}){
return Array.isArray(e.items)?e.items:[]}function Pe(e={}){return be(e).reduce((e,n)=>e+U(n),0)||Q(e.totalQuantity||e.quantity||0)}function ke(e={},n={}){
return Q(e.originalPrice??e.basePrice??e.listPrice??n.salePrice??e.salePrice??e.price??e.unitPrice??0)}function Ve(e={},n={}){return U(e)*ke(e,n)}function xe(e={}){
return Q(e.finalAmount??e.amount??e.totalAmount??e.lineAmount??0)||U(e)*z(e)}function Re(e={},n=new Map){
return be(e).reduce((e,o)=>e+Ve(o,n.get($(o))||{}),0)||Q(e.beforePromoAmount||e.grossAmount||e.totalBeforeDiscount||e.totalAmount||0)}function Be(e={}){
return Q(e.afterPromoAmount||e.totalAfterPromotion||e.totalAmount||e.amount||0)}function Ge(e={},n="sales"){return w("delivery"===n?D(e):C(e))}function Oe(e={},n="sales"){
return w("delivery"===n?N(e):S(e))}async function we(){const e=await d.find({}).select("code name salePrice conversionRate baseUnit unit brand category").lean()
;return new Map(e.map(e=>[w(e.code),e]))}async function Qe(e={}){const n=((await y.salesReport({...e,full:"1",export:"1"})).sales||[]).map((e,n)=>({STT:n+1,Ngay:e.date,
MaDon:e.code,Nguon:e.source,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,
SoLuongBan:e.saleQuantity,SoLuongKhuyenMai:e.promoQuantity,DoanhSoTruocKM:Math.round(Q(e.beforePromoAmount)),DoanhSoThucTe:Math.round(Q(e.actualAmount)),
ChietKhauKM:Math.round(Q(e.promotionDiscountAmount)),GiaTriHangKM:Math.round(Q(e.promotionValue)),DaThuTheoAR:Math.round(Q(e.receiptAmount)),
TraHangTheoAR:Math.round(Q(e.returnAmount)),DieuChinhCongNo:Math.round(Q(e.adjustmentAmount)),ConNoTheoAR:Math.round(Q(e.debtAmount)),TrangThaiGiaoHang:e.deliveryStatus,
TrangThaiKeToan:e.accountingStatus}));return Ke("sales-report","BaoCaoBanHang",Object.keys(n[0]||{STT:"",Ngay:"",MaDon:"",Nguon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",
MaNVGH:"",NVGH:"",SoLuongBan:"",SoLuongKhuyenMai:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DieuChinhCongNo:"",
ConNoTheoAR:"",TrangThaiGiaoHang:"",TrangThaiKeToan:""}),n,e)}async function Ie(e={}){const n=((await y.deliveryReport({...e,full:"1",export:"1"})).delivery||[]).map((e,n)=>({
STT:n+1,NgayGiao:e.deliveryDate,MaDonTong:e.code,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoDonDangGan:e.assignedOrderCount,SoDonDaGiao:e.orderCount,
TongTienDonCon:Math.round(Q(e.totalAmount)),DoanhSoDaXacNhan:Math.round(Q(e.accountingConfirmedAmount)),TienThuTheoQuy:Math.round(Q(e.collectedAmount)),TrangThai:e.status,
LechSoDonSnapshot:Q(e.dataQuality?.snapshotOrderCountDifference),LechTienSnapshot:Math.round(Q(e.dataQuality?.snapshotAmountDifference))}))
;return Ke("delivery-report","BaoCaoGiaoHang",Object.keys(n[0]||{STT:"",NgayGiao:"",MaDonTong:"",MaNVGH:"",NVGH:"",SoDonDangGan:"",SoDonDaGiao:"",TongTienDonCon:"",
DoanhSoDaXacNhan:"",TienThuTheoQuy:"",TrangThai:"",LechSoDonSnapshot:"",LechTienSnapshot:""}),n,e)}async function Le(e={}){const n=((await y.returnReport({...e,full:"1",export:"1"
})).returns||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaTraHang:e.code,MaDon:e.salesOrderCode,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,
NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,GiaTriTra:Math.round(Q(e.amount)),GiaTriChungTu:Math.round(Q(e.documentAmount)),
GiaTriARReturn:Math.round(Q(e.arAmount)),TrangThaiNhapKho:e.warehouseReceiveStatus,TrangThaiTraHang:e.returnState,TrangThaiKeToan:e.accountingStatus}))
;return Ke("return-report","BaoCaoTraHang",Object.keys(n[0]||{STT:"",Ngay:"",MaTraHang:"",MaDon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",GiaTriTra:"",
GiaTriChungTu:"",GiaTriARReturn:"",TrangThaiNhapKho:"",TrangThaiTraHang:"",TrangThaiKeToan:""}),n,e)}async function Ee(e={}){const n=((await y.periodDebtReport({...e,full:"1",
export:"1",includePaid:"1"})).debts||[]).map((e,n)=>({STT:n+1,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,DuDauKy:Math.round(Q(e.openingBalance)),PhatSinhNo:Math.round(Q(e.debitInPeriod)),DaThu:Math.round(Q(e.receiptInPeriod)),
TraHang:Math.round(Q(e.returnInPeriod)),ChietKhauDieuChinh:Math.round(Q(e.adjustmentInPeriod)+Q(e.otherCreditInPeriod)),TongPhatSinhCo:Math.round(Q(e.totalCreditInPeriod)),
DuCuoiKy:Math.round(Q(e.closingBalance))}));return Ke("debt-report","BaoCaoCongNo",Object.keys(n[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",
DuDauKy:"",PhatSinhNo:"",DaThu:"",TraHang:"",ChietKhauDieuChinh:"",TongPhatSinhCo:"",DuCuoiKy:""}),n,e)}async function _e(e={}){const n=((await y.arLedgerDetailReport({...e,
full:"1",export:"1"})).ledger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaKhachHang:e.customerCode,KhachHang:e.customerName,ChungTu:e.documentCode,Loai:e.type,DienGiai:e.description,
DuTruocGiaoDich:Math.round(Q(e.openingBalance)),No:Math.round(Q(e.debit)),Co:Math.round(Q(e.credit)),PhanLoaiCo:e.creditCategory,DuSauGiaoDich:Math.round(Q(e.closingBalance))}))
;return Ke("ar-ledger-detail","SoCongNoChiTiet",Object.keys(n[0]||{STT:"",Ngay:"",MaKhachHang:"",KhachHang:"",ChungTu:"",Loai:"",DienGiai:"",DuTruocGiaoDich:"",No:"",Co:"",
PhanLoaiCo:"",DuSauGiaoDich:""}),n,e)}async function qe(e={}){const n=((await y.stockReport({...e,full:"1",export:"1"})).stock||[]).map((e,n)=>({STT:n+1,
MaSP:w(e.productCode||e.code||e.productId),SanPham:w(e.productName||e.name),DonViTinh:w(e.unit||e.baseUnit),TonVatLy:Q(e.onHand??e.quantity??e.qty),DaGiuCho:Q(e.reservedQty),
TonKhaDung:Q(e.availableQty)}));return Ke("stock-report","TonKhoHienTai",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonVatLy:"",DaGiuCho:"",TonKhaDung:""}),n,{})}
async function je(e={}){const n=((await y.inventoryMovementReport({...e,full:"1",export:"1",mode:"movement"})).stock||[]).map((e,n)=>({STT:n+1,MaSP:e.productCode,
SanPham:e.productName,DonViTinh:e.unit,TonDauKy:Q(e.openingQty),NhapMua:Q(e.importQty),HangTraNhapKho:Q(e.returnQty),NhapKhac:Q(e.otherInQty),TongNhap:Q(e.inQty),
XuatBan:Q(e.saleQty),XuatDaoChungTu:Q(e.reversalOutQty),XuatKhac:Q(e.otherOutQty),TongXuat:Q(e.outQty),DieuChinhRong:Q(e.adjustmentQty),TonCuoiKy:Q(e.endingQty),
NguonTonCuoi:e.endingSource,TonCuoiTheoLedger:Q(e.ledgerEndingQty),ChenhLechDoiSoat:Q(e.reconciliationDifference)}))
;return Ke("inventory-movement-report","NhapXuatTon",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonDauKy:"",NhapMua:"",HangTraNhapKho:"",NhapKhac:"",TongNhap:"",
XuatBan:"",XuatDaoChungTu:"",XuatKhac:"",TongXuat:"",DieuChinhRong:"",TonCuoiKy:"",NguonTonCuoi:"",TonCuoiTheoLedger:"",ChenhLechDoiSoat:""}),n,e)}async function $e(e={}){
const n=((await y.stockCardReport({...e,full:"1",export:"1"})).transactions||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaSP:e.productCode,SanPham:e.productName,ChungTu:e.refCode,
Loai:e.type,PhanLoai:e.category,TonTruocGiaoDich:Q(e.openingQty),Nhap:Q(e.inQty),Xuat:Q(e.outQty),TonSauGiaoDich:Q(e.balanceQty),GhiChu:e.note}))
;return Ke("stock-card-report","TheKho",Object.keys(n[0]||{STT:"",Ngay:"",MaSP:"",SanPham:"",ChungTu:"",Loai:"",PhanLoai:"",TonTruocGiaoDich:"",Nhap:"",Xuat:"",TonSauGiaoDich:"",
GhiChu:""}),n,e)}async function Fe(e={}){const n=((await y.financeReport({...e,full:"1",export:"1"})).fundLedger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,ChungTu:e.code,Loai:e.type,
LoaiQuy:e.fundType,TaiKhoanQuy:e.account,NguoiLienQuan:e.counterparty,TonDauDong:Math.round(Q(e.openingBalance)),Thu:Math.round(Q(e.inAmount)),Chi:Math.round(Q(e.outAmount)),
TonCuoiDong:Math.round(Q(e.endingBalance)),GhiChu:e.note}));return Ke("fund-report","BaoCaoQuyTien",Object.keys(n[0]||{STT:"",Ngay:"",ChungTu:"",Loai:"",LoaiQuy:"",TaiKhoanQuy:"",
NguoiLienQuan:"",TonDauDong:"",Thu:"",Chi:"",TonCuoiDong:"",GhiChu:""}),n,e)}async function Xe(e={}){const n=((await y.salesReport({...e,full:"1",export:"1"
})).bySalesman||[]).map((e,n)=>({STT:n+1,MaNVBH:e.salesmanCode,NVBH:e.salesmanName,SoDon:e.orderCount,SoKhachHang:e.customerCount,DoanhSoTruocKM:Math.round(Q(e.beforePromoAmount)),
DoanhSoThucTe:Math.round(Q(e.actualAmount)),GiaTriHangKM:Math.round(Q(e.promotionValue)),DaThuTheoAR:Math.round(Q(e.receiptAmount)),TraHangTheoAR:Math.round(Q(e.returnAmount)),
ConNoTheoAR:Math.round(Q(e.debtAmount))}));return Ke("salesman-report","BaoCaoNVBH",Object.keys(n[0]||{STT:"",MaNVBH:"",NVBH:"",SoDon:"",SoKhachHang:"",DoanhSoTruocKM:"",
DoanhSoThucTe:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",ConNoTheoAR:""}),n,e)}async function Ue(e={}){const n=((await y.deliveryReport({...e,full:"1",export:"1"
})).byStaff||[]).map((e,n)=>({STT:n+1,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoChuyen:e.tripCount,SoDonDaGiao:e.orderCount,TongTienDonCon:Math.round(Q(e.totalAmount)),
DoanhSoDaXacNhan:Math.round(Q(e.accountingConfirmedAmount)),ThuTienTheoQuy:Math.round(Q(e.collectedAmount))}));return Ke("deliveryman-report","BaoCaoNVGH",Object.keys(n[0]||{
STT:"",MaNVGH:"",NVGH:"",SoChuyen:"",SoDonDaGiao:"",TongTienDonCon:"",DoanhSoDaXacNhan:"",ThuTienTheoQuy:""}),n,e)}async function Ze(e={}){const n=await y.salesReport({...e,
full:"1",export:"1"}),o=await y.periodDebtReport({...e,full:"1",export:"1",includePaid:"1"}),t=new Map((o.debts||[]).map(e=>[w(e.customerCode||e.customerName),e])),a=new Map
;(n.sales||[]).forEach(e=>{const n=w(e.customerCode||e.customerName),o=a.get(n)||{MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
SoDon:0,DoanhSoTruocKM:0,DoanhSoThucTe:0,GiaTriHangKM:0,DaThuTheoAR:0,TraHangTheoAR:0};o.SoDon+=1,o.DoanhSoTruocKM+=Q(e.beforePromoAmount),o.DoanhSoThucTe+=Q(e.actualAmount),
o.GiaTriHangKM+=Q(e.promotionValue),o.DaThuTheoAR+=Q(e.receiptAmount),o.TraHangTheoAR+=Q(e.returnAmount),a.set(n,o)});const r=Array.from(a.entries()).map(([e,n],o)=>{
const a=t.get(e)||{};return{STT:o+1,...n,DoanhSoTruocKM:Math.round(n.DoanhSoTruocKM),DoanhSoThucTe:Math.round(n.DoanhSoThucTe),GiaTriHangKM:Math.round(n.GiaTriHangKM),
DaThuTheoAR:Math.round(n.DaThuTheoAR),TraHangTheoAR:Math.round(n.TraHangTheoAR),DuDauKy:Math.round(Q(a.openingBalance)),DuCuoiKy:Math.round(Q(a.closingBalance))}})
;return Ke("customer-sales-report","DoanhSoKhachHang",Object.keys(r[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",SoDon:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",
GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DuDauKy:"",DuCuoiKy:""}),r,e)}async function We(e={}){const n=await y.salesReport({...e,full:"1",export:"1"}),o=new Map
;(n.sales||[]).forEach(e=>(e.items||[]).forEach(e=>{const n=w(e.productCode||e.productName),t=o.get(n)||{MaSP:e.productCode,SanPham:e.productName,NhanHang:e.brand,SoLuongBan:0,
DoanhSoTruocKM:0,DoanhSoThucTe:0};t.SoLuongBan+=Q(e.quantity),t.DoanhSoTruocKM+=Q(e.catalogAmount),t.DoanhSoThucTe+=Q(e.actualAmount),o.set(n,t)}))
;const t=Array.from(o.values()).reduce((e,n)=>e+n.DoanhSoThucTe,0)||1,a=Array.from(o.values()).map((e,n)=>({STT:n+1,...e,SoLuongBan:e.SoLuongBan,
DoanhSoTruocKM:Math.round(e.DoanhSoTruocKM),DoanhSoThucTe:Math.round(e.DoanhSoThucTe),ChietKhauKM:Math.round(e.DoanhSoTruocKM-e.DoanhSoThucTe),
TyTrong:`${I(e.DoanhSoThucTe/t*100,2)}%`}));return Ke("product-sales-report","DoanhSoSanPham",Object.keys(a[0]||{STT:"",MaSP:"",SanPham:"",NhanHang:"",SoLuongBan:"",
DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",TyTrong:""}),a,e)}
const ze=new Set(["password","passwordHash","hash","salt","token","tokens","accessToken","refreshToken","secret","apiKey","session","sessions","resetPasswordToken","verificationToken"])
;function Je(e={},n=[]){for(const o of n){const n=w(e[o]);if(n)return n}return""}function Ye(e){return!0===e?"Hoạt động":!1===e?"Ngưng hoạt động":w(e)}function en(e={},n=[],o=[]){
const t=new Set([...n,...o,"_id","__v","searchText"]),a={};return Object.keys(e||{}).forEach(n=>{if(t.has(n))return;const o=e[n];null!=o&&""!==o&&(a[n]=o)}),
Object.keys(a).length?JSON.stringify(a):""}function nn(e={},n=0,o=new Map){const t=Je(e,["code","productCode","sku","id"]),a=o.get(w(t).toUpperCase())||{};return{STT:n+1,MaSP:t,
TenSP:Je(e,["name","productName","title"]),Barcode:Je(e,["barcode","barCode"]),NhanHang:Je(e,["brand","brandName"]),NganhHang:Je(e,["category","categoryName","groupName"]),
DonVi:Je(e,["unit","baseUnit","uom"]),DonViCoSo:Je(e,["baseUnit","unit"]),QuyDoi:Q(e.conversionRate||e.ratio||1),
"Quy cách":Math.max(1,Q(e.conversionRate||e.packingQty||e.unitsPerCase||1)),"Giá bán":Math.round(Q(e.salePrice||e.price||e.sellPrice)),
GiaVon:Math.round(Q(e.costPrice||e.cost||e.purchasePrice)),TonVatLy:Q(a.onHand??a.quantity??a.qty),DaGiuCho:Q(a.reservedQty),TonKhaDung:Q(a.availableQty),
KhuBocHang:H(M(A(e),v.HC)),TrangThai:Ye(e.isActive??e.status),NgayTao:L(e.createdAt),NgayCapNhat:L(e.updatedAt),
ThongTinKhac:en(e,["code","productCode","sku","name","productName","barcode","brand","category","unit","baseUnit","conversionRate","packing","salePrice","costPrice","pickingZone","warehouseCode","warehouseName","defaultWarehouse","isActive","status","createdAt","updatedAt"])
}}async function on(e={}){const[n,o]=await Promise.all([d.find({}).sort({code:1,name:1}).limit(Ae(e)).lean(),y.stockReport({full:"1",export:"1"
})]),t=new Map((o.stock||o.items||[]).map(e=>[w(e.productCode||e.code).toUpperCase(),e])),a=n.map((e,n)=>nn(e,n,t))
;return Ke("product-info-report","ThongTinSanPham",Object.keys(a[0]||nn({},-1,t)),a,e)}function tn(e={}){return[e.customerCode,e.customerId,e.customerName].map(w).filter(Boolean)}
async function an(){const n=await y.periodDebtReport({dateFrom:"0000-01-01",dateTo:e.todayVN(),full:"1",export:"1",includePaid:"1"}),o=new Map
;return(n.debts||n.items||[]).forEach(e=>{const n=Q(e.closingBalance);tn(e).forEach(e=>o.set(e,n))}),o}async function rn(n={}){
const o=e.todayVN(),t=w(n.monthStart||n.monthFrom||`${o.slice(0,7)}-01`),a=w(n.monthEnd||n.monthTo||o),r=await y.salesReport({dateFrom:t,dateTo:a,full:"1",export:"1"}),i=new Map
;return(r.sales||r.items||[]).forEach(e=>{const n=Q(e.actualAmount);[e.customerCode,e.customerId,e.customerName].map(w).filter(Boolean).forEach(e=>{i.set(e,Q(i.get(e))+n)})}),i}
function un(e,n=[]){for(const o of n.map(w).filter(Boolean))if(e.has(o))return Q(e.get(o));return 0}function cn(e={},n=0,o=new Map,t=new Map){
const a=B(e),r=G(e),i=[e.code,e.customerCode,e.id,e._id,e.name,e.customerName];return{STT:n+1,MaKH:Je(e,["code","customerCode","id"]),TenKH:Je(e,["name","customerName"]),
TenHoKinhDoanh:r.businessName,SDT:Je(e,["phone","mobile","customerPhone","tel"]),DiaChi:Je(e,["address","customerAddress","fullAddress"]),MaSoThue:a.taxCode,
DiaChiHoaDonThue:a.taxInvoiceAddress,Tuyen:Je(e,["route","routeName","line"]),KhuVuc:Je(e,["area","areaName","region","province"]),
MaNVBH:Je(e,["staffCode","salesStaffCode","salesmanCode"]),NVBHPhuTrach:Je(e,["staffName","salesStaffName","salesmanName"]),MaNVGH:Je(e,["deliveryStaffCode","shipperCode"]),
NVGHPhuTrach:Je(e,["deliveryStaffName","shipperName"]),CongNoHienTai:Math.round(un(o,i)),DoanhSoThang:Math.round(un(t,i)),TrangThai:Ye(e.isActive??e.status),NgayTao:L(e.createdAt),
NgayCapNhat:L(e.updatedAt),
ThongTinKhac:en(e,["code","customerCode","name","customerName","businessName","customerBusinessName","householdBusinessName","taxBusinessName","invoiceBusinessName","tenHoKinhDoanh","phone","mobile","customerPhone","address","customerAddress","taxCode","customerTaxCode","taxNumber","vatNumber","vatCode","mst","taxInvoiceAddress","customerTaxInvoiceAddress","invoiceAddress","vatInvoiceAddress","billingAddress","route","area","region","staffCode","staffName","salesStaffCode","salesStaffName","deliveryStaffCode","deliveryStaffName","isActive","status","createdAt","updatedAt"])
}}async function sn(e={}){const[n,o,t]=await Promise.all([s.find({}).sort({code:1,name:1
}).limit(Ae(e)).lean(),an(),rn(e)]),a=n.map((e,n)=>cn(e,n,o,t)).sort((e,n)=>Q(n.CongNoHienTai)-Q(e.CongNoHienTai)||w(e.MaKH).localeCompare(w(n.MaKH)));return a.forEach((e,n)=>{
e.STT=n+1}),Ke("customer-info-report","ThongTinKhachHang",Object.keys(a[0]||cn({},-1)),a,e)}function dn(e={}){const n={};return Object.keys(e||{}).forEach(o=>{
if(ze.has(o)||o.startsWith("_")||["__v","searchText"].includes(o))return
;if(["username","fullName","name","code","staffCode","role","roles","phone","email","isActive","status","permissions","area","route","lastLoginAt","lastLogin","createdAt","updatedAt"].includes(o))return
;const t=e[o];null!=t&&""!==t&&(n[o]=t)}),Object.keys(n).length?JSON.stringify(n):""}function hn(e={},n=0){return{STT:n+1,TenDangNhap:Je(e,["username","loginName"]),
HoTen:Je(e,["fullName","name","displayName"]),MaNhanVien:Je(e,["staffCode","code","employeeCode"]),VaiTro:Array.isArray(e.roles)?e.roles.join(", "):Je(e,["role","roles"]),
SDT:Je(e,["phone","mobile"]),Email:Je(e,["email"]),TrangThai:Ye(e.isActive??e.status),
QuyenTruyCap:Array.isArray(e.permissions)?e.permissions.join(", "):w(e.permissions||e.permission||""),KhuVucTuyen:Je(e,["area","route","region"]),NgayTao:L(e.createdAt),
NgayCapNhat:L(e.updatedAt),LanDangNhapGanNhat:L(e.lastLoginAt||e.lastLogin||e.lastSeenAt),ThongTinKhac:dn(e)}}async function Tn(e={}){
const n=p.users,o=(await n.find({}).select("-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken").sort({
role:1,code:1,username:1}).limit(Ae(e)).lean()).map(hn);return Ke("user-info-report","ThongTinTaiKhoan",Object.keys(o[0]||hn({},-1)),o,e)}const mn={"sales-report":Qe,
"delivery-report":Ie,"return-report":Le,"debt-report":Ee,"ar-ledger-detail":_e,"stock-report":qe,"inventory-movement-report":je,"stock-card-report":$e,"fund-report":Fe,
"salesman-report":Xe,"deliveryman-report":Ue,"customer-sales-report":Ze,"product-sales-report":We,"product-info-report":on,"customer-info-report":sn,"user-info-report":Tn}
;async function ln(e){return a.preview(e)}async function gn(e){return a.commit(e)}async function fn(){return a.logs()}function pn(){return r.getBuiltInTemplates()}
async function yn(e){return r.buildBuiltInTemplateFile(e)}function Sn(e){return r.getFields(e)}async function Cn(){return r.listCustomTemplates()}async function Nn(e){
return r.saveCustomTemplate(e)}async function Dn(e){return r.deleteCustomTemplate(e)}async function Mn(e){return r.buildCustomTemplateFile(e)}function An(){
return[...new Set([...i.getExportTypes(),"invoice-orders","vatInvoiceTT78","vat-non-invoice-orders","sse-invoice-orders","sse-invoice-errors",...Ne])].sort()}
async function Hn(n,o={},t={}){const a=String(n||"").trim();if(["sse-invoice-orders","sseInvoiceOrders"].includes(a))return K.buildSseInvoiceWorkbook(o,t)
;if(["sse-invoice-errors","sseInvoiceErrors"].includes(a))return K.buildSseErrorReportWorkbook(o,t);if(["invoice-orders","invoiceOrders"].includes(a)){const e=m(o.invoiceType)
;return e?e===T.VAT?pe(o):Ce(o):{error:"invoiceType chỉ nhận VAT hoặc NON_VAT",status:400}}if(["vatInvoiceTT78","vat-invoice-tt78","hoa-don-vat-tt78"].includes(a))return pe(o)
;if(["vat-non-invoice-orders","vatNonInvoiceOrders"].includes(a))return Ce(o);if(mn[a])return mn[a](o);const r=await i.findForExport(n,o);if(!r)return{
error:"Loại dữ liệu export không hợp lệ",status:400};const u=await x({type:n,rows:r}),c=String(n||"data").replace(/[^a-zA-Z0-9_-]/g,"-");return{buffer:u,rows:r.length,
fileName:`${c}-export-${e.todayVN()}.xlsx`}}module.exports={previewImport:ln,commitImport:gn,getImportLogs:fn,getBuiltInTemplates:pn,buildBuiltInTemplateFile:yn,getFields:Sn,
listCustomTemplates:Cn,saveCustomTemplate:Nn,deleteCustomTemplate:Dn,buildCustomTemplateFile:Mn,getExportTypes:An,exportToExcel:Hn};
