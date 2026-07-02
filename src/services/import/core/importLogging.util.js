'use strict';

const dateUtil = require('../../../utils/date.util');
const ImportLog = require('../../../models/ImportLog');
const { makeId } = require('../../../utils/common.util');

async function addImportLog(type, summary) {
  await ImportLog.create({
    id: makeId('IL'),
    type,
    summary,
    createdAt: dateUtil.nowIso()
  }).catch(() => null);
}

module.exports = {
  addImportLog
};
