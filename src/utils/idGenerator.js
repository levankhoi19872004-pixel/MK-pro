function pad(value, length = 4) {
  return String(value).padStart(length, '0');
}

function dateKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1, 2);
  const dd = pad(date.getDate(), 2);
  return `${yyyy}${mm}${dd}`;
}

function nextSequence(items = [], prefix) {
  const count = items.filter(item => String(item.documentNo || item.code || '').startsWith(prefix)).length;
  return count + 1;
}

function createDocumentNo(items = [], prefix = 'DOC', date = new Date()) {
  const base = `${prefix}${dateKey(date)}`;
  const seq = nextSequence(items, base);
  return `${base}-${pad(seq, 4)}`;
}

function createId(prefix = 'ID') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

module.exports = {
  createId,
  createDocumentNo,
  dateKey,
  pad
};
