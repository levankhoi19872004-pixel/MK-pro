/* GENERATED FILE — edit src/services/importExportLegacy.service.source/part-01.jsfrag, src/services/importExportLegacy.service.source/part-02.jsfrag, src/services/importExportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{createWorkbook:n,appendAoaSheet:o,writeWorkbook:t}=require("../utils/excelWriter.util"),a=require("./excelImportService"),r=require("./importTemplateService"),u=require("../repositories/exportRepository"),i=require("../models/SalesOrder"),c=require("../models/ReturnOrder"),s=require("../models/Customer"),d=require("../models/Product"),h=require("../models"),T=require("./reportService"),{pickSalesStaffCode:m,pickSalesStaffName:l,pickDeliveryStaffCode:g,pickDeliveryStaffName:f}=require("../domain/staff/staffIdentity"),{normalizePickingZone:p,pickingZoneFrom:y,pickingZoneLabel:S,PICKING_ZONES:C}=require("../utils/pickingZone.util")
;function N(e={}){const n={...e};return delete n._id,delete n.__v,n}function D(e){return null==e?"":Array.isArray(e)||"object"==typeof e?JSON.stringify(e):e}function M(e=[]){
const n=e.map(N),o=new Set;n.forEach(e=>Object.keys(e).forEach(e=>o.add(e)));const t=Array.from(o),a=n.map(e=>t.map(n=>D(e[n])));return{headers:t,body:a}}
async function A({type:e,rows:a}){const{headers:r,body:u}=M(a),i=n();return o(i,"Export",[r,...u]),
o(i,"ThongTin",[["Loại dữ liệu",e],["Số dòng",a.length],["Thời gian xuất",(new Date).toISOString()]]),t(i)}
const H=.08,{extractCustomerTaxProfile:K}=require("../utils/customerTaxProfile.util"),{extractCustomerBusinessProfile:v}=require("../utils/customerBusinessProfile.util"),b=["STT","NgayHoaDon","MaKhachHang","TenKhachHang","TenNguoiMua","MaSoThue","DiaChiKhachHang","DienThoaiKhachHang","SoTaiKhoan","NganHang","HinhThucTT","MaSanPham","SanPham","DonViTinh","Extra1SP","Extra2SP","SoLuong","DonGia","TyLeChietKhauHienThi","SoTienChietKhau","ThanhTien","TienBan","ThueSuat","TienThueSanPham","TienThue","TongCong","TinhChatHangHoa","DonViTienTe","TyGia","Fkey","Extra1","Extra2","EmailKhachHang","VungDuLieu","Extra3","Extra4","Extra5","Extra6","Extra7","Extra8","Extra9","Extra10","Extra11","Extra12","LOONo","HDSe","xVTNXHan","NVChuan","PTChuyenKhoan","HDKTTu","CCCDan"]
;function k(e){return String(e??"").trim()}function V(e,n=0){const o=Number(String(e??"").replace(/,/g,""));return Number.isFinite(o)?o:n}function P(e,n=2){const o=10**n
;return Math.round(V(e)*o)/o}function x(n){return e.toDateOnly(n||"")||k(n).slice(0,10)}function B(e,n={}){
const o=x(e),t=x(n.dateFrom||n.from||n.fromDate||""),a=x(n.dateTo||n.to||n.toDate||"");return!(t&&o<t||a&&o>a)}function R(e={}){
const n=k(e.status||e.deliveryStatus||e.lifecycleStatus).toLowerCase();return!["void","cancelled","canceled","deleted","removed"].includes(n)}function O(e={}){
return[e.id,e._id,e.code,e.orderCode,e.documentCode,e.salesOrderId,e.salesOrderCode,e.externalOrderCode,e.invoiceCode,e.refCode].map(k).filter(Boolean)}function G(e={}){
return k(e.code||e.orderCode||e.salesOrderCode||e.documentCode||e.id||e._id)}function w(e={}){return k(e.productCode||e.code||e.sku||e.barcode||e.productId||e.id)}function I(e={}){
return k(e.productName||e.name||e.itemName||e.productTitle||"")}function L(e={},n={}){return k(e.unit||e.baseUnit||e.dvt||e.uom||n.unit||n.baseUnit||"")}function Q(e={}){
return V(e.quantity??e.qty??e.totalQty??e.qtySale??e.saleQty??0)}function E(e={}){return V(e.returnQty??e.qtyReturn??e.returnQuantity??e.returnedQty??0)}function _(e={}){
return k(e.lineKey||e.orderLineId||e.salesOrderItemId||e.itemId||e._id||"")}function $(e={}){
return V(e.finalPrice??e.priceAfterPromotion??e.promoPrice??e.price??e.salePrice??e.unitPrice??e.sellPrice??0)}function q(e={}){
return V(e.amount??e.totalAmount??e.lineAmount??e.money??0)||Q(e)*$(e)}function j(e,n){return`${k(e)}@@${k(n)}`}function X(e={}){const n=$(e);return n?String(P(n,6)):""}
function F(e,n,o="",t=""){return[k(e),k(n),k(o),k(t)].join("@@")}function U(e={}){return k(e.code||e.id||e.returnOrderCode||e.documentCode||e._id)}function Z(e={}){
return k(e.id||e._id||e.code||e.returnOrderCode||e.documentCode)}function W(e={}){
const n=e.updatedAt||e.modifiedAt||e.createdAt||e.date||e.documentDate||"",o=n?new Date(n).getTime():0;return Number.isFinite(o)?o:0}function z(){return{status:{
$nin:["void","cancelled","canceled","deleted","removed"]},returnStatus:{$nin:["void","cancelled","canceled","deleted","removed"]}}}function J(e,n,o,t={}){if(!n||!o)return
;e.set(n,V(e.get(n))+o),e.__sourceMap||(e.__sourceMap=new Map);const a=e.__sourceMap.get(n)||{codes:new Set,ids:new Set,sourceRows:[]};t.code&&a.codes.add(t.code),
t.id&&a.ids.add(t.id),t.sourceRow&&a.sourceRows.push(t.sourceRow),e.__sourceMap.set(n,a)}function Y(e,n){const o=e&&e.__sourceMap;if(!o)return{ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const t=o.get(n);if(!t)return{ReturnOrderCode:"",ReturnOrderId:"",ReturnQtySource:""}
;const a=Array.from(t.codes||[]).filter(Boolean),r=Array.from(t.ids||[]).filter(Boolean),u=Array.from(t.sourceRows||[]).filter(Boolean);return{ReturnOrderCode:a.join(", "),
ReturnOrderId:r.join(", "),ReturnQtySource:u.join(" | ")}}function ee(e=[]){const n=new Map,o=new Map;for(const n of e||[]){if(!R(n))continue
;const e=U(n),t=Z(n),a=W(n),r=Array.from(new Set([n.salesOrderId,n.orderId,n.sourceOrderId,n.deliveryOrderId,n.salesOrderCode,n.orderCode,n.sourceOrderCode,n.deliveryOrderCode,n.originalOrderCode].map(k).filter(Boolean)))
;if(!r.length)continue;const u=k(n.salesOrderCode||n.orderCode||n.salesOrderId||n.orderId||r[0]);for(const i of Array.isArray(n.items)?n.items:[]){const n=w(i);if(!n)continue
;const c=E(i);if(!c)continue;const s=_(i),d=X(i),h=`${e||t||"RETURN_ORDER"}:${u}:${n}:${c}`,T=[e||t,u,n,s||"",d||""].map(k).join("@@"),m={roKeys:r,pcode:n,qty:c,lineKey:s,
priceKey:d,roCode:e,roId:t,updatedMs:a,sourceRow:h},l=o.get(T);(!l||a>=l.updatedMs)&&o.set(T,m)}}for(const e of o.values()){
const{roKeys:o,pcode:t,qty:a,lineKey:r,priceKey:u,roCode:i,roId:c,sourceRow:s}=e,d={code:i,id:c,sourceRow:s}
;for(const e of o)J(n,r&&u?F(e,t,r,u):r?F(e,t,r,""):u?F(e,t,"",u):j(e,t),a,d)}return n}function ne(e,n={},o={}){const t=w(o);if(!t)return{qty:0,ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const a=_(o),r=X(o);let u={qty:0,key:""};for(const o of O(n)){const n=[a&&r?F(o,t,a,r):"",a?F(o,t,a,""):"",r?F(o,t,"",r):"",j(o,t)].filter(Boolean)
;for(const o of n){const n=V(e.get(o));if(n>u.qty&&(u={qty:n,key:o}),n)break}}return{qty:u.qty,...Y(e,u.key)}}function oe(e,n={},o={}){return ne(e,n,o).qty}function te(e={}){
return k(e.customerCode||e.customerId||e.customerName||e.customerPhone||"")}function ae(e=[]){const n=new Map
;for(const o of e||[])[o.code,o.customerCode,o.id,o._id,o.name,o.customerName,o.phone,o.mobile].map(k).filter(Boolean).forEach(e=>n.set(e,o));return n}function re(e=[]){
const n=new Map;for(const o of e||[])[o.code,o.productCode,o.sku,o.barcode,o.id,o._id].map(k).filter(Boolean).forEach(e=>n.set(e,o));return n}function ue(e={},n=new Map){
const o=n.get(k(e.customerCode))||n.get(k(e.customerId))||n.get(k(e.customerName))||{},t=K(e),a=K(o),r=v(e),u=v(o),i=k(e.customerName||o.name||o.customerName),c=k(r.businessName||u.businessName)
;return{code:k(e.customerCode||o.code||o.customerCode||e.customerId||o.id),name:c||i,buyer:k(e.buyerName||e.contactName||o.buyerName||o.representative||o.contactName||i),
taxCode:k(t.taxCode||a.taxCode),address:k(t.taxInvoiceAddress||a.taxInvoiceAddress||e.customerAddress||e.address||o.address||o.deliveryAddress),
phone:k(e.customerPhone||e.phone||o.phone||o.mobile),bankAccount:k(o.bankAccount||o.accountNumber||e.bankAccount),bankName:k(o.bankName||e.bankName),
email:k(o.email||e.customerEmail||e.email)}}function ie(e={}){const n=k(e.paymentMethod||e.paymentType||e.method||e.hinhThucTT||"");if(n)return n
;const o=V(e.cashAmount||e.collectedCashAmount),t=V(e.bankAmount||e.transferAmount||e.collectedBankAmount);return o&&t?"TM/CK":t?"CK":"TM/CK"}
function ce({orders:n,returnOrders:o,customers:t,products:a,query:r={}}){const u=ee(o),i=ae(t),c=re(a),s=[],d=[];let h=0
;const T=(n||[]).filter(R).filter(e=>!1!==e.vatInvoiceRequired).filter(e=>B(e.orderDate||e.date||e.documentDate||e.createdAt,r)).filter(e=>{
if(!r.customerCode&&!r.customerId)return!0;const n=k(r.customerCode||r.customerId);return[e.customerCode,e.customerId,e.customerName].map(k).includes(n)}).filter(e=>{
if(!r.salesStaffCode&&!r.salesmanCode)return!0;const n=k(r.salesStaffCode||r.salesmanCode);return[e.salesStaffCode,e.salesmanCode,e.nvbhCode].map(k).includes(n)
}).sort((e,n)=>k(e.orderDate||e.date||e.documentDate||e.createdAt).localeCompare(k(n.orderDate||n.date||n.documentDate||n.createdAt))||G(e).localeCompare(G(n)));for(const n of T){
const o=[],t=ue(n,i),a=G(n),r=x(n.orderDate||n.date||n.documentDate||n.createdAt||e.todayVN());for(const e of Array.isArray(n.items)?n.items:[]){
const r=w(e),i=c.get(r)||{},s=I(e)||k(i.name||i.productName),h=Q(e),T=ne(u,n,e),m=T.qty,l=Math.min(h,m),g=Math.max(0,h-l),f=$(e)||(h?q(e)/h:0);if(!r||g<=0){d.push({MaDon:a,
MaKhachHang:t.code,TenKhachHang:t.name,MaSanPham:r,SanPham:s,SoLuongBan:h,SoLuongTra:m,SoLuongTraAnToan:l,SoLuongXuatHoaDon:g,GiaSauKhuyenMaiCoVAT:f,DonGiaTruocVAT:"",
ThanhTienTruocVAT:"",ReturnOrderCode:T.ReturnOrderCode,ReturnOrderId:T.ReturnOrderId,ReturnQtySource:T.ReturnQtySource,LyDoBoDong:r?"INVOICE_QTY_ZERO":"MISSING_PRODUCT_CODE"})
;continue}const p=P(f/1.08,6),y=P(g*p,2);o.push({productCode:r,productName:s,unit:L(e,i),soldQty:h,returnQty:m,safeReturnQty:l,invoiceQty:g,priceInclVat:f,unitPriceBeforeVat:p,
lineAmountBeforeVat:y,returnOrderCode:T.ReturnOrderCode,returnOrderId:T.ReturnOrderId,returnQtySource:T.ReturnQtySource})}if(!o.length)continue;h+=1
;const T=P(o.reduce((e,n)=>e+n.lineAmountBeforeVat,0),2),m=P(T*H,2),l=Math.round(T+m);o.forEach((e,o)=>{const a=0===o;s.push({STT:a?h:"",NgayHoaDon:a?r:"",MaKhachHang:a?t.code:"",
TenKhachHang:a?t.name:"",TenNguoiMua:a?t.buyer:"",MaSoThue:a?t.taxCode:"",DiaChiKhachHang:a?t.address:"",DienThoaiKhachHang:a?t.phone:"",SoTaiKhoan:a?t.bankAccount:"",
NganHang:a?t.bankName:"",HinhThucTT:a?ie(n):"",MaSanPham:e.productCode,SanPham:e.productName,DonViTinh:e.unit,Extra1SP:"",Extra2SP:"",SoLuong:e.invoiceQty,
DonGia:e.unitPriceBeforeVat,TyLeChietKhauHienThi:"",SoTienChietKhau:"",ThanhTien:e.lineAmountBeforeVat,TienBan:a?T:"",ThueSuat:a?8:"",TienThueSanPham:"",TienThue:a?m:"",
TongCong:a?l:"",TinhChatHangHoa:0,DonViTienTe:a?"VND":"",TyGia:"",Fkey:a?G(n):"",Extra1:"",Extra2:"",EmailKhachHang:a?t.email:"",VungDuLieu:"",Extra3:"",Extra4:"",Extra5:"",
Extra6:"",Extra7:"",Extra8:"",Extra9:"",Extra10:"",Extra11:"",Extra12:"",LOONo:"",HDSe:"",xVTNXHan:"",NVChuan:"",PTChuyenKhoan:"",HDKTTu:"",CCCDan:""}),d.push({MaDon:G(n),
MaKhachHang:t.code,TenKhachHang:t.name,MaSoThue:t.taxCode,DiaChiHoaDon:t.address,MaSanPham:e.productCode,SanPham:e.productName,SoLuongBan:e.soldQty,SoLuongTra:e.returnQty,
SoLuongTraAnToan:e.safeReturnQty,SoLuongXuatHoaDon:e.invoiceQty,GiaSauKhuyenMaiCoVAT:e.priceInclVat,DonGiaTruocVAT:e.unitPriceBeforeVat,ThanhTienTruocVAT:e.lineAmountBeforeVat,
ReturnOrderCode:e.returnOrderCode,ReturnOrderId:e.returnOrderId,ReturnQtySource:e.returnQtySource,LyDoBoDong:""})})}return{rows:s,auditRows:d}}async function se(a={}){
const r=x(a.dateFrom||a.from||a.fromDate||"")||"0000-01-01",u=x(a.dateTo||a.to||a.toDate||"")||"9999-12-31",h={vatInvoiceRequired:{$ne:!1}};(r||u)&&(h.$or=[{orderDate:{...r?{$gte:r
}:{},...u?{$lte:u}:{}}},{date:{...r?{$gte:r}:{},...u?{$lte:u}:{}}},{documentDate:{...r?{$gte:r}:{},...u?{$lte:u}:{}}},{createdAt:{...r?{$gte:`${r}T00:00:00.000Z`}:{},...u?{
$lte:`${u}T23:59:59.999Z`}:{}}}]);const[T,m,l,g]=await Promise.all([i.find(h).sort({orderDate:1,date:1,code:1
}).limit(Math.min(Math.max(Number(a.limit||2e4),1),1e5)).lean(),c.find(z()).lean(),s.find({}).lean(),d.find({}).lean()]),{rows:f,auditRows:p}=ce({orders:T,returnOrders:m,
customers:l,products:g,query:a}),y=n(),S=[b,...f.map(e=>b.map(n=>e[n]??""))];o(y,"Sheet1",S,{autoFilter:!0})
;const C=["MaDon","MaKhachHang","TenKhachHang","MaSoThue","DiaChiHoaDon","MaSanPham","SanPham","SoLuongBan","SoLuongTra","SoLuongTraAnToan","SoLuongXuatHoaDon","GiaSauKhuyenMaiCoVAT","DonGiaTruocVAT","ThanhTienTruocVAT","ReturnOrderCode","ReturnOrderId","ReturnQtySource","LyDoBoDong"]
;o(y,"DoiChieu",[C,...p.map(e=>C.map(n=>e[n]??""))]);const N=f.reduce((e,n)=>(""!==n.TienBan&&(e.invoiceCount+=1,e.amountBeforeVat+=V(n.TienBan),e.vatAmount+=V(n.TienThue),
e.totalAmount+=V(n.TongCong)),e.lineCount+=n.MaSanPham?1:0,e),{invoiceCount:0,lineCount:0,amountBeforeVat:0,vatAmount:0,totalAmount:0})
;o(y,"ThongTin",[["Mẫu","TT78 - Sheet1"],["Từ ngày","0000-01-01"===r?"":r],["Đến ngày","9999-12-31"===u?"":u],["Số hóa đơn",N.invoiceCount],["Số dòng sản phẩm",N.lineCount],["Tiền bán trước thuế",P(N.amountBeforeVat,2)],["Tiền thuế 8%",P(N.vatAmount,2)],["Tổng cộng",Math.round(N.totalAmount)],["Quy tắc","Số lượng xuất HĐ = số lượng bán - số lượng trả; Đơn giá = giá sau khuyến mại trên đơn / 1.08"]])
;const D=t(y),M="0000-01-01"===r?"all":r,A="9999-12-31"===u?e.todayVN():u;return{buffer:D,rows:f.length,fileName:`HoaDonVAT_TT78_${M}_${A}.xlsx`}}function de(e={}){
return[k(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH),k(e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName)].filter(Boolean).join(" - ")
}function he(e={}){return k(e.orderSourceName||e.orderSource||e.source||e.sourceType||e.importSource||"")}async function Te(a={}){
const r=x(a.dateFrom||a.from||a.fromDate||"")||"0000-01-01",u=x(a.dateTo||a.to||a.toDate||"")||"9999-12-31",h={..."0000-01-01"!==r?{$gte:r}:{},..."9999-12-31"!==u?{$lte:u}:{}},T={
vatInvoiceRequired:!1,...Object.keys(h).length?{$or:[{orderDate:h},{date:h},{documentDate:h},{createdAt:{..."0000-01-01"!==r?{$gte:`${r}T00:00:00.000Z`}:{},..."9999-12-31"!==u?{
$lte:`${u}T23:59:59.999Z`}:{}}}]}:{}},[m,l,g,f]=await Promise.all([i.find(T).sort({orderDate:1,date:1,code:1
}).limit(Math.min(Math.max(Number(a.limit||2e4),1),1e5)).lean(),c.find(z()).lean(),s.find({}).lean(),d.find({}).lean()]),p=(m||[]).filter(R).filter(e=>!1===e.vatInvoiceRequired).filter(e=>B(e.orderDate||e.date||e.documentDate||e.createdAt,a)),y=ee(l),S=ae(g),C=re(f),N=[],D=[]
;let M=0,A=0,H=0;p.forEach((e,n)=>{const o=ue(e,S),t=G(e);let a=0,r=0;for(const n of Array.isArray(e.items)?e.items:[]){
const o=w(n),u=C.get(o)||{},i=Q(n),c=Math.min(i,oe(y,e,n)),s=Math.max(0,i-c),d=$(n)||(i?q(n)/i:0),h=P(s*d,2);a+=P(c*d,2),r+=h,D.push({"Mã đơn":t,"Mã sản phẩm":o,
"Tên sản phẩm":I(n)||k(u.name||u.productName),"Số lượng bán":i,"Số lượng trả":c,"Số lượng còn lại":s,"Đơn giá":d,"Thành tiền":h})}
const u=V(e.totalAmount||e.grandTotal||0),i=V(e.paidAmount||e.paymentAmount||0),c=V(e.debtAmount??Math.max(0,u-i));M+=u,A+=a,H+=r,N.push({STT:n+1,
"Ngày bán":x(e.orderDate||e.date||e.documentDate||e.createdAt),"Mã đơn":t,"Mã khách hàng":o.code,"Tên khách hàng":o.name,NVBH:de(e),"Nguồn đơn":he(e),"Giá trị đơn":u,
"Tiền đã thu":i,"Công nợ":c,"Lý do không xuất":k(e.vatInvoiceNote),"Người thay đổi":k(e.vatInvoiceUpdatedBy),"Thời gian thay đổi":k(e.vatInvoiceUpdatedAt)})});const K=n()
;pe(K,"DanhSachDon",["STT","Ngày bán","Mã đơn","Mã khách hàng","Tên khách hàng","NVBH","Nguồn đơn","Giá trị đơn","Tiền đã thu","Công nợ","Lý do không xuất","Người thay đổi","Thời gian thay đổi"],N),
pe(K,"ChiTietHang",["Mã đơn","Mã sản phẩm","Tên sản phẩm","Số lượng bán","Số lượng trả","Số lượng còn lại","Đơn giá","Thành tiền"],D),
o(K,"ThongTin",[["Từ ngày","0000-01-01"===r?"":r],["Đến ngày","9999-12-31"===u?"":u],["Số đơn không xuất hóa đơn",N.length],["Tổng giá trị đơn",P(M,2)],["Tổng hàng trả",P(A,2)],["Giá trị còn lại",P(H,2)]])
;const v=t(K),b="0000-01-01"===r?"all":r,O="9999-12-31"===u?e.todayVN():u,L=b===O?b:`${b}_${O}`;return{buffer:v,rows:N.length,fileName:`DanhSach_Don_Khong_Xuat_HoaDon_${L}.xlsx`}}
const me=["sales-report","delivery-report","return-report","debt-report","ar-ledger-detail","stock-report","inventory-movement-report","stock-card-report","fund-report","salesman-report","deliveryman-report","customer-sales-report","product-sales-report","product-info-report","customer-info-report","user-info-report"]
;function le(e={}){return{from:x(e.dateFrom||e.from||e.fromDate||""),to:x(e.dateTo||e.to||e.toDate||"")}}function ge(e={},n=["date","createdAt"]){const{from:o,to:t}=le(e)
;return o||t?{$or:n.map(e=>({[e]:{...o?{$gte:o}:{},...t?{$lte:"createdAt"===e?`${t}T23:59:59.999Z`:t}:{}}}))}:{}}function fe(e={}){
return Math.min(Math.max(Number(e.limit||1e5),1),2e5)}function pe(e,n,t,a){const r=a.map(e=>t.map(n=>e[n]??""));o(e,String(n||"BaoCao").slice(0,31),[t,...r])}function ye(e=""){
return{"stock-report":"Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.",
"inventory-movement-report":"Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.",
"stock-card-report":"Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.",
"sales-report":"Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.",
"return-report":"Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.","debt-report":"Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.",
"ar-ledger-detail":"Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.","fund-report":"Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.",
"delivery-report":"Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.",
"product-info-report":"Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.",
"customer-info-report":"Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán."
}[e]||"Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống."}async function Se(a,r,u,i,c={}){const s=n();pe(s,r,u,i);const{from:d,to:h}=le(c)
;o(s,"ThongTin",[["Mẫu báo cáo",r],["Từ ngày",d],["Đến ngày",h],["Số dòng",i.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc nghiệp vụ",ye(a)]])
;const T=String(a||"report").replace(/[^a-zA-Z0-9_-]/g,"-"),m=`${d||"all"}_${h||e.todayVN()}`;return{buffer:t(s),rows:i.length,fileName:`${T}_${m}.xlsx`}}function Ce(e={}){
return Array.isArray(e.items)?e.items:[]}function Ne(e={}){return Ce(e).reduce((e,n)=>e+Q(n),0)||V(e.totalQuantity||e.quantity||0)}function De(e={},n={}){
return V(e.originalPrice??e.basePrice??e.listPrice??n.salePrice??e.salePrice??e.price??e.unitPrice??0)}function Me(e={},n={}){return Q(e)*De(e,n)}function Ae(e={}){
return V(e.finalAmount??e.amount??e.totalAmount??e.lineAmount??0)||Q(e)*$(e)}function He(e={},n=new Map){
return Ce(e).reduce((e,o)=>e+Me(o,n.get(w(o))||{}),0)||V(e.beforePromoAmount||e.grossAmount||e.totalBeforeDiscount||e.totalAmount||0)}function Ke(e={}){
return V(e.afterPromoAmount||e.totalAfterPromotion||e.totalAmount||e.amount||0)}function ve(e={},n="sales"){return k("delivery"===n?f(e):l(e))}function be(e={},n="sales"){
return k("delivery"===n?g(e):m(e))}async function ke(){const e=await d.find({}).select("code name salePrice baseUnit unit brand category").lean()
;return new Map(e.map(e=>[k(e.code),e]))}async function Ve(e={}){const n=((await T.salesReport({...e,full:"1",export:"1"})).sales||[]).map((e,n)=>({STT:n+1,Ngay:e.date,
MaDon:e.code,Nguon:e.source,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,
SoLuongBan:e.saleQuantity,SoLuongKhuyenMai:e.promoQuantity,DoanhSoTruocKM:Math.round(V(e.beforePromoAmount)),DoanhSoThucTe:Math.round(V(e.actualAmount)),
ChietKhauKM:Math.round(V(e.promotionDiscountAmount)),GiaTriHangKM:Math.round(V(e.promotionValue)),DaThuTheoAR:Math.round(V(e.receiptAmount)),
TraHangTheoAR:Math.round(V(e.returnAmount)),DieuChinhCongNo:Math.round(V(e.adjustmentAmount)),ConNoTheoAR:Math.round(V(e.debtAmount)),TrangThaiGiaoHang:e.deliveryStatus,
TrangThaiKeToan:e.accountingStatus}));return Se("sales-report","BaoCaoBanHang",Object.keys(n[0]||{STT:"",Ngay:"",MaDon:"",Nguon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",
MaNVGH:"",NVGH:"",SoLuongBan:"",SoLuongKhuyenMai:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DieuChinhCongNo:"",
ConNoTheoAR:"",TrangThaiGiaoHang:"",TrangThaiKeToan:""}),n,e)}async function Pe(e={}){const n=((await T.deliveryReport({...e,full:"1",export:"1"})).delivery||[]).map((e,n)=>({
STT:n+1,NgayGiao:e.deliveryDate,MaDonTong:e.code,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoDonDangGan:e.assignedOrderCount,SoDonDaGiao:e.orderCount,
TongTienDonCon:Math.round(V(e.totalAmount)),DoanhSoDaXacNhan:Math.round(V(e.accountingConfirmedAmount)),TienThuTheoQuy:Math.round(V(e.collectedAmount)),TrangThai:e.status,
LechSoDonSnapshot:V(e.dataQuality?.snapshotOrderCountDifference),LechTienSnapshot:Math.round(V(e.dataQuality?.snapshotAmountDifference))}))
;return Se("delivery-report","BaoCaoGiaoHang",Object.keys(n[0]||{STT:"",NgayGiao:"",MaDonTong:"",MaNVGH:"",NVGH:"",SoDonDangGan:"",SoDonDaGiao:"",TongTienDonCon:"",
DoanhSoDaXacNhan:"",TienThuTheoQuy:"",TrangThai:"",LechSoDonSnapshot:"",LechTienSnapshot:""}),n,e)}async function xe(e={}){const n=((await T.returnReport({...e,full:"1",export:"1"
})).returns||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaTraHang:e.code,MaDon:e.salesOrderCode,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,
NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,GiaTriTra:Math.round(V(e.amount)),GiaTriChungTu:Math.round(V(e.documentAmount)),
GiaTriARReturn:Math.round(V(e.arAmount)),TrangThaiNhapKho:e.warehouseReceiveStatus,TrangThaiTraHang:e.returnState,TrangThaiKeToan:e.accountingStatus}))
;return Se("return-report","BaoCaoTraHang",Object.keys(n[0]||{STT:"",Ngay:"",MaTraHang:"",MaDon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",GiaTriTra:"",
GiaTriChungTu:"",GiaTriARReturn:"",TrangThaiNhapKho:"",TrangThaiTraHang:"",TrangThaiKeToan:""}),n,e)}async function Be(e={}){const n=((await T.periodDebtReport({...e,full:"1",
export:"1",includePaid:"1"})).debts||[]).map((e,n)=>({STT:n+1,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,DuDauKy:Math.round(V(e.openingBalance)),PhatSinhNo:Math.round(V(e.debitInPeriod)),DaThu:Math.round(V(e.receiptInPeriod)),
TraHang:Math.round(V(e.returnInPeriod)),ChietKhauDieuChinh:Math.round(V(e.adjustmentInPeriod)+V(e.otherCreditInPeriod)),TongPhatSinhCo:Math.round(V(e.totalCreditInPeriod)),
DuCuoiKy:Math.round(V(e.closingBalance))}));return Se("debt-report","BaoCaoCongNo",Object.keys(n[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",
DuDauKy:"",PhatSinhNo:"",DaThu:"",TraHang:"",ChietKhauDieuChinh:"",TongPhatSinhCo:"",DuCuoiKy:""}),n,e)}async function Re(e={}){const n=((await T.arLedgerDetailReport({...e,
full:"1",export:"1"})).ledger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaKhachHang:e.customerCode,KhachHang:e.customerName,ChungTu:e.documentCode,Loai:e.type,DienGiai:e.description,
DuTruocGiaoDich:Math.round(V(e.openingBalance)),No:Math.round(V(e.debit)),Co:Math.round(V(e.credit)),PhanLoaiCo:e.creditCategory,DuSauGiaoDich:Math.round(V(e.closingBalance))}))
;return Se("ar-ledger-detail","SoCongNoChiTiet",Object.keys(n[0]||{STT:"",Ngay:"",MaKhachHang:"",KhachHang:"",ChungTu:"",Loai:"",DienGiai:"",DuTruocGiaoDich:"",No:"",Co:"",
PhanLoaiCo:"",DuSauGiaoDich:""}),n,e)}async function Oe(e={}){const n=((await T.stockReport({...e,full:"1",export:"1"})).stock||[]).map((e,n)=>({STT:n+1,
MaSP:k(e.productCode||e.code||e.productId),SanPham:k(e.productName||e.name),DonViTinh:k(e.unit||e.baseUnit),TonVatLy:V(e.onHand??e.quantity??e.qty),DaGiuCho:V(e.reservedQty),
TonKhaDung:V(e.availableQty)}));return Se("stock-report","TonKhoHienTai",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonVatLy:"",DaGiuCho:"",TonKhaDung:""}),n,{})}
async function Ge(e={}){const n=((await T.inventoryMovementReport({...e,full:"1",export:"1",mode:"movement"})).stock||[]).map((e,n)=>({STT:n+1,MaSP:e.productCode,
SanPham:e.productName,DonViTinh:e.unit,TonDauKy:V(e.openingQty),NhapMua:V(e.importQty),HangTraNhapKho:V(e.returnQty),NhapKhac:V(e.otherInQty),TongNhap:V(e.inQty),
XuatBan:V(e.saleQty),XuatDaoChungTu:V(e.reversalOutQty),XuatKhac:V(e.otherOutQty),TongXuat:V(e.outQty),DieuChinhRong:V(e.adjustmentQty),TonCuoiKy:V(e.endingQty),
NguonTonCuoi:e.endingSource,TonCuoiTheoLedger:V(e.ledgerEndingQty),ChenhLechDoiSoat:V(e.reconciliationDifference)}))
;return Se("inventory-movement-report","NhapXuatTon",Object.keys(n[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonDauKy:"",NhapMua:"",HangTraNhapKho:"",NhapKhac:"",TongNhap:"",
XuatBan:"",XuatDaoChungTu:"",XuatKhac:"",TongXuat:"",DieuChinhRong:"",TonCuoiKy:"",NguonTonCuoi:"",TonCuoiTheoLedger:"",ChenhLechDoiSoat:""}),n,e)}async function we(e={}){
const n=((await T.stockCardReport({...e,full:"1",export:"1"})).transactions||[]).map((e,n)=>({STT:n+1,Ngay:e.date,MaSP:e.productCode,SanPham:e.productName,ChungTu:e.refCode,
Loai:e.type,PhanLoai:e.category,TonTruocGiaoDich:V(e.openingQty),Nhap:V(e.inQty),Xuat:V(e.outQty),TonSauGiaoDich:V(e.balanceQty),GhiChu:e.note}))
;return Se("stock-card-report","TheKho",Object.keys(n[0]||{STT:"",Ngay:"",MaSP:"",SanPham:"",ChungTu:"",Loai:"",PhanLoai:"",TonTruocGiaoDich:"",Nhap:"",Xuat:"",TonSauGiaoDich:"",
GhiChu:""}),n,e)}async function Ie(e={}){const n=((await T.financeReport({...e,full:"1",export:"1"})).fundLedger||[]).map((e,n)=>({STT:n+1,Ngay:e.date,ChungTu:e.code,Loai:e.type,
LoaiQuy:e.fundType,TaiKhoanQuy:e.account,NguoiLienQuan:e.counterparty,TonDauDong:Math.round(V(e.openingBalance)),Thu:Math.round(V(e.inAmount)),Chi:Math.round(V(e.outAmount)),
TonCuoiDong:Math.round(V(e.endingBalance)),GhiChu:e.note}));return Se("fund-report","BaoCaoQuyTien",Object.keys(n[0]||{STT:"",Ngay:"",ChungTu:"",Loai:"",LoaiQuy:"",TaiKhoanQuy:"",
NguoiLienQuan:"",TonDauDong:"",Thu:"",Chi:"",TonCuoiDong:"",GhiChu:""}),n,e)}async function Le(e={}){const n=((await T.salesReport({...e,full:"1",export:"1"
})).bySalesman||[]).map((e,n)=>({STT:n+1,MaNVBH:e.salesmanCode,NVBH:e.salesmanName,SoDon:e.orderCount,SoKhachHang:e.customerCount,DoanhSoTruocKM:Math.round(V(e.beforePromoAmount)),
DoanhSoThucTe:Math.round(V(e.actualAmount)),GiaTriHangKM:Math.round(V(e.promotionValue)),DaThuTheoAR:Math.round(V(e.receiptAmount)),TraHangTheoAR:Math.round(V(e.returnAmount)),
ConNoTheoAR:Math.round(V(e.debtAmount))}));return Se("salesman-report","BaoCaoNVBH",Object.keys(n[0]||{STT:"",MaNVBH:"",NVBH:"",SoDon:"",SoKhachHang:"",DoanhSoTruocKM:"",
DoanhSoThucTe:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",ConNoTheoAR:""}),n,e)}async function Qe(e={}){const n=((await T.deliveryReport({...e,full:"1",export:"1"
})).byStaff||[]).map((e,n)=>({STT:n+1,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoChuyen:e.tripCount,SoDonDaGiao:e.orderCount,TongTienDonCon:Math.round(V(e.totalAmount)),
DoanhSoDaXacNhan:Math.round(V(e.accountingConfirmedAmount)),ThuTienTheoQuy:Math.round(V(e.collectedAmount))}));return Se("deliveryman-report","BaoCaoNVGH",Object.keys(n[0]||{
STT:"",MaNVGH:"",NVGH:"",SoChuyen:"",SoDonDaGiao:"",TongTienDonCon:"",DoanhSoDaXacNhan:"",ThuTienTheoQuy:""}),n,e)}async function Ee(e={}){const n=await T.salesReport({...e,
full:"1",export:"1"}),o=await T.periodDebtReport({...e,full:"1",export:"1",includePaid:"1"}),t=new Map((o.debts||[]).map(e=>[k(e.customerCode||e.customerName),e])),a=new Map
;(n.sales||[]).forEach(e=>{const n=k(e.customerCode||e.customerName),o=a.get(n)||{MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
SoDon:0,DoanhSoTruocKM:0,DoanhSoThucTe:0,GiaTriHangKM:0,DaThuTheoAR:0,TraHangTheoAR:0};o.SoDon+=1,o.DoanhSoTruocKM+=V(e.beforePromoAmount),o.DoanhSoThucTe+=V(e.actualAmount),
o.GiaTriHangKM+=V(e.promotionValue),o.DaThuTheoAR+=V(e.receiptAmount),o.TraHangTheoAR+=V(e.returnAmount),a.set(n,o)});const r=Array.from(a.entries()).map(([e,n],o)=>{
const a=t.get(e)||{};return{STT:o+1,...n,DoanhSoTruocKM:Math.round(n.DoanhSoTruocKM),DoanhSoThucTe:Math.round(n.DoanhSoThucTe),GiaTriHangKM:Math.round(n.GiaTriHangKM),
DaThuTheoAR:Math.round(n.DaThuTheoAR),TraHangTheoAR:Math.round(n.TraHangTheoAR),DuDauKy:Math.round(V(a.openingBalance)),DuCuoiKy:Math.round(V(a.closingBalance))}})
;return Se("customer-sales-report","DoanhSoKhachHang",Object.keys(r[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",SoDon:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",
GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DuDauKy:"",DuCuoiKy:""}),r,e)}async function _e(e={}){const n=await T.salesReport({...e,full:"1",export:"1"}),o=new Map
;(n.sales||[]).forEach(e=>(e.items||[]).forEach(e=>{const n=k(e.productCode||e.productName),t=o.get(n)||{MaSP:e.productCode,SanPham:e.productName,NhanHang:e.brand,SoLuongBan:0,
DoanhSoTruocKM:0,DoanhSoThucTe:0};t.SoLuongBan+=V(e.quantity),t.DoanhSoTruocKM+=V(e.catalogAmount),t.DoanhSoThucTe+=V(e.actualAmount),o.set(n,t)}))
;const t=Array.from(o.values()).reduce((e,n)=>e+n.DoanhSoThucTe,0)||1,a=Array.from(o.values()).map((e,n)=>({STT:n+1,...e,SoLuongBan:e.SoLuongBan,
DoanhSoTruocKM:Math.round(e.DoanhSoTruocKM),DoanhSoThucTe:Math.round(e.DoanhSoThucTe),ChietKhauKM:Math.round(e.DoanhSoTruocKM-e.DoanhSoThucTe),
TyTrong:`${P(e.DoanhSoThucTe/t*100,2)}%`}));return Se("product-sales-report","DoanhSoSanPham",Object.keys(a[0]||{STT:"",MaSP:"",SanPham:"",NhanHang:"",SoLuongBan:"",
DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",TyTrong:""}),a,e)}
const $e=new Set(["password","passwordHash","hash","salt","token","tokens","accessToken","refreshToken","secret","apiKey","session","sessions","resetPasswordToken","verificationToken"])
;function qe(e={},n=[]){for(const o of n){const n=k(e[o]);if(n)return n}return""}function je(e){return!0===e?"Hoạt động":!1===e?"Ngưng hoạt động":k(e)}function Xe(e={},n=[],o=[]){
const t=new Set([...n,...o,"_id","__v","searchText"]),a={};return Object.keys(e||{}).forEach(n=>{if(t.has(n))return;const o=e[n];null!=o&&""!==o&&(a[n]=o)}),
Object.keys(a).length?JSON.stringify(a):""}function Fe(e={},n=0,o=new Map){const t=qe(e,["code","productCode","sku","id"]),a=o.get(k(t).toUpperCase())||{};return{STT:n+1,MaSP:t,
TenSP:qe(e,["name","productName","title"]),Barcode:qe(e,["barcode","barCode"]),NhanHang:qe(e,["brand","brandName"]),NganhHang:qe(e,["category","categoryName","groupName"]),
DonVi:qe(e,["unit","baseUnit","uom"]),DonViCoSo:qe(e,["baseUnit","unit"]),QuyDoi:V(e.conversionRate||e.ratio||1),QuyCach:qe(e,["packing","packaging"]),
GiaBan:Math.round(V(e.salePrice||e.price||e.sellPrice)),GiaVon:Math.round(V(e.costPrice||e.cost||e.purchasePrice)),TonVatLy:V(a.onHand??a.quantity??a.qty),
DaGiuCho:V(a.reservedQty),TonKhaDung:V(a.availableQty),KhuBocHang:S(p(y(e),C.HC)),TrangThai:je(e.isActive??e.status),NgayTao:x(e.createdAt),NgayCapNhat:x(e.updatedAt),
ThongTinKhac:Xe(e,["code","productCode","sku","name","productName","barcode","brand","category","unit","baseUnit","conversionRate","packing","salePrice","costPrice","pickingZone","warehouseCode","warehouseName","defaultWarehouse","isActive","status","createdAt","updatedAt"])
}}async function Ue(e={}){const[n,o]=await Promise.all([d.find({}).sort({code:1,name:1}).limit(fe(e)).lean(),T.stockReport({full:"1",export:"1"
})]),t=new Map((o.stock||o.items||[]).map(e=>[k(e.productCode||e.code).toUpperCase(),e])),a=n.map((e,n)=>Fe(e,n,t))
;return Se("product-info-report","ThongTinSanPham",Object.keys(a[0]||Fe({},-1,t)),a,e)}function Ze(e={}){return[e.customerCode,e.customerId,e.customerName].map(k).filter(Boolean)}
async function We(){const n=await T.periodDebtReport({dateFrom:"0000-01-01",dateTo:e.todayVN(),full:"1",export:"1",includePaid:"1"}),o=new Map
;return(n.debts||n.items||[]).forEach(e=>{const n=V(e.closingBalance);Ze(e).forEach(e=>o.set(e,n))}),o}async function ze(n={}){
const o=e.todayVN(),t=k(n.monthStart||n.monthFrom||`${o.slice(0,7)}-01`),a=k(n.monthEnd||n.monthTo||o),r=await T.salesReport({dateFrom:t,dateTo:a,full:"1",export:"1"}),u=new Map
;return(r.sales||r.items||[]).forEach(e=>{const n=V(e.actualAmount);[e.customerCode,e.customerId,e.customerName].map(k).filter(Boolean).forEach(e=>{u.set(e,V(u.get(e))+n)})}),u}
function Je(e,n=[]){for(const o of n.map(k).filter(Boolean))if(e.has(o))return V(e.get(o));return 0}function Ye(e={},n=0,o=new Map,t=new Map){
const a=K(e),r=v(e),u=[e.code,e.customerCode,e.id,e._id,e.name,e.customerName];return{STT:n+1,MaKH:qe(e,["code","customerCode","id"]),TenKH:qe(e,["name","customerName"]),
TenHoKinhDoanh:r.businessName,SDT:qe(e,["phone","mobile","customerPhone","tel"]),DiaChi:qe(e,["address","customerAddress","fullAddress"]),MaSoThue:a.taxCode,
DiaChiHoaDonThue:a.taxInvoiceAddress,Tuyen:qe(e,["route","routeName","line"]),KhuVuc:qe(e,["area","areaName","region","province"]),
MaNVBH:qe(e,["staffCode","salesStaffCode","salesmanCode"]),NVBHPhuTrach:qe(e,["staffName","salesStaffName","salesmanName"]),MaNVGH:qe(e,["deliveryStaffCode","shipperCode"]),
NVGHPhuTrach:qe(e,["deliveryStaffName","shipperName"]),CongNoHienTai:Math.round(Je(o,u)),DoanhSoThang:Math.round(Je(t,u)),TrangThai:je(e.isActive??e.status),NgayTao:x(e.createdAt),
NgayCapNhat:x(e.updatedAt),
ThongTinKhac:Xe(e,["code","customerCode","name","customerName","businessName","customerBusinessName","householdBusinessName","taxBusinessName","invoiceBusinessName","tenHoKinhDoanh","phone","mobile","customerPhone","address","customerAddress","taxCode","customerTaxCode","taxNumber","vatNumber","vatCode","mst","taxInvoiceAddress","customerTaxInvoiceAddress","invoiceAddress","vatInvoiceAddress","billingAddress","route","area","region","staffCode","staffName","salesStaffCode","salesStaffName","deliveryStaffCode","deliveryStaffName","isActive","status","createdAt","updatedAt"])
}}async function en(e={}){const[n,o,t]=await Promise.all([s.find({}).sort({code:1,name:1
}).limit(fe(e)).lean(),We(),ze(e)]),a=n.map((e,n)=>Ye(e,n,o,t)).sort((e,n)=>V(n.CongNoHienTai)-V(e.CongNoHienTai)||k(e.MaKH).localeCompare(k(n.MaKH)));return a.forEach((e,n)=>{
e.STT=n+1}),Se("customer-info-report","ThongTinKhachHang",Object.keys(a[0]||Ye({},-1)),a,e)}function nn(e={}){const n={};return Object.keys(e||{}).forEach(o=>{
if($e.has(o)||o.startsWith("_")||["__v","searchText"].includes(o))return
;if(["username","fullName","name","code","staffCode","role","roles","phone","email","isActive","status","permissions","area","route","lastLoginAt","lastLogin","createdAt","updatedAt"].includes(o))return
;const t=e[o];null!=t&&""!==t&&(n[o]=t)}),Object.keys(n).length?JSON.stringify(n):""}function on(e={},n=0){return{STT:n+1,TenDangNhap:qe(e,["username","loginName"]),
HoTen:qe(e,["fullName","name","displayName"]),MaNhanVien:qe(e,["staffCode","code","employeeCode"]),VaiTro:Array.isArray(e.roles)?e.roles.join(", "):qe(e,["role","roles"]),
SDT:qe(e,["phone","mobile"]),Email:qe(e,["email"]),TrangThai:je(e.isActive??e.status),
QuyenTruyCap:Array.isArray(e.permissions)?e.permissions.join(", "):k(e.permissions||e.permission||""),KhuVucTuyen:qe(e,["area","route","region"]),NgayTao:x(e.createdAt),
NgayCapNhat:x(e.updatedAt),LanDangNhapGanNhat:x(e.lastLoginAt||e.lastLogin||e.lastSeenAt),ThongTinKhac:nn(e)}}async function tn(e={}){
const n=h.users,o=(await n.find({}).select("-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken").sort({
role:1,code:1,username:1}).limit(fe(e)).lean()).map(on);return Se("user-info-report","ThongTinTaiKhoan",Object.keys(o[0]||on({},-1)),o,e)}const an={"sales-report":Ve,
"delivery-report":Pe,"return-report":xe,"debt-report":Be,"ar-ledger-detail":Re,"stock-report":Oe,"inventory-movement-report":Ge,"stock-card-report":we,"fund-report":Ie,
"salesman-report":Le,"deliveryman-report":Qe,"customer-sales-report":Ee,"product-sales-report":_e,"product-info-report":Ue,"customer-info-report":en,"user-info-report":tn}
;async function rn(e){return a.preview(e)}async function un(e){return a.commit(e)}async function cn(){return a.logs()}function sn(){return r.getBuiltInTemplates()}
async function dn(e){return r.buildBuiltInTemplateFile(e)}function hn(e){return r.getFields(e)}async function Tn(){return r.listCustomTemplates()}async function mn(e){
return r.saveCustomTemplate(e)}async function ln(e){return r.deleteCustomTemplate(e)}async function gn(e){return r.buildCustomTemplateFile(e)}function fn(){
return[...new Set([...u.getExportTypes(),"vatInvoiceTT78","vat-non-invoice-orders",...me])].sort()}async function pn(n,o={}){const t=String(n||"").trim()
;if(["vatInvoiceTT78","vat-invoice-tt78","hoa-don-vat-tt78"].includes(t))return se(o);if(["vat-non-invoice-orders","vatNonInvoiceOrders"].includes(t))return Te(o)
;if(an[t])return an[t](o);const a=await u.findForExport(n,o);if(!a)return{error:"Loại dữ liệu export không hợp lệ",status:400};const r=await A({type:n,rows:a
}),i=String(n||"data").replace(/[^a-zA-Z0-9_-]/g,"-");return{buffer:r,rows:a.length,fileName:`${i}-export-${e.todayVN()}.xlsx`}}module.exports={previewImport:rn,commitImport:un,
getImportLogs:cn,getBuiltInTemplates:sn,buildBuiltInTemplateFile:dn,getFields:hn,listCustomTemplates:Tn,saveCustomTemplate:mn,deleteCustomTemplate:ln,buildCustomTemplateFile:gn,
getExportTypes:fn,exportToExcel:pn};
