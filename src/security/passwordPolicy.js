'use strict';

const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || '').trim());
}

async function verifyPassword(inputPassword, storedHash) {
  const input = String(inputPassword || '');
  const stored = String(storedHash || '').trim();

  if (!input || !stored) return false;
  if (!isBcryptHash(stored)) return false;

  return bcrypt.compare(input, stored);
}

function hashPasswordSync(password) {
  const input = String(password || '').trim();
  if (!input) {
    throw new Error('Password is required');
  }

  if (isBcryptHash(input)) return input;

  return bcrypt.hashSync(input, BCRYPT_ROUNDS);
}

module.exports = {
  isBcryptHash,
  verifyPassword,
  hashPasswordSync,
  BCRYPT_ROUNDS
};
