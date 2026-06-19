/* GENERATED FILE — edit src/services/importExportLegacy.service.source/part-01.jsfrag, src/services/importExportLegacy.service.source/part-02.jsfrag, src/services/importExportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{createWorkbook:n,appendAoaSheet:o,writeWorkbook:t}=require("../utils/excelWriter.util"),a=require("./excelImportService"),r=require("./importTemplateService"),u=require("../repositories/exportRepository"),i=require("../models/SalesOrder"),c=require("../models/ReturnOrder"),s=require("../models/Customer"),d=require("../models/Product"),h=require("./excel/ProductExcelEnrichmentService"),m=require("../models"),T=require("./reportService"),{pickSalesStaffCode:l,pickSalesStaffName:g,pickDeliveryStaffCode:f,pickDeliveryStaffName:p}=require("../domain/staff/staffIdentity"),{normalizePickingZone:y,pickingZoneFrom:S,pickingZoneLabel:C,PICKING_ZONES:N}=require("../utils/pickingZone.util")
;function D(e={}){const n={...e};return delete n._id,delete n.__v,n}function M(e){return null==e?"":Array.isArray(e)||"object"==typeof e?JSON.stringify(e):e}function A(e=[]){
const n=e.map(D),o=new Set;n.forEach(e=>Object.keys(e).forEach(e=>o.add(e)));const t=Array.from(o),a=n.map(e=>t.map(n=>M(e[n])));return{headers:t,body:a}}function H(e=""){
return"products"===x(e).toLowerCase()?["productCode","code","sku","barcode"]:h.PRODUCT_CODE_KEYS}async function K({type:e,rows:a}){const r=H(e),u=await h.enrichRows(a,{
productCodeKeys:r,packingKey:"Quy cách",salePriceKey:"Giá bán"}),{headers:i,body:c}=A(u.rows),s=n();o(s,"Export",[i,...c]);const d=h.documentProductLines(a);if(d.length){
const e=(await h.enrichRows(d,{packingKey:"Quy cách",salePriceKey:"Giá bán"})).rows.map(e=>({MaChungTu:e.documentCode,MaSP:L(e),SanPham:I(e),"Quy cách":e["Quy cách"],
"Giá bán":e["Giá bán"],SoLuong:_(e),GiaSauKM:R(e.finalPrice??e.priceAfterPromotion??e.discountedPrice??""),ThanhTien:X(e)
})),n=["MaChungTu","MaSP","SanPham","Quy cách","Giá bán","SoLuong","GiaSauKM","ThanhTien"];o(s,"ChiTietSanPham",[n,...e.map(e=>n.map(n=>e[n]??""))])}
return o(s,"ThongTin",[["Loại dữ liệu",e],["Số dòng",a.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc sản phẩm","Nếu có sản phẩm: Quy cách là số lượng đóng gói; Giá bán lấy từ danh mục sản phẩm. Đơn con giữ thêm Giá sau KM."]]),
t(s)}
const v=.08,{extractCustomerTaxProfile:b}=require("../utils/customerTaxProfile.util"),{extractCustomerBusinessProfile:P}=require("../utils/customerBusinessProfile.util"),k=["STT","NgayHoaDon","MaKhachHang","TenKhachHang","TenNguoiMua","MaSoThue","DiaChiKhachHang","DienThoaiKhachHang","SoTaiKhoan","NganHang","HinhThucTT","MaSanPham","SanPham","DonViTinh","Extra1SP","Extra2SP","SoLuong","DonGia","TyLeChietKhauHienThi","SoTienChietKhau","ThanhTien","TienBan","ThueSuat","TienThueSanPham","TienThue","TongCong","TinhChatHangHoa","DonViTienTe","TyGia","Fkey","Extra1","Extra2","EmailKhachHang","VungDuLieu","Extra3","Extra4","Extra5","Extra6","Extra7","Extra8","Extra9","Extra10","Extra11","Extra12","LOONo","HDSe","xVTNXHan","NVChuan","PTChuyenKhoan","HDKTTu","CCCDan"]
;function x(e){return String(e??"").trim()}function R(e,n=0){const o=Number(String(e??"").replace(/,/g,""));return Number.isFinite(o)?o:n}function V(e,n=2){const o=10**n
;return Math.round(R(e)*o)/o}function B(n){return e.toDateOnly(n||"")||x(n).slice(0,10)}function G(e,n={}){
const o=B(e),t=B(n.dateFrom||n.from||n.fromDate||""),a=B(n.dateTo||n.to||n.toDate||"");return!(t&&o<t||a&&o>a)}function w(e={}){
const n=x(e.status||e.deliveryStatus||e.lifecycleStatus).toLowerCase();return!["void","cancelled","canceled","deleted","removed"].includes(n)}function Q(e={}){
return[e.id,e._id,e.code,e.orderCode,e.documentCode,e.salesOrderId,e.salesOrderCode,e.externalOrderCode,e.invoiceCode,e.refCode].map(x).filter(Boolean)}function O(e={}){
return x(e.code||e.orderCode||e.salesOrderCode||e.documentCode||e.id||e._id)}function L(e={}){return x(e.productCode||e.code||e.sku||e.barcode||e.productId||e.id)}function I(e={}){
return x(e.productName||e.name||e.itemName||e.productTitle||"")}function E(e={},n={}){return x(e.unit||e.baseUnit||e.dvt||e.uom||n.unit||n.baseUnit||"")}function _(e={}){
return R(e.quantity??e.qty??e.totalQty??e.qtySale??e.saleQty??0)}function $(e={}){return R(e.returnQty??e.qtyReturn??e.returnQuantity??e.returnedQty??0)}function q(e={}){
return x(e.lineKey||e.orderLineId||e.salesOrderItemId||e.itemId||e._id||"")}function j(e={}){
return R(e.finalPrice??e.priceAfterPromotion??e.promoPrice??e.price??e.salePrice??e.unitPrice??e.sellPrice??0)}function X(e={}){
return R(e.amount??e.totalAmount??e.lineAmount??e.money??0)||_(e)*j(e)}function F(e,n){return`${x(e)}@@${x(n)}`}function U(e={}){const n=j(e);return n?String(V(n,6)):""}
function Z(e,n,o="",t=""){return[x(e),x(n),x(o),x(t)].join("@@")}function W(e={}){return x(e.code||e.id||e.returnOrderCode||e.documentCode||e._id)}function z(e={}){
return x(e.id||e._id||e.code||e.returnOrderCode||e.documentCode)}function J(e={}){
const n=e.updatedAt||e.modifiedAt||e.createdAt||e.date||e.documentDate||"",o=n?new Date(n).getTime():0;return Number.isFinite(o)?o:0}function Y(){return{status:{
$nin:["void","cancelled","canceled","deleted","removed"]},returnStatus:{$nin:["void","cancelled","canceled","deleted","removed"]}}}function ee(e,n,o,t={}){if(!n||!o)return
;e.set(n,R(e.get(n))+o),e.__sourceMap||(e.__sourceMap=new Map);const a=e.__sourceMap.get(n)||{codes:new Set,ids:new Set,sourceRows:[]};t.code&&a.codes.add(t.code),
t.id&&a.ids.add(t.id),t.sourceRow&&a.sourceRows.push(t.sourceRow),e.__sourceMap.set(n,a)}function ne(e,n){const o=e&&e.__sourceMap;if(!o)return{ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const t=o.get(n);if(!t)return{ReturnOrderCode:"",ReturnOrderId:"",ReturnQtySource:""}
;const a=Array.from(t.codes||[]).filter(Boolean),r=Array.from(t.ids||[]).filter(Boolean),u=Array.from(t.sourceRows||[]).filter(Boolean);return{ReturnOrderCode:a.join(", "),
ReturnOrderId:r.join(", "),ReturnQtySource:u.join(" | ")}}function oe(e=[]){const n=new Map,o=new Map;for(const n of e||[]){if(!w(n))continue
;const e=W(n),t=z(n),a=J(n),r=Array.from(new Set([n.salesOrderId,n.orderId,n.sourceOrderId,n.deliveryOrderId,n.salesOrderCode,n.orderCode,n.sourceOrderCode,n.deliveryOrderCode,n.originalOrderCode].map(x).filter(Boolean)))
;if(!r.length)continue;const u=x(n.salesOrderCode||n.orderCode||n.salesOrderId||n.orderId||r[0]);for(const i of Array.isArray(n.items)?n.items:[]){const n=L(i);if(!n)continue
;const c=$(i);if(!c)continue;const s=q(i),d=U(i),h=`${e||t||"RETURN_ORDER"}:${u}:${n}:${c}`,m=[e||t,u,n,s||"",d||""].map(x).join("@@"),T={roKeys:r,pcode:n,qty:c,lineKey:s,
priceKey:d,roCode:e,roId:t,updatedMs:a,sourceRow:h},l=o.get(m);(!l||a>=l.updatedMs)&&o.set(m,T)}}for(const e of o.values()){
const{roKeys:o,pcode:t,qty:a,lineKey:r,priceKey:u,roCode:i,roId:c,sourceRow:s}=e,d={code:i,id:c,sourceRow:s}
;for(const e of o)ee(n,r&&u?Z(e,t,r,u):r?Z(e,t,r,""):u?Z(e,t,"",u):F(e,t),a,d)}return n}function te(e,n={},o={}){const t=L(o);if(!t)return{qty:0,ReturnOrderCode:"",
ReturnOrderId:"",ReturnQtySource:""};const a=q(o),r=U(o);let u={qty:0,key:""};for(const o of Q(n)){
const n=[a&&r?Z(o,t,a,r):"",a?Z(o,t,a,""):"",r?Z(o,t,"",r):"",F(o,t)].filter(Boolean);for(const o of n){const n=R(e.get(o));if(n>u.qty&&(u={qty:n,key:o}),n)break}}return{qty:u.qty,
...ne(e,u.key)}}function ae(e,n={},o={}){return te(e,n,o).qty}function re(e={}){return x(e.customerCode||e.customerId||e.customerName||e.customerPhone||"")}function ue(e=[]){
const n=new Map;for(const o of e||[])[o.code,o.customerCode,o.id,o._id,o.name,o.customerName,o.phone,o.mobile].map(x).filter(Boolean).forEach(e=>n.set(e,o));return n}
function ie(e=[]){const n=new Map;for(const o of e||[])[o.code,o.productCode,o.sku,o.barcode,o.id,o._id].map(x).filter(Boolean).forEach(e=>n.set(e,o));return n}
function ce(e={},n=new Map){
const o=n.get(x(e.customerCode))||n.get(x(e.customerId))||n.get(x(e.customerName))||{},t=b(e),a=b(o),r=P(e),u=P(o),i=x(e.customerName||o.name||o.customerName),c=x(r.businessName||u.businessName)
;return{code:x(e.customerCode||o.code||o.customerCode||e.customerId||o.id),name:c||i,buyer:x(e.buyerName||e.contactName||o.buyerName||o.representative||o.contactName||i),
taxCode:x(t.taxCode||a.taxCode),address:x(t.taxInvoiceAddress||a.taxInvoiceAddress||e.customerAddress||e.address||o.address||o.deliveryAddress),
phone:x(e.customerPhone||e.phone||o.phone||o.mobile),bankAccount:x(o.bankAccount||o.accountNumber||e.bankAccount),bankName:x(o.bankName||e.bankName),
email:x(o.email||e.customerEmail||e.email)}}function se(e={}){const n=x(e.paymentMethod||e.paymentType||e.method||e.hinhThucTT||"");if(n)return n
;const o=R(e.cashAmount||e.collectedCashAmount),t=R(e.bankAmount||e.transferAmount||e.collectedBankAmount);return o&&t?"TM/CK":t?"CK":"TM/CK"}
function de({orders:n,returnOrders:o,customers:t,products:a,query:r={}}){const u=oe(o),i=ue(t),c=ie(a),s=[],d=[];let m=0
;const T=(n||[]).filter(w).filter(e=>!1!==e.vatInvoiceRequired).filter(e=>G(e.orderDate||e.date||e.documentDate||e.createdAt,r)).filter(e=>{
if(!r.customerCode&&!r.customerId)return!0;const n=x(r.customerCode||r.customerId);return[e.customerCode,e.customerId,e.customerName].map(x).includes(n)}).filter(e=>{
if(!r.salesStaffCode&&!r.salesmanCode)return!0;const n=x(r.salesStaffCode||r.salesmanCode);return[e.salesStaffCode,e.salesmanCode,e.nvbhCode].map(x).includes(n)
}).sort((e,n)=>x(e.orderDate||e.date||e.documentDate||e.createdAt).localeCompare(x(n.orderDate||n.date||n.documentDate||n.createdAt))||O(e).localeCompare(O(n)));for(const n of T){
const o=[],t=ce(n,i),a=O(n),r=B(n.orderDate||n.date||n.documentDate||n.createdAt||e.todayVN());for(const e of Array.isArray(n.items)?n.items:[]){
const r=L(e),i=c.get(r)||{},s=I(e)||x(i.name||i.productName),m=_(e),T=te(u,n,e),l=T.qty,g=Math.min(m,l),f=Math.max(0,m-g),p=j(e)||(m?X(e)/m:0);if(!r||f<=0){d.push({MaDon:a,
MaKhachHang:t.code,TenKhachHang:t.name,MaSanPham:r,SanPham:s,"Quy cách":h.catalogPackingQty(i),"Giá bán":h.catalogSalePrice(i),SoLuongBan:m,SoLuongTra:l,SoLuongTraAnToan:g,
SoLuongXuatHoaDon:f,GiaSauKhuyenMaiCoVAT:p,DonGiaTruocVAT:"",ThanhTienTruocVAT:"",ReturnOrderCode:T.ReturnOrderCode,ReturnOrderId:T.ReturnOrderId,ReturnQtySource:T.ReturnQtySource,
LyDoBoDong:r?"INVOICE_QTY_ZERO":"MISSING_PRODUCT_CODE"});continue}const y=V(p/1.08,6),S=V(f*y,2);o.push({productCode:r,productName:s,unit:E(e,i),
catalogPackingQty:h.catalogPackingQty(i),catalogSalePrice:h.catalogSalePrice(i),soldQty:m,returnQty:l,safeReturnQty:g,invoiceQty:f,priceInclVat:p,unitPriceBeforeVat:y,
lineAmountBeforeVat:S,returnOrderCode:T.ReturnOrderCode,returnOrderId:T.ReturnOrderId,returnQtySource:T.ReturnQtySource})}if(!o.length)continue;m+=1
;const T=V(o.reduce((e,n)=>e+n.lineAmountBeforeVat,0),2),l=V(T*v,2),g=Math.round(T+l);o.forEach((e,o)=>{const a=0===o;s.push({STT:a?m:"",NgayHoaDon:a?r:"",MaKhachHang:a?t.code:"",
TenKhachHang:a?t.name:"",TenNguoiMua:a?t.buyer:"",MaSoThue:a?t.taxCode:"",DiaChiKhachHang:a?t.address:"",DienThoaiKhachHang:a?t.phone:"",SoTaiKhoan:a?t.bankAccount:"",
NganHang:a?t.bankName:"",HinhThucTT:a?se(n):"",MaSanPham:e.productCode,SanPham:e.productName,DonViTinh:e.unit,Extra1SP:e.catalogPackingQty,Extra2SP:e.catalogSalePrice,
SoLuong:e.invoiceQty,DonGia:e.unitPriceBeforeVat,TyLeChietKhauHienThi:"",SoTienChietKhau:"",ThanhTien:e.lineAmountBeforeVat,TienBan:a?T:"",ThueSuat:a?8:"",TienThueSanPham:"",
TienThue:a?l:"",TongCong:a?g:"",TinhChatHangHoa:0,DonViTienTe:a?"VND":"",TyGia:"",Fkey:a?O(n):"",Extra1:"",Extra2:"",EmailKhachHang:a?t.email:"",VungDuLieu:"",Extra3:"",Extra4:"",
Extra5:"",Extra6:"",Extra7:"",Extra8:"",Extra9:"",Extra10:"",Extra11:"",Extra12:"",LOONo:"",HDSe:"",xVTNXHan:"",NVChuan:"",PTChuyenKhoan:"",HDKTTu:"",CCCDan:""}),d.push({
MaDon:O(n),MaKhachHang:t.code,TenKhachHang:t.name,MaSoThue:t.taxCode,DiaChiHoaDon:t.address,MaSanPham:e.productCode,SanPham:e.productName,"Quy cách":e.catalogPackingQty,
"Giá bán":e.catalogSalePrice,SoLuongBan:e.soldQty,SoLuongTra:e.returnQty,SoLuongTraAnToan:e.safeReturnQty,SoLuongXuatHoaDon:e.invoiceQty,GiaSauKhuyenMaiCoVAT:e.priceInclVat,
DonGiaTruocVAT:e.unitPriceBeforeVat,ThanhTienTruocVAT:e.lineAmountBeforeVat,ReturnOrderCode:e.returnOrderCode,ReturnOrderId:e.returnOrderId,ReturnQtySource:e.returnQtySource,
LyDoBoDong:""})})}return{rows:s,auditRows:d}}async function he(a={}){const r=B(a.dateFrom||a.from||a.fromDate||"")||"0000-01-01",u=B(a.dateTo||a.to||a.toDate||"")||"9999-12-31",h={
vatInvoiceRequired:{$ne:!1}};(r||u)&&(h.$or=[{orderDate:{...r?{$gte:r}:{},...u?{$lte:u}:{}}},{date:{...r?{$gte:r}:{},...u?{$lte:u}:{}}},{documentDate:{...r?{$gte:r}:{},...u?{$lte:u
}:{}}},{createdAt:{...r?{$gte:`${r}T00:00:00.000Z`}:{},...u?{$lte:`${u}T23:59:59.999Z`}:{}}}]);const[m,T,l,g]=await Promise.all([i.find(h).sort({orderDate:1,date:1,code:1
}).limit(Math.min(Math.max(Number(a.limit||2e4),1),1e5)).lean(),c.find(Y()).lean(),s.find({}).lean(),d.find({}).lean()]),{rows:f,auditRows:p}=de({orders:m,returnOrders:T,
customers:l,products:g,query:a}),y=n(),S=[k,...f.map(e=>k.map(n=>e[n]??""))];o(y,"Sheet1",S,{autoFilter:!0})
;const C=["MaDon","MaKhachHang","TenKhachHang","MaSoThue","DiaChiHoaDon","MaSanPham","SanPham","Quy cách","Giá bán","SoLuongBan","SoLuongTra","SoLuongTraAnToan","SoLuongXuatHoaDon","GiaSauKhuyenMaiCoVAT","DonGiaTruocVAT","ThanhTienTruocVAT","ReturnOrderCode","ReturnOrderId","ReturnQtySource","LyDoBoDong"]
;o(y,"DoiChieu",[C,...p.map(e=>C.map(n=>e[n]??""))]);const N=f.reduce((e,n)=>(""!==n.TienBan&&(e.invoiceCount+=1,e.amountBeforeVat+=R(n.TienBan),e.vatAmount+=R(n.TienThue),
e.totalAmount+=R(n.TongCong)),e.lineCount+=n.MaSanPham?1:0,e),{invoiceCount:0,lineCount:0,amountBeforeVat:0,vatAmount:0,totalAmount:0})
;o(y,"ThongTin",[["Mẫu","TT78 - Sheet1"],["Từ ngày","0000-01-01"===r?"":r],["Đến ngày","9999-12-31"===u?"":u],["Số hóa đơn",N.invoiceCount],["Số dòng sản phẩm",N.lineCount],["Tiền bán trước thuế",V(N.amountBeforeVat,2)],["Tiền thuế 8%",V(N.vatAmount,2)],["Tổng cộng",Math.round(N.totalAmount)],["Quy tắc","Số lượng xuất HĐ = số lượng bán - số lượng trả; Đơn giá = giá sau khuyến mại trên đơn / 1.08"]])
;const D=t(y),M="0000-01-01"===r?"all":r,A="9999-12-31"===u?e.todayVN():u;return{buffer:D,rows:f.length,fileName:`HoaDonVAT_TT78_${M}_${A}.xlsx`}}function me(e={}){
return[x(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH),x(e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName)].filter(Boolean).join(" - ")
}function Te(e={}){return x(e.orderSourceName||e.orderSource||e.source||e.sourceType||e.importSource||"")}async function le(a={}){
const r=B(a.dateFrom||a.from||a.fromDate||"")||"0000-01-01",u=B(a.dateTo||a.to||a.toDate||"")||"9999-12-31",m={..."0000-01-01"!==r?{$gte:r}:{},..."9999-12-31"!==u?{$lte:u}:{}},T={
vatInvoiceRequired:!1,...Object.keys(m).length?{$or:[{orderDate:m},{date:m},{documentDate:m},{createdAt:{..."0000-01-01"!==r?{$gte:`${r}T00:00:00.000Z`}:{},..."9999-12-31"!==u?{
$lte:`${u}T23:59:59.999Z`}:{}}}]}:{}},[l,g,f,p]=await Promise.all([i.find(T).sort({orderDate:1,date:1,code:1
}).limit(Math.min(Math.max(Number(a.limit||2e4),1),1e5)).lean(),c.find(Y()).lean(),s.find({}).lean(),d.find({}).lean()]),y=(l||[]).filter(w).filter(e=>!1===e.vatInvoiceRequired).filter(e=>G(e.orderDate||e.date||e.documentDate||e.createdAt,a)),S=oe(g),C=ue(f),N=ie(p),D=[],M=[]
;let A=0,H=0,K=0;y.forEach((e,n)=>{const o=ce(e,C),t=O(e);let a=0,r=0;for(const n of Array.isArray(e.items)?e.items:[]){
const o=L(n),u=N.get(o)||{},i=_(n),c=Math.min(i,ae(S,e,n)),s=Math.max(0,i-c),d=j(n)||(i?X(n)/i:0),m=V(s*d,2);a+=V(c*d,2),r+=m,M.push({"Mã đơn":t,"Mã sản phẩm":o,
"Tên sản phẩm":I(n)||x(u.name||u.productName),"Quy cách":h.catalogPackingQty(u),"Giá bán":h.catalogSalePrice(u),"Số lượng bán":i,"Số lượng trả":c,"Số lượng còn lại":s,"Đơn giá":d,
"Thành tiền":m})}const u=R(e.totalAmount||e.grandTotal||0),i=R(e.paidAmount||e.paymentAmount||0),c=R(e.debtAmount??Math.max(0,u-i));A+=u,H+=a,K+=r,D.push({STT:n+1,
"Ngày bán":B(e.orderDate||e.date||e.documentDate||e.createdAt),"Mã đơn":t,"Mã khách hàng":o.code,"Tên khách hàng":o.name,NVBH:me(e),"Nguồn đơn":Te(e),"Giá trị đơn":u,
"Tiền đã thu":i,"Công nợ":c,"Lý do không xuất":x(e.vatInvoiceNote),"Người thay đổi":x(e.vatInvoiceUpdatedBy),"Thời gian thay đổi":x(e.vatInvoiceUpdatedAt)})});const v=n()
;Se(v,"DanhSachDon",["STT","Ngày bán","Mã đơn","Mã khách hàng","Tên khách hàng","NVBH","Nguồn đơn","Giá trị đơn","Tiền đã thu","Công nợ","Lý do không xuất","Người thay đổi","Thời gian thay đổi"],D),
Se(v,"ChiTietHang",["Mã đơn","Mã sản phẩm","Tên sản phẩm","Quy cách","Giá bán","Số lượng bán","Số lượng trả","Số lượng còn lại","Đơn giá","Thành tiền"],M),
o(v,"ThongTin",[["Từ ngày","0000-01-01"===r?"":r],["Đến ngày","9999-12-31"===u?"":u],["Số đơn không xuất hóa đơn",D.length],["Tổng giá trị đơn",V(A,2)],["Tổng hàng trả",V(H,2)],["Giá trị còn lại",V(K,2)]])
;const b=t(v),P="0000-01-01"===r?"all":r,k="9999-12-31"===u?e.todayVN():u,Q=P===k?P:`${P}_${k}`;return{buffer:b,rows:D.length,fileName:`DanhSach_Don_Khong_Xuat_HoaDon_${Q}.xlsx`}}
const ge=["sales-report","delivery-report","return-report","debt-report","ar-ledger-detail","stock-report","inventory-movement-report","stock-card-report","fund-report","salesman-report","deliveryman-report","customer-sales-report","product-sales-report","product-info-report","customer-info-report","user-info-report"]
;function fe(e={}){return{from:B(e.dateFrom||e.from||e.fromDate||""),to:B(e.dateTo||e.to||e.toDate||"")}}function pe(e={},n=["date","createdAt"]){const{from:o,to:t}=fe(e)
;return o||t?{$or:n.map(e=>({[e]:{...o?{$gte:o}:{},...t?{$lte:"createdAt"===e?`${t}T23:59:59.999Z`:t}:{}}}))}:{}}function ye(e={}){
return Math.min(Math.max(Number(e.limit||1e5),1),2e5)}function Se(e,n,t,a){const r=a.map(e=>t.map(n=>e[n]??""));o(e,String(n||"BaoCao").slice(0,31),[t,...r])}function Ce(e=""){
return{"stock-report":"Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.",
"inventory-movement-report":"Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.",
"stock-card-report":"Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.",
"sales-report":"Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.",
"return-report":"Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.","debt-report":"Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.",
"ar-ledger-detail":"Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.","fund-report":"Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.",
"delivery-report":"Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.",
"product-info-report":"Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.",
"customer-info-report":"Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán."
}[e]||"Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống."}async function Ne(a,r,u,i,c={}){const s=await h.enrichRows(i,{packingKey:"Quy cách",salePriceKey:"Giá bán"
}),d=[...u];s.hasProducts&&(d.includes("Quy cách")||d.push("Quy cách"),d.includes("Giá bán")||d.push("Giá bán"));const m=n();Se(m,r,d,s.rows);const{from:T,to:l}=fe(c)
;o(m,"ThongTin",[["Mẫu báo cáo",r],["Từ ngày",T],["Đến ngày",l],["Số dòng",s.rows.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc nghiệp vụ",Ce(a)]])
;const g=String(a||"report").replace(/[^a-zA-Z0-9_-]/g,"-"),f=`${T||"all"}_${l||e.todayVN()}`;return{buffer:t(m),rows:s.rows.length,fileName:`${g}_${f}.xlsx`}}function De(e={}){
return Array.isArray(e.items)?e.items:[]}function Me(e={}){return De(e).reduce((e,n)=>e+_(n),0)||R(e.totalQuantity||e.quantity||0)}function Ae(e={},n={}){
return R(e.originalPrice??e.basePrice??e.listPrice??n.salePrice??e.salePrice??e.price??e.unitPrice??0)}function He(e={},n={}){return _(e)*Ae(e,n)}function Ke(e={}){
return R(e.finalAmount??e.amount??e.totalAmount??e.lineAmount??0)||_(e)*j(e)}function ve(e={},n=new Map){
return De(e).reduce((e,o)=>e+He(o,n.get(L(o))||{}),0)||R(e.beforePromoAmount||e.grossAmount||e.totalBeforeDiscount||e.totalAmount||0)}function be(e={}){
return R(e.afterPromoAmount||e.totalAfterPromotion||e.totalAmount||e.amount||0)}function Pe(e={},n="sales"){return x("delivery"===n?p(e):g(e))}function ke(e={},n="sales"){
return x("delivery"===n?f(e):l(e))}async function xe(){const e=await d.find({}).select("code name salePrice conversionRate baseUnit unit brand category").lean()
;return new Map(e.map(e=>[x(e.code),e]))}async function Re(e={}){const n=((await T.salesReport({...e,full:"1",export:"1"})).sales||[]).map((e,n)=>({STT:n+1,Ngay:e.date,
MaDon:e.code,Nguon:e.source,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,
SoLuongBan:e.saleQuantity,SoLuongKhuyenMai:e.promoQuantity,DoanhSoTruocKM:Math.round(R(e.beforePromoAmount)),DoanhSoThucTe:Math.round(R(e.actualAmount)),
ChietKhauKM:Math.round(R(e.promotionDiscountAmount)),GiaTriHangKM:Math.round(R(e.promotionValue)),DaThuTheoAR:Math.round(R(e.receiptAmount)),
TraHangTheoAR:Math.round(R(e.returnAmount)),DieuChinhCongNo:Math.round(R(e.adjustmentAmount)),ConNoTheoAR:Math.round(R(e.debtAmount)),TrangThaiGiaoHang:e.deliveryStatus,
TrangThaiKeToan:e.accountingStatus}));return Ne("sales-report","BaoCaoBanHang",Object.keys(n[0]||{STT:"",Ngay:"",MaDon:"",Nguon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",
MaNVGH:"",NVGH:"",SoLuongBan:"",SoLuongKhuyenMai:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DieuChinhCongNo:"",
ConNoTheoAR:"",TrangThaiGiaoHang:"",TrangThaiKeToan:""}),n,e)}async function Ve(e={}){const n=((await T.deliveryReport({...e,full:"1",export:"1"})).delivery||[]).map((e,n)=>({
STT:n+1,NgayGiao:e.deliveryDate,MaDonTong:e.code,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoDonDangGan:e.assignedOrderCount,SoDonDaGiao:e.orderCount,
TongTienDonCon:Math.round(R(e.totalAmount)),DoanhSoDaXacNhan:Math.round(R(e.accountingConfirmedAmount)),TienThuTheoQuy:Math.round(R(e.collectedAmount)),TrangThai:e.status,
LechSoDonSnapshot:R(e.dataQuality?.snapshotOrderCountDifference),LechTienSnapshot:Math.round(R(e.dataQuality?.snapshotAmountDifference))}))
;return Ne("delivery-report","BaoCaoGiaoHang",Object.keys(n[0]||{STT:"",NgayGiao:"",MaDonTong:"",MaNVGH:"",NVGH:"",SoDonDangGan:"",SoDonDaGiao:"",TongTienDonCon:"",
DoanhSoDaXacNhan:"",TienThuTheoQuy:"",TrangThai:"",LechSoDonSnapshot:"",LechTienSnapshot:""}),n,e)}async function Be(e={}){const n=((await T.returnReport({...e,full:"1",export:"1"
})).returns||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaTraHang:e.code,MaDon:e.salesOrderCode,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,
NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,GiaTriTra:Math.round(R(e.amount)),GiaTriChungTu:Math.round(R(e.documentAmount)),
GiaTriARReturn:Math.round(R(e.arAmount)),TrangThaiNhapKho:e.warehouseReceiveStatus,TrangThaiTraHang:e.returnState,TrangThaiKeToan:e.accountingStatus}))
;return Ne("return-report","BaoCaoTraHang",Object.keys(n[0]||{STT:"",Ngay:"",MaTraHang:"",MaDon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",GiaTriTra:"",
GiaTriChungTu:"",GiaTriARReturn:"",TrangThaiNhapKho:"",TrangThaiTraHang:"",TrangThaiKeToan:""}),n,e)}async function Ge(e={}){const n=((await T.periodDebtReport({...e,full:"1",
export:"1",includePaid:"1"})).debts||[]).map((e,n)=>({STT:n+1,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,DuDauKy:Math.round(R(e.openingBalance)),PhatSinhNo:Math.round(R(e.debitInPeriod)),DaThu:Math.round(R(e.receiptInPeriod)),
TraHang:Math.round(R(e.returnInPeriod)),ChietKhauDieuChinh:Math.round(R(e.adjustmentInPeriod)+R(e.otherCreditInPeriod)),TongPhatSinhCo:Math.round(R(e.totalCreditInPeriod)),
DuCuoiKy:Math.round(R(e.closingBalance))}));return Ne("debt-report","BaoCaoCongNo",Object.keys(n[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",
DuDauKy:"",PhatSinhNo:"",DaThu:"",TraHang:"",ChietKhauDieuChinh:"",TongPhatSinhCo:"",DuCuoiKy:""}),n,e)}async function we(e={}){const n=((await T.arLedgerDetailReport({...e,
full:"1",export:"1"})).ledger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaKhachHang:e.customerCode,KhachHang:e.customerName,ChungTu:e.documentCode,Loai:e.type,DienGiai:e.description,
DuTruocGiaoDich:Math.round(R(e.openingBalance)),No:Math.round(R(e.debit)),Co:Math.round(R(e.credit)),PhanLoaiCo:e.creditCategory,DuSauGiaoDich:Math.round(R(e.closingBalance))}))
;return Ne("ar-ledger-detail","SoCongNoChiTiet",Object.keys(n[0]||{STT:"",Ngay:"",MaKhachHang:"",KhachHang:"",ChungTu:"",Loai:"",DienGiai:"",DuTruocGiaoDich:"",No:"",Co:"",
PhanLoaiCo:"",DuSauGiaoDich:""}),n,e)}async function Qe(e={}){const n=((await T.stockReport({...e,full:"1",export:"1"})).stock||[]).map((e,n)=>({STT:n+1,
MaSP:x(e.productCode||e.code||e.productId),SanPham:x(e.productName||e.name),DonViTinh:x(e.unit||e.baseUnit),TonVatLy:R(e.onHand??e.quantity??e.qty),DaGiuCho:R(e.reservedQty),
TonKhaDung:R(e.availableQty)}));return Ne("stock-report","TonKhoHienTai",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonVatLy:"",DaGiuCho:"",TonKhaDung:""}),n,{})}
async function Oe(e={}){const n=((await T.inventoryMovementReport({...e,full:"1",export:"1",mode:"movement"})).stock||[]).map((e,n)=>({STT:n+1,MaSP:e.productCode,
SanPham:e.productName,DonViTinh:e.unit,TonDauKy:R(e.openingQty),NhapMua:R(e.importQty),HangTraNhapKho:R(e.returnQty),NhapKhac:R(e.otherInQty),TongNhap:R(e.inQty),
XuatBan:R(e.saleQty),XuatDaoChungTu:R(e.reversalOutQty),XuatKhac:R(e.otherOutQty),TongXuat:R(e.outQty),DieuChinhRong:R(e.adjustmentQty),TonCuoiKy:R(e.endingQty),
NguonTonCuoi:e.endingSource,TonCuoiTheoLedger:R(e.ledgerEndingQty),ChenhLechDoiSoat:R(e.reconciliationDifference)}))
;return Ne("inventory-movement-report","NhapXuatTon",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonDauKy:"",NhapMua:"",HangTraNhapKho:"",NhapKhac:"",TongNhap:"",
XuatBan:"",XuatDaoChungTu:"",XuatKhac:"",TongXuat:"",DieuChinhRong:"",TonCuoiKy:"",NguonTonCuoi:"",TonCuoiTheoLedger:"",ChenhLechDoiSoat:""}),n,e)}async function Le(e={}){
const n=((await T.stockCardReport({...e,full:"1",export:"1"})).transactions||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaSP:e.productCode,SanPham:e.productName,ChungTu:e.refCode,
Loai:e.type,PhanLoai:e.category,TonTruocGiaoDich:R(e.openingQty),Nhap:R(e.inQty),Xuat:R(e.outQty),TonSauGiaoDich:R(e.balanceQty),GhiChu:e.note}))
;return Ne("stock-card-report","TheKho",Object.keys(n[0]||{STT:"",Ngay:"",MaSP:"",SanPham:"",ChungTu:"",Loai:"",PhanLoai:"",TonTruocGiaoDich:"",Nhap:"",Xuat:"",TonSauGiaoDich:"",
GhiChu:""}),n,e)}async function Ie(e={}){const n=((await T.financeReport({...e,full:"1",export:"1"})).fundLedger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,ChungTu:e.code,Loai:e.type,
LoaiQuy:e.fundType,TaiKhoanQuy:e.account,NguoiLienQuan:e.counterparty,TonDauDong:Math.round(R(e.openingBalance)),Thu:Math.round(R(e.inAmount)),Chi:Math.round(R(e.outAmount)),
TonCuoiDong:Math.round(R(e.endingBalance)),GhiChu:e.note}));return Ne("fund-report","BaoCaoQuyTien",Object.keys(n[0]||{STT:"",Ngay:"",ChungTu:"",Loai:"",LoaiQuy:"",TaiKhoanQuy:"",
NguoiLienQuan:"",TonDauDong:"",Thu:"",Chi:"",TonCuoiDong:"",GhiChu:""}),n,e)}async function Ee(e={}){const n=((await T.salesReport({...e,full:"1",export:"1"
})).bySalesman||[]).map((e,n)=>({STT:n+1,MaNVBH:e.salesmanCode,NVBH:e.salesmanName,SoDon:e.orderCount,SoKhachHang:e.customerCount,DoanhSoTruocKM:Math.round(R(e.beforePromoAmount)),
DoanhSoThucTe:Math.round(R(e.actualAmount)),GiaTriHangKM:Math.round(R(e.promotionValue)),DaThuTheoAR:Math.round(R(e.receiptAmount)),TraHangTheoAR:Math.round(R(e.returnAmount)),
ConNoTheoAR:Math.round(R(e.debtAmount))}));return Ne("salesman-report","BaoCaoNVBH",Object.keys(n[0]||{STT:"",MaNVBH:"",NVBH:"",SoDon:"",SoKhachHang:"",DoanhSoTruocKM:"",
DoanhSoThucTe:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",ConNoTheoAR:""}),n,e)}async function _e(e={}){const n=((await T.deliveryReport({...e,full:"1",export:"1"
})).byStaff||[]).map((e,n)=>({STT:n+1,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoChuyen:e.tripCount,SoDonDaGiao:e.orderCount,TongTienDonCon:Math.round(R(e.totalAmount)),
DoanhSoDaXacNhan:Math.round(R(e.accountingConfirmedAmount)),ThuTienTheoQuy:Math.round(R(e.collectedAmount))}));return Ne("deliveryman-report","BaoCaoNVGH",Object.keys(n[0]||{
STT:"",MaNVGH:"",NVGH:"",SoChuyen:"",SoDonDaGiao:"",TongTienDonCon:"",DoanhSoDaXacNhan:"",ThuTienTheoQuy:""}),n,e)}async function $e(e={}){const n=await T.salesReport({...e,
full:"1",export:"1"}),o=await T.periodDebtReport({...e,full:"1",export:"1",includePaid:"1"}),t=new Map((o.debts||[]).map(e=>[x(e.customerCode||e.customerName),e])),a=new Map
;(n.sales||[]).forEach(e=>{const n=x(e.customerCode||e.customerName),o=a.get(n)||{MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
SoDon:0,DoanhSoTruocKM:0,DoanhSoThucTe:0,GiaTriHangKM:0,DaThuTheoAR:0,TraHangTheoAR:0};o.SoDon+=1,o.DoanhSoTruocKM+=R(e.beforePromoAmount),o.DoanhSoThucTe+=R(e.actualAmount),
o.GiaTriHangKM+=R(e.promotionValue),o.DaThuTheoAR+=R(e.receiptAmount),o.TraHangTheoAR+=R(e.returnAmount),a.set(n,o)});const r=Array.from(a.entries()).map(([e,n],o)=>{
const a=t.get(e)||{};return{STT:o+1,...n,DoanhSoTruocKM:Math.round(n.DoanhSoTruocKM),DoanhSoThucTe:Math.round(n.DoanhSoThucTe),GiaTriHangKM:Math.round(n.GiaTriHangKM),
DaThuTheoAR:Math.round(n.DaThuTheoAR),TraHangTheoAR:Math.round(n.TraHangTheoAR),DuDauKy:Math.round(R(a.openingBalance)),DuCuoiKy:Math.round(R(a.closingBalance))}})
;return Ne("customer-sales-report","DoanhSoKhachHang",Object.keys(r[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",SoDon:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",
GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DuDauKy:"",DuCuoiKy:""}),r,e)}async function qe(e={}){const n=await T.salesReport({...e,full:"1",export:"1"}),o=new Map
;(n.sales||[]).forEach(e=>(e.items||[]).forEach(e=>{const n=x(e.productCode||e.productName),t=o.get(n)||{MaSP:e.productCode,SanPham:e.productName,NhanHang:e.brand,SoLuongBan:0,
DoanhSoTruocKM:0,DoanhSoThucTe:0};t.SoLuongBan+=R(e.quantity),t.DoanhSoTruocKM+=R(e.catalogAmount),t.DoanhSoThucTe+=R(e.actualAmount),o.set(n,t)}))
;const t=Array.from(o.values()).reduce((e,n)=>e+n.DoanhSoThucTe,0)||1,a=Array.from(o.values()).map((e,n)=>({STT:n+1,...e,SoLuongBan:e.SoLuongBan,
DoanhSoTruocKM:Math.round(e.DoanhSoTruocKM),DoanhSoThucTe:Math.round(e.DoanhSoThucTe),ChietKhauKM:Math.round(e.DoanhSoTruocKM-e.DoanhSoThucTe),
TyTrong:`${V(e.DoanhSoThucTe/t*100,2)}%`}));return Ne("product-sales-report","DoanhSoSanPham",Object.keys(a[0]||{STT:"",MaSP:"",SanPham:"",NhanHang:"",SoLuongBan:"",
DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",TyTrong:""}),a,e)}
const je=new Set(["password","passwordHash","hash","salt","token","tokens","accessToken","refreshToken","secret","apiKey","session","sessions","resetPasswordToken","verificationToken"])
;function Xe(e={},n=[]){for(const o of n){const n=x(e[o]);if(n)return n}return""}function Fe(e){return!0===e?"Hoạt động":!1===e?"Ngưng hoạt động":x(e)}function Ue(e={},n=[],o=[]){
const t=new Set([...n,...o,"_id","__v","searchText"]),a={};return Object.keys(e||{}).forEach(n=>{if(t.has(n))return;const o=e[n];null!=o&&""!==o&&(a[n]=o)}),
Object.keys(a).length?JSON.stringify(a):""}function Ze(e={},n=0,o=new Map){const t=Xe(e,["code","productCode","sku","id"]),a=o.get(x(t).toUpperCase())||{};return{STT:n+1,MaSP:t,
TenSP:Xe(e,["name","productName","title"]),Barcode:Xe(e,["barcode","barCode"]),NhanHang:Xe(e,["brand","brandName"]),NganhHang:Xe(e,["category","categoryName","groupName"]),
DonVi:Xe(e,["unit","baseUnit","uom"]),DonViCoSo:Xe(e,["baseUnit","unit"]),QuyDoi:R(e.conversionRate||e.ratio||1),
"Quy cách":Math.max(1,R(e.conversionRate||e.packingQty||e.unitsPerCase||1)),"Giá bán":Math.round(R(e.salePrice||e.price||e.sellPrice)),
GiaVon:Math.round(R(e.costPrice||e.cost||e.purchasePrice)),TonVatLy:R(a.onHand??a.quantity??a.qty),DaGiuCho:R(a.reservedQty),TonKhaDung:R(a.availableQty),
KhuBocHang:C(y(S(e),N.HC)),TrangThai:Fe(e.isActive??e.status),NgayTao:B(e.createdAt),NgayCapNhat:B(e.updatedAt),
ThongTinKhac:Ue(e,["code","productCode","sku","name","productName","barcode","brand","category","unit","baseUnit","conversionRate","packing","salePrice","costPrice","pickingZone","warehouseCode","warehouseName","defaultWarehouse","isActive","status","createdAt","updatedAt"])
}}async function We(e={}){const[n,o]=await Promise.all([d.find({}).sort({code:1,name:1}).limit(ye(e)).lean(),T.stockReport({full:"1",export:"1"
})]),t=new Map((o.stock||o.items||[]).map(e=>[x(e.productCode||e.code).toUpperCase(),e])),a=n.map((e,n)=>Ze(e,n,t))
;return Ne("product-info-report","ThongTinSanPham",Object.keys(a[0]||Ze({},-1,t)),a,e)}function ze(e={}){return[e.customerCode,e.customerId,e.customerName].map(x).filter(Boolean)}
async function Je(){const n=await T.periodDebtReport({dateFrom:"0000-01-01",dateTo:e.todayVN(),full:"1",export:"1",includePaid:"1"}),o=new Map
;return(n.debts||n.items||[]).forEach(e=>{const n=R(e.closingBalance);ze(e).forEach(e=>o.set(e,n))}),o}async function Ye(n={}){
const o=e.todayVN(),t=x(n.monthStart||n.monthFrom||`${o.slice(0,7)}-01`),a=x(n.monthEnd||n.monthTo||o),r=await T.salesReport({dateFrom:t,dateTo:a,full:"1",export:"1"}),u=new Map
;return(r.sales||r.items||[]).forEach(e=>{const n=R(e.actualAmount);[e.customerCode,e.customerId,e.customerName].map(x).filter(Boolean).forEach(e=>{u.set(e,R(u.get(e))+n)})}),u}
function en(e,n=[]){for(const o of n.map(x).filter(Boolean))if(e.has(o))return R(e.get(o));return 0}function nn(e={},n=0,o=new Map,t=new Map){
const a=b(e),r=P(e),u=[e.code,e.customerCode,e.id,e._id,e.name,e.customerName];return{STT:n+1,MaKH:Xe(e,["code","customerCode","id"]),TenKH:Xe(e,["name","customerName"]),
TenHoKinhDoanh:r.businessName,SDT:Xe(e,["phone","mobile","customerPhone","tel"]),DiaChi:Xe(e,["address","customerAddress","fullAddress"]),MaSoThue:a.taxCode,
DiaChiHoaDonThue:a.taxInvoiceAddress,Tuyen:Xe(e,["route","routeName","line"]),KhuVuc:Xe(e,["area","areaName","region","province"]),
MaNVBH:Xe(e,["staffCode","salesStaffCode","salesmanCode"]),NVBHPhuTrach:Xe(e,["staffName","salesStaffName","salesmanName"]),MaNVGH:Xe(e,["deliveryStaffCode","shipperCode"]),
NVGHPhuTrach:Xe(e,["deliveryStaffName","shipperName"]),CongNoHienTai:Math.round(en(o,u)),DoanhSoThang:Math.round(en(t,u)),TrangThai:Fe(e.isActive??e.status),NgayTao:B(e.createdAt),
NgayCapNhat:B(e.updatedAt),
ThongTinKhac:Ue(e,["code","customerCode","name","customerName","businessName","customerBusinessName","householdBusinessName","taxBusinessName","invoiceBusinessName","tenHoKinhDoanh","phone","mobile","customerPhone","address","customerAddress","taxCode","customerTaxCode","taxNumber","vatNumber","vatCode","mst","taxInvoiceAddress","customerTaxInvoiceAddress","invoiceAddress","vatInvoiceAddress","billingAddress","route","area","region","staffCode","staffName","salesStaffCode","salesStaffName","deliveryStaffCode","deliveryStaffName","isActive","status","createdAt","updatedAt"])
}}async function on(e={}){const[n,o,t]=await Promise.all([s.find({}).sort({code:1,name:1
}).limit(ye(e)).lean(),Je(),Ye(e)]),a=n.map((e,n)=>nn(e,n,o,t)).sort((e,n)=>R(n.CongNoHienTai)-R(e.CongNoHienTai)||x(e.MaKH).localeCompare(x(n.MaKH)));return a.forEach((e,n)=>{
e.STT=n+1}),Ne("customer-info-report","ThongTinKhachHang",Object.keys(a[0]||nn({},-1)),a,e)}function tn(e={}){const n={};return Object.keys(e||{}).forEach(o=>{
if(je.has(o)||o.startsWith("_")||["__v","searchText"].includes(o))return
;if(["username","fullName","name","code","staffCode","role","roles","phone","email","isActive","status","permissions","area","route","lastLoginAt","lastLogin","createdAt","updatedAt"].includes(o))return
;const t=e[o];null!=t&&""!==t&&(n[o]=t)}),Object.keys(n).length?JSON.stringify(n):""}function an(e={},n=0){return{STT:n+1,TenDangNhap:Xe(e,["username","loginName"]),
HoTen:Xe(e,["fullName","name","displayName"]),MaNhanVien:Xe(e,["staffCode","code","employeeCode"]),VaiTro:Array.isArray(e.roles)?e.roles.join(", "):Xe(e,["role","roles"]),
SDT:Xe(e,["phone","mobile"]),Email:Xe(e,["email"]),TrangThai:Fe(e.isActive??e.status),
QuyenTruyCap:Array.isArray(e.permissions)?e.permissions.join(", "):x(e.permissions||e.permission||""),KhuVucTuyen:Xe(e,["area","route","region"]),NgayTao:B(e.createdAt),
NgayCapNhat:B(e.updatedAt),LanDangNhapGanNhat:B(e.lastLoginAt||e.lastLogin||e.lastSeenAt),ThongTinKhac:tn(e)}}async function rn(e={}){
const n=m.users,o=(await n.find({}).select("-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken").sort({
role:1,code:1,username:1}).limit(ye(e)).lean()).map(an);return Ne("user-info-report","ThongTinTaiKhoan",Object.keys(o[0]||an({},-1)),o,e)}const un={"sales-report":Re,
"delivery-report":Ve,"return-report":Be,"debt-report":Ge,"ar-ledger-detail":we,"stock-report":Qe,"inventory-movement-report":Oe,"stock-card-report":Le,"fund-report":Ie,
"salesman-report":Ee,"deliveryman-report":_e,"customer-sales-report":$e,"product-sales-report":qe,"product-info-report":We,"customer-info-report":on,"user-info-report":rn}
;async function cn(e){return a.preview(e)}async function sn(e){return a.commit(e)}async function dn(){return a.logs()}function hn(){return r.getBuiltInTemplates()}
async function mn(e){return r.buildBuiltInTemplateFile(e)}function Tn(e){return r.getFields(e)}async function ln(){return r.listCustomTemplates()}async function gn(e){
return r.saveCustomTemplate(e)}async function fn(e){return r.deleteCustomTemplate(e)}async function pn(e){return r.buildCustomTemplateFile(e)}function yn(){
return[...new Set([...u.getExportTypes(),"vatInvoiceTT78","vat-non-invoice-orders",...ge])].sort()}async function Sn(n,o={}){const t=String(n||"").trim()
;if(["vatInvoiceTT78","vat-invoice-tt78","hoa-don-vat-tt78"].includes(t))return he(o);if(["vat-non-invoice-orders","vatNonInvoiceOrders"].includes(t))return le(o)
;if(un[t])return un[t](o);const a=await u.findForExport(n,o);if(!a)return{error:"Loại dữ liệu export không hợp lệ",status:400};const r=await K({type:n,rows:a
}),i=String(n||"data").replace(/[^a-zA-Z0-9_-]/g,"-");return{buffer:r,rows:a.length,fileName:`${i}-export-${e.todayVN()}.xlsx`}}module.exports={previewImport:cn,commitImport:sn,
getImportLogs:dn,getBuiltInTemplates:hn,buildBuiltInTemplateFile:mn,getFields:Tn,listCustomTemplates:ln,saveCustomTemplate:gn,deleteCustomTemplate:fn,buildCustomTemplateFile:pn,
getExportTypes:yn,exportToExcel:Sn};
