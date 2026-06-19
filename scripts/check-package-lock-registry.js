'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const lockPath = path.join(rootDir, 'package-lock.json');
const allowedHosts = new Set(['registry.npmjs.org']);
const forbiddenPatterns = [
  /\.internal(?:[/:]|$)/i,
  /artifactory\/api\/npm/i,
  /localhost(?::\d+)?/i,
  /127\.0\.0\.1(?::\d+)?/,
];

function fail(message) {
  console.error(`[lock-registry] ${message}`);
  process.exitCode = 1;
}

let lock;
try {
  lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
} catch (error) {
  fail(`Không đọc được package-lock.json: ${error.message}`);
  process.exit();
}

const violations = [];
for (const [packagePath, metadata] of Object.entries(lock.packages || {})) {
  const resolved = metadata && metadata.resolved;
  if (typeof resolved !== 'string' || !/^https?:\/\//i.test(resolved)) continue;

  let url;
  try {
    url = new URL(resolved);
  } catch {
    violations.push({ packagePath, resolved, reason: 'URL không hợp lệ' });
    continue;
  }

  if (forbiddenPatterns.some((pattern) => pattern.test(resolved))) {
    violations.push({ packagePath, resolved, reason: 'registry nội bộ/cục bộ bị cấm' });
    continue;
  }

  if (!allowedHosts.has(url.hostname)) {
    violations.push({ packagePath, resolved, reason: `host không được phép: ${url.hostname}` });
  }
}

if (violations.length > 0) {
  fail(`Phát hiện ${violations.length} resolved URL không thể phát hành:`);
  for (const item of violations) {
    console.error(`- ${item.packagePath || '<root>'}: ${item.reason}\n  ${item.resolved}`);
  }
  process.exit();
}

console.log('[lock-registry] PASS: mọi tarball URL đều dùng registry.npmjs.org');
