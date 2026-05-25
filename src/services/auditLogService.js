const { nowIso, uid } = require('../utils/coreUtils');

function ensure(db){ db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : []; return db.auditLogs; }
function addLog(db, action, payload = {}){
  const logs = ensure(db);
  const log = {
    id: uid('LOG_'),
    time: nowIso(),
    action,
    module: payload.module || 'SYSTEM',
    refType: payload.refType || '',
    refId: payload.refId || '',
    userCode: payload.userCode || payload.user?.code || '',
    userName: payload.userName || payload.user?.name || '',
    before: payload.before || null,
    after: payload.after || null,
    note: payload.note || ''
  };
  logs.unshift(log);
  return log;
}
function listLogs(db, filter = {}){
  let rows = ensure(db);
  if(filter.module) rows = rows.filter(x => String(x.module) === String(filter.module));
  if(filter.refId) rows = rows.filter(x => String(x.refId) === String(filter.refId));
  if(filter.fromDate) rows = rows.filter(x => String(x.time).slice(0,10) >= String(filter.fromDate));
  if(filter.toDate) rows = rows.filter(x => String(x.time).slice(0,10) <= String(filter.toDate));
  return rows;
}
module.exports = { ensure, addLog, listLogs };
