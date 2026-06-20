'use strict';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const text = String(value).trim();
  let normalized = text;
  if (text.includes(',')) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return Math.round(toNumber(value)).toLocaleString('vi-VN');
}

function formatDate(value) {
  if (!value) return new Date().toLocaleDateString('vi-VN');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('vi-VN');
}

function formatDateTime(value) {
  if (!value) return new Date().toLocaleString('vi-VN');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('vi-VN');
}

const DIGITS = ['Không', 'Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín'];

function readTriple(number, full) {
  const hundred = Math.floor(number / 100);
  const ten = Math.floor((number % 100) / 10);
  const unit = number % 10;
  const parts = [];

  if (hundred > 0 || full) parts.push(`${DIGITS[hundred]} Trăm`);
  if (ten > 1) {
    parts.push(`${DIGITS[ten]} Mươi`);
    if (unit === 1) parts.push('Mốt');
    else if (unit === 5) parts.push('Lăm');
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else if (ten === 1) {
    parts.push('Mười');
    if (unit === 5) parts.push('Lăm');
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else if (unit > 0) {
    if (hundred > 0 || full) parts.push('Lẻ');
    parts.push(DIGITS[unit]);
  }

  return parts.join(' ');
}

function numberToVietnameseWords(value) {
  let number = Math.round(Math.abs(toNumber(value)));
  if (number === 0) return 'Không Đồng';

  const units = ['', 'Nghìn', 'Triệu', 'Tỷ', 'Nghìn Tỷ', 'Triệu Tỷ'];
  const groups = [];
  while (number > 0) {
    groups.push(number % 1000);
    number = Math.floor(number / 1000);
  }

  const words = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) continue;
    const full = index < groups.length - 1 && group < 100;
    words.push(`${readTriple(group, full)} ${units[index]}`.trim());
  }

  return `${words.join(' ').replace(/\s+/g, ' ')} Đồng`;
}

module.exports = {
  toNumber,
  formatMoney,
  formatDate,
  formatDateTime,
  numberToVietnameseWords
};
