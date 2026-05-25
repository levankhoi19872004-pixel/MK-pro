function createCashTransaction(input = {}) {
  return {
    id: input.id || ('CT_' + Date.now()),
    type: input.type || 'IN', // IN | OUT
    amount: Number(input.amount || 0),
    content: String(input.content || ''),
    refType: input.refType || '',
    refCode: input.refCode || '',
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  createCashTransaction
};