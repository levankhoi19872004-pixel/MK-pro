'use strict';

class ConfigurationError extends Error {
  constructor(issues = []) {
    const normalized = issues.map((issue) => ({
      variable: String(issue.variable || 'UNKNOWN'),
      message: String(issue.message || 'Cấu hình không hợp lệ')
    }));
    super(`Cấu hình môi trường không hợp lệ:\n${normalized.map((issue) => `- ${issue.variable}: ${issue.message}`).join('\n')}`);
    this.name = 'ConfigurationError';
    this.code = 'INVALID_CONFIGURATION';
    this.issues = normalized;
  }
}

function rawValue(env, name) {
  const value = env && Object.prototype.hasOwnProperty.call(env, name) ? env[name] : undefined;
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function readString(env, name, options = {}) {
  const value = rawValue(env, name);
  if (value === undefined || value === '') {
    if (options.required) throw new Error('bắt buộc phải được khai báo');
    return options.defaultValue === undefined ? '' : String(options.defaultValue);
  }
  if (options.maxLength && value.length > options.maxLength) {
    throw new Error(`độ dài phải nhỏ hơn hoặc bằng ${options.maxLength}`);
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw new Error(options.patternMessage || 'không đúng định dạng');
  }
  return value;
}

function readBoolean(env, name, options = {}) {
  const value = rawValue(env, name);
  if (value === undefined || value === '') {
    if (options.required) throw new Error('bắt buộc phải được khai báo');
    return Boolean(options.defaultValue);
  }
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  throw new Error('chỉ chấp nhận true/false, 1/0, yes/no hoặc on/off');
}

function readInteger(env, name, options = {}) {
  const value = rawValue(env, name);
  if (value === undefined || value === '') {
    if (options.required) throw new Error('bắt buộc phải được khai báo');
    return Number(options.defaultValue ?? 0);
  }
  if (!/^-?\d+$/.test(value)) throw new Error('phải là số nguyên');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('vượt phạm vi số nguyên an toàn');
  if (options.min !== undefined && parsed < options.min) throw new Error(`phải lớn hơn hoặc bằng ${options.min}`);
  if (options.max !== undefined && parsed > options.max) throw new Error(`phải nhỏ hơn hoặc bằng ${options.max}`);
  return parsed;
}

function readEnum(env, name, allowed, options = {}) {
  const value = readString(env, name, options);
  const normalized = options.lowercase === false ? value : value.toLowerCase();
  if (!allowed.includes(normalized)) throw new Error(`chỉ chấp nhận: ${allowed.join(', ')}`);
  return normalized;
}

function readCsv(env, name, options = {}) {
  const value = readString(env, name, { defaultValue: options.defaultValue || '' });
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function readUrl(env, name, options = {}) {
  const value = readString(env, name, options);
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error('phải là URL hợp lệ');
  }
  const allowedProtocols = options.protocols || ['http:', 'https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`protocol phải thuộc: ${allowedProtocols.join(', ')}`);
  }
  return value.replace(/\/+$/, '');
}

function readMongoUri(env, name = 'MONGO_URI', options = {}) {
  const value = readString(env, name, options);
  if (!value) return '';
  if (!/^mongodb(?:\+srv)?:\/\//i.test(value)) {
    throw new Error('phải bắt đầu bằng mongodb:// hoặc mongodb+srv://');
  }
  return value;
}

function readBodyLimit(env, name, options = {}) {
  const value = readString(env, name, { defaultValue: options.defaultValue || '' });
  if (!value) return '';
  if (!/^\d+(?:\.\d+)?(?:b|kb|mb|gb)$/i.test(value) && !/^\d+$/.test(value)) {
    throw new Error('phải có dạng số byte hoặc 512kb/5mb/1gb');
  }
  return value.toLowerCase();
}

function readTrustProxy(env, name = 'TRUST_PROXY', options = {}) {
  const value = rawValue(env, name);
  if (value === undefined || value === '') return options.defaultValue ?? 1;
  const normalized = value.toLowerCase();
  if (['false', 'off'].includes(normalized)) return false;
  if (['true', 'on'].includes(normalized)) return true;
  if (!/^\d+$/.test(normalized)) throw new Error('phải là true, false hoặc số proxy hop không âm');
  const hops = Number(normalized);
  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 20) throw new Error('số proxy hop phải trong khoảng 0..20');
  return hops;
}

function isPlaceholderSecret(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return [
    'change_me',
    'changeme',
    'replace_with',
    'replace-me',
    'your_secret',
    'your-secret',
    '<secret>',
    '<password>',
    'random_64_char',
    'generate_64_bytes'
  ].some((marker) => normalized.includes(marker));
}

module.exports = {
  ConfigurationError,
  readString,
  readBoolean,
  readInteger,
  readEnum,
  readCsv,
  readUrl,
  readMongoUri,
  readBodyLimit,
  readTrustProxy,
  isPlaceholderSecret
};
