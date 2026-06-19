'use strict';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_DEPTH = Math.max(5, Number(process.env.INPUT_MAX_DEPTH || 25));
const MAX_NODES = Math.max(100, Number(process.env.INPUT_MAX_NODES || 10000));

function inspectInput(root) {
  const stack = [{ value: root, depth: 0 }];
  const seen = new Set();
  let nodes = 0;

  while (stack.length) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (seen.has(value)) continue;
    seen.add(value);
    nodes += 1;

    if (nodes > MAX_NODES) return { code: 'INPUT_TOO_COMPLEX', message: 'Dữ liệu gửi lên quá phức tạp' };
    if (depth > MAX_DEPTH) return { code: 'INPUT_TOO_DEEP', message: 'Dữ liệu gửi lên lồng quá sâu' };

    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key) || key.startsWith('$') || key.includes('.')) {
        return { code: 'UNSAFE_INPUT_KEY', message: `Tên trường không hợp lệ: ${key}` };
      }
      const child = value[key];
      if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
    }
  }

  return null;
}

function securityInputGuard(req, res, next) {
  for (const source of [req.body, req.query, req.params]) {
    const violation = inspectInput(source);
    if (violation) {
      return res.status(400).json({
        ok: false,
        success: false,
        code: violation.code,
        message: violation.message
      });
    }
  }
  return next();
}

module.exports = {
  inspectInput,
  securityInputGuard
};
