function accountUsernameFromCode(code) {
  return String(code || '').trim().toLowerCase();
}

function normText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function sameCode(a, b) {
  return normText(a) === normText(b);
}

module.exports = { accountUsernameFromCode, normText, sameCode };
