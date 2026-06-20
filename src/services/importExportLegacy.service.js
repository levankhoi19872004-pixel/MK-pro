/* GENERATED FILE — edit src/services/importExportLegacy.service.source/part-01.jsfrag, src/services/importExportLegacy.service.source/part-02.jsfrag, src/services/importExportLegacy.service.source/part-03.jsfrag and run npm run build:source-bundles. */
"use strict"
;const e=require("../utils/date.util"),{createWorkbook:o,appendAoaSheet:n,writeWorkbook:t}=require("../utils/excelWriter.util"),a=require("./excelImportService"),r=require("./importTemplateService"),u=require("../repositories/exportRepository"),i=require("../models/SalesOrder"),c=require("../models/ReturnOrder"),s=require("../models/Customer"),d=require("../models/Product"),h=require("./excel/ProductExcelEnrichmentService"),{INVOICE_TYPES:T,normalizeInvoiceType:m,resolveInvoiceType:l,isActiveInvoiceOrder:g}=require("./invoiceExportClassifier"),p=require("../models"),f=require("./reportService"),{pickSalesStaffCode:y,pickSalesStaffName:S,pickDeliveryStaffCode:C,pickDeliveryStaffName:N}=require("../domain/staff/staffIdentity"),{normalizePickingZone:D,pickingZoneFrom:M,pickingZoneLabel:A,PICKING_ZONES:H}=require("../utils/pickingZone.util"),v=require("./sseInvoiceExport.service"),K=require("./invoiceExportQuery.service")
;function b(e={}){const o={...e};return delete o._id,delete o.__v,o}function P(e){return null==e?"":Array.isArray(e)||"object"==typeof e?JSON.stringify(e):e}function k(e=[]){
const o=e.map(b),n=new Set;o.forEach(e=>Object.keys(e).forEach(e=>n.add(e)));const t=Array.from(n),a=o.map(e=>t.map(o=>P(e[o])));return{headers:t,body:a}}function V(e=""){
return"products"===w(e).toLowerCase()?["productCode","code","sku","barcode"]:h.PRODUCT_CODE_KEYS}async function x({type:e,rows:a}){const r=V(e),u=await h.enrichRows(a,{
productCodeKeys:r,packingKey:"Quy cách",salePriceKey:"Giá bán"}),{headers:i,body:c}=k(u.rows),s=o();n(s,"Export",[i,...c]);const d=h.documentProductLines(a);if(d.length){
const e=(await h.enrichRows(d,{packingKey:"Quy cách",salePriceKey:"Giá bán"})).rows.map(e=>({MaChungTu:e.documentCode,MaSP:$(e),SanPham:F(e),"Quy cách":e["Quy cách"],
"Giá bán":e["Giá bán"],SoLuong:U(e),GiaSauKM:Q(e.finalPrice??e.priceAfterPromotion??e.discountedPrice??""),ThanhTien:J(e)
})),o=["MaChungTu","MaSP","SanPham","Quy cách","Giá bán","SoLuong","GiaSauKM","ThanhTien"];n(s,"ChiTietSanPham",[o,...e.map(e=>o.map(o=>e[o]??""))])}
return n(s,"ThongTin",[["Loại dữ liệu",e],["Số dòng",a.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc sản phẩm","Nếu có sản phẩm: Quy cách là số lượng đóng gói; Giá bán lấy từ danh mục sản phẩm. Đơn con giữ thêm Giá sau KM."]]),
t(s)}
const G=.08,{extractCustomerTaxProfile:R}=require("../utils/customerTaxProfile.util"),{extractCustomerBusinessProfile:B}=require("../utils/customerBusinessProfile.util"),O=["STT","NgayHoaDon","MaKhachHang","TenKhachHang","TenNguoiMua","MaSoThue","DiaChiKhachHang","DienThoaiKhachHang","SoTaiKhoan","NganHang","HinhThucTT","MaSanPham","SanPham","DonViTinh","Extra1SP","Extra2SP","SoLuong","DonGia","TyLeChietKhauHienThi","SoTienChietKhau","ThanhTien","TienBan","ThueSuat","TienThueSanPham","TienThue","TongCong","TinhChatHangHoa","DonViTienTe","TyGia","Fkey","Extra1","Extra2","EmailKhachHang","VungDuLieu","Extra3","Extra4","Extra5","Extra6","Extra7","Extra8","Extra9","Extra10","Extra11","Extra12","LOONo","HDSe","xVTNXHan","NVChuan","PTChuyenKhoan","HDKTTu","CCCDan"]
;function w(e){return String(e??"").trim()}function Q(e,o=0){const n=Number(String(e??"").replace(/,/g,""));return Number.isFinite(n)?n:o}function I(e,o=2){const n=10**o
;return Math.round(Q(e)*n)/n}function E(o){return e.toDateOnly(o||"")||w(o).slice(0,10)}function L(e,o={}){
const n=E(e),t=E(o.dateFrom||o.from||o.fromDate||""),a=E(o.dateTo||o.to||o.toDate||"");return!(t&&n<t||a&&n>a)}function _(e={}){return g(e)}function q(e={}){
return[e.id,e._id,e.code,e.orderCode,e.documentCode,e.salesOrderId,e.salesOrderCode,e.externalOrderCode,e.invoiceCode,e.refCode].map(w).filter(Boolean)}function j(e={}){
return w(e.code||e.orderCode||e.salesOrderCode||e.documentCode||e.id||e._id)}function $(e={}){return w(e.productCode||e.code||e.sku||e.barcode||e.productId||e.id)}function F(e={}){
return w(e.productName||e.name||e.itemName||e.productTitle||"")}function X(e={},o={}){return w(e.unit||e.baseUnit||e.dvt||e.uom||o.unit||o.baseUnit||"")}function U(e={}){
return Q(e.quantity??e.qty??e.totalQty??e.qtySale??e.saleQty??0)}function Z(e={}){return Q(e.returnQty??e.qtyReturn??e.returnQuantity??e.returnedQty??0)}function W(e={}){
return w(e.lineKey||e.orderLineId||e.salesOrderItemId||e.itemId||e._id||"")}function z(e={}){
return Q(e.finalPrice??e.priceAfterPromotion??e.promoPrice??e.price??e.salePrice??e.unitPrice??e.sellPrice??0)}function J(e={}){
return Q(e.amount??e.totalAmount??e.lineAmount??e.money??0)||U(e)*z(e)}function Y(e,o){return`${w(e)}@@${w(o)}`}function ee(e={}){const o=z(e);return o?String(I(o,6)):""}
function oe(e,o,n="",t=""){return[w(e),w(o),w(n),w(t)].join("@@")}function ne(e={}){return w(e.code||e.id||e.returnOrderCode||e.documentCode||e._id)}function te(e={}){
return w(e.id||e._id||e.code||e.returnOrderCode||e.documentCode)}function ae(e={}){
const o=e.updatedAt||e.modifiedAt||e.createdAt||e.date||e.documentDate||"",n=o?new Date(o).getTime():0;return Number.isFinite(n)?n:0}function re(){return{status:{
$nin:["void","cancelled","canceled","deleted","removed"]},returnStatus:{$nin:["void","cancelled","canceled","deleted","removed"]}}}function ue(e,o,n,t={}){if(!o||!n)return
;e.set(o,Q(e.get(o))+n),e.__sourceMap||(e.__sourceMap=new Map);const a=e.__sourceMap.get(o)||{codes:new Set,ids:new Set,sourceRows:[]};t.code&&a.codes.add(t.code),
t.id&&a.ids.add(t.id),t.sourceRow&&a.sourceRows.push(t.sourceRow),e.__sourceMap.set(o,a)}function ie(e,o){const n=e&&e.__sourceMap;if(!n)return{ReturnOrderCode:"",ReturnOrderId:"",
ReturnQtySource:""};const t=n.get(o);if(!t)return{ReturnOrderCode:"",ReturnOrderId:"",ReturnQtySource:""}
;const a=Array.from(t.codes||[]).filter(Boolean),r=Array.from(t.ids||[]).filter(Boolean),u=Array.from(t.sourceRows||[]).filter(Boolean);return{ReturnOrderCode:a.join(", "),
ReturnOrderId:r.join(", "),ReturnQtySource:u.join(" | ")}}function ce(e=[]){const o=new Map,n=new Map;for(const o of e||[]){if(!_(o))continue
;const e=ne(o),t=te(o),a=ae(o),r=Array.from(new Set([o.salesOrderId,o.orderId,o.sourceOrderId,o.deliveryOrderId,o.salesOrderCode,o.orderCode,o.sourceOrderCode,o.deliveryOrderCode,o.originalOrderCode].map(w).filter(Boolean)))
;if(!r.length)continue;const u=w(o.salesOrderCode||o.orderCode||o.salesOrderId||o.orderId||r[0]);for(const i of Array.isArray(o.items)?o.items:[]){const o=$(i);if(!o)continue
;const c=Z(i);if(!c)continue;const s=W(i),d=ee(i),h=`${e||t||"RETURN_ORDER"}:${u}:${o}:${c}`,T=[e||t,u,o,s||"",d||""].map(w).join("@@"),m={roKeys:r,pcode:o,qty:c,lineKey:s,
priceKey:d,roCode:e,roId:t,updatedMs:a,sourceRow:h},l=n.get(T);(!l||a>=l.updatedMs)&&n.set(T,m)}}for(const e of n.values()){
const{roKeys:n,pcode:t,qty:a,lineKey:r,priceKey:u,roCode:i,roId:c,sourceRow:s}=e,d={code:i,id:c,sourceRow:s}
;for(const e of n)ue(o,r&&u?oe(e,t,r,u):r?oe(e,t,r,""):u?oe(e,t,"",u):Y(e,t),a,d)}return o}function se(e,o={},n={}){const t=$(n);if(!t)return{qty:0,ReturnOrderCode:"",
ReturnOrderId:"",ReturnQtySource:""};const a=W(n),r=ee(n);let u={qty:0,key:""};for(const n of q(o)){
const o=[a&&r?oe(n,t,a,r):"",a?oe(n,t,a,""):"",r?oe(n,t,"",r):"",Y(n,t)].filter(Boolean);for(const n of o){const o=Q(e.get(n));if(o>u.qty&&(u={qty:o,key:n}),o)break}}return{
qty:u.qty,...ie(e,u.key)}}function de(e,o={},n={}){return se(e,o,n).qty}function he(e={}){return w(e.customerCode||e.customerId||e.customerName||e.customerPhone||"")}
function Te(e=[]){const o=new Map;for(const n of e||[])[n.code,n.customerCode,n.id,n._id,n.name,n.customerName,n.phone,n.mobile].map(w).filter(Boolean).forEach(e=>o.set(e,n))
;return o}function me(e=[]){const o=new Map;for(const n of e||[])[n.code,n.productCode,n.sku,n.barcode,n.id,n._id].map(w).filter(Boolean).forEach(e=>o.set(e,n));return o}
function le(e={},o=new Map){
const n=o.get(w(e.customerCode))||o.get(w(e.customerId))||o.get(w(e.customerName))||{},t=R(e),a=R(n),r=B(e),u=B(n),i=w(e.customerName||n.name||n.customerName),c=w(r.businessName||u.businessName)
;return{code:w(e.customerCode||n.code||n.customerCode||e.customerId||n.id),name:c||i,buyer:w(e.buyerName||e.contactName||n.buyerName||n.representative||n.contactName||i),
taxCode:w(t.taxCode||a.taxCode),address:w(t.taxInvoiceAddress||a.taxInvoiceAddress||e.customerAddress||e.address||n.address||n.deliveryAddress),
phone:w(e.customerPhone||e.phone||n.phone||n.mobile),bankAccount:w(n.bankAccount||n.accountNumber||e.bankAccount),bankName:w(n.bankName||e.bankName),
email:w(n.email||e.customerEmail||e.email)}}function ge(e={}){const o=w(e.paymentMethod||e.paymentType||e.method||e.hinhThucTT||"");if(o)return o
;const n=Q(e.cashAmount||e.collectedCashAmount),t=Q(e.bankAmount||e.transferAmount||e.collectedBankAmount);return n&&t?"TM/CK":t?"CK":"TM/CK"}
function pe({orders:o,returnOrders:n,customers:t,products:a,query:r={}}){const u=ce(n),i=Te(t),c=me(a),s=[],d=[];let m=0
;const g=(o||[]).filter(_).filter(e=>l(e)===T.VAT).filter(e=>K.matchesInvoiceExportFilters(e,r,{invoiceGroup:T.VAT})).filter(e=>{if(!r.customerCode&&!r.customerId)return!0
;const o=w(r.customerCode||r.customerId);return[e.customerCode,e.customerId,e.customerName].map(w).includes(o)
}).sort((e,o)=>w(e.orderDate||e.date||e.documentDate||e.createdAt).localeCompare(w(o.orderDate||o.date||o.documentDate||o.createdAt))||j(e).localeCompare(j(o)));for(const o of g){
const n=[],t=le(o,i),a=j(o),r=E(o.orderDate||o.date||o.documentDate||o.createdAt||e.todayVN());for(const e of Array.isArray(o.items)?o.items:[]){
const r=$(e),i=c.get(r)||{},s=F(e)||w(i.name||i.productName),T=U(e),m=se(u,o,e),l=m.qty,g=Math.min(T,l),p=Math.max(0,T-g),f=z(e)||(T?J(e)/T:0);if(!r||p<=0){d.push({MaDon:a,
MaKhachHang:t.code,TenKhachHang:t.name,MaSanPham:r,SanPham:s,"Quy cách":h.catalogPackingQty(i),"Giá bán":h.catalogSalePrice(i),SoLuongBan:T,SoLuongTra:l,SoLuongTraAnToan:g,
SoLuongXuatHoaDon:p,GiaSauKhuyenMaiCoVAT:f,DonGiaTruocVAT:"",ThanhTienTruocVAT:"",ReturnOrderCode:m.ReturnOrderCode,ReturnOrderId:m.ReturnOrderId,ReturnQtySource:m.ReturnQtySource,
LyDoBoDong:r?"INVOICE_QTY_ZERO":"MISSING_PRODUCT_CODE"});continue}const y=I(f/1.08,6),S=I(p*y,2);n.push({productCode:r,productName:s,unit:X(e,i),
catalogPackingQty:h.catalogPackingQty(i),catalogSalePrice:h.catalogSalePrice(i),soldQty:T,returnQty:l,safeReturnQty:g,invoiceQty:p,priceInclVat:f,unitPriceBeforeVat:y,
lineAmountBeforeVat:S,returnOrderCode:m.ReturnOrderCode,returnOrderId:m.ReturnOrderId,returnQtySource:m.ReturnQtySource})}if(!n.length)continue;m+=1
;const T=I(n.reduce((e,o)=>e+o.lineAmountBeforeVat,0),2),l=I(T*G,2),g=Math.round(T+l);n.forEach((e,n)=>{const a=0===n;s.push({STT:a?m:"",NgayHoaDon:a?r:"",MaKhachHang:a?t.code:"",
TenKhachHang:a?t.name:"",TenNguoiMua:a?t.buyer:"",MaSoThue:a?t.taxCode:"",DiaChiKhachHang:a?t.address:"",DienThoaiKhachHang:a?t.phone:"",SoTaiKhoan:a?t.bankAccount:"",
NganHang:a?t.bankName:"",HinhThucTT:a?ge(o):"",MaSanPham:e.productCode,SanPham:e.productName,DonViTinh:e.unit,Extra1SP:e.catalogPackingQty,Extra2SP:e.catalogSalePrice,
SoLuong:e.invoiceQty,DonGia:e.unitPriceBeforeVat,TyLeChietKhauHienThi:"",SoTienChietKhau:"",ThanhTien:e.lineAmountBeforeVat,TienBan:a?T:"",ThueSuat:a?8:"",TienThueSanPham:"",
TienThue:a?l:"",TongCong:a?g:"",TinhChatHangHoa:0,DonViTienTe:a?"VND":"",TyGia:"",Fkey:a?j(o):"",Extra1:"",Extra2:"",EmailKhachHang:a?t.email:"",VungDuLieu:"",Extra3:"",Extra4:"",
Extra5:"",Extra6:"",Extra7:"",Extra8:"",Extra9:"",Extra10:"",Extra11:"",Extra12:"",LOONo:"",HDSe:"",xVTNXHan:"",NVChuan:"",PTChuyenKhoan:"",HDKTTu:"",CCCDan:""}),d.push({
MaDon:j(o),MaKhachHang:t.code,TenKhachHang:t.name,MaSoThue:t.taxCode,DiaChiHoaDon:t.address,MaSanPham:e.productCode,SanPham:e.productName,"Quy cách":e.catalogPackingQty,
"Giá bán":e.catalogSalePrice,SoLuongBan:e.soldQty,SoLuongTra:e.returnQty,SoLuongTraAnToan:e.safeReturnQty,SoLuongXuatHoaDon:e.invoiceQty,GiaSauKhuyenMaiCoVAT:e.priceInclVat,
DonGiaTruocVAT:e.unitPriceBeforeVat,ThanhTienTruocVAT:e.lineAmountBeforeVat,ReturnOrderCode:e.returnOrderCode,ReturnOrderId:e.returnOrderId,ReturnQtySource:e.returnQtySource,
LyDoBoDong:""})})}return{rows:s,auditRows:d}}async function fe(a={},r={}){const u=K.normalizeExportQuery(a,{invoiceGroup:T.VAT
}),i=u.dateFrom||"0000-01-01",c=u.dateTo||"9999-12-31",{orders:s,returnOrders:d,customers:h,products:m}=await K.loadInvoiceExportData({query:a,invoiceGroup:T.VAT,currentUser:r
}),{rows:l,auditRows:g}=pe({orders:s,returnOrders:d,customers:h,products:m,query:a}),p=o(),f=[O,...l.map(e=>O.map(o=>e[o]??""))];n(p,"Sheet1",f,{autoFilter:!0})
;const y=["MaDon","MaKhachHang","TenKhachHang","MaSoThue","DiaChiHoaDon","MaSanPham","SanPham","Quy cách","Giá bán","SoLuongBan","SoLuongTra","SoLuongTraAnToan","SoLuongXuatHoaDon","GiaSauKhuyenMaiCoVAT","DonGiaTruocVAT","ThanhTienTruocVAT","ReturnOrderCode","ReturnOrderId","ReturnQtySource","LyDoBoDong"]
;n(p,"DoiChieu",[y,...g.map(e=>y.map(o=>e[o]??""))]);const S=l.reduce((e,o)=>(""!==o.TienBan&&(e.invoiceCount+=1,e.amountBeforeVat+=Q(o.TienBan),e.vatAmount+=Q(o.TienThue),
e.totalAmount+=Q(o.TongCong)),e.lineCount+=o.MaSanPham?1:0,e),{invoiceCount:0,lineCount:0,amountBeforeVat:0,vatAmount:0,totalAmount:0})
;n(p,"ThongTin",[["Mẫu","TT78 - Sheet1"],["Từ ngày","0000-01-01"===i?"":i],["Đến ngày","9999-12-31"===c?"":c],["Số hóa đơn",S.invoiceCount],["Số dòng sản phẩm",S.lineCount],["Tiền bán trước thuế",I(S.amountBeforeVat,2)],["Tiền thuế 8%",I(S.vatAmount,2)],["Tổng cộng",Math.round(S.totalAmount)],["Quy tắc","Số lượng xuất HĐ = số lượng bán - số lượng trả; Đơn giá = giá sau khuyến mại trên đơn / 1.08"]])
;const C=t(p),N="0000-01-01"===i?"all":i,D="9999-12-31"===c?e.todayVN():c;return{buffer:C,rows:l.length,orderCount:S.invoiceCount,fileName:`Hoa_don_VAT_TT78_${N}_${D}.xlsx`}}
function ye(e={}){
return[w(e.salesStaffCode||e.salesPersonCode||e.salesmanCode||e.nvbhCode||e.maNVBH),w(e.salesStaffName||e.salesPersonName||e.salesmanName||e.nvbhName||e.maNVBHName)].filter(Boolean).join(" - ")
}function Se(e={}){return w(e.orderSourceName||e.orderSource||e.source||e.sourceType||e.importSource||"")}async function Ce(a={},r={}){const u=K.normalizeExportQuery(a,{
invoiceGroup:T.NON_VAT}),i=u.dateFrom||"0000-01-01",c=u.dateTo||"9999-12-31",{orders:s,returnOrders:d,customers:m,products:g}=await K.loadInvoiceExportData({query:a,
invoiceGroup:T.NON_VAT,currentUser:r}),p=(s||[]).filter(_).filter(e=>l(e)===T.NON_VAT).filter(e=>K.matchesInvoiceExportFilters(e,a,{invoiceGroup:T.NON_VAT
})),f=ce(d),y=Te(m),S=me(g),C=[],N=[];let D=0,M=0,A=0;p.forEach((e,o)=>{const n=le(e,y),t=j(e);let a=0,r=0;for(const o of Array.isArray(e.items)?e.items:[]){
const n=$(o),u=S.get(n)||{},i=U(o),c=Math.min(i,de(f,e,o)),s=Math.max(0,i-c),d=z(o)||(i?J(o)/i:0),T=I(s*d,2);a+=I(c*d,2),r+=T,N.push({"Mã đơn":t,"Mã sản phẩm":n,
"Tên sản phẩm":F(o)||w(u.name||u.productName),"Quy cách":h.catalogPackingQty(u),"Giá bán":h.catalogSalePrice(u),"Số lượng bán":i,"Số lượng trả":c,"Số lượng còn lại":s,"Đơn giá":d,
"Thành tiền":T})}const u=Q(e.totalAmount||e.grandTotal||0),i=Q(e.paidAmount||e.paymentAmount||0),c=Q(e.debtAmount??Math.max(0,u-i));D+=u,M+=a,A+=r,C.push({STT:o+1,
"Ngày bán":E(e.orderDate||e.date||e.documentDate||e.createdAt),"Mã đơn":t,"Mã khách hàng":n.code,"Tên khách hàng":n.name,NVBH:ye(e),"Nguồn đơn":Se(e),"Giá trị đơn":u,
"Tiền đã thu":i,"Công nợ":c,"Lý do không xuất":w(e.vatInvoiceNote),"Người thay đổi":w(e.vatInvoiceUpdatedBy),"Thời gian thay đổi":w(e.vatInvoiceUpdatedAt)})});const H=o()
;He(H,"DanhSachDon",["STT","Ngày bán","Mã đơn","Mã khách hàng","Tên khách hàng","NVBH","Nguồn đơn","Giá trị đơn","Tiền đã thu","Công nợ","Lý do không xuất","Người thay đổi","Thời gian thay đổi"],C),
He(H,"ChiTietHang",["Mã đơn","Mã sản phẩm","Tên sản phẩm","Quy cách","Giá bán","Số lượng bán","Số lượng trả","Số lượng còn lại","Đơn giá","Thành tiền"],N),
n(H,"ThongTin",[["Từ ngày","0000-01-01"===i?"":i],["Đến ngày","9999-12-31"===c?"":c],["Số đơn không xuất hóa đơn",C.length],["Tổng giá trị đơn",I(D,2)],["Tổng hàng trả",I(M,2)],["Giá trị còn lại",I(A,2)]])
;const v=t(H),b="0000-01-01"===i?"all":i,P="9999-12-31"===c?e.todayVN():c,k=b===P?b:`${b}_${P}`;return{buffer:v,rows:N.filter(e=>Number(e["Số lượng còn lại"])>0).length,
orderCount:C.length,fileName:`Hoa_don_khong_VAT_${k}.xlsx`}}
const Ne=["sales-report","delivery-report","return-report","debt-report","ar-ledger-detail","stock-report","inventory-movement-report","stock-card-report","fund-report","salesman-report","deliveryman-report","customer-sales-report","product-sales-report","product-info-report","customer-info-report","user-info-report"]
;function De(e={}){return{from:E(e.dateFrom||e.from||e.fromDate||""),to:E(e.dateTo||e.to||e.toDate||"")}}function Me(e={},o=["date","createdAt"]){const{from:n,to:t}=De(e)
;return n||t?{$or:o.map(e=>({[e]:{...n?{$gte:n}:{},...t?{$lte:"createdAt"===e?`${t}T23:59:59.999Z`:t}:{}}}))}:{}}function Ae(e={}){
return Math.min(Math.max(Number(e.limit||1e5),1),2e5)}function He(e,o,t,a){const r=a.map(e=>t.map(o=>e[o]??""));n(e,String(o||"BaoCao").slice(0,31),[t,...r])}function ve(e=""){
return{"stock-report":"Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.",
"inventory-movement-report":"Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.",
"stock-card-report":"Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.",
"sales-report":"Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.",
"return-report":"Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.","debt-report":"Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.",
"ar-ledger-detail":"Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.","fund-report":"Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.",
"delivery-report":"Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.",
"product-info-report":"Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.",
"customer-info-report":"Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán."
}[e]||"Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống."}async function Ke(a,r,u,i,c={}){const s=await h.enrichRows(i,{packingKey:"Quy cách",salePriceKey:"Giá bán"
}),d=[...u];s.hasProducts&&(d.includes("Quy cách")||d.push("Quy cách"),d.includes("Giá bán")||d.push("Giá bán"));const T=o();He(T,r,d,s.rows);const{from:m,to:l}=De(c)
;n(T,"ThongTin",[["Mẫu báo cáo",r],["Từ ngày",m],["Đến ngày",l],["Số dòng",s.rows.length],["Thời gian xuất",(new Date).toISOString()],["Quy tắc nghiệp vụ",ve(a)]])
;const g=String(a||"report").replace(/[^a-zA-Z0-9_-]/g,"-"),p=`${m||"all"}_${l||e.todayVN()}`;return{buffer:t(T),rows:s.rows.length,fileName:`${g}_${p}.xlsx`}}function be(e={}){
return Array.isArray(e.items)?e.items:[]}function Pe(e={}){return be(e).reduce((e,o)=>e+U(o),0)||Q(e.totalQuantity||e.quantity||0)}function ke(e={},o={}){
return Q(e.originalPrice??e.basePrice??e.listPrice??o.salePrice??e.salePrice??e.price??e.unitPrice??0)}function Ve(e={},o={}){return U(e)*ke(e,o)}function xe(e={}){
return Q(e.finalAmount??e.amount??e.totalAmount??e.lineAmount??0)||U(e)*z(e)}function Ge(e={},o=new Map){
return be(e).reduce((e,n)=>e+Ve(n,o.get($(n))||{}),0)||Q(e.beforePromoAmount||e.grossAmount||e.totalBeforeDiscount||e.totalAmount||0)}function Re(e={}){
return Q(e.afterPromoAmount||e.totalAfterPromotion||e.totalAmount||e.amount||0)}function Be(e={},o="sales"){return w("delivery"===o?N(e):S(e))}function Oe(e={},o="sales"){
return w("delivery"===o?C(e):y(e))}async function we(){const e=await d.find({}).select("code name salePrice conversionRate baseUnit unit brand category").lean()
;return new Map(e.map(e=>[w(e.code),e]))}async function Qe(e={}){const o=((await f.salesReport({...e,full:"1",export:"1"})).sales||[]).map((e,o)=>({STT:o+1,Ngay:e.date,
MaDon:e.code,Nguon:e.source,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,
SoLuongBan:e.saleQuantity,SoLuongKhuyenMai:e.promoQuantity,DoanhSoTruocKM:Math.round(Q(e.beforePromoAmount)),DoanhSoThucTe:Math.round(Q(e.actualAmount)),
ChietKhauKM:Math.round(Q(e.promotionDiscountAmount)),GiaTriHangKM:Math.round(Q(e.promotionValue)),DaThuTheoAR:Math.round(Q(e.receiptAmount)),
TraHangTheoAR:Math.round(Q(e.returnAmount)),DieuChinhCongNo:Math.round(Q(e.adjustmentAmount)),ConNoTheoAR:Math.round(Q(e.debtAmount)),TrangThaiGiaoHang:e.deliveryStatus,
TrangThaiKeToan:e.accountingStatus}));return Ke("sales-report","BaoCaoBanHang",Object.keys(o[0]||{STT:"",Ngay:"",MaDon:"",Nguon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",
MaNVGH:"",NVGH:"",SoLuongBan:"",SoLuongKhuyenMai:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DieuChinhCongNo:"",
ConNoTheoAR:"",TrangThaiGiaoHang:"",TrangThaiKeToan:""}),o,e)}async function Ie(e={}){const o=((await f.deliveryReport({...e,full:"1",export:"1"})).delivery||[]).map((e,o)=>({
STT:o+1,NgayGiao:e.deliveryDate,MaDonTong:e.code,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoDonDangGan:e.assignedOrderCount,SoDonDaGiao:e.orderCount,
TongTienDonCon:Math.round(Q(e.totalAmount)),DoanhSoDaXacNhan:Math.round(Q(e.accountingConfirmedAmount)),TienThuTheoQuy:Math.round(Q(e.collectedAmount)),TrangThai:e.status,
LechSoDonSnapshot:Q(e.dataQuality?.snapshotOrderCountDifference),LechTienSnapshot:Math.round(Q(e.dataQuality?.snapshotAmountDifference))}))
;return Ke("delivery-report","BaoCaoGiaoHang",Object.keys(o[0]||{STT:"",NgayGiao:"",MaDonTong:"",MaNVGH:"",NVGH:"",SoDonDangGan:"",SoDonDaGiao:"",TongTienDonCon:"",
DoanhSoDaXacNhan:"",TienThuTheoQuy:"",TrangThai:"",LechSoDonSnapshot:"",LechTienSnapshot:""}),o,e)}async function Ee(e={}){const o=((await f.returnReport({...e,full:"1",export:"1"
})).returns||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaTraHang:e.code,MaDon:e.salesOrderCode,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,
NVBH:e.salesStaffName,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,GiaTriTra:Math.round(Q(e.amount)),GiaTriChungTu:Math.round(Q(e.documentAmount)),
GiaTriARReturn:Math.round(Q(e.arAmount)),TrangThaiNhapKho:e.warehouseReceiveStatus,TrangThaiTraHang:e.returnState,TrangThaiKeToan:e.accountingStatus}))
;return Ke("return-report","BaoCaoTraHang",Object.keys(o[0]||{STT:"",Ngay:"",MaTraHang:"",MaDon:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",GiaTriTra:"",
GiaTriChungTu:"",GiaTriARReturn:"",TrangThaiNhapKho:"",TrangThaiTraHang:"",TrangThaiKeToan:""}),o,e)}async function Le(e={}){const o=((await f.periodDebtReport({...e,full:"1",
export:"1",includePaid:"1"})).debts||[]).map((e,o)=>({STT:o+1,MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,DuDauKy:Math.round(Q(e.openingBalance)),PhatSinhNo:Math.round(Q(e.debitInPeriod)),DaThu:Math.round(Q(e.receiptInPeriod)),
TraHang:Math.round(Q(e.returnInPeriod)),ChietKhauDieuChinh:Math.round(Q(e.adjustmentInPeriod)+Q(e.otherCreditInPeriod)),TongPhatSinhCo:Math.round(Q(e.totalCreditInPeriod)),
DuCuoiKy:Math.round(Q(e.closingBalance))}));return Ke("debt-report","BaoCaoCongNo",Object.keys(o[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",MaNVGH:"",NVGH:"",
DuDauKy:"",PhatSinhNo:"",DaThu:"",TraHang:"",ChietKhauDieuChinh:"",TongPhatSinhCo:"",DuCuoiKy:""}),o,e)}async function _e(e={}){const o=((await f.arLedgerDetailReport({...e,
full:"1",export:"1"})).ledger||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaKhachHang:e.customerCode,KhachHang:e.customerName,ChungTu:e.documentCode,Loai:e.type,DienGiai:e.description,
DuTruocGiaoDich:Math.round(Q(e.openingBalance)),No:Math.round(Q(e.debit)),Co:Math.round(Q(e.credit)),PhanLoaiCo:e.creditCategory,DuSauGiaoDich:Math.round(Q(e.closingBalance))}))
;return Ke("ar-ledger-detail","SoCongNoChiTiet",Object.keys(o[0]||{STT:"",Ngay:"",MaKhachHang:"",KhachHang:"",ChungTu:"",Loai:"",DienGiai:"",DuTruocGiaoDich:"",No:"",Co:"",
PhanLoaiCo:"",DuSauGiaoDich:""}),o,e)}async function qe(e={}){const o=((await f.stockReport({...e,full:"1",export:"1"})).stock||[]).map((e,o)=>({STT:o+1,
MaSP:w(e.productCode||e.code||e.productId),SanPham:w(e.productName||e.name),DonViTinh:w(e.unit||e.baseUnit),TonVatLy:Q(e.onHand??e.quantity??e.qty),DaGiuCho:Q(e.reservedQty),
TonKhaDung:Q(e.availableQty)}));return Ke("stock-report","TonKhoHienTai",Object.keys(o[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonVatLy:"",DaGiuCho:"",TonKhaDung:""}),o,{})}
async function je(e={}){const o=((await f.inventoryMovementReport({...e,full:"1",export:"1",mode:"movement"})).stock||[]).map((e,o)=>({STT:o+1,MaSP:e.productCode,
SanPham:e.productName,DonViTinh:e.unit,TonDauKy:Q(e.openingQty),NhapMua:Q(e.importQty),HangTraNhapKho:Q(e.returnQty),NhapKhac:Q(e.otherInQty),TongNhap:Q(e.inQty),
XuatBan:Q(e.saleQty),XuatDaoChungTu:Q(e.reversalOutQty),XuatKhac:Q(e.otherOutQty),TongXuat:Q(e.outQty),DieuChinhRong:Q(e.adjustmentQty),TonCuoiKy:Q(e.endingQty),
NguonTonCuoi:e.endingSource,TonCuoiTheoLedger:Q(e.ledgerEndingQty),ChenhLechDoiSoat:Q(e.reconciliationDifference)}))
;return Ke("inventory-movement-report","NhapXuatTon",Object.keys(o[0]||{STT:"",MaSP:"",SanPham:"",DonViTinh:"",TonDauKy:"",NhapMua:"",HangTraNhapKho:"",NhapKhac:"",TongNhap:"",
XuatBan:"",XuatDaoChungTu:"",XuatKhac:"",TongXuat:"",DieuChinhRong:"",TonCuoiKy:"",NguonTonCuoi:"",TonCuoiTheoLedger:"",ChenhLechDoiSoat:""}),o,e)}async function $e(e={}){
const o=((await f.stockCardReport({...e,full:"1",export:"1"})).transactions||[]).map((e,o)=>({STT:o+1,Ngay:e.date,MaSP:e.productCode,SanPham:e.productName,ChungTu:e.refCode,
Loai:e.type,PhanLoai:e.category,TonTruocGiaoDich:Q(e.openingQty),Nhap:Q(e.inQty),Xuat:Q(e.outQty),TonSauGiaoDich:Q(e.balanceQty),GhiChu:e.note}))
;return Ke("stock-card-report","TheKho",Object.keys(o[0]||{STT:"",Ngay:"",MaSP:"",SanPham:"",ChungTu:"",Loai:"",PhanLoai:"",TonTruocGiaoDich:"",Nhap:"",Xuat:"",TonSauGiaoDich:"",
GhiChu:""}),o,e)}async function Fe(e={}){const o=((await f.financeReport({...e,full:"1",export:"1"})).fundLedger||[]).map((e,o)=>({STT:o+1,Ngay:e.date,ChungTu:e.code,Loai:e.type,
LoaiQuy:e.fundType,TaiKhoanQuy:e.account,NguoiLienQuan:e.counterparty,TonDauDong:Math.round(Q(e.openingBalance)),Thu:Math.round(Q(e.inAmount)),Chi:Math.round(Q(e.outAmount)),
TonCuoiDong:Math.round(Q(e.endingBalance)),GhiChu:e.note}));return Ke("fund-report","BaoCaoQuyTien",Object.keys(o[0]||{STT:"",Ngay:"",ChungTu:"",Loai:"",LoaiQuy:"",TaiKhoanQuy:"",
NguoiLienQuan:"",TonDauDong:"",Thu:"",Chi:"",TonCuoiDong:"",GhiChu:""}),o,e)}async function Xe(e={}){const o=((await f.salesReport({...e,full:"1",export:"1"
})).bySalesman||[]).map((e,o)=>({STT:o+1,MaNVBH:e.salesmanCode,NVBH:e.salesmanName,SoDon:e.orderCount,SoKhachHang:e.customerCount,DoanhSoTruocKM:Math.round(Q(e.beforePromoAmount)),
DoanhSoThucTe:Math.round(Q(e.actualAmount)),GiaTriHangKM:Math.round(Q(e.promotionValue)),DaThuTheoAR:Math.round(Q(e.receiptAmount)),TraHangTheoAR:Math.round(Q(e.returnAmount)),
ConNoTheoAR:Math.round(Q(e.debtAmount))}));return Ke("salesman-report","BaoCaoNVBH",Object.keys(o[0]||{STT:"",MaNVBH:"",NVBH:"",SoDon:"",SoKhachHang:"",DoanhSoTruocKM:"",
DoanhSoThucTe:"",GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",ConNoTheoAR:""}),o,e)}async function Ue(e={}){const o=((await f.deliveryReport({...e,full:"1",export:"1"
})).byStaff||[]).map((e,o)=>({STT:o+1,MaNVGH:e.deliveryStaffCode,NVGH:e.deliveryStaffName,SoChuyen:e.tripCount,SoDonDaGiao:e.orderCount,TongTienDonCon:Math.round(Q(e.totalAmount)),
DoanhSoDaXacNhan:Math.round(Q(e.accountingConfirmedAmount)),ThuTienTheoQuy:Math.round(Q(e.collectedAmount))}));return Ke("deliveryman-report","BaoCaoNVGH",Object.keys(o[0]||{
STT:"",MaNVGH:"",NVGH:"",SoChuyen:"",SoDonDaGiao:"",TongTienDonCon:"",DoanhSoDaXacNhan:"",ThuTienTheoQuy:""}),o,e)}async function Ze(e={}){const o=await f.salesReport({...e,
full:"1",export:"1"}),n=await f.periodDebtReport({...e,full:"1",export:"1",includePaid:"1"}),t=new Map((n.debts||[]).map(e=>[w(e.customerCode||e.customerName),e])),a=new Map
;(o.sales||[]).forEach(e=>{const o=w(e.customerCode||e.customerName),n=a.get(o)||{MaKhachHang:e.customerCode,KhachHang:e.customerName,MaNVBH:e.salesStaffCode,NVBH:e.salesStaffName,
SoDon:0,DoanhSoTruocKM:0,DoanhSoThucTe:0,GiaTriHangKM:0,DaThuTheoAR:0,TraHangTheoAR:0};n.SoDon+=1,n.DoanhSoTruocKM+=Q(e.beforePromoAmount),n.DoanhSoThucTe+=Q(e.actualAmount),
n.GiaTriHangKM+=Q(e.promotionValue),n.DaThuTheoAR+=Q(e.receiptAmount),n.TraHangTheoAR+=Q(e.returnAmount),a.set(o,n)});const r=Array.from(a.entries()).map(([e,o],n)=>{
const a=t.get(e)||{};return{STT:n+1,...o,DoanhSoTruocKM:Math.round(o.DoanhSoTruocKM),DoanhSoThucTe:Math.round(o.DoanhSoThucTe),GiaTriHangKM:Math.round(o.GiaTriHangKM),
DaThuTheoAR:Math.round(o.DaThuTheoAR),TraHangTheoAR:Math.round(o.TraHangTheoAR),DuDauKy:Math.round(Q(a.openingBalance)),DuCuoiKy:Math.round(Q(a.closingBalance))}})
;return Ke("customer-sales-report","DoanhSoKhachHang",Object.keys(r[0]||{STT:"",MaKhachHang:"",KhachHang:"",MaNVBH:"",NVBH:"",SoDon:"",DoanhSoTruocKM:"",DoanhSoThucTe:"",
GiaTriHangKM:"",DaThuTheoAR:"",TraHangTheoAR:"",DuDauKy:"",DuCuoiKy:""}),r,e)}async function We(e={}){const o=await f.salesReport({...e,full:"1",export:"1"}),n=new Map
;(o.sales||[]).forEach(e=>(e.items||[]).forEach(e=>{const o=w(e.productCode||e.productName),t=n.get(o)||{MaSP:e.productCode,SanPham:e.productName,NhanHang:e.brand,SoLuongBan:0,
DoanhSoTruocKM:0,DoanhSoThucTe:0};t.SoLuongBan+=Q(e.quantity),t.DoanhSoTruocKM+=Q(e.catalogAmount),t.DoanhSoThucTe+=Q(e.actualAmount),n.set(o,t)}))
;const t=Array.from(n.values()).reduce((e,o)=>e+o.DoanhSoThucTe,0)||1,a=Array.from(n.values()).map((e,o)=>({STT:o+1,...e,SoLuongBan:e.SoLuongBan,
DoanhSoTruocKM:Math.round(e.DoanhSoTruocKM),DoanhSoThucTe:Math.round(e.DoanhSoThucTe),ChietKhauKM:Math.round(e.DoanhSoTruocKM-e.DoanhSoThucTe),
TyTrong:`${I(e.DoanhSoThucTe/t*100,2)}%`}));return Ke("product-sales-report","DoanhSoSanPham",Object.keys(a[0]||{STT:"",MaSP:"",SanPham:"",NhanHang:"",SoLuongBan:"",
DoanhSoTruocKM:"",DoanhSoThucTe:"",ChietKhauKM:"",TyTrong:""}),a,e)}
const ze=new Set(["password","passwordHash","hash","salt","token","tokens","accessToken","refreshToken","secret","apiKey","session","sessions","resetPasswordToken","verificationToken"])
;function Je(e={},o=[]){for(const n of o){const o=w(e[n]);if(o)return o}return""}function Ye(e){return!0===e?"Hoạt động":!1===e?"Ngưng hoạt động":w(e)}function eo(e={},o=[],n=[]){
const t=new Set([...o,...n,"_id","__v","searchText"]),a={};return Object.keys(e||{}).forEach(o=>{if(t.has(o))return;const n=e[o];null!=n&&""!==n&&(a[o]=n)}),
Object.keys(a).length?JSON.stringify(a):""}function oo(e={},o=0,n=new Map){const t=Je(e,["code","productCode","sku","id"]),a=n.get(w(t).toUpperCase())||{};return{STT:o+1,MaSP:t,
TenSP:Je(e,["name","productName","title"]),Barcode:Je(e,["barcode","barCode"]),NhanHang:Je(e,["brand","brandName"]),NganhHang:Je(e,["category","categoryName","groupName"]),
DonVi:Je(e,["unit","baseUnit","uom"]),DonViCoSo:Je(e,["baseUnit","unit"]),QuyDoi:Q(e.conversionRate||e.ratio||1),
"Quy cách":Math.max(1,Q(e.conversionRate||e.packingQty||e.unitsPerCase||1)),"Giá bán":Math.round(Q(e.salePrice||e.price||e.sellPrice)),
GiaVon:Math.round(Q(e.costPrice||e.cost||e.purchasePrice)),TonVatLy:Q(a.onHand??a.quantity??a.qty),DaGiuCho:Q(a.reservedQty),TonKhaDung:Q(a.availableQty),
KhuBocHang:A(D(M(e),H.HC)),TrangThai:Ye(e.isActive??e.status),NgayTao:E(e.createdAt),NgayCapNhat:E(e.updatedAt),
ThongTinKhac:eo(e,["code","productCode","sku","name","productName","barcode","brand","category","unit","baseUnit","conversionRate","packing","salePrice","costPrice","pickingZone","warehouseCode","warehouseName","defaultWarehouse","isActive","status","createdAt","updatedAt"])
}}async function no(e={}){const[o,n]=await Promise.all([d.find({}).sort({code:1,name:1}).limit(Ae(e)).lean(),f.stockReport({full:"1",export:"1"
})]),t=new Map((n.stock||n.items||[]).map(e=>[w(e.productCode||e.code).toUpperCase(),e])),a=o.map((e,o)=>oo(e,o,t))
;return Ke("product-info-report","ThongTinSanPham",Object.keys(a[0]||oo({},-1,t)),a,e)}function to(e={}){return[e.customerCode,e.customerId,e.customerName].map(w).filter(Boolean)}
async function ao(){const o=await f.periodDebtReport({dateFrom:"0000-01-01",dateTo:e.todayVN(),full:"1",export:"1",includePaid:"1"}),n=new Map
;return(o.debts||o.items||[]).forEach(e=>{const o=Q(e.closingBalance);to(e).forEach(e=>n.set(e,o))}),n}async function ro(o={}){
const n=e.todayVN(),t=w(o.monthStart||o.monthFrom||`${n.slice(0,7)}-01`),a=w(o.monthEnd||o.monthTo||n),r=await f.salesReport({dateFrom:t,dateTo:a,full:"1",export:"1"}),u=new Map
;return(r.sales||r.items||[]).forEach(e=>{const o=Q(e.actualAmount);[e.customerCode,e.customerId,e.customerName].map(w).filter(Boolean).forEach(e=>{u.set(e,Q(u.get(e))+o)})}),u}
function uo(e,o=[]){for(const n of o.map(w).filter(Boolean))if(e.has(n))return Q(e.get(n));return 0}function io(e={},o=0,n=new Map,t=new Map){
const a=R(e),r=B(e),u=[e.code,e.customerCode,e.id,e._id,e.name,e.customerName];return{STT:o+1,MaKH:Je(e,["code","customerCode","id"]),TenKH:Je(e,["name","customerName"]),
TenHoKinhDoanh:r.businessName,SDT:Je(e,["phone","mobile","customerPhone","tel"]),DiaChi:Je(e,["address","customerAddress","fullAddress"]),MaSoThue:a.taxCode,
DiaChiHoaDonThue:a.taxInvoiceAddress,Tuyen:Je(e,["route","routeName","line"]),KhuVuc:Je(e,["area","areaName","region","province"]),
MaNVBH:Je(e,["staffCode","salesStaffCode","salesmanCode"]),NVBHPhuTrach:Je(e,["staffName","salesStaffName","salesmanName"]),MaNVGH:Je(e,["deliveryStaffCode","shipperCode"]),
NVGHPhuTrach:Je(e,["deliveryStaffName","shipperName"]),CongNoHienTai:Math.round(uo(n,u)),DoanhSoThang:Math.round(uo(t,u)),TrangThai:Ye(e.isActive??e.status),NgayTao:E(e.createdAt),
NgayCapNhat:E(e.updatedAt),
ThongTinKhac:eo(e,["code","customerCode","name","customerName","businessName","customerBusinessName","householdBusinessName","taxBusinessName","invoiceBusinessName","tenHoKinhDoanh","phone","mobile","customerPhone","address","customerAddress","taxCode","customerTaxCode","taxNumber","vatNumber","vatCode","mst","taxInvoiceAddress","customerTaxInvoiceAddress","invoiceAddress","vatInvoiceAddress","billingAddress","route","area","region","staffCode","staffName","salesStaffCode","salesStaffName","deliveryStaffCode","deliveryStaffName","isActive","status","createdAt","updatedAt"])
}}async function co(e={}){const[o,n,t]=await Promise.all([s.find({}).sort({code:1,name:1
}).limit(Ae(e)).lean(),ao(),ro(e)]),a=o.map((e,o)=>io(e,o,n,t)).sort((e,o)=>Q(o.CongNoHienTai)-Q(e.CongNoHienTai)||w(e.MaKH).localeCompare(w(o.MaKH)));return a.forEach((e,o)=>{
e.STT=o+1}),Ke("customer-info-report","ThongTinKhachHang",Object.keys(a[0]||io({},-1)),a,e)}function so(e={}){const o={};return Object.keys(e||{}).forEach(n=>{
if(ze.has(n)||n.startsWith("_")||["__v","searchText"].includes(n))return
;if(["username","fullName","name","code","staffCode","role","roles","phone","email","isActive","status","permissions","area","route","lastLoginAt","lastLogin","createdAt","updatedAt"].includes(n))return
;const t=e[n];null!=t&&""!==t&&(o[n]=t)}),Object.keys(o).length?JSON.stringify(o):""}function ho(e={},o=0){return{STT:o+1,TenDangNhap:Je(e,["username","loginName"]),
HoTen:Je(e,["fullName","name","displayName"]),MaNhanVien:Je(e,["staffCode","code","employeeCode"]),VaiTro:Array.isArray(e.roles)?e.roles.join(", "):Je(e,["role","roles"]),
SDT:Je(e,["phone","mobile"]),Email:Je(e,["email"]),TrangThai:Ye(e.isActive??e.status),
QuyenTruyCap:Array.isArray(e.permissions)?e.permissions.join(", "):w(e.permissions||e.permission||""),KhuVucTuyen:Je(e,["area","route","region"]),NgayTao:E(e.createdAt),
NgayCapNhat:E(e.updatedAt),LanDangNhapGanNhat:E(e.lastLoginAt||e.lastLogin||e.lastSeenAt),ThongTinKhac:so(e)}}async function To(e={}){
const o=p.users,n=(await o.find({}).select("-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken").sort({
role:1,code:1,username:1}).limit(Ae(e)).lean()).map(ho);return Ke("user-info-report","ThongTinTaiKhoan",Object.keys(n[0]||ho({},-1)),n,e)}const mo={"sales-report":Qe,
"delivery-report":Ie,"return-report":Ee,"debt-report":Le,"ar-ledger-detail":_e,"stock-report":qe,"inventory-movement-report":je,"stock-card-report":$e,"fund-report":Fe,
"salesman-report":Xe,"deliveryman-report":Ue,"customer-sales-report":Ze,"product-sales-report":We,"product-info-report":no,"customer-info-report":co,"user-info-report":To}
;async function lo(e){return a.preview(e)}async function go(e){return a.commit(e)}async function po(){return a.logs()}function fo(){return r.getBuiltInTemplates()}
async function yo(e){return r.buildBuiltInTemplateFile(e)}function So(e){return r.getFields(e)}async function Co(){return r.listCustomTemplates()}async function No(e){
return r.saveCustomTemplate(e)}async function Do(e){return r.deleteCustomTemplate(e)}async function Mo(e){return r.buildCustomTemplateFile(e)}function Ao(){
return[...new Set([...u.getExportTypes(),"invoice-orders","vatInvoiceTT78","vat-non-invoice-orders","sse-invoice-orders","sse-invoice-errors",...Ne])].sort()}
async function Ho(o,n={},t={}){const a=String(o||"").trim();if(["sse-invoice-orders","sseInvoiceOrders"].includes(a))return v.buildSseInvoiceWorkbook(n,t)
;if(["sse-invoice-errors","sseInvoiceErrors"].includes(a))return v.buildSseErrorReportWorkbook(n,t);if(["invoice-orders","invoiceOrders"].includes(a)){const e=m(n.invoiceType)
;return e?e===T.VAT?fe(n,t):Ce(n,t):{error:"invoiceType chỉ nhận VAT hoặc NON_VAT",status:400}}
if(["vatInvoiceTT78","vat-invoice-tt78","hoa-don-vat-tt78"].includes(a))return fe(n,t);if(["vat-non-invoice-orders","vatNonInvoiceOrders"].includes(a))return Ce(n,t)
;if(mo[a])return mo[a](n);const r=await u.findForExport(o,n);if(!r)return{error:"Loại dữ liệu export không hợp lệ",status:400};const i=await x({type:o,rows:r
}),c=String(o||"data").replace(/[^a-zA-Z0-9_-]/g,"-");return{buffer:i,rows:r.length,fileName:`${c}-export-${e.todayVN()}.xlsx`}}module.exports={previewImport:lo,commitImport:go,
getImportLogs:po,getBuiltInTemplates:fo,buildBuiltInTemplateFile:yo,getFields:So,listCustomTemplates:Co,saveCustomTemplate:No,deleteCustomTemplate:Do,buildCustomTemplateFile:Mo,
getExportTypes:Ao,exportToExcel:Ho};
