function normalizeOrderCode(value) {
  const text = String(value || '').trim();

  if (!text) return '';

  if (/^SO\d+/i.test(text)) {
    return text.toUpperCase();
  }

  if (/^HU\d+/i.test(text)) {
    return text.toUpperCase();
  }

  return '';
}

function normalizeOrderCodes(values = []) {
  return [...new Set(
    values
      .map(normalizeOrderCode)
      .filter(Boolean)
  )];
}

module.exports = {
  normalizeOrderCode,
  normalizeOrderCodes
};
