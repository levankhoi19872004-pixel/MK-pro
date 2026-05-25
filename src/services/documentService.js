const { num, roundMoney, today, nowIso, uid, cleanCode } = require('../utils/coreUtils');
const auditLogService = require('./auditLogService');

const DOC_TYPES = {
  RECEIVE: 'PHIEU_NHAP_KHO',
  ISSUE: 'PHIEU_XUAT_KHO',
  ADJUST: 'PHIEU_DIEU_CHINH_KHO',
  RECEIPT: 'PHIEU_THU',
  PAYMENT: 'PHIEU_CHI',
  RETURN: 'PHIEU_TRA_HANG'
};

function ensure(db){ db.documents = Array.isArray(db.documents) ? db.documents : []; return db.documents; }
function calcTotal(items){ return roundMoney((items || []).reduce((s, x) => s + num(x.qty || x.quantity) * num(x.price || x.cost || x.amount || 0), 0)); }
function createDocument(db, input = {}, user = {}){
  const docs = ensure(db);
  const type = input.type || DOC_TYPES.ADJUST;
  const doc = {
    id: input.id || input.code || uid(type + '_'),
    type,
    date: input.date || today(),
    createdAt: nowIso(),
    status: input.status || 'DRAFT',
    partnerCode: input.partnerCode || input.customerCode || input.supplierCode || '',
    partnerName: input.partnerName || input.customerName || input.supplierName || '',
    warehouseCode: input.warehouseCode || 'KHO_CHINH',
    items: Array.isArray(input.items) ? input.items : [],
    total: input.total !== undefined ? roundMoney(input.total) : calcTotal(input.items),
    note: input.note || '',
    createdBy: user.code || input.createdBy || '',
    updatedAt: nowIso(),
    deleted: false
  };
  if(docs.some(x => cleanCode(x.id) === cleanCode(doc.id))) throw new Error('Mã chứng từ đã tồn tại: ' + doc.id);
  docs.unshift(doc);
  auditLogService.addLog(db, 'CREATE_DOCUMENT', { module:'DOCUMENT', refType:type, refId:doc.id, after:doc, user });
  return doc;
}
function postDocument(db, id, user = {}){
  const doc = ensure(db).find(x => cleanCode(x.id) === cleanCode(id));
  if(!doc) throw new Error('Không tìm thấy chứng từ');
  if(doc.status === 'POSTED') return doc;
  const before = { ...doc };
  doc.status = 'POSTED'; doc.postedAt = nowIso(); doc.updatedAt = nowIso(); doc.postedBy = user.code || '';
  auditLogService.addLog(db, 'POST_DOCUMENT', { module:'DOCUMENT', refType:doc.type, refId:doc.id, before, after:doc, user });
  return doc;
}
function cancelDocument(db, id, reason = '', user = {}){
  const doc = ensure(db).find(x => cleanCode(x.id) === cleanCode(id));
  if(!doc) throw new Error('Không tìm thấy chứng từ');
  const before = { ...doc };
  doc.status = 'CANCELLED'; doc.cancelReason = reason; doc.cancelledAt = nowIso(); doc.updatedAt = nowIso();
  auditLogService.addLog(db, 'CANCEL_DOCUMENT', { module:'DOCUMENT', refType:doc.type, refId:doc.id, before, after:doc, user, note:reason });
  return doc;
}
function listDocuments(db, filter = {}){
  let rows = ensure(db).filter(x => !x.deleted);
  if(filter.type) rows = rows.filter(x => x.type === filter.type);
  if(filter.status) rows = rows.filter(x => x.status === filter.status);
  if(filter.fromDate) rows = rows.filter(x => String(x.date) >= String(filter.fromDate));
  if(filter.toDate) rows = rows.filter(x => String(x.date) <= String(filter.toDate));
  return rows;
}
module.exports = { DOC_TYPES, ensure, createDocument, postDocument, cancelDocument, listDocuments };
