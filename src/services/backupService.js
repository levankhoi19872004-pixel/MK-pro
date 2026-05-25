const { nowIso } = require('../utils/coreUtils');
function makeSnapshot(db){ return { createdAt: nowIso(), version:'v41', data: JSON.parse(JSON.stringify(db || {})) }; }
function restoreSnapshot(snapshot){ if(!snapshot || !snapshot.data) throw new Error('File backup không hợp lệ'); return snapshot.data; }
module.exports = { makeSnapshot, restoreSnapshot };
