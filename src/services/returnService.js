const documentService = require('./documentService');
function createSalesReturn(db, input = {}, user = {}){
  return documentService.createDocument(db, { ...input, type: documentService.DOC_TYPES.RETURN, status: input.status || 'DRAFT' }, user);
}
module.exports = { createSalesReturn };
