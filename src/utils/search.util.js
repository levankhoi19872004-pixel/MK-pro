'use strict';

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return normalizeSearchText(value);
}

module.exports = {
  normalizeSearchText,
  normalizeText
};
