'use strict';

const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
const PASSWORD_MIN_LENGTH = Math.max(8, Number(process.env.PASSWORD_MIN_LENGTH || 8));
const PASSWORD_MAX_LENGTH = Math.min(256, Math.max(PASSWORD_MIN_LENGTH, Number(process.env.PASSWORD_MAX_LENGTH || 128)));
const DUMMY_PASSWORD_HASH = '$2b$12$pNBzhKnkqwlusGxilSN/L.XHO6p6LScchQ4iXkg0EWVDr7PZ4f.EG';
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', 'password', 'password1', 'qwerty123',
  'admin123', 'administrator', '11111111', '00000000'
]);

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || '').trim());
}

function validatePasswordStrength(password, context = {}) {
  const input = String(password || '');
  if (!input) return 'Bắt buộc nhập mật khẩu';
  if (input.length < PASSWORD_MIN_LENGTH) return `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`;
  if (input.length > PASSWORD_MAX_LENGTH) return `Mật khẩu không được vượt quá ${PASSWORD_MAX_LENGTH} ký tự`;
  if (/^\s+$/.test(input)) return 'Mật khẩu không được chỉ chứa khoảng trắng';

  const normalized = input.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) return 'Mật khẩu quá phổ biến, hãy chọn mật khẩu khác';
  if (/^(.)\1+$/.test(input)) return 'Mật khẩu không được lặp lại một ký tự';

  const identityParts = [context.username, context.staffCode, context.code, context.phone]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.length >= 4);
  if (identityParts.some((value) => normalized === value || normalized.includes(value))) {
    return 'Mật khẩu không được chứa nguyên tên đăng nhập, mã nhân viên hoặc số điện thoại';
  }

  const categories = [/[a-z]/.test(input), /[A-Z]/.test(input), /\d/.test(input), /[^A-Za-z0-9]/.test(input)]
    .filter(Boolean).length;
  if (categories < 2) return 'Mật khẩu phải kết hợp ít nhất hai nhóm: chữ thường, chữ hoa, số hoặc ký tự đặc biệt';
  return '';
}

async function verifyPassword(inputPassword, storedHash) {
  const input = String(inputPassword || '');
  const stored = String(storedHash || '').trim();
  if (!input) return false;

  const validStoredHash = isBcryptHash(stored);
  const matched = await bcrypt.compare(input, validStoredHash ? stored : DUMMY_PASSWORD_HASH);
  return validStoredHash && matched;
}

function hashPasswordSync(password, context = {}) {
  const input = String(password || '');
  if (isBcryptHash(input.trim())) return input.trim();
  const validationError = validatePasswordStrength(input, context);
  if (validationError) throw new Error(validationError);
  return bcrypt.hashSync(input, BCRYPT_ROUNDS);
}

module.exports = {
  isBcryptHash,
  verifyPassword,
  validatePasswordStrength,
  hashPasswordSync,
  BCRYPT_ROUNDS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  DUMMY_PASSWORD_HASH
};
